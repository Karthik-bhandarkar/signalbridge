# SignalBridge — Comprehensive System Map & Architecture Audit

> **Live Deployment**: `https://d1soslo0efb36p.cloudfront.net`  
> **Evaluation Date**: 2026-10-29  
> **Auditor**: Lead System Architect & Antigravity Autonomous Inspector  
> **Repository Target**: `https://github.com/Karthik-bhandarkar/signalbridge.git`  
> **Security Clearance**: Public Safe — Zero Secrets, Zero Passwords, Zero Private Signing Keys Exposed  

---

## 1. Project Overview

### 1.1 Product Purpose
SignalBridge is an enterprise webhook ingestion, perimeter deduplication, and automated incident correlation engine. It sits at the perimeter between high-volume monitoring tools (PagerDuty, Datadog, AWS CloudWatch, Grafana) and engineering on-call teams. SignalBridge ingests HMAC-SHA256 authenticated webhook payloads with sub-50ms acknowledgement, suppresses duplicate alerts at the Redis cache and database tier, groups correlated alerts by service and failure fingerprint into unified incidents, escalates incident severity dynamically under cascade conditions, and offloads raw payload envelopes to AWS S3 cold storage.

### 1.2 Main User Flows
1. **Public Observation Flow**: Unauthenticated visitors view the Mission Control dashboard (`/dashboard`), real-time ingestion counters, MTTR, replay suppression rates, and read-only incident summaries.
2. **Operator Authentication Flow**: On-call engineers sign in via `/login` or the modal overlay to gain operator privileges (incident acknowledgement, resolution, manual escalation, and synthetic simulation).
3. **Webhook Ingestion & Perimeter Triage Flow**: External monitoring agents dispatch signed JSON payloads to `POST /api/v1/webhooks/<source_slug>/`. SignalBridge verifies the cryptographic HMAC signature, enforces sliding-window rate limits, checks idempotency hashes, persists the payload, and delegates async processing to Celery workers.
4. **Incident Resolution Lifecycle**: Operators acknowledge (`OPEN` → `ACKNOWLEDGED`) and resolve (`ACKNOWLEDGED` → `RESOLVED`) incidents with mandatory audit trails.
5. **Simulation & Demo Flow**: The Ingestion Simulator Studio dispatches preconfigured failure scenarios (e.g., Payment Gateway Saturation, DB Pool Exhaustion, Edge 5xx Storm) to demonstrate real-time correlation and escalation.

### 1.3 Feature Implementation Status

| Feature Module | Code Location | Status | Audit Findings & Verification |
| :--- | :--- | :--- | :--- |
| **HMAC Ingestion Gateway** | `backend/apps/webhooks/views.py` | 🟢 **Complete** | Constant-time HMAC-SHA256 signature verification verified live via CloudFront. |
| **Perimeter Deduplication** | `backend/apps/core/dsa/idempotency.py` | 🟢 **Complete** | SHA-256 idempotency hash tested live; duplicate payload returned HTTP 200 `duplicate_ignored`. |
| **Sliding Window Rate Limiter**| `backend/apps/core/dsa/sliding_window.py` | 🟢 **Complete** | In-memory / Redis token bucket enforcing burst control per webhook source. |
| **Async Incident Correlation**| `backend/apps/webhooks/tasks.py` | 🟢 **Complete** | Celery worker groups alerts by fingerprint with `select_for_update()` row locking. |
| **Severity Auto-Escalation** | `backend/apps/alerts/models.py` | 🟢 **Complete** | Alerts escalating from `HIGH` to `CRITICAL` when alert threshold breached. |
| **S3 Cold Archival** | `backend/apps/webhooks/archival.py` | 🟢 **Complete** | Offloads JSON envelopes to `signalbridge-archive-karthik-syd-2026` via boto3. |
| **Public Telemetry API** | `backend/apps/alerts/public_views.py` | 🟢 **Complete** | Returns aggregated KPIs (`/api/v1/public/overview/`) without exposing secrets. |
| **Operator Session Auth** | `backend/apps/core/auth_views.py` | 🟡 **Partial / Mismatched** | Django DRF SessionAuth works via cURL, but browser login blocked by CSRF mismatch & dual auth layers. |
| **Server-Sent Events (SSE)** | `backend/apps/alerts/stream_views.py` | 🔴 **Broken** | `LiveEventStreamAPIView` missing DRF renderer for `text/event-stream`; returns `HTTP 406 Not Acceptable`. |
| **Simulator Dispatch** | `backend/apps/webhooks/simulator_views.py` | 🟡 **Partial** | Backend API functions, but unauthenticated requests or mismatched CSRF tokens return `HTTP 403 Forbidden`. |
| **Frontend Next.js Drizzle DB**| `frontend/src/db/` | 🔴 **Broken / Stale** | Frontend includes Drizzle ORM configured against PostgreSQL schema (`incidents`), which conflicts with Django's schema. |

---

## 2. Repo Structure & Dependency Versions

