"""
===================================================================================
SignalBridge Webhook Ingestion Engine — Alerts & Incident Admin Dashboard
===================================================================================
PURPOSE:
    Registers Incident, Alert, and IncidentEvent models with specialized SRE triage
    views, severity badges, and correlation inspection tools.
===================================================================================
"""
from django.contrib import admin

from apps.alerts.models import Alert, Incident, IncidentEvent


class AlertInline(admin.TabularInline):
    """Allows viewing correlated alerts directly inside the Incident change form."""

    model = Alert
    extra = 0
    fields = ("title", "severity", "deduplication_hash", "created_at")
    readonly_fields = ("title", "severity", "deduplication_hash", "created_at")
    can_delete = False
    show_change_link = True


class IncidentEventInline(admin.TabularInline):
    """Displays immutable audit lifecycle events on the parent Incident."""

    model = IncidentEvent
    extra = 0
    fields = ("event_type", "description", "actor", "created_at")
    readonly_fields = ("event_type", "description", "actor", "created_at")
    can_delete = False


@admin.register(Incident)
class IncidentAdmin(admin.ModelAdmin):
    """Admin portal for incident triage, operator assignment, and resolution."""

    list_display = (
        "service_name",
        "fingerprint",
        "status",
        "severity",
        "alert_count",
        "first_seen_at",
        "last_seen_at",
    )
    list_filter = ("status", "severity", "service_name")
    search_fields = ("service_name", "fingerprint", "resolution_notes", "assigned_to")
    readonly_fields = (
        "id",
        "first_seen_at",
        "last_seen_at",
        "alert_count",
        "created_at",
        "updated_at",
    )
    fieldsets = (
        (
            "Correlation Identity",
            {"fields": ("id", "service_name", "fingerprint")},
        ),
        (
            "Triage & Lifecycle State",
            {"fields": ("status", "severity", "alert_count", "assigned_to")},
        ),
        (
            "Post-Mortem & Resolution",
            {"fields": ("resolution_notes",)},
        ),
        (
            "Audit Timestamps",
            {"fields": ("first_seen_at", "last_seen_at", "created_at", "updated_at")},
        ),
    )
    inlines = [AlertInline, IncidentEventInline]
    ordering = ("-last_seen_at",)


@admin.register(Alert)
class AlertAdmin(admin.ModelAdmin):
    """Admin portal for inspecting individual correlated or deduplicated alerts."""

    list_display = (
        "title",
        "service_name",
        "severity",
        "fingerprint",
        "incident",
        "created_at",
    )
    list_filter = ("severity", "service_name")
    search_fields = ("title", "service_name", "fingerprint", "deduplication_hash")
    readonly_fields = (
        "id",
        "payload",
        "deduplication_hash",
        "raw_metadata",
        "created_at",
        "updated_at",
    )
    ordering = ("-created_at",)


@admin.register(IncidentEvent)
class IncidentEventAdmin(admin.ModelAdmin):
    """Immutable audit trail of all automated and operator interventions."""

    list_display = ("incident", "event_type", "actor", "created_at")
    list_filter = ("event_type", "actor")
    search_fields = ("description", "actor")
    readonly_fields = (
        "id",
        "incident",
        "event_type",
        "description",
        "actor",
        "created_at",
        "updated_at",
    )
    ordering = ("-created_at",)
