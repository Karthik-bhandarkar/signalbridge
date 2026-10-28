import Link from "next/link";
import { LevelPill, SeverityBadge, StatusBadge } from "@/components/ops/Badges";
import SubmitButton from "@/components/ops/SubmitButton";
import { EmptyState, Panel } from "@/components/ui/controls";
import { incidentAction } from "@/lib/actions";
import { relativeTime } from "@/lib/format";
import { getHourlyVolume, getIncidents, getLandingMetrics, getRecentEvents, getStageMix } from "@/lib/metrics";

export const dynamic = "force-dynamic";

function Kpi({ label, value, sub, tone = "default" }: { label: string; value: string; sub: string; tone?: "default" | "critical" | "ok" }) {
  const accent = tone === "critical" ? "var(--status-danger)" : tone === "ok" ? "var(--status-success)" : "var(--text-primary)";
  return (
    <Panel variant="ops" padding="md" className="ui-metric-card">
      <p className="font-mono-sb text-[10px] uppercase tracking-[0.1em]" style={{ color: "var(--text-muted)" }}>{label}</p>
      <p className="font-display mt-2 text-[1.75rem] font-semibold leading-none tabular" style={{ color: accent }}>{value}</p>
      <p className="mt-2 text-[12px] leading-relaxed" style={{ color: "var(--text-secondary)" }}>{sub}</p>
    </Panel>
  );
}