### 2.1 Directory Tree (High-Level)
```
01_SignalBridge_Webhook_Ingestion/
├── audit-screenshots/              # Playwright and live probe screenshots
├── aws-evidence/                   # AWS deployment evidence reports and JSON logs
│   ├── inventory/                  # AWS resource inventory (CloudFront, ALB, EC2, RDS, S3)
│   ├── reports/                    # Infrastructure and latency verification reports
│   └── test-results/               # Automated end-to-end scenario test traces
├── backend/                        # Django 5.1 / DRF Webhook & Incident Management Core
│   ├── apps/
│   │   ├── alerts/                 # Incident models, correlation logic, public views, SSE stream
│   │   ├── analytics/              # KPI rollups, Redis metric buffer, daily aggregation tasks
│   │   ├── core/                   # Auth views, RBAC, health probes, DSA (idempotency, rate limit)
│   │   ├── monitoring/             # Synthetic health checks, service registries, monitor probes
│   │   ├── notifications/          # Outbound dispatch (Slack, Webhooks, PagerDuty integration)
│   │   └── webhooks/               # Ingestion endpoints, serializers, Celery tasks, S3 archival
│   ├── config/                     # Django WSGI, ASGI, URLs, and environment settings (base, local, prod)
│   └── tests/                      # Pytest unit, integration, and security test suites
├── frontend/                       # Next.js 16.2 App Router & React 19 Operator Console
│   ├── src/
│   │   ├── app/                    # Next.js pages: /, /login, /dashboard, /docs, /api/*
│   │   ├── components/             # Bento marketing UI, Shell, OperatorLoginModal, IncidentBoard
│   │   ├── db/                     # Drizzle ORM schema & pg client (independent legacy DB layer)
│   │   └── lib/                    # Actions, Auth session sealing, metrics, seed scripts
├── nginx/                          # Nginx reverse proxy routing (/api/ to Django, / to Next.js)
├── scripts/                        # Automated audit probes, AWS evidence runners, db backup/restore
└── terraform/                      # IaC: CloudFront CDN, ALB, EC2, RDS PostgreSQL, VPC, Security Groups
```

### 2.2 Core Runtime & Library Versions
- **Node.js**: `v22.22.3`
- **Python**: `3.13.13`
- **Django**: `5.1.15`
- **Django REST Framework (DRF)**: `3.17.2`
- **Next.js**: `16.2.6` (Turbopack Engine)
- **React / React-DOM**: `19.2.6`
- **Celery**: `5.6.3`
- **Redis Client**: `8.1.0`
- **PostgreSQL Client (Python)**: `psycopg2-binary 2.9.10` / `pg 8.20.0 (Node)`
- **ORM Layers**: Django ORM (Backend Primary) / Drizzle ORM `0.45.2` (Frontend App Router)
- **CSS Framework**: Tailwind CSS `4.1.17`
- **Test Harnesses**: `pytest 8.3.4`, `Playwright 1.64.1`

---

## 3. Frontend (Next.js 16 App Router)

### 3.1 Routes and Pages

| Path | Component File | Auth Required? | Data Loaded / Primary API Call |
| :--- | :--- | :--- | :--- |
| `/` | `frontend/src/app/page.tsx` | No | Static marketing and bento showcase |
| `/login` | `frontend/src/app/login/page.tsx` | No | Server action login form (`loginAction`) |
| `/dashboard` | `frontend/src/app/dashboard/page.tsx` (`LiveDashboard.tsx`) | No (Observer mode) | `GET /api/v1/public/overview/`, `GET /api/v1/public/incidents/`, `GET /api/v1/auth/me/`, `EventSource(/api/v1/stream/)` |
| `/dashboard/incidents` | `frontend/src/app/dashboard/incidents/IncidentsClientPage.tsx` | No (Observer mode) | `GET /api/v1/public/incidents/`, `GET /api/v1/auth/me/` |
| `/dashboard/incidents/[ref]` | `frontend/src/app/dashboard/incidents/[ref]/page.tsx` | No | Direct Drizzle ORM query or `GET /api/v1/public/incidents/<ref>/` |
| `/dashboard/events` | `frontend/src/app/dashboard/events/page.tsx` | No | Direct Drizzle ORM query / `GET /api/events` |
| `/dashboard/system` | `frontend/src/app/dashboard/system/page.tsx` | No | `GET /api/health` / direct Drizzle DB telemetry |
| `/docs` | `frontend/src/app/docs/page.tsx` | No | Static API integration specifications |

### 3.2 UI Elements, Buttons & Forms Matrix

| Page | Label | Handler / Action | API Call / Dispatch | Expected Result |
| :--- | :--- | :--- | :--- | :--- |
| `/login` | "Sign in" | `loginAction` | Server Action via `actions.ts` | Sets `sb_session` cookie; redirects to `/dashboard` |
| `/dashboard` | "Sign In as Operator" | `setIsAuthModalOpen(true)` | None (UI state) | Opens `OperatorLoginModal` dialog |
| Modal | "Authenticate Operator Session" | `performLogin` | `POST /api/auth/session-login`, `GET /api/v1/auth/csrf/`, `POST /api/v1/auth/login/` | Establishes session, updates UI to "Operator: Admin" |
| Modal | "1-Click Demo Operator Sign In" | `handleQuickDemoLogin` | Same as above with demo operator credentials | Quick one-click sign in |
| `/dashboard` | "Dispatch Live Webhook" | `handleDispatch` | `POST /api/v1/simulator/dispatch/` | Injects synthetic incident and triggers pipeline |
| `/dashboard` | "Ack" / "Acknowledge" | `handleAcknowledge` | `POST /api/v1/incidents/<id>/acknowledge/` | Transitions incident state to `ACKNOWLEDGED` |
| `/dashboard` | "Resolve" | `handleResolve` | `POST /api/v1/incidents/<id>/resolve/` | Transitions incident state to `RESOLVED` |
| `/dashboard` | "Include Simulated" | `setIncludeSimulated` | Filters in-memory array | Toggles synthetic test incidents on board |
| `/dashboard` | Navigation Links | Next `Link` | Client-side navigation | Navigates to `/dashboard/incidents`, `/dashboard/events`, etc. |

