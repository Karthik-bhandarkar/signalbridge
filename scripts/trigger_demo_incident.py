"""
SignalBridge — Live Demo Incident Trigger
=========================================
Triggers a live, authentic HMAC-signed incident with a countdown,
so you can switch to your recording software and capture it appearing live!
"""
import hashlib
import hmac
import json
import os
import sys
import time
import urllib.request

AWS_ENDPOINT = os.environ.get("SIGNALBRIDGE_AWS_URL", "https://d1soslo0efb36p.cloudfront.net").rstrip("/")
SOURCE_SLUG = "pagerduty"
SECRET_KEY = "secret-token-123"

def compute_hmac(payload_bytes: bytes, secret: str) -> str:
    digest = hmac.new(secret.encode("utf-8"), payload_bytes, hashlib.sha256).hexdigest()
    return f"sha256={digest}"

def trigger_live_incident(service="checkout-service", title="Database Connection Spike & P99 Latency Breach"):
    run_id = int(time.time())
    fingerprint = f"db-pool-saturation-{run_id}"

    payload = {
        "tracking_id": f"demo-trace-{run_id}",
        "event_type": "incident.trigger",
        "payload": {
            "service": service,
            "title": title,
            "description": "PgBouncer active pool saturated at 98.4%. P99 latency breached 2850ms.",
            "severity": "CRITICAL",
            "fingerprint": fingerprint,
            "external_id": f"alert-{run_id}",
            "dedup_key": f"dedup-{run_id}",
            "environment": "production",
            "region": "ap-southeast-2",
            "metrics": {
                "p99_latency_ms": 2850,
                "active_connections": 196,
                "max_connections": 200,
                "error_rate_pct": 8.7
            }
        }
    }

    body = json.dumps(payload).encode("utf-8")
    sig = compute_hmac(body, SECRET_KEY)

    req = urllib.request.Request(
        f"{AWS_ENDPOINT}/api/v1/webhooks/{SOURCE_SLUG}/",
        data=body,
        headers={
            "Content-Type": "application/json",
            "X-Signature-SHA256": sig,
            "X-Signature-256": sig,
            "User-Agent": "SignalBridge-Demo-Trigger/1.0"
        },
        method="POST"
    )

    with urllib.request.urlopen(req, timeout=10) as resp:
        return resp.status, json.loads(resp.read().decode())

def main():
    print("=" * 65)
    print(" 🎬 SIGNALBRIDGE LIVE DEMO INCIDENT TRIGGER")
    print(f" Target: {AWS_ENDPOINT}")
    print("=" * 65)
    print("\nStarting 5-second countdown... Switch to your browser now!\n")
    for i in range(5, 0, -1):
        print(f"  [ {i} seconds ] ... Get ready to record!")
        time.sleep(1)

    print("\n🚀 FIRING LIVE INCIDENT INTO AWS PRODUCTION...")
    status, res = trigger_live_incident()
    print(f"\n✅ SUCCESS (HTTP {status})!")
    print(f"Tracking ID: {res.get('tracking_id') or res.get('payload_id')}")
    print("Look at your dashboard — the incident is now appearing live!")
    print("=" * 65)

if __name__ == "__main__":
    main()

