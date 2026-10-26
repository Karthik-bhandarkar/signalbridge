"""
===================================================================================
SignalBridge Webhook Ingestion Engine — Alert & Incident Grouping Models
===================================================================================
PURPOSE:
    This module defines the core domain intelligence for alert correlation:
    1. 'Incident': High-level operational incident aggregating multiple correlated alerts
       affecting the same service with the same failure fingerprint.
    2. 'Alert': Granular individual alert records extracted from parsed webhooks.
    3. 'IncidentEvent': Immutable audit log tracking lifecycle events (creation, alert
       attachment, operator acknowledgments, and resolutions).

CONCURRENCY & DEDUPLICATION ARCHITECTURE:
    - Multiple parallel alerts for the same service and fingerprint must NOT spawn
      duplicate incidents.
    - PostgreSQL row-level locks ('select_for_update()') ensure safe incrementing of
      'alert_count' and timestamp updates under heavy race conditions.
===================================================================================
"""
# Django ORM Models Framework:
from django.db import models

# Import shared abstract base model from apps.core
from apps.core.models import TimeStampedUUIDModel

# Import IngestedPayload and WebhookSource from apps.webhooks
from apps.webhooks.models import IngestedPayload, WebhookSource


class Incident(TimeStampedUUIDModel):
    """
    Represents an operational incident grouping correlated alerts.

    An incident represents an outage or degraded service state (e.g., 'checkout-api / DB timeout').
    Multiple individual alert signals attach to a single open Incident until resolved.
    """

    class IncidentStatus(models.TextChoices):
        """Lifecycle states of an operational incident."""
        OPEN = "OPEN", "Active & Unresolved"
        ACKNOWLEDGED = "ACKNOWLEDGED", "Investigating / In Progress"
        RESOLVED = "RESOLVED", "Issue Resolved"

    class SeverityLevel(models.TextChoices):
        """Severity rankings conforming to standard SRE / PagerDuty tiers."""
        CRITICAL = "CRITICAL", "P1 - Critical Outage"
        HIGH = "HIGH", "P2 - Major Degradation"
        MEDIUM = "MEDIUM", "P3 - Moderate Impact"
        LOW = "LOW", "P4 - Informational / Low"

    # -----------------------------------------------------------------------------
    # 1. INCIDENT CORRELATION KEYS
    # -----------------------------------------------------------------------------
    # Name of the microservice reporting the failure (e.g., 'payment-service', 'auth-gateway').
    service_name = models.CharField(
        max_length=100,
        db_index=True,
        help_text="Name of the affected service or subsystem."
    )

    # Deterministic fingerprint grouping key (e.g., 'postgres-pool-exhausted').
    # Alerts sharing the same service and fingerprint attach to the same active Incident.
    fingerprint = models.CharField(
        max_length=255,
        db_index=True,
        help_text="Normalized grouping fingerprint used to correlate alerts."
    )

    # -----------------------------------------------------------------------------
    # 2. STATUS & SEVERITY
    # -----------------------------------------------------------------------------
    status = models.CharField(
        max_length=32,
        choices=IncidentStatus.choices,
        default=IncidentStatus.OPEN,
        db_index=True,
        help_text="Current operational state of this incident."
    )

    severity = models.CharField(
        max_length=32,
        choices=SeverityLevel.choices,
        default=SeverityLevel.MEDIUM,
        db_index=True,
        help_text="Highest severity level observed across all grouped alerts."
    )

    # -----------------------------------------------------------------------------
    # 3. METRICS & TIMESTAMPS
    # -----------------------------------------------------------------------------
    # Counter indicating how many distinct alerts have rolled into this incident.
    alert_count = models.PositiveIntegerField(
        default=1,
        help_text="Total number of alerts correlated into this incident."
    )

    first_seen_at = models.DateTimeField(
        auto_now_add=True,
        help_text="Exact timestamp (UTC) when the first alert triggered this incident."
    )

    last_seen_at = models.DateTimeField(
        auto_now=True,
        help_text="Exact timestamp (UTC) when the most recent alert was attached."
    )

    # -----------------------------------------------------------------------------
    # 4. RESOLUTION & TRIAGE
    # -----------------------------------------------------------------------------
    assigned_to = models.CharField(
        max_length=150,
        blank=True,
        default="",
        help_text="Operator or engineer currently assigned to investigate this incident."
    )

    resolution_notes = models.TextField(
        blank=True,
        default="",
        help_text="Summary of root cause analysis and resolution actions taken."
    )

    class Meta:
        verbose_name = "Incident"
        verbose_name_plural = "Incidents"
        ordering = ["-last_seen_at"]
        # -------------------------------------------------------------------------
        # COMPOSITE B-TREE INDEXES FOR HIGH-THROUGHPUT LOOKUPS & ROW-LOCKING
        # -------------------------------------------------------------------------
        indexes = [
            # 1. Row-Locking & Correlation Index:
            # Speeds up: Incident.objects.select_for_update().filter(service_name=..., fingerprint=..., status='OPEN')
            # Without this index, PostgreSQL performs a sequential scan over all incidents.
            models.Index(
                fields=["service_name", "fingerprint", "status"],
                name="idx_inc_svc_fp_status",
            ),
            # 2. Operator Triage Dashboard Index:
            # Speeds up: Incident.objects.filter(status='OPEN').order_by('-last_seen_at')
            models.Index(
                fields=["status", "-last_seen_at"],
                name="idx_inc_status_lastseen",
            ),
        ]

    def __str__(self):
        """String representation showing service, fingerprint, status, and count."""
        return f"[{self.status}] {self.service_name} :: {self.fingerprint} ({self.alert_count} alerts)"


