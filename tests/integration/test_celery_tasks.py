"""
===================================================================================
SignalBridge — Celery Worker Task Pipeline Integration Tests
===================================================================================
"""
import pytest
from unittest.mock import patch

from apps.alerts.models import Alert, Incident
from apps.webhooks.models import IngestedPayload
from apps.webhooks.tasks import process_webhook


@pytest.mark.django_db
class TestCeleryTaskPipeline:
    """Integration tests verifying asynchronous worker execution and database mutation."""

    def test_process_webhook_full_lifecycle(self, webhook_source, valid_alert_payload):
        """
        Executes process_webhook task end-to-end:
        - Updates payload status to PROCESSED
        - Correlates alert into an Incident
        - Offloads raw payload to S3
        """
        payload_rec = IngestedPayload.objects.create(
            source=webhook_source,
            tracking_id="trk-celery-test-01",
            idempotency_hash="hash-celery-01",
            status=IngestedPayload.ProcessingStatus.PENDING,
        )

        with patch("apps.webhooks.archival.s3_archiver.ensure_bucket_exists", return_value=True):
            with patch("apps.webhooks.archival.s3_archiver.get_client") as mock_get_client:
                mock_s3 = mock_get_client.return_value
                result = process_webhook(
                    payload_id=str(payload_rec.id),
                    raw_payload=valid_alert_payload,
                )

                assert result["status"] == "PROCESSED"
                assert result["tracking_id"] == "trk-celery-test-01"
                assert "incident_id" in result
                assert "alert_id" in result

                # Verify payload status transitioned to PROCESSED:
                payload_rec.refresh_from_db()
                assert payload_rec.status == IngestedPayload.ProcessingStatus.PROCESSED
                assert payload_rec.s3_payload_key is not None

                # Verify Incident created:
                incident = Incident.objects.filter(id=result["incident_id"]).first()
                assert incident is not None
                assert incident.service_name == "checkout-api"
                assert incident.status == Incident.IncidentStatus.OPEN

                # Verify Alert created and linked:
                alert = Alert.objects.filter(id=result["alert_id"]).first()
                assert alert is not None
                assert alert.incident == incident

    def test_process_webhook_missing_record_returns_not_found(self):
        """Task with non-existent payload ID handles missing record gracefully."""
        result = process_webhook(payload_id="00000000-0000-0000-0000-000000000000")
        assert result["status"] == "NOT_FOUND"
