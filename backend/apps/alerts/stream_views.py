"""
SignalBridge — Server-Sent Events (SSE) Live Data Stream
=============================================================================
PURPOSE:
    Provides a real-time event stream (text/event-stream) pushing incident lifecycle
    events, alert correlation updates, and live KPI telemetry to connected clients.

ARCHITECTURAL SAFEGUARDS:
    1. Bypasses DRF Content Negotiation: Built as standard Django View returning StreamingHttpResponse.
    2. Connection Bounded Lifetime: Automatically caps each connection at ~50 seconds so EventSource
       reconnects cleanly, preventing worker thread exhaustion on small compute instances (t3.small).
    3. Heartbeat Keep-Alive: Emits heartbeat ping comment every 10s to keep CloudFront and Nginx alive.
=============================================================================
"""
import json
import logging
import time
from datetime import timedelta

from django.http import StreamingHttpResponse
from django.utils import timezone
from django.views import View

from apps.alerts.models import Incident

logger = logging.getLogger(__name__)


def generate_live_stream_events():
    """
    Generator yielding Server-Sent Events with periodic telemetry and heartbeat pulses.
    Bounded to 25 iterations * 2s = 50s total streaming session.
    """
    # 1. Yield client reconnection delay hint (3000ms)
    yield "retry: 3000\n\n"

    # 2. Yield initial connection acknowledgment
    initial_event = {
        "event": "connected",
        "timestamp": timezone.now().isoformat(),
        "message": "SignalBridge live telemetry stream established",
    }
    yield f"event: connected\ndata: {json.dumps(initial_event)}\n\n"

    last_check = timezone.now() - timedelta(seconds=10)
    iterations = 25  # ~50 seconds total lifetime

    for i in range(iterations):
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

            # Heartbeat telemetry pulse every 10 seconds (every 5 iterations)
            if i % 5 == 0:
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
                # SSE standard comment to keep intermediaries active
                yield f": heartbeat {now.isoformat()}\n\n"

            last_check = now
            time.sleep(2.0)
        except GeneratorExit:
            logger.debug("[SSE Stream] Client disconnected gracefully.")
            break
        except Exception as exc:
            logger.warning(f"[SSE Stream] Error during event generation: {exc}")
            time.sleep(2.0)


class LiveEventStreamAPIView(View):
    """
    GET /api/v1/stream/
    Plain Django View returning StreamingHttpResponse with Content-Type: text/event-stream.
    Exempt from DRF parser and renderer negotiation.
    """

    def get(self, request, *args, **kwargs):
        response = StreamingHttpResponse(
            generate_live_stream_events(),
            content_type="text/event-stream; charset=utf-8",
        )
        response["Cache-Control"] = "no-cache, no-transform"
        response["X-Accel-Buffering"] = "no"
        response["Connection"] = "keep-alive"
        return response