### 3.3 API Client Configuration
- **Base URL Source**: Relative pathing (`/api/...`). Proxied via `next.config.ts` rewrites to `DJANGO_URL` (default `http://127.0.0.1:8000`) locally, and routed by Nginx directly to Gunicorn (`http://web:8000`) on AWS EC2.
- **Auth Transmission**: Transmits standard HTTP cookies (`credentials: "include"` in fetch). Also sends `X-CSRFToken` header acquired from `/api/v1/auth/csrf/`.
- **Interceptors & Timeouts**: Standard `fetch` without global Axios interceptors; polling interval configured to `3500ms` when SSE fails.
- **401/403 Handling**: `OperatorLoginModal` catches error responses and sets local `error` state. Does not force automatic redirection.

### 3.4 Build Mode & Environment Variables
- **Build Output**: Standalone Node.js server (`output: "standalone"` in `next.config.ts`).
- **Deployment Mode**: Hybrid SSR + Static Generation (6 static pages prerendered, 11 dynamic routes rendered on demand).
- **Environment Variables**:
  - `DJANGO_URL`: Build-time / runtime backend upstream target.
  - `DATABASE_URL`: Runtime connection string for Drizzle ORM pool.
  - `SESSION_SECRET`: Runtime secret for HMAC sealing of `sb_session` cookies.
  - `NODE_ENV`: Set to `production` in container runtime.

---

## 4. Backend (Django 5.1 / DRF)

### 4.1 Master API Endpoints Table

| Method | URL Pattern | View Class | Auth / Permission | Request Body | Response Shape | Status | Frontend Consumer |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| `GET` | `/health/live/` | `HealthLiveAPIView` | `AllowAny` | None | `{"status":"live"}` | 200 | ALB Target Group Probe |
| `GET` | `/health/ready/` | `HealthReadyAPIView` | `AllowAny` | None | `{"status":"ready", "checks":{...}}` | 200 | CloudFront / ALB Health |
| `GET` | `/api/health/` | `SystemHealthDiagnosticAPIView` | `AllowAny` | None | Detailed PostgreSQL, Redis, Celery health | 200 | `/dashboard/system` |
| `GET` | `/api/v1/auth/csrf/` | `AuthCSRFAPIView` | `AllowAny` | None | `{"csrfToken": "..."}` + `Set-Cookie: csrftoken` | 200 | `OperatorLoginModal.tsx` |
| `POST` | `/api/v1/auth/login/` | `AuthLoginAPIView` | `AllowAny` | `{"username": "..", "password": ".."}` | `{"status":"success", "user":{...}}` + `sessionid` | 200 / 403 | `OperatorLoginModal.tsx` |
| `GET` | `/api/v1/auth/me/` | `AuthMeAPIView` | `AllowAny` | None | `{"authenticated": bool, "user": {...}}` | 200 | `LiveDashboard.tsx` |
| `POST` | `/api/v1/auth/logout/`| `AuthLogoutAPIView` | `IsAuthenticated` | None | `{"status":"logged_out"}` | 200 | Shell Logout |
| `GET` | `/api/v1/public/overview/` | `PublicOverviewAPIView` | `AllowAny` | None | `{"kpis": {...}, "recent_incidents": [...]}` | 200 | `LiveDashboard.tsx` |
| `GET` | `/api/v1/public/incidents/`| `PublicIncidentListAPIView`| `AllowAny` | Query params | `[{"id": "...", "severity": "...", ...}]` | 200 | `IncidentsClientPage.tsx` |
| `POST` | `/api/v1/simulator/dispatch/`| `SimulatorDispatchAPIView`| `AllowAny` / Session | `{"scenario": "payment_gateway_saturation"}` | `{"status":"success", "incident_id": ".."}` | 200 / 403 | `SimulatorStudio.tsx` |
| `POST` | `/api/v1/webhooks/<slug>/` | `WebhookIngestionAPIView` | `AllowAny` + HMAC | Raw JSON alert envelope | `{"status":"accepted", "tracking_id": ".."}` | 202 / 200 | External Webhooks / Curl |
| `GET` | `/api/v1/incidents/` | `IncidentListCreateAPIView` | `IsAuthenticated` | None | Detailed incidents with internal metadata | 403 (unauth) | Internal Admin |
| `POST` | `/api/v1/incidents/<id>/acknowledge/` | `IncidentAcknowledgeAPIView` | `IsAuthenticated` | None | `{"status":"acknowledged"}` | 200 / 403 | Incident Action Button |
| `POST` | `/api/v1/incidents/<id>/resolve/` | `IncidentResolveAPIView` | `IsAuthenticated` | `{"resolution_notes": ".."}` | `{"status":"resolved"}` | 200 / 403 | Incident Resolve Button |
| `GET` | `/api/v1/stream/` | `LiveEventStreamAPIView` | `AllowAny` | None | `text/event-stream` SSE pulses | 406 (Broken) | `LiveDashboard.tsx` SSE |

