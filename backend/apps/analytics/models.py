"""
===================================================================================
SignalBridge Webhook Ingestion Engine — Analytics & Performance Metric Models
===================================================================================
PURPOSE:
    This module defines models responsible for tracking system health, ingestion
    velocity, p95 latencies, and dead-letter queue (DLQ) anomalies.

METRICS TRACKED:
    - Ingestion volume per time bucket (minute / hour).
    - Rate-limit rejections and HMAC cryptographic authentication failures.
    - Dead-letter queue counter for manual inspection.
===================================================================================
"""
# Django ORM Models Framework:
from django.db import models

# Import shared abstract base model from apps.core
from apps.core.models import TimeStampedUUIDModel


class IngestionMetric(TimeStampedUUIDModel):
    """
    Aggregated operational performance metric record for high-throughput monitoring.
    Captures volume counters, duplicate detections, categorized rejections, and latency percentiles
    over minute-aligned time windows.
    """

    # Source slug being measured (e.g., 'pagerduty', 'datadog')
    source_slug = models.CharField(
        max_length=100,
        db_index=True,
        help_text="The webhook source identifier being measured."
    )

    # Aggregation window (UTC timestamp at top of the minute, e.g. 2026-10-24 18:00:00)
    window_start = models.DateTimeField(
        db_index=True,
        help_text="Start timestamp (UTC) of this minute aggregation window."
    )

    # Volume counters
    total_received = models.PositiveIntegerField(
        default=0,
        help_text="Total number of HTTP requests received in this window."
    )

    total_accepted = models.PositiveIntegerField(
        default=0,
        help_text="Total number of valid requests queued (HTTP 202)."
    )

    total_duplicates = models.PositiveIntegerField(
        default=0,
        help_text="Total duplicate requests recognized via idempotency (HTTP 200)."
    )

    total_rejected = models.PositiveIntegerField(
        default=0,
        help_text="Total number of requests rejected across all rejection categories."
    )

    # Categorized Rejection Counters:
    rejected_auth = models.PositiveIntegerField(
        default=0,
        help_text="Total signature or credential verification failures (HTTP 401)."
    )

    rejected_rate_limit = models.PositiveIntegerField(
        default=0,
        help_text="Total requests rejected due to rate limiting (HTTP 429)."
    )

    rejected_malformed = models.PositiveIntegerField(
        default=0,
        help_text="Total malformed payloads or missing required fields/envelope (HTTP 400)."
    )

    rejected_inactive = models.PositiveIntegerField(
        default=0,
        help_text="Total requests rejected because integration source is deactivated (HTTP 403)."
    )

    rejected_server_error = models.PositiveIntegerField(
        default=0,
        help_text="Total server internal errors during ingestion (HTTP 500)."
    )

    # Latency distribution percentiles (Calculated from true sample distribution in ms):
    p50_latency_ms = models.FloatField(
        default=0.0,
        help_text="50th percentile (median) HTTP response latency in milliseconds."
    )

    p95_latency_ms = models.FloatField(
        default=0.0,
        help_text="95th percentile HTTP response latency in milliseconds."
    )

    p99_latency_ms = models.FloatField(
        default=0.0,
        help_text="99th percentile HTTP response latency in milliseconds."
    )

    max_latency_ms = models.FloatField(
        default=0.0,
        help_text="Maximum HTTP response latency observed in milliseconds."
    )

    class Meta:
        verbose_name = "Ingestion Metric"
        verbose_name_plural = "Ingestion Metrics"
        ordering = ["-window_start"]
        constraints = [
            models.UniqueConstraint(
                fields=["source_slug", "window_start"],
                name="unique_source_window_metric",
            )
        ]
        indexes = [
            models.Index(
                fields=["source_slug", "-window_start"],
                name="idx_metric_src_window",
            )
        ]

    def __str__(self):
        return f"[{self.source_slug}] {self.window_start.isoformat()} - {self.total_received} reqs (p95: {self.p95_latency_ms:.1f}ms)"
