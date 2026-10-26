"""
===================================================================================
SignalBridge — Active Monitoring Background Celery Tasks
===================================================================================
PURPOSE:
    Executes synthetic probes out-of-band:
      - Enforces SSRF checks on target URLs.
      - Measures latency and records check results.
      - Automatically opens Incidents when failure thresholds are exceeded.
      - Dispatches scheduled probes periodically.
===================================================================================
"""
import logging
import time
import urllib.request
import urllib.error
from datetime import timedelta
from typing import Any, Dict

from celery import shared_task
from django.conf import settings
from django.utils import timezone

from apps.monitoring.models import Monitor, MonitorCheckResult
from apps.monitoring.ssrf import validate_safe_url

logger = logging.getLogger(__name__)


@shared_task(name="apps.monitoring.tasks.execute_monitor_check", bind=True, max_retries=1)
def execute_monitor_check(self, monitor_id: str) -> Dict[str, Any]:
    """
    Executes a single synthetic check against a target endpoint.
    """
    try:
        monitor = Monitor.objects.select_related("service").get(id=monitor_id)
    except Monitor.DoesNotExist:
        logger.warning(f"[MonitorTask] Monitor '{monitor_id}' not found.")
        return {"status": "NOT_FOUND", "monitor_id": monitor_id}

    if not monitor.is_active or not monitor.service.is_active:
        return {"status": "SKIPPED", "reason": "Monitor or service deactivated"}

    # 1. SSRF Security Check:
    allow_private = getattr(settings, "MONITOR_ALLOW_PRIVATE_IPS", False) or getattr(settings, "TESTING", False)
    is_safe, resolved_ip, ssrf_err = validate_safe_url(monitor.target_url, allow_private_ips=allow_private)

    start_time = time.time()
    checked_at = timezone.now()

    if not is_safe:
        duration_ms = 0.0
        error_msg = f"SSRF Check Failed: {ssrf_err}"
        status_code = 403
        result_status = Monitor.HealthStatus.DOWN
    else:
        # 2. Execute Probe:
        req = urllib.request.Request(
            monitor.target_url,
            headers={"User-Agent": "SignalBridge-Synthetic-Probe/1.0"},
            method="GET" if monitor.monitor_type == Monitor.MonitorType.HTTP_GET else "POST",
        )
        try:
            with urllib.request.urlopen(req, timeout=monitor.timeout_seconds) as resp:
                status_code = resp.getcode()
                duration_ms = round((time.time() - start_time) * 1000, 2)
                error_msg = ""
                if 200 <= status_code < 400:
                    result_status = (
                        Monitor.HealthStatus.DEGRADED
                        if duration_ms > 2000
                        else Monitor.HealthStatus.UP
                    )
                else:
                    result_status = Monitor.HealthStatus.DOWN
                    error_msg = f"HTTP Status {status_code}"
        except urllib.error.HTTPError as exc:
            duration_ms = round((time.time() - start_time) * 1000, 2)
            status_code = exc.code
            result_status = Monitor.HealthStatus.DOWN
            error_msg = f"HTTP Error {exc.code}: {exc.reason}"
        except Exception as exc:
            duration_ms = round((time.time() - start_time) * 1000, 2)
            status_code = None
            result_status = Monitor.HealthStatus.DOWN
            error_msg = f"Probe Error: {exc}"

    # 3. Record Time-Series Result:
    MonitorCheckResult.objects.create(
        monitor=monitor,
        status=result_status,
        response_time_ms=duration_ms,
        status_code=status_code,
        error_message=error_msg,
    )

    # 4. Update Monitor Current State & Evaluate Failure Threshold:
    monitor.last_checked_at = checked_at
    monitor.last_response_time_ms = duration_ms

    if result_status == Monitor.HealthStatus.UP or result_status == Monitor.HealthStatus.DEGRADED:
        was_down = monitor.current_status == Monitor.HealthStatus.DOWN
        monitor.consecutive_failures = 0
        monitor.current_status = result_status
        monitor.save(update_fields=["last_checked_at", "last_response_time_ms", "consecutive_failures", "current_status", "updated_at"])

        if was_down:
            logger.info(f"[MonitorTask] Monitor '{monitor.name}' has RECOVERED to operational status.")
    else:
        monitor.consecutive_failures += 1
        monitor.current_status = Monitor.HealthStatus.DOWN
        monitor.save(update_fields=["last_checked_at", "last_response_time_ms", "consecutive_failures", "current_status", "updated_at"])

        logger.warning(
            f"[MonitorTask] Monitor '{monitor.name}' failed probe. "
            f"Failures: {monitor.consecutive_failures}/{monitor.failure_threshold}. Error: {error_msg}"
        )

        # 5. Automatically Trigger Operational Incident on Threshold Breach:
        if monitor.consecutive_failures >= monitor.failure_threshold:
            from apps.alerts.services import correlate_alert_and_incident

            alert_payload = {
                "service": monitor.service.slug,
                "fingerprint": f"monitor-down-{monitor.name.lower().replace(' ', '-')}",
                "severity": "CRITICAL" if monitor.service.tier == "TIER_0" else "HIGH",
                "title": f"Synthetic Monitor Outage: {monitor.name} is DOWN",
                "description": (
                    f"Target URL '{monitor.target_url}' failed {monitor.consecutive_failures} "
                    f"consecutive synthetic probes. Latest error: {error_msg} "
                    f"(Response latency: {duration_ms}ms)."
                ),
                "external_id": f"monitor-{monitor.id}-{checked_at.strftime('%Y%m%d%H%M')}",
            }
            try:
                alert, incident, is_new, is_dup = correlate_alert_and_incident(
                    alert_data=alert_payload,
                    payload=None,
                )
                logger.critical(
                    f"[MonitorTask] Threshold breached! Opened/updated Incident '{incident.id}' "
                    f"(Status: {incident.status}, Severity: {incident.severity})"
                )
            except Exception as inc_exc:
                logger.error(f"[MonitorTask] Failed to correlate monitor incident: {inc_exc}")

    return {
        "status": result_status,
        "monitor_id": str(monitor.id),
        "duration_ms": duration_ms,
        "status_code": status_code,
        "consecutive_failures": monitor.consecutive_failures,
    }


@shared_task(name="apps.monitoring.tasks.dispatch_scheduled_monitors")
def dispatch_scheduled_monitors() -> Dict[str, Any]:
    """
    Periodic scheduler task that checks which active monitors are due for their next probe.
    """
    now = timezone.now()
    active_monitors = Monitor.objects.filter(is_active=True, service__is_active=True)

    dispatched = 0
    for mon in active_monitors:
        # If never checked or last check is older than interval:
        if not mon.last_checked_at or (now - mon.last_checked_at).total_seconds() >= mon.interval_seconds:
            execute_monitor_check.delay(monitor_id=str(mon.id))
            dispatched += 1

    return {"dispatched_count": dispatched, "evaluated_at": now.isoformat()}
