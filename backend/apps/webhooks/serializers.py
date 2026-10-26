"""
===================================================================================
SignalBridge Webhook Ingestion Engine — Webhook Enveloping & Serializers
===================================================================================
PURPOSE:
    This module defines the Django REST Framework (DRF) serializers responsible for
    validating incoming HTTP webhook envelopes and generating OpenAPI response schemas.

ARCHITECTURAL PRINCIPLES:
    1. Schema Decoupling: In high-throughput ingestion gateways, third-party alert
       producers (PagerDuty, Datadog, Sentry, Prometheus) send vastly different JSON
       structures. We validate the top-level request envelope (tracking ID, event type)
       and accept the inner payload as flexible JSON without discarding vendor metadata.
    2. Strict Envelope Validation: Ensures that malformed, empty, or non-JSON payloads
       are rejected at the gateway perimeter with HTTP 400 Bad Request before hitting
       asynchronous Celery queues or storage layers.
===================================================================================
"""
# Standard Library Imports:
import uuid

# Django REST Framework Serializers:
from rest_framework import serializers

# drf-spectacular for OpenAPI 3.0 Documentation Schemas:
from drf_spectacular.utils import extend_schema_serializer, OpenApiExample


class WebhookIngestionSerializer(serializers.Serializer):
    """
    Validates incoming raw webhook payload envelopes.

    Accepts raw alert data from external producers (e.g., PagerDuty, Datadog),
    extracts or generates a client tracking ID, and validates structural integrity.
    """

    # -----------------------------------------------------------------------------
    # 1. TRACKING & EVENT IDENTIFIERS
    # -----------------------------------------------------------------------------
    # Optional client-supplied tracking ID (e.g. from upstream distributed tracing).
    # If omitted by the client, the view automatically generates a unique UUIDv4.
    tracking_id = serializers.CharField(
        max_length=128,
        required=False,
        allow_blank=True,
        help_text="Optional upstream tracking or request correlation ID (e.g., 'alert-req-90812')."
    )

    # Category of alert event (e.g. 'incident.trigger', 'alert.resolve', 'metric.threshold')
    event_type = serializers.CharField(
        max_length=100,
        required=False,
        default="alert.trigger",
        help_text="Vendor-specific event classification string."
    )

    # -----------------------------------------------------------------------------
    # 2. RAW PAYLOAD CONTAINER
    # -----------------------------------------------------------------------------
    # Holds the full, unparsed vendor payload dictionary or list.
    payload = serializers.JSONField(
        required=True,
        help_text="The arbitrary raw JSON payload sent by the webhook producer."
    )

    def validate_payload(self, value):
        """
        Validates that the inner payload is a non-empty dictionary or list.
        """
        if not value:
            raise serializers.ValidationError("Webhook payload cannot be empty.")
        if not isinstance(value, (dict, list)):
            raise serializers.ValidationError("Webhook payload must be a valid JSON object or list.")
        return value

    def validate(self, attrs):
        """
        Envelope-level cross-field validation.
        Ensures a tracking_id is guaranteed to exist.
        """
        if not attrs.get("tracking_id"):
            attrs["tracking_id"] = f"trc-{uuid.uuid4().hex[:16]}"
        return attrs


class WebhookIngestionResponseSerializer(serializers.Serializer):
    """
    Serializes the HTTP 202 Accepted response payload returned by the gateway.
    Used for automated OpenAPI 3.0 Swagger schema documentation.
    """

    status = serializers.CharField(
        default="accepted",
        help_text="Status acknowledging successful receipt and queuing of the webhook."
    )

    source = serializers.CharField(
        help_text="URL slug of the authenticated webhook source (e.g., 'pagerduty')."
    )

    tracking_id = serializers.CharField(
        help_text="Unique tracking ID assigned to this ingestion lifecycle."
    )

    idempotency_hash = serializers.CharField(
        help_text="SHA-256 fingerprint generated from the raw payload body for deduplication."
    )

    received_at = serializers.DateTimeField(
        help_text="UTC timestamp when the gateway received and recorded the webhook."
    )

    message = serializers.CharField(
        default="Webhook queued for processing",
        help_text="Human-readable processing confirmation."
    )


class WebhookSourceSerializer(serializers.ModelSerializer):
    """Serializer for managing webhook source integrations in the operator dashboard."""
    total_payloads = serializers.IntegerField(source="payloads.count", read_only=True)

    class Meta:
        from apps.webhooks.models import WebhookSource
        model = WebhookSource
        fields = [
            "id",
            "name",
            "slug",
            "secret_key",
            "is_active",
            "rate_limit_per_minute",
            "total_payloads",
            "created_at",
            "updated_at",
        ]
        read_only_fields = ["id", "created_at", "updated_at", "total_payloads"]


class WebhookSourceCreateSerializer(serializers.ModelSerializer):
    """Serializer for registering a new webhook source integration."""
    class Meta:
        from apps.webhooks.models import WebhookSource
        model = WebhookSource
        fields = [
            "name",
            "slug",
            "secret_key",
            "is_active",
            "rate_limit_per_minute",
        ]
        extra_kwargs = {
            "secret_key": {"required": False},
        }

    def create(self, validated_data):
        import secrets
        from apps.webhooks.models import WebhookSource
        if not validated_data.get("secret_key"):
            validated_data["secret_key"] = secrets.token_hex(32)
        return WebhookSource.objects.create(**validated_data)

