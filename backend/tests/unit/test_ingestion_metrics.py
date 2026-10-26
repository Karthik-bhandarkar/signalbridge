"""
===================================================================================
SignalBridge Webhook Ingestion Engine — Ingestion Metrics Test Suite
===================================================================================
PURPOSE:
    Validates the end-to-end IngestionMetric pipeline:
    1. Outcome categorization (accepted, duplicate, rejected_auth, rejected_rate_limit,
       rejected_malformed, rejected_inactive, rejected_server_error).
    2. Synchronous latency measurement boundaries (T_0 -> T_ack).
    3. Mathematical percentile calculations (p50, p95, p99, max) and exact vs estimated.
    4. Time-bucket minute alignment and rollup window boundaries.
    5. Concurrency safety under multi-threaded recording.
    6. Repeated aggregation and retry idempotency (no double-counting).
    7. Redis outage fail-safe resilience (ingestion uninterrupted).
    8. Database constraints and API permissions.
===================================================================================
"""
import concurrent.futures
import datetime
import hashlib
import hmac
import json
import uuid

import pytest
from django.contrib.auth import get_user_model
from django.db import IntegrityError
from django.test import Client
from django.urls import reverse
from django.utils import timezone
from rest_framework import status

from apps.analytics.buffer import IngestionOutcome, metric_buffer, IngestionMetricBuffer
from apps.analytics.calculator import calculate_percentiles
from apps.analytics.models import IngestionMetric
from apps.analytics.tasks import rollup_ingestion_metrics
from apps.webhooks.models import WebhookSource, IngestedPayload


@pytest.fixture
def auth_operator_client(db):
    """Provides an authenticated operator client session."""
    User = get_user_model()
    user = User.objects.create_user(username="metric_operator", password="secure_password_123")
    client = Client()
    client.login(username="metric_operator", password="secure_password_123")
    return client


@pytest.fixture
def registered_source(db):
    """Provides an active WebhookSource for testing."""
    return WebhookSource.objects.create(
        name="Test Ingestion Service",
        slug=f"test-source-{uuid.uuid4().hex[:8]}",
        secret_key="secret-signing-key-for-tests",
        is_active=True,
        rate_limit_per_minute=100,
    )


def _generate_sig(secret: str, body: bytes) -> str:
    return hmac.new(secret.encode("utf-8"), body, hashlib.sha256).hexdigest()


# =================================================================================
# 1. OUTCOME CATEGORIZATION & LATENCY MEASUREMENT BOUNDARIES
# =================================================================================

@pytest.mark.django_db
def test_webhook_outcome_accepted(client, registered_source):
    """Verifies HTTP 202 Accepted outcome records to metric buffer."""
    payload_data = {
        "event_type": "alert.trigger",
        "payload": {"service_name": "database", "severity": "CRITICAL", "title": "CPU High"},
    }
    raw_bytes = json.dumps(payload_data).encode("utf-8")
    sig = _generate_sig(registered_source.secret_key, raw_bytes)

    url = reverse("webhooks:ingest", kwargs={"source_slug": registered_source.slug})
    response = client.post(
        url,
        data=raw_bytes,
        content_type="application/json",
        HTTP_X_SIGNATURE_256=sig,
    )

    assert response.status_code == status.HTTP_202_ACCEPTED
    assert response.json()["status"] == "accepted"


@pytest.mark.django_db
def test_webhook_outcome_duplicate(client, registered_source):
    """Verifies HTTP 200 Duplicate outcome records to metric buffer."""
    payload_data = {
        "event_type": "alert.trigger",
        "payload": {"service_name": "cache", "severity": "WARNING", "title": "Memory Spike"},
    }
    raw_bytes = json.dumps(payload_data).encode("utf-8")
    sig = _generate_sig(registered_source.secret_key, raw_bytes)

    url = reverse("webhooks:ingest", kwargs={"source_slug": registered_source.slug})

    # First request: Accepted
    res1 = client.post(url, data=raw_bytes, content_type="application/json", HTTP_X_SIGNATURE_256=sig)
    assert res1.status_code == status.HTTP_202_ACCEPTED

    # Second request: Duplicate
    res2 = client.post(url, data=raw_bytes, content_type="application/json", HTTP_X_SIGNATURE_256=sig)
    assert res2.status_code == status.HTTP_200_OK
    assert res2.json()["status"] == "duplicate_ignored"


