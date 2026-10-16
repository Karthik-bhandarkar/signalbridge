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
import logging
from typing import Any, Dict, Optional, Tuple

from django.db import connection, transaction
from django.utils import timezone

from apps.alerts.deduplication import calculate_alert_dedup_hash, is_alert_duplicate
from apps.alerts.models import Alert, Incident, IncidentEvent
from apps.webhooks.models import IngestedPayload

logger = logging.getLogger(__name__)

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
) -> Tuple[Alert, Incident, bool, bool]:
    """
    Normalizes an incoming alert payload, links or creates an active Incident,
    and returns (Alert, Incident, is_new_incident, is_duplicate_alert).

    Args:
        alert_data: Raw or semi-structured alert dictionary.
        payload: Optional parent IngestedPayload model instance.
        dedup_window_seconds: Window for alert deduplication checking (default: 300s).

    Returns:
        Tuple[Alert, Incident, bool, bool]:
            - alert: The saved Alert instance.
            - incident: The parent Incident correlated with this alert.
            - is_new_incident: True if a fresh Incident was opened.
            - is_duplicate_alert: True if this exact alert was previously recorded.
    """
    # -------------------------------------------------------------------------
    # STEP 1: NORMALIZE ALERT FIELDS
    # -------------------------------------------------------------------------
    # Extract service name:
    service_name = (
        alert_data.get("service")
        or alert_data.get("service_name")
        or (payload.source.slug if payload and payload.source else "unknown-service")
    )
    service_name = str(service_name).strip().lower()

    # Extract title and description:
    title = str(alert_data.get("title") or alert_data.get("summary") or "Alert Triggered")[:255]
    description = str(alert_data.get("description") or alert_data.get("details") or "")

    # Extract or derive correlation fingerprint:
    raw_fingerprint = alert_data.get("fingerprint") or alert_data.get("event_type")
    if not raw_fingerprint:
        # Fallback to normalized title without variable numerical tokens:
        raw_fingerprint = "".join(ch for ch in title.lower() if ch.isalnum() or ch in ("-", "_", " ")).strip()
        raw_fingerprint = raw_fingerprint.replace(" ", "-")[:255] or "generic-incident"
    fingerprint = str(raw_fingerprint).strip().lower()[:255]

    # Normalize severity:
    severity = normalize_severity(alert_data.get("severity"))

    # Compute deterministic alert deduplication hash:
    custom_dedup_key = alert_data.get("dedup_key") or alert_data.get("event_id")
    dedup_hash = calculate_alert_dedup_hash(
        service_name=service_name,
        fingerprint=fingerprint,
        title=title,
        custom_key=str(custom_dedup_key) if custom_dedup_key else None,
    )

    # -------------------------------------------------------------------------
    # STEP 2: DEDUPLICATION CHECK (WITHIN DEDUP WINDOW)
    # -------------------------------------------------------------------------
    is_duplicate = is_alert_duplicate(
        service_name=service_name,
        dedup_hash=dedup_hash,
        window_seconds=dedup_window_seconds,
    )

    # -------------------------------------------------------------------------
    # STEP 3: TRANSACTION ATOMIC BLOCK & ROW LOCKING
    # -------------------------------------------------------------------------
    with transaction.atomic():
        # In PostgreSQL, acquire transaction advisory lock on hash of (service_name + fingerprint)
        # to eliminate race conditions when 20+ threads create an initial Incident at millisecond 0:
        if connection.vendor == "postgresql":
            with connection.cursor() as cursor:
                cursor.execute(
                    "SELECT pg_advisory_xact_lock(hashtext(%s));",
                    [f"{service_name}:{fingerprint}"],
                )

        # Query open incident for this service & fingerprint with row-level lock (SELECT FOR UPDATE):
        incident = (
            Incident.objects.select_for_update()
            .filter(
                service_name=service_name,
                fingerprint=fingerprint,
                status=Incident.IncidentStatus.OPEN,
            )
            .first()
        )

        is_new_incident = False

        if not incident:
            # CREATE NEW INCIDENT:
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
        else:
            # ATTACH TO EXISTING INCIDENT:
            # Worker safely updates existing incident row under lock:
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
        # STEP 4: PERSIST ALERT RECORD
        # ---------------------------------------------------------------------
        alert = Alert.objects.create(
            payload=payload,
            incident=incident,
            service_name=service_name,
            deduplication_hash=dedup_hash,
            fingerprint=fingerprint,
            severity=severity,
            title=title,
            description=description,
            raw_metadata=alert_data,
        )

        return alert, incident, is_new_incident, is_duplicate
