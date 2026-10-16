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
    """

    # Source slug being measured (e.g., 'pagerduty', 'datadog')
    source_slug = models.CharField(
        max_length=100,
        db_index=True,
        help_text="The webhook source identifier being measured."
    )

    # Aggregation window (UTC timestamp at top of the minute or hour)
    window_start = models.DateTimeField(
        db_index=True,
        help_text="Start timestamp (UTC) of this aggregation window."
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

    total_rejected = models.PositiveIntegerField(
        default=0,
        help_text="Total number of requests rejected (401 Auth, 429 Rate Limit, 400 Bad Request)."
    )

    # Latency tracking
    p95_latency_ms = models.FloatField(
        default=0.0,
        help_text="95th percentile HTTP response latency in milliseconds."
    )

    class Meta:
        verbose_name = "Ingestion Metric"
        verbose_name_plural = "Ingestion Metrics"
        ordering = ["-window_start"]

    def __str__(self):
        return f"[{self.source_slug}] {self.window_start.isoformat()} - {self.total_received} reqs"