class Alert(TimeStampedUUIDModel):
    """
    Represents an individual alert event parsed from an ingested webhook payload.

    Many alerts can point to a single parent Incident.
    """

    class SeverityLevel(models.TextChoices):
        """Severity rankings."""
        CRITICAL = "CRITICAL", "P1 - Critical"
        HIGH = "HIGH", "P2 - High"
        MEDIUM = "MEDIUM", "P3 - Medium"
        LOW = "LOW", "P4 - Low"

    # -----------------------------------------------------------------------------
    # 1. RELATIONSHIPS
    # -----------------------------------------------------------------------------
    # Foreign key to raw intake record:
    payload = models.ForeignKey(
        IngestedPayload,
        on_delete=models.CASCADE,
        related_name="alerts",
        null=True,
        blank=True,
        help_text="The raw ingested webhook record that yielded this alert."
    )

    # Foreign key to origin webhook source:
    source = models.ForeignKey(
        WebhookSource,
        on_delete=models.SET_NULL,
        related_name="alerts",
        null=True,
        blank=True,
        help_text="The authenticated source that delivered this alert."
    )

    # Foreign key to correlated incident:
    incident = models.ForeignKey(
        Incident,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="alerts",
        help_text="The active incident this alert was grouped into."
    )

    # -----------------------------------------------------------------------------
    # 2. IDENTIFICATION & DEDUPLICATION HASH
    # -----------------------------------------------------------------------------
    # Stable external ID provided by the vendor (e.g. Datadog event ID, PagerDuty incident ID):
    external_id = models.CharField(
        max_length=255,
        db_index=True,
        blank=True,
        default="",
        help_text="Stable vendor-supplied unique alert/event ID."
    )

    # Content hash of normalized alert fields to detect 409 Conflict:
    content_hash = models.CharField(
        max_length=64,
        db_index=True,
        blank=True,
        default="",
        help_text="SHA-256 digest of canonical alert payload content."
    )

    service_name = models.CharField(
        max_length=100,
        db_index=True,
        help_text="Microservice or host that originated the alert signal."
    )

    deduplication_hash = models.CharField(
        max_length=64,
        db_index=True,
        help_text="Unique SHA-256 hash identifying duplicate alert submissions."
    )

    fingerprint = models.CharField(
        max_length=255,
        db_index=True,
        help_text="Correlation key used to group this alert with similar active incidents."
    )

    # -----------------------------------------------------------------------------
    # 3. ALERT PAYLOAD CONTENTS
    # -----------------------------------------------------------------------------
    severity = models.CharField(
        max_length=32,
        choices=SeverityLevel.choices,
        default=SeverityLevel.MEDIUM,
        db_index=True,
        help_text="Severity tier of this individual alert."
    )

    title = models.CharField(
        max_length=255,
        help_text="Brief summary of the incident or alarm condition."
    )

    description = models.TextField(
        blank=True,
        default="",
        help_text="Extended alert details, error message, or stack summary."
    )

    # Flexible JSON metadata preserving vendor-specific attributes (e.g. host, region, metric tags).
    raw_metadata = models.JSONField(
        default=dict,
        blank=True,
        help_text="Unstructured vendor-specific attributes (tags, region, metric values)."
    )

    class Meta:
        verbose_name = "Alert"
        verbose_name_plural = "Alerts"
        ordering = ["-created_at"]
        # -------------------------------------------------------------------------
        # COMPOSITE B-TREE INDEXES FOR SUB-MILLISECOND DEDUPLICATION
        # -------------------------------------------------------------------------
        indexes = [
            # 1. Deduplication & Time-Window Correlation Index:
            # Speeds up: Alert.objects.filter(service_name=..., deduplication_hash=...).order_by('-created_at')
            # Allows O(log N) B-Tree binary search on disk instead of scanning millions of rows.
            models.Index(
                fields=["service_name", "deduplication_hash", "-created_at"],
                name="idx_alert_dedup_time",
            ),
            # 2. Grouping Query Index:
            # Speeds up: Alert.objects.filter(service_name=..., fingerprint=..., severity=...)
            models.Index(
                fields=["service_name", "fingerprint", "severity"],
                name="idx_alert_svc_fp_sev",
            ),
        ]
        # -------------------------------------------------------------------------
        # DATABASE-LEVEL UNIQUE CONSTRAINT FOR STABLE EXTERNAL IDENTITY
        # -------------------------------------------------------------------------
        constraints = [
            models.UniqueConstraint(
                fields=["source", "external_id"],
                condition=models.Q(external_id__gt=""),
                name="unique_alert_source_external_id",
            ),
        ]

    def __str__(self):
        """String representation showing title, service, and severity."""
        return f"[{self.severity}] {self.service_name}: {self.title}"


