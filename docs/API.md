# SignalBridge API Reference Manual

> **Base URL:** `/api/v1/`  
> **API Version:** `v1`  
> **Authentication:** Dual-surface (HMAC-SHA256 for external webhooks; Django Session + CSRF for Operator Dashboard)

---

## 1. Authentication & Security Schemes

### External Webhook Ingestion
- **Header:** `X-Signature-SHA256` or `X-Hub-Signature-256`
- **Algorithm:** `HMAC-SHA256(payload_raw_bytes, secret_key)`
- **Comparison:** Constant-time `hmac.compare_digest` to prevent timing attacks.
- **Idempotency Header:** `X-Idempotency-Key` (Optional; fallback to JSON payload `idempotency_key` or `event_id`).

### Operator Dashboard REST APIs
- **Scheme:** Session-based authentication via HTTP-only cookie (`sessionid`).
- **CSRF Protection:** State-changing requests (`POST`, `PATCH`, `DELETE`) require `X-CSRFToken` header matching the `csrftoken` cookie.
- **Bootstrap Endpoint:** `GET /api/v1/auth/csrf/` establishes the CSRF token on initial UI load.

---

## 2. Ingestion Gateway Endpoints

### Ingest External Webhook
`POST /api/v1/webhooks/{source_slug}/`

Accepts, validates HMAC, dedupes, rate-limits, and schedules asynchronous normalization for inbound webhook events.

- **URL Parameters:**
  - `source_slug` (string, required): Unique identifier for the integrated service (e.g., `pagerduty`, `github`).
- **Request Headers:**
  - `Content-Type: application/json`
  - `X-Signature-SHA256: <hex-digest>`
  - `X-Idempotency-Key: <unique-uuid-or-hash>` (optional)
- **Response `202 Accepted`:**
```json
{
  "status": "accepted",
  "webhook_id": "9b1deb4d-3b7d-4bad-9bdd-2b0d7b3dcb6d",
  "idempotency_key": "evt-7729104",
  "received_at": "2026-10-20T21:45:00.120Z",
  "message": "Webhook payload buffered and queued for processing"
}
```
- **Error Responses:**
  - `401 Unauthorized`: Missing or invalid HMAC-SHA256 signature.
  - `403 Forbidden`: Webhook source is deactivated (`is_active=False`).
  - `404 Not Found`: Unknown `source_slug`.
  - `429 Too Many Requests`: Rate limit exceeded for this source.

---

## 3. Health & Readiness Probes

### Liveness Probe
`GET /health/live/`

Verifies that the WSGI/ASGI web server process is responsive and executing Python code.

- **Response `200 OK`:**
```json
{
  "status": "healthy",
  "probe": "live",
  "timestamp": "2026-10-20T21:45:00.000Z"
}
```

### Readiness Probe
`GET /health/ready/`

Deep dependency health check verifying active connectivity to PostgreSQL and Redis. Used by Kubernetes/Docker Compose orchestrators before routing traffic.

- **Response `200 OK` (All Dependencies Healthy):**
```json
{
  "status": "healthy",
  "database": "ok",
  "redis": "ok",
  "timestamp": "2026-10-20T21:45:00.000Z"
}
```
- **Response `503 Service Unavailable` (Degraded):**
```json
{
  "status": "unhealthy",
  "database": "OperationalError: could not connect to server",
  "redis": "ok",
  "timestamp": "2026-10-20T21:45:00.000Z"
}
```

---

## 4. Operator Session Authentication

### Log In
`POST /api/v1/auth/login/`

- **Request Body:**
```json
{
  "username": "operator",
  "password": "SecretPassword123!"
}
```
- **Response `200 OK`:**
```json
{
  "status": "authenticated",
  "user": {
    "id": 1,
    "username": "operator",
    "email": "operator@signalbridge.internal",
    "is_staff": true,
    "is_superuser": false
  }
}
```

### Current Session Status
`GET /api/v1/auth/me/`

- **Response `200 OK`:**
```json
{
  "authenticated": true,
  "user": {
    "id": 1,
    "username": "operator",
    "email": "operator@signalbridge.internal",
    "is_staff": true,
    "is_superuser": false
  }
}
```

### Log Out
`POST /api/v1/auth/logout/`

Flushes session cookie.

- **Response `200 OK`:**
```json
{
  "status": "logged_out"
}
```

### CSRF Token Bootstrap
`GET /api/v1/auth/csrf/`

- **Response `200 OK`:**
```json
{
  "csrfToken": "aBcDeFg123456..."
}
```

---

## 5. Incident Management APIs

### List Incidents
`GET /api/v1/incidents/`

