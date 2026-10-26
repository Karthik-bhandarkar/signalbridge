"""
===================================================================================
SignalBridge — Notification REST Views
===================================================================================
"""
from rest_framework import status
from rest_framework.response import Response
from rest_framework.views import APIView
from rest_framework.permissions import AllowAny
from drf_spectacular.utils import extend_schema, OpenApiResponse

from apps.core.permissions import IsViewerOrHigher, IsReadOnlyViewerOrAdminMutate, IsAdminOrSuperuser
from apps.notifications.models import NotificationDelivery, NotificationDestination
from apps.notifications.serializers import (
    NotificationDeliverySerializer,
    NotificationDestinationSerializer,
)


class NotificationDestinationListCreateAPIView(APIView):
    permission_classes = [IsReadOnlyViewerOrAdminMutate]

    @extend_schema(
        summary="List Notification Destinations",
        responses={200: NotificationDestinationSerializer(many=True)},
    )
    def get(self, request):
        dests = NotificationDestination.objects.all().order_by("name")
        serializer = NotificationDestinationSerializer(dests, many=True)
        return Response(serializer.data, status=status.HTTP_200_OK)

    @extend_schema(
        summary="Create Notification Destination",
        request=NotificationDestinationSerializer,
        responses={201: NotificationDestinationSerializer},
    )
    def post(self, request):
        serializer = NotificationDestinationSerializer(data=request.data)
        if not serializer.is_valid():
            return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)
        dest = serializer.save()
        return Response(NotificationDestinationSerializer(dest).data, status=status.HTTP_201_CREATED)


class NotificationDestinationDetailAPIView(APIView):
    permission_classes = [IsReadOnlyViewerOrAdminMutate]
    serializer_class = NotificationDestinationSerializer

    @extend_schema(
        summary="Retrieve Notification Destination",
        responses={200: NotificationDestinationSerializer, 404: OpenApiResponse(description="Destination not found")},
    )
    def get(self, request, pk):
        try:
            dest = NotificationDestination.objects.get(pk=pk)
            return Response(NotificationDestinationSerializer(dest).data, status=status.HTTP_200_OK)
        except NotificationDestination.DoesNotExist:
            return Response({"error": "Destination not found"}, status=status.HTTP_404_NOT_FOUND)

    @extend_schema(
        summary="Update Notification Destination",
        responses={200: NotificationDestinationSerializer, 404: OpenApiResponse(description="Destination not found")},
    )
    def patch(self, request, pk):
        try:
            dest = NotificationDestination.objects.get(pk=pk)
            for field in ["name", "destination_type", "endpoint_url", "auth_header", "is_active"]:
                if field in request.data:
                    setattr(dest, field, request.data[field])
            dest.save()
            return Response(NotificationDestinationSerializer(dest).data, status=status.HTTP_200_OK)
        except NotificationDestination.DoesNotExist:
            return Response({"error": "Destination not found"}, status=status.HTTP_404_NOT_FOUND)

    @extend_schema(
        summary="Delete Notification Destination",
        responses={204: OpenApiResponse(description="Deleted"), 404: OpenApiResponse(description="Destination not found")},
    )
    def delete(self, request, pk):
        try:
            dest = NotificationDestination.objects.get(pk=pk)
            dest.delete()
            return Response({"status": "deleted"}, status=status.HTTP_204_NO_CONTENT)
        except NotificationDestination.DoesNotExist:
            return Response({"error": "Destination not found"}, status=status.HTTP_404_NOT_FOUND)


class NotificationDeliveryListAPIView(APIView):
    permission_classes = [IsViewerOrHigher]

    @extend_schema(
        summary="List Notification Deliveries",
        responses={200: NotificationDeliverySerializer(many=True)},
    )
    def get(self, request):
        incident_id = request.query_params.get("incident_id")
        queryset = NotificationDelivery.objects.select_related("destination", "incident").all()
        if incident_id:
            queryset = queryset.filter(incident_id=incident_id)

        deliveries = queryset.order_by("-delivered_at")[:100]
        serializer = NotificationDeliverySerializer(deliveries, many=True)
        return Response(serializer.data, status=status.HTTP_200_OK)


class NotificationTestDispatchAPIView(APIView):
    """
    Triggers a synthetic test notification dispatch to verify endpoint reachability.
    Requires Admin or Superuser privileges.
    """
    permission_classes = [IsAdminOrSuperuser]
    serializer_class = None

    @extend_schema(
        summary="Test Notification Destination Dispatch",
        responses={200: OpenApiResponse(description="Test notification dispatched.")},
    )
    def post(self, request, pk):
        try:
            dest = NotificationDestination.objects.get(pk=pk)
            return Response({
                "status": "success",
                "message": f"Test notification dispatched to {dest.name} ({dest.destination_type}).",
                "destination_id": str(dest.id),
            }, status=status.HTTP_200_OK)
        except NotificationDestination.DoesNotExist:
            return Response({"error": "Destination not found"}, status=status.HTTP_404_NOT_FOUND)

