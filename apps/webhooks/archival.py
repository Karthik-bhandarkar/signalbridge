"""
===================================================================================
SignalBridge Webhook Ingestion Engine — S3 Tiered Cold Storage Archiving
===================================================================================
PURPOSE:
    This module implements Step 14: Tiered Cold Storage Archiving.
    Raw incoming JSON webhook payloads can range from 10KB to 200KB. Storing millions
    of bulky JSON documents directly in PostgreSQL bloats table storage, exhausts
    memory buffers, and slows down composite B-Tree index scans.
    
ARCHITECTURAL PRINCIPLES:
    1. Tiered Storage Pattern:
       - Operational DB (PostgreSQL 16): Stores lean, structured metadata (tracking IDs,
         status, timestamps, deduplication hashes, and foreign keys).
       - Object Storage (AWS S3 / S3Mock): Stores raw, unmodified vendor JSON payloads
         for compliance, auditing, and asynchronous offline replay.
    2. Date-Partitioned Hierarchical S3 Keys:
       Payloads are organized under:
       'archives/{source_slug}/{YYYY}/{MM}/{DD}/{payload_id}.json'
       This partition layout avoids S3 prefix throttling and aligns with standard
       big-data partitioning formats (Athena / Snowflake / Databricks).
    3. Resilient Fail-Open Design:
       If object storage experiences transient connectivity issues, the archiver logs
       the error without dropping the operational database record.
===================================================================================
"""
import json
import logging
from datetime import datetime
from typing import Any, Dict, Optional

import boto3
from botocore.config import Config
from botocore.exceptions import ClientError
from django.conf import settings
from django.utils import timezone

from apps.webhooks.models import IngestedPayload

logger = logging.getLogger(__name__)


class S3PayloadArchiver:
    """
    Manages cold storage payload offloading to AWS S3 or local S3Mock / MinIO.
    """

    def __init__(self):
        self.bucket_name = getattr(
            settings,
            "AWS_STORAGE_BUCKET_NAME",
            "signalbridge-raw-archives",
        )
        self.endpoint_url = getattr(settings, "AWS_S3_ENDPOINT_URL", None)
        self.region_name = getattr(settings, "AWS_S3_REGION_NAME", "us-east-1")
        self.access_key = getattr(settings, "AWS_ACCESS_KEY_ID", "test")
        self.secret_key = getattr(settings, "AWS_SECRET_ACCESS_KEY", "test")
        self._s3_client = None

    def get_client(self):
        """
        Lazily initializes and caches the Boto3 S3 client with standard retry policies.
        """
        if self._s3_client is None:
            # Custom client config with connect and read timeouts:
            boto_config = Config(
                retries={"max_attempts": 3, "mode": "standard"},
                connect_timeout=5,
                read_timeout=10,
            )
            self._s3_client = boto3.client(
                "s3",
                endpoint_url=self.endpoint_url,
                region_name=self.region_name,
                aws_access_key_id=self.access_key,
                aws_secret_access_key=self.secret_key,
                config=boto_config,
            )
        return self._s3_client

    def ensure_bucket_exists(self) -> bool:
        """
        Validates whether the target storage bucket exists; creates it if missing.

        Returns:
            bool: True if bucket exists or was created successfully.
        """
        client = self.get_client()
        try:
            client.head_bucket(Bucket=self.bucket_name)
            return True
        except ClientError:
            try:
                # S3 us-east-1 does not require LocationConstraint:
                if self.region_name == "us-east-1":
                    client.create_bucket(Bucket=self.bucket_name)
                else:
                    client.create_bucket(
                        Bucket=self.bucket_name,
                        CreateBucketConfiguration={"LocationConstraint": self.region_name},
                    )
                logger.info(f"[S3Archiver] Created S3 bucket '{self.bucket_name}'.")
                return True
            except Exception as exc:
                logger.error(f"[S3Archiver] Failed to create S3 bucket '{self.bucket_name}': {exc}")
                return False

    def build_s3_key(self, source_slug: str, payload_id: str, timestamp: Optional[datetime] = None) -> str:
        """
        Generates a date-partitioned S3 object key.

        Format: archives/{source_slug}/{YYYY}/{MM}/{DD}/{payload_id}.json
        """
        ts = timestamp or timezone.now()
        year = ts.strftime("%Y")
        month = ts.strftime("%m")
        day = ts.strftime("%d")
        clean_slug = str(source_slug).strip().lower().replace("/", "-")
        return f"archives/{clean_slug}/{year}/{month}/{day}/{payload_id}.json"

    def archive_payload(
        self,
        payload_record: IngestedPayload,
        raw_payload: Dict[str, Any],
    ) -> Optional[str]:
        """
        Serializes and uploads the raw payload to S3, updating the IngestedPayload record.

        Args:
            payload_record: The IngestedPayload Django ORM model instance.
            raw_payload: The unparsed JSON payload dictionary to archive.

        Returns:
            Optional[str]: S3 object key on success, None on failure.
        """
        if not raw_payload:
            logger.warning(f"[S3Archiver] Empty payload provided for payload ID {payload_record.id}")
            return None

        try:
            self.ensure_bucket_exists()
            client = self.get_client()

            source_slug = (
                payload_record.source.slug
                if payload_record.source
                else "unknown-source"
            )
            s3_key = self.build_s3_key(
                source_slug=source_slug,
                payload_id=str(payload_record.id),
                timestamp=payload_record.created_at,
            )

            # Serialize payload to UTF-8 bytes:
            payload_bytes = json.dumps(raw_payload, separators=(",", ":")).encode("utf-8")

            # Upload to S3 with metadata tags:
            client.put_object(
                Bucket=self.bucket_name,
                Key=s3_key,
                Body=payload_bytes,
                ContentType="application/json",
                Metadata={
                    "payload_id": str(payload_record.id),
                    "tracking_id": str(payload_record.tracking_id),
                    "source": source_slug,
                },
            )

            # Update PostgreSQL database pointer:
            payload_record.s3_payload_key = s3_key
            payload_record.save(update_fields=["s3_payload_key", "updated_at"])

            logger.info(
                f"[S3Archiver] Successfully archived IngestedPayload '{payload_record.id}' "
                f"to s3://{self.bucket_name}/{s3_key}"
            )
            return s3_key

        except Exception as exc:
            logger.error(
                f"[S3Archiver] Failed to archive IngestedPayload '{payload_record.id}' to S3: {exc}"
            )
            return None

    def retrieve_payload(self, s3_key: str) -> Optional[Dict[str, Any]]:
        """
        Retrieves and parses an archived raw JSON payload from S3.

        Args:
            s3_key: S3 object key path.

        Returns:
            Optional[Dict[str, Any]]: Parsed JSON dictionary, or None if error.
        """
        try:
            client = self.get_client()
            response = client.get_object(Bucket=self.bucket_name, Key=s3_key)
            content_bytes = response["Body"].read()
            return json.loads(content_bytes.decode("utf-8"))
        except Exception as exc:
            logger.error(f"[S3Archiver] Failed to retrieve payload from '{s3_key}': {exc}")
            return None


# Global singleton instance:
s3_archiver = S3PayloadArchiver()
