"""
===================================================================================
SignalBridge Webhook Ingestion Engine — Central URL Routing Configuration
===================================================================================
PURPOSE:
    This file acts as the "Traffic Controller" for HTTP network requests entering
    the application. When an external client (a browser, Postman, or PagerDuty/Datadog)
    sends an HTTP request to our server, Django looks up the matching URL pattern
    in 'urlpatterns' and routes the request to the appropriate view function.

ARCHITECTURAL ROLE:
    Clean API design separates routing into hierarchical paths:
      - '/' -> Root health check & system metadata probe.
      - '/admin/' -> Built-in Django administrative back-office portal.
      - '/api/docs/' & '/api/schema/' -> OpenAPI 3.0 / Swagger documentation.
      - '/api/v1/webhooks/' -> (Upcoming) Webhook ingestion endpoints.
===================================================================================
"""
# Standard Django Imports:
# 'admin' provides the web-based administration interface for managing database records.
from django.contrib import admin

# 'JsonResponse' is a specialized HTTP response subclass that converts Python dictionaries
# into standard 'application/json' format and returns HTTP status codes.
from django.http import JsonResponse

# 'path' binds an exact or parameterized URL string to a Python view function.
# 'include' allows importing URL patterns from individual modular apps (e.g., apps.webhooks.urls).
from django.urls import path, include

# Third-Party OpenAPI 3.0 Documentation Generators (drf-spectacular):
# These views automatically introspect our code, serializers, and models to generate
# an interactive web-based Swagger UI testing dashboard at /api/docs/.
from drf_spectacular.views import (
    SpectacularAPIView,
    SpectacularRedocView,
    SpectacularSwaggerView,
)


def root_health_view(request):
    """
    Root Health Probe & Service Discovery View.

    Triggered when an HTTP client makes a GET request to the root URL: http://localhost:8000/
    Returns:
        JSON response with system health status and active API documentation links.
    """
    return JsonResponse({
        "system": "SignalBridge Webhook Ingestion Engine",
        "status": "online",
        "version": "1.0.0",
        "documentation": "/api/docs/",
        "admin": "/admin/",
    })


from apps.core.health_views import HealthLiveAPIView, HealthReadyAPIView, SystemHealthDiagnosticAPIView
from apps.core.version_views import VersionAPIView
from apps.alerts.public_views import PublicOverviewAPIView, PublicIncidentListAPIView, PublicIncidentDetailAPIView
from apps.alerts.stream_views import LiveEventStreamAPIView
from apps.webhooks.simulator_views import SimulatorDispatchAPIView
from apps.core.auth_views import (
    AuthLoginAPIView,
    AuthLogoutAPIView,
    AuthMeAPIView,
    AuthCSRFAPIView,
    UserRoleListAPIView,
    UserRoleUpdateAPIView,
)
from apps.webhooks.views import (
    IntegrationListCreateAPIView,
    IntegrationDetailAPIView,
    IntegrationSecretRegenerateAPIView,
)

# ---------------------------------------------------------------------------------
# MASTER URL PATTERNS ROUTING TABLE
# ---------------------------------------------------------------------------------
urlpatterns = [
    # 1. ROOT HEALTH & METADATA
    path("", root_health_view, name="root_health"),
    path("api/health/", SystemHealthDiagnosticAPIView.as_view(), name="system-health"),
    path("api/health", SystemHealthDiagnosticAPIView.as_view(), name="system-health-noslash"),
    path("health/live/", HealthLiveAPIView.as_view(), name="health-live"),
    path("health/ready/", HealthReadyAPIView.as_view(), name="health-ready"),
    path("api/v1/version/", VersionAPIView.as_view(), name="version"),

    # 2. DJANGO ADMIN PORTAL
    path("admin/", admin.site.urls),

    # 3. OPENAPI 3.0 / SWAGGER DOCUMENTATION
    path("api/schema/", SpectacularAPIView.as_view(), name="schema"),
    path("api/docs/", SpectacularSwaggerView.as_view(url_name="schema"), name="swagger-ui"),
    path("api/redoc/", SpectacularRedocView.as_view(url_name="schema"), name="redoc"),

    # -----------------------------------------------------------------------------
    # API V1 OPERATOR & INGESTION ROUTES
    # -----------------------------------------------------------------------------
    # Operator Session Authentication & RBAC User Management
    path("api/v1/auth/login/", AuthLoginAPIView.as_view(), name="auth-login"),
    path("api/v1/auth/logout/", AuthLogoutAPIView.as_view(), name="auth-logout"),
    path("api/v1/auth/me/", AuthMeAPIView.as_view(), name="auth-me"),
    path("api/v1/auth/csrf/", AuthCSRFAPIView.as_view(), name="auth-csrf"),
    path("api/v1/auth/users/", UserRoleListAPIView.as_view(), name="auth-users-list"),
    path("api/v1/auth/users/<int:user_id>/role/", UserRoleUpdateAPIView.as_view(), name="auth-user-role-update"),


    # High-Throughput Webhook Ingestion Perimeter Gateway
    path("api/v1/webhooks/", include("apps.webhooks.urls", namespace="webhooks")),

    # Webhook Source Integration Management
    path("api/v1/integrations/", IntegrationListCreateAPIView.as_view(), name="integration-list"),
    path("api/v1/integrations/<uuid:pk>/", IntegrationDetailAPIView.as_view(), name="integration-detail"),
    path("api/v1/integrations/<uuid:pk>/regenerate-secret/", IntegrationSecretRegenerateAPIView.as_view(), name="integration-regenerate-secret"),

    # Alerts, Incidents & Audit Log
    path("api/v1/", include("apps.alerts.urls", namespace="alerts")),

    # Synthetic Monitoring & Services
    path("api/v1/", include("apps.monitoring.urls", namespace="monitoring")),

    # Outbound Notifications
    path("api/v1/notifications/", include("apps.notifications.urls", namespace="notifications")),

    # Public Unauthenticated Telemetry & Incident Feed
    path("api/v1/stream/", LiveEventStreamAPIView.as_view(), name="live-stream-v1"),
    path("api/stream/", LiveEventStreamAPIView.as_view(), name="live-stream"),
    path("api/v1/public/overview/", PublicOverviewAPIView.as_view(), name="public-overview"),
    path("api/v1/public/incidents/", PublicIncidentListAPIView.as_view(), name="public-incidents"),
    path("api/v1/public/incidents/<uuid:pk>/", PublicIncidentDetailAPIView.as_view(), name="public-incident-detail"),

    # Live Event Simulator & Ingestion Studio
    path("api/v1/simulator/dispatch/", SimulatorDispatchAPIView.as_view(), name="simulator-dispatch"),

    # Analytics & Operational Performance Metrics
    path("api/v1/analytics/", include("apps.analytics.urls", namespace="analytics")),
]