class IncidentEvent(TimeStampedUUIDModel):
    """
    Immutable audit log entry recording actions taken on an Incident.

    Tracks automated actions (e.g., Incident opened, alert attached) and
    manual human interventions (e.g., Acknowledged by operator, Resolved).
    """

    class EventType(models.TextChoices):
        """Types of auditable incident events."""
        CREATED = "CREATED", "Incident Created"
        ALERT_ATTACHED = "ALERT_ATTACHED", "Correlated Alert Attached"
        SEVERITY_ESCALATED = "SEVERITY_ESCALATED", "Severity Level Escalated"
        ACKNOWLEDGED = "ACKNOWLEDGED", "Incident Acknowledged"
        ASSIGNED = "ASSIGNED", "Incident Assigned"
        RESOLVED = "RESOLVED", "Incident Resolved"
        REOPENED = "REOPENED", "Incident Reopened"
        NOTE_ADDED = "NOTE_ADDED", "Investigation Note Added"

    # -----------------------------------------------------------------------------
    # 1. PARENT INCIDENT RELATIONSHIP
    # -----------------------------------------------------------------------------
    incident = models.ForeignKey(
        Incident,
        on_delete=models.CASCADE,
        related_name="events",
        help_text="The parent incident this event entry describes."
    )

    # -----------------------------------------------------------------------------
    # 2. EVENT METADATA
    # -----------------------------------------------------------------------------
    event_type = models.CharField(
        max_length=50,
        choices=EventType.choices,
        db_index=True,
        help_text="Category of lifecycle action taken on this incident."
    )

    description = models.TextField(
        help_text="Human-readable description of what transpired during this event."
    )

    actor = models.CharField(
        max_length=150,
        default="system",
        help_text="Entity that triggered this action ('system' or operator username)."
    )

    class Meta:
        verbose_name = "Incident Event"
        verbose_name_plural = "Incident Events"
        ordering = ["-created_at"]

    def __str__(self):
        """String representation showing incident ID and event type."""
        return f"{self.incident.id} - {self.event_type} by {self.actor}"
