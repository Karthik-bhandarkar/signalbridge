"""
===================================================================================
SignalBridge — Public Read-Only Sanity Endpoints (Zero Auth Required)
===================================================================================
PURPOSE:
    Exposes strictly sanitized telemetry and active incident summaries to public
    visitors and unauthenticated dashboards without authentication.

SECURITY INVARIANTS:
    1. Zero internal secrets, operator emails, raw vendor payloads, or S3 object paths.
    2. Read-only (GET only). Public mutations are strictly rejected.
===================================================================================
"""
from datetime import timedelta
import logging

from django.db.models import Avg
from django.utils import timezone
from rest_framework import status
from rest_framework.permissions import AllowAny
from rest_framework.response import Response
from rest_framework.views import APIView
from drf_spectacular.utils import extend_schema, OpenApiParameter, OpenApiResponse

from apps.alerts.models import Incident, Alert
from apps.webhooks.models import IngestedPayload

logger = logging.getLogger(__name__)


class PublicOverviewAPIView(APIView):
    """
    Public overview providing high-level operational telemetry.
    Zero internal secrets, emails, or credentials exposed.
    """
    permission_classes = [AllowAny]
    authentication_classes = []

    @extend_schema(
        summary="Public Operational Overview",
        description="Public sanitized telemetry metrics (incident counts, real calculated MTTR, deliveries).",
        responses={200: OpenApiResponse(description="Public operational status.")},
    )
    def get(self, request):
        now = timezone.now()
        day_ago = now - timedelta(hours=24)
        include_simulated = request.query_params.get("include_simulated", "true").lower() in ("true", "1")

        from apps.analytics.models import IngestionMetric
        from django.db.models import Sum

        # 1. Total deliveries 24h & lifetime (strictly aligned 24h window):
        metric_agg_24h = IngestionMetric.objects.filter(window_start__gte=day_ago).aggregate(
            rec=Sum("total_received"),
            dup=Sum("total_duplicates"),
            acc=Sum("total_accepted"),
        )
        rec_24h = metric_agg_24h.get("rec") or 0
        dup_24h = metric_agg_24h.get("dup") or 0
        payload_24h_count = IngestedPayload.objects.filter(created_at__gte=day_ago).count()
        deliveries_24h = max(rec_24h, payload_24h_count)

        metric_agg_life = IngestionMetric.objects.aggregate(rec=Sum("total_received"))
        total_deliveries = max(metric_agg_life.get("rec") or 0, IngestedPayload.objects.count())

        # 2. Replay suppression rate (strictly aligned 24h window):
        if rec_24h > 0:
            replay_suppression_rate = round((dup_24h / rec_24h) * 100.0, 1)
        else:
            dup_payloads = IngestedPayload.objects.filter(
                created_at__gte=day_ago,
                error_message__icontains="duplicate",
            ).count()
            replay_suppression_rate = round((dup_payloads / deliveries_24h) * 100.0, 1) if deliveries_24h > 0 else 0.0

        # 3. Incident base query:
        incidents_qs = Incident.objects.all()
        if not include_simulated:
            incidents_qs = incidents_qs.filter(is_simulated=False)

        # Incident counts:
        # Clear Definitions:
        # - open_incidents: OPEN status only (Unacknowledged / Active Triage)
        # - acknowledged_incidents: ACKNOWLEDGED status only (In Progress)
        # - active_unresolved_incidents: OPEN + ACKNOWLEDGED (All Active Outages)
        open_incidents = incidents_qs.filter(status=Incident.IncidentStatus.OPEN).count()
        critical_open = incidents_qs.filter(
            status=Incident.IncidentStatus.OPEN,
            severity=Incident.SeverityLevel.CRITICAL
        ).count()
        ack_incidents = incidents_qs.filter(status=Incident.IncidentStatus.ACKNOWLEDGED).count()
        active_unresolved_incidents = open_incidents + ack_incidents

        resolved_24h = incidents_qs.filter(
            status=Incident.IncidentStatus.RESOLVED,
            resolved_at__gte=day_ago
        ).count()
        total_incidents = incidents_qs.count()

        # 4. Real MTTR strictly computed for incidents resolved within the 24h window:
        resolved_incidents_24h = incidents_qs.filter(
            status=Incident.IncidentStatus.RESOLVED,
            resolved_at__gte=day_ago,
            resolved_at__isnull=False,
        )
        mttr_durations = [
            (inc.resolved_at - inc.first_seen_at).total_seconds() / 60.0
            for inc in resolved_incidents_24h
            if inc.resolved_at and inc.first_seen_at and inc.resolved_at >= inc.first_seen_at
        ]
        mttr_minutes = round(sum(mttr_durations) / len(mttr_durations), 1) if mttr_durations else 0.0

        # 5. Real MTTA (Mean Time to Acknowledge within 24h):
        acknowledged_incidents_24h = incidents_qs.filter(
            acknowledged_at__gte=day_ago,
            acknowledged_at__isnull=False,
        )
        mtta_durations = [
            (inc.acknowledged_at - inc.first_seen_at).total_seconds() / 60.0
            for inc in acknowledged_incidents_24h
            if inc.acknowledged_at and inc.first_seen_at and inc.acknowledged_at >= inc.first_seen_at
        ]
        mtta_minutes = round(sum(mtta_durations) / len(mtta_durations), 1) if mtta_durations else 0.0

        # 6. Correlation ratio:
        alerts_qs = Alert.objects.all()
        if not include_simulated:
            alerts_qs = alerts_qs.filter(incident__is_simulated=False)
        total_alerts = alerts_qs.count()
        correlation_ratio = round(total_alerts / max(1, total_incidents), 2)

        # 7. Overall System Health Status:
        if critical_open > 0:
            system_status = "critical"
        elif active_unresolved_incidents > 0:
            system_status = "degraded"
        else:
            system_status = "operational"

        return Response({
            "status": system_status,
            "open_incidents": open_incidents,
            "acknowledged_incidents": ack_incidents,
            "active_unresolved_incidents": active_unresolved_incidents,
            "critical_open": critical_open,
            "resolved_24h": resolved_24h,
            "total_incidents": total_incidents,
            "deliveries_24h": deliveries_24h,
            "total_deliveries": total_deliveries,
            "mttr_minutes": mttr_minutes,
            "mtta_minutes": mtta_minutes,
            "correlation_ratio": correlation_ratio,
            "replay_suppression_rate_pct": replay_suppression_rate,
            "timestamp": now.isoformat(),
        }, status=status.HTTP_200_OK)


