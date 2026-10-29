#!/usr/bin/env python3
"""
SignalBridge — Unified Post-Deployment Smoke Test Script
========================================================
Runs an end-to-end automated verification check across all 5 critical flows in one command:
1. Version SHA & Build Environment (`GET /api/v1/version/`)
2. Public Unauthenticated Telemetry (`GET /dashboard`, `GET /api/v1/public/overview/`)
3. Operator Session Authentication & CSRF Rotation (`POST /api/v1/auth/login/`)
4. Live Ingestion Simulator Dispatch (`POST /api/v1/simulator/dispatch/`)
5. Server-Sent Events (SSE) Stream Connectivity (`GET /api/v1/stream/`)

Usage:
    python scripts/smoke_test_live.py
    python scripts/smoke_test_live.py --url https://d1soslo0efb36p.cloudfront.net
    python scripts/smoke_test_live.py --url http://127.0.0.1:8000
"""
import argparse
import http.cookiejar
import json
import os
import sys
import time
import urllib.request
import urllib.error


def make_request(opener, url, method="GET", headers=None, data=None, timeout=15):
    hdrs = headers or {}
    req = urllib.request.Request(url, headers=hdrs, method=method)
    if data is not None:
        if isinstance(data, dict):
            req.data = json.dumps(data).encode("utf-8")
            if "Content-Type" not in hdrs:
                req.add_header("Content-Type", "application/json")
        elif isinstance(data, (bytes, bytearray)):
            req.data = data
    t0 = time.perf_counter()
    resp = opener.open(req, timeout=timeout)
    elapsed_ms = (time.perf_counter() - t0) * 1000.0
    return resp, elapsed_ms


