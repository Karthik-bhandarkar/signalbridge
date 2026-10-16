"""
===================================================================================
SignalBridge Webhook Ingestion Engine — Webhook Ingestion Gateway Views
===================================================================================
PURPOSE:
    This module implements the primary high-throughput HTTP ingestion gateway endpoint:
        POST /api/v1/webhooks/<slug:source_slug>/

THE SUB-100MS ASYNCHRONOUS ACK PATTERN (Enterprise Standard):
    1. Synchronous Work (Gateway Perimeter):
       - Look up registered WebhookSource in PostgreSQL (or Redis cache).
       - Verify source is active (is_active == True).
       - Validate JSON envelope structure via DRF Serializer.
       - Calculate deterministic SHA-256 idempotency hash from raw request bytes.
       - Persist initial IngestedPayload record with status 'PENDING'.
       - Return HTTP 202 Accepted with tracking metadata in < 25-50ms.
    2. Asynchronous Work (Deferred to Celery & Background Workers):
       - Parsing vendor-specific alert fields (severity, title, timestamps).
       - Deduplication & alert incident correlation (SELECT FOR UPDATE).
       - Archiving raw JSON payload to S3 / S3Mock cold storage.

WHY HTTP 202 ACCEPTED INSTEAD OF HTTP 200 OK?
    Per RFC 9110, HTTP 202 Accepted signals that the request has been received,
    validated, and queued for execution, but processing has NOT yet completed.
    This prevents third-party webhook dispatchers (PagerDuty/Datadog) from timing
    out while complex database transactions or heavy alert groupings run.
===================================================================================
"""
# Standard Library Imports:
import hashlib
import uuid

# Django Core & Database Imports:
from django.utils import timezone

# Django REST Framework Imports:
from rest_framework import status
from rest_framework.views import APIView
from rest_framework.response import Response

# drf-spectacular for Swagger / OpenAPI 3.0 Documentation:
from drf_spectacular.utils import extend_schema, OpenApiResponse

# Domain Models & Serializers:
from apps.core.dsa.idempotency import IdempotencyManager, generate_payload_fingerprint
from apps.core.dsa.sliding_window import sliding_window_limiter
from apps.webhooks.models import WebhookSource, IngestedPayload
from apps.webhooks.serializers import (
    WebhookIngestionSerializer,
    WebhookIngestionResponseSerializer,
)
from apps.webhooks.security import verify_hmac_signature
from apps.webhooks.tasks import process_webhook

# Initialize reusable IdempotencyManager instance:
idempotency_manager = IdempotencyManager(default_ttl=60)


