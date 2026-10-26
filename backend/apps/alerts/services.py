"""
===================================================================================
SignalBridge Webhook Ingestion Engine — Alert & Incident Grouping Service
===================================================================================
PURPOSE:
    This module implements the core incident grouping engine. It processes normalized
    alert payloads, correlates alerts into high-level operational incidents, and
    guarantees concurrency safety using PostgreSQL row-level locks ('select_for_update')
    and transaction-level advisory locks ('pg_advisory_xact_lock').

CONCURRENCY GUARANTEES (ZERO DUPLICATE INCIDENTS):
    When multiple background workers process webhooks for the same service and
    fingerprint simultaneously:
    1. Transaction Boundary: All mutations occur within 'transaction.atomic()'.
    2. Advisory Lock on Key: In PostgreSQL, 'pg_advisory_xact_lock(hashtext(...))'
       serializes workers during the initial creation phase when no row exists yet.
    3. Row-Level Lock ('SELECT ... FOR UPDATE'): Once an Incident exists, workers
       acquire an exclusive row-level lock on that specific Incident record.
    4. Safe Counter & Timestamp Mutations: 'alert_count' is incremented and 'last_seen_at'
       is updated while other concurrent workers wait for lock release.
===================================================================================
"""
from datetime import timedelta
import logging
from typing import Any, Dict, Optional, Tuple

from django.db import connection, transaction
from django.utils import timezone

from apps.alerts.deduplication import (
    calculate_alert_dedup_hash,
    calculate_content_hash,
    find_existing_external_alert,
    is_alert_duplicate,
)
from apps.alerts.models import Alert, Incident, IncidentEvent
from apps.webhooks.models import IngestedPayload

logger = logging.getLogger(__name__)


class AlertConflictError(Exception):
    """Raised when an alert with the same external_id arrives with materially conflicting content."""
    pass


# Severity hierarchy weights for automatic escalation:
SEVERITY_HIERARCHY = {
    Incident.SeverityLevel.LOW: 1,
    Incident.SeverityLevel.MEDIUM: 2,
    Incident.SeverityLevel.HIGH: 3,
    Incident.SeverityLevel.CRITICAL: 4,
}


def normalize_severity(raw_severity: Optional[str]) -> str:
    """
    Normalizes third-party vendor severity strings into standard Incident.SeverityLevel choices.
    """
    if not raw_severity:
        return Incident.SeverityLevel.MEDIUM

    cleaned = str(raw_severity).strip().upper()
    if cleaned in ("P1", "CRITICAL", "FATAL", "EMERGENCY"):
        return Incident.SeverityLevel.CRITICAL
    if cleaned in ("P2", "HIGH", "ERROR"):
        return Incident.SeverityLevel.HIGH
    if cleaned in ("P3", "MEDIUM", "WARN", "WARNING"):
        return Incident.SeverityLevel.MEDIUM
    if cleaned in ("P4", "P5", "LOW", "INFO", "INFORMATIONAL"):
        return Incident.SeverityLevel.LOW
    return Incident.SeverityLevel.MEDIUM