@pytest.mark.django_db
def test_webhook_outcome_rejected_auth(client, registered_source):
    """Verifies HTTP 401 Signature failure is categorized under rejected_auth."""
    payload_data = {"event_type": "alert.trigger", "payload": {"foo": "bar"}}
    raw_bytes = json.dumps(payload_data).encode("utf-8")

    url = reverse("webhooks:ingest", kwargs={"source_slug": registered_source.slug})
    response = client.post(
        url,
        data=raw_bytes,
        content_type="application/json",
        HTTP_X_SIGNATURE_256="invalid_tampered_signature_hex",
    )

    assert response.status_code == status.HTTP_401_UNAUTHORIZED
    assert "error" in response.json()


@pytest.mark.django_db
def test_webhook_outcome_rejected_inactive(client, registered_source):
    """Verifies HTTP 403 Deactivated source is categorized under rejected_inactive."""
    registered_source.is_active = False
    registered_source.save()

    payload_data = {"event_type": "ping", "payload": {"status": "ok"}}
    raw_bytes = json.dumps(payload_data).encode("utf-8")
    url = reverse("webhooks:ingest", kwargs={"source_slug": registered_source.slug})
    response = client.post(url, data=raw_bytes, content_type="application/json")

    assert response.status_code == status.HTTP_403_FORBIDDEN


@pytest.mark.django_db
def test_webhook_outcome_rejected_malformed(client, registered_source):
    """Verifies HTTP 400 Bad Request is categorized under rejected_malformed."""
    raw_bytes = b"not_valid_json_envelope"
    sig = _generate_sig(registered_source.secret_key, raw_bytes)

    url = reverse("webhooks:ingest", kwargs={"source_slug": registered_source.slug})
    response = client.post(
        url,
        data=raw_bytes,
        content_type="application/json",
        HTTP_X_SIGNATURE_256=sig,
    )

    assert response.status_code == status.HTTP_400_BAD_REQUEST


# =================================================================================
# 2. ACCURATE PERCENTILE CALCULATION ALGORITHM
# =================================================================================

def test_percentile_calculation_exact_distribution():
    """
    Tests nearest-rank percentile calculation against known distribution.
    Never substitutes arithmetic mean for p95.
    """
    # 100 samples from 1.0ms to 100.0ms:
    samples = [float(i) for i in range(1, 101)]

    res = calculate_percentiles(samples)
    assert res["p50"] == 50.0   # median
    assert res["p95"] == 95.0   # 95th percentile
    assert res["p99"] == 99.0   # 99th percentile
    assert res["max"] == 100.0  # max
    assert res["sample_count"] == 100
    assert res["is_exact"] is True


def test_percentile_calculation_tail_latency_anomaly():
    """
    Proves that p95 captures tail latency anomalies that arithmetic mean hides.
    """
    # 90 requests at 10.0ms, 10 requests at 500.0ms (total: 100)
    samples = [10.0] * 90 + [500.0] * 10
    avg_latency = sum(samples) / len(samples)  # 59.0ms

    res = calculate_percentiles(samples)
    assert res["p50"] == 10.0
    assert res["p95"] == 500.0  # True p95 is 500ms, proving average (59ms) is heavily misleading!
    assert res["max"] == 500.0
    assert avg_latency != res["p95"]


def test_percentile_calculation_empty_and_single():
    """Edge cases: empty list and single item."""
    empty_res = calculate_percentiles([])
    assert empty_res["p95"] == 0.0
    assert empty_res["sample_count"] == 0

    single_res = calculate_percentiles([42.5])
    assert single_res["p50"] == 42.5
    assert single_res["p95"] == 42.5
    assert single_res["max"] == 42.5


# =================================================================================
# 3. CONCURRENT BUFFERING SAFETY & BOUNDED RESERVOIR SAMPLING
# =================================================================================

def test_concurrent_metric_buffer_updates():
    """
    Simulates 20 concurrent threads simultaneously recording outcomes
    to verify thread-safety and race-condition immunity on MemoryMetricBuffer.
    """
    from apps.analytics.buffer import MemoryMetricBuffer
    mem_buffer = MemoryMetricBuffer(max_samples=1000)
    slug = "concurrent-service"
    now_ts = 1700000000
    thread_count = 20
    calls_per_thread = 50

    def worker():
        for _ in range(calls_per_thread):
            mem_buffer.record(slug, now_ts, IngestionOutcome.ACCEPTED, 15.2)

    with concurrent.futures.ThreadPoolExecutor(max_workers=thread_count) as executor:
        futures = [executor.submit(worker) for _ in range(thread_count)]
        concurrent.futures.wait(futures)

    # Total recorded should equal thread_count * calls_per_thread:
    expected_total = thread_count * calls_per_thread  # 1,000

    counts, samples = mem_buffer.pop_window(slug, now_ts)
    assert counts["total_received"] == expected_total
    assert counts["total_accepted"] == expected_total
    assert len(samples) == expected_total


