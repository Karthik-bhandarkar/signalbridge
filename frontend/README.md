# SignalBridge

Live deployment: https://3000-ici4y1z8dlesnbu6cc4xo.e2b.app

This is the current platform-hosted preview, not a permanent production domain. The landing page, `/docs`, `/api/health`, and the `/dashboard` sign-in redirect were verified over HTTPS during the animated-hero implementation. Preview URLs can expire or change when the sandbox restarts. Re-verify them before sharing.

- [Website](https://3000-ici4y1z8dlesnbu6cc4xo.e2b.app/)
- [Operator console](https://3000-ici4y1z8dlesnbu6cc4xo.e2b.app/dashboard) — requires sign-in; public demo credentials are shown on `/login`.
- [API documentation](https://3000-ici4y1z8dlesnbu6cc4xo.e2b.app/docs)
- [Health endpoint](https://3000-ici4y1z8dlesnbu6cc4xo.e2b.app/api/health)

## Overview

SignalBridge is a webhook-ingestion and incident-response demonstration for operators investigating alert noise. It verifies signed deliveries, records replays, correlates related events into incidents, and provides an authenticated console for incident actions and investigation.

### Confirmed implementation

- HMAC-SHA256 verification over the raw request body; invalid signatures return `401`.
- Idempotency-key lookup, database uniqueness, and a visible record of duplicate deliveries.
- Service/event-type fingerprint correlation within a 30-minute window for open or acknowledged incidents.
- Severity and escalation-policy updates with incident timeline entries.
- Operator acknowledge, resolve, manual reopen, escalation, and note actions.
- Raw payload retention in PostgreSQL JSONB, with an archive key and byte count.
- Database-backed metrics, health reporting, source lists, stage traces, and raw-payload inspection.

Pipeline stages execute inline in this repository. Redis, Celery recovery, scheduled synthetic monitoring, external notifications, and S3 uploads are **not** implemented here. A recorded archive key is not proof of an external object-store upload. The separate reference project linked from the site describes a broader architecture; do not confuse that with this running build.

## Technology

Next.js 16 App Router, React 19, TypeScript, Tailwind CSS 4, PostgreSQL, Drizzle ORM, Node.js cryptography, Framer Motion, and Lucide icons. Playwright is available for browser checks. Existing fonts are installed locally through Fontsource.

## Local setup

Prerequisites: Node.js 20.9+ with npm and a reachable PostgreSQL instance (PostgreSQL 16 is the development target).

1. Run `npm install` from this repository root.
2. Add `DATABASE_URL` to `.env`, pointing to your PostgreSQL database. Do not commit credentials.
3. Review `drizzle.config.json` before applying the schema. Its checked-in URL is for the sandbox's local database; change that configuration locally if your database differs.
4. Run `npx drizzle-kit push` for the configured database.
5. Run `npm run dev`, then visit `http://localhost:3000/`.

The first landing/login request initializes the seeded demo workspace through `ensureSeed()`. Demo operator credentials appear on the login page. Use a `SESSION_SECRET` environment variable for any deployment beyond this isolated demo. The current app also reads optional `NEXT_PUBLIC_SITE_URL` for canonical metadata. No container/Compose deployment is provided in this workspace.

## Important structure

```text
src/app/page.tsx                         Server-rendered landing and queried metrics
src/components/marketing/Hero.tsx        Single hero: workflow left, headline/actions right
src/components/marketing/Hero.module.css Responsive hero layout
src/components/marketing/WorkflowVisual.tsx
                                        Measured connectors and coordinated animation
src/components/marketing/WorkflowVisual.module.css
                                        Scoped warm-white diagram palette and geometry
src/components/marketing/Nav.tsx         Preserved product navigation and health indicator
src/styles/tokens.css                   Existing shared brand/system styles
src/app/dashboard/                      Authenticated operational views
src/app/docs/page.tsx                   Actual API contracts and build limitations
src/lib/pipeline.ts                     Inline ingest/correlation logic
src/lib/actions.ts                      Authenticated incident actions
src/db/                                 Drizzle client and schema
```

## Animated hero workflow

The workflow is the sole primary illustration **inside** the hero. There is no V illustration and no duplicate workflow-only section beneath it.

A shared nine-second clock coordinates label arrival, incoming path-aware signals, processing illumination, an outbound signal, incident-card feedback, badge confirmation, and the status capsule. Card text stays visible. Connectors are calculated from the actual DOM boundaries after font loading and resize, including the vertical mobile layout.

The diagram is illustrative: Monitor, PagerDuty, Datadog, the sample incident `INC-1047`, 47 alerts, and Priya's acknowledgment are demonstration content, not real third-party telemetry. The ingestion latency is supplied by this instance's database average; when unavailable the node says timing is not measured. Pause/resume is supported. Off-screen/hidden tabs pause the shared clock; `prefers-reduced-motion` gives a fully visible static diagram.

At desktop widths the workflow is left of the established four-line message, at approximately 58/42 proportions. Tablet and mobile stack copy/actions, workflow, then supporting project attributes. Narrow viewports use readable cards and vertical connectors rather than scaling down the entire desktop scene.

No hero video or video asset is present in this repository. No video was invented or introduced.

## Design documentation

- Current implementation record: `docs/design/02-animated-hero-workflow.md`.
- The latest user-supplied `02-ANIMATED-HERO-WORKFLOW-DESIGN.md` specification supersedes the previous V-hero placement instructions.
- Historical context: `docs/design/landing-page.md`, `docs/design/ui-refinement.md`, and `docs/design/reference-animation-analysis.md`. These describe earlier design passes, not necessarily the current architecture or approved layout.

## Verification

Required production checks:

```sh
npx next typegen
npm exec tsc -- --noEmit --pretty false
npm run build
```

Then use the platform-managed `build_and_start` to launch and check `/api/health`. For a normal self-hosted Next.js deployment, build first and use the project's start script with the same database environment.

Browser verification was completed in Chromium at 375px, 768px, and 1440px. The full nine-second sequence and repeat were observed; 29 visible particle positions remained within 0.59px of their SVG paths. Responsive output-connector endpoints matched the actual card/node boundaries. Manual/off-screen pause, reduced motion, the preserved navigation, See It Work anchor, demo sign-in, console routes, docs, and health checks passed with no page errors at those widths. The actual deployed root page was also opened and captured. No cross-browser, physical-device, or Lighthouse score is claimed.

Reproduce these checks against a running preview:

```sh
node scripts/check-animated-hero.mjs
# Or point CHECK_URL at the current verified hosted preview.
```

Route type generation, TypeScript, and the production build passed after the final code changes. See `docs/design/02-animated-hero-workflow.md` and `.screenshots/animated-hero/verification.json` for the detailed record. On mobile the readable stacked hero intentionally extends below the first viewport; it is not a separate workflow section.

## Coding-agent reporting rules

**Future coding tasks must read this README before starting and follow this reporting rule.** Every progress update, implementation report, review summary, and completion message must include the current verified deployment URL, exactly in this form:

`Live deployment: https://actual-verified-deployment-url`

When no current URL can be verified, use:

`Live deployment: NOT VERIFIED — deployment URL must be located or configured.`

Never substitute localhost for a deployed website or claim a platform preview is a permanent production domain. Re-check a changed URL, update this README when the actual deployment URL changes, and disclose expired/unreachable deployments. This file cannot control an agent that does not read and follow it.
