"""
===================================================================================
SignalBridge — Alert & Incident REST API Endpoints
===================================================================================
PURPOSE:
    Provides RESTful endpoints for the operator dashboard:
      - Incidents:
          GET  /api/v1/incidents/                  (list, filter, sort, paginate)
          GET  /api/v1/incidents/<id>/             (detail with alerts + events)
          POST /api/v1/incidents/<id>/acknowledge/ (state transition)
          POST /api/v1/incidents/<id>/assign/      (assignee update)
          POST /api/v1/incidents/<id>/resolve/     (resolution with notes)
          POST /api/v1/incidents/<id>/reopen/      (reopen with reason)
          POST /api/v1/incidents/<id>/notes/       (append operator note)
      - Alerts:
          GET  /api/v1/alerts/                     (list, filter, paginate)
          GET  /api/v1/alerts/<id>/                (detail)
          POST /api/v1/alerts/<id>/retry/          (manual retry)
      - Audit:
          GET  /api/v1/audit/                      (global chronological audit log)
===================================================================================
"""
import logging
from django.db import transaction
from django.db.models import Q
from django.utils import timezone
from rest_framework import status
from rest_framework.pagination import PageNumberPagination
from rest_framework.response import Response
from rest_framework.views import APIView
from rest_framework.permissions import AllowAny, IsAuthenticated
from drf_spectacular.utils import extend_schema, OpenApiParameter, OpenApiResponse

from apps.core.permissions import IsViewerOrHigher, IsOperatorOrHigher
from apps.alerts.models import Alert, Incident, IncidentEvent
from apps.alerts.serializers import (
    AlertDetailSerializer,
    AlertSummarySerializer,
    IncidentAcknowledgeSerializer,
    IncidentAddNoteSerializer,
    IncidentAssignSerializer,
    IncidentDetailSerializer,
    IncidentEventSerializer,
    IncidentListSerializer,
    IncidentReopenSerializer,
    IncidentResolveSerializer,
)

logger = logging.getLogger(__name__)


class StandardResultsSetPagination(PageNumberPagination):
    """Standard paginator for tabular operator views."""
    page_size = 20
    page_size_query_param = "page_size"
    max_page_size = 100


class IncidentListAPIView(APIView):
    """
    List and filter Incidents with pagination.
    Supports filtering by status, severity, service_name, search query, and sorting.
    """
    permission_classes = [IsViewerOrHigher]

    @extend_schema(
        summary="List Incidents",
        parameters=[
            OpenApiParameter("status", str, description="Filter by status (OPEN, ACKNOWLEDGED, RESOLVED)"),
            OpenApiParameter("severity", str, description="Filter by severity (CRITICAL, HIGH, MEDIUM, LOW)"),
            OpenApiParameter("service", str, description="Filter by service name"),
            OpenApiParameter("search", str, description="Search service name, fingerprint, or notes"),
            OpenApiParameter("ordering", str, description="Sort order (e.g. -last_seen_at, -alert_count)"),
            OpenApiParameter("page", int, description="Page number"),
            OpenApiParameter("page_size", int, description="Results per page (max 100)"),
        ],
        responses={200: IncidentListSerializer(many=True)},
    )
    def get(self, request):
        queryset = Incident.objects.all()

        # Filtering:
        status_param = request.query_params.get("status")
        if status_param:
            queryset = queryset.filter(status=status_param.upper())

        severity_param = request.query_params.get("severity")
        if severity_param:
            queryset = queryset.filter(severity=severity_param.upper())

        service_param = request.query_params.get("service")
        if service_param:
            queryset = queryset.filter(service_name__iexact=service_param)

        search_query = request.query_params.get("search")
        if search_query:
            queryset = queryset.filter(
                Q(service_name__icontains=search_query)
                | Q(fingerprint__icontains=search_query)
                | Q(resolution_notes__icontains=search_query)
                | Q(assigned_to__icontains=search_query)
            )

        # Ordering:
        ordering = request.query_params.get("ordering", "-last_seen_at")
        allowed_orderings = [
            "last_seen_at", "-last_seen_at",
            "first_seen_at", "-first_seen_at",
            "alert_count", "-alert_count",
            "severity", "-severity",
            "status", "-status",
        ]
        if ordering in allowed_orderings:
            queryset = queryset.order_by(ordering)
        else:
            queryset = queryset.order_by("-last_seen_at")

        paginator = StandardResultsSetPagination()
        page = paginator.paginate_queryset(queryset, request)
        serializer = IncidentListSerializer(page, many=True)
        return paginator.get_paginated_response(serializer.data)


