"""
===================================================================================
SignalBridge — Monitoring URLs
===================================================================================
"""
from django.urls import path
from apps.monitoring.views import (
    MonitorDetailAPIView,
    MonitorListCreateAPIView,
    MonitorTestAPIView,
    ServiceDetailAPIView,
    ServiceListCreateAPIView,
)

app_name = "monitoring"

urlpatterns = [
    # Monitored Services:
    path("services/", ServiceListCreateAPIView.as_view(), name="service-list"),
    path("services/<uuid:pk>/", ServiceDetailAPIView.as_view(), name="service-detail"),

    # Synthetic Monitors:
    path("monitors/", MonitorListCreateAPIView.as_view(), name="monitor-list"),
    path("monitors/<uuid:pk>/", MonitorDetailAPIView.as_view(), name="monitor-detail"),
    path("monitors/<uuid:pk>/test/", MonitorTestAPIView.as_view(), name="monitor-test"),
]
