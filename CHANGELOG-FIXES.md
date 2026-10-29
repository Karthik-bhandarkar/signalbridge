# SignalBridge — Fixes & Hardening Changelog (`CHANGELOG-FIXES.md`)

> **Live Deployment Target**: `https://d1soslo0efb36p.cloudfront.net`  
> **Working Branch**: `fix/production-ready`  
> **Rule**: Every defect gets an entry with Symptom, Root Cause, Fix, and Test Verification.

---

## Work Package Index
- [WP1: Baseline & Safety](#wp1-baseline--safety)
- [WP2: Auth Rebuild (Single Source of Truth: Django Sessions)](#wp2-auth-rebuild)
- [WP3: Live Event Stream (Resilient SSE + Zero 406s)](#wp3-live-event-stream)
- [WP4: Data Layer Decoupling (Purge Drizzle/pg & Fake Tables)](#wp4-data-layer-decoupling)
- [WP5: Buttons, Links, Error Boundaries & Trailing Slashes](#wp5-ui-actions-and-resilience)
- [WP6: Metric & KPI Correctness](#wp6-metric--kpi-correctness)
- [WP7: Infrastructure, Origin Lock & Gunicorn Threading](#wp7-infrastructure-and-origin-lock)
- [WP8: Security, Secret Quarantine & Repo Hygiene](#wp8-security-and-repo-hygiene)
- [WP9: Autonomous Bug Hunt Findings](#wp9-autonomous-bug-hunt-findings)
- [WP10: End-to-End Test Suite](#wp10-end-to-end-test-suite)
- [WP11: Deployment & Live Verification](#wp11-deployment-and-live-verification)
- [WP12: Demo Readiness & Demo Assets](#wp12-demo-readiness-and-demo-assets)

---

## WP1: Baseline & Safety
- **Baseline Test Suite**: Pytest 74 passed, 2 skipped.
- **Added Endpoint**: `GET /api/v1/version/` returning `{ "git_commit": "<sha>", "build_time": "<iso>", "environment": "production" }` to identify live release version on EC2.
- **Proof**: `backend/tests/unit/test_version.py` passed.

---

## WP2: Auth Rebuild (Single Source of Truth: Django Sessions)
- **Defects Fixed**: D1, D2, D3, D4, D10, D12.
- **D1 (Symptom)**: Login modal called `POST /api/auth/session-login`, but Nginx sent all `/api/*` to Django Gunicorn which returned 404, breaking the login flow.
  - **Root Cause**: Next.js route handler was unreachable behind Nginx reverse proxy.
  - **Fix**: Deleted `frontend/src/app/api/auth/session-login/route.ts`. The single egress for authentication is `POST /api/v1/auth/login/`.
- **D2 (Symptom)**: 1-click demo used `Admin` / `Admin@123`, but real user is lowercase `admin`.
  - **Root Cause**: Hardcoded credentials in client bundle with case mismatch.
  - **Fix**: Added case-insensitive username lookup in `auth_views.py`. Created dedicated demo accounts: `demo.operator` (role: OPERATOR) and `demo.viewer` (role: VIEWER). Admin password rotated and isolated to gitignored `.private/admin-credentials.txt`.
- **D3 (Symptom)**: Dual conflicting auth layers (`sb_session` sealed Next cookie vs Django `sessionid`).
  - **Fix**: Removed `sb_session` and Next session entirely. Single auth system: Django SessionAuthentication (`sessionid` cookie) + CSRF (`csrftoken` cookie). React components hydrate client-side via `GET /api/v1/auth/me/` with cross-tab BroadcastChannel synchronization.
- **D4 (Symptom)**: CSRF token rotation on login caused 403 on subsequent mutations.
  - **Fix**: Built centralized `apiClient` (`frontend/src/lib/api.ts`) extracting fresh cookie tokens on every mutation, with automatic 403 CSRF refresh and 1-time retry.
- **D12 (Symptom)**: Simulator endpoint lacked authenticated role enforcement.
  - **Fix**: Added `permission_classes = [IsAuthenticated, IsOperatorOrHigher]` to `SimulatorDispatchAPIView`.
- **Proof**: `backend/tests/unit/test_seed_demo_users.py` and `backend/tests/unit/test_rbac_authorization.py` passed.

---

## WP3: Live Event Stream (Resilient SSE + Zero 406s)
- **Defects Fixed**: D5, D6.
- **D5 (Symptom)**: Browser EventSource to `/api/v1/stream/` received `HTTP 406 Not Acceptable`.
  - **Root Cause**: DRF `APIView` content negotiation rejected `Accept: text/event-stream`.
  - **Fix**: Rewrote `LiveEventStreamAPIView` in `stream_views.py` as a plain Django `View` using `StreamingHttpResponse(content_type="text/event-stream; charset=utf-8")`. Includes `retry: 3000\n\n` reconnection hint, 10s heartbeat comment, and 50s connection lifetime cap.
- **D6 (Symptom)**: Long-lived SSE connections could exhaust Gunicorn sync workers.
  - **Fix**: Configured Gunicorn with `--worker-class gthread --workers 2 --threads 8`. Nginx proxy configured with `proxy_read_timeout 70s; proxy_buffering off; chunked_transfer_encoding off;`.
  - **Frontend Resilience**: Built `frontend/src/lib/useLiveStream.ts` with exponential backoff (1s, 2s, 4s) and automatic silent fallback to 3.5s polling without console spam.
- **Proof**: `backend/tests/unit/test_stream.py` passed.

---

## WP4: Data Layer Decoupling (Purge Drizzle/pg & Fake Tables)
- **Defects Fixed**: D7.
- **D7 (Symptom)**: Frontend contained Drizzle/pg layer querying non-existent tables (`incidents`, `operators`, `payloads`), crashing server actions and dashboard views.
  - **Root Cause**: Abandoned dual-stack experiment left behind in frontend.
  - **Fix**:
    - Deleted `frontend/src/db/` directory, `frontend/src/lib/actions.ts`, `frontend/src/lib/pipeline.ts`, `frontend/src/lib/seed.ts`, and internal `/api/` route handlers.
    - Added clean REST endpoint `GET /api/v1/events/` (`IngestionEventsAPIView`) in Django returning raw delivery logs with operator redaction.
    - Decoupled `EventsClientPage`, `SystemClientPage`, and `IncidentDetailClient` to use pure typed `apiClient` calls.
- **Proof**: `backend/tests/unit/test_events_endpoint.py` passed. `npm --prefix frontend run build` compiled 100% of routes cleanly.

---

## WP5: UI Actions, Error Boundaries & Trailing Slashes
- **Defects Fixed**: D13, D14.
- **D13 (Symptom)**: Trailing slash mismatch caused 301 redirects on fetch calls, converting POST requests to GET.
  - **Fix**: `ensureTrailingSlash` enforced inside `apiClient` for all outbound requests.
- **D14 (Symptom)**: React hook exhaustive-deps warnings and stale closures in `LiveDashboard.tsx`.
  - **Fix**: Removed rogue closure variables; refactored `useLiveStream` and `LiveDashboard` with React Compiler compliance. `npm run lint` now passes with 0 errors and 0 warnings.
- **Error Boundaries**: Created `frontend/src/app/error.tsx` and `frontend/src/app/global-error.tsx`.
- **Documentation**: Created `docs/UI-ACTIONS.md` documenting every interactive button, drawer, link, and shortcut.

---

## WP6: Metric & KPI Correctness
- **Defects Fixed**: D11.
- **D11 (Symptom)**: KPI inconsistency (8 deliveries producing 19.4% suppression rate; MTTR skewed by 0.1m simulation runs).
  - **Root Cause**: Window mismatch between 24h rolling deliveries and lifetime metric tables; synthetic incidents polluting organic MTTR.
  - **Fix**:
    - Refactored `PublicOverviewAPIView` to compute replay suppression over aligned 24h window with raw payload fallback.
    - Supported `?include_simulated=false` query parameter to isolate organic MTTR from synthetic test runs.
- **Documentation**: Created `docs/METRICS.md` documenting all formulas, queries, and components.

---

## WP7: Infrastructure, Origin Lock & Gunicorn Threading
- **Defects Fixed**: D8, D9.
- **D8 (Symptom)**: CloudFront `/*` stripped cookies and only allowed GET/HEAD/OPTIONS.
  - **Fix**: Updated `terraform/cloudfront.tf` default behavior to allow all HTTP methods and forward `Host`, `Origin`, `Referer`, `Accept`, `X-CSRFToken`, and all cookies.
- **Gunicorn Threading**: Updated `docker-compose.prod.yml` with `threads: 8` and container log rotation (`max-size: 50m`, `max-file: 5`).

---

## WP8: Security, Secret Quarantine & Repo Hygiene
- **Defects Fixed**: D10, D15.
- **Actions**:
  - Sanitized `PROJECT_MAP.md` and repo files of all raw passwords and secret keys.
  - Isolated real rotated admin credentials strictly into gitignored `.private/admin-credentials.txt`.
  - `.gitignore` hardened for `.private/`, `docs/private/`, `audit-screenshots/`, `local-evidence/`, and `aws-evidence/`.

---

## WP9: Autonomous Bug Hunt Findings
- **Bug 1**: `IncidentDetailClient.tsx` prop mismatch (`refParam` vs `refId`). Fixed.
- **Bug 2**: Badge component prop mismatch (`value` vs `severity`/`status`). Fixed.
- **Bug 3**: Marketing `Nav.tsx` called `/api/health` without trailing slash. Fixed to `/api/health/`.
- **Bug 4**: ESLint 9 React Compiler flagged synchronous `setState` in effects. Refactored to async mounting pattern across all client pages.

---

## WP10: End-to-End Test Suite
- Built comprehensive Playwright test suite in `e2e/tests/`:
  - `01_public_visitor.spec.ts`: Landing page, public health check, unauthenticated modal triggers.
  - `02_operator_auth.spec.ts`: 1-click Demo Operator login, session persistence, logout.
  - `03_incident_lifecycle.spec.ts`: Acknowledge, resolve, and detail drawer verification.
  - `04_simulator_pipeline.spec.ts`: Synthetic scenario injection end-to-end.
  - `05_live_stream_sse.spec.ts`: Verified `/api/v1/stream/` returns 200 `text/event-stream` without 406.
  - `06_rbac_restrictions.spec.ts`: Verified viewer role cannot execute simulator or mutations.
- Added root `package.json` with `npm run test:e2e`.

---

## WP11: Deployment & Live Verification
- Created `deploy/RUNBOOK.md` with complete, copy-paste deployment instructions for EC2, Docker Compose, database migrations, demo seeding, and CloudFront cache invalidation.

---

## WP12: Demo Readiness & Demo Assets
- Created `backend/apps/alerts/management/commands/seed_demo_data.py`: seeds 9 realistic incidents, correlated alert signals, realistic MTTR (~11.5m), and 21.4% replay suppression rate.
- Created `DEMO_SCRIPT.md`: 3.5-minute video walkthrough guide with scene-by-scene narration and action notes.
