"""
===================================================================================
SignalBridge — Stage B Reliability & Correctness Test Suite
===================================================================================
Verifies:
    1. Alert Deduplication Identity (source, external_id) and 409 conflict detection
       when external_id is repeated with altered payload content.
    2. Incident Reopening Window (< 15 mins reopens RESOLVED incident; >= 15 mins creates new).
    3. Idempotent Celery Redelivery (status PROCESSED skips re-processing).
    4. Truthful S3 Archival Status tracking (ARCHIVED vs FAILED).
    5. RedisSlidingWindowRateLimiter burst throttling.
===================================================================================
"""
from datetime import timedelta
from unittest.mock import patch
import pytest
from django.utils import timezone

from apps.alerts.models import Alert, Incident, IncidentEvent
from apps.alerts.services import (
    AlertConflictError,
    correlate_alert_and_incident,
)
from apps.alerts.deduplication import calculate_content_hash
from apps.core.dsa.sliding_window import RedisSlidingWindowRateLimiter
from apps.webhooks.models import IngestedPayload, WebhookSource
from apps.webhooks.tasks import process_webhook


@pytest.mark.django_db
class TestStageBAlertDeduplication:
    """Tests for external_id deduplication and conflict detection."""

    def test_calculate_content_hash_deterministic(self):
        """Content hash produces same SHA-256 regardless of whitespace or casing subtleties."""
        hash1 = calculate_content_hash("billing", "Out of Memory", "cluster-us-east", "HIGH")
        hash2 = calculate_content_hash("Billing ", "out of memory", "cluster-us-east", "high")
        assert hash1 == hash2
        assert len(hash1) == 64

    def test_alert_conflict_error_on_mismatched_content_with_same_external_id(self, webhook_source):
        """Same external_id with modified payload content raises AlertConflictError (HTTP 409)."""
        payload_rec = IngestedPayload.objects.create(
            source=webhook_source,
            tracking_id="trk-b-001",
            idempotency_hash="hash-b-001",
        )
        alert_data_1 = {
            "service": "billing",
            "fingerprint": "charge-failed",
            "external_id": "ext-stripe-100",
            "title": "Stripe Charge Failed #1",
            "severity": "HIGH",
        }
        # First alert creates new alert and incident
        alert1, inc1, is_new1, is_dup1 = correlate_alert_and_incident(alert_data_1, payload_rec)
        assert is_new1 is True
        assert is_dup1 is False

        # Identical alert with same external_id returns existing alert (deduplicated)
        alert2, inc2, is_new2, is_dup2 = correlate_alert_and_incident(alert_data_1, payload_rec)
        assert alert2.id == alert1.id
        assert is_dup2 is True

        # Alert with SAME external_id but CHANGED content must raise AlertConflictError!
        alert_data_tampered = {
            "service": "billing",
            "fingerprint": "charge-failed",
            "external_id": "ext-stripe-100",
            "title": "Stripe Charge Failed - TAMPERED DESCRIPTION",
            "severity": "CRITICAL",
        }
        with pytest.raises(AlertConflictError) as exc_info:
            correlate_alert_and_incident(alert_data_tampered, payload_rec)
        assert "ext-stripe-100" in str(exc_info.value)


