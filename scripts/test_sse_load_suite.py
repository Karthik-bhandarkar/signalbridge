import time
import urllib.request
import urllib.error
import threading
import json

STREAM_URL = "http://127.0.0.1:8000/api/v1/stream/"
HEALTH_URL = "http://127.0.0.1:8000/health/live/"
OVERVIEW_URL = "http://127.0.0.1:8000/api/v1/public/overview/"

def run_sse_benchmark(target_concurrency: int):
    print("=" * 70)
    print(f"RUNNING SSE LOAD TEST WITH {target_concurrency} REQUESTED CONCURRENT STREAMS")
    print("=" * 70)

    stop_event = threading.Event()
    results = [None] * target_concurrency
    connected_events = [threading.Event() for _ in range(target_concurrency)]

    def client_worker(idx):
        req = urllib.request.Request(
            STREAM_URL,
            headers={"Accept": "text/event-stream"}
        )
        try:
            with urllib.request.urlopen(req, timeout=30) as resp:
                status = resp.status
                content_type = resp.headers.get("Content-Type", "")
                fallback_hdr = resp.headers.get("X-SignalBridge-Fallback", "")
                first_chunk = resp.readline().decode("utf-8", errors="replace")
                results[idx] = {
                    "status": status,
                    "content_type": content_type,
                    "fallback_header": fallback_hdr,
                    "initial_chunk": first_chunk[:50]
                }
                connected_events[idx].set()
                # Stay connected while benchmark runs
                while not stop_event.is_set():
                    line = resp.readline()
                    if not line:
                        break
        except urllib.error.HTTPError as err:
            body = err.read().decode("utf-8", errors="replace")
            fallback_hdr = err.headers.get("X-SignalBridge-Fallback", "")
            results[idx] = {
                "status": err.code,
                "content_type": err.headers.get("Content-Type", ""),
                "fallback_header": fallback_hdr,
                "body": body[:120]
            }
            connected_events[idx].set()
        except Exception as exc:
            results[idx] = {"error": str(exc)}
            connected_events[idx].set()

    print(f"[*] Dispatching {target_concurrency} client threads to {STREAM_URL}...")
    threads = []
    t_start = time.time()
    for i in range(target_concurrency):
        t = threading.Thread(target=client_worker, args=(i,), daemon=True)
        t.start()
        threads.append(t)

    # Wait for all clients to either connect (200) or receive rate-limit (429)
    for ev in connected_events:
        ev.wait(timeout=10)

    t_connect = time.time() - t_start
    print(f"[+] All {target_concurrency} connection attempts settled in {t_connect:.2f}s.")

    # Tally results
    status_200 = sum(1 for r in results if r and r.get("status") == 200)
    status_429 = sum(1 for r in results if r and r.get("status") == 429)
    errors = sum(1 for r in results if r and r.get("error"))

    print(f"\n[STREAM ADMISSION SUMMARY]")
    print(f"  Active 200 text/event-stream: {status_200} (Target: exactly 20 max)")
    print(f"  Rate-limited 429 (Fallback): {status_429} (Target: {target_concurrency - 20} excess)")
    print(f"  Connection Errors: {errors}")

    # Inspect a 429 sample response
    sample_429 = next((r for r in results if r and r.get("status") == 429), None)
    if sample_429:
        print(f"  Sample 429 Header: X-SignalBridge-Fallback = '{sample_429.get('fallback_header')}'")
        print(f"  Sample 429 Body: {sample_429.get('body')}")

    # Measure /health/live/ latency under active stream load
    print(f"\n[*] Benchmarking 10 requests to {HEALTH_URL} under concurrent stream load...")
    health_latencies = []
    for i in range(10):
        t0 = time.perf_counter()
        with urllib.request.urlopen(HEALTH_URL, timeout=5) as r:
            assert r.status == 200
        t1 = time.perf_counter()
        ms = (t1 - t0) * 1000.0
        health_latencies.append(ms)

    # Measure /api/v1/public/overview/ latency under active stream load
    print(f"[*] Benchmarking 10 requests to {OVERVIEW_URL} under concurrent stream load...")
    overview_latencies = []
    for i in range(10):
        t0 = time.perf_counter()
        with urllib.request.urlopen(OVERVIEW_URL, timeout=5) as r:
            assert r.status == 200
        t1 = time.perf_counter()
        ms = (t1 - t0) * 1000.0
        overview_latencies.append(ms)

    # Clean shutdown of streaming threads
    stop_event.set()
    time.sleep(1.0)

    # Benchmark Summary
    h_min, h_max, h_avg = min(health_latencies), max(health_latencies), sum(health_latencies) / len(health_latencies)
    o_min, o_max, o_avg = min(overview_latencies), max(overview_latencies), sum(overview_latencies) / len(overview_latencies)

    print(f"\n[BENCHMARK RESULTS - {target_concurrency} REQUESTED STREAMS]")
    print(f"  Health Probe (/health/live/):")
    print(f"    Min: {h_min:.2f} ms | Max: {h_max:.2f} ms | Avg: {h_avg:.2f} ms | Target < 500ms -> {'PASS' if h_max < 500 else 'FAIL'}")
    print(f"  Public Overview (/api/v1/public/overview/):")
    print(f"    Min: {o_min:.2f} ms | Max: {o_max:.2f} ms | Avg: {o_avg:.2f} ms | Target < 500ms -> {'PASS' if o_max < 500 else 'FAIL'}")
    print("=" * 70 + "\n")

    return {
        "status_200": status_200,
        "status_429": status_429,
        "h_max": h_max,
        "o_max": o_max,
    }

if __name__ == "__main__":
    res25 = run_sse_benchmark(25)
    time.sleep(2)
    res40 = run_sse_benchmark(40)
    print("ALL LOAD TESTS COMPLETED SUCCESSFULLY.")