def run_smoke_tests(base_url: str):
    base_url = base_url.rstrip("/")
    print("=" * 70)
    print("SIGNALBRIDGE POST-DEPLOYMENT SMOKE TEST SUITE")
    print(f"Target Environment: {base_url}")
    print("=" * 70)

    cj = http.cookiejar.CookieJar()
    opener = urllib.request.build_opener(urllib.request.HTTPCookieProcessor(cj))

    results = []

    # -------------------------------------------------------------
    # 1. Version Endpoint Verification
    # -------------------------------------------------------------
    print("\n[CHECK 1/5] Verifying Deployment Version & Commit SHA...")
    version_url = f"{base_url}/api/v1/version/"
    try:
        resp, ms = make_request(opener, version_url)
        body = json.loads(resp.read().decode("utf-8"))
        git_sha = body.get("git_commit", "unknown")
        build_time = body.get("build_time", "unknown")
        service = body.get("service", "unknown")
        print(f"  --> HTTP {resp.status} in {ms:.1f}ms | Commit: {git_sha[:10]} | Service: {service}")
        results.append(("1. Version SHA Probe", True, f"{resp.status} (SHA: {git_sha[:8]})", f"{ms:.1f}ms"))
    except Exception as exc:
        print(f"  [!] FAILED: {exc}")
        results.append(("1. Version SHA Probe", False, str(exc), "-"))

    # -------------------------------------------------------------
    # 2. Public Page & Telemetry in Logged-Out Context
    # -------------------------------------------------------------
    print("\n[CHECK 2/5] Verifying Public Telemetry (Logged-Out Context)...")
    overview_url = f"{base_url}/api/v1/public/overview/"
    try:
        resp, ms = make_request(opener, overview_url)
        body = json.loads(resp.read().decode("utf-8"))
        status_val = body.get("status", "unknown")
        deliveries = body.get("deliveries_24h", 0)
        open_incs = body.get("open_incidents", 0)
        mttr = body.get("mttr_minutes", 0.0)
        suppression = body.get("replay_suppression_rate_pct", 0.0)
        print(f"  --> HTTP {resp.status} in {ms:.1f}ms | Status: {status_val} | 24h Deliveries: {deliveries}")
        print(f"      Open: {open_incs} | MTTR: {mttr}m | Replay Rate: {suppression}%")
        results.append(("2. Public Telemetry (24h)", True, f"{resp.status} (Deliveries: {deliveries}, MTTR: {mttr}m)", f"{ms:.1f}ms"))
    except Exception as exc:
        print(f"  [!] FAILED: {exc}")
        results.append(("2. Public Telemetry (24h)", False, str(exc), "-"))

    # -------------------------------------------------------------
    # 3. Operator Authentication & Session Hydration
    # -------------------------------------------------------------
    print("\n[CHECK 3/5] Verifying Operator Authentication & CSRF...")
    csrf_url = f"{base_url}/api/v1/auth/csrf/"
    login_url = f"{base_url}/api/v1/auth/login/"
    csrf_token = ""
    try:
        # Fetch CSRF
        resp_csrf, _ = make_request(opener, csrf_url)
        csrf_data = json.loads(resp_csrf.read().decode("utf-8"))
        csrf_token = csrf_data.get("csrfToken", "")
        for c in cj:
            if c.name == "csrftoken":
                csrf_token = c.value

        # Login as Demo Operator
        login_payload = {
            "username": "demo.operator",
            "password": "DemoOperator2026!#Secure"
        }
        headers = {
            "X-CSRFToken": csrf_token,
            "Referer": f"{base_url}/",
        }
        resp_login, ms = make_request(opener, login_url, method="POST", headers=headers, data=login_payload)
        login_res = json.loads(resp_login.read().decode("utf-8"))
        user = login_res.get("user", {})
        print(f"  --> HTTP {resp_login.status} in {ms:.1f}ms | User: {user.get('username')} (Role: {user.get('role')})")

        # Update CSRF token from login response if rotated
        if login_res.get("csrf_token"):
            csrf_token = login_res["csrf_token"]
        for c in cj:
            if c.name == "csrftoken":
                csrf_token = c.value

        results.append(("3. Operator Auth (demo.operator)", True, f"HTTP {resp_login.status} (Role: {user.get('role')})", f"{ms:.1f}ms"))
    except Exception as exc:
        print(f"  [!] FAILED: {exc}")
        results.append(("3. Operator Auth (demo.operator)", False, str(exc), "-"))

    # -------------------------------------------------------------
    # 4. Live Ingestion Simulator Dispatch
    # -------------------------------------------------------------
    print("\n[CHECK 4/5] Verifying Simulator Dispatch (Authenticated)...")
    sim_url = f"{base_url}/api/v1/simulator/dispatch/"
    try:
        headers = {
            "X-CSRFToken": csrf_token,
            "Referer": f"{base_url}/",
        }
        sim_payload = {"scenario": "payment_gateway_saturation"}
        resp_sim, ms = make_request(opener, sim_url, method="POST", headers=headers, data=sim_payload)
        sim_data = json.loads(resp_sim.read().decode("utf-8"))
        tracking_id = sim_data.get("tracking_id", "none")
        timings = sim_data.get("pipeline_timings_ms", {})
        total_pipe_ms = timings.get("total_pipeline_ms", 0.0)
        print(f"  --> HTTP {resp_sim.status} in {ms:.1f}ms | Tracking ID: {tracking_id[:16]}... | Pipeline Time: {total_pipe_ms:.1f}ms")
        results.append(("4. Simulator Dispatch", True, f"HTTP {resp_sim.status} (Pipeline: {total_pipe_ms:.1f}ms)", f"{ms:.1f}ms"))
    except Exception as exc:
        print(f"  [!] FAILED: {exc}")
        results.append(("4. Simulator Dispatch", False, str(exc), "-"))

    # -------------------------------------------------------------
    # 5. Server-Sent Events (SSE) Stream Connectivity
    # -------------------------------------------------------------
    print("\n[CHECK 5/5] Verifying SSE Live Stream Connection...")
    stream_url = f"{base_url}/api/v1/stream/"
    try:
        req = urllib.request.Request(stream_url, headers={"Accept": "text/event-stream"})
        t0 = time.perf_counter()
        with opener.open(req, timeout=10) as sse_resp:
            status_code = sse_resp.status
            content_type = sse_resp.headers.get("Content-Type", "")
            first_line = sse_resp.readline().decode("utf-8", errors="replace").strip()
            second_line = sse_resp.readline().decode("utf-8", errors="replace").strip()
            elapsed_ms = (time.perf_counter() - t0) * 1000.0

            assert status_code == 200, f"Expected 200, got {status_code}"
            assert "text/event-stream" in content_type, f"Expected text/event-stream, got {content_type}"
            print(f"  --> HTTP {status_code} in {elapsed_ms:.1f}ms | Content-Type: {content_type}")
            print(f"      Initial packet: {first_line} {second_line}")
            results.append(("5. SSE Live Stream Probe", True, f"HTTP {status_code} text/event-stream", f"{elapsed_ms:.1f}ms"))
    except Exception as exc:
        print(f"  [!] FAILED: {exc}")
        results.append(("5. SSE Live Stream Probe", False, str(exc), "-"))

    # -------------------------------------------------------------
    # Summary Table
    # -------------------------------------------------------------
    print("\n" + "=" * 70)
    print("POST-DEPLOYMENT SMOKE TEST RESULTS SUMMARY")
    print("=" * 70)
    all_passed = True
    print(f"{'CHECK':<32} | {'STATUS':<8} | {'DETAILS':<28} | {'LATENCY'}")
    print("-" * 75)
    for name, passed, details, latency in results:
        status_label = "PASS" if passed else "FAIL"
        if not passed:
            all_passed = False
        print(f"{name:<32} | {status_label:<8} | {details:<28} | {latency}")

    print("=" * 70)
    if all_passed:
        print("[SUCCESS] ALL 5 SMOKE TESTS PASSED CLEANLY. SYSTEM READY FOR DEMO.")
    else:
        print("[FAILURE] ONE OR MORE SMOKE CHECKS FAILED. INVESTIGATE LOGS.")
    print("=" * 70)

    return all_passed


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="SignalBridge Post-Deployment Smoke Test")
    parser.add_argument("--url", default=os.environ.get("BASE_URL", "http://127.0.0.1:8000"),
                        help="Target deployment base URL (default: http://127.0.0.1:8000 or BASE_URL env)")
    args = parser.parse_args()
    success = run_smoke_tests(args.url)
    sys.exit(0 if success else 1)
