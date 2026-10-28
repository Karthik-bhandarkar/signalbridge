# Animated hero workflow — implementation record

## Scope

Implement the latest user-supplied `02-ANIMATED-HERO-WORKFLOW-DESIGN.md`: replace the V illustration inside the existing hero, not in another section. Preserve the header, main message, actions, and all other landing/application routes.

## Inspection

- The project is Next.js 16 App Router + React 19 + TypeScript with PostgreSQL/Drizzle.
- Previous hero: `src/components/marketing/Hero.tsx` imported `HeroVisual.tsx`, which rendered the V.
- Previous workflow: `WorkflowVisual.tsx` rendered a separate section beneath `<Hero />` in `src/app/page.tsx`.
- Current `avgLatencyMs` comes from `getLandingMetrics()` and is an instance average, not a latency SLA.
- There was no root README, no `<video>` element, and no `.mp4`, `.webm`, `.mov`, or `.ogg` asset in `public/`. No video asset has been invented or added.
- The supplied warm-white workflow screenshot is the primary diagram reference; the existing purple hero/header remain the brand reference.

## Implementation

- `Hero.tsx`: workflow is the left visual region; copy and actions occupy the right. Mobile DOM order is copy/actions, workflow, project attributes.
- `Hero.module.css`: approximately 58/42 desktop split with width-aware spacing, four-line reference headline, and a deliberate stacked layout below 1100px.
- `WorkflowVisual.tsx`: one nine-second master clock; staggered label arrival, incoming curved-path particles, processor response, outbound particle, incident response, badge/capsule confirmation, completed hold, repeat.
- Connectors are measured from the actual HTML bounding boxes after resize/font load; they switch to vertical geometry at narrow diagram widths.
- `WorkflowVisual.module.css`: scoped light surface with subtle pink/mint lighting, pastel two-line labels, white node, orange-red brand tile and connector, incident card, and bottom capsule.
- Cards and text remain visible; motion is supplemental. Pause/resume, off-screen pause, hidden-tab pause and reduced-motion static fallback are included.
- Deleted the V component and removed its `.hx-*` styles and old standalone `.wf-*` block. No V is left behind the new visual.
- `README.md`: confirmed stack/setup, deployment link and environment limitations, source structure, and permanent progress/completion deployment-link reporting rule.

## Data boundaries

Monitor, GitHub, Datadog, PagerDuty, sample incident `INC-1047`, 47 grouped alerts, duplicate status, and Priya are **illustrative reference data**. They do not claim live accounts or a real acknowledgment. Only the ingestion latency is supplied by the instance metric. Zero/unavailable timing is explicitly identified as unmeasured.

## Actual verification

Live deployment: https://3000-ici4y1z8dlesnbu6cc4xo.e2b.app

The URL is a verified platform-hosted preview, not a permanent production domain. The deployed root page was opened in Chromium and captured in `.screenshots/animated-hero/deployed-1440-hero.png`. HTTPS website, documentation, health, and the dashboard sign-in redirect were checked.

### Browser checks — PASS

Reproducible check: `node scripts/check-animated-hero.mjs`, against the running production preview. Set `CHECK_URL` to test another verified instance. Results are saved to `.screenshots/animated-hero/verification.json`; screenshots are in the same directory.

- **375px:** no horizontal overflow; one workflow inside the hero, no V; all three stage labels remain present. Copy/actions precede the complete vertical workflow, then supporting attributes. Diagram panel measured 335 × 664px.
- **768px:** no overflow; intentional stacked hero, horizontal diagram with attached connectors. Panel measured 704 × 367px.
- **1440px:** no overflow or overlapping hero regions; workflow on the left, message/actions on the right; both columns and attributes visible in the first 900px viewport. Panel measured 762 × 371px.
- **Short desktop:** principal hero content also fits within 1440 × 720px and 1440 × 768px viewports, with no scrolling required to see the workflow, actions, and attributes.
- **Connector alignment:** measured output endpoints had zero-pixel error against the node and incident boundaries at all three widths, including the vertical mobile connector.
- **Coordinated animation:** observed a complete nine-second cycle and return to arrival. All seven phases were seen in order: signals arrive, signals travel, processing, incident connection, incident response, confirmation, completed state.
- **Path-aware motion:** sampled 29 visible particle positions during the verification run; maximum distance from their actual SVG curves was 0.59px.
- **Visual response:** observed processor, incident, and confirmation highlights while card text stayed visible and stable.
- **Pause/resume:** user pause freezes the shared clock; off-screen workflow pauses; resume restarts playback without resetting card content. Hidden-document pause is implemented through `visibilitychange`; a real tab-backgrounding check was not separately automated.
- **Reduced motion:** no moving signal markers, four static incoming paths, full incident and status capsule visible, and motion controls correctly disabled.
- **Existing functionality:** responsive navigation links, keyboard command palette, See It Work anchor offset, demo sign-in, overview, events, incidents, system health, documentation, and `/api/health` checked successfully.
- **Browser page errors:** none at the three tested widths.

### Production checks — PASS

The following were actually run successfully from the project root after the final code changes:

- `npx next typegen`
- `npm exec tsc -- --noEmit --pretty false`
- `npm run build`

The platform build/start/health sequence passed during implementation and browser verification. The final managed production build, server start, database bootstrap, and `/api/health` healthcheck also passed after the documentation update.

## Remaining boundaries

- On mobile the complete readable hero is intentionally taller than one viewport; it is not scaled into an unreadable desktop thumbnail. All required elements remain in the same hero section.
- No hero video was found, so no video integration was tested or invented.
- Sample incident data is labeled illustrative; ingestion timing is queried from the current instance and may change between requests.
- Checks were performed in Chromium, not Safari/Firefox or a physical mobile device. No Lighthouse score is claimed.
