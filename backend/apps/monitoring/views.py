"""
===================================================================================
SignalBridge — Monitoring REST Views
===================================================================================
PURPOSE:
    Provides endpoints for managing Monitored Services and Synthetic Monitors:
      - GET /api/v1/services/         (list services with health counts)
      - POST /api/v1/services/        (register service)
      - GET /api/v1/services/<id>/    (service detail)
      - GET /api/v1/monitors/         (list active monitors)
      - POST /api/v1/monitors/        (register monitor)
      - GET /api/v1/monitors/<id>/    (monitor detail with check history)
      - POST /api/v1/monitors/<id>/test/ (execute immediate probe)
===================================================================================
"""
from rest_framework import status
from rest_framework.response import Response
from rest_framework.views import APIView
from rest_framework.permissions import AllowAny
from drf_spectacular.utils import extend_schema, OpenApiResponse

from apps.core.permissions import IsReadOnlyViewerOrAdminMutate, IsOperatorOrHigher, IsViewerOrHigher

from apps.monitoring.models import Monitor, Service
from apps.monitoring.serializers import MonitorSerializer, ServiceSerializer
from apps.monitoring.tasks import execute_monitor_check


class ServiceListCreateAPIView(APIView):
    permission_classes = [IsReadOnlyViewerOrAdminMutate]

    @extend_schema(
        summary="List Monitored Services",
        responses={200: ServiceSerializer(many=True)},
    )
    def get(self, request):
        services = Service.objects.all().order_by("name")
        serializer = ServiceSerializer(services, many=True)
        return Response(serializer.data, status=status.HTTP_200_OK)

    @extend_schema(
        summary="Register New Monitored Service",
        request=ServiceSerializer,
        responses={201: ServiceSerializer},
    )
    def post(self, request):
        serializer = ServiceSerializer(data=request.data)
        if not serializer.is_valid():
            return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)
        service = serializer.save()
        return Response(ServiceSerializer(service).data, status=status.HTTP_201_CREATED)


class ServiceDetailAPIView(APIView):
    permission_classes = [IsReadOnlyViewerOrAdminMutate]
    serializer_class = ServiceSerializer

    @extend_schema(
        summary="Retrieve Service Details",
        responses={200: ServiceSerializer, 404: OpenApiResponse(description="Service not found")},
    )
    def get(self, request, pk):
        try:
            service = Service.objects.get(pk=pk)
            return Response(ServiceSerializer(service).data, status=status.HTTP_200_OK)
        except Service.DoesNotExist:
            return Response({"error": "Service not found"}, status=status.HTTP_404_NOT_FOUND)

    @extend_schema(
        summary="Update Service",
        responses={200: ServiceSerializer, 404: OpenApiResponse(description="Service not found")},
    )
    def patch(self, request, pk):
        try:
            service = Service.objects.get(pk=pk)
            for field in ["name", "slug", "description", "tier", "is_active"]:
                if field in request.data:
                    setattr(service, field, request.data[field])
            service.save()
            return Response(ServiceSerializer(service).data, status=status.HTTP_200_OK)
        except Service.DoesNotExist:
            return Response({"error": "Service not found"}, status=status.HTTP_404_NOT_FOUND)

    @extend_schema(
        summary="Delete Service",
        responses={204: OpenApiResponse(description="Deleted"), 404: OpenApiResponse(description="Service not found")},
    )
    def delete(self, request, pk):
        try:
            service = Service.objects.get(pk=pk)
            service.delete()
            return Response({"status": "deleted"}, status=status.HTTP_204_NO_CONTENT)
        except Service.DoesNotExist:
            return Response({"error": "Service not found"}, status=status.HTTP_404_NOT_FOUND)


class MonitorListCreateAPIView(APIView):
    permission_classes = [IsReadOnlyViewerOrAdminMutate]

    @extend_schema(
        summary="List Synthetic Monitors",
        responses={200: MonitorSerializer(many=True)},
    )
    def get(self, request):
        service_id = request.query_params.get("service_id")
        queryset = Monitor.objects.select_related("service").prefetch_related("check_results").all()
        if service_id:
            queryset = queryset.filter(service_id=service_id)

        serializer = MonitorSerializer(queryset, many=True)
        return Response(serializer.data, status=status.HTTP_200_OK)

    @extend_schema(
        summary="Create Synthetic Monitor",
        request=MonitorSerializer,
        responses={201: MonitorSerializer},
    )
    def post(self, request):
        serializer = MonitorSerializer(data=request.data)
        if not serializer.is_valid():
            return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)

        monitor = serializer.save()
        return Response(MonitorSerializer(monitor).data, status=status.HTTP_201_CREATED)


class MonitorDetailAPIView(APIView):
    permission_classes = [IsReadOnlyViewerOrAdminMutate]
    serializer_class = MonitorSerializer

    @extend_schema(
        summary="Retrieve Synthetic Monitor Details",
        responses={200: MonitorSerializer, 404: OpenApiResponse(description="Monitor not found")},
    )
    def get(self, request, pk):
        try:
            monitor = Monitor.objects.select_related("service").prefetch_related("check_results").get(pk=pk)
            return Response(MonitorSerializer(monitor).data, status=status.HTTP_200_OK)
        except Monitor.DoesNotExist:
            return Response({"error": "Monitor not found"}, status=status.HTTP_404_NOT_FOUND)

    @extend_schema(
        summary="Update Synthetic Monitor",
        responses={200: MonitorSerializer, 404: OpenApiResponse(description="Monitor not found")},
    )
    def patch(self, request, pk):
        try:
            monitor = Monitor.objects.get(pk=pk)
            for field in ["name", "target_url", "interval_seconds", "timeout_seconds", "failure_threshold", "is_active"]:
                if field in request.data:
                    setattr(monitor, field, request.data[field])
            monitor.save()
            return Response(MonitorSerializer(monitor).data, status=status.HTTP_200_OK)
        except Monitor.DoesNotExist:
            return Response({"error": "Monitor not found"}, status=status.HTTP_404_NOT_FOUND)

    @extend_schema(
        summary="Delete Synthetic Monitor",
        responses={204: OpenApiResponse(description="Deleted"), 404: OpenApiResponse(description="Monitor not found")},
    )
    def delete(self, request, pk):
        try:
            monitor = Monitor.objects.get(pk=pk)
            monitor.delete()
            return Response({"status": "deleted"}, status=status.HTTP_204_NO_CONTENT)
        except Monitor.DoesNotExist:
            return Response({"error": "Monitor not found"}, status=status.HTTP_404_NOT_FOUND)


class MonitorTestAPIView(APIView):
    """
    Triggers an immediate on-demand probe for this monitor.
    """
    permission_classes = [IsOperatorOrHigher]
    serializer_class = None

    @extend_schema(
        summary="Execute Immediate Monitor Probe",
        responses={200: OpenApiResponse(description="Probe execution summary")},
    )
    def post(self, request, pk):
        try:
            monitor = Monitor.objects.get(pk=pk)
            res = execute_monitor_check(monitor_id=str(monitor.id))
            monitor.refresh_from_db()
            return Response({
                "probe_result": res,
                "monitor": MonitorSerializer(monitor).data,
            }, status=status.HTTP_200_OK)
        except Monitor.DoesNotExist:
            return Response({"error": "Monitor not found"}, status=status.HTTP_404_NOT_FOUND)
