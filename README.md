# 🛰️ SignalBridge — High-Throughput Webhook Ingestion Engine

[![CI/CD Pipeline](https://img.shields.io/badge/CI%2FCD-GitHub%20Actions-brightgreen?style=flat-square&logo=githubactions)](https://github.com)
[![Python 3.11+](https://img.shields.io/badge/python-3.11%20%7C%203.13-blue?style=flat-square&logo=python)](https://python.org)
[![Django 5 + DRF](https://img.shields.io/badge/django-5.1%20%7C%20DRF%203.17-092E20?style=flat-square&logo=django)](https://djangoproject.com)
[![PostgreSQL 16](https://img.shields.io/badge/database-PostgreSQL%2016-336791?style=flat-square&logo=postgresql)](https://postgresql.org)
[![Redis 7](https://img.shields.io/badge/cache%20%26%20broker-Redis%207-DC382D?style=flat-square&logo=redis)](https://redis.io)
[![Celery 5.4+](https://img.shields.io/badge/tasks-Celery%205.4+-37814A?style=flat-square&logo=celery)](https://docs.celeryq.dev)
[![Docker Compose](https://img.shields.io/badge/orchestration-Docker%20Compose-2496ED?style=flat-square&logo=docker)](https://docker.com)
[![Test Coverage 93%](https://img.shields.io/badge/coverage-93%25-success?style=flat-square&logo=pytest)](https://pytest.org)
[![Postman Certified](https://img.shields.io/badge/postman-28%2F28%20Passed-FF6C37?style=flat-square&logo=postman)](https://postman.com)
[![Architecture](https://img.shields.io/badge/architecture-Decoupled%20Producer--Consumer-orange?style=flat-square)](https://github.com)

> **SignalBridge** is a distributed, event-driven webhook ingestion pipeline engineered to ingest, cryptographically authenticate, deduplicate, and correlate high-velocity alert storms (PagerDuty, Datadog, Prometheus) under strict latency and consistency SLAs.

---

## 🎯 The Core Problem & Architectural Solution

In modern cloud environments, infrastructure outages generate massive concurrent **alert storms**—hundreds of monitoring payloads fired per second across multiple microservices. If an incident response gateway attempts synchronous database writes, alert correlation, and third-party storage uploads within the HTTP request thread:
1. Webhook providers time out (PagerDuty, GitHub, and Datadog enforce strict 2–5s timeouts).
2. Database connection pools exhaust rapidly.
3. Concurrent duplicate alerts cause race conditions, creating multiple fragmented incidents for a single outage.

### How SignalBridge Solves This:
SignalBridge separates ingestion into a **decoupled producer-consumer pipeline**:
* **Synchronous Gateway Tier (Ingestion):** Validates HMAC signatures in constant time, checks sliding-window burst limits in $O(1)$, rejects duplicate replays in $O(1)$ via Redis, records an immutable raw envelope in PostgreSQL, enqueues an asynchronous Celery task, and returns `HTTP 202 Accepted` in **under 30 ms** (far exceeding the sub-100ms industry SLA).
* **Asynchronous Processing Tier (Worker):** Celery workers consume tasks from Redis, parse vendor-specific JSON payloads, calculate deterministic deduplication fingerprints, acquire row-level locks (`SELECT FOR UPDATE` + advisory transaction locks) to prevent incident duplication, and offload raw payloads to **AWS S3 / S3Mock tiered cold storage**.

---

## 📊 Quantified Engineering Benchmarks

Every performance claim in SignalBridge is backed by reproducible automated tests and visual database execution traces:

| Metric / Requirement | Target SLA | Empirically Measured Result | Verification Method |
| :--- | :--- | :--- | :--- |
| **Synchronous Webhook ACK** | `< 100 ms` | **30 ms** *(Avg: 13 ms)* | Postman live execution (`03-webhook-accepted.png`) |
| **Automated Test Suite** | `> 80% coverage` | **51 / 51 Passed (93% Coverage)** | Pytest in Docker container (9.84s) |
| **Newman Postman Suite** | `100% assertions` | **14 / 14 Requests, 28 / 28 Assertions** | Automated Newman CI execution (1074ms) |
| **Concurrency Race Safety** | `0 duplicate incidents` | **20 concurrent threads $\rightarrow$ 1 Incident, 20 Alerts** | Thread pool test with `pg_advisory_xact_lock` |
| **PostgreSQL Index Scan** | `< 1.0 ms` | **0.078 ms execution time** | pgAdmin `EXPLAIN (ANALYZE, BUFFERS)` (`09-query-plan.png`) |
| **Asynchronous Worker Latency** | `< 500 ms` | **0.0865s (86 ms)** | Docker Desktop Celery worker logs (`08-celery-worker.png`) |
| **HMAC Tamper Rejection** | `< 50 ms` | **12 ms** (`401 Unauthorized`) | Cryptographic constant-time comparison |
| **Sliding Window Burst Check** | `< 20 ms` | **13 ms** (`429 Too Many Requests`) | In-memory `collections.deque` sliding window |

---

## 🏗️ System Architecture & Data Flow

```mermaid
sequenceDiagram
    autonumber
    actor Vendor as Monitoring Vendor (PagerDuty / Datadog)
    participant Gateway as Django Ingestion Gateway (DRF)
    participant Redis as Redis 7 (Cache & Broker)
    participant DB as PostgreSQL 16 (Relational ACID)
    participant Worker as Celery Distributed Worker
    participant S3 as AWS S3 / S3Mock (Cold Tier)

    Vendor->>Gateway: POST /api/v1/webhooks/{source_slug}/
    Gateway->>Gateway: Constant-Time HMAC-SHA256 Auth
    Gateway->>Redis: Check Sliding Window Rate Limit (O(1))
    Gateway->>Redis: Check & Set 60s Idempotency Hash (O(1))
    Gateway->>DB: INSERT IngestedPayload (Status: RECEIVED)
    Gateway->>Redis: Enqueue process_webhook_payload task
    Gateway-->>Vendor: HTTP 202 Accepted (Latency: 30ms)

    Note over Worker,DB: Asynchronous Background Processing Tier
    Worker->>Redis: Pop task from Redis queue
    Worker->>DB: SELECT FOR UPDATE / pg_advisory_xact_lock
    Worker->>DB: Correlate or Update Incident (alert_count++)
    Worker->>S3: Upload raw payload to archives/{slug}/{YYYY}/{MM}/{DD}/{id}.json
    Worker->>DB: UPDATE IngestedPayload SET status='PROCESSED', s3_payload_key
```

---

## 🧩 Computer Science & DSA Implementations

SignalBridge intentionally implements production-ready Data Structures & Algorithms directly within the application architecture:

### 1. $O(1)$ Hash Table Deduplication (Redis In-Memory Nonce Cache)
* **Location:** [`apps/core/dsa/idempotency.py`](file:///c:/MindForge/Project/01_SignalBridge_Webhook_Ingestion/apps/core/dsa/idempotency.py)
* **Mechanics:** Calculates a deterministic SHA-256 fingerprint from the raw HTTP body and headers (`hashlib.sha256(body).hexdigest()`). Checks Redis using atomic `SET NX EX 60`. If the key exists, the gateway immediately returns `HTTP 200 OK (duplicate_ignored)` in 15 ms, protecting PostgreSQL from write amplification.

### 2. $O(1)$ Sliding-Window Burst Rate Limiter
* **Location:** [`apps/core/dsa/sliding_window.py`](file:///c:/MindForge/Project/01_SignalBridge_Webhook_Ingestion/apps/core/dsa/sliding_window.py)
* **Mechanics:** Uses a double-ended queue (`collections.deque`) storing timestamps within a microsecond rolling window. Evicts stale timestamps from the left in $O(K)$, checks `len(queue) < max_requests` in $O(1)$, and appends the new timestamp in $O(1)$. Excess requests are blocked with `HTTP 429 Too Many Requests` in 13 ms.

### 3. $O(\log N)$ Min-Heap Priority Queue (Cron-Less Retry Scheduler)
* **Location:** [`apps/core/dsa/min_heap.py`](file:///c:/MindForge/Project/01_SignalBridge_Webhook_Ingestion/apps/core/dsa/min_heap.py)
* **Mechanics:** Backed by Python’s `heapq` module wrapped in thread-safe locks (`threading.Lock()`). Orders retry attempts by `retry_timestamp`. Provides $O(1)$ inspection of the next due task, $O(\log N)$ task insertion, and $O(K \log N)$ chronological extraction, preventing polling stampedes on the primary database.

---

## 🗄️ Database Design & Concurrency Protection

SignalBridge uses **PostgreSQL 16** with strict schema design, indexing, and row-level locking:

### High-Concurrency Incident Correlation
When multiple workers process alerts with identical deduplication hashes simultaneously, a classic `read-modify-write` race condition would create duplicate incidents. SignalBridge implements a **two-phase locking protocol**:
1. **Advisory Transaction Lock:** Computes an integer hash from the alert's fingerprint string and acquires `pg_advisory_xact_lock(hash)`. This serializes only alerts belonging to the same grouping key without locking unrelated incidents or blocking the table.
2. **Row-Level Exclusive Lock:** Once created, updates acquire `SELECT FOR UPDATE` on the `Incident` row, atomically incrementing `alert_count`, escalating severity (`CRITICAL > HIGH > MEDIUM > LOW`), and recording immutable `IncidentEvent` audit logs.

### Composite B-Tree Indexes
* `webhooks_ingestedpayload`: `(created_at DESC)` and `(source_id, idempotency_hash)`
* `alerts_alert`: `(dedup_key, created_at DESC)`
* **SQL Query Profiling:** In production testing, `EXPLAIN (ANALYZE, BUFFERS)` proves that queries over the last 24 hours use an `Index Scan Backward` in **0.078 ms**, avoiding expensive sequential table scans.

---

## 🚀 Quickstart & Local Setup

### Prerequisites
* [Docker Desktop](https://www.docker.com/products/docker-desktop/) (Docker Compose v2.0+)
* Git

### 1. Clone the Repository
```bash
git clone https://github.com/your-username/signalbridge.git
cd signalbridge
```

### 2. Configure Environment Variables
Copy the sanitized environment template (configured out-of-the-box for local Docker containers):
```bash
cp .env.example .env
```

### 3. Spin Up Multi-Container Stack
Build and launch all 5 services (PostgreSQL 16, Redis 7, S3Mock, Django Web, and Celery Worker):
```bash
docker compose up -d --build
```

### 4. Verify Service Health
Check running container statuses:
```bash
docker compose ps
```
All containers (`signalbridge_postgres`, `signalbridge_redis`, `signalbridge_s3`, `signalbridge_web`, `signalbridge_celery_worker`) will report healthy.

### 5. Access Endpoints
* **Root Health Probe:** `http://127.0.0.1:8000/` (returns `200 OK`)
* **Interactive Swagger UI:** `http://127.0.0.1:8000/api/docs/`
* **Django Admin Console:** `http://127.0.0.1:8000/admin/`
* **S3Mock Storage API:** `http://127.0.0.1:9090/`

---

## 🧪 Automated Testing & Test Coverage

Run the complete 51-test suite with branch coverage reporting inside the Docker container:

```bash
docker compose exec web pytest --cov=apps --cov-report=term-missing
```

### Coverage Report Summary:
```text
============================= test session starts ==============================
collected 51 items

apps/alerts/test_services.py ......                                      [ 11%]
apps/webhooks/test_archival.py ....                                      [ 19%]
apps/webhooks/test_celery_tasks.py ...                                   [ 25%]
apps/webhooks/test_ingestion_api.py ......                               [ 37%]
tests/integration/test_celery_tasks.py ..                                [ 41%]
tests/integration/test_docs_and_admin.py ....                            [ 49%]
tests/integration/test_webhooks_api.py .......                           [ 62%]
tests/concurrency/test_incident_locking.py .                             [ 64%]
apps/core/test_idempotency.py .....                                      [ 74%]
apps/core/test_min_heap.py ....                                          [ 82%]
apps/core/test_sliding_window.py .....                                   [ 92%]
tests/unit/test_min_heap_scheduler.py ....                               [100%]

--------------------------------------------------------------------------------
TOTAL: 1069 statements, 76 missed -> 93% Statement Coverage
============================== 51 passed in 9.84s ==============================
```

---

## 📮 Postman Zero-Setup Verification Collection

A fully automated, zero-configuration Postman collection is included in [`postman/`](file:///c:/MindForge/Project/01_SignalBridge_Webhook_Ingestion/postman/):

1. Import `postman/SignalBridge_API_Verification.postman_collection.json`.
2. Import `postman/SignalBridge_Environment_Template.postman_environment.json`.
3. Select any request and click **Send**:
   * Pre-request scripts compute the exact HMAC-SHA256 signature automatically.
   * Tests verify HTTP response status, schema envelope, and tracking IDs.

Run headlessly via **Newman**:
```bash
newman run postman/SignalBridge_API_Verification.postman_collection.json \
  -e postman/SignalBridge_Environment_Template.postman_environment.json
```
**Results:** `14 / 14 Requests passed`, `28 / 28 Assertions passed (100%)`.

---

## 📁 Repository Directory Structure

```text
signalbridge/
├── .github/
│   └── workflows/
│       └── ci.yml               # GitHub Actions CI pipeline (Postgres, Redis, Pytest)
├── apps/                        # Core domain applications
│   ├── alerts/                  # Alert correlation, deduplication & row locks
│   ├── analytics/               # Aggregation & metrics models
│   ├── core/                    # Core abstract models & DSA modules (min-heap, deque, redis)
│   └── webhooks/                # Ingestion API, HMAC security, serializers & S3 archival
├── config/                      # Project configuration & settings
│   ├── settings/                # Modular settings (base.py, local.py, production.py, test.py)
│   ├── celery.py                # Distributed Celery configuration
│   └── urls.py                  # API routing & OpenAPI schema endpoints
├── evidence/                    # Portfolio verification audit
│   ├── screenshots/             # Verified screenshots & cryptographic SHA-256 index
│   ├── pgadmin-payloads-export.csv  # Database export verifying PROCESSED status & S3 keys
│   └── README.md                # High-level evidence summary
├── postman/                     # Ready-to-import Postman collections & environments
│   ├── SignalBridge_API_Verification.postman_collection.json
│   ├── SignalBridge_Environment_Template.postman_environment.json
│   └── README.md
├── requirements/                # Modular dependency manifests
│   ├── base.txt                 # Core dependencies (Django, DRF, Celery, psycopg, boto3)
│   ├── local.txt                # Development dependencies (pytest, ipython, ruff)
│   └── production.txt           # Production server dependencies (gunicorn)
├── tests/                       # Global test suites
│   ├── concurrency/             # 20-thread race condition locking tests
│   ├── integration/             # End-to-end API and Celery worker tests
│   └── unit/                    # DSA unit tests
├── .dockerignore                # Production-grade build exclusion rules
├── .env.example                 # Sanitized environment template
├── .gitignore                   # Version control exclusion rules (protects secrets & notes)
├── docker-compose.yml           # 5-service container orchestration specification
├── Dockerfile                   # Multi-stage optimized Python 3.11 Debian build
├── manage.py                    # Django management CLI dispatcher
├── pytest.ini                   # Pytest configuration & testpaths
├── schema.yml                   # OpenAPI 3.0 YAML specification
└── README.md                    # Root architecture documentation
```

---

## 🛡️ Security & Production Hardening

* **Constant-Time Cryptography:** Uses `hmac.compare_digest()` to eliminate timing attacks during signature verification.
* **Source Killswitch:** Deactivated sources (`is_active=False`) are blocked at the perimeter with `HTTP 403 Forbidden` in 5 ms.
* **Zero Credential Exposure:** Environment variables decouple secrets (`.env`), and pre-commit rules prevent accidental secret exposure.
* **Defense in Depth:** Envelope validation rejects malformed JSON before database insertion or Celery queuing.

---

## 📜 License
This project is open-source and distributed under the **MIT License**.
