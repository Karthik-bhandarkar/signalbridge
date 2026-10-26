"""
===================================================================================
SignalBridge — Notification Serializers
===================================================================================
"""
from rest_framework import serializers
from apps.notifications.models import NotificationDelivery, NotificationDestination


class NotificationDestinationSerializer(serializers.ModelSerializer):
    deliveries_count = serializers.IntegerField(source="deliveries.count", read_only=True)

    class Meta:
        model = NotificationDestination
        fields = [
            "id",
            "name",
            "destination_type",
            "endpoint_url",
            "auth_header",
            "is_active",
            "deliveries_count",
            "created_at",
            "updated_at",
        ]
        read_only_fields = ["id", "deliveries_count", "created_at", "updated_at"]
        extra_kwargs = {
            "auth_header": {"write_only": True},
        }


class NotificationDeliverySerializer(serializers.ModelSerializer):
    destination_name = serializers.CharField(source="destination.name", read_only=True)
    destination_type = serializers.CharField(source="destination.destination_type", read_only=True)

    class Meta:
        model = NotificationDelivery
        fields = [
            "id",
            "incident",
            "destination",
            "destination_name",
            "destination_type",
            "status",
            "event_type",
            "payload_snapshot",
            "response_status_code",
            "error_message",
            "delivered_at",
        ]
        read_only_fields = fields
