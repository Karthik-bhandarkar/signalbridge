import pytest
from django.test import Client


@pytest.mark.django_db
def test_live_stream_endpoint_returns_event_stream():
    client = Client()
    # Emulate browser EventSource request
    response = client.get("/api/v1/stream/", HTTP_ACCEPT="text/event-stream")
    assert response.status_code == 200
    assert "text/event-stream" in response.headers.get("Content-Type", "")
    assert response.headers.get("Cache-Control") == "no-cache, no-transform"
    assert response.headers.get("X-Accel-Buffering") == "no"

    # Consume the first chunk from the stream
    stream_content = b""
    for chunk in response.streaming_content:
        stream_content += chunk
        if b"event: connected" in stream_content:
            break

    assert b"retry: 3000" in stream_content
    assert b"event: connected" in stream_content
    assert b"SignalBridge live telemetry stream established" in stream_content