class IncidentDetailAPIView(APIView):
    """
    Retrieve full details for an individual Incident, including correlated alerts and timeline events.
    """
    permission_classes = [IsViewerOrHigher]

    @extend_schema(
        summary="Retrieve Incident Detail",
        responses={
            200: IncidentDetailSerializer,
            404: OpenApiResponse(description="Incident not found"),
        },
    )
    def get(self, request, pk):
        try:
            incident = (
                Incident.objects.prefetch_related("alerts", "events")
                .get(pk=pk)
            )
        except Incident.DoesNotExist:
            return Response({"error": "Incident not found"}, status=status.HTTP_404_NOT_FOUND)

        serializer = IncidentDetailSerializer(incident)
        return Response(serializer.data, status=status.HTTP_200_OK)


class IncidentAcknowledgeAPIView(APIView):
    """
    Transitions an OPEN incident to ACKNOWLEDGED, indicating an operator is investigating.
    """
    permission_classes = [IsOperatorOrHigher]

    @extend_schema(
        summary="Acknowledge Incident",
        request=IncidentAcknowledgeSerializer,
        responses={200: IncidentDetailSerializer, 400: OpenApiResponse(description="Invalid transition")},
    )
    def post(self, request, pk):
        serializer = IncidentAcknowledgeSerializer(data=request.data)
        if not serializer.is_valid():
            return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)

        try:
            with transaction.atomic():
                incident = Incident.objects.select_for_update().get(pk=pk)
                if incident.status == Incident.IncidentStatus.RESOLVED:
                    return Response(
                        {"error": "Cannot acknowledge a resolved incident. Reopen it first."},
                        status=status.HTTP_400_BAD_REQUEST,
                    )

                old_status = incident.status
                incident.status = Incident.IncidentStatus.ACKNOWLEDGED
                incident.save(update_fields=["status", "updated_at"])

                raw_actor = serializer.validated_data.get("actor")
                actor = request.user.username if (request.user.is_authenticated and (not raw_actor or raw_actor == "operator")) else (raw_actor or "operator")
                note = serializer.validated_data.get("note", "")

                IncidentEvent.objects.create(
                    incident=incident,
                    event_type=IncidentEvent.EventType.ACKNOWLEDGED,
                    actor=actor,
                    description=f"Incident acknowledged by {actor}. {note}".strip(),
                )

                from apps.notifications.dispatch import safe_dispatch_incident_notification
                transaction.on_commit(
                    lambda inc=incident, act=actor, n=note: safe_dispatch_incident_notification(
                        inc, "ACKNOWLEDGED", {"actor": act, "note": n}
                    )
                )

            return Response(IncidentDetailSerializer(incident).data, status=status.HTTP_200_OK)
        except Incident.DoesNotExist:
            return Response({"error": "Incident not found"}, status=status.HTTP_404_NOT_FOUND)


class IncidentAssignAPIView(APIView):
    """
    Assigns an incident to an operator or on-call engineer.
    """
    permission_classes = [IsOperatorOrHigher]

    @extend_schema(
        summary="Assign Incident",
        request=IncidentAssignSerializer,
        responses={200: IncidentDetailSerializer},
    )
    def post(self, request, pk):
        serializer = IncidentAssignSerializer(data=request.data)
        if not serializer.is_valid():
            return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)

        try:
            with transaction.atomic():
                incident = Incident.objects.select_for_update().get(pk=pk)
                new_assignee = serializer.validated_data["assigned_to"]
                old_assignee = incident.assigned_to

                incident.assigned_to = new_assignee
                incident.save(update_fields=["assigned_to", "updated_at"])

                raw_actor = serializer.validated_data.get("actor")
                actor = request.user.username if (request.user.is_authenticated and (not raw_actor or raw_actor == "operator")) else (raw_actor or "operator")
                note = serializer.validated_data.get("note", "")

                IncidentEvent.objects.create(
                    incident=incident,
                    event_type=IncidentEvent.EventType.ASSIGNED,
                    actor=actor,
                    description=f"Reassigned from '{old_assignee or 'unassigned'}' to '{new_assignee}'. {note}".strip(),
                )

            return Response(IncidentDetailSerializer(incident).data, status=status.HTTP_200_OK)
        except Incident.DoesNotExist:
            return Response({"error": "Incident not found"}, status=status.HTTP_404_NOT_FOUND)


