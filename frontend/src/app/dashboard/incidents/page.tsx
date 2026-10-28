import Link from "next/link";
import { LevelPill, SeverityBadge, StatusBadge } from "@/components/ops/Badges";
import { Button, EmptyState, Panel, SegmentedLink } from "@/components/ui/controls";
import { bulkAcknowledgeAction, incidentAction } from "@/lib/actions";
import { duration, relativeTime } from "@/lib/format";
import { getIncidents } from "@/lib/metrics";

export const dynamic = "force-dynamic";

const STATUS_FILTERS = ["active", "open", "acknowledged", "resolved", "all"];
const SEVERITY_FILTERS = ["all", "critical", "warning", "info"];

export default async function IncidentsPage({
  searchParams,
}: {
  searchParams: Promise<{ status?: string; severity?: string; q?: string }>;
}) {
  const params = await searchParams;
  const q = params.q?.trim() ?? "";
  const status = params.status ?? (q ? "all" : "active");
  const severity = params.severity ?? "all";
  const rows = await getIncidents({ status, severity, limit: 100, search: q });

  const query = (next: { status?: string; severity?: string }) => {
    const searchParameters = new URLSearchParams({
      status: next.status ?? status,
      severity: next.severity ?? severity,
      ...(q ? { q } : {}),
    });
    return `/dashboard/incidents?${searchParameters.toString()}`;
  };

  return (
    <div className="space-y-4">
      {q && <div className="flex items-center justify-between rounded-lg border border-[#e2e8f0] bg-white px-4 py-3 text-[12px] text-[#64748b]"><span>Search results for <strong className="font-medium text-[#334155]">{q}</strong></span><Link href="/dashboard/incidents" className="text-[#0284c7] hover:underline">Clear search</Link></div>}
      <Panel as="div" variant="ops" padding="sm" className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-4">
          <div className="flex max-w-full flex-wrap items-center gap-2">
            <span className="mr-1 font-mono-sb text-[10px] uppercase tracking-[0.14em]" style={{ color: "var(--text-muted)" }}>
              status
            </span>
            <div className="ui-segmented" role="group" aria-label="Status filter">
              {STATUS_FILTERS.map((item) => (
                <SegmentedLink key={item} href={query({ status: item })} active={status === item}>
                  {item}
                </SegmentedLink>
              ))}
            </div>
          </div>
          <div className="flex max-w-full flex-wrap items-center gap-2">
            <span className="mr-1 font-mono-sb text-[10px] uppercase tracking-[0.14em]" style={{ color: "var(--text-muted)" }}>
              severity
            </span>
            <div className="ui-segmented" role="group" aria-label="Severity filter">
              {SEVERITY_FILTERS.map((item) => (
                <SegmentedLink key={item} href={query({ severity: item })} active={severity === item}>
                  {item}
                </SegmentedLink>
              ))}
            </div>
          </div>
        </div>
        <form action={bulkAcknowledgeAction}>
          <Button type="submit" variant="secondary" size="sm">
            Acknowledge all critical
          </Button>
        </form>
      </Panel>

      <Panel as="div" variant="ops" padding="none" className="overflow-hidden">
        <div className="flex items-center justify-between border-b border-[#e2e8f0] px-4 py-3">
          <h2 className="text-[13.5px] font-semibold">
            {rows.length} incident{rows.length === 1 ? "" : "s"}
          </h2>
          <span className="font-mono-sb text-[11px] text-[#94a3b8]">
            correlation window 30m · fingerprint sha256(service::event_type)
          </span>
        </div>
        <div className="overflow-x-auto ops-scroll">
          <table className="w-full min-w-[900px] text-left">
            <thead>
              <tr className="border-b border-[#e2e8f0] text-[10.5px] uppercase tracking-[0.12em] text-[#94a3b8]">
                <th className="px-4 py-2 font-medium">ref</th>
                <th className="px-3 py-2 font-medium">title</th>
                <th className="px-3 py-2 font-medium">service</th>
                <th className="px-3 py-2 font-medium">sev</th>
                <th className="px-3 py-2 font-medium">lvl</th>
                <th className="px-3 py-2 font-medium">signals</th>
                <th className="px-3 py-2 font-medium">opened</th>
                <th className="px-3 py-2 font-medium">ttr</th>
                <th className="px-3 py-2 font-medium">owner</th>
                <th className="px-3 py-2 font-medium">status</th>
                <th className="px-4 py-2 text-right font-medium">actions</th>
              </tr>
            </thead>
            <tbody>
              {rows.length === 0 ? (
                <tr>
                  <td colSpan={11} className="px-4 py-4">
                    <EmptyState title="No incidents match this filter" description="Try a different status or severity, or clear the current search." />
                  </td>
                </tr>
              ) : (
                rows.map((incident) => (
                  <tr
                    key={incident.id}
                    className="border-b border-[#f1f5f9] text-[12.5px] transition-colors last:border-0 hover:bg-[#f8fafc]"
                  >
                    <td className="px-4 py-2.5">
                      <Link
                        href={`/dashboard/incidents/${incident.ref}`}
                        className="font-mono-sb text-[12px] text-[#0284c7] hover:underline"
                      >
                        {incident.ref}
                      </Link>
                    </td>
                    <td className="max-w-[320px] px-3 py-2.5">
                      <span className="block truncate text-[#334155]">{incident.title}</span>
                    </td>
                    <td className="px-3 py-2.5 font-mono-sb text-[11.5px] text-[#475569]">
                      {incident.service}
                    </td>
                    <td className="px-3 py-2.5">
                      <SeverityBadge value={incident.severity} />
                    </td>
                    <td className="px-3 py-2.5">
                      <LevelPill level={incident.escalationLevel} />
                    </td>
                    <td className="px-3 py-2.5 font-mono-sb tabular">×{incident.eventCount}</td>
                    <td className="px-3 py-2.5 text-[12px] text-[#64748b]">
                      {relativeTime(incident.firstSeenAt)}
                    </td>
                    <td className="px-3 py-2.5 font-mono-sb text-[11.5px] text-[#64748b] tabular">
                      {duration(incident.firstSeenAt, incident.resolvedAt)}
                    </td>
                    <td className="px-3 py-2.5 font-mono-sb text-[11.5px] text-[#64748b]">
                      {incident.assignee ?? "—"}
                    </td>
                    <td className="px-3 py-2.5">
                      <StatusBadge value={incident.status} />
                    </td>
                    <td className="px-4 py-2.5">
                      <div className="flex justify-end gap-1.5">
                        {incident.status === "open" ? (
                          <form action={incidentAction}>
                            <input type="hidden" name="ref" value={incident.ref} />
                            <input type="hidden" name="action" value="acknowledge" />
                            <Button type="submit" variant="secondary" size="sm">
                              ack
                            </Button>
                          </form>
                        ) : null}
                        {incident.status === "resolved" ? (
                          <form action={incidentAction}>
                            <input type="hidden" name="ref" value={incident.ref} />
                            <input type="hidden" name="action" value="reopen" />
                            <Button type="submit" variant="warning" size="sm">
                              reopen
                            </Button>
                          </form>
                        ) : (
                          <form action={incidentAction}>
                            <input type="hidden" name="ref" value={incident.ref} />
                            <input type="hidden" name="action" value="resolve" />
                            <Button type="submit" variant="success" size="sm">
                              resolve
                            </Button>
                          </form>
                        )}
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </Panel>
    </div>
  );
}
