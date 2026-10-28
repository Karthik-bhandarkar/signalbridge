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


class SystemHealthDiagnosticAPIView(APIView):
    """
    Comprehensive System Health & Diagnostic Probe.
    Inspects:
      1. PostgreSQL Database connectivity & query latency
      2. Redis Cache & Broker connectivity & latency
      3. Celery background worker heartbeat
      4. AWS S3 Cold Storage bucket accessibility
    """
    permission_classes = [AllowAny]
    authentication_classes = []

    @extend_schema(
        summary="Comprehensive System Diagnostic Health Probe",
        description="Detailed diagnostic status of PostgreSQL, Redis, Celery Workers, and S3 Cold Storage.",
        responses={200: OpenApiResponse(description="System diagnostic telemetry.")},
    )
    def get(self, request):
        import time
        t0 = time.perf_counter()
        checks = {}
        all_healthy = True

        # 1. Database Check & Latency
        try:
            db_t0 = time.perf_counter()
            with connection.cursor() as cursor:
                cursor.execute("SELECT 1;")
                cursor.fetchone()
            db_latency = round((time.perf_counter() - db_t0) * 1000.0, 2)
            checks["database"] = {
                "status": "ok",
                "vendor": connection.vendor,
                "latency_ms": db_latency,
            }
        except Exception as exc:
            logger.error(f"[DiagnosticHealth] DB check failed: {exc}")
            checks["database"] = {"status": "unhealthy", "error": str(exc)}
            all_healthy = False

        # 2. Redis Cache Check & Latency
        try:
            redis_t0 = time.perf_counter()
            from django.core.cache import cache
            cache.set("__diag_health__", "1", timeout=5)
            val = cache.get("__diag_health__")
            redis_latency = round((time.perf_counter() - redis_t0) * 1000.0, 2)
            if val == "1":
                checks["redis"] = {"status": "ok", "latency_ms": redis_latency}
            else:
                checks["redis"] = {"status": "degraded", "warning": "cache read mismatch", "latency_ms": redis_latency}
        except Exception as exc:
            logger.warning(f"[DiagnosticHealth] Redis check failed: {exc}")
            checks["redis"] = {"status": "unhealthy", "error": str(exc)}
            all_healthy = False

        # 3. Celery Worker Heartbeat
        try:
            from config.celery import app as celery_app
            inspector = celery_app.control.inspect(timeout=0.6)
            ping_result = inspector.ping() if inspector else None
            active_workers = len(ping_result.keys()) if ping_result else 0
            if active_workers > 0:
                checks["celery"] = {
                    "status": "ok",
                    "active_workers": active_workers,
                    "workers": list(ping_result.keys()) if ping_result else [],
                }
            else:
                checks["celery"] = {
                    "status": "degraded",
                    "active_workers": 0,
                    "message": "No active workers replied to heartbeat within 600ms",
                }
        except Exception as exc:
            checks["celery"] = {"status": "unhealthy", "error": str(exc)}

        # 4. S3 Cold Storage
        try:
            from apps.webhooks.archival import s3_archiver
            s3_client = s3_archiver.get_client()
            bucket_name = s3_archiver.bucket_name
            s3_client.head_bucket(Bucket=bucket_name)
            checks["s3_storage"] = {
                "status": "ok",
                "bucket": bucket_name,
                "region": s3_archiver.region_name,
            }
        except Exception as exc:
            checks["s3_storage"] = {
                "status": "degraded",
                "bucket": getattr(s3_archiver, "bucket_name", "unknown"),
                "error": str(exc),
            }

        total_latency = round((time.perf_counter() - t0) * 1000.0, 2)
        overall_status = "healthy" if all_healthy else "degraded"
        return Response({
            "status": overall_status,
            "ok": all_healthy,
            "timestamp": timezone.now().isoformat(),
            "latency_ms": total_latency,
            "checks": checks,
        }, status=status.HTTP_200_OK if all_healthy else status.HTTP_503_SERVICE_UNAVAILABLE)
