"""
===================================================================================
SignalBridge Webhook Ingestion Engine — Analytics Views & REST APIs
===================================================================================
PURPOSE:
    This module provides authenticated REST endpoints for querying time-series
    ingestion performance metrics and aggregated SLA summaries.

SECURITY & AUTHORIZATION:
    Performs Perimeter B Operator authentication (Session Auth + IsAuthenticated).
    Unauthenticated requests are strictly rejected with HTTP 401 Unauthorized.
===================================================================================
"""
import datetime
import logging
from typing import Optional

from django.db.models import Avg, Max, Sum
from django.utils import timezone
from django.utils.dateparse import parse_datetime
from drf_spectacular.utils import OpenApiParameter, extend_schema
from rest_framework import status
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView

from apps.core.permissions import IsViewerOrHigher
from apps.analytics.models import IngestionMetric
from apps.analytics.serializers import IngestionMetricSerializer, IngestionSummarySerializer

logger = logging.getLogger(__name__)


class IngestionMetricListAPIView(APIView):
    """
    Operator API returning granular, time-bucketed IngestionMetric records.
    """
    permission_classes = [IsViewerOrHigher]

    @extend_schema(
        summary="List Ingestion Metrics Time Series",
        parameters=[
            OpenApiParameter("source", str, description="Filter by webhook source slug (e.g. 'pagerduty')"),
            OpenApiParameter("from", str, description="ISO-8601 start timestamp for window filter"),
            OpenApiParameter("to", str, description="ISO-8601 end timestamp for window filter"),
            OpenApiParameter("limit", int, description="Max number of time buckets to return (default 60, max 500)"),
        ],
        responses={200: IngestionMetricSerializer(many=True)},
    )
    def get(self, request):
        queryset = IngestionMetric.objects.all().order_by("-window_start")

        source_slug = request.query_params.get("source")
        if source_slug:
            queryset = queryset.filter(source_slug=source_slug)

        from_param = request.query_params.get("from")
        if from_param:
            from_dt = parse_datetime(from_param)
            if from_dt:
                queryset = queryset.filter(window_start__gte=from_dt)

        to_param = request.query_params.get("to")
        if to_param:
            to_dt = parse_datetime(to_param)
            if to_dt:
                queryset = queryset.filter(window_start__lte=to_dt)

        try:
            limit = int(request.query_params.get("limit", 60))
            limit = max(1, min(limit, 500))
        except (ValueError, TypeError):
            limit = 60

        records = queryset[:limit]
        serializer = IngestionMetricSerializer(records, many=True)
        return Response(serializer.data, status=status.HTTP_200_OK)


class IngestionMetricSummaryAPIView(APIView):
    """
    Operator API returning high-level aggregated SLA and throughput metrics.
    """
    permission_classes = [IsViewerOrHigher]

    @extend_schema(
        summary="Get Ingestion Performance Summary",
        parameters=[
            OpenApiParameter("source", str, description="Optional webhook source slug filter"),
            OpenApiParameter("window_minutes", int, description="Rolling time window in minutes (default 60)"),
        ],
        responses={200: IngestionSummarySerializer},
    )
    def get(self, request):
        try:
            window_minutes = int(request.query_params.get("window_minutes", 60))
            window_minutes = max(1, min(window_minutes, 1440))  # Between 1 minute and 24 hours
        except (ValueError, TypeError):
            window_minutes = 60

        cutoff = timezone.now() - datetime.timedelta(minutes=window_minutes)
        queryset = IngestionMetric.objects.filter(window_start__gte=cutoff)

        source_slug = request.query_params.get("source")
        if source_slug:
            queryset = queryset.filter(source_slug=source_slug)

        aggregates = queryset.aggregate(
            sum_received=Sum("total_received"),
            sum_accepted=Sum("total_accepted"),
            sum_duplicates=Sum("total_duplicates"),
            sum_rejected=Sum("total_rejected"),
            sum_auth=Sum("rejected_auth"),
            sum_rate=Sum("rejected_rate_limit"),
            sum_malf=Sum("rejected_malformed"),
            sum_inac=Sum("rejected_inactive"),
            sum_srvr=Sum("rejected_server_error"),
            max_p95=Max("p95_latency_ms"),
            avg_p95=Avg("p95_latency_ms"),
        )

        total_received = aggregates["sum_received"] or 0
        total_accepted = aggregates["sum_accepted"] or 0
        total_duplicates = aggregates["sum_duplicates"] or 0
        total_rejected = aggregates["sum_rejected"] or 0

        acceptance_rate = (
            round((total_accepted / total_received) * 100.0, 2)
            if total_received > 0
            else 100.0
        )

        p95_latency = round(aggregates["max_p95"] or 0.0, 2)
        active_sources_count = queryset.values("source_slug").distinct().count()

        summary_data = {
            "window_minutes": window_minutes,
            "total_received": total_received,
            "total_accepted": total_accepted,
            "total_duplicates": total_duplicates,
            "total_rejected": total_rejected,
            "acceptance_rate_pct": acceptance_rate,
            "p95_latency_ms": p95_latency,
            "rejections_by_category": {
                "auth": aggregates["sum_auth"] or 0,
                "rate_limit": aggregates["sum_rate"] or 0,
                "malformed": aggregates["sum_malf"] or 0,
                "inactive": aggregates["sum_inac"] or 0,
                "server_error": aggregates["sum_srvr"] or 0,
            },
            "active_sources_count": active_sources_count,
            "timestamp": timezone.now(),
        }

        serializer = IngestionSummarySerializer(summary_data)
        return Response(serializer.data, status=status.HTTP_200_OK)