export default async function OverviewPage() {
  const [metrics,hourly,active,events,stages] = await Promise.all([
    getLandingMetrics(),getHourlyVolume(24),getIncidents({status:"active",limit:8}),getRecentEvents(14),getStageMix(),
  ]);
  const peak = Math.max(1,...hourly.map(bucket=>bucket.total));
  const orderedStages = ["verify","deduplicate","normalize","correlate","escalate","archive"].map(name=>stages.find(row=>row.stage === name)).filter((row):row is NonNullable<typeof row>=>Boolean(row));
  const maxRuns = Math.max(1,...orderedStages.map(stage=>stage.runs));

  return <div className="space-y-4">
    <div className="ops-kpi-grid grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
      <Kpi label="Deliveries · 24h" value={metrics.events24h.toLocaleString("en-US")} sub={`${metrics.eventsTotal.toLocaleString("en-US")} total since bootstrap`} />
      <Kpi label="Open incidents" value={String(metrics.openIncidents)} sub={`${metrics.criticalOpen} critical · ${metrics.incidentsTotal} lifetime`} tone={metrics.criticalOpen > 0 ? "critical" : "ok"} />
      <Kpi label="Replays suppressed" value={`${(metrics.dedupeRate*100).toFixed(1)}%`} sub={`${metrics.duplicatesBlocked} duplicate deliveries neutralised`} />
      <Kpi label="Pipeline p95" value={`${metrics.p95LatencyMs} ms`} sub={`${metrics.avgLatencyMs} ms mean · ${metrics.stageRuns} stage runs`} />
      <Kpi label="MTTA / MTTR" value={`${metrics.mttaMinutes}m / ${metrics.mttrMinutes}m`} sub={`${metrics.correlationRatio.toFixed(2)} signals per incident`} />
    </div>
    <div className="grid gap-4 xl:grid-cols-[1.45fr_1fr]">
      <div className="space-y-4">
        <section className="rounded-xl border border-[#e2e8f0] bg-white p-4">
          <div className="flex items-baseline justify-between gap-3"><h2 className="text-[13.5px] font-semibold">Delivery volume · last 24 hours</h2><p className="shrink-0 font-mono-sb text-[10px] text-[#94a3b8] tabular">peak {peak}/h</p></div>
          <div className="mt-4 flex h-32 items-end gap-[3px]" role="img" aria-label={`${metrics.events24h} deliveries in the last 24 hours. Violet: other deliveries; rose: critical signals; amber: replays.`}>
            {hourly.map(bucket=><div key={bucket.hour} className="group relative flex-1" title={`${bucket.hour} · ${bucket.total} deliveries`}><div className="flex w-full flex-col justify-end overflow-hidden rounded-t-[2px]" style={{height:`${Math.max(3,(bucket.total/peak)*108)}px`}}><div style={{height:`${(Math.min(bucket.critical,Math.max(0,bucket.total-bucket.duplicates))/Math.max(1,bucket.total))*100}%`,background:"var(--danger)"}} /><div className="flex-1" style={{background:"var(--brand-violet)"}} /><div style={{height:`${(bucket.duplicates/Math.max(1,bucket.total))*100}%`,background:"var(--warning)"}} /></div></div>)}
          </div>
          <div className="mt-3 flex flex-wrap gap-x-4 gap-y-2 font-mono-sb text-[9px] text-[#64748b]"><span className="flex items-center gap-1.5"><i className="h-2 w-2 rounded-sm" style={{background:"var(--brand-violet)"}} />other deliveries</span><span className="flex items-center gap-1.5"><i className="h-2 w-2 rounded-sm" style={{background:"var(--danger)"}} />critical signals</span><span className="flex items-center gap-1.5"><i className="h-2 w-2 rounded-sm" style={{background:"var(--warning)"}} />replays</span></div>
        </section>
        <section className="rounded-xl border border-[#e2e8f0] bg-white">
          <div className="flex items-center justify-between border-b border-[#e2e8f0] px-4 py-3"><h2 className="text-[13.5px] font-semibold">Active incidents</h2><Link href="/dashboard/incidents" className="text-[11px] text-[#6285b5] hover:underline">View all →</Link></div>
          <div className="overflow-x-auto ops-scroll">
            <table className="w-full min-w-[530px] text-left">
              <thead><tr className="border-b border-[#e2e8f0] text-[10px] uppercase text-[#94a3b8]"><th className="px-4 py-2 font-medium">Incident</th><th className="px-3 py-2 font-medium">Priority</th><th className="px-3 py-2 font-medium">Status</th><th className="px-4 py-2 text-right font-medium">Actions</th></tr></thead>
              <tbody>{!active.length ? <tr><td colSpan={4} className="px-4 py-8 text-center text-[13px] text-[#64748b]"><EmptyState title="No active incidents" description="The pipeline is quiet. New correlated incidents will appear here." /></td></tr> : active.map(incident=><tr key={incident.id} className="border-b border-[#f1f5f9] text-[12px] last:border-0 hover:bg-[#fafbfc]">
                <td className="px-4 py-3"><div className="flex items-center gap-2"><Link href={`/dashboard/incidents/${incident.ref}`} className="font-mono-sb text-[11px] text-[#6285b5] hover:underline">{incident.ref}</Link><span className="text-[9px] text-[#9aa7b8]">×{incident.eventCount} signals</span></div><p className="mt-1 max-w-[190px] truncate text-[11px] text-[#51627b]" title={incident.title}>{incident.title}</p><p className="mt-0.5 text-[9px] text-[#9aa7b8]">{incident.service} · {relativeTime(incident.lastSeenAt)}</p></td>
                <td className="px-3 py-3"><div className="flex items-center gap-1.5"><SeverityBadge value={incident.severity} /><LevelPill level={incident.escalationLevel} /></div></td>
                <td className="px-3 py-3"><StatusBadge value={incident.status} /></td>
                <td className="px-4 py-3"><div className="flex justify-end gap-1.5">{incident.status === "open" && <form action={incidentAction}><input type="hidden" name="ref" value={incident.ref} /><input type="hidden" name="action" value="acknowledge" /><SubmitButton pendingLabel="…" className="ops-inline-button">Ack</SubmitButton></form>}<form action={incidentAction}><input type="hidden" name="ref" value={incident.ref} /><input type="hidden" name="action" value="resolve" /><SubmitButton pendingLabel="…" className="ops-inline-button">Resolve</SubmitButton></form></div></td>
              </tr>)}</tbody>
            </table>
          </div>
        </section>
      </div>
      <div className="space-y-4">
        <section className="rounded-xl border border-[#e2e8f0] bg-white">
          <div className="flex items-center justify-between border-b border-[#e2e8f0] px-4 py-3"><h2 className="text-[13.5px] font-semibold">Recent delivery stream</h2><Link href="/dashboard/events" className="text-[11px] text-[#6285b5] hover:underline">Open →</Link></div>
          <div className="max-h-[420px] overflow-y-auto ops-scroll">{events.map(event=><div key={event.id} className="flex items-center gap-2.5 border-b border-[#f1f5f9] px-4 py-2 text-[12px] last:border-0"><span className="h-1.5 w-1.5 shrink-0 rounded-full" style={{background:event.severity === "critical" ? "var(--danger)" : event.severity === "warning" ? "var(--warning)" : "var(--brand-violet)"}} /><span className="w-[89px] shrink-0 truncate font-mono-sb text-[10px] text-[#94a3b8]">{event.sourceSlug}</span><span className="min-w-0 flex-1 truncate text-[11px] text-[#51627b]" title={`${event.eventType} · ${event.service}`}>{event.eventType} · {event.service}</span>{event.status === "duplicate" && <span className="shrink-0 rounded border border-amber-200 bg-amber-50 px-1.5 py-0.5 font-mono-sb text-[9px] text-amber-700">replay</span>}<span className="w-[46px] shrink-0 text-right text-[9px] text-[#94a3b8]">{relativeTime(event.receivedAt)}</span></div>)}</div>
        </section>
        <section className="rounded-xl border border-[#e2e8f0] bg-white p-4">
          <h2 className="text-[13.5px] font-semibold">Pipeline stage ledger</h2><p className="mt-1 text-[11px] text-[#8390a3]">Processing time and outcome, recorded for every execution.</p>
          <div className="mt-4 space-y-3">{orderedStages.map(stage=><div key={stage.stage}><div className="flex flex-wrap items-baseline justify-between gap-1 text-[10px]"><span className="font-mono-sb text-[#657991]">{stage.stage}</span><span className="text-[#94a3b8] tabular">{stage.runs} runs · {stage.avgMs}ms avg{stage.skipped > 0 ? ` · ${stage.skipped} skipped` : ""}{stage.failed > 0 ? ` · ${stage.failed} rejected` : ""}</span></div><div className="mt-1.5 h-1.5 w-full overflow-hidden rounded-full bg-[#f0f3f7]"><div className="h-full rounded-full" style={{width:`${(stage.runs/maxRuns)*100}%`,background:`linear-gradient(90deg,var(--brand-violet) 0%,var(--brand-violet) ${(1-stage.failed/Math.max(1,stage.runs))*100}%,var(--danger) ${(1-stage.failed/Math.max(1,stage.runs))*100}%,var(--danger) 100%)`}} /></div></div>)}</div>
        </section>
      </div>
    </div>
  </div>;
}
