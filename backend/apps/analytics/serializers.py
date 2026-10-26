"""
===================================================================================
SignalBridge Webhook Ingestion Engine — Analytics Serializers
===================================================================================
PURPOSE:
    This module defines DRF serializers for serializing IngestionMetric records
    and summary aggregations for the operator dashboard and monitoring APIs.
===================================================================================
"""
from rest_framework import serializers
from apps.analytics.models import IngestionMetric


class IngestionMetricSerializer(serializers.ModelSerializer):
    """
    Serializes a single time-bucketed IngestionMetric record.
    """
    class Meta:
        model = IngestionMetric
        fields = [
            "id",
            "source_slug",
            "window_start",
            "total_received",
            "total_accepted",
            "total_duplicates",
            "total_rejected",
            "rejected_auth",
            "rejected_rate_limit",
            "rejected_malformed",
            "rejected_inactive",
            "rejected_server_error",
            "p50_latency_ms",
            "p95_latency_ms",
            "p99_latency_ms",
            "max_latency_ms",
            "created_at",
        ]
        read_only_fields = fields


class IngestionSummarySerializer(serializers.Serializer):
    """
    Serializes aggregated operational metrics across a multi-minute rolling window.
    """
    window_minutes = serializers.IntegerField(help_text="Time window analyzed in minutes.")
    total_received = serializers.IntegerField(help_text="Total requests received across window.")
    total_accepted = serializers.IntegerField(help_text="Total requests successfully accepted.")
    total_duplicates = serializers.IntegerField(help_text="Total idempotent duplicates detected.")
    total_rejected = serializers.IntegerField(help_text="Total requests rejected.")
    acceptance_rate_pct = serializers.FloatField(help_text="Percentage of requests accepted.")
    p95_latency_ms = serializers.FloatField(help_text="Aggregated 95th percentile latency in ms.")
    rejections_by_category = serializers.DictField(
        help_text="Breakdown of rejections categorized by cause."
    )
    active_sources_count = serializers.IntegerField(help_text="Number of distinct webhook sources active.")
    timestamp = serializers.DateTimeField(help_text="Current timestamp of summary evaluation.")
