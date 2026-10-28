"use client";

import { AnimatePresence, motion } from "framer-motion";
import { Activity, ChevronLeft, ChevronRight, CircleDot, LayoutDashboard, Lock, Radio, SlidersHorizontal } from "lucide-react";
import { useState } from "react";
import { Reveal } from "./primitives";
import type { LandingMetrics } from "@/lib/metrics";

const TABS = [
  { id: "overview", label: "Overview", icon: LayoutDashboard },
  { id: "incidents", label: "Incidents", icon: CircleDot },
  { id: "events", label: "Event stream", icon: Radio },
  { id: "system", label: "System health", icon: Activity },
] as const;
type TabId = (typeof TABS)[number]["id"];

const EXAMPLE_EVENTS = [
  { source: "prometheus-prod", title: "alert.firing · checkout-api", state: "processed", tone: "healthy" },
  { source: "github-deploys", title: "workflow_run · edge-gateway", state: "processed", tone: "healthy" },
  { source: "cloudwatch-edge", title: "alarm.change · edge-gateway", state: "duplicate", tone: "warning" },
] as const;

function Screen({ id, metrics }: { id: TabId; metrics?: LandingMetrics }) {
  return (
    <div className="sc-mock">
      <aside className="sc-side" aria-hidden="true">
        <div className="sc-side-brand"><i>S</i>SignalBridge</div>
        {TABS.map(tab => <span className="sc-nav" data-active={tab.id === id} key={tab.id}><tab.icon aria-hidden="true" />{tab.label}</span>)}
        <div style={{ marginTop: "auto", padding: "7px 5px", borderTop: "1px solid var(--line)", color: "var(--muted)", fontSize: 7.5 }}>Demo workspace</div>
      </aside>
      <div className="sc-main">
        <div className="sc-head"><div><h4>{TABS.find(tab => tab.id === id)?.label}</h4><p>Illustrative layout · totals are loaded from this instance</p></div><span className="lp-status lp-status-neutral">example view</span></div>
        {id === "overview" && <>
          <div className="sc-kpis">
            {[{ label: "Open incidents", value: metrics ? String(metrics.openIncidents) : "—", note: metrics ? `${metrics.criticalOpen} critical` : "" }, { label: "Events (24h)", value: metrics ? String(metrics.events24h) : "—", note: metrics ? `${(metrics.dedupeRate * 100).toFixed(0)}% replays` : "" }, { label: "p95 latency", value: metrics ? `${metrics.p95LatencyMs}ms` : "—", note: "ingest pipeline" }, { label: "Stored signatures", value: metrics ? `${Math.round(metrics.verifiedRate * 100)}%` : "—", note: "valid deliveries" }].map(kpi => <div className="sc-kpi" key={kpi.label}><span>{kpi.label}</span><strong>{kpi.value}</strong><small>{kpi.note}</small></div>)}
          </div>
          <div className="sc-bodyrow"><div className="sc-box"><h5>Delivery volume · illustration</h5><div className="sc-bars" aria-hidden="true">{[38, 52, 30, 64, 44, 78, 56, 88, 48, 66, 34, 58, 72, 40, 62, 50, 84, 46, 70, 36, 54, 80, 42, 60].map((height, index) => <i key={index} style={{ height: `${height}%` }} />)}</div></div><div className="sc-box"><h5>Incident states</h5><div className="sc-list">{["open", "acknowledged", "resolved"].map((label, index) => <div className="sc-li" key={label}><span className={`lp-status lp-status-${index === 0 ? "critical" : index === 1 ? "warning" : "healthy"}`}>{label}</span><span>Incident workflow</span></div>)}</div></div></div>
        </>}
        {id === "incidents" && <div className="sc-box" style={{ marginTop: 12, minHeight: 168 }}><h5>Incident list · illustrative rows</h5><div className="sc-scroll">{["Checkout API degraded", "Edge gateway error rate", "Billing webhook event"].map((title, index) => <div className="sc-li" key={title}><span className={`lp-status lp-status-${index === 0 ? "critical" : "warning"}`}>{index === 0 ? "critical" : "warning"}</span><b>{title}</b><span style={{ marginLeft: "auto" }}>open</span></div>)}</div></div>}
        {id === "events" && <div className="sc-box" style={{ marginTop: 12, minHeight: 168 }}><h5>Webhook deliveries · illustrative rows</h5><div className="sc-scroll">{EXAMPLE_EVENTS.map(event => <div className="sc-li" key={event.source}><span className={`lp-status lp-status-${event.tone}`}>{event.state}</span><span style={{ minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{event.title}</span><span style={{ marginLeft: "auto", color: "var(--muted)", flex: "none" }}>{event.source}</span></div>)}</div></div>}
        {id === "system" && <div className="sc-grid2" style={{ marginTop: 12 }}>{[{ name: "Ingest edge", detail: "HMAC verification" }, { name: "PostgreSQL", detail: "events · incidents" }, { name: "Pipeline stages", detail: "inline task ledger" }, { name: "Payload storage", detail: "Postgres JSONB" }].map(item => <div className="sc-box" key={item.name} style={{ minHeight: 62 }}><h5>{item.name}</h5><span>{item.detail}</span></div>)}</div>}
      </div>
    </div>
  );
}

export default function Showcase({ metrics }: { metrics?: LandingMetrics }) {
  const [active, setActive] = useState<TabId>("overview");
  const activeTab = TABS.find(tab => tab.id === active) ?? TABS[0];
  const step = (delta: number) => setActive(TABS[(TABS.findIndex(item => item.id === active) + delta + TABS.length) % TABS.length].id);
  return (
    <section id="showcase" className="lp-section" aria-labelledby="showcase-title">
      <div className="lp-wrap">
        <div className="lp-head"><Reveal className="lp-head-copy"><span className="lp-eyebrow">Inside the console</span><h2 id="showcase-title" className="lp-h2">A quiet room to work in.</h2></Reveal><Reveal className="lp-head-aside" delay={0.08}><p className="lp-body" style={{ margin: 0 }}>Explore the real console’s four views: overview, incidents, delivery stream and system health.</p></Reveal></div>
        <Reveal><div className="sc-shell"><div className="sc-frame"><div className="sc-chrome" aria-hidden="true"><span className="sc-dots"><i /><i /><i /></span><span className="sc-url"><Lock size={8} /> /dashboard</span><span style={{ width: 34 }} /></div><div className="sc-screen" role="tabpanel" id={`panel-${activeTab.id}`} aria-labelledby={`tab-${activeTab.id}`}><AnimatePresence mode="wait" initial={false}><motion.div key={active} style={{ position: "absolute", inset: 0 }} initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.22 }}><Screen id={active} metrics={metrics} /></motion.div></AnimatePresence></div></div></div></Reveal>
        <div className="sc-controls"><div className="sc-arrows"><button type="button" aria-label="Previous screen" onClick={() => step(-1)}><ChevronLeft size={16} aria-hidden="true" /></button><button type="button" aria-label="Next screen" onClick={() => step(1)}><ChevronRight size={16} aria-hidden="true" /></button></div><div className="sc-tabs" role="tablist" aria-label="Console screens">{TABS.map(tab => <button key={tab.id} type="button" role="tab" id={`tab-${tab.id}`} aria-selected={tab.id === active} aria-controls={`panel-${tab.id}`} tabIndex={tab.id === active ? 0 : -1} className="sc-tab" data-active={tab.id === active} onClick={() => setActive(tab.id)} onKeyDown={event => { if (!["ArrowLeft", "ArrowRight", "Home", "End"].includes(event.key)) return; event.preventDefault(); const index = TABS.findIndex(item => item.id === active); const next = event.key === "Home" ? 0 : event.key === "End" ? TABS.length - 1 : (index + (event.key === "ArrowRight" ? 1 : TABS.length - 1)) % TABS.length; setActive(TABS[next].id); document.getElementById(`tab-${TABS[next].id}`)?.focus(); }}><tab.icon size={13} aria-hidden="true" />{tab.label}</button>)}</div></div>
        <p className="lp-small" style={{ textAlign: "center", marginTop: 14, display: "flex", alignItems: "center", justifyContent: "center", gap: 6 }}><SlidersHorizontal size={12} aria-hidden="true" /> This is an illustration. Overview totals are queried on page load; rows and charts are examples. Open the console for live data.</p>
      </div>
    </section>
  );
}
