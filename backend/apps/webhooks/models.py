"""
===================================================================================
SignalBridge Webhook Ingestion Engine — Webhook Domain Models
===================================================================================
PURPOSE:
    This module defines models responsible for the ingestion perimeter:
    1. 'WebhookSource': Represents trusted third-party alert providers (e.g., PagerDuty,
       Datadog, Sentry, Prometheus) along with their cryptographic verification secrets.
    2. 'IngestedPayload': Represents raw ingested HTTP request envelopes, tracking
       deduplication hashes, S3 cold-storage pointers, and asynchronous processing statuses.

CONCURRENCY & HIGH-THROUGHPUT CONSIDERATIONS:
    - Ingested payloads are saved with status 'PENDING' immediately after HMAC verification.
    - Idempotency hashes allow fast database-level duplicate filtering if Redis cache expires.
    - Foreign keys use 'on_delete=models.CASCADE' for clean cascading cleanup during testing.
===================================================================================
"""
# Django ORM Models Framework:
from django.db import models

# Import shared abstract base model from apps.core
from apps.core.models import TimeStampedUUIDModel


class WebhookSource(TimeStampedUUIDModel):
    """
    Represents a registered, authenticated third-party alert origin.

    Each source has its own URL slug (e.g. /api/v1/webhooks/pagerduty/) and a
    shared secret key used to compute HMAC-SHA256 signatures.
    """

    # -----------------------------------------------------------------------------
    # 1. IDENTIFIERS & DESCRIPTIVE METADATA
    # -----------------------------------------------------------------------------
    # Human-friendly display name (e.g., 'PagerDuty Primary Alerts')
    name = models.CharField(
        max_length=100,
        help_text="Human-readable name of the webhook source service."
    )

    # URL-friendly slug used in the REST endpoint path (/api/v1/webhooks/{slug}/).
    # 'unique=True' ensures no two sources share the same URL endpoint.
    # 'db_index=True' enables B-Tree index lookup in O(log N) time.
    slug = models.SlugField(
        max_length=100,
        unique=True,
        db_index=True,
        help_text="Unique URL identifier for routing incoming HTTP POST requests."
    )

    # -----------------------------------------------------------------------------
    # 2. CRYPTOGRAPHIC SECURITY
    # -----------------------------------------------------------------------------
    # Shared secret key used by the third-party sender to compute HMAC-SHA256 signatures.
    # In production, this can also refer to an AWS Secrets Manager secret ARN.
    secret_key = models.CharField(
        max_length=255,
        help_text="Shared secret key used to verify HMAC-SHA256 request payload signatures."
    )

    # -----------------------------------------------------------------------------
    # 3. OPERATIONAL CONTROLS
    # -----------------------------------------------------------------------------
    # Master kill switch: If set to False, webhook requests from this provider are
    # immediately rejected with HTTP 403 Forbidden without executing downstream tasks.
    is_active = models.BooleanField(
        default=True,
        help_text="Enables or disables webhook ingestion for this source immediately."
    )

    # Per-source burst rate limit (requests per minute) enforced by sliding-window algorithm.
    rate_limit_per_minute = models.PositiveIntegerField(
        default=120,
        help_text="Maximum allowed incoming webhook requests per minute before rate-limiting."
    )

    description = models.TextField(
        blank=True,
        default="",
        help_text="Optional operational notes or integration documentation."
    )

    class Meta:
        verbose_name = "Webhook Source"
        verbose_name_plural = "Webhook Sources"
        ordering = ["name"]

    def __str__(self):
        """String representation showing source name and its URL slug."""
        return f"{self.name} ({self.slug})"