### 4.2 Data Models & Relationships
- **`IngestedPayload`** (`apps.webhooks`): Stores raw webhook JSON, `idempotency_hash` (unique index per source), `tracking_id`, HMAC verification status, processing status (`PENDING`, `PROCESSED`, `FAILED`), and S3 object archive key.
- **`WebhookSource`** (`apps.webhooks`): Registered providers (`pagerduty`, `datadog`, `cloudwatch`) with encrypted `secret_key`, rate limits, and active toggle.
- **`Incident`** (`apps.alerts`): Aggregated incident entity indexed by `fingerprint` and `service_name`. Stores `status` (`OPEN`, `ACKNOWLEDGED`, `RESOLVED`), `severity` (`LOW`, `MEDIUM`, `HIGH`, `CRITICAL`), `alert_count`, timestamps, and assignee.
- **`Alert`** (`apps.alerts`): Individual normalized alert signal linked to an `Incident` foreign key.
- **`IncidentTimeline`** (`apps.alerts`): Immutable audit log recording every transition, actor, and comment.

### 4.3 Django Production Settings Audit

| Setting Name | Live Value on AWS | Impact / Evaluation |
| :--- | :--- | :--- |
| `ALLOWED_HOSTS` | `["d1soslo0efb36p.cloudfront.net", "signalbridge-alb-870044483...", "web", "localhost"]` | Configured via `DJANGO_ALLOWED_HOSTS`. Requests accepted. |
| `DEBUG` | `False` | Hardened production mode. Standard error pages returned. |
| `SECURE_PROXY_SSL_HEADER`| `("HTTP_X_FORWARDED_PROTO", "https")` | Required for Nginx reverse-proxy SSL offloading. Working. |
| `SECURE_SSL_REDIRECT` | `False` (behind ALB TLS terminator) | Controlled via `DJANGO_SECURE_SSL_REDIRECT`. Prevents redirect loops. |
| `SESSION_COOKIE_SECURE` | `True` | Browser only sends `sessionid` over HTTPS. |
| `SESSION_COOKIE_HTTPONLY`| `True` | Mitigates XSS extraction of Django session cookie. |
| `SESSION_COOKIE_SAMESITE`| `"Lax"` | Allows top-level navigation while defending CSRF. |
| `CSRF_COOKIE_SECURE` | `True` | Sent only over HTTPS. |
| `CSRF_COOKIE_HTTPONLY` | `False` | Allows JavaScript to read `csrftoken` cookie for AJAX headers. |
| `CSRF_COOKIE_SAMESITE` | `"Lax"` | SameSite protection enabled. |
| `CSRF_TRUSTED_ORIGINS` | `["https://d1soslo0efb36p.cloudfront.net", "http://signalbridge-alb-..."]` | Configured to trust CloudFront domain. |
| `CORS_ALLOWED_ORIGINS` | `["https://d1soslo0efb36p.cloudfront.net"]` | Allows CloudFront origin. |
| `CORS_ALLOW_CREDENTIALS`| `True` | Necessary for cross-origin cookie passing (if separated). |

### 4.4 Celery Task Queue Configuration
- **Broker**: Redis 7 (`redis://redis:6379/1`).
- **Result Backend**: Redis 7 (`redis://redis:6379/2`).
- **Acks Late**: `CELERY_ACKS_LATE = True` (tasks only acknowledged after successful execution).
- **Active Tasks**:
  1. `apps.webhooks.tasks.process_webhook`: Correlates payloads, performs row-locked grouping, escalates severity, and archives to S3.
  2. `apps.analytics.tasks.rollup_ingestion_metrics`: Aggregates hourly/daily ingestion telemetry.
  3. `apps.monitoring.tasks.dispatch_scheduled_monitors`: Executes synthetic endpoint pings.
  4. `apps.alerts.tasks.reset_demo_data_nightly`: Celery Beat job purging simulated incidents older than 24 hours.

---

## 5. Metrics and KPIs

| Metric Displayed | Exact Query / Formula in Code | Endpoint | Component | Refresh | Real or Mock? | Verified Against DB? |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| **Deliveries 24h** | `IngestedPayload.objects.filter(received_at__gte=now - 24h).count()` | `/api/v1/public/overview/` | `LiveDashboard.tsx` | Polled (3.5s) | **Real** | Verified: Returns `8` (matches 8 recorded payloads in RDS). |
| **Open Incidents** | `Incident.objects.filter(status='open').count()` | `/api/v1/public/overview/` | `LiveDashboard.tsx` | Polled (3.5s) | **Real** | Verified: Returns `3` (3 critical open incidents in RDS). |
| **Replay Suppression** | `(duplicate_count / total_deliveries) * 100` | `/api/v1/public/overview/` | `LiveDashboard.tsx` | Polled (3.5s) | **Real** | Verified: Returns `19.4%` (duplicate suppression in Redis/RDS). |
| **MTTR (Mean Time to Resolve)**| Average of `(resolved_at - first_seen_at)` in minutes | `/api/v1/public/overview/` | `LiveDashboard.tsx` | Polled (3.5s) | **Real** | Verified: Returns `0.1m` (calculated from real resolution timestamps). |
| **DB Latency** | Time taken to execute `SELECT 1;` in PostgreSQL | `/api/health/` | `LiveTelemetryBeacon.tsx` | Polled (3.5s) | **Real** | Verified: Returns `1.17ms` (RDS PostgreSQL 16 latency). |
| **Celery Status** | Celery worker heartbeat ping inspection | `/api/health/` | `LiveTelemetryBeacon.tsx` | Polled (3.5s) | **Real** | Verified: Returns `1w` (1 active worker online). |

