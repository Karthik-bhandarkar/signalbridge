"""
===================================================================================
SignalBridge Webhook Ingestion Engine — Webhook App URL Routing
===================================================================================
PURPOSE:
    This module maps URL patterns for the Webhooks application.

ENDPOINTS:
    POST /api/v1/webhooks/<slug:source_slug>/
        Routes incoming webhook traffic to WebhookIngestionAPIView.
===================================================================================
"""
from django.urls import path
from apps.webhooks.views import WebhookIngestionAPIView

app_name = "webhooks"

urlpatterns = [
    # Primary Webhook Ingestion Gateway Endpoint:
    # Example: POST /api/v1/webhooks/pagerduty/
    path(
        "<slug:source_slug>/",
        WebhookIngestionAPIView.as_view(),
        name="ingest",
    ),
]
