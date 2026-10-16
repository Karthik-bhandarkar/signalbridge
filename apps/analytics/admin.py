"""
===================================================================================
SignalBridge Webhook Ingestion Engine — Analytics Admin Dashboard
===================================================================================
"""
from django.contrib import admin

from apps.analytics.models import IngestionMetric


@admin.register(IngestionMetric)
class IngestionMetricAdmin(admin.ModelAdmin):
    """Admin interface for observing time-window throughput and latency metrics."""

    list_display = (
        "source_slug",
        "window_start",
        "total_received",
        "total_accepted",
        "total_rejected",
        "p95_latency_ms",
    )
    list_filter = ("source_slug",)
    search_fields = ("source_slug",)
    readonly_fields = ("id", "created_at", "updated_at")
    ordering = ("-window_start",)
