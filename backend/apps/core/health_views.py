"""
===================================================================================
SignalBridge — Kubernetes & Container Health Probes
===================================================================================
PURPOSE:
    Implements industry-standard Liveness and Readiness HTTP probes:
      - GET /health/live/  -> Returns 200 if Python web process is running.
      - GET /health/ready/ -> Returns 200 only if PostgreSQL and Redis are healthy.
===================================================================================
"""
import logging
from django.db import connection
from django.utils import timezone
from rest_framework import status
from rest_framework.response import Response
from rest_framework.views import APIView
from rest_framework.permissions import AllowAny
from drf_spectacular.utils import extend_schema, OpenApiResponse

logger = logging.getLogger(__name__)


class HealthLiveAPIView(APIView):
    """
    Kubernetes Liveness Probe.
    Returns HTTP 200 OK as long as the WSGI/ASGI application worker is running.
    """
    permission_classes = [AllowAny]
    authentication_classes = []

    @extend_schema(
        summary="Kubernetes Liveness Probe",
        description="Lightweight probe verifying the application process is alive and accepting connections.",
        responses={200: OpenApiResponse(description="Process is alive.")},
    )
    def get(self, request):
        return Response({
            "status": "live",
            "timestamp": timezone.now().isoformat(),
        }, status=status.HTTP_200_OK)


class HealthReadyAPIView(APIView):
    """
    Kubernetes Readiness Probe.
    Verifies that the application's critical backing services (Database, Redis)
    are reachable before allowing ingress traffic to be routed to this pod/container.
    """
    permission_classes = [AllowAny]
    authentication_classes = []

    @extend_schema(
        summary="Kubernetes Readiness Probe",
        description="Verifies database and cache connectivity. Returns 200 if ready, 503 if any dependent dependency is down.",
        responses={
            200: OpenApiResponse(description="All dependencies healthy and ready for traffic."),
            503: OpenApiResponse(description="One or more critical dependencies failed health check."),
        },
    )
    def get(self, request):
        checks = {}
        all_healthy = True

        # 1. Database Check:
        try:
            with connection.cursor() as cursor:
                cursor.execute("SELECT 1;")
                cursor.fetchone()
            checks["database"] = {"status": "ok", "vendor": connection.vendor}
        except Exception as exc:
            logger.error(f"[ReadinessProbe] Database health check failed: {exc}")
            checks["database"] = {"status": "unhealthy", "error": str(exc)}
            all_healthy = False

        # 2. Redis Cache Check:
        try:
            from django.core.cache import cache
            cache.set("__health_check__", "1", timeout=5)
            val = cache.get("__health_check__")
            if val == "1":
                checks["redis"] = {"status": "ok"}
            else:
                checks["redis"] = {"status": "degraded", "warning": "Cache read mismatch"}
        except Exception as exc:
            # Cache failure is treated as degraded or unhealthy depending on policy
            logger.warning(f"[ReadinessProbe] Redis cache check failed: {exc}")
            checks["redis"] = {"status": "unhealthy", "error": str(exc)}
            all_healthy = False

        http_status = status.HTTP_200_OK if all_healthy else status.HTTP_503_SERVICE_UNAVAILABLE

        return Response({
            "status": "ready" if all_healthy else "unready",
            "checks": checks,
            "timestamp": timezone.now().isoformat(),
        }, status=http_status)
