"""
SignalBridge — Server-Sent Events (SSE) Live Data Stream
=============================================================================
PURPOSE:
    Provides a real-time event stream (text/event-stream) pushing incident lifecycle
    events, alert correlation updates, and live KPI telemetry to connected clients.

ARCHITECTURAL SAFEGUARDS:
    1. Bypasses DRF Content Negotiation: Built as standard Django View returning StreamingHttpResponse.
    2. Concurrent Stream Hard Cap (20 Streams): Protects server resources by returning HTTP 429 with
       an explicit fallback signal ('X-SignalBridge-Fallback: polling') when 20 connections are active.
    3. Zero DB Connection Holding: Explicitly closes database connections before each sleep iteration,
       preventing pool exhaustion on PostgreSQL and keeping SQLite free of locks.
    4. Connection Bounded Lifetime: Automatically caps each connection at ~50 seconds so EventSource
       reconnects cleanly, preventing worker thread exhaustion on small compute instances (t3.small).
    5. Heartbeat Keep-Alive: Emits heartbeat ping comment every 10s to keep CloudFront and Nginx alive.
=============================================================================
"""
import json
import logging
import threading
import time
from datetime import timedelta

from django.db import connection, close_old_connections
from django.http import StreamingHttpResponse, JsonResponse
from django.utils import timezone
from django.views import View

from apps.alerts.models import Incident

logger = logging.getLogger(__name__)

# Concurrent stream limits
MAX_CONCURRENT_SSE_STREAMS = 20
_sse_lock = threading.Lock()
_active_sse_streams = 0


def get_active_sse_count() -> int:
    with _sse_lock:
        return _active_sse_streams


def acquire_sse_slot() -> bool:
    global _active_sse_streams
    with _sse_lock:
        if _active_sse_streams >= MAX_CONCURRENT_SSE_STREAMS:
            return False
        _active_sse_streams += 1
        logger.info(f"[SSE Stream] Acquired slot. Active streams: {_active_sse_streams}/{MAX_CONCURRENT_SSE_STREAMS}")
        return True


def release_sse_slot():
    global _active_sse_streams
    with _sse_lock:
        if _active_sse_streams > 0:
            _active_sse_streams -= 1
        logger.info(f"[SSE Stream] Released slot. Active streams: {_active_sse_streams}/{MAX_CONCURRENT_SSE_STREAMS}")


def generate_live_stream_events():
    """
    Generator yielding Server-Sent Events with periodic telemetry and heartbeat pulses.
    Bounded to 25 iterations * 2s = 50s total streaming session.
    Guarantees database connections are released before every sleep.
    """
    # 1. Yield client reconnection delay hint (3000ms)
    yield "retry: 3000\n\n"

    # 2. Yield initial connection acknowledgment
    initial_event = {
        "event": "connected",
        "timestamp": timezone.now().isoformat(),
        "message": "SignalBridge live telemetry stream established",
        "max_concurrent_streams": MAX_CONCURRENT_SSE_STREAMS,
    }
    yield f"event: connected\ndata: {json.dumps(initial_event)}\n\n"

    last_check = timezone.now() - timedelta(seconds=10)
    iterations = 25  # ~50 seconds total lifetime

    for i in range(iterations):
        try:
            now = timezone.now()

            # Query incidents modified since last check
            recent_incidents = list(
                Incident.objects.filter(updated_at__gte=last_check)
                .order_by("-last_seen_at")[:10]
            )
            if recent_incidents:
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

        except GeneratorExit:
            logger.debug("[SSE Stream] Client disconnected gracefully.")
            break
        except Exception as exc:
            logger.warning(f"[SSE Stream] Error during event generation: {exc}")
        finally:
            # CRITICAL: Always close/release database connections before entering sleep
            close_old_connections()
            try:
                connection.close()
            except Exception:
                pass

        time.sleep(2.0)


class LiveEventStreamAPIView(View):
    """
    GET /api/v1/stream/
    Plain Django View returning StreamingHttpResponse with Content-Type: text/event-stream.
    Exempt from DRF parser and renderer negotiation.
    Enforces MAX_CONCURRENT_SSE_STREAMS (20) cap with HTTP 429 fallback.
    """

    def get(self, request, *args, **kwargs):
        if not acquire_sse_slot():
            response = JsonResponse(
                {
                    "error": "SSE connection limit reached (maximum 20 concurrent streams active).",
                    "fallback": "polling",
                    "retry_after_seconds": 10,
                },
                status=429,
            )
            response["Retry-After"] = "10"
            response["X-SignalBridge-Fallback"] = "polling"
            return response

        def stream_with_cleanup():
            try:
                yield from generate_live_stream_events()
            finally:
                release_sse_slot()
                close_old_connections()
                try:
                    connection.close()
                except Exception:
                    pass

        response = StreamingHttpResponse(
            stream_with_cleanup(),
            content_type="text/event-stream; charset=utf-8",
        )
        response["Cache-Control"] = "no-cache, no-transform"
        response["X-Accel-Buffering"] = "no"
        return response
