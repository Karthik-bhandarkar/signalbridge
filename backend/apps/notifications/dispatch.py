"""
===================================================================================
SignalBridge — Outbound Notification Dispatcher Service
===================================================================================
"""
from datetime import timedelta
import json
import logging
import urllib.request
import urllib.error
from typing import Any, Dict, List, Optional
from django.utils import timezone

from apps.alerts.models import Incident
from apps.notifications.models import NotificationDelivery, NotificationDestination

logger = logging.getLogger(__name__)


def dispatch_incident_notification(
    incident: Incident,
    event_type: str,
    details: Optional[Dict[str, Any]] = None,
    dedup_window_seconds: int = 30,
) -> List[NotificationDelivery]:
    """
    Sends notification payloads to all active configured notification destinations.
    Enforces deduplication to prevent alert storms and delivery spam.
    """
    active_destinations = NotificationDestination.objects.filter(is_active=True)
    deliveries = []

    payload = {
        "event_type": event_type,
        "incident_id": str(incident.id),
        "service_name": incident.service_name,
        "fingerprint": incident.fingerprint,
        "status": incident.status,
        "severity": incident.severity,
        "alert_count": incident.alert_count,
        "first_seen_at": incident.first_seen_at.isoformat() if incident.first_seen_at else None,
        "last_seen_at": incident.last_seen_at.isoformat() if incident.last_seen_at else None,
        "timestamp": timezone.now().isoformat(),
        "details": details or {},
    }

    cutoff = timezone.now() - timedelta(seconds=dedup_window_seconds)

    for dest in active_destinations:
        # Deduplication check: Suppress duplicate deliveries for identical event within window
        is_duplicate = NotificationDelivery.objects.filter(
            incident=incident,
            destination=dest,
            event_type=event_type,
            status=NotificationDelivery.DeliveryStatus.DELIVERED,
            delivered_at__gte=cutoff,
        ).exists()

        if is_duplicate:
            logger.info(
                f"[Notification] Duplicate notification suppressed for incident '{incident.id}' "
                f"to destination '{dest.name}' (Event: {event_type})"
            )
            continue

        status_code = None
        error_msg = ""
        delivery_status = NotificationDelivery.DeliveryStatus.DELIVERED

        if dest.destination_type == NotificationDestination.DestinationType.CONSOLE:
            logger.info(f"[Notification] CONSOLE delivery to '{dest.name}': {json.dumps(payload)}")
            status_code = 200

        elif dest.destination_type in (
            NotificationDestination.DestinationType.WEBHOOK,
            NotificationDestination.DestinationType.SLACK,
            NotificationDestination.DestinationType.PAGERDUTY,
        ):
            if not dest.endpoint_url:
                delivery_status = NotificationDelivery.DeliveryStatus.FAILED
                error_msg = "No endpoint_url configured for webhook destination"
            else:
                try:
                    body_bytes = json.dumps(payload).encode("utf-8")
                    headers = {
                        "Content-Type": "application/json",
                        "User-Agent": "SignalBridge-Notifier/1.0",
                    }
                    if dest.auth_header:
                        headers["Authorization"] = dest.auth_header

                    req = urllib.request.Request(dest.endpoint_url, data=body_bytes, headers=headers, method="POST")
                    with urllib.request.urlopen(req, timeout=5) as resp:
                        status_code = resp.getcode()
                except urllib.error.HTTPError as exc:
                    delivery_status = NotificationDelivery.DeliveryStatus.FAILED
                    status_code = exc.code
                    error_msg = f"HTTP Error {exc.code}: {exc.reason}"
                except Exception as exc:
                    delivery_status = NotificationDelivery.DeliveryStatus.FAILED
                    error_msg = str(exc)

        delivery_rec = NotificationDelivery.objects.create(
            incident=incident,
            destination=dest,
            status=delivery_status,
            event_type=event_type,
            payload_snapshot=payload,
            response_status_code=status_code,
            error_message=error_msg,
        )
        deliveries.append(delivery_rec)

    return deliveries


def safe_dispatch_incident_notification(
    incident: Incident,
    event_type: str,
    details: Optional[Dict[str, Any]] = None,
) -> List[NotificationDelivery]:
    """
    Safely dispatches incident notifications within an isolated exception boundary.
    Guarantees that notification delivery failures (network errors, external 500s)
    never abort or roll back database transactions for the underlying incident.
    """
    try:
        return dispatch_incident_notification(incident, event_type, details)
    except Exception as exc:
        logger.error(
            f"[Notification] Unexpected error in safe notification dispatch for incident '{incident.id}': {exc}",
            exc_info=True,
        )
        return []

