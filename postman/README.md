# 🚀 SignalBridge — Zero-Setup Postman API Verification Suite

> **Suite Version:** 1.1.0 (Zero-Setup Edition)  
> **Postman Schema:** Collection v2.1.0  
> **Target Base URL:** `http://127.0.0.1:8000` (Bundled Collection Variable)  
> **Newman Verified Status:** 28 / 28 Assertions Passed (100% Pass Rate, 18ms avg latency, 0 environment flags needed)

---

## 📌 1. Suite Overview & "Zero-Setup" Philosophy

The **SignalBridge Zero-Setup Postman Verification Collection** is engineered for immediate, zero-friction developer testing.

### The 1-Click Workflow:
1. **Import** `SignalBridge_Zero_Setup_Verification.postman_collection.json` into Postman once.
2. **Open any request** in the left sidebar.
3. Click **Send**.
4. Observe the HTTP status code and response payload.

**You do NOT need to:**
* ❌ Import or activate an external Postman Environment.
* ❌ Enter or copy secret keys or tokens.
* ❌ Manually generate HMAC-SHA256 signatures or hashes.
* ❌ Edit base URLs or endpoint paths.
* ❌ Add headers or modify request bodies.

---

## 📁 2. File Manifest & Storage Locations

| File Path | Description |
|---|---|
| [`postman/SignalBridge_Zero_Setup_Verification.postman_collection.json`](file:///c:/MindForge/Project/01_SignalBridge_Webhook_Ingestion/postman/SignalBridge_Zero_Setup_Verification.postman_collection.json) | **Primary Deliverable:** Fully self-contained Postman collection with bundled collection variables (`baseUrl`, `sourceSlug`, `webhookSecret`, etc.). Requires NO external environment. |
| [`postman/SignalBridge_API_Verification.postman_collection.json`](file:///c:/MindForge/Project/01_SignalBridge_Webhook_Ingestion/postman/SignalBridge_API_Verification.postman_collection.json) | Environment-driven collection variant (strict validation; halts if environment secret is missing). |
| [`postman/SignalBridge_Local.postman_environment.json`](file:///c:/MindForge/Project/01_SignalBridge_Webhook_Ingestion/postman/SignalBridge_Local.postman_environment.json) | Local environment definition (ignored in Git). |
| [`postman/SignalBridge_Environment_Template.postman_environment.json`](file:///c:/MindForge/Project/01_SignalBridge_Webhook_Ingestion/postman/SignalBridge_Environment_Template.postman_environment.json) | Sanitized environment template for CI/CD or staging sharing. |
| [`docs/04_resources_and_fixtures/postman/`](file:///c:/MindForge/Project/01_SignalBridge_Webhook_Ingestion/docs/04_resources_and_fixtures/postman/) | Mirrored copy stored inside project fixtures. |

---

## 🔐 3. Authentication Architecture: API Keys vs. HMAC Secrets

### A. Is a Separate API Key Required?
**NO.**
* Comprehensive audit of `src/apps/webhooks/views.py` confirms:
  ```python
  authentication_classes = []
  permission_classes = []
  ```
* Webhook ingestion perimeter gateways do **not** use static API keys or Django session cookies. Alert producers (PagerDuty, Datadog, GitHub, Stripe) send webhooks over the public internet and authenticate via payload-level cryptographic signatures.

### B. Is an HMAC Webhook Secret Required?
**YES.**
* The backend strictly enforces HMAC-SHA256 signature verification in `apps.webhooks.security.verify_hmac_signature`.
* Header format accepted: `X-Signature-256` or `X-Signature-SHA256` with value `sha256=<hex_digest>`.
* The collection's Pre-request Scripts handle this **100% automatically** using `require('crypto-js')`.

### C. Security Implications of Embedding the Local Secret
1. **Zero-Setup Local Convenience:** The bundled collection variable `webhookSecret` is pre-populated with the ephemeral local development seed key matching the PostgreSQL seed database.
2. **Git Protection:** `postman/*Zero_Setup*.json` and `postman/*_Local*.json` are explicitly registered in [`.gitignore`](file:///c:/MindForge/Project/01_SignalBridge_Webhook_Ingestion/.gitignore) so local credentials can never be committed to Git.
3. **Production / Staging Rule:** In production or shared staging environments, embedded collection secrets must never be used. Instead, inject secrets via environment variables or secret vaults.

---

## 🔍 4. Complete Verification Coverage & Endpoint Inventory

| # | Folder | Request Name | HTTP Method | Target URL | Expected Status | Description |
|:---:|---|---|:---:|---|:---:|---|
| 1 | `01 - Health & System Discovery` | Root Service Health Probe | `GET` | `http://127.0.0.1:8000/` | `200 OK` | Public container health & service discovery probe |
| 2 | `01 - Health & System Discovery` | OpenAPI 3.0 Schema Definition | `GET` | `http://127.0.0.1:8000/api/schema/` | `200 OK` | OpenAPI 3.0 schema generation |
| 3 | `01 - Health & System Discovery` | Swagger UI Interactive Docs | `GET` | `http://127.0.0.1:8000/api/docs/` | `200 OK` | Swagger UI dashboard HTML |
| 4 | `01 - Health & System Discovery` | ReDoc Technical API Reference | `GET` | `http://127.0.0.1:8000/api/redoc/` | `200 OK` | ReDoc documentation HTML |
| 5 | `02 - Ingestion Gateway (Core)` | Ingest Fresh Webhook (202 ACK) | `POST` | `http://127.0.0.1:8000/api/v1/webhooks/pagerduty/` | `202 Accepted` | Dynamic HMAC signed; sub-100ms async ACK |
| 6 | `03 - Deduplication & Idempotency` | Duplicate Webhook Replay | `POST` | `http://127.0.0.1:8000/api/v1/webhooks/pagerduty/` | `200 OK` | Replays body within 60s; returns `duplicate_ignored` |
| 7 | `04 - Authentication & Security` | Negative: Missing HMAC Signature | `POST` | `http://127.0.0.1:8000/api/v1/webhooks/pagerduty/` | `401 Unauthorized` | Omits signature; rejected at gateway perimeter |
| 8 | `04 - Authentication & Security` | Negative: Tampered HMAC Signature | `POST` | `http://127.0.0.1:8000/api/v1/webhooks/pagerduty/` | `401 Unauthorized` | Sends bad digest; rejected by constant-time check |
| 9 | `04 - Authentication & Security` | Negative: Deactivated Webhook Source | `POST` | `http://127.0.0.1:8000/api/v1/webhooks/datadog-inactive/` | `403 Forbidden` | Target inactive source; operational killswitch halts |
| 10 | `04 - Authentication & Security` | Negative: Unregistered Source Slug | `POST` | `http://127.0.0.1:8000/api/v1/webhooks/unregistered-vendor-slug/` | `404 Not Found` | Target non-existent slug; returns 404 cleanly |
| 11 | `04 - Authentication & Security` | Negative: Malformed Request Envelope | `POST` | `http://127.0.0.1:8000/api/v1/webhooks/pagerduty/` | `400 Bad Request` | Omits mandatory `payload` field; serializer rejects |
| 12 | `05 - Rate Limiting & Burst Protection` | Burst Request 1 - Allowed | `POST` | `http://127.0.0.1:8000/api/v1/webhooks/rate-limited-source/` | `202 Accepted` | 1 of 2 requests allowed per 60s window |
| 13 | `05 - Rate Limiting & Burst Protection` | Burst Request 2 - Allowed | `POST` | `http://127.0.0.1:8000/api/v1/webhooks/rate-limited-source/` | `202 Accepted` | 2 of 2 requests allowed per 60s window |
| 14 | `05 - Rate Limiting & Burst Protection` | Burst Request 3 - Exceeded | `POST` | `http://127.0.0.1:8000/api/v1/webhooks/rate-limited-source/` | `429 Too Many Requests` | Enforces burst block with `Retry-After: 60` |

### ⚠️ Note on Asynchronous Database, Celery, and S3 Verification:
* The webhook endpoint returns `202 Accepted` in **< 100ms** per the enterprise SLA.
* Background incident correlation (`select_for_update`), Celery worker task execution, and S3 archiving occur asynchronously out-of-band.
* In accordance with sound API design, **there are no unauthenticated database inspection HTTP endpoints** exposing raw database records directly over HTTP. Backend verification is performed directly via `psql`, `redis-cli`, Celery worker logs, and S3Mock boto3 client.

---

## 🏃 5. How to Import and Run

### In Postman Desktop:
1. Click **Import** (or press `Ctrl + O`).
2. Drag and drop [`postman/SignalBridge_Zero_Setup_Verification.postman_collection.json`](file:///c:/MindForge/Project/01_SignalBridge_Webhook_Ingestion/postman/SignalBridge_Zero_Setup_Verification.postman_collection.json).
3. Do **NOT** select any environment (keep it set to **No Environment**).
4. Open any request and click **Send**. It works immediately!

### In Newman CLI (Zero-Flag Headless Run):
Notice that **no `-e` environment flag** is needed:

```powershell
npx -y newman run postman/SignalBridge_Zero_Setup_Verification.postman_collection.json
```

---

## 📊 6. Actual Newman Run Output (Zero-Setup Run)

```text
SignalBridge Zero-Setup API Verification

□ 01 - Health & System Discovery
  √  Root Service Health Probe [200 OK, 26ms]
  √  OpenAPI 3.0 Schema Definition [200 OK, 29ms]
  √  Swagger UI Interactive Documentation [200 OK, 14ms]
  √  ReDoc Technical API Reference [200 OK, 4ms]

□ 02 - Ingestion Gateway (Core)
  √  Ingest Fresh Webhook (202 Accepted ACK) [202 Accepted, 83ms]
     - Response latency complies with sub-100ms ACK target
     - Response body contains complete tracking acknowledgment

□ 03 - Deduplication & Idempotency Engine
  √  Duplicate Webhook Replay (200 OK Duplicate Ignored) [200 OK, 7ms]
     - Response confirms idempotent deduplication without re-queueing

□ 04 - Authentication & Security Validation
  √  Negative: Missing HMAC Signature (401 Unauthorized) [401 Unauthorized, 7ms]
  √  Negative: Tampered HMAC Signature (401 Unauthorized) [401 Unauthorized, 7ms]
  √  Negative: Deactivated Webhook Source (403 Forbidden) [403 Forbidden, 7ms]
  √  Negative: Unregistered Source Slug (404 Not Found) [404 Not Found, 49ms]
  √  Negative: Malformed Request Envelope (400 Bad Request) [400 Bad Request, 6ms]

□ 05 - Rate Limiting & Burst Protection
  √  Burst Request 1 - Allowed (202 Accepted) [202 Accepted, 9ms]
  √  Burst Request 2 - Allowed (202 Accepted) [202 Accepted, 9ms]
  √  Burst Request 3 - Exceeded (429 Too Many Requests) [429 Too Many Requests, 6ms]
     - Retry-After: 60
     - X-RateLimit-Limit: 2
     - X-RateLimit-Remaining: 0

┌─────────────────────────┬──────────────────┬──────────────────┐
│                         │         executed │           failed │
├─────────────────────────┼──────────────────┼──────────────────┤
│              iterations │                1 │                0 │
├─────────────────────────┼──────────────────┼──────────────────┤
│                requests │               14 │                0 │
├─────────────────────────┼──────────────────┼──────────────────┤
│            test-scripts │               14 │                0 │
├─────────────────────────┼──────────────────┼──────────────────┤
│      prerequest-scripts │                7 │                0 │
├─────────────────────────┼──────────────────┼──────────────────┤
│              assertions │               28 │                0 │
├─────────────────────────┴──────────────────┴──────────────────┤
│ total run duration: 956ms                                     │
├───────────────────────────────────────────────────────────────┤
│ total data received: 13.46kB (approx)                         │
├───────────────────────────────────────────────────────────────┤
│ average response time: 18ms [min: 4ms, max: 83ms, s.d.: 21ms] │
└───────────────────────────────────────────────────────────────┘
```