class IncidentResolveAPIView(APIView):
    """
    Resolves an active incident with required root cause resolution notes.
    """
    permission_classes = [IsOperatorOrHigher]

    @extend_schema(
        summary="Resolve Incident",
        request=IncidentResolveSerializer,
        responses={200: IncidentDetailSerializer},
    )
    def post(self, request, pk):
        serializer = IncidentResolveSerializer(data=request.data)
        if not serializer.is_valid():
            return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)

        try:
            with transaction.atomic():
                incident = Incident.objects.select_for_update().get(pk=pk)
                old_status = incident.status
                resolution_notes = serializer.validated_data["resolution_notes"]

                incident.status = Incident.IncidentStatus.RESOLVED
                incident.resolution_notes = resolution_notes
                incident.save(update_fields=["status", "resolution_notes", "updated_at"])

                raw_actor = serializer.validated_data.get("actor")
                actor = request.user.username if (request.user.is_authenticated and (not raw_actor or raw_actor == "operator")) else (raw_actor or "operator")

                IncidentEvent.objects.create(
                    incident=incident,
                    event_type=IncidentEvent.EventType.RESOLVED,
                    actor=actor,
                    description=f"Incident resolved by {actor}: {resolution_notes}",
                )

                from apps.notifications.dispatch import safe_dispatch_incident_notification
                transaction.on_commit(
                    lambda inc=incident, act=actor, notes=resolution_notes: safe_dispatch_incident_notification(
                        inc, "RESOLVED", {"actor": act, "resolution_notes": notes}
                    )
                )

            return Response(IncidentDetailSerializer(incident).data, status=status.HTTP_200_OK)
        except Incident.DoesNotExist:
            return Response({"error": "Incident not found"}, status=status.HTTP_404_NOT_FOUND)


class IncidentReopenAPIView(APIView):
    """
    Manually reopens a previously resolved incident with justification.
    """
    permission_classes = [IsOperatorOrHigher]

    @extend_schema(
        summary="Reopen Incident",
        request=IncidentReopenSerializer,
        responses={200: IncidentDetailSerializer},
    )
    def post(self, request, pk):
        serializer = IncidentReopenSerializer(data=request.data)
        if not serializer.is_valid():
            return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)

        try:
            with transaction.atomic():
                incident = Incident.objects.select_for_update().get(pk=pk)
                old_status = incident.status
                reason = serializer.validated_data["reason"]

                incident.status = Incident.IncidentStatus.OPEN
                incident.last_seen_at = timezone.now()
                incident.save(update_fields=["status", "last_seen_at", "updated_at"])

                raw_actor = serializer.validated_data.get("actor")
                actor = request.user.username if (request.user.is_authenticated and (not raw_actor or raw_actor == "operator")) else (raw_actor or "operator")

                IncidentEvent.objects.create(
                    incident=incident,
                    event_type=IncidentEvent.EventType.REOPENED,
                    actor=actor,
                    description=f"Incident manually reopened by {actor}: {reason}",
                )

                from apps.notifications.dispatch import safe_dispatch_incident_notification
                transaction.on_commit(
                    lambda inc=incident, act=actor, r=reason: safe_dispatch_incident_notification(
                        inc, "REOPENED", {"actor": act, "reason": r, "trigger": "manual_operator"}
                    )
                )

            return Response(IncidentDetailSerializer(incident).data, status=status.HTTP_200_OK)
        except Incident.DoesNotExist:
            return Response({"error": "Incident not found"}, status=status.HTTP_404_NOT_FOUND)


class IncidentAddNoteAPIView(APIView):
    """
    Appends an operator investigation note to the incident timeline.
    """
    permission_classes = [IsOperatorOrHigher]

    @extend_schema(
        summary="Add Note to Incident",
        request=IncidentAddNoteSerializer,
        responses={201: IncidentEventSerializer},
    )
    def post(self, request, pk):
        serializer = IncidentAddNoteSerializer(data=request.data)
        if not serializer.is_valid():
            return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)

        try:
            incident = Incident.objects.get(pk=pk)
            note = serializer.validated_data["note"]
            raw_actor = serializer.validated_data.get("actor")
            actor = request.user.username if (request.user.is_authenticated and (not raw_actor or raw_actor == "operator")) else (raw_actor or "operator")

            event = IncidentEvent.objects.create(
                incident=incident,
                event_type=IncidentEvent.EventType.NOTE_ADDED,
                actor=actor,
                description=note,
            )

            return Response(IncidentEventSerializer(event).data, status=status.HTTP_201_CREATED)
        except Incident.DoesNotExist:
            return Response({"error": "Incident not found"}, status=status.HTTP_404_NOT_FOUND)


