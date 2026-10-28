"""
===================================================================================
SignalBridge — Server-Sent Events (SSE) Live Data Stream
===================================================================================
PURPOSE:
    Provides a real-time event stream (text/event-stream) pushing incident lifecycle
    events, alert correlation updates, and live KPI telemetry to connected clients.

CLIENT PROTOCOL:
    - Standard EventSource connection to /api/v1/stream/
    - Sends heartbeat ping every 10 seconds to prevent CloudFront / Nginx idle timeouts.
    - Emits 'incident_update' and 'telemetry_ping' events.
===================================================================================
"""
import json
import logging
import time
from datetime import timedelta

from django.http import StreamingHttpResponse
from django.utils import timezone
from rest_framework.views import APIView
from rest_framework.permissions import AllowAny

from apps.alerts.models import Incident
from apps.webhooks.models import IngestedPayload

logger = logging.getLogger(__name__)


def generate_live_stream_events():
    """
    Generator yielding Server-Sent Events with periodic telemetry and heartbeat pulses.
    """
    # 1. Yield initial connection acknowledgment
    initial_event = {
        "event": "connected",
        "timestamp": timezone.now().isoformat(),
        "message": "SignalBridge live telemetry stream established",
    }
    yield f"event: connected\ndata: {json.dumps(initial_event)}\n\n"

    last_check = timezone.now() - timedelta(seconds=10)

    # Stream loop (handles up to 60 iterations ~ 2 minutes per SSE cycle, client auto-reconnects)
    for _ in range(60):
        try:
            now = timezone.now()
            # Query incidents modified since last check
            recent_incidents = Incident.objects.filter(updated_at__gte=last_check).order_by("-last_seen_at")[:10]
            if recent_incidents.exists():
                payload = [
                    {
                        "id": str(inc.id),
                        "service_name": inc.service_name,
                        "fingerprint": inc.fingerprint,
                        "status": inc.status,
                        "severity": inc.severity,
                        "alert_count": inc.alert_count,
                        "is_simulated": inc.is_simulated,
                        "first_seen_at": inc.first_seen_at.isoformat() if inc.first_seen_at else None,
                        "last_seen_at": inc.last_seen_at.isoformat() if inc.last_seen_at else None,
                        "acknowledged_at": inc.acknowledged_at.isoformat() if inc.acknowledged_at else None,
                        "resolved_at": inc.resolved_at.isoformat() if inc.resolved_at else None,
                    }
                    for inc in recent_incidents
                ]
                yield f"event: incident_update\ndata: {json.dumps(payload)}\n\n"

            # Quick telemetry heartbeat
            open_count = Incident.objects.filter(status=Incident.IncidentStatus.OPEN).count()
            crit_count = Incident.objects.filter(
                status=Incident.IncidentStatus.OPEN,
                severity=Incident.SeverityLevel.CRITICAL
            ).count()

            heartbeat = {
                "timestamp": now.isoformat(),
                "open_incidents": open_count,
                "critical_open": crit_count,
            }
            yield f"event: ping\ndata: {json.dumps(heartbeat)}\n\n"

            last_check = now
            time.sleep(2.0)
        except GeneratorExit:
            break
        except Exception as exc:
            logger.warning(f"[SSE Stream] Error during event generation: {exc}")
            time.sleep(2.0)


class LiveEventStreamAPIView(APIView):
    """
    GET /api/v1/stream/
    Server-Sent Events endpoint pushing real-time incident updates.
    """
    permission_classes = [AllowAny]
    authentication_classes = []

    def get(self, request):
        response = StreamingHttpResponse(
            generate_live_stream_events(),
            content_type="text/event-stream",
        )
        response["Cache-Control"] = "no-cache, no-transform"
        response["X-Accel-Buffering"] = "no"
        response["Connection"] = "keep-alive"
        return response