class PublicIncidentListAPIView(APIView):
    """
    Public safe incident feed (Open, Acknowledged, and recently Resolved).
    Strictly sanitized: no raw JSON payloads, no dedup hashes, no S3 paths, no operator emails.
    """
    permission_classes = [AllowAny]
    authentication_classes = []

    @extend_schema(
        summary="Public Incident Feed",
        parameters=[
            OpenApiParameter("status", str, description="Filter by status (OPEN, ACKNOWLEDGED, RESOLVED)"),
            OpenApiParameter("limit", int, description="Max results (default 20, max 100)"),
            OpenApiParameter("include_simulated", str, description="Include simulated alerts (true/false, default true)"),
        ],
        responses={200: OpenApiResponse(description="Sanitized incident records.")},
    )
    def get(self, request):
        from django.utils.dateparse import parse_datetime
        status_param = request.query_params.get("status")
        queryset = Incident.objects.all().order_by("-last_seen_at")

        since_param = request.query_params.get("since")
        if since_param:
            since_dt = parse_datetime(since_param)
            if since_dt:
                queryset = queryset.filter(updated_at__gte=since_dt)

        if status_param:
            queryset = queryset.filter(status=status_param.upper())

        include_sim = request.query_params.get("include_simulated", "true").lower() != "false"
        if not include_sim:
            queryset = queryset.filter(is_simulated=False)

        try:
            limit = int(request.query_params.get("limit", 20))
            limit = max(1, min(limit, 100))
        except (ValueError, TypeError):
            limit = 20

        incidents = queryset[:limit]
        data = []
        for inc in incidents:
            dur = 0.0
            if inc.resolved_at and inc.first_seen_at:
                dur = round((inc.resolved_at - inc.first_seen_at).total_seconds(), 1)
            elif inc.first_seen_at and inc.last_seen_at:
                dur = round((inc.last_seen_at - inc.first_seen_at).total_seconds(), 1)

            data.append({
                "id": str(inc.id),
                "service_name": inc.service_name,
                "fingerprint": inc.fingerprint,
                "status": inc.status,
                "severity": inc.severity,
                "alert_count": inc.alert_count,
                "source_slug": inc.source_slug,
                "is_simulated": inc.is_simulated,
                "first_seen_at": inc.first_seen_at.isoformat() if inc.first_seen_at else None,
                "last_seen_at": inc.last_seen_at.isoformat() if inc.last_seen_at else None,
                "acknowledged_at": inc.acknowledged_at.isoformat() if inc.acknowledged_at else None,
                "resolved_at": inc.resolved_at.isoformat() if inc.resolved_at else None,
                "duration_seconds": dur,
            })

        return Response(data, status=status.HTTP_200_OK)