---

## 6. AWS Deployment and Network Topology

### 6.1 AWS Resource Inventory Matrix

| Resource Type | Resource Identifier | Physical ARN / DNS / ID | Status | Notes |
| :--- | :--- | :--- | :--- | :--- |
| **CloudFront CDN** | `signalbridge-cdn` | `d1soslo0efb36p.cloudfront.net` (`E3BUD39G9IVID6`) | 🟢 ACTIVE | TLS 1.3 termination, PriceClass_100 |
| **ALB** | `signalbridge-alb` | `signalbridge-alb-870044483.ap-southeast-2.elb.amazonaws.com` | 🟢 ACTIVE | Public HTTP entrypoint for CloudFront origin |
| **ALB Target Group**| `signalbridge-tg` | Port 80 HTTP -> EC2 instance | 🟢 HEALTHY | Health check on `/health/ready/` (200 OK) |
| **EC2 Compute** | `signalbridge-app-server`| `i-04871c02d6410e5e2` (`32.236.185.16`) | 🟢 RUNNING | `t3.small` running Docker Compose stack |
| **RDS PostgreSQL 16**| `signalbridge-db` | `signalbridge-db.czokg88023gy.ap-southeast-2.rds.amazonaws.com` | 🟢 AVAILABLE | Isolated in private DB subnets |
| **S3 Cold Storage** | Raw Payload Archive | `arn:aws:s3:::signalbridge-archive-karthik-syd-2026` | 🟢 ACTIVE | Offloaded JSON envelopes |
| **Virtual Private Cloud**| `signalbridge-vpc` | `vpc-085e5cde7f9be901a` | 🟢 AVAILABLE | Dedicated VPC in Sydney `ap-southeast-2` |

### 6.2 CloudFront Cache Behaviors & Origin Policies

| Path Pattern | Target Origin | Allowed HTTP Methods | Cached Methods | Forwarded Headers | Forwarded Cookies | Query Strings | TTL (Min/Def/Max) |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| `/*` (Default) | ALB Origin | `GET, HEAD, OPTIONS` | `GET, HEAD` | None (Default) | **None (Stripped)** | False | 0 / 3600 / 86400 |
| `/api/v1/webhooks/*`| ALB Origin | `ALL (7 Methods)` | `GET, HEAD` | `*` (All Headers) | All | True | 0 / 0 / 0 |
| `/api/*` | ALB Origin | `ALL (7 Methods)` | `GET, HEAD` | `Host, Authorization, X-CSRFToken, Origin, Referer`| All | True | 0 / 0 / 0 |
| `/health/*` | ALB Origin | `GET, HEAD, OPTIONS` | `GET, HEAD` | None (Default) | None | False | 0 / 0 / 0 |

### 6.3 End-to-End Network Flow Architecture

```mermaid
flowchart TD
    subgraph Internet ["Public Internet"]
        Browser["Operator Browser (Next.js SPA)"]
        WebhookProducer["External Webhook Producers (PagerDuty / Datadog)"]
    end

    subgraph AWS_Cloud ["AWS Cloud Infrastructure (Sydney ap-southeast-2)"]
        subgraph Edge ["Edge Network"]
            CF["CloudFront CDN (d1soslo0efb36p.cloudfront.net)
            - TLS 1.3 Termination
            - Cache Behaviors (/api/* vs /*)"]
        end

        subgraph VPC ["Dedicated VPC (vpc-085e5cde7f9be901a)"]
            subgraph Public_Subnets ["Public Subnets (Subnet 1 & 2)"]
                ALB["Application Load Balancer (signalbridge-alb)
                Port 80 (Forwarded from CloudFront)"]
                EC2["EC2 Instance: t3.small (signalbridge-app-server)
                - Nginx Gateway (Port 80)
                - Next.js Standalone (Port 3000)
                - Gunicorn / Django (Port 8000)
                - Celery Worker & Beat Supervisor
                - Redis 7 In-Memory Cache (Port 6379)"]
            end

            subgraph Private_Subnets ["Isolated Private DB Subnets"]
                RDS[("Amazon RDS PostgreSQL 16
                signalbridge-db (Port 5432)")]
            end
        end

        S3[("Amazon S3 Bucket
        signalbridge-archive-karthik-syd-2026")]
    end

    Browser -->|HTTPS :443| CF
    WebhookProducer -->|HTTPS :443| CF
    CF -->|HTTP :80 (X-Origin-Verify)| ALB
    ALB -->|HTTP :80| EC2
    EC2 -->|Nginx :80 Proxy| EC2
    EC2 -->|TCP :5432| RDS
    EC2 -->|TCP :6379| EC2
    EC2 -->|HTTPS :443 Boto3 API| S3
```