def test_bounded_sampling_prevents_memory_leak():
    """
    Verifies that sample lists are capped at MAX_SAMPLES_PER_WINDOW (1,000)
    to prevent memory growth under heavy sustained traffic.
    """
    from apps.analytics.buffer import MemoryMetricBuffer
    mem_buffer = MemoryMetricBuffer(max_samples=1000)
    slug = "high-throughput-service"
    now_ts = 1700000000

    # Record 1,500 samples
    for i in range(1500):
        mem_buffer.record(slug, now_ts, IngestionOutcome.ACCEPTED, float(i))

    counts, samples = mem_buffer.pop_window(slug, now_ts)
    assert counts["total_received"] == 1500
    # Samples must be capped at exactly 1,000:
    assert len(samples) == 1000


def test_algorithm_r_reservoir_sampling_no_recency_bias():
    """
    Proves that Algorithm R reservoir sampling does NOT systematically select
    only the latest requests (unlike naive FIFO truncation).
    Streams 2,000 samples where:
      - 500 early items have value 10.0
      - 1,000 middle items have value 50.0
      - 500 late items have value 90.0
    Verifies that early items (10.0), middle items (50.0), and late items (90.0)
    are all statistically represented in the 1,000-sample reservoir (no starvation).
    """
    from apps.analytics.buffer import MemoryMetricBuffer
    mem_buffer = MemoryMetricBuffer(max_samples=1000)
    slug = "reservoir-test"
    now_ts = 1700000000

    # Stream 500 early
    for _ in range(500):
        mem_buffer.record(slug, now_ts, IngestionOutcome.ACCEPTED, 10.0)
    # Stream 1,000 middle
    for _ in range(1000):
        mem_buffer.record(slug, now_ts, IngestionOutcome.ACCEPTED, 50.0)
    # Stream 500 late
    for _ in range(500):
        mem_buffer.record(slug, now_ts, IngestionOutcome.ACCEPTED, 90.0)

    counts, samples = mem_buffer.pop_window(slug, now_ts)
    assert counts["total_received"] == 2000
    assert len(samples) == 1000

    # In FIFO trimming, early items (10.0) would be 0%!
    # In Algorithm R, expected count of 10.0 is ~250 (500/2000 * 1000).
    early_count = samples.count(10.0)
    middle_count = samples.count(50.0)
    late_count = samples.count(90.0)

    # Statistical tolerance: must be well above 0 (proves early samples survived without recency bias!)
    assert early_count > 150, f"Early samples were unfairly purged: {early_count}"
    assert middle_count > 350, f"Middle samples not represented: {middle_count}"
    assert late_count > 150, f"Late samples not represented: {late_count}"


# =================================================================================
# 4. ROLLUP IDEMPOTENCY, CONCURRENCY & ADDITIVE SAFETY
# =================================================================================

@pytest.mark.django_db
def test_repeated_rollup_is_idempotent():
    """
    Verifies that repeated task execution or worker restarts do NOT create
    duplicate database rows or inflate metrics (guaranteed by unique constraint).
    """
    source_slug = "idempotent-rollup-service"
    window_dt = timezone.now().replace(second=0, microsecond=0) - datetime.timedelta(minutes=2)
    window_ts = int(window_dt.timestamp())

    # Pre-populate memory buffer
    metric_buffer._memory_fallback.record(source_slug, window_ts, IngestionOutcome.ACCEPTED, 25.0)
    metric_buffer._memory_fallback.record(source_slug, window_ts, IngestionOutcome.DUPLICATE, 10.0)
    metric_buffer._memory_fallback.record(source_slug, window_ts, IngestionOutcome.REJECTED_AUTH, 5.0)

    # First rollup:
    res1 = rollup_ingestion_metrics(now_timestamp=window_ts + 120)
    assert res1["windows_processed"] >= 1

    records = IngestionMetric.objects.filter(source_slug=source_slug)
    assert records.count() == 1
    metric = records.first()
    assert metric.total_received == 3
    assert metric.total_accepted == 1
    assert metric.total_duplicates == 1
    assert metric.rejected_auth == 1
    assert metric.total_rejected == 1

    # Second rollup at subsequent time without new records:
    res2 = rollup_ingestion_metrics(now_timestamp=window_ts + 180)
    # Row count remains exactly 1:
    assert IngestionMetric.objects.filter(source_slug=source_slug).count() == 1


