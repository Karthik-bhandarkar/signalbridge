"""
===================================================================================
SignalBridge Webhook Ingestion Engine — Analytics URL Routing
===================================================================================
PURPOSE:
    This module maps URL routes for ingestion metrics and performance summaries.
===================================================================================
"""
from django.urls import path
from apps.analytics.views import IngestionMetricListAPIView, IngestionMetricSummaryAPIView

app_name = "analytics"

urlpatterns = [
    path("metrics/", IngestionMetricListAPIView.as_view(), name="metric-list"),
    path("summary/", IngestionMetricSummaryAPIView.as_view(), name="metric-summary"),
]
