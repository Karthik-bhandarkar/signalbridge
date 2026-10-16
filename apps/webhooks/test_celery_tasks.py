"""
===================================================================================
SignalBridge — Celery Asynchronous Task Unit & Integration Tests
===================================================================================
Tests for:
    1. Direct execution of 'process_webhook' task transitioning IngestedPayload
       from PENDING to PROCESSED.
    2. Graceful handling of non-existent payload IDs.
    3. Verification that 'WebhookIngestionAPIView' triggers 'process_webhook.delay'
       for fresh requests, but skips enqueuing on duplicate requests.
===================================================================================
"""
import uuid
from unittest.mock import patch

from django.test import TestCase
from django.urls import reverse
from rest_framework import status
from rest_framework.test import APIClient

from apps.core.dsa.idempotency import idempotency_manager
from apps.webhooks.models import WebhookSource, IngestedPayload
from apps.webhooks.tasks import process_webhook
from apps.webhooks.security import verify_hmac_signature
import hmac
import hashlib
import json


class CeleryTaskTestCase(TestCase):
    """
    Tests for Celery task execution and queueing.
    """

    def setUp(self):
        idempotency_manager.clear()
        self.source = WebhookSource.objects.create(
            name="Test Source",
            slug="test-source",
            secret_key="secret-key-123",
            is_active=True,
        )
        self.payload_record = IngestedPayload.objects.create(
            source=self.source,
            tracking_id="task-test-001",
            idempotency_hash="hash-abc-123",
            status=IngestedPayload.ProcessingStatus.PENDING,
        )

    def tearDown(self):
        idempotency_manager.clear()

    def test_process_webhook_marks_record_as_processed(self):
        """
        Verify that executing process_webhook updates IngestedPayload status to PROCESSED.
        """
        self.assertEqual(self.payload_record.status, IngestedPayload.ProcessingStatus.PENDING)

        result = process_webhook(
            payload_id=str(self.payload_record.id),
            raw_payload={"title": "High CPU", "severity": "CRITICAL"},
        )

        self.assertEqual(result["status"], "PROCESSED")
        self.assertEqual(result["payload_id"], str(self.payload_record.id))
        self.assertEqual(result["tracking_id"], "task-test-001")

        # Reload from database to verify persistence:
        self.payload_record.refresh_from_db()
        self.assertEqual(self.payload_record.status, IngestedPayload.ProcessingStatus.PROCESSED)

    def test_process_webhook_missing_record_returns_not_found(self):
        """
        Verify that a non-existent payload ID returns NOT_FOUND without throwing an uncaught exception.
        """
        missing_id = str(uuid.uuid4())
        result = process_webhook(payload_id=missing_id)

        self.assertEqual(result["status"], "NOT_FOUND")
        self.assertEqual(result["payload_id"], missing_id)

    @patch("apps.webhooks.views.process_webhook.delay")
    def test_gateway_enqueues_task_for_fresh_webhook_and_skips_on_duplicate(self, mock_delay):
        """
        Verify that WebhookIngestionAPIView enqueues a Celery task exactly once for a
        fresh event, and does NOT enqueue for duplicate requests.
        """
        client = APIClient()
        url = reverse("webhooks:ingest", kwargs={"source_slug": self.source.slug})
        body_dict = {"event_type": "alert.trigger", "payload": {"service": "cache", "severity": "INFO"}}
        raw_bytes = json.dumps(body_dict, separators=(",", ":")).encode("utf-8")
        signature = "sha256=" + hmac.new(b"secret-key-123", raw_bytes, hashlib.sha256).hexdigest()

        # 1. Fresh Request -> 202 Accepted & Enqueue Task
        resp1 = client.post(
            url,
            data=raw_bytes,
            content_type="application/json",
            HTTP_X_SIGNATURE_256=signature,
        )
        self.assertEqual(resp1.status_code, status.HTTP_202_ACCEPTED)
        self.assertEqual(mock_delay.call_count, 1)

        # 2. Duplicate Request -> 200 OK & Skip Task Enqueue
        resp2 = client.post(
            url,
            data=raw_bytes,
            content_type="application/json",
            HTTP_X_SIGNATURE_256=signature,
        )
        self.assertEqual(resp2.status_code, status.HTTP_200_OK)
        # Call count should STILL be 1 (zero redundant tasks enqueued!):
        self.assertEqual(mock_delay.call_count, 1)
