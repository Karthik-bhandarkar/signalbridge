"""
===================================================================================
SignalBridge — S3 Tiered Cold Storage Archiving Unit & Integration Tests
===================================================================================
"""
from datetime import datetime
from unittest.mock import MagicMock, patch

from django.test import TestCase
from django.utils import timezone

from apps.webhooks.archival import S3PayloadArchiver
from apps.webhooks.models import IngestedPayload, WebhookSource


class S3ArchivalTestCase(TestCase):
    """Tests for S3 payload key formatting, bucket management, and cold archiving."""

    def setUp(self):
        self.source = WebhookSource.objects.create(
            name="Sentry Ingestion",
            slug="sentry-prod",
            secret_key="secret-sentry-123",
        )
        self.payload = IngestedPayload.objects.create(
            source=self.source,
            tracking_id="trk-s3-100",
            idempotency_hash="hash-s3-100",
            status=IngestedPayload.ProcessingStatus.PENDING,
        )
        self.archiver = S3PayloadArchiver()

    def test_build_s3_key_format(self):
        """Validates hierarchical date-partitioned S3 key naming."""
        fixed_dt = datetime(2026, 10, 15, 12, 0, 0)
        s3_key = self.archiver.build_s3_key(
            source_slug="datadog",
            payload_id="payload-uuid-999",
            timestamp=fixed_dt,
        )
        expected_key = "archives/datadog/2026/10/15/payload-uuid-999.json"
        self.assertEqual(s3_key, expected_key)

    def test_archive_payload_updates_database_pointer(self):
        """Validates that archiving saves the S3 object key on the database record."""
        test_body = {
            "service": "order-management",
            "error": "Payment timeout",
            "order_id": 9812,
        }

        # Mock the underlying boto3 client to verify put_object arguments:
        mock_boto = MagicMock()
        with patch.object(self.archiver, "get_client", return_value=mock_boto):
            with patch.object(self.archiver, "ensure_bucket_exists", return_value=True):
                s3_key = self.archiver.archive_payload(
                    payload_record=self.payload,
                    raw_payload=test_body,
                )

                self.assertIsNotNone(s3_key)
                self.assertIn("archives/sentry-prod/", s3_key)
                self.assertTrue(s3_key.endswith(f"{self.payload.id}.json"))

                # Verify Boto3 client was called:
                mock_boto.put_object.assert_called_once()
                call_kwargs = mock_boto.put_object.call_args[1]
                self.assertEqual(call_kwargs["Bucket"], self.archiver.bucket_name)
                self.assertEqual(call_kwargs["Key"], s3_key)
                self.assertEqual(call_kwargs["ContentType"], "application/json")

                # Verify database pointer updated:
                self.payload.refresh_from_db()
                self.assertEqual(self.payload.s3_payload_key, s3_key)

    def test_retrieve_payload_deserialization(self):
        """Validates retrieving and deserializing archived payload from S3."""
        mock_boto = MagicMock()
        mock_body = MagicMock()
        mock_body.read.return_value = b'{"status":"archived_ok","code":200}'
        mock_boto.get_object.return_value = {"Body": mock_body}

        with patch.object(self.archiver, "get_client", return_value=mock_boto):
            result = self.archiver.retrieve_payload("archives/test/key.json")
            self.assertEqual(result, {"status": "archived_ok", "code": 200})

    def test_empty_payload_returns_none_without_s3_call(self):
        """Empty payload dictionary skips S3 upload gracefully."""
        mock_boto = MagicMock()
        with patch.object(self.archiver, "get_client", return_value=mock_boto):
            s3_key = self.archiver.archive_payload(
                payload_record=self.payload,
                raw_payload={},
            )
            self.assertIsNone(s3_key)
            mock_boto.put_object.assert_not_called()
