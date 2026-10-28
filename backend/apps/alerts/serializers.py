"""
===================================================================================
SignalBridge — Alert & Incident Serializers
===================================================================================
PURPOSE:
    Provides validation, serialization, and deserialization for:
      - Incidents (list, detail, status updates, assignments)
      - Alerts (list, detail, retry)
      - IncidentEvents (immutable lifecycle audit trail)
===================================================================================
"""
from rest_framework import serializers
from apps.alerts.models import Alert, Incident, IncidentEvent


class IncidentEventSerializer(serializers.ModelSerializer):
    """Serializer for immutable incident timeline audit events."""
    class Meta:
        model = IncidentEvent
        fields = [
            "id",
            "event_type",
            "description",
            "actor",
            "created_at",
        ]
        read_only_fields = fields


class AlertSummarySerializer(serializers.ModelSerializer):
    """Compact serializer for alerts embedded inside incident details or alert lists."""
    tracking_id = serializers.CharField(source="payload.tracking_id", read_only=True)
    source_slug = serializers.CharField(source="source.slug", read_only=True, default="")
    source_name = serializers.CharField(source="source.name", read_only=True, default="")

    class Meta:
        model = Alert
        fields = [
            "id",
            "service_name",
            "fingerprint",
            "severity",
            "title",
            "external_id",
            "deduplication_hash",
            "content_hash",
            "source_slug",
            "source_name",
            "tracking_id",
            "created_at",
        ]
        read_only_fields = fields


class AlertDetailSerializer(serializers.ModelSerializer):
    """Full detail serializer for an individual Alert including payload and raw metadata."""
    tracking_id = serializers.CharField(source="payload.tracking_id", read_only=True)
    source_slug = serializers.CharField(source="source.slug", read_only=True, default="")
    source_name = serializers.CharField(source="source.name", read_only=True, default="")
    archive_status = serializers.CharField(source="payload.archive_status", read_only=True, default="")
    s3_payload_key = serializers.CharField(source="payload.s3_payload_key", read_only=True, default="")

    class Meta:
        model = Alert
        fields = [
            "id",
            "incident",
            "service_name",
            "fingerprint",
            "severity",
            "title",
            "description",
            "external_id",
            "deduplication_hash",
            "content_hash",
            "raw_metadata",
            "source_slug",
            "source_name",
            "tracking_id",
            "archive_status",
            "s3_payload_key",
            "created_at",
            "updated_at",
        ]
        read_only_fields = fields


class IncidentListSerializer(serializers.ModelSerializer):
    """High-throughput list serializer for operator incident tables."""
    duration_seconds = serializers.SerializerMethodField()

    class Meta:
        model = Incident
        fields = [
            "id",
            "service_name",
            "fingerprint",
            "status",
            "severity",
            "alert_count",
            "assigned_to",
            "source_slug",
            "is_simulated",
            "acknowledged_at",
            "resolved_at",
            "first_seen_at",
            "last_seen_at",
            "created_at",
            "updated_at",
            "duration_seconds",
        ]
        read_only_fields = fields

    def get_duration_seconds(self, obj) -> float:
        if obj.first_seen_at and obj.last_seen_at:
            return round((obj.last_seen_at - obj.first_seen_at).total_seconds(), 1)
        return 0.0


class IncidentDetailSerializer(serializers.ModelSerializer):
    """Detailed incident serializer with correlated alerts and chronological timeline events."""
    alerts = AlertSummarySerializer(many=True, read_only=True)
    events = IncidentEventSerializer(many=True, read_only=True)

    class Meta:
        model = Incident
        fields = [
            "id",
            "service_name",
            "fingerprint",
            "status",
            "severity",
            "alert_count",
            "assigned_to",
            "source_slug",
            "is_simulated",
            "acknowledged_at",
            "resolved_at",
            "resolution_notes",
            "first_seen_at",
            "last_seen_at",
            "created_at",
            "updated_at",
            "alerts",
            "events",
        ]
        read_only_fields = fields


class IncidentAcknowledgeSerializer(serializers.Serializer):
    """Payload for acknowledging an active incident."""
    actor = serializers.CharField(required=False, default="operator")
    note = serializers.CharField(required=False, allow_blank=True, default="")


class IncidentAssignSerializer(serializers.Serializer):
    """Payload for assigning an incident to an operator or team."""
    assigned_to = serializers.CharField(required=True)
    actor = serializers.CharField(required=False, default="operator")
    note = serializers.CharField(required=False, allow_blank=True, default="")


class IncidentResolveSerializer(serializers.Serializer):
    """Payload for resolving an incident with root cause documentation."""
    resolution_notes = serializers.CharField(required=True)
    actor = serializers.CharField(required=False, default="operator")


class IncidentReopenSerializer(serializers.Serializer):
    """Payload for manually reopening an incident."""
    reason = serializers.CharField(required=True)
    actor = serializers.CharField(required=False, default="operator")


class IncidentAddNoteSerializer(serializers.Serializer):
    """Payload for appending an investigation note to the incident timeline."""
    note = serializers.CharField(required=True)
    actor = serializers.CharField(required=False, default="operator")
