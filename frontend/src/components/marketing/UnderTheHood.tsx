"use client";

import { Database, Layers, Network, ShieldCheck, Terminal } from "lucide-react";
import Link from "next/link";
import { useState } from "react";
import { CopyButton, Reveal } from "./primitives";
import { DOCS_HREF } from "@/lib/site";

const TABS = [
  {
    id: "security", label: "Security", icon: ShieldCheck,
    code: `// src/lib/pipeline.ts (excerpt)
const expected = sign(input.rawBody, source.secret);
const provided = (input.signature ?? "").trim();
const signatureValid = provided.length > 0 &&
  safeEqual(expected, provided);

if (!signatureValid) {
  // Record the failed verification and return 401.
}`,
    points: ["HMAC-SHA256 verification uses a constant-time comparison", "Invalid signatures return 401 and do not create an event", "Source signing keys stay on the server"],
  },
  {
    id: "deduplication", label: "Deduplication", icon: Layers,
    code: `// An explicit idempotency key takes precedence.
const dedupeKey = input.idempotencyKey?.trim()
  || hash(source.slug + ":" + input.rawBody);

const existing = await findEventByKey(dedupeKey);
if (existing) {
  // Record a replay without repeating incident updates.
}`,
    points: ["A supplied idempotency key or body hash identifies a delivery", "A unique database index protects the deduplication key", "Replays are retained as duplicate records"],
  },
  {
    id: "correlation", label: "Correlation", icon: Network,
    code: `// Illustrative summary of the implemented policy.
const fingerprint = hash(service + "::" + eventType, 16);
const windowStart = receivedAt - 30 * 60 * 1000;

// Find an open or acknowledged incident with the same
// fingerprint and a last signal inside the window.`,
    points: ["Fingerprints are derived from service and event type", "Only open or acknowledged incidents inside 30 minutes match", "Severity and escalation level are recorded on the incident"],
  },
] as const;

const CURL = `BODY='{"event":"alert.firing","service":"checkout-api","severity":"critical"}'
SIG=$(printf '%s' "$BODY" | openssl dgst -sha256 -hmac "$WEBHOOK_SECRET" -r | cut -d' ' -f1)
curl -X POST "$SIGNALBRIDGE_URL/api/v1/webhooks/prometheus-prod" \\
  -H "Content-Type: application/json" \\
  -H "X-SignalBridge-Signature: sha256=$SIG" \\
  -H "X-Idempotency-Key: alert-7731" -d "$BODY"`;

function Diagram() {
  const boxes = [
    { x: 12, label: "Sources", sub: "signed webhooks" },
    { x: 184, label: "Ingest API", sub: "verify · deduplicate" },
    { x: 360, label: "Normalize", sub: "service · event type" },
    { x: 536, label: "Correlate", sub: "incident · escalation" },
    { x: 712, label: "Postgres", sub: "payloads · timeline" },
  ];
  return (
    <svg viewBox="0 0 870 172" role="img" aria-label="Sources send signed webhooks to the ingest API. Inline stages normalize and correlate the event, then record the results in Postgres.">
      {boxes.map((box, index) => <g key={box.label}><rect x={box.x} y="46" width="152" height="62" rx="10" fill="var(--card)" stroke="var(--line)" /><circle cx={box.x + 17} cy="67" r="3" fill="var(--brand-violet)" /><text x={box.x + 29} y="71" fontFamily="var(--f-ui)" fontSize="11" fontWeight="600" fill="var(--ink)">{box.label}</text><text x={box.x + 17} y="92" fontFamily="var(--f-mono)" fontSize="8" fill="var(--muted)">{box.sub}</text>{index < boxes.length - 1 && <line x1={box.x + 152} y1="77" x2={boxes[index + 1].x} y2="77" stroke="var(--line-2)" strokeWidth="1" />}</g>)}
      <text x="8" y="26" fontFamily="var(--f-mono)" fontSize="8" fill="var(--muted)" letterSpacing="1.4">CURRENT REQUEST PATH</text>
    </svg>
  );
}

export default function UnderTheHood() {
  const [active, setActive] = useState<(typeof TABS)[number]["id"]>("security");
  const tab = TABS.find(item => item.id === active) ?? TABS[0];
  return (
    <section id="security" className="lp-section" aria-labelledby="security-title">
      <div className="lp-wrap">
        <div className="lp-head">
          <Reveal className="lp-head-copy"><span className="lp-eyebrow">Under the hood</span><h2 id="security-title" className="lp-h2">For the people who investigate.</h2></Reveal>
          <Reveal className="lp-head-aside" delay={0.08}><p className="lp-body" style={{ margin: 0 }}>A closer look at the security and correlation logic in this implementation.</p></Reveal>
        </div>
        <div className="uth-grid">
          <Reveal><div className="uth-card"><div className="uth-tabs" role="tablist" aria-label="Engineering topics">{TABS.map(item => <button key={item.id} type="button" role="tab" aria-selected={item.id === active} aria-controls={`uth-panel-${item.id}`} id={`uth-tab-${item.id}`} tabIndex={item.id === active ? 0 : -1} className="uth-tab" data-active={item.id === active} onClick={() => setActive(item.id)} onKeyDown={event => { if (event.key !== "ArrowRight" && event.key !== "ArrowLeft") return; event.preventDefault(); const index = TABS.findIndex(entry => entry.id === active); const next = TABS[(index + (event.key === "ArrowRight" ? 1 : TABS.length - 1)) % TABS.length]; setActive(next.id); document.getElementById(`uth-tab-${next.id}`)?.focus(); }}><item.icon size={12} aria-hidden="true" />{item.label}</button>)}</div><div className="uth-code" role="tabpanel" id={`uth-panel-${active}`} aria-labelledby={`uth-tab-${active}`}><div className="uth-code-bar"><span className="uth-file"><Terminal size={11} />{active === "security" ? "pipeline.ts · excerpt" : "pipeline.ts · simplified"}</span><CopyButton text={tab.code} label="Copy snippet" /></div><pre className="uth-pre"><code>{tab.code}</code></pre></div></div></Reveal>
          <Reveal delay={0.08}><div><ul className="uth-takeaways">{tab.points.map(point => <li key={point}><ShieldCheck size={13} aria-hidden="true" />{point}</li>)}</ul><div className="uth-diagram"><Diagram /></div><div className="uth-curl"><div className="qs-code"><div className="qs-code-bar"><span>signed delivery · set your URL and secret first</span><CopyButton text={CURL} label="Copy curl example" /></div><pre className="qs-pre"><code>{CURL}</code></pre></div><div style={{ marginTop: 12 }}><Link href={DOCS_HREF} className="lp-link" style={{ fontSize: 12.5 }}>Full API reference</Link></div></div></div></Reveal>
        </div>
        <Reveal delay={0.1}><p className="lp-small" style={{ marginTop: 18 }}><Database size={12} aria-hidden="true" style={{ display: "inline", marginRight: 5 }} />This build runs pipeline stages inline and stores raw payloads in PostgreSQL JSONB. A separate task queue and external object storage are not configured.</p></Reveal>
      </div>
    </section>
  );
}
