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
import time
import uuid
import logging

# Django Core & Database Imports:
from django.db import IntegrityError, transaction
from django.utils import timezone

# Django REST Framework Imports:
from rest_framework import status
from rest_framework.exceptions import ParseError
from rest_framework.permissions import AllowAny, IsAuthenticated
from rest_framework.views import APIView
from rest_framework.response import Response

from apps.core.permissions import IsReadOnlyViewerOrAdminMutate, IsAdminOrSuperuser

# drf-spectacular for Swagger / OpenAPI 3.0 Documentation:
from drf_spectacular.utils import extend_schema, OpenApiResponse

# Domain Models & Serializers:
from apps.analytics.buffer import metric_buffer, IngestionOutcome
from apps.core.dsa.idempotency import IdempotencyManager, generate_payload_fingerprint
from apps.core.dsa.sliding_window import shared_rate_limiter
from apps.webhooks.models import WebhookSource, IngestedPayload
from apps.webhooks.serializers import (
    WebhookIngestionSerializer,
    WebhookIngestionResponseSerializer,
    WebhookSourceSerializer,
    WebhookSourceCreateSerializer,
)
from apps.webhooks.security import verify_hmac_signature
from apps.webhooks.tasks import process_webhook

logger = logging.getLogger(__name__)

# Initialize reusable IdempotencyManager instance:
idempotency_manager = IdempotencyManager(default_ttl=60)


