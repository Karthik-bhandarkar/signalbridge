"""
===================================================================================
SignalBridge — Webhook Gateway Ingestion & Idempotency Integration Tests
===================================================================================
Verifies:
    1. HMAC-authenticated ingestion returns HTTP 202 Accepted and creates IngestedPayload.
    2. Duplicate webhook payload returns HTTP 200 OK and skips database insertion.
    3. Tampered and missing signatures return HTTP 401 Unauthorized.
    4. Unregistered source slugs return HTTP 404 Not Found.
===================================================================================
"""
import hashlib
import hmac
import json

from django.test import TestCase
from django.urls import reverse
from rest_framework import status
from rest_framework.test import APIClient

from apps.core.dsa.idempotency import idempotency_manager
from apps.core.dsa.sliding_window import sliding_window_limiter
from apps.webhooks.models import WebhookSource, IngestedPayload


class WebhookIngestionAPITestCase(TestCase):
    """
    Integration tests for Webhook Ingestion API with HMAC and Redis Idempotency.
    """

    def setUp(self):
        idempotency_manager.clear()
        sliding_window_limiter.clear()
        self.client = APIClient()
        self.secret = "test-secret-key-456"
        self.source = WebhookSource.objects.create(
            name="Test PagerDuty",
            slug="pagerduty-test",
            secret_key=self.secret,
            is_active=True,
        )
        self.url = reverse("webhooks:ingest", kwargs={"source_slug": self.source.slug})
        self.sample_payload = {
            "event_type": "incident.trigger",
            "payload": {
                "service": "billing-api",
                "severity": "CRITICAL",
                "title": "Payment Gateway Timeout",
            },
        }
        self.raw_body = json.dumps(self.sample_payload).encode("utf-8")

    def tearDown(self):
        idempotency_manager.clear()
        sliding_window_limiter.clear()

    def _compute_signature(self, body_bytes: bytes, secret: str) -> str:
        digest = hmac.new(secret.encode("utf-8"), body_bytes, hashlib.sha256).hexdigest()
        return f"sha256={digest}"

    def test_first_dispatch_returns_202_and_creates_record(self):
        """
        Verify that a fresh, authentic webhook dispatch is accepted with HTTP 202
        and creates exactly 1 IngestedPayload record.
        """
        signature = self._compute_signature(self.raw_body, self.secret)

        response = self.client.post(
            self.url,
            data=self.raw_body,
            content_type="application/json",
            HTTP_X_SIGNATURE_256=signature,
        )

        self.assertEqual(response.status_code, status.HTTP_202_ACCEPTED)
        self.assertEqual(response.data["status"], "accepted")
        self.assertEqual(response.data["source"], self.source.slug)
        self.assertTrue("idempotency_hash" in response.data)

        # Confirm 1 record in database:
        self.assertEqual(IngestedPayload.objects.filter(source=self.source).count(), 1)

    def test_duplicate_dispatch_returns_200_without_duplicate_db_record(self):
        """
        Verify that repeating the exact same dispatch within TTL returns HTTP 200 OK
        and does NOT create a duplicate database record.
        """
        signature = self._compute_signature(self.raw_body, self.secret)

        # 1. First Dispatch -> 202 Accepted
        first_resp = self.client.post(
            self.url,
            data=self.raw_body,
            content_type="application/json",
            HTTP_X_SIGNATURE_256=signature,
        )
        self.assertEqual(first_resp.status_code, status.HTTP_202_ACCEPTED)
        self.assertEqual(IngestedPayload.objects.filter(source=self.source).count(), 1)

        # 2. Second Dispatch (Exact same body & signature) -> 200 OK (Duplicate Ignored)
        second_resp = self.client.post(
            self.url,
            data=self.raw_body,
            content_type="application/json",
            HTTP_X_SIGNATURE_256=signature,
        )
        self.assertEqual(second_resp.status_code, status.HTTP_200_OK)
        self.assertEqual(second_resp.data["status"], "duplicate_ignored")
        self.assertIn("Idempotent duplicate detected", second_resp.data["message"])

        # 3. Assert database STILL contains only 1 record (zero duplicate writes!):
        self.assertEqual(IngestedPayload.objects.filter(source=self.source).count(), 1)

    def test_tampered_signature_returns_401(self):
        """
        Verify that a forged signature is rejected with HTTP 401.
        """
        bad_sig = "sha256=0000000000000000000000000000000000000000000000000000000000000000"
        response = self.client.post(
            self.url,
            data=self.raw_body,
            content_type="application/json",
            HTTP_X_SIGNATURE_256=bad_sig,
        )
        self.assertEqual(response.status_code, status.HTTP_401_UNAUTHORIZED)
        self.assertEqual(IngestedPayload.objects.count(), 0)

    def test_missing_signature_returns_401(self):
        """
        Verify that a request lacking the X-Signature-256 header returns HTTP 401.
        """
        response = self.client.post(
            self.url,
            data=self.raw_body,
            content_type="application/json",
        )
        self.assertEqual(response.status_code, status.HTTP_401_UNAUTHORIZED)
        self.assertEqual(IngestedPayload.objects.count(), 0)

    def test_unregistered_source_slug_returns_404(self):
        """
        Verify that an unknown webhook source returns HTTP 404.
        """
        unknown_url = reverse("webhooks:ingest", kwargs={"source_slug": "nonexistent"})
        response = self.client.post(unknown_url, data="{}", content_type="application/json")
        self.assertEqual(response.status_code, status.HTTP_404_NOT_FOUND)

    def test_rate_limit_exceeded_returns_429(self):
        """
        Verify that exceeding rate_limit_per_minute returns HTTP 429 Too Many Requests
        with Retry-After and rate limit headers.
        """
        # Configure tight burst limit: 2 requests per minute
        self.source.rate_limit_per_minute = 2
        self.source.save()

        # Send Request 1:
        body_1 = json.dumps({"event_type": "alert.1", "payload": {"val": 1}}).encode()
        sig_1 = self._compute_signature(body_1, self.secret)
        resp1 = self.client.post(self.url, data=body_1, content_type="application/json", HTTP_X_SIGNATURE_256=sig_1)
        self.assertEqual(resp1.status_code, status.HTTP_202_ACCEPTED)

        # Send Request 2:
        body_2 = json.dumps({"event_type": "alert.2", "payload": {"val": 2}}).encode()
        sig_2 = self._compute_signature(body_2, self.secret)
        resp2 = self.client.post(self.url, data=body_2, content_type="application/json", HTTP_X_SIGNATURE_256=sig_2)
        self.assertEqual(resp2.status_code, status.HTTP_202_ACCEPTED)

        # Send Request 3 (exceeds limit of 2):
        body_3 = json.dumps({"event_type": "alert.3", "payload": {"val": 3}}).encode()
        sig_3 = self._compute_signature(body_3, self.secret)
        resp3 = self.client.post(self.url, data=body_3, content_type="application/json", HTTP_X_SIGNATURE_256=sig_3)
        self.assertEqual(resp3.status_code, status.HTTP_429_TOO_MANY_REQUESTS)
        self.assertIn("Rate limit exceeded", resp3.data["error"])
        self.assertIn("Retry-After", resp3.headers)
        self.assertEqual(resp3.headers["X-RateLimit-Limit"], "2")
        self.assertEqual(resp3.headers["X-RateLimit-Remaining"], "0")
