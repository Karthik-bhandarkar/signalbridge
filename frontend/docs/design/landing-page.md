# SignalBridge landing page

**Concept** — warm paper, editorial type, one indigo signal. The hero *performs* the product promise: fourteen scattered
alert chips drift into a single frosted node and resolve into one quiet incident card. Everything else either explains a
guarantee or gets out of the way.

## Run it

```bash
npm install
cp .env.example .env        # DATABASE_URL pointing at Postgres
npx drizzle-kit push        # schema for the dashboard
npm run dev                 # http://localhost:3000
```

- Landing page: `/`
- Operator dashboard (untouched by this work): `/dashboard` (redirects to `/login` when signed out)
- API reference page: `/docs`
- Health endpoint used by the nav status dot: `/api/health` (fails silently if unreachable)

Production: `npm run build && npm start`. Deploy preview URL shows the same routes.

## Structure

`src/app/page.tsx` composes, in order: `Nav` → `Hero` (+ `HeroVisual`, trust strip) → `StoryScroll` → `HowItWorks` →
`Bento` → `Playground` → `Lifecycle` → `Showcase` → `UnderTheHood` → `Proof` → `Quickstart` → `FinalCTA` → `Footer`.
`CommandPalette` mounts from `Nav`; `SmoothScroll` runs Lenis. All design tokens live in `src/styles/tokens.css`.
Dashboard, docs API routes and `src/lib/*` data helpers are unchanged.

## Interactions

- Hero loop: 11s. Chips drift, converge, card emerges. Pauses off-screen (`useInView`) and renders a static poster frame
  under `prefers-reduced-motion`.
- Pinned story: sticky + `useScroll` progress. Falls back to four stacked blocks under 860px.
- Playground: real local state, 20 chips, counters, `aria-live` announcements, reset.
- Showcase: pointer parallax clamped to ±5°, tab keyboard support, mock fallback for screenshots.
- ⌘K / Ctrl-K palette across sections, docs, GitHub and dashboard.
- Scroll progress hairline, count-ups, copy buttons with toast, focus rings, skip link.

## Swapping screenshots

See `public/screens/README.md`. The Showcase tries `/screens/<tab>.png` and silently keeps its rendered mock if missing.

## Verification

`node scripts/verify-landing.mjs` (requires `npx playwright install chromium` and a running app) checks layout, the
palette, playground counters, tabs, copy buttons, mobile menu, overflow at 320/390/768, reduced motion and console errors.
