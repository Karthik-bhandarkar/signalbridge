import { desc, sql } from "drizzle-orm";
import { db } from "@/db";
import { sources, taskRuns, webhookEvents } from "@/db/schema";
import { simulateTrafficAction } from "@/lib/actions";
import { Badge, Button, Panel, type BadgeTone } from "@/components/ui/controls";
import { bytes, clock, relativeTime } from "@/lib/format";
import { getLandingMetrics, getStageMix } from "@/lib/metrics";

export const dynamic = "force-dynamic";

export default async function SystemPage() {
  const [metrics, stages] = await Promise.all([
    getLandingMetrics(),
    getStageMix(),
  ]);

  let sourceRows: any[] = [];
  let runs: any[] = [];
  let perSource: any[] = [];
  try {
    [sourceRows, runs, perSource] = await Promise.all([
      db.select().from(sources).orderBy(sources.id),
      db.select().from(taskRuns).orderBy(desc(taskRuns.id)).limit(18),
      db
        .select({
          slug: webhookEvents.sourceSlug,
          total: sql<number>`count(*)::int`,
          duplicates: sql<number>`count(*) filter (where ${webhookEvents.status} = 'duplicate')::int`,
          last: sql<string>`max(${webhookEvents.receivedAt})`,
          archived: sql<number>`coalesce(sum(${webhookEvents.archiveBytes}),0)::int`,
        })
        .from(webhookEvents)
        .groupBy(webhookEvents.sourceSlug),
    ]);
  } catch (err) {
    console.warn("[SystemPage] DB query error:", err);
  }

  const bySlug = new Map(perSource.map((row) => [row.slug, row]));
  const rejected = stages.find((stage) => stage.stage === "verify")?.failed ?? 0;
  const stageFailures = stages
    .filter((stage) => stage.stage !== "verify")
    .reduce((sum, stage) => sum + stage.failed, 0);

  const components = [
    {
      name: "Ingest edge",
      detail: "POST /api/v1/webhooks/:source · HMAC-SHA256 verification",
      status: "operational",
      meta: `${metrics.eventsTotal} deliveries accepted`,
    },
    {
      name: "PostgreSQL 16",
      detail: "Drizzle ORM · JSONB payloads · unique dedupe index",
      status: "operational",
      meta: `${metrics.stageRuns} stage runs persisted`,
    },
    {
      name: "Pipeline worker",
      detail: "Inline stage execution with a task ledger (Celery/Redis in reference architecture)",
      status: stageFailures > 0 ? "degraded" : "operational",
      meta: `${stageFailures} stage failures · ${metrics.stageRuns} runs`,
    },
    {
      name: "Signature enforcement",
      detail: "HMAC-SHA256 with constant-time comparison on every delivery",
      status: "operational",
      meta: `${rejected} unsigned/tampered deliveries rejected`,
    },
    {
      name: "Payload archive",
      detail: "Postgres JSONB ledger · object-store driver not configured in this build",
      status: "partial",
      meta: `${bytes(metrics.archivedBytes)} across ${metrics.archivedObjects} objects`,
    },
  ];

  return (
    <div className="space-y-4">
      <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
        {components.map((component) => {
          const tone: BadgeTone = component.status === "operational" ? "success" : component.status === "degraded" ? "warning" : "info";
          return (
            <Panel key={component.name} variant="ops" padding="md">
              <div className="flex items-center justify-between gap-3">
                <h3 className="text-[13px] font-semibold">{component.name}</h3>
                <Badge tone={tone}>{component.status}</Badge>
              </div>
              <p className="mt-2 text-[12px] leading-relaxed" style={{ color: "var(--text-secondary)" }}>{component.detail}</p>
              <p className="mt-2 font-mono-sb text-[11px]" style={{ color: "var(--text-muted)" }}>{component.meta}</p>
            </Panel>
          );
        })}
      </section>

      <div className="grid gap-4 xl:grid-cols-[1.1fr_1fr]">
        <Panel variant="ops" padding="none" className="overflow-hidden">
          <div className="flex items-center justify-between border-b border-[#e2e8f0] px-4 py-3">
            <h2 className="text-[13.5px] font-semibold">Registered sources</h2>
            <form action={simulateTrafficAction} className="flex items-center gap-2">
              <label className="sr-only" htmlFor="replay-count">Number of deliveries to replay</label>
              <input
                id="replay-count"
                name="count"
                type="number"
                min={1}
                max={40}
                defaultValue={12}
                className="ui-input"
                style={{ width: 72, minHeight: 36, padding: "7px 9px" }}
              />
              <Button type="submit" variant="secondary" size="sm">
                Replay traffic
              </Button>
            </form>
          </div>
          <div className="overflow-x-auto ops-scroll">
            <table className="w-full min-w-[640px] text-left">
              <thead>
                <tr className="border-b border-[#e2e8f0] text-[10.5px] uppercase tracking-[0.12em] text-[#94a3b8]">
                  <th className="px-4 py-2 font-medium">slug</th>
                  <th className="px-3 py-2 font-medium">provider</th>
                  <th className="px-3 py-2 font-medium">deliveries</th>
                  <th className="px-3 py-2 font-medium">replays</th>
                  <th className="px-3 py-2 font-medium">archived</th>
                  <th className="px-4 py-2 font-medium">last seen</th>
                </tr>
              </thead>
              <tbody>
                {sourceRows.map((source) => {
                  const stats = bySlug.get(source.slug);
                  return (
                    <tr key={source.id} className="border-b border-[#f1f5f9] text-[12px] last:border-0">
                      <td className="px-4 py-2.5">
                        <span className="block font-mono-sb text-[11.5px] text-[#0f172a]">
                          {source.slug}
                        </span>
                        <span className="block text-[11px] text-[#94a3b8]">{source.name}</span>
                      </td>
                      <td className="px-3 py-2.5 font-mono-sb text-[11.5px] text-[#475569]">
                        {source.provider}
                      </td>
                      <td className="px-3 py-2.5 font-mono-sb tabular">{stats?.total ?? 0}</td>
                      <td className="px-3 py-2.5 font-mono-sb tabular">{stats?.duplicates ?? 0}</td>
                      <td className="px-3 py-2.5 font-mono-sb text-[11.5px]">
                        {bytes(stats?.archived ?? 0)}
                      </td>
                      <td className="px-4 py-2.5 text-[11.5px] text-[#64748b]">
                        {stats?.last ? relativeTime(new Date(stats.last)) : "—"}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          <p className="border-t border-[#e2e8f0] px-4 py-2.5 font-mono-sb text-[10.5px] text-[#94a3b8]">
            Signing secrets are stored server-side and never rendered in the console.
          </p>
        </Panel>

        <Panel variant="ops" padding="none" className="overflow-hidden">
          <div className="border-b border-[#e2e8f0] px-4 py-3">
            <h2 className="text-[13.5px] font-semibold">Recent stage runs</h2>
            <p className="mt-0.5 text-[11.5px] text-[#64748b]">
              The worker ledger: one row per stage execution.
            </p>
          </div>
          <div className="ops-scroll max-h-[420px] overflow-y-auto">
            {runs.map((run) => (
              <div
                key={run.id}
                className="flex items-center gap-2.5 border-b border-[#f1f5f9] px-4 py-2 text-[12px] last:border-0"
              >
                <Badge
                  tone={run.status === "succeeded" ? "success" : run.status === "skipped" ? "warning" : "danger"}
                  dot={false}
                  className="w-[92px] shrink-0 justify-center font-mono-sb uppercase"
                >
                  {run.stage}
                </Badge>
                <span className="min-w-0 flex-1 truncate font-mono-sb text-[11px] text-[#475569]">
                  {run.detail}
                </span>
                <span className="shrink-0 font-mono-sb text-[10.5px] text-[#94a3b8] tabular">
                  {run.durationMs}ms
                </span>
                <span className="hidden shrink-0 font-mono-sb text-[10px] text-[#cbd5e1] lg:inline">
                  {clock(run.createdAt).slice(11)}
                </span>
              </div>
            ))}
          </div>
        </Panel>
      </div>

      <Panel variant="ops" padding="md">
        <h2 className="text-[13.5px] font-semibold">Stage performance</h2>
        <div className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6">
          {["verify", "deduplicate", "normalize", "correlate", "escalate", "archive"].map((name) => {
            const stage = stages.find((row) => row.stage === name);
            return (
              <Panel as="div" key={name} variant="inset" padding="sm">
                <p className="font-mono-sb text-[10.5px] uppercase tracking-[0.12em] text-[#94a3b8]">
                  {name}
                </p>
                <p className="font-display mt-1.5 text-[1.3rem] font-semibold tabular">
                  {stage?.avgMs ?? 0}
                  <span className="ml-1 text-[11px] font-normal text-[#94a3b8]">ms avg</span>
                </p>
                <p className="mt-1 font-mono-sb text-[10.5px] text-[#64748b]">
                  {stage?.runs ?? 0} runs
                  {stage?.skipped ? ` · ${stage.skipped} skipped` : ""}
                  {stage?.failed ? ` · ${stage.failed} rejected` : ""}
                </p>
              </Panel>
            );
          })}
        </div>
      </Panel>
    </div>
  );
}
