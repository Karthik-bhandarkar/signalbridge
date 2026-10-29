import pytest
from rest_framework.test import APIClient
from apps.webhooks.models import WebhookSource, IngestedPayload


@pytest.mark.django_db
def test_ingestion_events_endpoint_public_and_sanitized():
    source = WebhookSource.objects.create(
        name="PagerDuty Test",
        slug="pagerduty-test",
        secret_key="secret123",
        is_active=True,
    )
    IngestedPayload.objects.create(
        source=source,
        tracking_id="trc-test-1234",
        idempotency_hash="hash-1234567890",
        status=IngestedPayload.ProcessingStatus.PROCESSED,
        s3_payload_key="archives/2026/10/29/test.json",
    )

    client = APIClient()
    response = client.get("/api/v1/events/")
    assert response.status_code == 200
    events = response.json()
    assert isinstance(events, list)
    assert len(events) >= 1
    first = events[0]
    assert first["tracking_id"] == "trc-test-1234"
    assert first["source"] == "pagerduty-test"
    # Public visitors should not see S3 object archive keys
    assert first["archive_key"] is None