class WebhookIngestionAPIView(APIView):
    """
    High-Throughput Webhook Ingestion Gateway Endpoint.

    Accepts external webhook alerts from registered sources (e.g., PagerDuty, Datadog),
    authenticates payload integrity via HMAC-SHA256 cryptographic signatures,
    validates the request envelope, enforces sub-millisecond O(1) Redis idempotency
    deduplication, records the initial pending payload, and returns an immediate
    HTTP 202 Accepted response.
    """

    # Do not enforce CSRF tokens on public webhook ingestion endpoints
    authentication_classes = []
    permission_classes = []

    @extend_schema(
        summary="Ingest incoming webhook alert with HMAC verification & O(1) Redis Idempotency",
        description=(
            "Receives a raw webhook payload from a registered third-party alert producer. "
            "Enforces HMAC-SHA256 cryptographic signature authentication, validates the "
            "envelope, executes an O(1) Redis SET NX idempotency check (60s TTL), persists "
            "an initial IngestedPayload record, and returns an HTTP 202 Accepted ACK in < 100ms. "
            "Duplicate requests within 60s receive an immediate HTTP 200 OK without re-ingestion."
        ),
        request=WebhookIngestionSerializer,
        responses={
            202: OpenApiResponse(
                response=WebhookIngestionResponseSerializer,
                description="Webhook successfully authenticated, accepted, and queued for processing."
            ),
            200: OpenApiResponse(
                description="Idempotent duplicate detected within 60s window. Webhook previously accepted."
            ),
            400: OpenApiResponse(description="Malformed or empty JSON payload envelope."),
            401: OpenApiResponse(description="Missing, tampered, or mismatched HMAC signature."),
            403: OpenApiResponse(description="Webhook source is deactivated or disabled."),
            404: OpenApiResponse(description="Webhook source slug is not registered."),
            429: OpenApiResponse(description="Source burst rate limit exceeded. Retry after specified delay."),
        },
    )
    def post(self, request, source_slug):
        """
        Handles incoming HTTP POST webhook dispatches.
        """
        # -------------------------------------------------------------------------
        # STEP 1: RESOLVE WEBHOOK SOURCE FROM URL SLUG
        # -------------------------------------------------------------------------
        source = WebhookSource.objects.filter(slug=source_slug).first()
        if not source:
            return Response(
                {"error": f"Webhook source '{source_slug}' is not registered."},
                status=status.HTTP_404_NOT_FOUND,
            )

        # Operational Kill Switch Check:
        if not source.is_active:
            return Response(
                {"error": f"Webhook source '{source_slug}' is currently deactivated."},
                status=status.HTTP_403_FORBIDDEN,
            )

        # -------------------------------------------------------------------------
        # STEP 2: CRYPTOGRAPHIC HMAC-SHA256 SIGNATURE VERIFICATION
        # -------------------------------------------------------------------------
        # Header lookup supports standard vendor conventions:
        signature_header = (
            request.headers.get("X-Signature-256")
            or request.headers.get("X-Signature-SHA256")
        )
        is_valid_sig, sig_error = verify_hmac_signature(
            raw_body=request.body,
            secret_key=source.secret_key,
            header_value=signature_header,
        )
        if not is_valid_sig:
            return Response(
                {"error": "Unauthorized webhook.", "details": sig_error},
                status=status.HTTP_401_UNAUTHORIZED,
            )

        # -------------------------------------------------------------------------
        # STEP 3: SLIDING WINDOW BURST RATE LIMITING (DSA MODULE 2)
        # -------------------------------------------------------------------------
        # Protects internal databases and queues from alert storm spikes in O(1) amortized time:
        is_allowed, rate_info = sliding_window_limiter.is_allowed(
            key=source.slug,
            limit=source.rate_limit_per_minute,
            window_seconds=60,
        )
        if not is_allowed:
            resp = Response(
                {
                    "error": "Rate limit exceeded.",
                    "details": (
                        f"Webhook source '{source.slug}' exceeded burst limit of "
                        f"{rate_info['limit']} requests per 60s."
                    ),
                    "retry_after": rate_info["retry_after"],
                },
                status=status.HTTP_429_TOO_MANY_REQUESTS,
            )
            resp["Retry-After"] = str(rate_info["retry_after"])
            resp["X-RateLimit-Limit"] = str(rate_info["limit"])
            resp["X-RateLimit-Remaining"] = str(rate_info["remaining"])
            return resp

        # -------------------------------------------------------------------------
        # STEP 4: VALIDATE REQUEST ENVELOPE VIA SERIALIZER
        # -------------------------------------------------------------------------
        serializer = WebhookIngestionSerializer(data=request.data)
        if not serializer.is_valid():
            return Response(
                {"error": "Invalid webhook envelope.", "details": serializer.errors},
                status=status.HTTP_400_BAD_REQUEST,
            )

        validated_data = serializer.validated_data

        # -------------------------------------------------------------------------
        # STEP 4: EXTRACT TRACKING ID & COMPUTE DETERMINISTIC FINGERPRINT
        # -------------------------------------------------------------------------
        header_tracking_id = (
            request.headers.get("X-Tracking-Id")
            or request.headers.get("X-Request-Id")
        )
        tracking_id = header_tracking_id or validated_data.get("tracking_id") or f"trc-{uuid.uuid4().hex[:16]}"

        # Calculate deterministic SHA-256 hash digest from the raw request body bytes:
        idempotency_hash = generate_payload_fingerprint(request.body)

        # -------------------------------------------------------------------------
        # STEP 5: O(1) REDIS IN-MEMORY IDEMPOTENCY DEDUPLICATION GATE
        # -------------------------------------------------------------------------
        # Atomically check and acquire Redis lock with 60s TTL using SET NX:
        idemp_key = idempotency_manager.build_key(
            source_slug=source.slug,
            fingerprint=idempotency_hash,
        )
        is_fresh, existing_meta = idempotency_manager.check_and_set(
            key=idemp_key,
            ttl_seconds=60,
            metadata={
                "tracking_id": tracking_id,
                "first_seen_at": timezone.now().isoformat(),
                "source": source.slug,
            },
        )

        if not is_fresh:
            # DUPLICATE DETECTED: Return immediate HTTP 200 OK without database write or Celery enqueue
            return Response(
                {
                    "status": "duplicate_ignored",
                    "source": source.slug,
                    "tracking_id": (existing_meta or {}).get("tracking_id", tracking_id),
                    "idempotency_hash": idempotency_hash,
                    "message": "Idempotent duplicate detected within 60s TTL window. Webhook previously accepted.",
                },
                status=status.HTTP_200_OK,
            )

        # -------------------------------------------------------------------------
        # STEP 6: PERSIST INITIAL INGESTED PAYLOAD RECORD (PENDING STATE)
        # -------------------------------------------------------------------------
        # Fast write to PostgreSQL to ensure durability before returning ACK:
        received_timestamp = timezone.now()
        payload_record = IngestedPayload.objects.create(
            source=source,
            tracking_id=tracking_id,
            idempotency_hash=idempotency_hash,
            status=IngestedPayload.ProcessingStatus.PENDING,
        )

        # -------------------------------------------------------------------------
        # STEP 7: ASYNCHRONOUS TASK ENQUEUEING (CELERY MESSAGE BROKER)
        # -------------------------------------------------------------------------
        # Offload background normalization, grouping, and S3 cold storage to Celery worker.
        # Passing primitive string UUID to avoid stale ORM state serialization issues.
        process_webhook.delay(
            payload_id=str(payload_record.id),
            raw_payload=validated_data.get("payload"),
        )

        # -------------------------------------------------------------------------
        # STEP 8: RETURN IMMEDIATE HTTP 202 ACCEPTED (SUB-100MS ACK)
        # -------------------------------------------------------------------------
        response_payload = {
            "status": "accepted",
            "source": source.slug,
            "tracking_id": tracking_id,
            "idempotency_hash": idempotency_hash,
            "received_at": payload_record.received_at.isoformat(),
            "message": "Webhook queued for processing",
        }

        return Response(response_payload, status=status.HTTP_202_ACCEPTED)