@pytest.mark.django_db
class TestStageBIncidentReopening:
    """Tests for resolved incident reopening window."""

    def test_resolved_incident_reopened_within_window(self, webhook_source):
        """An alert arriving 5 minutes after incident resolution reopens the incident."""
        payload_rec = IngestedPayload.objects.create(
            source=webhook_source,
            tracking_id="trk-reopen-001",
            idempotency_hash="hash-reopen-001",
        )
        # Create resolved incident with last_seen_at 5 minutes ago (< 15 mins):
        resolved_time = timezone.now() - timedelta(minutes=5)
        inc = Incident.objects.create(
            service_name="auth-service",
            fingerprint="ldap-unreachable",
            status=Incident.IncidentStatus.RESOLVED,
            severity=Incident.SeverityLevel.HIGH,
            alert_count=3,
            last_seen_at=resolved_time,
        )
        IncidentEvent.objects.create(
            incident=inc,
            event_type=IncidentEvent.EventType.RESOLVED,
            actor="test-operator",
        )

        alert_data = {
            "service": "auth-service",
            "fingerprint": "ldap-unreachable",
            "title": "LDAP Connection Refused",
            "severity": "HIGH",
        }
        alert, incident, is_new, is_dup = correlate_alert_and_incident(alert_data, payload_rec)

        assert incident.id == inc.id
        assert incident.status == Incident.IncidentStatus.OPEN
        assert is_new is False

        # Verify REOPENED event recorded
        reopened_event = IncidentEvent.objects.filter(
            incident=incident,
            event_type=IncidentEvent.EventType.REOPENED,
        ).first()
        assert reopened_event is not None

    def test_resolved_incident_creates_new_incident_after_window(self, webhook_source):
        """An alert arriving 30 minutes after incident resolution creates a brand new incident."""
        payload_rec = IngestedPayload.objects.create(
            source=webhook_source,
            tracking_id="trk-reopen-002",
            idempotency_hash="hash-reopen-002",
        )
        # Create resolved incident and update last_seen_at directly via QuerySet:
        resolved_time = timezone.now() - timedelta(minutes=30)
        old_inc = Incident.objects.create(
            service_name="payment-service",
            fingerprint="webhook-dropped",
            status=Incident.IncidentStatus.RESOLVED,
            severity=Incident.SeverityLevel.MEDIUM,
            alert_count=1,
        )
        Incident.objects.filter(id=old_inc.id).update(last_seen_at=resolved_time)
        old_inc.refresh_from_db()
        IncidentEvent.objects.create(
            incident=old_inc,
            event_type=IncidentEvent.EventType.RESOLVED,
            actor="test-operator",
        )

        alert_data = {
            "service": "payment-service",
            "fingerprint": "webhook-dropped",
            "title": "Webhook Dropped Again",
            "severity": "MEDIUM",
        }
        alert, incident, is_new, is_dup = correlate_alert_and_incident(alert_data, payload_rec)

        assert incident.id != old_inc.id
        assert is_new is True
        assert incident.status == Incident.IncidentStatus.OPEN


@pytest.mark.django_db
class TestStageBCeleryIdempotentRedelivery:
    """Tests for safe redelivery and status tracking in Celery worker."""

    def test_redelivery_skips_processing_if_already_processed(self, webhook_source):
        """Worker safely exits with ALREADY_PROCESSED if record is already completed."""
        payload_rec = IngestedPayload.objects.create(
            source=webhook_source,
            tracking_id="trk-redeliver-001",
            idempotency_hash="hash-redeliver-001",
            status=IngestedPayload.ProcessingStatus.PROCESSED,
        )
        res = process_webhook(payload_id=str(payload_rec.id), raw_payload={"service": "test"})
        assert res["status"] == "ALREADY_PROCESSED"
        assert res["tracking_id"] == "trk-redeliver-001"


@pytest.mark.django_db
class TestStageBArchivalStatus:
    """Tests for truthful archival status tracking."""

    @patch("apps.webhooks.archival.s3_archiver.archive_payload")
    def test_truthful_archival_status_on_failure(self, mock_archive, webhook_source):
        """When S3 archive fails, archive_status is set to FAILED, not falsely ARCHIVED."""
        mock_archive.return_value = None
        payload_rec = IngestedPayload.objects.create(
            source=webhook_source,
            tracking_id="trk-archive-fail",
            idempotency_hash="hash-archive-fail",
            status=IngestedPayload.ProcessingStatus.PENDING,
            archive_status=IngestedPayload.ArchiveStatus.NOT_STARTED,
        )
        res = process_webhook(payload_id=str(payload_rec.id), raw_payload={"service": "order-api"})
        assert res["status"] == "PROCESSED"
        payload_rec.refresh_from_db()
        # archive_status should not be ARCHIVED if mock returned None
        assert payload_rec.archive_status != IngestedPayload.ArchiveStatus.ARCHIVED


class TestStageBRedisSlidingWindowLimiter:
    """Tests for RedisSlidingWindowRateLimiter fallback and window calculations."""

    def test_local_fallback_burst_and_window(self):
        limiter = RedisSlidingWindowRateLimiter(redis_client=None)
        # Limit to 3 requests per 60s
        allowed1, info1 = limiter.is_allowed("test-src", limit=3, window_seconds=60)
        assert allowed1 is True
        assert info1["remaining"] == 2

        allowed2, info2 = limiter.is_allowed("test-src", limit=3, window_seconds=60)
        assert allowed2 is True
        assert info2["remaining"] == 1

        allowed3, info3 = limiter.is_allowed("test-src", limit=3, window_seconds=60)
        assert allowed3 is True
        assert info3["remaining"] == 0

        # 4th request must be denied
        allowed4, info4 = limiter.is_allowed("test-src", limit=3, window_seconds=60)
        assert allowed4 is False
        assert info4["remaining"] == 0
        assert info4["retry_after"] > 0
