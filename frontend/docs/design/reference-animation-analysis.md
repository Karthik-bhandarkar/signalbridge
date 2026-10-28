# Reference Animation Analysis — `https://tranquil-495tmg.peachworlds.com/`

> **Second-pass browser inspection:** See [ui-refinement.md](./ui-refinement.md) for the subsequent real Chromium desktop/mobile inspection, screenshot findings, corrections to this initial static-only analysis, and the current design decisions. The first implementation’s pinned theatre and fixed 3D sphere are no longer the public page’s composition.

**Analyst:** SignalBridge frontend team
**Reference captured:** site served under the title *“Vexel AI — Design Meets Intelligence”*, built with the **Peachworlds / PeachWeb** 3D website builder (`pwb-*` class prefixes, `/scene-state/*.json`, `/ui-state.json`).
**Purpose:** document the reference's motion system precisely enough that the SignalBridge landing page can be implemented without reopening the reference.

---

## 0. Inspection method and limitations (read first)

The reference was inspected **statically and structurally**, not with a scripted browser:

| Artifact | What it gave us | Confidence |
| --- | --- | --- |
| `/` HTML document (33.5 KB) | Section order, copy hierarchy, preloader markup (`#pwb-loading-wrap`), fixed `.pwb-scene` canvas host | High |
| `/scene-state/640fb4fb-…json` (19 KB) | Full 3D scene graph: camera, lights, material, post-processing stack, animation sheet definition | High |
| `/ui-state.json` (6.9 KB) | Scroll engine settings per device, the complete scroll-animation inventory (19 entries), section anchors | High |
| `/styles.css` (86 KB) | Type scale, palette frequency, layout primitives | High |
| `/script.js` bundle | Not reverse-engineered (minified builder runtime) | n/a |

**Known limitations — stated rather than invented:**

1. **No frame-by-frame capture.** Exact easing curves of the camera dolly are owned by the builder runtime; the sheet is declared as a `PositionalSequence` (`frames: 1000`, `unitType: percentage`, `lengthInUnits: 100`) whose per-track keyframe arrays are **empty in the shipped scene-state**, i.e. the camera/model motion is driven at runtime (scroll-mapped rig) rather than by baked keyframes. Our implementation therefore reproduces the *observable relationship* (scroll progress → camera dolly + model rotation) with our own curves.
2. **Model asset is proprietary** (`model.glb` + `alpha-map.png`, credited on the site to *Tamminen* via Sketchfab). We do **not** reuse it. SignalBridge ships an original, procedurally generated object.
3. **Cursor-follow / hover micro-interactions** on the 3D object could not be confirmed from static artifacts; we implement a conservative, damped pointer-parallax, which is consistent with the lights/rig setup.
4. All reference copy, branding, pricing and testimonials are ignored by design. Only *structure, rhythm, and motion grammar* are reproduced.

---

## 1. Extracted technical facts

### 1.1 Rendering / scene (from `scene-state`)

| Property | Reference value | SignalBridge decision |
| --- | --- | --- |
| Canvas host | `.pwb-scene` — **fixed, full-viewport, behind DOM content**, `canvas{width:100%;height:100%}` | Same: `position:fixed; inset:0; z-index:0`, DOM sections scroll above it |
| Scene background | `#000000`, preloader shell `#06040A` | `#05070D` → SignalBridge “deep slate” |
| Camera | Perspective, **fov 30**, position `(0, −0.021, 8.39)`, separate **Mobile Camera** with identical transform | fov 30, z 8.4 desktop / z 11 mobile |
| Lights | Ambient `#ffffff` @ 2.0 + two point lights: bottom-left `#18caff` @ 25, top-right `#00e7ff` @ 25 | Ambient 1.6 + point `#18CAFF` (bottom-left) + point `#0083FF` (top-right) + rose rim light that fades in on the escalation beat |
| Hero material | `MeshPhysical`, base `#006cff`, emissive `#65a5ff`, metalness 1, roughness 1, alpha-mapped | Emissive core `#4FA8FF`, metal shell, additive glow shells |
| Post-processing | **BLOOM** (intensity 1.5, radius 0.75, threshold 0.9, smoothing 0.028), **TONE_MAPPING** (mode 7 / ACES-ish, exposure 1), **HUE_SATURATION** (hue −0.222, saturation +0.21). DOF/noise/vignette/pixelation present but disabled | No `postprocessing` dependency (bundle cost). Bloom is reproduced with **additive glow shells + emissive overdraw + a CSS radial bloom layer**; ACES tone mapping is enabled natively on the WebGL renderer |
| Model scale | imported GLB at scale 1.5 inside a `Camera Rig` group | Procedural core at comparable screen footprint |

