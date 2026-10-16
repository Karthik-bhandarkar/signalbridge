"""
===================================================================================
SignalBridge Webhook Ingestion Engine — Webhook Admin Dashboard
===================================================================================
PURPOSE:
    Registers WebhookSource and IngestedPayload models in Django's back-office Admin
    with customized filters, search capabilities, and read-only audit fields.
===================================================================================
"""
from django.contrib import admin

from apps.webhooks.models import IngestedPayload, WebhookSource


@admin.register(WebhookSource)
class WebhookSourceAdmin(admin.ModelAdmin):
    """Admin interface for third-party alert sources and HMAC credentials."""

    list_display = (
        "name",
        "slug",
        "is_active",
        "rate_limit_per_minute",
        "created_at",
    )
    list_filter = ("is_active",)
    search_fields = ("name", "slug")
    readonly_fields = ("id", "created_at", "updated_at")
    fieldsets = (
        ("General Information", {"fields": ("id", "name", "slug", "description")}),
        ("Security Credentials", {"fields": ("secret_key",)}),
        ("Operational Limits", {"fields": ("is_active", "rate_limit_per_minute")}),
        ("Audit Metadata", {"fields": ("created_at", "updated_at")}),
    )


@admin.register(IngestedPayload)
class IngestedPayloadAdmin(admin.ModelAdmin):
    """Admin interface for inspecting raw ingested HTTP webhook envelopes."""

    list_display = (
        "tracking_id",
        "source",
        "status",
        "s3_payload_key",
        "created_at",
    )
    list_filter = ("status", "source")
    search_fields = ("tracking_id", "idempotency_hash", "s3_payload_key")
    readonly_fields = (
        "id",
        "source",
        "tracking_id",
        "idempotency_hash",
        "s3_payload_key",
        "status",
        "created_at",
        "updated_at",
    )
    ordering = ("-created_at",)
