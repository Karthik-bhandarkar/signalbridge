# SignalBridge — Webhook Ingestion, Active API Monitoring & Incident Response Platform

[![Python 3.11+](https://img.shields.io/badge/python-3.11%20%7C%203.13-blue.svg)](https://python.org)
[![Django 5.1](https://img.shields.io/badge/django-5.1-092E20.svg)](https://djangoproject.com)
[![React 19](https://img.shields.io/badge/frontend-React%2019%20%2B%20TypeScript-61DAFB.svg)](https://react.dev)
[![Vite](https://img.shields.io/badge/bundler-Vite%208-646CFF.svg)](https://vitejs.dev)
[![PostgreSQL 16](https://img.shields.io/badge/database-PostgreSQL%2016-336791.svg)](https://postgresql.org)
[![Redis 7](https://img.shields.io/badge/broker%20%26%20cache-Redis%207-DC382D.svg)](https://redis.io)
[![Celery 5.4](https://img.shields.io/badge/tasks-Celery%205.4-37814A.svg)](https://docs.celeryq.dev)
[![Tests: 113 Passed](https://img.shields.io/badge/pytest-113%20passed%20%7C%2083%25%20coverage-brightgreen.svg)](docs/TEST_REPORT.md)
[![License: MIT](https://img.shields.io/badge/license-MIT-green.svg)](LICENSE)

SignalBridge is an incident-response platform that accepts authenticated webhook events and actively monitors configured APIs. It deduplicates repeated deliveries, correlates distinct related alerts into incidents, processes work asynchronously with durable recovery, tracks archive and notification outcomes, and provides a secure operator dashboard for investigating and resolving incidents.

---

## 1. System Architecture

```text
┌─────────────────────────────────┐       ┌─────────────────────────────────┐
│ External Webhook Sources        │       │ Active Synthetic API Monitors   │
│ (PagerDuty, Datadog, GitHub)    │       │ (Periodically scheduled checks) │
└────────────────┬────────────────┘       └────────────────┬────────────────┘
                 │ Signed HTTP POST                        │ HTTP Probes (SSRF-Protected)
                 ▼                                         ▼
┌───────────────────────────────────────────────────────────────────────────┐
│                    SIGNALBRIDGE INGESTION & CORE API                      │
│                                                                           │
│  • HMAC-SHA256 Constant-Time Verification (`hmac.compare_digest`)         │
│  • Redis Atomic ZSET Sliding-Window Rate Limiter                          │
│  • Dual-Layer Idempotency (Atomic Redis Lock + PostgreSQL Unique Index)   │
│  • Transaction-Bound Dispatch via `transaction.on_commit()`               │
│  • Kubernetes Liveness (`/health/live/`) & Readiness (`/health/ready/`)   │
└─────────────────────────────────────┬─────────────────────────────────────┘
                                      │
                         Durable Task │ Dispatched to Redis
                                      ▼
┌───────────────────────────────────────────────────────────────────────────┐
│                   CELERY ASYNCHRONOUS WORKER CLUSTER                      │
│                                                                           │
│  • Idempotent redelivery handling (skips already processed payloads)      │
│  • Deduplication by External ID + Deterministic Content SHA-256 Hash      │
│  • Incident Correlation & 15-Minute Reopening Window                      │
│  • Row-Level Locking (`SELECT FOR UPDATE`) & Advisory Concurrency Safety  │
│  • S3 Cold Archival with truthful status (`PENDING`, `ARCHIVED`, `FAILED`)│
│  • Outbound Multi-Channel Notifications (Console, Webhook, Slack, PD)     │
└─────────────────────────────────────┬─────────────────────────────────────┘
                                      │
                                      ▼
┌───────────────────────────────────────────────────────────────────────────┐
│                     REACT + TYPESCRIPT OPERATOR SPA                       │
│                                                                           │
│  • Live health telemetry pinging `/health/ready/` every 10s               │
│  • Incident Command Center: Acknowledge, Assign, Resolve, Reopen, Notes   │
│  • Alerts Explorer: Inspect raw payloads & S3 cold storage pointers       │
│  • Service Health Radar: Configure monitors & trigger real-time probes    │
│  • Webhook Integrations: Manage sources, limits & zero-downtime rotation  │
│  • Outbound Notifications: Track delivery audit log across channels       │
│  • Global Audit Log: Immutable chronological timeline of system events    │
└───────────────────────────────────────────────────────────────────────────┘
```

---

## 2. Core Capabilities & Implemented Features

### 🛡️ Webhook Ingestion & Cryptographic Security
- **HMAC-SHA256 Signatures:** Validates raw payload bytes against incoming `X-Signature-SHA256` headers using `hmac.compare_digest` to eliminate timing attacks.
- **Shared Redis Sliding-Window Rate Limiting:** Enforces per-minute source burst quotas using an atomic Redis ZSET pipeline (`ZREMRANGEBYSCORE`, `ZCARD`, `ZADD`) with local deque in-memory fallback.
- **Dual-Layer Idempotency:** Combines fast Redis `SETNX` token acquisition with an unbreachable PostgreSQL unique constraint (`source`, `idempotency_key`), returning `202 Accepted (duplicate=True)` on retries.
- **Transaction Safety:** Enqueues Celery background tasks strictly within `transaction.on_commit()`, preventing worker race conditions before PostgreSQL commits the record to disk.

### ⚡ Correlation, Deduplication & Self-Healing Workers
- **Deterministic Content Hashing:** Alerts matching `(source, external_id)` with identical SHA-256 payload hashes are safely deduplicated. Mismatched contents raise `AlertConflictError` (HTTP 409).
- **Incident Grouping & Reopening:** Grouped under service and component scope. Resolved incidents reopen automatically if new alerts arrive within a **15-minute window**.
- **Crash Recovery Outbox Loops:**
  - `reconcile_pending_webhooks`: Periodic sweep identifying webhooks stuck in `PENDING` > 5 minutes and redelivering them with exponential backoff.
  - `reclaim_stale_processing_webhooks`: Periodic sweep detecting worker crash/OOM scenarios (`PROCESSING` > 15 minutes) and safely resetting them to `PENDING`.
- **Truthful S3 Archival:** Accurately reflects `ARCHIVED` or `FAILED` without false positives. Provides manual re-enqueue controls (`POST /api/v1/alerts/{id}/retry/`).

### 📡 Active Synthetic API Monitoring & SSRF Defense
- **Automated Health Probes:** Configurable scheduled monitors verifying HTTP status codes, latency thresholds, and consecutive failure counts.
- **Automatic Incident Creation:** Threshold breaches automatically instantiate new incidents and correlate ongoing alert streams.
- **Comprehensive SSRF Shield:** Filters all target endpoints against loopback (`127.0.0.0/8`), link-local metadata (`169.254.169.254`), private subnets (`10.0.0.0/8`, `172.16.0.0/12`, `192.168.0.0/16`), and unsafe URL schemes (`file://`, `gopher://`).

### 🖥️ Operator Mission-Control Dashboard (React + TypeScript)
- **Zero Mock Data:** Directly communicates with backend REST APIs via typed client (`frontend/src/lib/api.ts`).
- **Live Health Indicator:** Real-time pulse pinging `/health/ready/` every 10 seconds.
- **Incident Investigation Modal:** View correlated alert feeds, add timestamped operator notes, assign operators, and execute state transitions.
- **Integrations & Key Rotation:** View webhook sources, edit rate limits, reveal secret keys, and execute instant zero-downtime secret rotations.

---

## 3. Verified Metrics & Quantitative Proof

| Metric / Benchmark | Target | Verified Measured Value | Evidence / Report |
| :--- | :--- | :--- | :--- |
| **Ingestion HTTP Latency (p95)** | < 100 ms | **13 ms avg / 28 ms peak** | [docs/TEST_REPORT.md](docs/TEST_REPORT.md) |
| **Deduplication Accuracy** | 100% | **0 duplicate incidents created** | [backend/tests/unit/test_stage_b_reliability.py](backend/tests/unit/test_stage_b_reliability.py) |
| **Backend Test Suite** | 100% pass | **113 passed (83% coverage)** | [docs/TEST_REPORT.md](docs/TEST_REPORT.md) |
| **Frontend Production Build** | Clean build | **0 errors, 85 kB gzipped bundle** | [docs/TEST_REPORT.md](docs/TEST_REPORT.md) |
| **Frontend Linting (oxlint)** | 0 errors | **0 errors across 15 modules** | [docs/TEST_REPORT.md](docs/TEST_REPORT.md) |

---

## 4. Quickstart Guide

### Option A: Native Host Local Development

```bash
# 1. Clone repository
git clone https://github.com/Karthik-bhandarkar/signalbridge.git
cd signalbridge

# 2. Setup Python virtual environment
python -m venv .venv
.\.venv\Scripts\Activate.ps1       # Windows PowerShell
# source .venv/bin/activate         # Linux/macOS

# 3. Install backend dependencies & start server
cd backend
pip install -r requirements/local.txt
python manage.py migrate
python manage.py createsuperuser
python manage.py runserver 127.0.0.1:8000

# 4. Start frontend dashboard (Terminal 2)
cd frontend
npm install
npm run dev
```

Visit the dashboard at `http://localhost:5173` and log in with your superuser credentials.

### Option B: Containerized Stack (Docker Compose)

```bash
cp .env.example .env
docker compose up -d --build
docker compose exec web python manage.py migrate
docker compose exec web python manage.py createsuperuser
```

---

## 5. Running Verification Checks

### Execute Backend Pytest Suite
```bash
cd backend
pytest -v
# Or inside Docker:
# docker compose exec web pytest
```

### Execute Frontend Lint & Build
```bash
cd frontend
npm run lint
npm run build
```

### Execute Full System Smoke Test
```bash
python scripts/verify_system.py
```

---

## 6. Project Documentation Index

- [Architecture & Data Flow (`docs/ARCHITECTURE.md`)](docs/ARCHITECTURE.md) — Mermaid system architecture, decoupling patterns, and failure modes.
- [API Reference Manual (`docs/API.md`)](docs/API.md) — Complete endpoint reference, schemas, status codes, and auth methods.
- [Reliability & Idempotency Specification (`docs/RELIABILITY.md`)](docs/RELIABILITY.md) — Dual-layer idempotency, recovery loops, and concurrency design.
- [Security Architecture (`docs/SECURITY.md`)](docs/SECURITY.md) — Threat model, SSRF defense, constant-time HMAC, and production hardening.
- [Local Development Guide (`docs/LOCAL_DEVELOPMENT.md`)](docs/LOCAL_DEVELOPMENT.md) — Step-by-step developer onboarding and service access guide.
- [Production Deployment Playbook (`docs/DEPLOYMENT.md`)](docs/DEPLOYMENT.md) — Zero-downtime deployment, environment variables, and disaster recovery.
- [Master AWS Low-Cost Deployment Guide (`AWS_MASTER_DEPLOYMENT_GUIDE.md`)](AWS_MASTER_DEPLOYMENT_GUIDE.md) — Step-by-step hands-on AWS lab manual, A-to-Z cloud skills, and $5 budget safety guard.
- [Test Execution Report (`docs/TEST_REPORT.md`)](docs/TEST_REPORT.md) — Complete logs, timings, and verification results across 113 backend and 6 frontend tests.

---

## 7. Known Limitations & Honest Status

1. **Third-Party Live Webhook Deliveries:** Real Slack and PagerDuty outbound alerts require valid external API webhook URLs. In local development, the dispatch adapter defaults to the Console and mock channels.
2. **Multi-Threaded PostgreSQL Concurrency Test:** The test `test_20_concurrent_threads_yield_single_incident` requires PostgreSQL row-level locks and is skipped automatically under the SQLite in-memory test runner. It passes when executed against Docker PostgreSQL.
3. **Cloud Object Storage:** Automated tests utilize local S3Mock. In production, cold storage archival connects to Oracle Cloud Infrastructure (OCI) Object Storage via its S3-compatibility API by configuring `AWS_S3_ENDPOINT_URL` (e.g. `https://<namespace>.compat.objectstorage.<region>.oraclecloud.com`), `AWS_ACCESS_KEY_ID`, `AWS_SECRET_ACCESS_KEY`, and `AWS_STORAGE_BUCKET_NAME` with an OCI Customer Secret Key.

---

## 8. Author & License

* **Author:** Karthik Bhandarkar
* **Repository:** [https://github.com/Karthik-bhandarkar/signalbridge](https://github.com/Karthik-bhandarkar/signalbridge)
* **License:** Distributed under the **MIT License**.
