# SignalBridge — Live Demo Video Script & Operator Walkthrough

**Duration**: 3 to 4 minutes  
**Target URL**: `https://d1soslo0efb36p.cloudfront.net`  
**Audio / Narration Mode**: Clear, technical, direct.  
**Audience**: Staff Engineers, SRE Managers, Investors, Production Engineering Teams.

---

## Pre-Recording Checklist
1. Open Chrome in Incognito / clean profile at `https://d1soslo0efb36p.cloudfront.net`.
2. Ensure browser zoom is at 100% and resolution is 1080p (1920x1080).
3. Verify top navigation reads **"Sign In as Operator"** (confirming you start in unauthenticated Public Observer mode).
4. Verify the telemetry beacon displays green **"POLLING SYNC (3.5s)"** or **"LIVE (SSE)"**.

---

## Scene 1: The Problem & Product Overview (0:00 – 0:45)
**Screen**: Landing page (`/`) — start at the hero section, slowly scroll down past the pipeline visual to the bento grid.

**Action**:
- Show the headline: *"Turn alert noise into one clear incident, and never lose a signal."*
- Scroll to the Interactive Pipeline Architecture showing HMAC verification, deduplication, and S3 cold storage.
- Highlight the live metrics ribbon (sub-50ms p95 latency, deduplication rate).

**Narration / Voiceover**:
> *"Modern cloud systems don't suffer from a lack of alerts—they suffer from alert fatigue. When a downstream database pool saturates, upstream services fire hundreds of redundant webhooks within seconds, overwhelming on-call engineers.*
>
> *SignalBridge is a high-throughput webhook ingestion gateway and automated incident triage platform. It sits between alert providers like PagerDuty or Datadog and the on-call engineer, cryptographically verifying HMAC-SHA256 signatures, deduplicating replays at the ingestion edge, and clustering correlated signals into a single actionable incident."*

---

## Scene 2: Public Observer Mode & Mission Control (0:45 – 1:20)
**Screen**: Click **"Open Dashboard"** button in top right -> lands on `/dashboard`.

**Action**:
- Point to the 4 Dynamic KPI Cards:
  - **Deliveries · 24h**
  - **Open Incidents** (highlighting the red Critical indicator)
  - **Replays Suppressed Rate** (highlighting ~21.4% deduplication before worker queues)
  - **Mean Resolution (MTTR)** (calculated dynamically from real database timestamps)
- Note the live status beacon and the Public Observer indicator.

**Narration / Voiceover**:
> *"Here in Mission Control, public observers can see sanitized system health in real-time. Notice our four primary KPIs: deliveries in the rolling 24-hour window, open incidents, our replay suppression rate showing webhooks deduplicated before reaching Celery workers, and MTTR calculated dynamically from real database timestamps.*
>
> *In observer mode, production safeguards prevent tampering. If a spectator attempts to acknowledge or resolve an incident, or trigger the ingestion simulator, SignalBridge enforces strict RBAC."*

---

## Scene 3: One-Click Demo Operator Authentication (1:20 – 1:50)
**Screen**: Click **"Sign In as Operator"** in the top-right navbar.

**Action**:
- The **Operator Authentication Modal** opens.
- Click the **"Demo Operator"** quick-fill button. The username `demo.operator` and masked passkey populate instantly.
- Click **"Sign In to Operator Console"**.
- The modal smoothly dismisses. The top-right badge switches to **"• Operator: demo.operator"**, and the sidebar indicator switches from Public Observer to Demo Operator.

**Narration / Voiceover**:
> *"Let's authenticate as a verified Operator. With our built-in 1-click demo access, I select Demo Operator and sign in. Django validates the session, sets a secure HTTP-only cookie with fresh CSRF protection, and synchronizes state across all open tabs."*

---

## Scene 4: Ingesting Live Traffic via Simulator Studio (1:50 – 2:30)
**Screen**: The right-hand column: **"INGESTION SIMULATOR STUDIO"**.

**Action**:
- Point to the scenario options: **Payment Gateway Saturation**, **Database Connection Pool Exhaustion**, **Edge 5xx Storm**.
- Select **Payment Gateway Saturation**.
- Click the blue button: **"Dispatch Live Webhook"**.
- Point out the instant green success feedback: **"SIMULATION DISPATCHED · 200 OK"**.
- Watch the Active Incident Triage Feed update in real-time without a full page refresh.

**Narration / Voiceover**:
> *"Now we'll simulate a cascading outage using the built-in Ingestion Simulator Studio. I'll select the 'Payment Gateway Saturation' scenario and dispatch a live signed webhook burst.*
>
> *Behind the scenes, the request hits CloudFront, Nginx verifies the payload size, Gunicorn validates the HMAC-SHA256 signature, deduplicates the idempotent tracking ID, and clusters the alerts into PostgreSQL. In real-time via Server-Sent Events, the new incident appears right at the top of our triage feed."*

---

## Scene 5: Incident Investigation & State Transition (2:30 – 3:15)
**Screen**: The incident row in the active feed.

**Action**:
- Click on the newly dispatched incident row.
- The **Incident Detail Drawer** slides in from the right.
- Show the raw JSON payload preview, fingerprint, and correlated alert count (`×4`).
- Click **"Acknowledge Incident"** inside the drawer.
- The status pill transitions from red **OPEN** to amber **ACKNOWLEDGED**.
- Click **"Resolve Incident"**, type a quick note: `"Traffic shed, connection pool reset."`, and click Confirm.
- The incident moves to green **RESOLVED**, and the Open Incidents counter decrements immediately.

**Narration / Voiceover**:
> *"Clicking the incident opens the deep-dive drawer. We see the exact deduplication fingerprint, the correlated signals, and the raw payload archived in our cold tier.*
>
> *As an operator, I can acknowledge the incident with one click—instantly updating our team across all connected consoles. Once mitigated, I resolve it with resolution notes. The incident transitions to resolved, and our MTTR metric updates dynamically."*

---

## Scene 6: Operations Board & Deduplication Evidence (3:15 – 3:45)
**Screen**: Click **"Incidents"** in the left sidebar, then click **"Alerts (Ingestion Log)"**.

**Action**:
- On `/dashboard/incidents`: show the 3-column Kanban board (**Present / Active**, **Acknowledged / In Progress**, **Recently Resolved**).
- Switch to `/dashboard/events`: filter by **Duplicate**. Show the exact replay payloads intercepted and rejected.
- Switch to `/dashboard/system`: show the real-time health checks for PostgreSQL 16, Redis, Celery workers, and S3 cold storage.

**Narration / Voiceover**:
> *"The Incidents Board gives on-call engineers a complete 3-lane Kanban view of the incident lifecycle.*
>
> *In the Alerts Ingestion Log, we can filter for duplicates to see cryptographic proof of replays blocked at the perimeter—saving downstream workers from redundant compute.*
>
> *And finally, System Health provides live latency metrics for our PostgreSQL database, Redis correlation cache, and Celery worker pool."*

---

## Scene 7: Wrap-Up & Production Readiness (3:45 – 4:00)
**Screen**: Back to `/dashboard` or landing page.

**Narration / Voiceover**:
> *"SignalBridge: High-throughput ingestion, zero lost webhooks, and instant incident clarity. Deployed on AWS with CloudFront, Nginx, Django, Next.js, and PostgreSQL. Thank you."*