### 1.2 Scroll engine (from `ui-state.json`)

| Device | `scrollSettings` |
| --- | --- |
| desktop | `type: "smooth"`, `duration: 1200`, `speed: 100`, easing `default` |
| tablet | `type: "native"`, duration 1200 |
| mobile | `type: "native"` (and a dedicated mobile camera) |

➡ **Implementation:** Lenis smooth scroll on pointer-fine desktop (`duration ≈ 1.2 s`, exponential ease-out), native scrolling on touch devices and whenever `prefers-reduced-motion: reduce` is set.

### 1.3 Scroll-animation inventory (19 declared animations)

| Count | Type | Trigger | Effect | Transition | Replay |
| --- | --- | --- | --- | --- | --- |
| **17** | `element` | `start: "center"` (element crosses viewport centre) | `opacity: 0 → 1`, `offsetY: 20px → 0` | `spring` | `false` (play once) |
| 1 | `section` | `start: "bottom"` | section `fade` (hero trigger section cross-fades) | — | — |
| 1 | `scroll` | continuous | `scale: 1 → 1.3` | `linear` (scrubbed) | — |

➡ **This is the whole motion grammar of the reference**: a *single* repeated reveal primitive (fade + 20 px rise with a spring), one section-level cross-fade tied to the hero trigger, and one scroll-scrubbed scale. Everything else that “feels” animated comes from (a) the always-moving 3D object, (b) smooth scroll inertia, and (c) CSS hover transitions.

### 1.4 Type scale & palette (from `styles.css`)

Fonts: **DM Sans** (display) + **Inter** (UI).
Font-size histogram: 14 / 16 / 20 / 24 / 32 / 36 / 48 / 64 px — a tight 8-step scale, display copy mostly 48–64 px with heavy negative tracking.
Colour frequency: `#ffffff` ×116, `#000000` ×34, `#0083ff` ×1 (single saturated accent), plus `#141414` / `#ececec` neutrals.

➡ SignalBridge keeps this discipline: near-monochrome dark canvas, **one** saturated accent (`#0083FF`, which the brief also names), severity colours used *only* for state.

---

## 2. Section-by-section breakdown (reference → SignalBridge)

Scroll positions are expressed in viewport heights (`vh`) measured from document top on a 1440×900 desktop; they are approximate section boundaries derived from the document order and the builder's section anchors (`hero-trigger` at `offsetY 0`, `portfolio`).