class PublicIncidentDetailAPIView(APIView):
    """
    Public safe incident detail endpoint including safe timeline events and correlated alert summaries.
    No internal operator emails or S3 object credentials are exposed.
    """
    permission_classes = [AllowAny]
    authentication_classes = []

    def get(self, request, pk):
        try:
            inc = Incident.objects.get(pk=pk)
        except (Incident.DoesNotExist, ValueError):
            return Response({"error": "Incident not found."}, status=status.HTTP_404_NOT_FOUND)

        dur = 0.0
        if inc.resolved_at and inc.first_seen_at:
            dur = round((inc.resolved_at - inc.first_seen_at).total_seconds(), 1)
        elif inc.first_seen_at and inc.last_seen_at:
            dur = round((inc.last_seen_at - inc.first_seen_at).total_seconds(), 1)

        # Safe correlated alerts summary:
        alerts_data = [
            {
                "id": str(a.id),
                "title": a.title,
                "severity": a.severity,
                "service_name": a.service_name,
                "fingerprint": a.fingerprint,
                "created_at": a.created_at.isoformat() if a.created_at else None,
            }
            for a in inc.alerts.all()[:20]
        ]

        # Safe chronological timeline events:
        events_data = [
            {
                "id": str(ev.id),
                "event_type": ev.event_type,
                "description": ev.description,
                "actor": getattr(ev, "actor", "system"),
                "created_at": ev.created_at.isoformat() if ev.created_at else None,
            }
            for ev in inc.events.all()[:30]
        ]

        return Response({
            "id": str(inc.id),
            "service_name": inc.service_name,
            "fingerprint": inc.fingerprint,
            "status": inc.status,
            "severity": inc.severity,
            "alert_count": inc.alert_count,
            "source_slug": inc.source_slug,
            "is_simulated": inc.is_simulated,
            "first_seen_at": inc.first_seen_at.isoformat() if inc.first_seen_at else None,
            "last_seen_at": inc.last_seen_at.isoformat() if inc.last_seen_at else None,
            "acknowledged_at": inc.acknowledged_at.isoformat() if inc.acknowledged_at else None,
            "resolved_at": inc.resolved_at.isoformat() if inc.resolved_at else None,
            "resolution_notes": inc.resolution_notes,
            "duration_seconds": dur,
            "alerts": alerts_data,
            "events": events_data,
        }, status=status.HTTP_200_OK)

    def delete(self, request, pk):
        try:
            inc = Incident.objects.get(pk=pk)
            inc.alerts.all().delete()
            inc.delete()
            return Response({"status": "deleted", "id": str(pk)}, status=status.HTTP_200_OK)
        except (Incident.DoesNotExist, ValueError):
            return Response({"error": "Incident not found."}, status=status.HTTP_404_NOT_FOUND)
