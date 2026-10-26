"""
===================================================================================
SignalBridge — Notification URLs
===================================================================================
"""
from django.urls import path
from apps.notifications.views import (
    NotificationDeliveryListAPIView,
    NotificationDestinationDetailAPIView,
    NotificationDestinationListCreateAPIView,
    NotificationTestDispatchAPIView,
)

app_name = "notifications"

urlpatterns = [
    path("destinations/", NotificationDestinationListCreateAPIView.as_view(), name="destination-list"),
    path("destinations/<uuid:pk>/", NotificationDestinationDetailAPIView.as_view(), name="destination-detail"),
    path("destinations/<uuid:pk>/test-dispatch/", NotificationTestDispatchAPIView.as_view(), name="destination-test-dispatch"),
    path("deliveries/", NotificationDeliveryListAPIView.as_view(), name="delivery-list"),
]