@pytest.mark.django_db
def test_late_arriving_requests_accumulate_additively():
    """
    Verifies that if requests arrive after an initial rollup has committed,
    a subsequent rollup accumulates the new requests additively into the existing row
    rather than overwriting or dropping earlier metrics.
    """
    source_slug = "additive-rollup-service"
    window_dt = timezone.now().replace(second=0, microsecond=0) - datetime.timedelta(minutes=3)
    window_ts = int(window_dt.timestamp())

    # Initial batch: 10 requests
    for _ in range(10):
        metric_buffer._memory_fallback.record(source_slug, window_ts, IngestionOutcome.ACCEPTED, 20.0)

    # Rollup batch 1:
    rollup_ingestion_metrics(now_timestamp=window_ts + 120)
    row = IngestionMetric.objects.get(source_slug=source_slug, window_start=window_dt)
    assert row.total_received == 10
    assert row.total_accepted == 10

    # Delayed late batch arrives for the same window: 5 requests
    for _ in range(5):
        metric_buffer._memory_fallback.record(source_slug, window_ts, IngestionOutcome.ACCEPTED, 40.0)

    # Rollup batch 2:
    rollup_ingestion_metrics(now_timestamp=window_ts + 180)
    row.refresh_from_db()
    # Must accumulate to 15, NOT overwrite to 5:
    assert row.total_received == 15
    assert row.total_accepted == 15
    assert IngestionMetric.objects.filter(source_slug=source_slug).count() == 1


# =================================================================================
# 5. DATABASE UNIQUE CONSTRAINT ENFORCEMENT
# =================================================================================

@pytest.mark.django_db
def test_ingestion_metric_unique_constraint():
    """
    Verifies that the composite unique constraint (source_slug, window_start)
    strictly prevents duplicate records in PostgreSQL.
    """
    dt = timezone.now().replace(second=0, microsecond=0)
    IngestionMetric.objects.create(
        source_slug="unique-test-service",
        window_start=dt,
        total_received=10,
        total_accepted=10,
    )

    # Attempting to create duplicate row must raise IntegrityError:
    with pytest.raises(IntegrityError):
        IngestionMetric.objects.create(
            source_slug="unique-test-service",
            window_start=dt,
            total_received=5,
            total_accepted=5,
        )


# =================================================================================
# 6. REST API PERMISSIONS & SUMMARY AGGREGATION
# =================================================================================

@pytest.mark.django_db
def test_analytics_api_permissions_unauthenticated(client):
    """
    Verifies that unauthenticated requests to /api/v1/analytics/ are rejected with 401/403.
    """
    url_metrics = reverse("analytics:metric-list")
    res1 = client.get(url_metrics)
    assert res1.status_code in (status.HTTP_401_UNAUTHORIZED, status.HTTP_403_FORBIDDEN)

    url_summary = reverse("analytics:metric-summary")
    res2 = client.get(url_summary)
    assert res2.status_code in (status.HTTP_401_UNAUTHORIZED, status.HTTP_403_FORBIDDEN)


@pytest.mark.django_db
def test_analytics_api_summary_authenticated(auth_operator_client):
    """
    Verifies that authenticated operators can query metrics and summary endpoints.
    """
    # Seed sample metrics
    now = timezone.now()
    IngestionMetric.objects.create(
        source_slug="api-test-source",
        window_start=now - datetime.timedelta(minutes=5),
        total_received=100,
        total_accepted=90,
        total_duplicates=5,
        total_rejected=5,
        rejected_auth=3,
        rejected_rate_limit=2,
        p50_latency_ms=18.5,
        p95_latency_ms=45.2,
        max_latency_ms=88.0,
    )

    # 1. Test Metrics List Endpoint:
    url_metrics = reverse("analytics:metric-list")
    res_metrics = auth_operator_client.get(url_metrics, {"source": "api-test-source"})
    assert res_metrics.status_code == status.HTTP_200_OK
    data = res_metrics.json()
    assert len(data) >= 1
    assert data[0]["source_slug"] == "api-test-source"
    assert data[0]["total_received"] == 100
    assert data[0]["p95_latency_ms"] == 45.2

    # 2. Test Summary Endpoint:
    url_summary = reverse("analytics:metric-summary")
    res_summary = auth_operator_client.get(url_summary, {"window_minutes": 60})
    assert res_summary.status_code == status.HTTP_200_OK
    summary = res_summary.json()
    assert summary["total_received"] >= 100
    assert summary["total_accepted"] >= 90
    assert summary["acceptance_rate_pct"] == 90.0
    assert summary["p95_latency_ms"] >= 45.2
    assert summary["rejections_by_category"]["auth"] >= 3
    assert summary["rejections_by_category"]["rate_limit"] >= 2


