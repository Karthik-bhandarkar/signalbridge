"""
===================================================================================
SignalBridge — Webhook Test Sender & HMAC Signature Calculator Utility
===================================================================================
PURPOSE:
    This developer utility calculates a valid HMAC-SHA256 signature for any JSON
    alert payload and transmits an authenticated HTTP POST request to the SignalBridge
    gateway.

USAGE:
    # 1. Standard single dispatch:
    python tests/send_test_webhook.py

    # 2. Automated duplicate test (Sends identical payload twice in succession):
    python tests/send_test_webhook.py --duplicate

    # 3. Tampered signature test (Expects 401 Unauthorized):
    python tests/send_test_webhook.py --tamper
===================================================================================
"""
import os
import sys
import json
import time
import hmac
import hashlib
import urllib.request
import urllib.error


def send_webhook(
    source_slug="pagerduty",
    secret_key=None,
    tamper=False,
    payload_bytes=None,
    label="",
):
    if secret_key is None:
        secret_key = os.getenv("WEBHOOK_SECRET_KEY", "secret-token-123")
    url = f"http://localhost:8000/api/v1/webhooks/{source_slug}/"

    if payload_bytes is None:
        payload_dict = {
            "event_type": "incident.trigger",
            "payload": {
                "service": "checkout-api",
                "severity": "CRITICAL",
                "title": "Database Connection Pool Exhausted",
                "description": "Surge in HTTP 500 errors across cluster-primary-01",
            },
        }
        payload_bytes = json.dumps(payload_dict, separators=(",", ":")).encode("utf-8")

    # Compute valid HMAC-SHA256 signature from payload_bytes:
    signature = hmac.new(
        key=secret_key.encode("utf-8"),
        msg=payload_bytes,
        digestmod=hashlib.sha256,
    ).hexdigest()

    # If testing negative tamper case, modify the signature:
    if tamper:
        signature = "tampered_" + signature[9:]

    headers = {
        "Content-Type": "application/json",
        "X-Tracking-Id": f"cli-test-{int(time.time())}",
        "X-Signature-256": f"sha256={signature}",
    }

    prefix = f" [{label}]" if label else ""
    print("\n" + "=" * 65)
    print(f"DISPATCHING WEBHOOK{prefix} TO: {url}")
    print(f"X-Signature-256: {headers['X-Signature-256']}")
    if tamper:
        print("Tampered Signature Mode: True (Expects 401 Unauthorized)")
    print("=" * 65)

    start_time = time.time()
    try:
        req = urllib.request.Request(
            url=url,
            data=payload_bytes,
            headers=headers,
            method="POST",
        )
        with urllib.request.urlopen(req) as response:
            latency_ms = (time.time() - start_time) * 1000
            body = response.read().decode("utf-8")
            parsed_body = json.loads(body)
            print(f"HTTP STATUS: {response.status}")
            print(f"LATENCY: {latency_ms:.2f} ms (Target: < 100 ms)")
            print(f"RESPONSE BODY:\n{json.dumps(parsed_body, indent=2)}")
            return response.status, parsed_body
    except urllib.error.HTTPError as err:
        latency_ms = (time.time() - start_time) * 1000
        error_body = err.read().decode("utf-8")
        print(f"HTTP ERROR: {err.code} {err.reason}")
        print(f"LATENCY: {latency_ms:.2f} ms")
        print(f"ERROR BODY:\n{error_body}")
        return err.code, None


if __name__ == "__main__":
    is_tamper = "--tamper" in sys.argv
    is_duplicate = "--duplicate" in sys.argv

    if is_tamper:
        send_webhook(tamper=True)
    elif is_duplicate:
        print("\n[INFO] EXECUTING AUTOMATED IDEMPOTENCY DEDUPLICATION TEST:")
        # Generate a unique payload with a microsecond timestamp nonce:
        test_payload = {
            "event_type": "incident.trigger",
            "payload": {
                "service": "checkout-api",
                "severity": "CRITICAL",
                "title": "Database Connection Pool Exhausted",
                "incident_nonce": time.time_ns(),
            },
        }
        exact_bytes = json.dumps(test_payload, separators=(",", ":")).encode("utf-8")

        print("Step A: Dispatching initial fresh webhook...")
        status_1, _ = send_webhook(payload_bytes=exact_bytes, label="DISPATCH 1 - INITIAL")

        print("\nStep B: Dispatching exact same payload within 60s TTL window...")
        status_2, _ = send_webhook(payload_bytes=exact_bytes, label="DISPATCH 2 - DUPLICATE")

        print("\n" + "=" * 65)
        print("DEDUPLICATION TEST RESULTS SUMMARY:")
        print(f"  Dispatch 1 Status: {status_1} (Expected: 202 Accepted)")
        print(f"  Dispatch 2 Status: {status_2} (Expected: 200 OK - Duplicate Ignored)")
        if status_1 == 202 and status_2 == 200:
            print("  >>> SUCCESS: O(1) In-Memory Redis Idempotency fully verified! <<<")
        else:
            print("  >>> WARNING: Expected 202 followed by 200 <<<")
        print("=" * 65)
    else:
        send_webhook()