class IngestedPayload(TimeStampedUUIDModel):
    """
    Represents an ingested HTTP webhook payload record.

    Stores the raw tracking ID, cryptographic idempotency hash, cold-storage pointer,
    and lifecycle status (PENDING -> PROCESSED | FAILED).
    """

    class ProcessingStatus(models.TextChoices):
        """Enum representing the lifecycle stages of an ingested webhook."""
        PENDING = "PENDING", "Pending Worker Processing"
        PROCESSING = "PROCESSING", "Currently Processing"
        PROCESSED = "PROCESSED", "Successfully Processed"
        FAILED = "FAILED", "Processing Failed"
        RETRYING = "RETRYING", "Enqueued for Retry"

    class ArchiveStatus(models.TextChoices):
        """Enum representing the durability state in cold object storage."""
        NOT_STARTED = "NOT_STARTED", "Not Started"
        PENDING = "PENDING", "Pending Archive"
        ARCHIVED = "ARCHIVED", "Archived to Object Storage"
        FAILED = "FAILED", "Archival Failed"

    # -----------------------------------------------------------------------------
    # 1. RELATIONSHIPS
    # -----------------------------------------------------------------------------
    # Connects each ingested payload to its registered WebhookSource.
    source = models.ForeignKey(
        WebhookSource,
        on_delete=models.CASCADE,
        related_name="payloads",
        help_text="The authenticated source that delivered this webhook payload."
    )

    # -----------------------------------------------------------------------------
    # 2. TRACKING & DEDUPLICATION HASHES
    # -----------------------------------------------------------------------------
    # Unique tracking ID supplied by the external sender in request headers (e.g. X-Request-ID).
    tracking_id = models.CharField(
        max_length=128,
        db_index=True,
        help_text="External request tracking ID extracted from HTTP headers."
    )

    # SHA-256 fingerprint generated from the raw JSON payload bytes.
    # Used for secondary database-level duplicate detection.
    idempotency_hash = models.CharField(
        max_length=64,
        db_index=True,
        help_text="SHA-256 hash digest of the raw payload bytes for idempotency verification."
    )

    # -----------------------------------------------------------------------------
    # 3. TIERED STORAGE POINTER (S3 / COLD ARCHIVE)
    # -----------------------------------------------------------------------------
    # Object storage path in AWS S3 or S3Mock where the unparsed raw JSON body is stored.
    # Offloading large JSON bodies keeps PostgreSQL compact and index scans fast.
    s3_payload_key = models.CharField(
        max_length=512,
        blank=True,
        null=True,
        help_text="Object key path where raw JSON body is archived in AWS S3 or S3Mock."
    )

    archive_status = models.CharField(
        max_length=32,
        choices=ArchiveStatus.choices,
        default=ArchiveStatus.NOT_STARTED,
        db_index=True,
        help_text="Durability status of raw payload copy in cold storage (S3/S3Mock)."
    )

    is_simulated = models.BooleanField(
        default=False,
        db_index=True,
        help_text="Flag indicating synthetic or simulator payload."
    )

    # -----------------------------------------------------------------------------
    # 4. PROCESSING LIFECYCLE & RETRY TRACKING
    # -----------------------------------------------------------------------------
    status = models.CharField(
        max_length=32,
        choices=ProcessingStatus.choices,
        default=ProcessingStatus.PENDING,
        db_index=True,
        help_text="Current execution status of the asynchronous ingestion pipeline."
    )

    attempt_count = models.PositiveIntegerField(
        default=0,
        help_text="Number of worker processing attempts executed."
    )

    last_attempt_at = models.DateTimeField(
        null=True,
        blank=True,
        help_text="Timestamp (UTC) of most recent processing attempt."
    )

    next_retry_at = models.DateTimeField(
        null=True,
        blank=True,
        help_text="Scheduled timestamp (UTC) for next automatic retry."
    )

    received_at = models.DateTimeField(
        auto_now_add=True,
        db_index=True,
        help_text="Exact timestamp (UTC) when the HTTP POST request reached the gateway."
    )

    error_message = models.TextField(
        blank=True,
        null=True,
        help_text="Detailed error traceback or failure reason if processing failed."
    )

    class Meta:
        verbose_name = "Ingested Payload"
        verbose_name_plural = "Ingested Payloads"
        ordering = ["-received_at"]
        # -------------------------------------------------------------------------
        # COMPOSITE B-TREE INDEXES FOR HIGH-THROUGHPUT IDEMPOTENCY & AUDITING
        # -------------------------------------------------------------------------
        indexes = [
            # 1. Per-Source Idempotency Lookup Index:
            # Speeds up: IngestedPayload.objects.filter(source=..., idempotency_hash=...)
            models.Index(
                fields=["source", "idempotency_hash"],
                name="idx_payload_src_idemp",
            ),
            # 2. Dead-Letter Processing & Ingestion Status Index:
            # Speeds up: IngestedPayload.objects.filter(status='PENDING').order_by('received_at')
            models.Index(
                fields=["status", "received_at"],
                name="idx_payload_status_rcvd",
            ),
        ]
        # -------------------------------------------------------------------------
        # DATABASE-LEVEL UNIQUE CONSTRAINT FOR IDEMPOTENT ACCEPTANCE
        # -------------------------------------------------------------------------
        constraints = [
            models.UniqueConstraint(
                fields=["source", "idempotency_hash"],
                name="unique_payload_source_idempotency",
            ),
        ]

    def __str__(self):
        """String representation displaying source slug, tracking ID, and status."""
        return f"[{self.source.slug}] {self.tracking_id} - {self.status}"

