"use client";

import { Activity, Archive, Check, CopyCheck, FileJson, History, Merge, MousePointerClick, ScrollText } from "lucide-react";
import type { ReactNode } from "react";
import { Reveal } from "./primitives";

function Tile({ span, icon, title, copy, badge, children, delay = 0 }: { span: 4 | 5 | 7; icon: ReactNode; title: string; copy: string; badge?: string; children: ReactNode; delay?: number }) {
  return (
    <Reveal className={`bento-span-${span}`} delay={delay}>
      <article className="lp-tile bento-tile">
        <div className="bento-head"><span className="bento-icon">{icon}</span><h3>{title}</h3>{badge && <span className="bento-chip">{badge}</span>}</div>
        <p>{copy}</p>
        <div className="bento-stage" aria-hidden="true">{children}</div>
      </article>
    </Reveal>
  );
}

const AUDIT = [
  { time: "14:02", text: "Incident opened", who: "pipeline" },
  { time: "14:04", text: "Acknowledged", who: "operator" },
  { time: "14:07", text: "Investigation note", who: "operator" },
  { time: "14:21", text: "Resolved", who: "operator" },
  { time: "14:33", text: "Manually reopened", who: "operator" },
];

export default function Bento() {
  return (
    <section id="features" className="lp-section" aria-labelledby="features-title">
      <div className="lp-wrap">
        <div className="lp-head">
          <Reveal className="lp-head-copy"><span className="lp-eyebrow">Everything on the path</span><h2 id="features-title" className="lp-h2">Built to make the next step clear.</h2></Reveal>
          <Reveal className="lp-head-aside" delay={0.08}><p className="lp-body" style={{ margin: 0 }}>Verification, correlation, operator actions and a recorded trail — the pieces available in this running demo.</p></Reveal>
        </div>
        <div className="bento">
          <Tile span={5} icon={<CopyCheck size={15} aria-hidden="true" />} title="Duplicate detection" copy="Replayed deliveries remain visible, but do not repeat the original incident update." badge="replays identified">
            <div className="bd-rows">{["Prometheus · checkout-api", "Prometheus · checkout-api", "GitHub · edge-gateway"].map((label, index) => <div className="bd-row" key={label + index}><i className="lp-dot" />{label}<em>delivery {index + 1}</em></div>)}</div>
            <span className="bd-target"><Check size={9} /> duplicate</span>
          </Tile>
          <Tile span={7} delay={0.06} icon={<Merge size={15} aria-hidden="true" />} title="Incident correlation" copy="Alerts with a matching service and event-type fingerprint can join the same active incident." badge="30-minute window">
            <div className="bc-orbit">{["EV-1", "EV-2", "EV-3", "INC"].map(label => <span className="bc-chip" key={label}>{label}</span>)}<span className="bc-node"><Merge size={22} /></span></div>
          </Tile>
          <Tile span={4} delay={0.12} icon={<History size={15} aria-hidden="true" />} title="Processing ledger" copy="Each inline pipeline stage records a status, reason and duration for inspection." badge="stage traces">
            <div className="bs-track"><div className="bs-task"><i className="bs-dot" /><strong>verify signature</strong><em>recorded</em></div><div className="bs-task"><i className="bs-dot" /><strong>correlate event</strong><em>recorded</em></div></div>
          </Tile>
          <Tile span={4} delay={0.18} icon={<Activity size={15} aria-hidden="true" />} title="Pipeline metrics" copy="See delivery counts, latency percentiles and stage outcomes from this instance." badge="database-backed">
            <div className="bm-graph"><svg viewBox="0 0 220 80" preserveAspectRatio="none"><defs><linearGradient id="bmGrad" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="#a974ff" stopOpacity="0.28" /><stop offset="100%" stopColor="#a974ff" stopOpacity="0" /></linearGradient></defs><path className="bm-fill" d="M0 62 L18 58 L36 60 L54 48 L72 52 L90 36 L108 41 L126 26 L144 31 L162 18 L180 24 L198 12 L220 16 L220 80 L0 80 Z" /><path className="bm-line" d="M0 62 L18 58 L36 60 L54 48 L72 52 L90 36 L108 41 L126 26 L144 31 L162 18 L180 24 L198 12 L220 16" /></svg></div>
            <div className="bm-foot"><span>delivery volume</span><span>illustrative trace</span></div>
          </Tile>
          <Tile span={4} delay={0.24} icon={<Archive size={15} aria-hidden="true" />} title="Payload storage" copy="The original payload is stored in PostgreSQL JSONB with an archive key and byte count." badge="local ledger">
            <div className="ba-rows"><div className="ba-row"><FileJson size={10} /> event payload<b className="done">STORED</b></div><div className="ba-row"><Archive size={10} /> archive key<b className="done">RECORDED</b></div><div className="ba-row"><FileJson size={10} /> storage driver<b>POSTGRES</b></div></div>
          </Tile>
          <Tile span={5} delay={0.3} icon={<MousePointerClick size={15} aria-hidden="true" />} title="Operator actions" copy="Acknowledge, resolve, reopen or escalate an incident from the authenticated console." badge="console workflows">
            <div className="bn-grid">{["Acknowledge", "Resolve", "Reopen", "Add note"].map(label => <span className="bn-item" key={label}><Check size={11} />{label}<i /></span>)}</div>
          </Tile>
          <Tile span={7} delay={0.36} icon={<ScrollText size={15} aria-hidden="true" />} title="Incident timeline" copy="Pipeline events and operator actions share an ordered history for each incident." badge="recorded history">
            <div className="bu-viewport"><div className="bu-list">{[...AUDIT, ...AUDIT].map((entry, index) => <div className="bu-row" key={`${entry.text}-${index}`}><time>{entry.time}</time><b>{entry.text}</b><span style={{ marginLeft: "auto", color: "var(--muted)" }}>{entry.who}</span></div>)}</div></div>
          </Tile>
        </div>
        <p className="lp-small" style={{ marginTop: 18 }}>Tile animations are illustrative. The operator console and metrics endpoint show this instance’s actual data.</p>
      </div>
    </section>
  );
}
