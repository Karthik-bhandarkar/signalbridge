"""
===================================================================================
SignalBridge Webhook Ingestion Engine — Analytics Asynchronous Rollup Tasks
===================================================================================
PURPOSE:
    This module implements Celery periodic tasks for rolling up in-memory / Redis
    metric buffers into persistent PostgreSQL IngestionMetric models.

CONCURRENCY & IDEMPOTENCY SAFETY:
    1. Distributed Mutual Exclusion: Uses atomic Redis distributed locks
       (sb_metrics:lock:{source}:{ts}) to guarantee that only one worker processes
       a specific window at a time.
    2. Atomic Staging Rotation: Uses an atomic Lua script to rename active buffer keys
       to worker-isolated staging keys. Requests arriving while a window is being flushed
       write to a fresh bucket and are never lost or wiped.
    3. Row-Level Advisory Locking & Additive Accumulation: Uses select_for_update()
       inside a database transaction. If a record already exists, volume counters
       accumulate additively, preventing stale overwrites or lost counts.
    4. Safe Cleanup: Staging keys are deleted and distributed locks released strictly
       after successful PostgreSQL commit.
===================================================================================
"""
import datetime
import logging
import uuid
from typing import Dict, List, Optional

from celery import shared_task
from django.db import transaction
from django.utils import timezone

from apps.analytics.buffer import metric_buffer, IngestionMetricBuffer
from apps.analytics.calculator import calculate_percentiles
from apps.analytics.models import IngestionMetric

logger = logging.getLogger(__name__)

# Atomic Redis Lua script to claim and rotate active window keys to staging keys:
ROTATE_STAGE_LUA = """
local counts_key = KEYS[1]
local samples_key = KEYS[2]
local stage_counts_key = KEYS[3]
local stage_samples_key = KEYS[4]
local active_set = KEYS[5]
local window_member = ARGV[1]
local stage_ttl = tonumber(ARGV[2])

local has_counts = redis.call('EXISTS', counts_key)
if has_counts == 1 then
    redis.call('RENAME', counts_key, stage_counts_key)
    redis.call('EXPIRE', stage_counts_key, stage_ttl)
end

local has_samples = redis.call('EXISTS', samples_key)
if has_samples == 1 then
    redis.call('RENAME', samples_key, stage_samples_key)
    redis.call('EXPIRE', stage_samples_key, stage_ttl)
end

redis.call('SREM', active_set, window_member)
return has_counts
"""


