"""
===================================================================================
SignalBridge — Monitoring Serializers
===================================================================================
"""
from rest_framework import serializers
from drf_spectacular.utils import extend_schema_field
from apps.monitoring.models import Monitor, MonitorCheckResult, Service


class ServiceSerializer(serializers.ModelSerializer):
    monitors_count = serializers.IntegerField(source="monitors.count", read_only=True)
    active_incidents_count = serializers.SerializerMethodField()

    class Meta:
        model = Service
        fields = [
            "id",
            "name",
            "slug",
            "description",
            "tier",
            "is_active",
            "monitors_count",
            "active_incidents_count",
            "created_at",
            "updated_at",
        ]
        read_only_fields = ["id", "created_at", "updated_at", "monitors_count", "active_incidents_count"]

    def get_active_incidents_count(self, obj) -> int:
        from apps.alerts.models import Incident
        return Incident.objects.filter(
            service_name=obj.slug,
            status__in=[Incident.IncidentStatus.OPEN, Incident.IncidentStatus.ACKNOWLEDGED],
        ).count()


class MonitorCheckResultSerializer(serializers.ModelSerializer):
    class Meta:
        model = MonitorCheckResult
        fields = [
            "id",
            "status",
            "response_time_ms",
            "status_code",
            "error_message",
            "checked_at",
        ]
        read_only_fields = fields


class MonitorSerializer(serializers.ModelSerializer):
    service_name = serializers.CharField(source="service.name", read_only=True)
    service_slug = serializers.CharField(source="service.slug", read_only=True)
    recent_checks = serializers.SerializerMethodField()

    class Meta:
        model = Monitor
        fields = [
            "id",
            "service",
            "service_name",
            "service_slug",
            "name",
            "monitor_type",
            "target_url",
            "interval_seconds",
            "timeout_seconds",
            "failure_threshold",
            "current_status",
            "consecutive_failures",
            "last_response_time_ms",
            "last_checked_at",
            "is_active",
            "recent_checks",
            "created_at",
            "updated_at",
        ]
        read_only_fields = [
            "id",
            "current_status",
            "consecutive_failures",
            "last_response_time_ms",
            "last_checked_at",
            "created_at",
            "updated_at",
            "recent_checks",
        ]

    @extend_schema_field(MonitorCheckResultSerializer(many=True))
    def get_recent_checks(self, obj):
        checks = obj.check_results.all()[:10]
        return MonitorCheckResultSerializer(checks, many=True).data
