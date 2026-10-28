import Link from "next/link";
import { notFound } from "next/navigation";
import { asc, desc, eq } from "drizzle-orm";
import { db } from "@/db";
import { incidentTimeline, incidents, taskRuns, webhookEvents } from "@/db/schema";
import { LevelPill, SeverityBadge, StatusBadge } from "@/components/ops/Badges";
import PayloadViewer from "@/components/ops/PayloadViewer";
import { Button, Panel } from "@/components/ui/controls";
import { incidentAction } from "@/lib/actions";
import { bytes, clock, duration, relativeTime } from "@/lib/format";

export const dynamic = "force-dynamic";

const KIND_TONE: Record<string, string> = {
  opened: "bg-sky-500",
  correlated: "bg-slate-400",
  escalated: "bg-rose-500",
  acknowledged: "bg-amber-500",
  resolved: "bg-emerald-500",
  note: "bg-slate-300",
};

export default async function IncidentDetailPage({
  params,
}: {
  params: Promise<{ ref: string }>;
}) {
  const { ref } = await params;
  const [incident] = await db.select().from(incidents).where(eq(incidents.ref, ref)).limit(1);
  if (!incident) notFound();

  const [timeline, events] = await Promise.all([
    db
      .select()
      .from(incidentTimeline)
      .where(eq(incidentTimeline.incidentId, incident.id))
      .orderBy(asc(incidentTimeline.createdAt)),
    db
      .select()
      .from(webhookEvents)
      .where(eq(webhookEvents.incidentId, incident.id))
      .orderBy(desc(webhookEvents.receivedAt))
      .limit(25),
  ]);

  const latestEventId = events[0]?.id;
  const stageRuns = latestEventId
    ? await db
        .select()
        .from(taskRuns)
        .where(eq(taskRuns.eventId, latestEventId))
        .orderBy(asc(taskRuns.id))
    : [];

  const archivedBytes = events.reduce((sum, event) => sum + event.archiveBytes, 0);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-4 rounded-xl border border-[#e2e8f0] bg-white p-4">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <Link
              href="/dashboard/incidents"
              className="font-mono-sb text-[11px] text-[#94a3b8] hover:text-[#0284c7]"
            >
              incidents /
            </Link>
            <span className="font-mono-sb text-[13px] font-semibold text-[#0f172a]">
              {incident.ref}
            </span>
            <SeverityBadge value={incident.severity} />
            <StatusBadge value={incident.status} />
            <LevelPill level={incident.escalationLevel} />
          </div>
          <h2 className="font-display mt-2 max-w-2xl text-[1.3rem] font-semibold leading-snug">
            {incident.title}
          </h2>
          <p className="mt-1.5 font-mono-sb text-[11.5px] text-[#64748b]">
            service {incident.service} · fingerprint {incident.fingerprint} · {incident.eventCount}{" "}
            correlated signals
          </p>
        </div>

        <div className="flex flex-wrap gap-2">
          {incident.status === "open" ? (
            <form action={incidentAction}>
              <input type="hidden" name="ref" value={incident.ref} />
              <input type="hidden" name="action" value="acknowledge" />
              <button className="rounded-lg bg-[#0284c7] px-3 py-2 text-[12.5px] font-medium text-white transition-colors hover:bg-[#0369a1]">
                Acknowledge
              </button>
            </form>
          ) : null}
          {incident.status !== "resolved" ? (
            <>
              <form action={incidentAction}>
                <input type="hidden" name="ref" value={incident.ref} />
                <input type="hidden" name="action" value="escalate" />
                <button className="rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-[12.5px] font-medium text-rose-700 transition-colors hover:bg-rose-100">
                  Escalate
                </button>
              </form>
              <form action={incidentAction}>
                <input type="hidden" name="ref" value={incident.ref} />
                <input type="hidden" name="action" value="resolve" />
                <button className="rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-[12.5px] font-medium text-emerald-700 transition-colors hover:bg-emerald-100">
                  Resolve
                </button>
              </form>
            </>
          ) : (
            <form action={incidentAction}>
              <input type="hidden" name="ref" value={incident.ref} />
              <input type="hidden" name="action" value="reopen" />
              <button className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-[12.5px] font-medium text-amber-700 transition-colors hover:bg-amber-100">
                Reopen
              </button>
            </form>
          )}
        </div>
      </div>

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
        {[
          { label: "first seen", value: clock(incident.firstSeenAt), sub: relativeTime(incident.firstSeenAt) },
          { label: "last signal", value: clock(incident.lastSeenAt), sub: relativeTime(incident.lastSeenAt) },
          {
            label: "time to ack",
            value: duration(incident.firstSeenAt, incident.acknowledgedAt),
            sub: incident.assignee ? `owner ${incident.assignee}` : "unassigned",
          },
          {
            label: "time to resolve",
            value: duration(incident.firstSeenAt, incident.resolvedAt),
            sub: incident.resolvedAt ? clock(incident.resolvedAt) : "still active",
          },
          { label: "payload archived", value: bytes(archivedBytes), sub: `${events.length} events linked` },
        ].map((item) => (
          <div key={item.label} className="rounded-xl border border-[#e2e8f0] bg-white p-3.5">
            <p className="font-mono-sb text-[10px] uppercase tracking-[0.14em] text-[#94a3b8]">
              {item.label}
            </p>
            <p className="mt-1.5 font-mono-sb text-[12px] text-[#0f172a]">{item.value}</p>
            <p className="mt-1 text-[11.5px] text-[#64748b]">{item.sub}</p>
          </div>
        ))}
      </div>

      <div className="grid gap-4 xl:grid-cols-[1fr_1.25fr]">
        {/* Timeline */}
        <section className="rounded-xl border border-[#e2e8f0] bg-white">
          <div className="border-b border-[#e2e8f0] px-4 py-3">
            <h3 className="text-[13.5px] font-semibold">Incident timeline</h3>
            <p className="mt-0.5 text-[11.5px] text-[#64748b]">
              Append-only. Pipeline and operator entries share one ordering.
            </p>
          </div>
          <div className="ops-scroll max-h-[460px] overflow-y-auto px-4 py-4">
            <ol className="relative border-l border-[#e2e8f0] pl-5">
              {timeline.map((entry) => (
                <li key={entry.id} className="relative pb-5 last:pb-0">
                  <span
                    className={`absolute -left-[23px] top-1 h-2.5 w-2.5 rounded-full ring-4 ring-white ${
                      KIND_TONE[entry.kind] ?? "bg-slate-300"
                    }`}
                  />
                  <div className="flex items-baseline justify-between gap-3">
                    <span className="font-mono-sb text-[11px] uppercase tracking-[0.1em] text-[#64748b]">
                      {entry.kind}
                    </span>
                    <span className="font-mono-sb text-[10.5px] text-[#94a3b8]">
                      {clock(entry.createdAt)}
                    </span>
                  </div>
                  <p className="mt-1 text-[12.5px] text-[#334155]">{entry.message}</p>
                  <p className="mt-0.5 font-mono-sb text-[10.5px] text-[#94a3b8]">
                    actor · {entry.actor}
                  </p>
                </li>
              ))}
            </ol>
          </div>
          <form action={incidentAction} className="border-t border-[#e2e8f0] p-3">
            <input type="hidden" name="ref" value={incident.ref} />
            <input type="hidden" name="action" value="note" />
            <div className="flex gap-2">
              <input
                name="note"
                placeholder="Add an investigation note…"
                className="flex-1 rounded-lg border border-[#e2e8f0] px-3 py-2 text-[12.5px] outline-none focus:border-[#0284c7]"
              />
              <button className="rounded-lg bg-[#0f172a] px-3 py-2 text-[12.5px] font-medium text-white hover:bg-[#1e293b]">
                Post
              </button>
            </div>
          </form>
        </section>

        <div className="space-y-4">
          {/* Correlated events */}
          <section className="rounded-xl border border-[#e2e8f0] bg-white">
            <div className="border-b border-[#e2e8f0] px-4 py-3">
              <h3 className="text-[13.5px] font-semibold">Correlated deliveries</h3>
              <p className="mt-0.5 text-[11.5px] text-[#64748b]">
                Every webhook that folded into this incident, with raw payload access.
              </p>
            </div>
            <div className="ops-scroll max-h-[320px] overflow-auto">
              <table className="w-full min-w-[640px] text-left">
                <thead>
                  <tr className="border-b border-[#e2e8f0] text-[10.5px] uppercase tracking-[0.12em] text-[#94a3b8]">
                    <th className="px-4 py-2 font-medium">id</th>
                    <th className="px-3 py-2 font-medium">source</th>
                    <th className="px-3 py-2 font-medium">status</th>
                    <th className="px-3 py-2 font-medium">received</th>
                    <th className="px-3 py-2 font-medium">ms</th>
                    <th className="px-4 py-2 font-medium">payload</th>
                  </tr>
                </thead>
                <tbody>
                  {events.map((event) => (
                    <tr key={event.id} className="border-b border-[#f1f5f9] text-[12px] last:border-0">
                      <td className="px-4 py-2 font-mono-sb text-[11.5px] text-[#64748b]">
                        #{event.id}
                      </td>
                      <td className="px-3 py-2 font-mono-sb text-[11.5px] text-[#475569]">
                        {event.sourceSlug}
                      </td>
                      <td className="px-3 py-2">
                        <StatusBadge value={event.status} />
                      </td>
                      <td className="px-3 py-2 text-[11.5px] text-[#64748b]">
                        {relativeTime(event.receivedAt)}
                      </td>
                      <td className="px-3 py-2 font-mono-sb text-[11.5px] tabular">
                        {event.processingMs}
                      </td>
                      <td className="px-4 py-2">
                        <PayloadViewer payload={event.payload} />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>

          {/* Stage ledger for latest delivery */}
          <section className="rounded-xl border border-[#e2e8f0] bg-white p-4">
            <h3 className="text-[13.5px] font-semibold">
              Stage ledger · latest delivery {latestEventId ? `#${latestEventId}` : ""}
            </h3>
            <div className="mt-3 space-y-1.5">
              {stageRuns.length === 0 ? (
                <p className="text-[12.5px] text-[#64748b]">No stage runs recorded.</p>
              ) : (
                stageRuns.map((run) => (
                  <div
                    key={run.id}
                    className="flex items-center gap-3 rounded-lg border border-[#e2e8f0] px-3 py-2"
                  >
                    <span
                      className={`rounded border px-1.5 py-0.5 font-mono-sb text-[10px] uppercase ${
                        run.status === "succeeded"
                          ? "border-emerald-200 bg-emerald-50 text-emerald-700"
                          : run.status === "skipped"
                            ? "border-amber-200 bg-amber-50 text-amber-700"
                            : "border-rose-200 bg-rose-50 text-rose-700"
                      }`}
                    >
                      {run.stage}
                    </span>
                    <span className="flex-1 truncate font-mono-sb text-[11.5px] text-[#475569]">
                      {run.detail}
                    </span>
                    <span className="font-mono-sb text-[11px] text-[#94a3b8] tabular">
                      {run.durationMs}ms
                    </span>
                  </div>
                ))
              )}
            </div>
          </section>
        </div>
      </div>
    </div>
  );
}
