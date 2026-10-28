"""
===================================================================================
SignalBridge Webhook Ingestion Engine — Analytics URL Routing
===================================================================================
PURPOSE:
    This module maps URL routes for ingestion metrics and performance summaries.
===================================================================================
"""
from django.urls import path
from apps.analytics.views import IngestionMetricListAPIView, IngestionMetricSummaryAPIView, OperationalKPIAPIView

app_name = "analytics"

urlpatterns = [
    path("kpi/", OperationalKPIAPIView.as_view(), name="operational-kpi"),
    path("metrics/", IngestionMetricListAPIView.as_view(), name="metric-list"),
    path("summary/", IngestionMetricSummaryAPIView.as_view(), name="metric-summary"),
]
