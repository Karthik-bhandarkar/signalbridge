"""
===================================================================================
SignalBridge — Active Synthetic Monitoring Models
===================================================================================
PURPOSE:
    Provides continuous active health probing of upstream microservices and endpoints.
    Detects outages before customers report them by running synthetic HTTP/TCP probes,
    measuring round-trip latencies, tracking consecutive failures, and automatically
    triggering incident creation when thresholds are breached.
===================================================================================
"""
from django.db import models
from apps.core.models import TimeStampedUUIDModel


class Service(TimeStampedUUIDModel):
    """
    Represents an internal or external microservice monitored by SignalBridge.
    """
    class ServiceTier(models.TextChoices):
        TIER_0_CRITICAL = "TIER_0", "Tier 0 (Mission Critical)"
        TIER_1_STANDARD = "TIER_1", "Tier 1 (Core Business)"
        TIER_2_INTERNAL = "TIER_2", "Tier 2 (Internal / Support)"

    name = models.CharField(max_length=128, unique=True, help_text="Human-readable service name (e.g. 'Checkout API')")
    slug = models.SlugField(max_length=128, unique=True, help_text="Canonical identifier (e.g. 'checkout-api')")
    description = models.TextField(blank=True, default="", help_text="Overview of service responsibilities and architecture")
    tier = models.CharField(
        max_length=32,
        choices=ServiceTier.choices,
        default=ServiceTier.TIER_1_STANDARD,
        help_text="Operational priority tier"
    )
    is_active = models.BooleanField(default=True, db_index=True, help_text="Controls whether active health checks execute")

    class Meta:
        ordering = ["name"]
        verbose_name = "Monitored Service"
        verbose_name_plural = "Monitored Services"

    def __str__(self):
        return f"{self.name} ({self.slug})"


class Monitor(TimeStampedUUIDModel):
    """
    Synthetic check definition configured for a service.
    """
    class MonitorType(models.TextChoices):
        HTTP_GET = "HTTP_GET", "HTTP GET Probe"
        HTTP_POST = "HTTP_POST", "HTTP POST Heartbeat"
        TCP_PORT = "TCP_PORT", "TCP Port Connectivity"
        SSL_CERT = "SSL_CERT", "SSL Certificate Expiry"

    class HealthStatus(models.TextChoices):
        UP = "UP", "Healthy / Operational"
        DEGRADED = "DEGRADED", "Degraded / High Latency"
        DOWN = "DOWN", "Down / Unreachable"
        UNKNOWN = "UNKNOWN", "Unknown / Not Checked"

    service = models.ForeignKey(
        Service,
        on_delete=models.CASCADE,
        related_name="monitors",
        help_text="Parent service being probed by this monitor"
    )
    name = models.CharField(max_length=128, help_text="Descriptive probe name (e.g. 'Primary Healthz')")
    monitor_type = models.CharField(max_length=32, choices=MonitorType.choices, default=MonitorType.HTTP_GET)
    target_url = models.CharField(max_length=512, help_text="Target URL or host:port to probe")

    interval_seconds = models.PositiveIntegerField(default=60, help_text="Probe frequency in seconds")
    timeout_seconds = models.PositiveIntegerField(default=5, help_text="Probe HTTP socket timeout in seconds")
    failure_threshold = models.PositiveIntegerField(
        default=3,
        help_text="Consecutive probe failures required before creating an Incident"
    )

    current_status = models.CharField(
        max_length=32,
        choices=HealthStatus.choices,
        default=HealthStatus.UNKNOWN,
        db_index=True
    )
    consecutive_failures = models.PositiveIntegerField(default=0)
    last_response_time_ms = models.FloatField(default=0.0)
    last_checked_at = models.DateTimeField(null=True, blank=True)
    is_active = models.BooleanField(default=True, db_index=True)

    class Meta:
        ordering = ["service", "name"]
        verbose_name = "Synthetic Monitor"
        verbose_name_plural = "Synthetic Monitors"

    def __str__(self):
        return f"[{self.current_status}] {self.service.slug} - {self.name}"


class MonitorCheckResult(TimeStampedUUIDModel):
    """
    Time-series result entry for every probe executed.
    """
    monitor = models.ForeignKey(
        Monitor,
        on_delete=models.CASCADE,
        related_name="check_results"
    )
    status = models.CharField(max_length=32, choices=Monitor.HealthStatus.choices)
    response_time_ms = models.FloatField(default=0.0)
    status_code = models.IntegerField(null=True, blank=True)
    error_message = models.TextField(blank=True, default="")
    checked_at = models.DateTimeField(auto_now_add=True, db_index=True)

    class Meta:
        ordering = ["-checked_at"]
        indexes = [
            models.Index(fields=["monitor", "-checked_at"], name="idx_check_monitor_time"),
        ]

    def __str__(self):
        return f"{self.monitor.name} @ {self.checked_at.isoformat()}: {self.status} ({self.response_time_ms:.1f}ms)"