class AlertListAPIView(APIView):
    """
    Lists alerts with pagination and filtering by service, severity, incident_id, and search query.
    """
    permission_classes = [IsViewerOrHigher]

    @extend_schema(
        summary="List Alerts",
        parameters=[
            OpenApiParameter("incident_id", str, description="Filter by parent incident UUID"),
            OpenApiParameter("service", str, description="Filter by service name"),
            OpenApiParameter("severity", str, description="Filter by severity (CRITICAL, HIGH, etc)"),
            OpenApiParameter("search", str, description="Search title or external_id"),
            OpenApiParameter("page", int, description="Page number"),
            OpenApiParameter("page_size", int, description="Results per page (max 100)"),
        ],
        responses={200: AlertSummarySerializer(many=True)},
    )
    def get(self, request):
        queryset = Alert.objects.select_related("source", "payload", "incident").all()

        incident_id = request.query_params.get("incident_id")
        if incident_id:
            queryset = queryset.filter(incident_id=incident_id)

        service = request.query_params.get("service")
        if service:
            queryset = queryset.filter(service_name__iexact=service)

        severity = request.query_params.get("severity")
        if severity:
            queryset = queryset.filter(severity=severity.upper())

        search = request.query_params.get("search")
        if search:
            queryset = queryset.filter(
                Q(title__icontains=search)
                | Q(external_id__icontains=search)
                | Q(service_name__icontains=search)
                | Q(fingerprint__icontains=search)
            )

        queryset = queryset.order_by("-created_at")

        paginator = StandardResultsSetPagination()
        page = paginator.paginate_queryset(queryset, request)
        serializer = AlertSummarySerializer(page, many=True)
        return paginator.get_paginated_response(serializer.data)


class AlertDetailAPIView(APIView):
    """
    Retrieve full details for an individual Alert record.
    """
    permission_classes = [IsViewerOrHigher]

    @extend_schema(
        summary="Retrieve Alert Detail",
        responses={200: AlertDetailSerializer, 404: OpenApiResponse(description="Alert not found")},
    )
    def get(self, request, pk):
        try:
            alert = Alert.objects.select_related("source", "payload", "incident").get(pk=pk)
            serializer = AlertDetailSerializer(alert)
            return Response(serializer.data, status=status.HTTP_200_OK)
        except Alert.DoesNotExist:
            return Response({"error": "Alert not found"}, status=status.HTTP_404_NOT_FOUND)


class AlertRetryAPIView(APIView):
    """
    Manually retries processing for an alert by re-enqueueing its raw IngestedPayload into Celery.
    """
    permission_classes = [IsOperatorOrHigher]
    serializer_class = None

    @extend_schema(
        summary="Retry Alert Ingestion",
        responses={
            202: OpenApiResponse(description="Payload re-enqueued for asynchronous processing."),
            400: OpenApiResponse(description="Alert does not have an associated payload record."),
            404: OpenApiResponse(description="Alert not found"),
        },
    )
    def post(self, request, pk):
        try:
            alert = Alert.objects.select_related("payload").get(pk=pk)
            if not alert.payload:
                return Response(
                    {"error": "Alert has no associated IngestedPayload to retry."},
                    status=status.HTTP_400_BAD_REQUEST,
                )

            from apps.webhooks.tasks import process_webhook
            process_webhook.delay(payload_id=str(alert.payload.id))

            return Response({
                "status": "accepted",
                "message": f"Payload {alert.payload.id} re-enqueued for processing.",
                "payload_id": str(alert.payload.id),
                "tracking_id": alert.payload.tracking_id,
            }, status=status.HTTP_202_ACCEPTED)
        except Alert.DoesNotExist:
            return Response({"error": "Alert not found"}, status=status.HTTP_404_NOT_FOUND)


class AuditLogListAPIView(APIView):
    """
    Global chronological timeline of all IncidentEvents across the entire system.
    """
    permission_classes = [IsViewerOrHigher]

    @extend_schema(
        summary="List Audit Log Events",
        parameters=[
            OpenApiParameter("incident_id", str, description="Filter by incident UUID"),
            OpenApiParameter("event_type", str, description="Filter by event type"),
            OpenApiParameter("actor", str, description="Filter by actor"),
            OpenApiParameter("page", int, description="Page number"),
            OpenApiParameter("page_size", int, description="Results per page"),
        ],
        responses={200: IncidentEventSerializer(many=True)},
    )
    def get(self, request):
        queryset = IncidentEvent.objects.select_related("incident").all()

        incident_id = request.query_params.get("incident_id")
        if incident_id:
            queryset = queryset.filter(incident_id=incident_id)

        event_type = request.query_params.get("event_type")
        if event_type:
            queryset = queryset.filter(event_type=event_type.upper())

        actor = request.query_params.get("actor")
        if actor:
            queryset = queryset.filter(actor__iexact=actor)

        queryset = queryset.order_by("-created_at")

        paginator = StandardResultsSetPagination()
        page = paginator.paginate_queryset(queryset, request)
        serializer = IncidentEventSerializer(page, many=True)
        return paginator.get_paginated_response(serializer.data)