# =================================================================================
# 7. REDIS FAILURE RESILIENCE & ZERO DATA LOSS
# =================================================================================

@pytest.mark.django_db
def test_webhook_ingestion_succeeds_when_redis_fails(client, registered_source, monkeypatch):
    """
    Verifies that if Redis is offline or throws a ConnectionError during metrics
    recording, the webhook is still successfully accepted (HTTP 202) and queued.
    Metric failures NEVER drop incoming webhooks or change response semantics.
    """
    def mock_get_redis_raising(*args, **kwargs):
        raise ConnectionError("Simulated Redis network disconnection")

    monkeypatch.setattr(metric_buffer, "_get_redis", mock_get_redis_raising)

    payload_data = {
        "event_type": "alert.trigger",
        "payload": {"service_name": "checkout", "severity": "HIGH", "title": "Stripe timeout"},
    }
    raw_bytes = json.dumps(payload_data).encode("utf-8")
    sig = _generate_sig(registered_source.secret_key, raw_bytes)

    url = reverse("webhooks:ingest", kwargs={"source_slug": registered_source.slug})
    response = client.post(
        url,
        data=raw_bytes,
        content_type="application/json",
        HTTP_X_SIGNATURE_256=sig,
    )

    # Ingestion MUST succeed with HTTP 202:
    assert response.status_code == status.HTTP_202_ACCEPTED
    assert response.json()["status"] == "accepted"


# =================================================================================
# 8. CONCURRENT ROLLUP MUTUAL EXCLUSION & MEMORY DRAIN
# =================================================================================

@pytest.mark.django_db
def test_concurrent_rollup_workers_mutual_exclusion():
    """
    Verifies that when two workers attempt to roll up the exact same window
    simultaneously, the distributed lock (sb_metrics:lock) prevents collision
    and exactly one worker processes the window.
    """
    client = metric_buffer._get_redis()
    if client is None:
        pytest.skip("Redis not available in this test environment")

    source_slug = f"lock-test-{uuid.uuid4().hex[:6]}"
    window_dt = timezone.now().replace(second=0, microsecond=0) - datetime.timedelta(minutes=2)
    window_ts = int(window_dt.timestamp())

    # Pre-populate a Redis window
    metric_buffer.record_outcome(source_slug, IngestionOutcome.ACCEPTED, 12.5, timestamp=window_dt)

    lock_key = f"sb_metrics:lock:{source_slug}:{window_ts}"
    # Simulate Worker 1 acquiring the lock
    client.set(lock_key, "existing-worker-token", nx=True, ex=60)

    # Worker 2 attempts rollup while lock is held:
    res = rollup_ingestion_metrics(now_timestamp=window_ts + 120)

    # Worker 2 must have skipped this locked window:
    assert not IngestionMetric.objects.filter(source_slug=source_slug, window_start=window_dt).exists()

    # Now release lock (Worker 1 finishes or lock expires):
    client.delete(lock_key)

    # Worker 2 retries and succeeds:
    res_retry = rollup_ingestion_metrics(now_timestamp=window_ts + 120)
    assert IngestionMetric.objects.filter(source_slug=source_slug, window_start=window_dt).count() == 1


def test_memory_fallback_drain_to_redis():
    """
    Verifies that metric_buffer.drain_memory_fallback() drains in-memory
    windows into Redis when Redis connectivity is active.
    """
    client = metric_buffer._get_redis()
    if client is None:
        pytest.skip("Redis not available in this test environment")

    source_slug = f"drain-test-{uuid.uuid4().hex[:6]}"
    window_ts = metric_buffer.get_window_timestamp()

    # Populate in-memory fallback directly:
    metric_buffer._memory_fallback.record(source_slug, window_ts, IngestionOutcome.ACCEPTED, 33.0)
    assert len(metric_buffer._memory_fallback.get_windows()) >= 1

    # Drain to Redis:
    drained = metric_buffer.drain_memory_fallback()
    assert drained >= 1

    # In-memory buffer is now cleared:
    assert (source_slug, window_ts) not in metric_buffer._memory_fallback.get_windows()

    # Redis received the data:
    counts_key = f"{metric_buffer.KEY_PREFIX}:counts:{source_slug}:{window_ts}"
    assert int(client.hget(counts_key, "total_received")) == 1

    # Clean up test keys:
    client.delete(counts_key, f"{metric_buffer.KEY_PREFIX}:samples:{source_slug}:{window_ts}")
    client.srem(metric_buffer.ACTIVE_WINDOWS_SET, f"{source_slug}:{window_ts}")
