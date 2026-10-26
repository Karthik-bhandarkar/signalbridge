"""
===================================================================================
SignalBridge — Outbound Incident Notification Models
===================================================================================
PURPOSE:
    Manages outbound notification channels (Webhooks, Slack, PagerDuty, Console)
    and tracks delivery audit history for all lifecycle incident transitions.
===================================================================================
"""
from django.db import models
from apps.core.models import TimeStampedUUIDModel
from apps.alerts.models import Incident


class NotificationDestination(TimeStampedUUIDModel):
    """
    Configured destination where alerts and incident state transitions are dispatched.
    """
    class DestinationType(models.TextChoices):
        WEBHOOK = "WEBHOOK", "Generic Outbound Webhook (HTTP POST)"
        SLACK = "SLACK", "Slack Incoming Webhook"
        PAGERDUTY = "PAGERDUTY", "PagerDuty Events API v2"
        CONSOLE = "CONSOLE", "Local Console / Mock Delivery"

    name = models.CharField(max_length=128, help_text="Destination label (e.g. 'Primary On-Call Slack')")
    destination_type = models.CharField(
        max_length=32,
        choices=DestinationType.choices,
        default=DestinationType.CONSOLE,
        help_text="Integration delivery adapter type"
    )
    endpoint_url = models.CharField(
        max_length=512,
        blank=True,
        default="",
        help_text="Target URL for HTTP POST webhook deliveries"
    )
    auth_header = models.CharField(
        max_length=255,
        blank=True,
        default="",
        help_text="Optional Authorization header value (e.g. 'Bearer token')"
    )
    is_active = models.BooleanField(
        default=True,
        db_index=True,
        help_text="Enables or disables notification dispatch"
    )

    class Meta:
        ordering = ["name"]
        verbose_name = "Notification Destination"
        verbose_name_plural = "Notification Destinations"

    def __str__(self):
        return f"[{self.destination_type}] {self.name}"


class NotificationDelivery(TimeStampedUUIDModel):
    """
    Audit log of an individual outbound notification dispatch attempt.
    """
    class DeliveryStatus(models.TextChoices):
        DELIVERED = "DELIVERED", "Delivered Successfully"
        FAILED = "FAILED", "Delivery Failed"

    incident = models.ForeignKey(
        Incident,
        on_delete=models.CASCADE,
        related_name="notification_deliveries"
    )
    destination = models.ForeignKey(
        NotificationDestination,
        on_delete=models.CASCADE,
        related_name="deliveries"
    )
    status = models.CharField(max_length=32, choices=DeliveryStatus.choices, db_index=True)
    event_type = models.CharField(max_length=64, help_text="e.g. 'INCIDENT_OPENED', 'RESOLVED'")
    payload_snapshot = models.JSONField(help_text="Snapshot of JSON payload dispatched")
    response_status_code = models.IntegerField(null=True, blank=True)
    error_message = models.TextField(blank=True, default="")
    delivered_at = models.DateTimeField(auto_now_add=True, db_index=True)

    class Meta:
        ordering = ["-delivered_at"]
        verbose_name = "Notification Delivery"
        verbose_name_plural = "Notification Deliveries"

    def __str__(self):
        return f"[{self.status}] {self.destination.name} - Incident {self.incident.id} ({self.event_type})"
