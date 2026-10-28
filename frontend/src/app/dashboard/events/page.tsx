import Link from "next/link";

import { db } from "@/db";
import { incidents } from "@/db/schema";
import { SeverityBadge, StatusBadge } from "@/components/ops/Badges";
import PayloadViewer from "@/components/ops/PayloadViewer";
import { Badge, EmptyState, Panel, SegmentedLink } from "@/components/ui/controls";
import { bytes, clock, relativeTime } from "@/lib/format";
import { getRecentEvents } from "@/lib/metrics";

export const dynamic = "force-dynamic";

const SEVERITIES = ["all", "critical", "warning", "info"];
const STATUSES = ["all", "processed", "duplicate"];

export default async function EventsPage({
  searchParams,
}: {
  searchParams: Promise<{ severity?: string; status?: string }>;
}) {
  const params = await searchParams;
  const severity = params.severity ?? "all";
  const status = params.status ?? "all";
  const events = await getRecentEvents(60, { severity, status });

  let incidentRows: { id: number; ref: string }[] = [];
  try {
    incidentRows = await db.select({ id: incidents.id, ref: incidents.ref }).from(incidents);
  } catch (err) {
    console.warn("[EventsPage] DB query error:", err);
  }
  const refById = new Map(incidentRows.map((row) => [row.id, row.ref]));

  const query = (next: { severity?: string; status?: string }) =>
    `/dashboard/events?${new URLSearchParams({
      severity: next.severity ?? severity,
      status: next.status ?? status,
    }).toString()}`;

  return (
    <div className="space-y-4">
      <Panel as="div" variant="ops" padding="sm" className="flex flex-wrap items-center gap-4">
        <div className="flex items-center gap-2">
          <span className="mr-1 font-mono-sb text-[10px] uppercase tracking-[0.14em]" style={{ color: "var(--text-muted)" }}>
            severity
          </span>
          <div className="ui-segmented" role="group" aria-label="Severity filter">
            {SEVERITIES.map((item) => (
              <SegmentedLink key={item} href={query({ severity: item })} active={severity === item}>
                {item}
              </SegmentedLink>
            ))}
          </div>
        </div>
        <div className="flex items-center gap-2">
          <span className="mr-1 font-mono-sb text-[10px] uppercase tracking-[0.14em]" style={{ color: "var(--text-muted)" }}>
            status
          </span>
          <div className="ui-segmented" role="group" aria-label="Status filter">
            {STATUSES.map((item) => (
              <SegmentedLink key={item} href={query({ status: item })} active={status === item}>
                {item}
              </SegmentedLink>
            ))}
          </div>
        </div>
        <span className="ml-auto font-mono-sb text-[11px]" style={{ color: "var(--text-muted)" }}>
          showing {events.length} most recent deliveries
        </span>
      </Panel>

      <Panel as="div" variant="ops" padding="none" className="overflow-hidden">
        <div className="overflow-x-auto ops-scroll">
          <table className="w-full min-w-[1040px] text-left">
            <thead>
              <tr className="border-b border-[#e2e8f0] text-[10.5px] uppercase tracking-[0.12em] text-[#94a3b8]">
                <th className="px-4 py-2 font-medium">id</th>
                <th className="px-3 py-2 font-medium">received</th>
                <th className="px-3 py-2 font-medium">source</th>
                <th className="px-3 py-2 font-medium">type</th>
                <th className="px-3 py-2 font-medium">service</th>
                <th className="px-3 py-2 font-medium">sev</th>
                <th className="px-3 py-2 font-medium">status</th>
                <th className="px-3 py-2 font-medium">sig</th>
                <th className="px-3 py-2 font-medium">incident</th>
                <th className="px-3 py-2 font-medium">archive</th>
                <th className="px-3 py-2 font-medium">ms</th>
                <th className="px-4 py-2 font-medium">raw</th>
              </tr>
            </thead>
            <tbody>
              {events.map((event) => (
                <tr
                  key={event.id}
                  className="border-b border-[#f1f5f9] align-top text-[12px] last:border-0 hover:bg-[#f8fafc]"
                >
                  <td className="px-4 py-2.5 font-mono-sb text-[11.5px] text-[#64748b]">
                    #{event.id}
                  </td>
                  <td className="px-3 py-2.5">
                    <span className="block font-mono-sb text-[11px] text-[#334155]">
                      {clock(event.receivedAt)}
                    </span>
                    <span className="block text-[11px] text-[#94a3b8]">
                      {relativeTime(event.receivedAt)}
                    </span>
                  </td>
                  <td className="px-3 py-2.5 font-mono-sb text-[11.5px] text-[#475569]">
                    {event.sourceSlug}
                  </td>
                  <td className="px-3 py-2.5 font-mono-sb text-[11.5px] text-[#334155]">
                    {event.eventType}
                  </td>
                  <td className="px-3 py-2.5 font-mono-sb text-[11.5px] text-[#475569]">
                    {event.service}
                  </td>
                  <td className="px-3 py-2.5">
                    <SeverityBadge value={event.severity} />
                  </td>
                  <td className="px-3 py-2.5">
                    <StatusBadge value={event.status} />
                  </td>
                  <td className="px-3 py-2.5">
                    <Badge tone={event.signatureValid ? "success" : "danger"} dot={false} className="font-mono-sb">
                      {event.signatureValid ? "valid" : "invalid"}
                    </Badge>
                  </td>
                  <td className="px-3 py-2.5">
                    {event.incidentId && refById.get(event.incidentId) ? (
                      <Link
                        href={`/dashboard/incidents/${refById.get(event.incidentId)}`}
                        className="font-mono-sb text-[11.5px] text-[#0284c7] hover:underline"
                      >
                        {refById.get(event.incidentId)}
                      </Link>
                    ) : (
                      <span className="text-[#94a3b8]">—</span>
                    )}
                  </td>
                  <td className="max-w-[230px] px-3 py-2.5">
                    <span
                      className="block truncate font-mono-sb text-[10.5px] text-[#64748b]"
                      title={event.archiveKey ?? ""}
                    >
                      {event.archiveKey ?? "—"}
                    </span>
                    <span className="block font-mono-sb text-[10px] text-[#94a3b8]">
                      {event.archiveBytes ? bytes(event.archiveBytes) : "not archived"}
                    </span>
                  </td>
                  <td className="px-3 py-2.5 font-mono-sb text-[11.5px] tabular">
                    {event.processingMs}
                  </td>
                  <td className="px-4 py-2.5">
                    <PayloadViewer payload={event.payload} label="json" />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {events.length === 0 && (
          <div style={{ padding: 16 }}>
            <EmptyState title="No deliveries match these filters" description="Try another severity or status to see recorded webhook deliveries." />
          </div>
        )}
      </Panel>
    </div>
  );
}