@shared_task(name="apps.analytics.tasks.rollup_ingestion_metrics", acks_late=True)
def rollup_ingestion_metrics(now_timestamp: Optional[int] = None) -> Dict[str, int]:
    """
    Celery Beat periodic task scheduled to run every 60 seconds.
    Sweeps active metric windows, claims them atomically, extracts counts and samples,
    calculates percentiles, and persists aggregates durably to PostgreSQL.

    Returns:
        Summary dict containing count of windows processed and total requests aggregated.
    """
    current_time = now_timestamp if now_timestamp is not None else int(timezone.now().timestamp())
    windows_processed = 0
    total_requests_rolled_up = 0
    worker_id = f"worker-{uuid.uuid4().hex[:8]}"

    client = metric_buffer._get_redis()

    # -----------------------------------------------------------------------------
    # 0. DRAIN IN-MEMORY FALLBACK (IF REDIS IS AVAILABLE)
    # -----------------------------------------------------------------------------
    if client is not None:
        try:
            metric_buffer.drain_memory_fallback()
        except Exception as drain_err:
            logger.warning(f"[rollup_ingestion_metrics] Memory fallback drain notice: {drain_err}")

    # -----------------------------------------------------------------------------
    # 1. PROCESS REDIS BUFFERED WINDOWS
    # -----------------------------------------------------------------------------
    if client is not None:
        try:
            rotate_script = client.register_script(ROTATE_STAGE_LUA)
            active_windows = client.smembers(IngestionMetricBuffer.ACTIVE_WINDOWS_SET)

            for window_entry in list(active_windows):
                try:
                    source_slug, window_ts_str = window_entry.split(":", 1)
                    window_ts = int(window_ts_str)
                except ValueError:
                    client.srem(IngestionMetricBuffer.ACTIVE_WINDOWS_SET, window_entry)
                    continue

                # Close window check: only roll up windows that are completed (60s elapsed)
                if window_ts + 60 > current_time:
                    continue

                lock_key = f"sb_metrics:lock:{source_slug}:{window_ts}"
                # 1. Acquire distributed lock with 60s TTL to prevent concurrent worker execution
                acquired = client.set(lock_key, worker_id, nx=True, ex=60)
                if not acquired:
                    # Another worker is actively rolling up this window; skip
                    continue

                counts_key = f"{IngestionMetricBuffer.KEY_PREFIX}:counts:{source_slug}:{window_ts}"
                samples_key = f"{IngestionMetricBuffer.KEY_PREFIX}:samples:{source_slug}:{window_ts}"
                stage_counts_key = f"{IngestionMetricBuffer.KEY_PREFIX}:stage:counts:{source_slug}:{window_ts}:{worker_id}"
                stage_samples_key = f"{IngestionMetricBuffer.KEY_PREFIX}:stage:samples:{source_slug}:{window_ts}:{worker_id}"

                try:
                    # 2. Atomically rotate active keys to staging keys via Lua script:
                    has_data = rotate_script(
                        keys=[
                            counts_key,
                            samples_key,
                            stage_counts_key,
                            stage_samples_key,
                            IngestionMetricBuffer.ACTIVE_WINDOWS_SET,
                        ],
                        args=[window_entry, 300],
                    )

                    if not has_data:
                        # Stale or already rolled-up entry: release lock and continue
                        if client.get(lock_key) == worker_id:
                            client.delete(lock_key)
                        continue

                    raw_counts = client.hgetall(stage_counts_key)
                    raw_samples = client.lrange(stage_samples_key, 0, -1)
                    samples = [float(s) for s in raw_samples] if raw_samples else []

                    # Parse numerical counters:
                    total_rec = int(raw_counts.get("total_received", 0))
                    total_acc = int(raw_counts.get("total_accepted", 0))
                    total_dup = int(raw_counts.get("total_duplicates", 0))
                    total_rej = int(raw_counts.get("total_rejected", 0))

                    rej_auth = int(raw_counts.get("rejected_auth", 0))
                    rej_rate = int(raw_counts.get("rejected_rate_limit", 0))
                    rej_malf = int(raw_counts.get("rejected_malformed", 0))
                    rej_inac = int(raw_counts.get("rejected_inactive", 0))
                    rej_srvr = int(raw_counts.get("rejected_server_error", 0))

                    # Compute genuine percentiles from samples:
                    percentiles = calculate_percentiles(samples)
                    window_dt = datetime.datetime.fromtimestamp(window_ts, tz=datetime.timezone.utc)

                    # 3. Durable transactional persistence with row-level locking & additive accumulation:
                    with transaction.atomic():
                        existing = IngestionMetric.objects.select_for_update().filter(
                            source_slug=source_slug,
                            window_start=window_dt,
                        ).first()

                        if existing:
                            existing.total_received += total_rec
                            existing.total_accepted += total_acc
                            existing.total_duplicates += total_dup
                            existing.total_rejected += total_rej
                            existing.rejected_auth += rej_auth
                            existing.rejected_rate_limit += rej_rate
                            existing.rejected_malformed += rej_malf
                            existing.rejected_inactive += rej_inac
                            existing.rejected_server_error += rej_srvr
                            if percentiles["p95"] > 0:
                                existing.p50_latency_ms = percentiles["p50"]
                                existing.p95_latency_ms = percentiles["p95"]
                                existing.p99_latency_ms = percentiles["p99"]
                                existing.max_latency_ms = max(existing.max_latency_ms, percentiles["max"])
                            existing.save()
                        else:
                            IngestionMetric.objects.create(
                                source_slug=source_slug,
                                window_start=window_dt,
                                total_received=total_rec,
                                total_accepted=total_acc,
                                total_duplicates=total_dup,
                                total_rejected=total_rej,
                                rejected_auth=rej_auth,
                                rejected_rate_limit=rej_rate,
                                rejected_malformed=rej_malf,
                                rejected_inactive=rej_inac,
                                rejected_server_error=rej_srvr,
                                p50_latency_ms=percentiles["p50"],
                                p95_latency_ms=percentiles["p95"],
                                p99_latency_ms=percentiles["p99"],
                                max_latency_ms=percentiles["max"],
                            )

                    # 4. Clean up staging keys and release distributed lock:
                    client.delete(stage_counts_key, stage_samples_key)
                    if client.get(lock_key) == worker_id:
                        client.delete(lock_key)

                    windows_processed += 1
                    total_requests_rolled_up += total_rec

                except Exception as window_err:
                    logger.error(
                        f"[rollup_ingestion_metrics] Error processing window {window_entry}: {window_err}",
                        exc_info=True,
                    )
                    # Ensure lock is released on error:
                    try:
                        if client.get(lock_key) == worker_id:
                            client.delete(lock_key)
                    except Exception:
                        pass

        except Exception as exc:
            logger.error(f"[rollup_ingestion_metrics] Error rolling up Redis metrics: {exc}", exc_info=True)

    # -----------------------------------------------------------------------------
    # 2. PROCESS LOCAL IN-MEMORY FALLBACK BUFFER (IF ANY REMAIN)
    # -----------------------------------------------------------------------------
    try:
        mem_windows = metric_buffer._memory_fallback.get_windows()
        for source_slug, window_ts in mem_windows:
            if window_ts + 60 > current_time:
                continue

            popped = metric_buffer._memory_fallback.pop_window(source_slug, window_ts)
            if not popped:
                continue

            counts, samples = popped
            total_rec = counts.get("total_received", 0)
            total_acc = counts.get("total_accepted", 0)
            total_dup = counts.get("total_duplicates", 0)
            total_rej = counts.get("total_rejected", 0)

            percentiles = calculate_percentiles(samples)
            window_dt = datetime.datetime.fromtimestamp(window_ts, tz=datetime.timezone.utc)

            with transaction.atomic():
                existing = IngestionMetric.objects.select_for_update().filter(
                    source_slug=source_slug,
                    window_start=window_dt,
                ).first()

                if existing:
                    existing.total_received += total_rec
                    existing.total_accepted += total_acc
                    existing.total_duplicates += total_dup
                    existing.total_rejected += total_rej
                    existing.rejected_auth += counts.get("rejected_auth", 0)
                    existing.rejected_rate_limit += counts.get("rejected_rate_limit", 0)
                    existing.rejected_malformed += counts.get("rejected_malformed", 0)
                    existing.rejected_inactive += counts.get("rejected_inactive", 0)
                    existing.rejected_server_error += counts.get("rejected_server_error", 0)
                    if percentiles["p95"] > 0:
                        existing.p50_latency_ms = percentiles["p50"]
                        existing.p95_latency_ms = percentiles["p95"]
                        existing.p99_latency_ms = percentiles["p99"]
                        existing.max_latency_ms = max(existing.max_latency_ms, percentiles["max"])
                    existing.save()
                else:
                    IngestionMetric.objects.create(
                        source_slug=source_slug,
                        window_start=window_dt,
                        total_received=total_rec,
                        total_accepted=total_acc,
                        total_duplicates=total_dup,
                        total_rejected=total_rej,
                        rejected_auth=counts.get("rejected_auth", 0),
                        rejected_rate_limit=counts.get("rejected_rate_limit", 0),
                        rejected_malformed=counts.get("rejected_malformed", 0),
                        rejected_inactive=counts.get("rejected_inactive", 0),
                        rejected_server_error=counts.get("rejected_server_error", 0),
                        p50_latency_ms=percentiles["p50"],
                        p95_latency_ms=percentiles["p95"],
                        p99_latency_ms=percentiles["p99"],
                        max_latency_ms=percentiles["max"],
                    )

            windows_processed += 1
            total_requests_rolled_up += total_rec

    except Exception as exc:
        logger.error(f"[rollup_ingestion_metrics] Error rolling up in-memory metrics: {exc}", exc_info=True)

    logger.info(
        f"[rollup_ingestion_metrics] Completed rollup: {windows_processed} windows processed, "
        f"{total_requests_rolled_up} total requests aggregated into PostgreSQL."
    )
    return {
        "windows_processed": windows_processed,
        "total_requests": total_requests_rolled_up,
    }