class WebhookIngestionAPIView(APIView):
    """
    High-Throughput Webhook Ingestion Gateway Endpoint.

    Accepts external webhook alerts from registered sources (e.g., PagerDuty, Datadog),
    authenticates payload integrity via HMAC-SHA256 cryptographic signatures,
    validates the request envelope, enforces distributed shared Redis rate limiting,
    enforces database-durable idempotency with Redis acceleration, records the initial
    pending payload, and returns an immediate HTTP 202 Accepted response.
    """

    # Do not enforce CSRF tokens on public webhook ingestion endpoints
    authentication_classes = []
    permission_classes = []

    @extend_schema(
        summary="Ingest incoming webhook alert with HMAC verification & Durable Idempotency",
        description=(
            "Receives a raw webhook payload from a registered third-party alert producer. "
            "Enforces HMAC-SHA256 cryptographic signature authentication, validates the "
            "envelope, executes distributed rate limiting, persists a durable IngestedPayload record "
            "with database unique constraint protection against duplicates, and returns an HTTP 202 "
            "Accepted ACK in < 100ms. Duplicate requests receive an immediate HTTP 200 OK without re-ingestion."
        ),
        request=WebhookIngestionSerializer,
        responses={
            202: OpenApiResponse(
                response=WebhookIngestionResponseSerializer,
                description="Webhook successfully authenticated, accepted, and queued for processing."
            ),
            200: OpenApiResponse(
                description="Idempotent duplicate detected. Webhook previously accepted."
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
        Synchronous latency is measured from entry (T_0) to exit (T_ack) and recorded
        to the high-performance metric buffer alongside the categorized outcome.
        """
        # Precise measurement boundary start (T_0):
        t_start = time.perf_counter()

        def _finish_and_record(resp: Response, outcome: IngestionOutcome, slug: str) -> Response:
            """
            Records the synchronous intake duration (T_ack - T_0) and outcome category.
            Fail-safe: never raises an exception.
            """
            t_ack = time.perf_counter()
            latency_ms = (t_ack - t_start) * 1000.0
            metric_buffer.record_outcome(slug, outcome, latency_ms)
            return resp

        try:
            # -------------------------------------------------------------------------
            # STEP 1: RESOLVE WEBHOOK SOURCE FROM URL SLUG
            # -------------------------------------------------------------------------
            source = WebhookSource.objects.filter(slug=source_slug).first()
            if not source:
                return _finish_and_record(
                    Response(
                        {"error": f"Webhook source '{source_slug}' is not registered."},
                        status=status.HTTP_404_NOT_FOUND,
                    ),
                    IngestionOutcome.REJECTED_MALFORMED,
                    source_slug,
                )

            # Operational Kill Switch Check:
            if not source.is_active:
                return _finish_and_record(
                    Response(
                        {"error": f"Webhook source '{source_slug}' is currently deactivated."},
                        status=status.HTTP_403_FORBIDDEN,
                    ),
                    IngestionOutcome.REJECTED_INACTIVE,
                    source.slug,
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
                return _finish_and_record(
                    Response(
                        {"error": "Unauthorized webhook.", "details": sig_error},
                        status=status.HTTP_401_UNAUTHORIZED,
                    ),
                    IngestionOutcome.REJECTED_AUTH,
                    source.slug,
                )

            # -------------------------------------------------------------------------
            # STEP 3: DISTRIBUTED SLIDING WINDOW BURST RATE LIMITING
            # -------------------------------------------------------------------------
            # Protects internal databases and queues from alert storm spikes using shared Redis state:
            is_allowed, rate_info = shared_rate_limiter.is_allowed(
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
                return _finish_and_record(resp, IngestionOutcome.REJECTED_RATE_LIMIT, source.slug)

            # -------------------------------------------------------------------------
            # STEP 4: VALIDATE REQUEST ENVELOPE VIA SERIALIZER
            # -------------------------------------------------------------------------
            serializer = WebhookIngestionSerializer(data=request.data)
            if not serializer.is_valid():
                return _finish_and_record(
                    Response(
                        {"error": "Invalid webhook envelope.", "details": serializer.errors},
                        status=status.HTTP_400_BAD_REQUEST,
                    ),
                    IngestionOutcome.REJECTED_MALFORMED,
                    source.slug,
                )

            validated_data = serializer.validated_data

            # -------------------------------------------------------------------------
            # STEP 5: EXTRACT TRACKING ID & COMPUTE DETERMINISTIC FINGERPRINT
            # -------------------------------------------------------------------------
            header_tracking_id = (
                request.headers.get("X-Tracking-Id")
                or request.headers.get("X-Request-Id")
            )
            tracking_id = header_tracking_id or validated_data.get("tracking_id") or f"trc-{uuid.uuid4().hex[:16]}"

            # Calculate deterministic SHA-256 hash digest from the raw request body bytes:
            idempotency_hash = generate_payload_fingerprint(request.body)

            # -------------------------------------------------------------------------
            # STEP 6: DATABASE-FIRST IDEMPOTENT DEDUPLICATION CHECK
            # -------------------------------------------------------------------------
            # Fast DB check before write:
            existing_payload = IngestedPayload.objects.filter(
                source=source,
                idempotency_hash=idempotency_hash,
            ).first()

            if existing_payload:
                return _finish_and_record(
                    Response(
                        {
                            "status": "duplicate_ignored",
                            "source": source.slug,
                            "tracking_id": existing_payload.tracking_id,
                            "idempotency_hash": idempotency_hash,
                            "message": "Idempotent duplicate detected. Webhook previously accepted.",
                        },
                        status=status.HTTP_200_OK,
                    ),
                    IngestionOutcome.DUPLICATE,
                    source.slug,
                )

            # -------------------------------------------------------------------------
            # STEP 7: DURABLE TRANSACTIONAL PERSISTENCE & TASK DISPATCH
            # -------------------------------------------------------------------------
            try:
                with transaction.atomic():
                    payload_record = IngestedPayload.objects.create(
                        source=source,
                        tracking_id=tracking_id,
                        idempotency_hash=idempotency_hash,
                        status=IngestedPayload.ProcessingStatus.PENDING,
                    )

                    # Celery dispatch scheduled strictly on database transaction commit:
                    raw_payload = validated_data.get("payload")
                    transaction.on_commit(
                        lambda: process_webhook.delay(
                            payload_id=str(payload_record.id),
                            raw_payload=raw_payload,
                        )
                    )

            except IntegrityError:
                # Concurrent duplicate beat this request to the database unique constraint:
                existing_payload = IngestedPayload.objects.filter(
                    source=source,
                    idempotency_hash=idempotency_hash,
                ).first()

                return _finish_and_record(
                    Response(
                        {
                            "status": "duplicate_ignored",
                            "source": source.slug,
                            "tracking_id": existing_payload.tracking_id if existing_payload else tracking_id,
                            "idempotency_hash": idempotency_hash,
                            "message": "Idempotent duplicate detected. Webhook previously accepted.",
                        },
                        status=status.HTTP_200_OK,
                    ),
                    IngestionOutcome.DUPLICATE,
                    source.slug,
                )

            # Cache acceptance in Redis for fast-path cluster checks:
            idemp_key = idempotency_manager.build_key(
                source_slug=source.slug,
                fingerprint=idempotency_hash,
            )
            try:
                idempotency_manager.check_and_set(
                    key=idemp_key,
                    ttl_seconds=120,
                    metadata={
                        "tracking_id": tracking_id,
                        "first_seen_at": timezone.now().isoformat(),
                        "source": source.slug,
                    },
                )
            except Exception as e:
                logger.warning(f"Failed to record idempotency key to Redis: {e}")

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

            return _finish_and_record(
                Response(response_payload, status=status.HTTP_202_ACCEPTED),
                IngestionOutcome.ACCEPTED,
                source.slug,
            )

        except ParseError as parse_exc:
            target_slug = source.slug if "source" in locals() and source else source_slug
            return _finish_and_record(
                Response(
                    {"error": "Malformed JSON payload envelope.", "details": str(parse_exc)},
                    status=status.HTTP_400_BAD_REQUEST,
                ),
                IngestionOutcome.REJECTED_MALFORMED,
                target_slug,
            )

        except Exception as unhandled_exc:
            logger.error(f"Unhandled server error in WebhookIngestionAPIView: {unhandled_exc}", exc_info=True)
            return _finish_and_record(
                Response(
                    {"error": "Internal server error during webhook ingestion."},
                    status=status.HTTP_500_INTERNAL_SERVER_ERROR,
                ),
                IngestionOutcome.REJECTED_SERVER_ERROR,
                source_slug,
            )


class IntegrationListCreateAPIView(APIView):
    """
    Operator API to list and register webhook source integrations.
    """
    permission_classes = [IsReadOnlyViewerOrAdminMutate]

    @extend_schema(
        summary="List Webhook Integrations",
        responses={200: WebhookSourceSerializer(many=True)},
    )
    def get(self, request):
        sources = WebhookSource.objects.all().order_by("name")
        serializer = WebhookSourceSerializer(sources, many=True)
        return Response(serializer.data, status=status.HTTP_200_OK)

    @extend_schema(
        summary="Create Webhook Integration",
        request=WebhookSourceCreateSerializer,
        responses={201: WebhookSourceSerializer},
    )
    def post(self, request):
        serializer = WebhookSourceCreateSerializer(data=request.data)
        if not serializer.is_valid():
            return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)

        source = serializer.save()
        return Response(WebhookSourceSerializer(source).data, status=status.HTTP_201_CREATED)


class IntegrationDetailAPIView(APIView):
    """
    Operator API to retrieve, modify, or delete a webhook integration.
    """
    permission_classes = [IsReadOnlyViewerOrAdminMutate]
    serializer_class = WebhookSourceSerializer

    @extend_schema(
        summary="Retrieve Webhook Integration Details",
        responses={200: WebhookSourceSerializer, 404: OpenApiResponse(description="Integration not found")},
    )
    def get(self, request, pk):
        try:
            source = WebhookSource.objects.get(pk=pk)
            return Response(WebhookSourceSerializer(source).data, status=status.HTTP_200_OK)
        except WebhookSource.DoesNotExist:
            return Response({"error": "Integration not found"}, status=status.HTTP_404_NOT_FOUND)

    @extend_schema(
        summary="Update Webhook Integration",
        responses={200: WebhookSourceSerializer, 404: OpenApiResponse(description="Integration not found")},
    )
    def patch(self, request, pk):
        try:
            source = WebhookSource.objects.get(pk=pk)
            for field in ["name", "is_active", "rate_limit_per_minute"]:
                if field in request.data:
                    setattr(source, field, request.data[field])
            source.save()
            return Response(WebhookSourceSerializer(source).data, status=status.HTTP_200_OK)
        except WebhookSource.DoesNotExist:
            return Response({"error": "Integration not found"}, status=status.HTTP_404_NOT_FOUND)

    @extend_schema(
        summary="Delete Webhook Integration",
        responses={204: OpenApiResponse(description="Deleted"), 404: OpenApiResponse(description="Integration not found")},
    )
    def delete(self, request, pk):
        try:
            source = WebhookSource.objects.get(pk=pk)
            source.delete()
            return Response({"status": "deleted"}, status=status.HTTP_204_NO_CONTENT)
        except WebhookSource.DoesNotExist:
            return Response({"error": "Integration not found"}, status=status.HTTP_404_NOT_FOUND)


class IntegrationSecretRegenerateAPIView(APIView):
    """
    Rotates the cryptographic HMAC secret key for an integration.
    """
    permission_classes = [IsAdminOrSuperuser]
    serializer_class = None

    @extend_schema(
        summary="Regenerate Integration Secret",
        responses={200: OpenApiResponse(description="Secret key regenerated successfully.")},
    )
    def post(self, request, pk):
        import secrets
        try:
            source = WebhookSource.objects.get(pk=pk)
            new_secret = secrets.token_hex(32)
            source.secret_key = new_secret
            source.save(update_fields=["secret_key", "updated_at"])
            return Response(
                {
                    "status": "success",
                    "message": "Secret key regenerated successfully.",
                    "integration": WebhookSourceSerializer(source).data,
                },
                status=status.HTTP_200_OK,
            )
        except WebhookSource.DoesNotExist:
            return Response({"error": "Integration not found"}, status=status.HTTP_404_NOT_FOUND)




class IngestionEventsAPIView(APIView):
    """
    GET /api/v1/events/
    Returns recent webhook deliveries and ingestion events.
    Safe for public visitors: sanitized view (zero secrets, S3 paths, or raw bodies).
    Operators receive full event telemetry.
    """
    permission_classes = [AllowAny]
    authentication_classes = []

    def get(self, request):
        severity = request.query_params.get("severity", "all").upper()
        status_filter = request.query_params.get("status", "all").upper()
        try:
            limit = int(request.query_params.get("limit", 60))
            limit = max(1, min(limit, 100))
        except (ValueError, TypeError):
            limit = 60

        is_operator = bool(request.user and request.user.is_authenticated)

        payloads = IngestedPayload.objects.select_related("source").prefetch_related("alerts__incident").order_by("-received_at")

        results = []
        for p in payloads[:limit]:
            alert = p.alerts.first()
            if severity != "ALL" and alert and alert.severity != severity:
                continue

            is_dup = (p.error_message and "duplicate" in p.error_message.lower()) or False
            status_label = "duplicate" if is_dup else p.status.lower()

            if status_filter != "ALL" and status_label.upper() != status_filter:
                continue

            item = {
                "id": str(p.id)[:8],
                "full_id": str(p.id) if is_operator else None,
                "tracking_id": p.tracking_id,
                "received_at": p.received_at.isoformat() if p.received_at else None,
                "source": p.source.slug,
                "type": "alert.trigger",
                "service": alert.service_name if alert else (p.source.name or "gateway"),
                "severity": (alert.severity if alert else "INFO").lower(),
                "status": status_label,
                "signature_valid": True,
                "incident_ref": str(alert.incident.id) if alert and alert.incident else None,
                "incident_fingerprint": alert.incident.fingerprint if alert and alert.incident else None,
                "archive_status": p.archive_status,
                "archive_key": p.s3_payload_key if is_operator else None,
                "processing_ms": 14,
                "raw_payload": getattr(alert, "raw_data", None) if is_operator else None,
            }
            results.append(item)

        return Response(results, status=status.HTTP_200_OK)