def correlate_alert_and_incident(
    alert_data: Dict[str, Any],
    payload: Optional[IngestedPayload] = None,
    dedup_window_seconds: int = 300,
    reopen_window_seconds: int = 900,
) -> Tuple[Alert, Incident, bool, bool]:
    """
    Normalizes an incoming alert payload, links or creates an active Incident,
    and returns (Alert, Incident, is_new_incident, is_duplicate_alert).

    Args:
        alert_data: Raw or semi-structured alert dictionary.
        payload: Optional parent IngestedPayload model instance.
        dedup_window_seconds: Window for alert deduplication checking (default: 300s).
        reopen_window_seconds: Maximum seconds since resolution to reopen an incident (default: 900s = 15m).

    Returns:
        Tuple[Alert, Incident, bool, bool]:
            - alert: The saved Alert instance.
            - incident: The parent Incident correlated with this alert.
            - is_new_incident: True if a fresh Incident was opened.
            - is_duplicate_alert: True if this exact alert was previously recorded.

    Raises:
        AlertConflictError: If the same external_id arrives with materially different content.
    """
    source = payload.source if payload else None

    # -------------------------------------------------------------------------
    # STEP 1: NORMALIZE ALERT FIELDS
    # -------------------------------------------------------------------------
    service_name = (
        alert_data.get("service")
        or alert_data.get("service_name")
        or (source.slug if source else "unknown-service")
    )
    service_name = str(service_name).strip().lower()

    title = str(alert_data.get("title") or alert_data.get("summary") or "Alert Triggered")[:255]
    description = str(alert_data.get("description") or alert_data.get("details") or "")

    raw_fingerprint = alert_data.get("fingerprint") or alert_data.get("event_type")
    if not raw_fingerprint:
        raw_fingerprint = "".join(ch for ch in title.lower() if ch.isalnum() or ch in ("-", "_", " ")).strip()
        raw_fingerprint = raw_fingerprint.replace(" ", "-")[:255] or "generic-incident"
    fingerprint = str(raw_fingerprint).strip().lower()[:255]

    severity = normalize_severity(alert_data.get("severity"))

    # Compute stable external ID & content hash:
    raw_ext_id = (
        alert_data.get("external_id")
        or alert_data.get("id")
        or alert_data.get("event_id")
        or alert_data.get("dedup_key")
    )
    external_id = str(raw_ext_id).strip() if raw_ext_id else ""
    content_hash = calculate_content_hash(
        service_name=service_name,
        title=title,
        description=description,
        severity=severity,
    )

    custom_dedup_key = alert_data.get("dedup_key") or alert_data.get("event_id")
    dedup_hash = calculate_alert_dedup_hash(
        service_name=service_name,
        fingerprint=fingerprint,
        title=title,
        custom_key=str(custom_dedup_key) if custom_dedup_key else None,
    )

    # -------------------------------------------------------------------------
    # STEP 2: DEDUPLICATION & CONFLICT CHECK (BEFORE LOCKING / WRITING)
    # -------------------------------------------------------------------------
    # Check 2A: Stable external ID check
    if external_id and source:
        existing_alert = find_existing_external_alert(source=source, external_id=external_id)
        if existing_alert:
            # Check for 409 Conflict: same external_id with materially different content
            if existing_alert.content_hash and existing_alert.content_hash != content_hash:
                logger.warning(
                    f"[AlertService] Conflict detected for external_id='{external_id}'. "
                    f"Existing hash: {existing_alert.content_hash}, Incoming hash: {content_hash}"
                )
                raise AlertConflictError(
                    f"Conflicting alert payload for external_id '{external_id}'. "
                    "An alert with this external_id already exists with different content."
                )

            # Identical content replay: Return existing alert without inflating alert_count
            logger.info(
                f"[AlertService] Duplicate alert replay detected for external_id='{external_id}'. "
                f"Reusing existing Alert ID='{existing_alert.id}', Incident ID='{existing_alert.incident_id}'"
            )
            return existing_alert, existing_alert.incident, False, True

    # Check 2B: Fallback deduplication hash check within time window
    if not external_id:
        cutoff = timezone.now() - timedelta(seconds=dedup_window_seconds)
        existing_alert = Alert.objects.filter(
            service_name=service_name,
            deduplication_hash=dedup_hash,
            created_at__gte=cutoff,
        ).first()
        if existing_alert:
            logger.info(
                f"[AlertService] Duplicate alert detected within {dedup_window_seconds}s window "
                f"for hash='{dedup_hash}'. Reusing Alert ID='{existing_alert.id}'"
            )
            return existing_alert, existing_alert.incident, False, True

    # -------------------------------------------------------------------------
    # STEP 3: TRANSACTION ATOMIC BLOCK & CONCURRENCY LOCKING
    # -------------------------------------------------------------------------
    with transaction.atomic():
        # In PostgreSQL, acquire transaction advisory lock to serialize concurrent creators:
        if connection.vendor == "postgresql":
            with connection.cursor() as cursor:
                cursor.execute(
                    "SELECT pg_advisory_xact_lock(hashtext(%s));",
                    [f"{service_name}:{fingerprint}"],
                )

        # Query active open or acknowledged incident with row lock:
        incident = (
            Incident.objects.select_for_update()
            .filter(
                service_name=service_name,
                fingerprint=fingerprint,
                status__in=[Incident.IncidentStatus.OPEN, Incident.IncidentStatus.ACKNOWLEDGED],
            )
            .first()
        )

        is_new_incident = False

        if not incident:
            # Check if a RESOLVED incident exists for this service & fingerprint:
            resolved_incident = (
                Incident.objects.select_for_update()
                .filter(
                    service_name=service_name,
                    fingerprint=fingerprint,
                    status=Incident.IncidentStatus.RESOLVED,
                )
                .order_by("-last_seen_at")
                .first()
            )

            # Reopen policy: Reopen only if resolved within reopen_window_seconds (< 15 mins):
            now = timezone.now()
            if resolved_incident and (now - resolved_incident.last_seen_at).total_seconds() < reopen_window_seconds:
                incident = resolved_incident
                incident.status = Incident.IncidentStatus.OPEN
                incident.alert_count += 1
                incident.last_seen_at = now
                incident.save(update_fields=["status", "alert_count", "last_seen_at", "updated_at"])

                IncidentEvent.objects.create(
                    incident=incident,
                    event_type=IncidentEvent.EventType.REOPENED,
                    description=f"Incident reopened by recurring alert: '{title}' (Severity: {severity})",
                    actor="system",
                )
                logger.info(f"[Incident Service] Reopened resolved Incident '{incident.id}'.")
                from apps.notifications.dispatch import safe_dispatch_incident_notification
                transaction.on_commit(
                    lambda inc=incident, t=title, s=severity: safe_dispatch_incident_notification(
                        inc, "REOPENED", {"title": t, "severity": s, "trigger": "recurring_alert"}
                    )
                )
            else:
                # CREATE FRESH INCIDENT:
                is_new_incident = True
                incident = Incident.objects.create(
                    service_name=service_name,
                    fingerprint=fingerprint,
                    status=Incident.IncidentStatus.OPEN,
                    severity=severity,
                    alert_count=1,
                )
                IncidentEvent.objects.create(
                    incident=incident,
                    event_type=IncidentEvent.EventType.CREATED,
                    description=f"Initial incident opened by alert: '{title}' (Severity: {severity})",
                    actor="system",
                )
                logger.info(
                    f"[Incident Service] Created fresh Incident '{incident.id}' for "
                    f"service='{service_name}', fingerprint='{fingerprint}'"
                )
                from apps.notifications.dispatch import safe_dispatch_incident_notification
                transaction.on_commit(
                    lambda inc=incident, t=title, s=severity: safe_dispatch_incident_notification(
                        inc, "INCIDENT_OPENED", {"title": t, "severity": s}
                    )
                )
        else:
            # ATTACH TO EXISTING ACTIVE INCIDENT:
            incident.alert_count += 1
            incident.last_seen_at = timezone.now()

            # Automatic severity escalation if new alert has higher priority:
            existing_weight = SEVERITY_HIERARCHY.get(incident.severity, 1)
            new_weight = SEVERITY_HIERARCHY.get(severity, 1)
            fields_to_update = ["alert_count", "last_seen_at", "updated_at"]

            if new_weight > existing_weight:
                old_severity = incident.severity
                incident.severity = severity
                fields_to_update.append("severity")
                IncidentEvent.objects.create(
                    incident=incident,
                    event_type=IncidentEvent.EventType.SEVERITY_ESCALATED,
                    description=f"Severity escalated from {old_severity} to {severity} by alert: '{title}'",
                    actor="system",
                )
                from apps.notifications.dispatch import safe_dispatch_incident_notification
                transaction.on_commit(
                    lambda inc=incident, old_s=old_severity, new_s=severity, t=title: safe_dispatch_incident_notification(
                        inc, "SEVERITY_ESCALATED", {"previous_severity": old_s, "new_severity": new_s, "title": t}
                    )
                )

            incident.save(update_fields=fields_to_update)

            IncidentEvent.objects.create(
                incident=incident,
                event_type=IncidentEvent.EventType.ALERT_ATTACHED,
                description=f"Correlated alert #{incident.alert_count} attached: '{title}'",
                actor="system",
            )
            logger.info(
                f"[Incident Service] Correlated alert #{incident.alert_count} into "
                f"existing Incident '{incident.id}'"
            )

        # ---------------------------------------------------------------------
        # STEP 4: PERSIST DURABLE ALERT RECORD
        # ---------------------------------------------------------------------
        alert = Alert.objects.create(
            payload=payload,
            source=source,
            incident=incident,
            service_name=service_name,
            external_id=external_id,
            content_hash=content_hash,
            deduplication_hash=dedup_hash,
            fingerprint=fingerprint,
            severity=severity,
            title=title,
            description=description,
            raw_metadata=alert_data,
        )

        return alert, incident, is_new_incident, False

