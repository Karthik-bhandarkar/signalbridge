# SignalBridge Dashboard Design

## Global shell
- Left sidebar (collapsible, 240px / 64px): Overview, Incidents, Alerts (ingestion log), Simulator, Audit Log, Settings, Public Status (opens in new tab).
- Top bar: page title, global search, telemetry beacon, "Demo Mode" chip if applicable, operator menu (name, role, sign out).
- Tokens: use colors, typography, spacing and motion from DESIGN.md.

## 1. Login page
- Centered card on the dark background, logo, product tagline.
- Fields: username, password (show/hide toggle), Sign in button, inline errors (no hint about which field was wrong).
- Below: "Demo Access" card (see Part A) with Copy buttons and "Fill & Sign in".
- Link: "View public status page" (no login).

## 2. Overview
- Row 1, KPI cards (live): Deliveries 24h, Open Incidents, Replay Suppression Rate, MTTR. Each has a label, a big mono number, a delta vs previous period, and a tiny sparkline.
- Row 2: left 2/3 "Active Incidents" (top 5 from the Present section, link to Incidents). Right 1/3 "System Health" (API, DB latency, Redis, Celery worker, S3, each with a green/amber/red dot and a value).
- Row 3: "Activity Feed" (latest alerts, state changes and operator actions, live, with relative time).

## 3. Incidents
- Header: filters (severity, service, source, date), "Show simulated" toggle, Board/Table switch.
- Sections as in Part B.
- Incident card/row: status chip, severity pill, title, service, alert count, live age, actions.
- Click opens the Detail Drawer.

## 4. Incident Detail Drawer (slides from right, 480px)
- Header: title, status chip, severity, ID (mono), Acknowledge/Resolve buttons.
- Summary: first seen, last seen, affected service, source, alert count, dedup count.
- Timeline: vertical, newest first, each event has icon, text, actor, timestamp (alerts correlated, status changes, operator notes).
- Correlated alerts list, each with an expandable payload (JSON viewer) and an "Archived in S3" indicator (path hidden for demo users).
- Operator note input (adds to the timeline and the audit log).

## 5. Alerts (ingestion log)
- Live table: received time, source, signature status (Verified/Failed), dedup result (New/Suppressed duplicate), linked incident, processing time (ms).
- Filters: signature status, dedup result, source. Failed signatures are highlighted red.

## 6. Simulator Studio
- Scenario cards: Payment Gateway Saturation, Database Connection Pool Exhaustion, Edge 5xx Storm. Each has a description and expected severity.
- Dispatch Live Webhook button (disabled while running), optional "burst count" (1-10).
- Pipeline tracker with 4 live steps and real timings: HMAC Verified, Dedup Key Checked, Correlated into Incident, Appears in Triage Feed. Each step shows pending, running, done or failed.
- Result card: link to the created incident.
- Rate limited, tagged source="simulator".

## 7. Audit Log
- Table: time, operator name, action (login, acknowledge, resolve, note, simulator dispatch), target incident, IP (masked for demo users).
- Filter by operator and action. Export CSV (admin only).

## 8. Settings (admin only; hidden or read-only for demo users)
- Webhook endpoint URL with copy button.
- Signing secret: masked, "Reveal" (admin only, logged in the audit log), "Rotate".
- Users list and roles.
- Retention and S3 archive status.

## 9. Public Status Page (no login)
- Header: overall status banner (All Systems Operational / Degraded / Major Outage, colour-coded).
- Section "Active Incidents" with live updates.
- Section "Recently Resolved (7 days)".
- Component list with status dots.
- Safe fields only: no operator names, internal IDs, dedup keys, payloads, S3 paths.

## States and behaviour for every screen
- Skeleton loading, friendly empty states, error banners with Retry, toast on every action.
- Real-time updates via SSE or polling fallback. Beacon shows LIVE / RECONNECTING / OFFLINE.
- Responsive: sidebar becomes a bottom/hamburger nav under 768px, tables become cards.
- Accessibility: AA contrast, aria-live for new incidents, keyboard navigable, visible focus ring, reduced-motion respected.

