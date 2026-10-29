# SignalBridge — Webhook Ingestion, Active Monitoring & Automated Incident Response

[![Python 3.11+](https://img.shields.io/badge/python-3.11%20%7C%203.13-blue.svg)](https://python.org)
[![Django 5.1](https://img.shields.io/badge/django-5.1-092E20.svg)](https://djangoproject.com)
[![Next.js 16](https://img.shields.io/badge/frontend-Next.js%2016%20%2B%20React%2019-000000.svg)](https://nextjs.org)
[![Tailwind CSS 4](https://img.shields.io/badge/styling-Tailwind%20CSS%204-38BDF8.svg)](https://tailwindcss.com)
[![PostgreSQL 16](https://img.shields.io/badge/database-PostgreSQL%2016-336791.svg)](https://postgresql.org)
[![Redis 7](https://img.shields.io/badge/broker%20%26%20cache-Redis%207-DC382D.svg)](https://redis.io)
[![Celery 5.4](https://img.shields.io/badge/tasks-Celery%205.4-37814A.svg)](https://docs.celeryq.dev)
[![License: MIT](https://img.shields.io/badge/license-MIT-green.svg)](LICENSE)

SignalBridge is a high-throughput webhook ingestion gateway and automated incident triage platform. It sits between external alert providers (PagerDuty, Datadog, CloudWatch, Prometheus) and the on-call engineer, cryptographically verifying HMAC-SHA256 signatures, deduplicating replays before worker queues, clustering correlated alert signals into actionable incidents, and providing a secure operator console.

---

## Live Deployment

**Live deployment: https://d1soslo0efb36p.cloudfront.net**

---

## 1. System Architecture

```text
┌─────────────────────────────────┐       ┌─────────────────────────────────┐
│ External Webhook Sources        │       │ On-Call Operators & Viewers     │
│ (PagerDuty, Datadog, GitHub)    │       │ (Browser / Desktop / Mobile)    │
└────────────────┬────────────────┘       └────────────────┬────────────────┘
                 │ Signed HTTP POST                        │ HTTPS / WSS
                 ▼                                         ▼
┌───────────────────────────────────────────────────────────────────────────┐
│                         AMAZON CLOUDFRONT CDN                             │
│  • Edge caching for static hashed assets (/_next/static/*)                │
│  • Full cookie and header pass-through on application routes (/*)         │
│  • Cryptographic origin lock via custom header (X-Origin-Verify)          │
└─────────────────────────────────────┬─────────────────────────────────────┘
                                      │
                         HTTPS Egress │ Prefix-List Restricted
                                      ▼
┌───────────────────────────────────────────────────────────────────────────┐
│                    APPLICATION LOAD BALANCER (ALB)                        │
│  • Security group ingress locked to AWS CloudFront origin IP ranges       │
│  • Listener rule dropping direct non-CloudFront requests (HTTP 403)       │
└─────────────────────────────────────┬─────────────────────────────────────┘
                                      │
                            HTTP Port │ 80
                                      ▼
┌───────────────────────────────────────────────────────────────────────────┐
│                           NGINX REVERSE PROXY                             │
│  • SSL termination proxy, X-Forwarded-Proto header normalization          │
│  • Real-time SSE streaming bypass (proxy_buffering off, 70s timeout)      │
│  • Public static assets (/static/) served directly from volume            │
└──────────────────┬─────────────────────────────────────┬──────────────────┘
                   │ /api/*, /health/*                   │ /*, /dashboard/*
                   ▼                                     ▼
┌─────────────────────────────────────┐   ┌─────────────────────────────────┐
│  DJANGO 5 WSGI GATEWAY (GUNICORN)   │   │ NEXT.JS 16 APP ROUTER (NODE 20) │
│  • HMAC-SHA256 constant-time check  │   │  • Server-rendered public views │
│  • Rate-limiting (Redis ZSET)       │   │  • Client-side session hydrator │
│  • Resilient SSE (/api/v1/stream/)  │   │  • Live Telemetry Beacon        │
│  • Session + CSRF auth (/api/v1/..) │   │  • Interactive Simulator Studio │
└──────────────────┬──────────────────┘   └─────────────────────────────────┘
                   │
    Async Dispatch │ via Celery & Redis
                   ▼
┌───────────────────────────────────────────────────────────────────────────┐
│             POSTGRESQL 16 (RDS)  +  REDIS 7 (CACHE & BROKER)              │
│  • alerts_incident, alerts_alert, webhooks_ingestedpayload                │
│  • Atomic deduplication & idempotency hashing                             │
│  • Amazon S3 cold tier payload archival                                   │
└───────────────────────────────────────────────────────────────────────────┘
```

---

## 2. Core Capabilities

- **Ironclad HMAC-SHA256 Verification:** Constant-time verification drops forged or tampered webhooks in under 50ms before touching persistent databases.
- **Distributed Deduplication & Replay Suppression:** Replays are recognized at the perimeter and returned HTTP 200 without queueing redundant compute tasks.
- **Intelligent Alert Correlation:** Correlates multiple raw alert bursts into unified incidents with automatic severity escalation.
- **Resilient Real-Time Telemetry:** Live SSE stream (`GET /api/v1/stream/`) provides sub-second incident updates to the dashboard with zero 406 errors, thread-safe Gunicorn workers, and silent polling fallback.
- **Single Source-of-Truth Authentication:** Standardized on Django SessionAuthentication (`sessionid` cookie) + CSRF protection with cross-tab session broadcast.
- **Role-Based Access Control (RBAC):**
  - **Demo Operator (`demo.operator` / `OperatorDemo@2026!`):** 1-click login, full triage authority (Acknowledge, Resolve, Simulator dispatch).
  - **Demo Viewer (`demo.viewer` / `ViewerDemo@2026!`):** 1-click login, read-only inspection.
  - **Public Observer:** Unauthenticated view with live metrics.

---

## 3. Quick Start & Local Development

### Prerequisites
- Node.js 20+ & npm 10+
- Python 3.11+ & pip
- Docker & Docker Compose (optional for containerized run)

### Running Locally with Dev Servers
```bash
# 1. Start Django Backend
python -m venv .venv
.\.venv\Scripts\Activate.ps1
pip install -r backend/requirements/local.txt
python backend/manage.py migrate
python backend/manage.py seed_demo_users
python backend/manage.py seed_demo_data
python backend/manage.py runserver 8000

# 2. Start Next.js Frontend (in a separate terminal)
npm --prefix frontend install
npm --prefix frontend run dev
```

Visit `http://localhost:3000` to interact with the console.

---

## 4. Automated Verification Suite

```bash
# Run backend pytest suite (unit & reliability tests)
python -m pytest backend/tests/unit

# Run frontend typecheck & lint
npm --prefix frontend run typecheck
npm --prefix frontend run lint

# Run Playwright end-to-end suite
npx playwright test --config=e2e/playwright.config.ts
```

---

## 5. Deployment Guide

Refer to [deploy/RUNBOOK.md](deploy/RUNBOOK.md) for step-by-step production release instructions on AWS EC2 and CloudFront.
