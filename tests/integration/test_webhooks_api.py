"""
===================================================================================
SignalBridge — Webhook Gateway API Integration Test Suite
===================================================================================
"""
import hashlib
import hmac
import json
import pytest
from rest_framework import status

from apps.webhooks.models import IngestedPayload


@pytest.mark.django_db
class TestWebhookIngestionAPIGateway:
    """End-to-end integration tests for the Webhook Ingestion API Gateway."""

    def _sign_payload(self, body_bytes: bytes, secret_key: str) -> str:
        """Helper to generate HMAC-SHA256 signature."""
        return "sha256=" + hmac.new(
            key=secret_key.encode("utf-8"),
            msg=body_bytes,
            digestmod=hashlib.sha256,
        ).hexdigest()

    def test_valid_webhook_returns_202_accepted(self, api_client, webhook_source, valid_alert_payload):
        """Authenticated valid webhook returns HTTP 202 Accepted and creates IngestedPayload."""
        body = json.dumps({"event_type": "alert.trigger", "payload": valid_alert_payload}).encode("utf-8")
        sig = self._sign_payload(body, webhook_source.secret_key)

        url = f"/api/v1/webhooks/{webhook_source.slug}/"
        response = api_client.post(
            url,
            data=body,
            content_type="application/json",
            HTTP_X_SIGNATURE_256=sig,
            HTTP_X_TRACKING_ID="test-trk-001",
        )

        assert response.status_code == status.HTTP_202_ACCEPTED
        data = response.json()
        assert data["status"] == "accepted"
        assert data["source"] == webhook_source.slug
        assert data["tracking_id"] == "test-trk-001"

        # Verify database record:
        payload_rec = IngestedPayload.objects.filter(tracking_id="test-trk-001").first()
        assert payload_rec is not None
        assert payload_rec.source == webhook_source

    def test_tampered_signature_returns_401_unauthorized(self, api_client, webhook_source, valid_alert_payload):
        """Modified payload bytes with mismatched signature return HTTP 401."""
        body = json.dumps({"payload": valid_alert_payload}).encode("utf-8")
        tampered_sig = "sha256=0000000000000000000000000000000000000000000000000000000000000000"

        url = f"/api/v1/webhooks/{webhook_source.slug}/"
        response = api_client.post(
            url,
            data=body,
            content_type="application/json",
            HTTP_X_SIGNATURE_256=tampered_sig,
        )

        assert response.status_code == status.HTTP_401_UNAUTHORIZED

    def test_missing_signature_header_returns_401(self, api_client, webhook_source, valid_alert_payload):
        """Request without HMAC signature header is rejected with HTTP 401."""
        body = json.dumps({"payload": valid_alert_payload}).encode("utf-8")
        url = f"/api/v1/webhooks/{webhook_source.slug}/"
        response = api_client.post(url, data=body, content_type="application/json")
        assert response.status_code == status.HTTP_401_UNAUTHORIZED

    def test_deactivated_source_returns_403_forbidden(self, api_client, inactive_webhook_source, valid_alert_payload):
        """Deactivated webhook source returns HTTP 403 Forbidden."""
        body = json.dumps({"payload": valid_alert_payload}).encode("utf-8")
        sig = self._sign_payload(body, inactive_webhook_source.secret_key)

        url = f"/api/v1/webhooks/{inactive_webhook_source.slug}/"
        response = api_client.post(
            url,
            data=body,
            content_type="application/json",
            HTTP_X_SIGNATURE_256=sig,
        )

        assert response.status_code == status.HTTP_403_FORBIDDEN

    def test_unknown_source_slug_returns_404(self, api_client):
        """Unregistered webhook slug returns HTTP 404 Not Found."""
        url = "/api/v1/webhooks/non-existent-source/"
        response = api_client.post(
            url,
            data=json.dumps({"payload": {"test": 1}}).encode("utf-8"),
            content_type="application/json",
            HTTP_X_SIGNATURE_256="sha256=dummy",
        )
        assert response.status_code == status.HTTP_404_NOT_FOUND

    def test_empty_json_body_returns_400_bad_request(self, api_client, webhook_source):
        """Empty payload envelope returns HTTP 400 Bad Request."""
        body = b"{}"
        sig = self._sign_payload(body, webhook_source.secret_key)
        url = f"/api/v1/webhooks/{webhook_source.slug}/"
        response = api_client.post(
            url,
            data=body,
            content_type="application/json",
            HTTP_X_SIGNATURE_256=sig,
        )
        assert response.status_code == status.HTTP_400_BAD_REQUEST

    def test_root_health_endpoint_returns_200(self, api_client):
        """Root health probe returns HTTP 200 with online status."""
        response = api_client.get("/")
        assert response.status_code == status.HTTP_200_OK
        data = response.json()
        assert data["status"] == "online"
        assert data["version"] == "1.0.0"
