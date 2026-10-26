"""
===================================================================================
SignalBridge — Alert & Incident URL Routes
===================================================================================
"""
from django.urls import path
from apps.alerts.views import (
    AlertDetailAPIView,
    AlertListAPIView,
    AlertRetryAPIView,
    AuditLogListAPIView,
    IncidentAcknowledgeAPIView,
    IncidentAddNoteAPIView,
    IncidentAssignAPIView,
    IncidentDetailAPIView,
    IncidentListAPIView,
    IncidentReopenAPIView,
    IncidentResolveAPIView,
)

app_name = "alerts"

urlpatterns = [
    # Incidents API:
    path("incidents/", IncidentListAPIView.as_view(), name="incident-list"),
    path("incidents/<uuid:pk>/", IncidentDetailAPIView.as_view(), name="incident-detail"),
    path("incidents/<uuid:pk>/acknowledge/", IncidentAcknowledgeAPIView.as_view(), name="incident-acknowledge"),
    path("incidents/<uuid:pk>/assign/", IncidentAssignAPIView.as_view(), name="incident-assign"),
    path("incidents/<uuid:pk>/resolve/", IncidentResolveAPIView.as_view(), name="incident-resolve"),
    path("incidents/<uuid:pk>/reopen/", IncidentReopenAPIView.as_view(), name="incident-reopen"),
    path("incidents/<uuid:pk>/notes/", IncidentAddNoteAPIView.as_view(), name="incident-add-note"),

    # Alerts API:
    path("alerts/", AlertListAPIView.as_view(), name="alert-list"),
    path("alerts/<uuid:pk>/", AlertDetailAPIView.as_view(), name="alert-detail"),
    path("alerts/<uuid:pk>/retry/", AlertRetryAPIView.as_view(), name="alert-retry"),

    # Global Audit Log:
    path("audit/", AuditLogListAPIView.as_view(), name="audit-log"),
]