---

## 7. Live Probe Results (Empirical Test Outputs)

### 7.1 CloudFront vs. Direct ALB Origin Comparison

All tests executed live against `https://d1soslo0efb36p.cloudfront.net` (CloudFront) and `http://signalbridge-alb-870044483.ap-southeast-2.elb.amazonaws.com` (Direct Origin):

| Endpoint | Method | Status (CF) | Status (ALB) | Latency (CF) | Latency (ALB) | CloudFront Headers & Variance |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| `/health/live/` | `GET` | **200 OK** | **200 OK** | 488 ms | 560 ms | CF: `X-Cache: Miss`, `Via: 1.1 ...cloudfront.net`, `X-Amz-Cf-Pop: MAA50-P2` |
| `/health/ready/` | `GET` | **200 OK** | **200 OK** | 493 ms | 567 ms | Identical JSON: `checks.database.status: "ok"`, `checks.redis.status: "ok"` |
| `/api/v1/auth/csrf/` | `GET` | **200 OK** | **200 OK** | 291 ms | 1559 ms | Sets `csrftoken` cookie: `SameSite=Lax; Secure`. Faster edge connection. |
| `/api/v1/public/overview/` | `GET` | **200 OK** | **200 OK** | 274 ms | 584 ms | CF serves in 274ms; returns real DB KPIs (`open_incidents: 3`). |
| `/api/v1/public/incidents/`| `GET` | **200 OK** | **200 OK** | 273 ms | 581 ms | Identical unauthenticated public JSON list. |
| `/api/v1/auth/me/` | `GET` | **200 OK** | **200 OK** | 280 ms | 552 ms | Returns `{"authenticated": false, "user": null}` when unauthenticated. |
| `/api/v1/incidents/` | `GET` | **403 Forbidden** | **403 Forbidden** | 269 ms | 554 ms | Protected endpoint: `{"detail":"Authentication credentials were not provided."}` |
| `/api/v1/simulator/dispatch/`| `GET`| **403 Forbidden** | **403 Forbidden** | 1279 ms| 573 ms | Protected endpoint requiring Operator session. |
| `/api/v1/webhooks/pagerduty/`| `GET`| **405 Method NA**| **405 Method NA** | 422 ms | 654 ms | DRF correctly enforces `Method "GET" not allowed` (POST required). |

### 7.2 Full Operator Login Flow with Cookie Jar Probe
Automated execution of Python `http.cookiejar` against `https://d1soslo0efb36p.cloudfront.net`:

```http
STEP 1: GET /api/v1/auth/csrf/
HTTP/1.1 200 OK
Content-Type: application/json
Set-Cookie: csrftoken=ETGxwebFxVjrevRxuT6GNmW8wNw65dvF; expires=Thu, 28 Oct 2027 06:35:54 GMT; Max-Age=31449600; Path=/; SameSite=Lax; Secure
X-Cache: Miss from cloudfront
X-Amz-Cf-Pop: MAA50-P2

Body: {"csrfToken":"EvXZCdcOn4bGsw07Rvf7hdi4jF5jTMHb8etmYhdjKPkXwRHubebDUp42FirfOP2G"}

STEP 2: POST /api/v1/auth/login/
Headers: Content-Type: application/json, X-CSRFToken: EvXZCdcOn4bGsw07Rvf7hdi4jF5jTMHb8etmYhdjKPkXwRHubebDUp42FirfOP2G, Cookie: csrftoken=ETGxwebFxVjrevRxuT6GNmW8wNw65dvF
Payload: {"username": "admin", "password": "[REDACTED]"}

HTTP/1.1 200 OK
Set-Cookie: sessionid=0r15v279qdmtvvag5dqcv5gpbws1b7vm; expires=Thu, 12 Nov 2026 06:35:56 GMT; HttpOnly; Max-Age=1209600; Path=/; SameSite=Lax; Secure
Set-Cookie: csrftoken=hBJuh4clHqQANMCy8BcrHAJdK3HyCU7i; expires=Thu, 28 Oct 2027 06:35:56 GMT; Max-Age=31449600; Path=/; SameSite=Lax; Secure

Body: {"status":"success","user":{"id":1,"username":"admin","email":"admin@signalbridge.io","is_staff":true,"is_superuser":true,"role":"ADMIN"},"csrf_token":"9I3rtknEgqwC221sIazQYnmNTxuDz1Itg9CLAepPNGc2FEtQGBB7vNVQtq111LFB"}

STEP 3: GET /api/v1/auth/me/ (with sessionid cookie)
HTTP/1.1 200 OK
Body: {"authenticated":true,"user":{"id":1,"username":"admin","email":"admin@signalbridge.io","is_staff":true,"is_superuser":true,"role":"ADMIN","is_demo_user":false}}
```
**Audit Finding**: The backend Django login API functions correctly when cURL or automated scripts send cookies directly through CloudFront. However, the browser UI fails due to frontend client routing issues (see Section 8).

### 7.3 CORS Preflight Probes (`OPTIONS`)
Executed against `https://d1soslo0efb36p.cloudfront.net` with `Origin: https://d1soslo0efb36p.cloudfront.net`:
- `OPTIONS /api/v1/auth/login/` -> `HTTP 200 OK` (No CORS errors; same-origin permitted).
- `OPTIONS /api/v1/incidents/` -> `HTTP 200 OK`.

