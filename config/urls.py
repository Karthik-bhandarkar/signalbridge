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


# ---------------------------------------------------------------------------------
# MASTER URL PATTERNS ROUTING TABLE
# ---------------------------------------------------------------------------------
# Django searches this list top-to-bottom on every incoming HTTP request.
# The first match executes its associated view function.
urlpatterns = [
    # 1. ROOT HEALTH CHECK (GET http://localhost:8000/)
    # Used by container orchestrators (Kubernetes/Docker healthchecks) to verify container readiness.
    path("", root_health_view, name="root_health"),

    # 2. DJANGO ADMIN PORTAL (GET http://localhost:8000/admin/)
    # Provides visual database CRUD management for developers and operations staff.
    path("admin/", admin.site.urls),

    # 3. OPENAPI 3.0 SCHEMA GENERATOR (GET http://localhost:8000/api/schema/)
    # Produces the machine-readable YAML/JSON OpenAPI specification file.
    path("api/schema/", SpectacularAPIView.as_view(), name="schema"),

    # 4. INTERACTIVE SWAGGER UI DASHBOARD (GET http://localhost:8000/api/docs/)
    # Renders the visual web dashboard where developers test API endpoints directly in browser.
    path("api/docs/", SpectacularSwaggerView.as_view(url_name="schema"), name="swagger-ui"),

    # 5. ALTERNATIVE REDOC DOCUMENTATION (GET http://localhost:8000/api/redoc/)
    # Renders three-panel technical documentation for enterprise API consumers.
    path("api/redoc/", SpectacularRedocView.as_view(url_name="schema"), name="redoc"),

    # -----------------------------------------------------------------------------
    # API V1 DOMAIN ROUTES
    # -----------------------------------------------------------------------------
    # High-Throughput Webhook Ingestion Perimeter Gateway
    path("api/v1/webhooks/", include("apps.webhooks.urls", namespace="webhooks")),
]