| # | Reference section (≈ scroll range) | Observed behaviour | SignalBridge counterpart |
| --- | --- | --- | --- |
| 0 | **Preloader** (before 0 vh) | Full-screen `#06040A` overlay, centred logo, fixed bottom progress bar, percentage text; overlay lifts when scene + GLB are ready | `<Preloader/>`: boot log lines (`ingest edge`, `hmac verifier`, `correlation engine`…), 0→100 counter, bar on the baseline, curtain lifts upward |
| 1 | **Nav** (fixed) | Thin, transparent at top, centre links (`Use Cases / Features / About`), right CTA pill; becomes a translucent blurred capsule after scroll | `<SiteNav/>`: same anatomy — wordmark + status dot, centre anchors (Pipeline / Platform / Reliability / Docs), right “Open console” pill; blur + border appear after 24 px |
| 2 | **Hero** (0 – 100 vh) | Eyebrow pill (“Now with …”), 2-line display headline, one-sentence subhead, two buttons, 3D object centred behind/above copy; copy reveals in sequence | Eyebrow “Webhook ingestion → incident response”, headline *“Every webhook becomes a decision.”* word-by-word reveal, subhead, two CTAs, live stat strip fed by the database |
| 3 | **Hero-trigger cross-fade** (100 vh) | Section-level `fade` at `start: bottom`; hero copy fades out while the 3D object remains and the next section arrives | Hero copy fades/blurs out on exit; the 3D core stays pinned and starts its dolly |
| 4 | **Capability triad** (100 – 180 vh) | Short section title + 3 equal cards (“Ironclad Protection / Effortless Connections / Ready to Grow”), each card reveals with the fade+rise primitive, staggered | “Delivery guarantees” triad: **Signature verification / Idempotent ingest / Deterministic correlation** |
| 5 | **Three alternating story rows** (180 – 420 vh) | Large copy block alternating left/right with the 3D object taking the opposite side; each has heading, paragraph, text link (“Discover How / See It Work / Try It Now”) | **Pinned pipeline theatre** (scroll-scrubbed, 6 stages) followed by 3 alternating rows: Correlation engine / Escalation policy / Payload archival |
| 6 | **Security grid** (420 – 520 vh) | Section header + 2×2 card grid, cards reveal staggered on centre-crossing, subtle hover lift | **Platform grid**: 2×2 of ingest edge, worker model, storage, delivery guarantees — with “implemented here” vs “reference architecture” labelling |
| 7 | **Trust band** (520 – 560 vh) | “Trusted by world leaders” + logo strip | **Stack marquee**: infinite horizontal strip of the technologies actually wired up in this build |
| 8 | **Testimonials** (560 – 640 vh) | 3 quote cards, staggered reveal | **Operator notes** (3 short field notes — presented as product narrative, not fabricated customer logos) |
| 9 | **Stats band** (640 – 680 vh) | 3 oversized numbers (99.99% / 1M+ / 24/7) with captions | **Live telemetry band** — numbers queried from Postgres at request time (events, dedupe rate, p95 latency, open incidents) |
| 10 | **Pricing** (680 – 800 vh) | 3 cards, middle emphasised, feature bullet lists | **Interactive demo + API docs**: signed-webhook sender wired to the real ingest endpoint, plus endpoint reference cards with copyable `curl` |
| 11 | **Closing CTA** (800 – 870 vh) | Oversized centred line (“Launch with Vexel.”) + 2 buttons, object re-centres behind it | “Ship the signal path.” + console / docs CTAs, core re-centres and re-ignites |
| 12 | **Footer** (870 vh →) | Thin legal row, credits, small links | Footer with build facts, credits, honest implementation note |

---

## 3. Scroll interaction map (SignalBridge implementation)

Normalised document progress `p ∈ [0,1]` drives a single `requestAnimationFrame` loop; the 3D rig reads it from a ref (never React state) so no re-renders occur during scroll.

| Beat | `p` range | Camera | Core object | Lighting / colour |
| --- | --- | --- | --- | --- |
| Hero idle | 0.00 – 0.08 | z 8.4, slow pointer-parallax | slow Y spin, shells breathing | cyan + blue key lights |
| Dolly in | 0.08 – 0.26 | z 8.4 → 5.6, y −0.1 | spin accelerates, ring tilt opens | bloom shells brighten |
| Pipeline theatre (pinned) | 0.26 – 0.52 | z 5.6 → 4.8 with lateral drift ±0.6 | core splits into orbiting ring segments, particles flow along the ingest axis, one segment lights per stage | accent shifts cyan → blue |
| Escalation beat | 0.52 – 0.66 | z 4.8 → 6.2, slight roll | core pulses, rose rim light ramps in | critical rose `#E11D48` mixes in at 35 % |
| Archive / platform | 0.66 – 0.86 | z 6.2 → 7.4, rises on y | particles settle into a lattice shell | returns to blue, saturation −15 % |
| Closing CTA | 0.86 – 1.00 | z 7.4 → 8.8, re-centres | full re-ignition, fastest spin, scale 1.08 | max glow |

