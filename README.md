# 🛰️ SignalBridge — High-Throughput Webhook Ingestion Engine

[![CI/CD Pipeline](https://img.shields.io/badge/CI%2FCD-Passing-brightgreen?style=flat-square&logo=githubactions)](https://github.com/Karthik-bhandarkar/signalbridge/actions)
[![Python 3.11+](https://img.shields.io/badge/python-3.11%20%7C%203.13-blue?style=flat-square&logo=python)](https://python.org)
[![Django 5 + DRF](https://img.shields.io/badge/django-5.1%20%7C%20DRF%203.17-092E20?style=flat-square&logo=django)](https://djangoproject.com)
[![PostgreSQL 16](https://img.shields.io/badge/database-PostgreSQL%2016-336791?style=flat-square&logo=postgresql)](https://postgresql.org)
[![Redis 7](https://img.shields.io/badge/cache%20%26%20broker-Redis%207-DC382D?style=flat-square&logo=redis)](https://redis.io)
[![Celery 5.4+](https://img.shields.io/badge/tasks-Celery%205.4+-37814A?style=flat-square&logo=celery)](https://docs.celeryq.dev)
[![Docker Compose](https://img.shields.io/badge/orchestration-Docker%20Compose-2496ED?style=flat-square&logo=docker)](https://docker.com)
[![Test Coverage 93%](https://img.shields.io/badge/coverage-93%25-success?style=flat-square&logo=pytest)](https://pytest.org)
[![Postman Certified](https://img.shields.io/badge/postman-28%2F28%20Passed-FF6C37?style=flat-square&logo=postman)](https://postman.com)
[![Architecture](https://img.shields.io/badge/architecture-Decoupled%20Producer--Consumer-orange?style=flat-square)](https://github.com/Karthik-bhandarkar/signalbridge)

> **SignalBridge** is a distributed, event-driven webhook ingestion pipeline engineered to ingest, cryptographically authenticate, deduplicate, and correlate high-velocity alert storms (PagerDuty, Datadog, Prometheus) under strict latency and consistency SLAs.

---

## 💡 1. What Is This Project About? (The Big Picture)

### Explain Like I'm Five (The Restaurant Kitchen Analogy)
Imagine running a busy restaurant:
* **The Naive Way:** When a customer orders, the cashier runs into the back kitchen, kneads the dough, bakes the pizza, and prints a receipt—taking 20 minutes while 50 other customers wait in line outside and leave in anger.
* **The SignalBridge Way:** The cashier checks the customer's payment token in 2 seconds, hands them an order ticket (`HTTP 202 Accepted`), and drops the ticket into a kitchen order bin (**Redis Queue**). The customer is happy and steps aside. In the back kitchen, dedicated cooks (**Celery Workers**) pull tickets and cook the food safely without rushing or burning down the kitchen.

### Technical Definition
In enterprise software, **SignalBridge is that high-speed digital receptionist**. When third-party platforms (like Stripe, PagerDuty, Datadog, or GitHub) send critical notifications ("Customer paid $500!" or "Production database CPU is at 99%!"), SignalBridge:
1. **Verifies Authenticity:** Uses HMAC-SHA256 cryptography to ensure the request is genuine and untampered.
2. **Acknowledges Instantly:** Replies with `HTTP 202 Accepted` in **under 30 milliseconds** (far beating the 100ms industry SLA) so the sender never times out.
3. **Guarantees Exactly-Once Processing:** Uses an atomic Redis idempotency cache to discard accidental duplicate retries.
4. **Delegates Safely:** Enqueues tasks to Celery background workers to parse alerts, execute business logic, correlate incidents with row-level locks, and archive raw payloads to S3 cold storage.

---

## 🎯 2. What Was the Real-World Problem?

In modern cloud environments, infrastructure outages generate massive concurrent **alert storms**—hundreds of monitoring payloads fired per second across multiple microservices. When an API attempts to handle webhooks synchronously inside the standard HTTP request thread, four fatal failures occur:

1. **The 3-Second External Timeout Trap:**
   * Downstream operations (database writes, PDF generation, sending emails, calling external APIs) take 3–6 seconds.
   * Webhook senders (Stripe, PagerDuty, GitHub) enforce strict **2 to 5 second timeouts**. If your server doesn't respond in time, the sender assumes failure, cuts the connection, and aggressively retries.
2. **The "Duplicate Money / Fragmented Incident" Problem (Idempotency):**
   * Networks are unreliable. Senders guarantee "at-least-once delivery," meaning network blips cause them to resend identical payloads.
   * Without idempotency guards, systems process the same webhook twice—leading to double payments or creating duplicate, fragmented incident tickets for the same outage.
3. **The Malicious Impersonation & Spoofing Threat:**
   * Webhook endpoints are publicly accessible URLs on the internet. Anyone can send a fake `POST` payload.
   * Naive string comparisons (`==`) introduce **side-channel timing attacks**, allowing attackers to measure microsecond differences to guess secret signatures.
4. **Alert Storms & Database Connection Pool Exhaustion:**
   * During an outage, 1,000 alerts arrive per second.
   * If each request opens a PostgreSQL connection, the database hits `max_connections`, memory spikes, and the entire backend crashes (the "thundering herd" catastrophe).

---

## 🛠️ 3. What Did We Solve & How? (The Architecture)

SignalBridge decouples ingestion into a **two-tier producer-consumer pipeline**:

```
[ External Vendor ] (PagerDuty / Datadog / Stripe)
       │
       │ 1. HTTP POST /api/v1/webhooks/<source_slug>/
       │    Headers: X-Signature-256: sha256=<hex_digest>
       │    Body: JSON Payload
       ▼
┌────────────────────────────────────────────────────────────────────────┐
│               TIER 1: SYNCHRONOUS INGESTION GATEWAY                    │
│                        (Django REST Framework)                         │
│                                                                        │
│  [Step 1: Check Source Status]                                         │
│   • Look up WebhookSource by slug. If is_active == False:              │
│     ❌ Return HTTP 403 Forbidden (5ms killswitch)                      │
│                                                                        │
│  [Step 2: Cryptographic HMAC-SHA256 Auth]                              │
│   • Read raw request body bytes.                                       │
│   • Compute: hmac.new(secret, raw_bytes, hashlib.sha256).hexdigest()   │
│   • Compare: hmac.compare_digest(computed, header_signature)           │
│   • If mismatch: ❌ Return HTTP 401 Unauthorized (12ms)                │
│                                                                        │
│  [Step 3: Sliding-Window Burst Rate Limiter]                           │
│   • In-memory collections.deque tracking timestamp window.             │
│   • If requests in last 60s > limit:                                   │
│     ❌ Return HTTP 429 Too Many Requests (13ms)                        │
│                                                                        │
│  [Step 4: Atomic Redis Idempotency Check]                              │
│   • Compute payload SHA-256 hash or extract event_id.                  │
│   • Execute Redis: SET idemp:<hash> "LOCKED" NX EX 60                  │
│   • If key already exists:                                             │
│     ⚡ Return HTTP 200 OK ("Duplicate ignored", 15ms)                  │
│                                                                        │
│  [Step 5: Record Immutable Envelope & Enqueue]                         │
│   • Save IngestedPayload to PostgreSQL with status="RECEIVED".         │
│   • Push Celery task: process_webhook_payload.delay(payload_id).       │
│                                                                        │
│  ⚡ RETURN HTTP 202 ACCEPTED TO VENDOR (Total Latency: 13ms - 30ms)    │
└────────────────────────────────────────────────────────────────────────┘
       │
       │ (Vendor receives 202 Accepted in ~30ms and closes connection!)
       │ (Payload ID sits safely in the Redis task queue)
       ▼
┌────────────────────────────────────────────────────────────────────────┐
│               TIER 2: ASYNCHRONOUS CELERY WORKER POOL                  │
│                        (Background Workers)                            │
│                                                                        │
│  [Step 6: Worker Pops Task from Redis]                                 │
│   • Worker claims payload_id from Redis broker.                        │
│                                                                        │
│  [Step 7: Deduplication & Canonical Fingerprinting]                    │
│   • Normalize vendor payload into common schema.                       │
│   • Compute dedup_key = SHA-256(source + service + alert_type).       │
│                                                                        │
│  [Step 8: Two-Phase Database Concurrency Locking]                      │
│   • Layer A: pg_advisory_xact_lock(hash(dedup_key))                    │
│     Serializes initial Incident creation without locking entire table. │
│   • Layer B: SELECT FOR UPDATE on Incident row.                        │
│     Atomically increments alert_count and escalates severity.          │
│                                                                        │
│  [Step 9: Tiered Cold-Storage Archival]                                │
│   • Upload raw JSON to AWS S3 / S3Mock bucket:                         │
│     archives/<slug>/<YYYY>/<MM>/<DD>/<payload_id>.json                 │
│                                                                        │
│  [Step 10: Final Database State Update]                                │
│   • Update IngestedPayload: status = "PROCESSED", s3_payload_key.      │
│   • Total worker processing time: ~86 milliseconds.                    │
└────────────────────────────────────────────────────────────────────────┘
```

---

## 📊 4. What Results Did We Achieve? (Empirical Evidence)

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

## 💻 5. What Tech Stack Did We Use & Why?

| Technology | Role in SignalBridge | Why We Chose It (Architectural Justification) |
| :--- | :--- | :--- |
| **Python 3.11 / 3.13** | Core Programming Language | Strong cryptographic libraries (`hmac`, `hashlib`), high-performance DSA collections (`deque`, `heapq`), and enterprise backend ecosystem. |
| **Django 5 + DRF** | API Gateway & Routing | Robust serialization, clean modular settings (`base`, `local`, `production`), and reliable ORM schema management. |
| **Redis 7** | Cache, Lock & Task Broker | In-memory atomic operations (`SETNX`, TTL expiration), $O(1)$ idempotency verification, and ultra-fast Celery task queueing. |
| **Celery 5.4+** | Asynchronous Worker Pool | Decouples heavy processing from HTTP request threads; supports automated retries, rate limits, and task scheduling. |
| **PostgreSQL 16** | Relational ACID Database | Provides rock-solid ACID guarantees, composite B-Tree indexes, row-level locks (`SELECT FOR UPDATE`), and application-level advisory locks (`pg_advisory_xact_lock`). |
| **AWS S3 / S3Mock** | Tiered Cold Storage | Offloads bulky, variable raw JSON payloads out of PostgreSQL to date-partitioned object storage, preventing database bloat. |
| **Docker & Docker Compose** | Infrastructure Orchestration | Guarantees identical multi-container environments across development, testing, and production (web, worker, postgres, redis, s3mock). |
| **Pytest & Postman** | Quality & Verification | Comprehensive test suite (unit, integration, concurrency) paired with zero-setup Postman collections for 1-click verification. |

---

## 🧗 6. What Challenges Did We Face During Building?

During the engineering of SignalBridge, we confronted **4 major systems-level challenges**:

### Challenge 1: The Alert Correlation Race Condition
* **The Problem:** When an alert storm hits, 20 worker threads receive alerts for the same outage at the exact same millisecond. If all threads check `Incident.objects.filter(fingerprint=...)` simultaneously, none find an existing incident, and all 20 threads execute `Incident.objects.create(...)`. This created 20 duplicate, fragmented incidents for a single outage!
* **The Trap:** Standard database transactions alone did not prevent this `read-modify-write` race condition across concurrent processes.

### Challenge 2: Side-Channel Timing Attacks on HMAC Signatures
* **The Problem:** Webhook authentication endpoints must verify cryptographic signatures. If verified using Python's standard equality operator (`computed_signature == header_signature`), the comparison stops at the first mismatching character.
* **The Vulnerability:** An attacker measuring microsecond response times can infer characters one-by-one, compromising the security of the webhook perimeter.

### Challenge 3: Database Storage Bloat from High-Volume Payloads
* **The Problem:** Ingesting thousands of raw webhook payloads (each 5KB–50KB of uncompressed JSON) directly into PostgreSQL causes rapid table bloat, degrades memory buffer caching, and inflates cloud database costs.

### Challenge 4: Rate Limiting Boundary Bursts
* **The Problem:** Naive fixed-window counters allow clients to send their entire quota at second 59 and again at second 01 of the next minute, causing double-capacity traffic spikes that defeat the purpose of rate limiting.

---

## 💡 7. How Did We Solve Those Challenges?

Here are the senior engineering solutions we implemented:

### Solution 1: Two-Phase Locking (`pg_advisory_xact_lock` + `SELECT FOR UPDATE`)
* **How we solved it:** We engineered a two-phase concurrency protocol in [`apps/alerts/services.py`](file:///c:/MindForge/Project/01_SignalBridge_Webhook_Ingestion/apps/alerts/services.py):
  1. **Phase 1 (Creation Guard):** Workers compute a 64-bit integer hash from the alert's deduplication fingerprint and acquire `pg_advisory_xact_lock(hash)`. This serializes only alerts belonging to the *same* incident without locking unrelated alerts or blocking the entire database table.
  2. **Phase 2 (Update Guard):** Once the incident exists, updates acquire a row-level `SELECT FOR UPDATE` lock, atomically incrementing `alert_count` and escalating severity (`CRITICAL > HIGH > MEDIUM > LOW`).
* **Empirical Proof:** Tested under 20 concurrent threads: **exactly 1 Incident created with 20 linked alerts and 0 duplicates**.

### Solution 2: Constant-Time Cryptographic Comparison
* **How we solved it:** In [`apps/webhooks/security.py`](file:///c:/MindForge/Project/01_SignalBridge_Webhook_Ingestion/apps/webhooks/security.py), we enforced Python’s `hmac.compare_digest()`:
  ```python
  if not hmac.compare_digest(calculated_signature, received_signature):
      raise AuthenticationFailed("Invalid HMAC signature")
  ```
  This guarantees that comparison execution time is uniform regardless of how many characters match, completely neutralizing timing attacks.

### Solution 3: Date-Partitioned AWS S3 Tiered Cold Storage
* **How we solved it:** In [`apps/webhooks/archival.py`](file:///c:/MindForge/Project/01_SignalBridge_Webhook_Ingestion/apps/webhooks/archival.py), Celery background workers offload the raw JSON body to S3 with date-partitioned object keys:
  `archives/<source_slug>/<YYYY>/<MM>/<DD>/<payload_id>.json`
  PostgreSQL only stores a lightweight pointer (`s3_payload_key`). If compliance audits require the original payload, it is retrieved on-demand via Boto3.

### Solution 4: Sliding-Window Traffic Smoothing
* **How we solved it:** In [`apps/core/dsa/sliding_window.py`](file:///c:/MindForge/Project/01_SignalBridge_Webhook_Ingestion/apps/core/dsa/sliding_window.py), we implemented a rolling sliding-window rate limiter using microsecond timestamps. Stale timestamps are evicted continuously, eliminating the boundary burst flaw and rejecting excess traffic in **13 ms**.

---

## 🚀 8. Quickstart & Local Verification

### Prerequisites
* [Docker Desktop](https://www.docker.com/products/docker-desktop/) (Docker Compose v2.0+)
* Git

### Step 1: Clone and Configure
```bash
git clone https://github.com/Karthik-bhandarkar/signalbridge.git
cd signalbridge
cp .env.example .env
```

### Step 2: Spin Up Multi-Container Stack
```bash
docker compose up -d --build
```
Verify running containers:
```bash
docker compose ps
```
All 5 containers (`signalbridge_postgres`, `signalbridge_redis`, `signalbridge_s3`, `signalbridge_web`, `signalbridge_celery_worker`) will report healthy.

### Step 3: Run the 51-Test Automated Suite
```bash
docker compose exec web pytest --cov=apps --cov-report=term-missing
```
**Result:** `51 passed in 9.84s (93% statement coverage)`.

---

## 📮 9. Postman Zero-Setup Verification Collection

A fully automated, zero-configuration Postman suite is included in [`postman/`](file:///c:/MindForge/Project/01_SignalBridge_Webhook_Ingestion/postman/):

### Option A: 1-Click Zero-Setup (Interactive UI)
1. In Postman, click **Import** $\rightarrow$ select [`postman/SignalBridge_Zero_Setup_Verification.postman_collection.json`](file:///c:/MindForge/Project/01_SignalBridge_Webhook_Ingestion/postman/SignalBridge_Zero_Setup_Verification.postman_collection.json).
2. **No external environment required!** All variables (`baseUrl`, `sourceSlug`, `webhookSecret`) and cryptographic HMAC scripts are bundled inside.
3. Select any request (e.g., `01 - Valid Webhook (202 Accepted)`) and click **Send**. The pre-request script computes the HMAC-SHA256 signature in real time and automatically validates the response.

### Option B: Headless Automated Newman (CI / Terminal)
```bash
newman run postman/SignalBridge_API_Verification.postman_collection.json \
  -e postman/SignalBridge_Environment_Template.postman_environment.json
```
* **Empirical Results:** `14 / 14 Requests passed`, `28 / 28 Assertions passed (100% Pass Rate in 1074ms)`.

---

## 📁 10. Repository Directory Structure

```text
signalbridge/
├── .github/
│   └── workflows/
│       └── ci.yml               # GitHub Actions CI pipeline (Postgres, Redis, Pytest)
├── apps/                        # Core domain applications
│   ├── alerts/                  # Alert correlation, deduplication & row locks
│   ├── analytics/               # Aggregation & metrics models
│   ├── core/                    # Core models, sliding-window rate limiting, retry queue & idempotency
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
│   ├── SignalBridge_Zero_Setup_Verification.postman_collection.json
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
│   └── unit/                    # Unit tests (rate limiting, retry queues, idempotency)
├── docker-compose.yml           # 5-service container orchestration specification
├── Dockerfile                   # Multi-stage optimized Python 3.11 Debian build
├── manage.py                    # Django management CLI dispatcher
├── pytest.ini                   # Pytest configuration & testpaths
├── schema.yml                   # OpenAPI 3.0 YAML specification
└── README.md                    # Root architecture documentation
```

---

## 📜 License
This project is open-source and distributed under the **MIT License**.
