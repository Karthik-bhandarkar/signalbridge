# SignalBridge Reliability & Data Integrity Engineering Specification

> **Guiding Principle:** In an incident response engine, a failure within the alerting system itself must never cause silent data loss, duplicate alerts, or false health signals. This document details the architectural mechanisms ensuring data safety, concurrency isolation, and crash resilience.

---

## 1. Dual-Layer Idempotency Architecture

SignalBridge ingests webhook events from external providers that operate under **at-least-once delivery semantics**. Under network partitions or upstream retries, the same event may arrive dozens of times within milliseconds.

```
                      Inbound Webhook
                             │
                             ▼
              ┌─────────────────────────────┐
              │  Layer 1: Redis Distributed │  Fast-path rejection
              │       Idempotency Lock      │  (Atomic SETNX with TTL)
              └──────────────┬──────────────┘
                             │ (Acquired)
                             ▼
              ┌─────────────────────────────┐
              │ Layer 2: PostgreSQL Durable │  ACID Safety
              │     Unique Constraint       │  (unique_payload_source_idempotency)
              └──────────────┬──────────────┘
                             │
                             ▼
                  transaction.on_commit()
              ┌─────────────────────────────┐
              │    Celery Task Dispatch     │
              └─────────────────────────────┘
```

### Layer 1: Fast Redis Atomic Lock
- Implemented in `apps.core.dsa.idempotency.RedisIdempotencyManager`.
- Executes atomic `SET key lock_token NX EX ttl_seconds`.
- Prevents concurrent HTTP worker threads from simultaneously entering expensive serialization, DB writes, or celery task queueing.

### Layer 2: PostgreSQL Durable Unique Index
- Configured in `apps.webhooks.models.WebhookPayload`:
  ```python
  models.UniqueConstraint(
      fields=["source", "idempotency_key"],
      name="unique_payload_source_idempotency",
  )
  ```
- If Redis is flushed, fails over, or evicts keys under memory pressure, PostgreSQL's B-Tree unique constraint acts as the unbreachable source of truth.
- When an `IntegrityError` is caught during `WebhookPayload.objects.create()`, the view queries the existing record, logs the duplicate attempt, and immediately returns `202 Accepted` with `duplicate: true`.

---

## 2. Alert Deduplication & 409 Conflict Detection

External monitoring tools frequently report alerts with an `external_id` (e.g., Datadog monitor ID, Prometheus fingerprint).

### Content-Hashed Conflict Detection
In `apps.alerts.services.AlertIngestionService`:
1. When an alert arrives with `external_id`, SignalBridge computes a deterministic SHA-256 `content_hash` of the payload.
2. If an alert with the same `(source, external_id)` already exists:
   - **Identical Hash:** The alert is a safe duplicate. SignalBridge links the existing alert to the active incident and updates counters without duplicating side effects.
   - **Different Hash:** The provider is reusing an identifier for a fundamentally different alert payload. SignalBridge raises `AlertConflictError` (HTTP 409 Conflict), preventing silent state corruption.

### 15-Minute Reopening Deduplication Window
When an operator resolves an incident, downstream alerts for the same underlying failure may continue to arrive for several minutes:
- If a correlated alert arrives within **15 minutes** of incident resolution, the existing incident is automatically **reopened** (`status -> TRIGGERED`) and marked with an audit event.
- If an alert arrives **after 15 minutes**, SignalBridge treats it as a new distinct incident and creates a fresh incident record.

---

## 3. Transaction Safety: The `transaction.on_commit` Pattern

A critical race condition in asynchronous Django systems occurs when a Celery task is enqueued before the database transaction commits:

```
[Anti-Pattern: Race Condition]
Thread 1: BEGIN TRANSACTION
Thread 1: INSERT INTO webhooks_webhookpayload (...)
Thread 1: celery_task.delay(payload_id) ──────► Celery Worker picks up task!
Thread 1: ... doing other work ...              Celery Worker executes SELECT ...
Thread 1: COMMIT TRANSACTION                    RESULT: RecordNotFound Exception!
```

### SignalBridge Solution
SignalBridge enforces `transaction.on_commit()` across all ingestion views:
```python
with transaction.atomic():
    payload = WebhookPayload.objects.create(...)
    transaction.on_commit(lambda: process_webhook_payload.delay(str(payload.id)))
```
Celery tasks are only published to Redis after PostgreSQL has written and committed the WAL (Write-Ahead Log) records to disk.

---

## 4. Crash Recovery & Outbox Reconciliation

Celery workers or brokers may crash while processing webhook events. SignalBridge implements self-healing periodic tasks:

| Periodic Task | Frequency | Function |
| :--- | :--- | :--- |
| `reconcile_pending_webhooks` | Every 5 min | Identifies webhooks stuck in `PENDING` status for > 5 minutes (indicating a Redis broker crash or failed dispatch) and re-enqueues them with exponential backoff. |
| `reclaim_stale_processing_webhooks` | Every 10 min | Finds webhooks stuck in `PROCESSING` status for > 15 minutes (indicating a worker node was killed/OOMed mid-execution) and resets them to `PENDING` for redelivery. |

### Celery Idempotent Redelivery
If Celery redelivers a message whose processing already completed, the task checks `payload.status == WebhookPayload.Status.PROCESSED`. It logs `ALREADY_PROCESSED` and exits immediately without executing downstream alert correlation a second time.

---

## 5. Truthful S3 Cold Storage Archive Tracking

In previous prototypes, archival failures were silently logged while marking the database pointer as archived. SignalBridge implements explicit archival states in `apps.webhooks.models.WebhookPayload`:

- `archive_status = "PENDING"`: Default state awaiting archival.
- `archive_status = "ARCHIVED"`: Verified write to S3 bucket; `s3_key` points to valid object.
- `archive_status = "FAILED"`: S3 network timeout or permission error. Preserves `archive_error` reason and enables manual operator retry via `/api/v1/alerts/{id}/retry/`.

---

## 6. Shared Redis Sliding-Window Rate Limiting

Per-process rate limiters (such as in-memory Python dictionaries) fail when scaling behind a multi-worker WSGI server (e.g., Gunicorn with 8 workers allows 8x the intended burst limit).

### Atomic Redis ZSET Implementation
Implemented in `apps.core.dsa.sliding_window.RedisSlidingWindowRateLimiter`:
1. Uses a Redis Sorted Set (`ZSET`) keyed by `ratelimit:{source_slug}`.
2. An atomic Redis pipeline executes:
   - `ZREMRANGEBYSCORE key 0 (now - window)`: Evicts expired timestamp scores.
   - `ZCARD key`: Counts requests currently inside the sliding window.
   - `ZADD key now now`: Appends current timestamp if under threshold.
   - `EXPIRE key window`: Sets TTL to automatically garbage collect idle keys.
3. If Redis is temporarily unreachable, the limiter smoothly falls back to an internal thread-safe `collections.deque` limiter, logging a warning rather than dropping incoming traffic.
