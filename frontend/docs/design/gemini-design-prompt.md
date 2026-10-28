# SignalBridge — high-end design prompt for Gemini

**Where to paste it:** Google AI Studio → https://aistudio.google.com — choose the strongest **Gemini Pro** model
available to you and enable *thinking*. If you use Google's agentic IDE (Antigravity), paste it as the task and attach
the repo.

**How to use it:** paste everything under the line. Attach 3–4 screenshots of the current page (hero, bento, story,
CTA) so the model critiques what actually exists. Ask it to return **unified diffs per file**, not whole rewrites.

---

## ROLE

You are a principal product designer and senior front-end engineer at the level of Linear, Stripe, Vercel and Resend.
You have taste. You remove things. You can defend every pixel, easing curve and colour with a reason.

## PRODUCT

**SignalBridge** is an incident-response platform. It receives signed webhooks (PagerDuty, Datadog, GitHub, API
monitors), removes duplicates, rejects tampered or abusive requests, correlates related alerts into **one incident**,
recovers automatically if a worker crashes, and lets operators acknowledge, assign, resolve and audit incidents.

**Core message:** "Turn alert noise into one clear incident, and never lose a signal."

Audience: SRE leads, platform engineers, technical recruiters. They are sceptical, busy and allergic to marketing
fluff. Lead with the problem and outcome. Jargon (HMAC, ZSET, SETNX, SELECT FOR UPDATE) belongs only in the
"Under the hood" section.

## ACTUAL STACK — do not assume otherwise

- **Next.js 16 App Router + React 19 + TypeScript** (NOT Vite). Tailwind v4 is installed but the marketing page uses
  hand-written CSS.
- Motion: `framer-motion`, `lenis` (smooth scroll), `lucide-react` icons.
- Fonts (self-hosted via Fontsource): Inter Tight Variable, Instrument Serif (italic accent only), JetBrains Mono.
- Landing page: `src/app/page.tsx` composing `src/components/marketing/*`.
- **All design tokens live in one file:** `src/styles/tokens.css` (colour, radius, shadow, spacing, motion).
- `/dashboard`, `/login`, `/docs`, `/api/*` and `src/lib/*` **must not be touched or broken.** Every "Open Dashboard"
  button links to `/dashboard`.

## CURRENT DESIGN SYSTEM

Warm editorial. **No black, no blue.**

| Token | Value | Use |
| --- | --- | --- |
| paper | `#f6f1e7` | page |
| card | `#fffdf8` | surfaces |
| ink | `#241e18` | headings (warm espresso, never `#000`) |
| slate | `#6b6156` | body |
| ember | `#bc4423` | the single accent |
| sage / amber / rose | `#3f6a4f` / `#a9721a` / `#a83a50` | status only |

Type: Inter Tight for UI; Instrument Serif **italic** for one emphasis phrase per page; JetBrains Mono for code/labels.
Easing `cubic-bezier(0.22, 1, 0.36, 1)`. Animate **only transform and opacity**.

## PAGE STRUCTURE (keep this order)

Opening curtain → Nav → Hero (+ animated signal→node→incident visual, trust strip) → Ticker → Pinned story (50 alerts →
verify → dedupe → 1 incident) → Scroll-linked statement → Four sticky pipeline steps → Bento (7 tiles with micro
animations) → Interactive playground (20 duplicate alerts → 1 incident) → Incident lifecycle → Product showcase tabs →
Under the hood → Proof numbers → Quickstart → Final CTA → Footer. ⌘K command palette throughout.

## WHAT STILL FEELS AMATEUR — fix these

1. **Tracking is too tight** on the hero headline, buttons and body; words nearly touch.
2. **The background is a flat tan.** Only the hero visual has motion. Design a restrained ambient background system
   that evolves with scroll: slow drifting colour fields, parallax, a pointer-reactive glow, fine grain. Premium and
   quiet — never a screensaver.
3. **Story chips (8px) are illegible**; the chaos should read as chaos *and* be legible.
4. The closing CTA card is static and generic.
5. Section transitions are abrupt; propose a consistent rhythm (tint changes, hairlines, overlap).
6. Look for generic "AI-built" tells: identical card grids, icon-in-circle features, symmetrical everything. Replace
   with deliberate asymmetry, scale contrast and typographic confidence.

## HARD CONSTRAINTS

- Light theme only. Palette above. One accent. Status colours only for status.
- Respect `prefers-reduced-motion` (disable loops/parallax, keep fades) and coarse pointers (no cursor effects).
- 60fps: no animating `filter`, `box-shadow`, `width`, `height`. Pause off-screen loops.
- WCAG AA contrast, visible 2px focus rings, keyboard-complete, `aria-live` for status changes.
- No lorem ipsum, no fake logos, no invented customer quotes, no emojis. Use realistic data
  ("Checkout API p95 > 800 ms", "payments-service", "47 alerts grouped").
- Keep it truthful: only claim what the product does.

## PROCESS — follow in order

1. **Critique** the attached screenshots in 8 bullets, ordered by impact.
2. **State a design concept in 3 sentences.**
3. **Propose** the ambient-background system: layers, motion values, scroll mapping, and why each earns its place.
4. **Implement** as unified diffs against the exact files above (`tokens.css`, `page.tsx`, the specific
   `components/marketing/*.tsx`). Introduce new files only when necessary.
5. **Self-review** against the constraints list and call out anything you were unsure about.

## OUTPUT FORMAT

Per file: path, one-line rationale, then the diff. No prose between diffs. End with a 5-line verification checklist
(typecheck, build, 320/390/768/1440 px, reduced motion, `/dashboard` still routes).