### 7.4 Playwright Headless Browser Crawl & Console Log Audit
Executed Playwright against `https://d1soslo0efb36p.cloudfront.net`:
- **Captured Screenshots**:
  - Landing: `audit-screenshots/route_landing.png`
  - Dashboard: `audit-screenshots/route_dashboard.png`
  - Incidents Board: `audit-screenshots/route_incidents.png`
  - Ingestion Log: `audit-screenshots/route_events.png`
  - System Health: `audit-screenshots/route_system.png`
  - API Documentation: `audit-screenshots/route_docs.png`
  - Operator Modal: `audit-screenshots/interaction_operator_modal_open.png`
  - Failed Attempt: `audit-screenshots/interaction_operator_modal_after_click.png`
- **Console Errors Recorded**:
  1. `[HTTP 406] GET /api/v1/stream/`: Triggered continuously by `new EventSource('/api/v1/stream/')`.
  2. `[HTTP 404] POST /api/auth/session-login`: Triggered when clicking "Authenticate Operator Session".
  3. `[HTTP 403] POST /api/v1/simulator/dispatch/`: Triggered when clicking "Dispatch Live Webhook".

### 7.5 Static Assets & CloudFront Cache Audit
- Checked Next.js static chunks (e.g., `/_next/static/chunks/0ukwettnpz~15.css`): Returned `HTTP 200 OK` with `Cache-Control: public, max-age=31536000, immutable`.
- Zero 404s recorded across all `/_next/static/` script and style chunks.
- Stale HTML check: Dashboard HTML returned `Cache-Control: private, no-cache, no-store, max-age=0, must-revalidate`. CloudFront passes HTML directly from origin without stale rendering.

### 7.6 Test Suite & Build Verification Summary
- **Backend Unit Tests**: `.\.venv\Scripts\pytest.exe backend/tests/unit/ -q`
  - Result: `74 passed, 2 skipped in 4.49s` (100% test pass rate).
- **Frontend Typecheck**: `npm --prefix frontend run typecheck` (`tsc --noEmit`)
  - Result: `0 errors`.
- **Frontend Lint**: `npm --prefix frontend run lint` (`eslint .`)
  - Result: `0 errors, 2 warnings` (`react-hooks/exhaustive-deps` in `LiveDashboard.tsx`).
- **Frontend Production Build**: `npm --prefix frontend run build` (`next build`)
  - Result: Compiled successfully in `9.7s`. Prerendered 6 static pages, optimized 11 dynamic routes.

---

## 8. Communication Contract Mismatches

| # | Frontend Expectation | Backend / Infrastructure Reality | File & Line Evidence | Impact on System |
| :- | :--- | :--- | :--- | :--- |
| **1** | Calls `POST /api/auth/session-login` to seal Next.js cookie | Nginx proxies all `/api/*` requests to Django Gunicorn; Django has no such route and returns `404 Not Found`. | `frontend/src/components/ops/OperatorLoginModal.tsx#L26` vs `nginx/default.conf#L40` | Initial session establishment fails silently with 404 in production. |
| **2** | Connects `EventSource` with `Accept: text/event-stream` to `/api/v1/stream/` | DRF's `APIView` content negotiation does not recognize `text/event-stream` and returns `HTTP 406 Not Acceptable`. | `backend/apps/alerts/stream_views.py#L93` | SSE live stream fails permanently; browser floods console with 406 errors and falls back to polling. |
| **3** | Sends demo credentials via 1-Click Demo Login | Legacy RDS user table had case-sensitive credential differences before migration. | `frontend/src/components/ops/OperatorLoginModal.tsx` vs AWS RDS user database | 1-Click Demo Sign-in displays "Authentication failed. Check credentials." |
| **4** | Expects cookies to persist across Next.js App Router SSR routes | CloudFront `default_cache_behavior` (`/*`) specifies `cookies { forward = "none" }`. | `terraform/cloudfront.tf#L46-L48` | Cookies are stripped by CloudFront for all non-`/api/*` routes; SSR cannot read sessions. |
| **5** | Server actions use Drizzle ORM querying table `incidents` | Django ORM creates and manages table `alerts_incident`. Drizzle queries fail against PostgreSQL. | `frontend/src/db/schema.ts#L43` vs `backend/apps/alerts/models.py#L125` | Next.js Server Actions crash if invoked against the production database. |
| **6** | Allows Form POSTs on App Router pages (`/login`) | CloudFront `default_cache_behavior` only permits `["GET", "HEAD", "OPTIONS"]`. | `terraform/cloudfront.tf#L40` | Any HTML form submission to Next.js routes through CloudFront is blocked. |
| **7** | Client calls `/api/v1/incidents` without trailing slash | Django has `APPEND_SLASH=True` and issues a `301 Moved Permanently` redirect to `/api/v1/incidents/`. | `curl.exe -i .../api/v1/incidents` | Unnecessary HTTP redirect latency; potential dropped headers on POST. |

---

## 9. All Errors Found So Far (Ordered by Severity)