Backward scrolling simply replays the same mapping in reverse (pure function of `p`, no stateful timelines), which matches the reference's scrubbed behaviour. The 17 DOM reveals are **play-once** (`replay:false` in the reference) and therefore do **not** reverse — identical semantics here via `IntersectionObserver` with `unobserve()` after firing.

**Pinned section mechanics (pipeline theatre):** a `300 vh` tall wrapper containing a `100 vh` `position: sticky` stage. Local progress `q = clamp((scrollTop − top) / (height − vh))` selects stage `floor(q × 6)` and drives the progress rail, the stage card stack, and the terminal payload. This is the one place where we go *beyond* the reference's primitive set, because the product story (6 pipeline stages) requires scrubbing; it is still built from the reference's vocabulary (pinned stage + scrubbed scalar + fade/rise reveals).

---

## 4. Motion primitives to implement

1. **`Reveal`** — the workhorse. `opacity 0 → 1`, `translateY 20px → 0`, spring-ish `cubic-bezier(.16,1,.3,1)`, `520 ms`, `IntersectionObserver` at `rootMargin: "0px 0px -45% 0px"` (≈ “element crosses centre”), fires once, supports `delay` for stagger (90 ms steps, matching the reference's card cadence).
2. **`WordReveal`** — hero headline only: words wrapped in masked spans, rising 110 % with 45 ms stagger. (The reference animates the headline as one block; we refine it for a product headline, keeping the same direction and feel.)
3. **Scrubbed scale/parallax** — `scale 1 → 1.3` linear on the hero visual frame, mirroring the single `scroll`-type animation found in `ui-state.json`.
4. **Hover micro-interactions** — 1 px border lightening, `translateY(-4px)`, glow bleed at 180 ms `ease-out`; cards use a pointer-tracked radial highlight.
5. **Preloader curtain** — progress counter then `clip-path`/transform lift, 900 ms.
6. **Smooth scroll** — Lenis, desktop only, `duration 1.2 s`.

## 5. Responsive observations

- Reference ships a **dedicated mobile camera** → we pull the camera back (z 11) and reduce the particle count by ~60 % under 768 px, DPR clamped to 1.5.
- Reference falls back to **native scrolling** on tablet/mobile → Lenis is skipped on coarse pointers.
- Type scale collapses from 64 px display to ~36 px; our clamp: `clamp(2.4rem, 6.4vw, 5.25rem)`.
- The 2×2 and 3-up grids stack to a single column; the pinned pipeline theatre degrades to a **non-pinned stacked list** below 1024 px so content is never trapped behind a scroll-jack on touch.
- `prefers-reduced-motion: reduce`: no Lenis, no preloader counter animation, reveals become instant, the 3D canvas renders a single static frame.

## 6. What we deliberately do *not* copy

- Branding, copy, pricing tables, testimonials, logos, the GLB asset, and any builder runtime code.
- Fabricated social proof (“1M+ companies”). SignalBridge's equivalent band shows **real numbers from its own database**, which is both honest and more convincing for the target audience (engineers, SRE leads, technical evaluators).

## 7. Mapping summary (one-liner)

> Dark, near-monochrome canvas + one blue accent + a permanently pinned, scroll-driven emissive 3D object + a single fade/rise reveal primitive used everywhere + smooth inertial desktop scrolling + oversized closing CTA — restaged as *webhook → verified → deduplicated → correlated → escalated → archived*.