- **Query Parameters:**
  - `status`: Filter by `TRIGGERED`, `ACKNOWLEDGED`, `RESOLVED`, `CLOSED`.
  - `severity`: Filter by `P1_CRITICAL`, `P2_HIGH`, `P3_MEDIUM`, `P4_LOW`, `P5_INFO`.
  - `ordering`: Default `-created_at`.
  - `page`: Page index (default 1).
  - `page_size`: Results per page (default 20).

### Incident Detail
`GET /api/v1/incidents/{id}/`

Returns incident metadata, correlated alerts list, and chronological audit event timeline.

- **Response `200 OK`:**
```json
{
  "id": "c1f7b605-6490-4d5d-9b62-1175628b030b",
  "title": "Payment gateway latency breach (stripe)",
  "status": "TRIGGERED",
  "severity": "P1_CRITICAL",
  "service": "billing-service",
  "assigned_to": null,
  "created_at": "2026-10-20T21:30:00Z",
  "updated_at": "2026-10-20T21:30:00Z",
  "resolved_at": null,
  "correlated_alerts": [
    {
      "id": "e22709bf-cf50-481e-84b8-f0273a016664",
      "external_id": "stripe-evt-991",
      "severity": "CRITICAL",
      "title": "Payment webhook timeout",
      "received_at": "2026-10-20T21:30:00Z"
    }
  ],
  "timeline_events": [
    {
      "id": 1,
      "event_type": "CREATED",
      "description": "Incident created from alert stripe-evt-991",
      "actor": "system",
      "created_at": "2026-10-20T21:30:00Z"
    }
  ]
}
```

### Acknowledge Incident
`POST /api/v1/incidents/{id}/acknowledge/`

Transitions state `TRIGGERED -> ACKNOWLEDGED`, records operator audit log, and notifies downstream subscribers.

### Assign Operator
`POST /api/v1/incidents/{id}/assign/`

- **Request Body:**
```json
{
  "assigned_to": "karthik"
}
```

### Resolve Incident
`POST /api/v1/incidents/{id}/resolve/`

Sets status to `RESOLVED`, sets `resolved_at` timestamp, and starts the 15-minute reopening deduplication window.

### Reopen Incident
`POST /api/v1/incidents/{id}/reopen/`

Manually moves resolved incident back to `TRIGGERED`.

### Add Incident Investigation Note
`POST /api/v1/incidents/{id}/notes/`

- **Request Body:**
```json
{
  "note": "Root cause identified: upstream connection pool exhausted. Restarting pods."
}
```

---

## 6. Alerts & Cold Storage Archive

### List Alerts
`GET /api/v1/alerts/`

- **Query Parameters:** `service`, `source`, `severity`, `page`.

### Alert Detail & Raw Payload
`GET /api/v1/alerts/{id}/`

Returns parsed alert model, raw JSON payload, and S3 archival pointer (`s3_key`, `archive_status`).

### Manual Reprocessing / Archival Retry
`POST /api/v1/alerts/{id}/retry/`

Dispatches manual background reprocessing or S3 archival retry task in Celery for a stuck or failed alert.

---

## 7. Synthetic API Monitoring

### List Monitored Services
`GET /api/v1/services/`

### Register Service
`POST /api/v1/services/`

- **Request Body:**
```json
{
  "name": "Booking Gateway",
  "slug": "booking-gateway",
  "description": "Core passenger ticket reservation API"
}
```

### List Synthetic Monitors
`GET /api/v1/monitors/`

### Create Synthetic Monitor
`POST /api/v1/monitors/`

- **Request Body:**
```json
{
  "service": 1,
  "name": "Health Check Probe",
  "target_url": "https://api.example.com/v1/health",
  "interval_seconds": 60,
  "timeout_seconds": 5,
  "expected_status_code": 200,
  "failure_threshold": 3,
  "is_active": true
}
```
*Note: Target URLs are verified by SignalBridge's SSRF validator. Requests targeting localhost, 127.0.0.1, RFC 1918 private subnets, or 169.254.169.254 are rejected with 400 Bad Request.*

### Trigger Immediate Monitor Probe
`POST /api/v1/monitors/{id}/probe/`

Synchronously triggers check probe and returns execution latency, HTTP status code, and pass/fail verdict.

---

## 8. Outbound Notification Integrations

### List Notification Destinations
`GET /api/v1/notifications/destinations/`

### Configure Notification Channel
`POST /api/v1/notifications/destinations/`

- **Request Body:**
```json
{
  "name": "DevOps Slack Channel",
  "channel_type": "SLACK",
  "target_endpoint": "https://hooks.slack.com/services/T00/B00/X00",
  "is_enabled": true
}
```

### Notification Delivery History
`GET /api/v1/notifications/deliveries/`

Returns an immutable log of all outbound webhook/Slack dispatch attempts with HTTP status codes and error payloads.

---

## 9. Global System Audit Log

### Retrieve System Audit Events
`GET /api/v1/audit/`

Returns all operator actions, state changes, note entries, and system reconciliations across all incidents.