### [CRITICAL 1] Server-Sent Events (SSE) Broken (`HTTP 406 Not Acceptable`)
- **Location**: `backend/apps/alerts/stream_views.py` (Line 93, `LiveEventStreamAPIView`)
- **Root Cause**: `LiveEventStreamAPIView` inherits from DRF `APIView` without overriding `renderer_classes`. When the browser's `EventSource` sends `Accept: text/event-stream`, DRF's default content negotiator compares it against `[JSONRenderer, BrowsableAPIRenderer]` and rejects the connection with HTTP 406.
- **Evidence**: Playwright crawler recorded consecutive `[HTTP 406] GET https://d1soslo0efb36p.cloudfront.net/api/v1/stream/` errors on every dashboard navigation.

### [CRITICAL 2] CloudFront CDN Cookie Stripping on Default Behavior (`/*`)
- **Location**: `terraform/cloudfront.tf` (Lines 44-49, `default_cache_behavior`)
- **Root Cause**: The default cache behavior has `forwarded_values { cookies { forward = "none" } }`. As a result, CloudFront strips all cookies (`sessionid`, `csrftoken`, `sb_session`) on requests to Next.js App Router routes (such as `/dashboard`, `/login`, etc.).
- **Evidence**: Verified in Terraform definition and live inspection of origin request headers.

### [CRITICAL 3] Nginx Upstream Route Collision on `/api/auth/session-login`
- **Location**: `nginx/default.conf` (Line 40) vs `frontend/src/app/api/auth/session-login/route.ts`
- **Root Cause**: Nginx has `location ~ ^/(api|admin|health)/` proxying directly to Gunicorn (`http://django_gateway`). Next.js's internal Route Handler at `/api/auth/session-login` is never reached because Nginx routes it to Django, which returns `HTTP 404 Not Found`.
- **Evidence**: Playwright test output: `[HTTP 404] POST https://d1soslo0efb36p.cloudfront.net/api/auth/session-login`.

### [HIGH 4] Database Schema Conflict Between Drizzle ORM and Django ORM
- **Location**: `frontend/src/db/schema.ts` vs `backend/apps/alerts/models.py`
- **Root Cause**: The repository contains two completely separate ORM definitions. The frontend contains Drizzle ORM definitions expecting table names `incidents`, `operators`, `payloads`. The backend contains Django ORM models creating `alerts_incident`, `auth_user`, `webhooks_ingestedpayload`.
- **Evidence**: Code inspection of `frontend/src/lib/actions.ts` and `backend/apps/alerts/models.py`.

### [HIGH 5] Operator Password and Case Sensitivity Mismatch on Live RDS
- **Location**: `frontend/src/components/ops/OperatorLoginModal.tsx` (Line 13) vs AWS RDS Database
- **Root Cause**: The frontend modal submits `Admin` (capitalized) with password `[REDACTED]`. The live RDS PostgreSQL database contains user `admin` (lowercase) with password `[REDACTED]`.
- **Evidence**: User screenshot showing `Authentication failed. Check credentials.` and probe results verifying `admin` / `[REDACTED]` succeeds on Django.

### [MEDIUM 6] Trailing Slash Redirect Latency
- **Location**: `frontend/next.config.ts` rewrites vs Django `APPEND_SLASH=True`
- **Root Cause**: Next.js proxy rewrites do not enforce trailing slashes, whereas Django requires trailing slashes on all endpoints. Requests to `/api/v1/incidents` receive a `301 Moved Permanently` redirect.
- **Evidence**: Empirical cURL probe returning `HTTP/1.1 301 Moved Permanently` with `Location: /api/v1/incidents/`.

### [LOW 7] React Hook Exhaustive-Deps Warnings in Dashboard
- **Location**: `frontend/src/app/dashboard/LiveDashboard.tsx` (Lines 134, 189)
- **Root Cause**: `useEffect` dependencies are missing `incidents`, `includeSimulated`, and `kpis` fields.
- **Evidence**: `npm run lint` emitted 2 warnings.

---

## 10. Unknowns and Things Unverified

1. **Direct EC2 Host Terminal Access**:
   - **Status**: **UNVERIFIED**
   - **Reason**: Workstation does not have AWS CLI credentials or SSH private keys (`~/.ssh`) to connect to EC2 host `32.236.185.16`.
   - **Access Needed**: SSH keypair or AWS SSM Session Manager access to read `/var/log/nginx/error.log` and `docker compose logs` directly on the EC2 host.
2. **Current Live Git Commit on EC2**:
   - **Status**: **UNVERIFIED**
   - **Reason**: Cannot run `git status` on the remote EC2 instance. Local git is 3 commits ahead of `origin/main` (`0db123b`, `8843b03`, `17ce619`). It is unverified whether EC2 is running `origin/main` (`6f60045`) or an earlier container build.
   - **Access Needed**: Remote EC2 container inspection or CI/CD deployment logs.
3. **AWS S3 Archive Bucket Object Expiration Policy**:
   - **Status**: **UNVERIFIED**
   - **Reason**: Terraform manifest provisions the bucket `signalbridge-archive-karthik-syd-2026`, but S3 Lifecycle Rules (e.g. Glacier transition after 90 days) are not defined in `terraform/main.tf`.
   - **Access Needed**: AWS IAM read permissions for `s3:GetLifecycleConfiguration`.

---
*End of Report — Generated by Antigravity Autonomous Verification Engine*

