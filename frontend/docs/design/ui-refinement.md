# SignalBridge — UI refinement, second pass

## New evidence

The user supplied a complete stitched desktop capture of the reference. A real Chromium browser was then installed using Playwright, including its system dependencies. The reference was visited at 1440×1000, scrolled from top to bottom (y=0,1000,2100,3900,6100,8700; document height 9792px), and captured separately at 390×844 with touch enabled. Captures are under `.screenshots/reference-*.png` and are inspection artifacts, not reused product assets.

### Corrections to the original static-only analysis

- The live scene is an emissive, densely sampled cylindrical/ring form, not an observed solid icosahedron. No reference geometry is reused.
- The initial viewport is primarily typography: eyebrow at ~y215, two-line 64px heading at ~y250, description at ~y385, two pill CTAs at ~y455; dashboard frame begins ~y625, width ~1000px. It is **not** a centred floating-object-first hero.
- The nav stays visible when scrolling. The brand is flush left, with a centred black rounded navigation group; the white CTA contains a separate black circular northeast arrow.
- At y2100 an alternating story row has a ~400px copy block on the left and a roughly square, delicate outlined UI illustration on the right, with abundant negative space. Another row reverses this order.
- At y3900 the live canvas is dark with a large cyan form cropped above the security heading. The stitched screenshot instead shows white expanses around these sections. This is a capture/runtime difference, not evidence that the live site changes to white at these exact scroll positions.
- On mobile, the navigation becomes a white round menu button. The headline collapses to two lines around 32px, CTAs remain side-by-side, the scene recedes below them, and the dashboard is scaled to fit the narrow screen.
- Closing CTA at y8700 is centred, ~64px, with a large glowing form cropped on the right. Observed forward/backward scroll was used for section navigation; no claim is made about exact unmeasured easing parameters.

## Design diagnosis of the previous SignalBridge page

1. All sections used the same translucent navy surface, so a 10-section page had almost no visual punctuation.
2. Repeated pills, uppercase monospaced microcopy and blue rectangles overwhelmed the hierarchy.
3. The first screen showed implementation exposition instead of the actual product.
4. The 420vh pinned pipeline slowed navigation unnecessarily; details belonged in a click-through explorer.
5. Long paragraphs and repeated API examples diluted the story.
6. The SB tile was not a distinct wordmark and button styles were inconsistent between sections.

## Implementation plan

1. **Hero:** off-black, restrained blue light, short two-line display headline, concise promise, two premium capsules. A large interactive console preview overlaps the dark/light boundary and uses database results, not an image or invented telemetry.
2. **Light capability chapter:** source wordmarks, editorial introduction, three neutral feature cards with purpose-built icons and varying internal graphics.
3. **Dark workflow chapter:** three alternating narrative rows with original SVG/CSS illustrations: signature gate, correlation topology, and incident timeline. Fine hairlines and local blue bloom, no repeated glass grids.
4. **Light reliability bento:** asymmetric 7/5 then 5/7 cards with actual stage-ledger, source and archive concepts. Honest current-build labels stay present but no architecture disclaimer dominates the section heading.
5. **Pipeline explorer:** six real buttons select each stage. Keyboard-friendly, non-pinned, accessible on touch. No scroll trapping.
6. **Live demo:** dark console, lighter control density, robust request state, clear 202/200/401 feedback, replay disabled until a delivery exists, live trace and console deep-link.
7. **Docs:** compact copyable integration example and functional API links rather than a long wall of endpoints.
8. **Footer:** large editorial closing CTA, useful navigation, oversized original wordmark. No invented customers, availability guarantees or pricing.
9. **Console:** retain task-focused light operational screens, improve sidebar hierarchy, context header, command/search flow, icons, focus states, pending feedback, and button styling.

## Interaction specification

- Capsule CTA: 48px desktop / at least 44px touch target, asymmetric padding with a separate 28px arrow disc, white/dark variants, inset highlight and layered neutral shadow. Hover: disc rotates 45° while the arrow translates diagonally; active: 0.98 scale; keyboard: 3px offset focus ring.
- Cards: 220ms border/shadow shift; no exaggerated tilting or pointer-chasing cursor.
- Entrances: reference's fade + 20px rise, 650ms ease-out, 70–90ms stagger, once. Reveal content remains visible without JavaScript.
- Desktop scroll: Lenis 1.2s; native touch/reduced-motion. Anchors retain hash and offset, no scroll reset on return visits.
- Dashboard preview: working overview/events tabs, interactive chart hover, accessible console links; data labelled as seeded demo-instance telemetry.
- Mobile: collapse hero preview's sidebar, use a touch-sized menu, stack alternating rows and bento, wrap code safely, no horizontal page overflow.

## Acceptance

Desktop, tablet, mobile and reduced-motion browser checks; full-page scroll; open/close mobile nav; preview tabs; pipeline controls; signed/replay/tampered webhook flows; login; console filter/search; zero uncaught browser errors. Then Next typegen, TypeScript, production build, platform health check.
