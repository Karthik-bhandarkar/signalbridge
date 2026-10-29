"use client";

import { useEffect, useState, useCallback } from "react";
import Link from "next/link";
import { SeverityBadge, StatusBadge } from "@/components/ops/Badges";
import PayloadViewer from "@/components/ops/PayloadViewer";
import { Badge, EmptyState, Panel } from "@/components/ui/controls";
import { relativeTime } from "@/lib/format";
import { apiClient } from "@/lib/api";
import { RefreshCw, Filter, Layers, Inbox } from "lucide-react";

const SEVERITIES = ["all", "critical", "warning", "info"];
const STATUSES = ["all", "processed", "duplicate"];

export default function EventsClientPage() {
  const [severity, setSeverity] = useState("all");
  const [status, setStatus] = useState("all");
  const [events, setEvents] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchEvents = useCallback(async () => {
    try {
      setLoading(true);
      const data = await apiClient.telemetry.events();
      setEvents(Array.isArray(data) ? data : []);
      setError(null);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Failed to load events log.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    let mounted = true;
    apiClient.telemetry
      .events()
      .then((data) => {
        if (mounted) {
          setEvents(Array.isArray(data) ? data : []);
          setError(null);
          setLoading(false);
        }
      })
      .catch((err) => {
        if (mounted) {
          setError(err instanceof Error ? err.message : "Failed to load events log.");
          setLoading(false);
        }
      });
    return () => {
      mounted = false;
    };
  }, []);

  const filteredEvents = events.filter((ev) => {
    if (severity !== "all" && ev.severity?.toLowerCase() !== severity.toLowerCase()) {
      return false;
    }
    if (status !== "all" && ev.status?.toLowerCase() !== status.toLowerCase()) {
      return false;
    }
    return true;
  });

  return (
    <div className="space-y-4">
      {/* Filter Toolbar */}
      <Panel as="div" variant="ops" padding="sm" className="flex flex-wrap items-center gap-4">
        <div className="flex items-center gap-2">
          <span className="mr-1 font-mono-sb text-[10px] uppercase tracking-[0.14em]" style={{ color: "var(--text-muted)" }}>
            severity
          </span>
          <div className="ui-segmented flex gap-1" role="group" aria-label="Severity filter">
            {SEVERITIES.map((item) => (
              <button
                key={item}
                type="button"
                onClick={() => setSeverity(item)}
                className={`px-2.5 py-1 rounded-lg text-xs font-mono capitalize transition-all cursor-pointer ${
                  severity === item ? "bg-[#4F8CFF] text-white" : "text-[#8B949E] hover:text-[#E6EAF2]"
                }`}
              >
                {item}
              </button>
            ))}
          </div>
        </div>

        <div className="flex items-center gap-2">
          <span className="mr-1 font-mono-sb text-[10px] uppercase tracking-[0.14em]" style={{ color: "var(--text-muted)" }}>
            status
          </span>
          <div className="ui-segmented flex gap-1" role="group" aria-label="Status filter">
            {STATUSES.map((item) => (
              <button
                key={item}
                type="button"
                onClick={() => setStatus(item)}
                className={`px-2.5 py-1 rounded-lg text-xs font-mono capitalize transition-all cursor-pointer ${
                  status === item ? "bg-[#4F8CFF] text-white" : "text-[#8B949E] hover:text-[#E6EAF2]"
                }`}
              >
                {item}
              </button>
            ))}
          </div>
        </div>

        <div className="ml-auto flex items-center gap-3">
          <button
            type="button"
            onClick={fetchEvents}
            disabled={loading}
            className="flex items-center gap-1.5 text-xs text-[#8B949E] hover:text-[#E6EAF2] transition-colors p-1 rounded cursor-pointer"
            title="Refresh events log"
          >
            <RefreshCw size={13} className={loading ? "animate-spin" : ""} />
            <span>Refresh</span>
          </button>
          <span className="font-mono-sb text-[11px]" style={{ color: "var(--text-muted)" }}>
            showing {filteredEvents.length} deliveries
          </span>
        </div>
      </Panel>

      {/* Events Table */}
      <Panel as="div" variant="ops" padding="none" className="overflow-hidden">
        {loading && events.length === 0 ? (
          <div className="p-8 text-center text-xs text-[#8B949E] flex items-center justify-center gap-2">
            <RefreshCw size={15} className="animate-spin text-[#4F8CFF]" />
            <span>Loading ingestion events ledger...</span>
          </div>
        ) : error ? (
          <div className="p-8 text-center text-xs text-[#F85149]">
            <p>{error}</p>
            <button
              onClick={fetchEvents}
              className="mt-3 px-3 py-1.5 rounded-lg bg-[#232C3D] hover:bg-[#2A354A] text-white transition-all cursor-pointer"
            >
              Retry
            </button>
          </div>
        ) : filteredEvents.length === 0 ? (
          <div className="p-12 text-center text-xs text-[#8B949E] space-y-2">
            <Inbox size={28} className="mx-auto text-[#8B949E]/50" />
            <p>No deliveries match these filters.</p>
            <button
              onClick={() => { setSeverity("all"); setStatus("all"); }}
              className="text-[#4F8CFF] hover:underline cursor-pointer"
            >
              Reset filters
            </button>
          </div>
        ) : (
          <div className="overflow-x-auto ops-scroll">
            <table className="w-full min-w-[1040px] text-left">
              <thead>
                <tr className="border-b border-[#232C3D] text-[10.5px] uppercase tracking-[0.12em] text-[#8B949E] bg-[#111722]/60">
                  <th className="px-4 py-2.5 font-medium">id</th>
                  <th className="px-3 py-2.5 font-medium">received</th>
                  <th className="px-3 py-2.5 font-medium">source</th>
                  <th className="px-3 py-2.5 font-medium">type</th>
                  <th className="px-3 py-2.5 font-medium">service</th>
                  <th className="px-3 py-2.5 font-medium">sev</th>
                  <th className="px-3 py-2.5 font-medium">status</th>
                  <th className="px-3 py-2.5 font-medium">sig</th>
                  <th className="px-3 py-2.5 font-medium">incident</th>
                  <th className="px-3 py-2.5 font-medium">archive</th>
                  <th className="px-3 py-2.5 font-medium">ms</th>
                  <th className="px-4 py-2.5 font-medium">raw</th>
                </tr>
              </thead>
              <tbody>
                {filteredEvents.map((event) => (
                  <tr
                    key={event.id}
                    className="border-b border-[#232C3D]/60 align-top text-[12px] last:border-0 hover:bg-[#161D2B]/50 transition-colors"
                  >
                    <td className="px-4 py-2.5 font-mono text-[11.5px] text-[#8B949E]">
                      #{event.id}
                    </td>
                    <td className="px-3 py-2.5 font-mono text-[11.5px] text-[#E6EAF2]">
                      {event.received_at ? relativeTime(new Date(event.received_at)) : "just now"}
                    </td>
                    <td className="px-3 py-2.5 font-mono text-[11.5px] text-[#4F8CFF]">
                      {event.source}
                    </td>
                    <td className="px-3 py-2.5 font-mono text-[11px] text-[#8B949E]">
                      {event.type || "alert.trigger"}
                    </td>
                    <td className="px-3 py-2.5 font-medium text-[#E6EAF2]">
                      {event.service}
                    </td>
                    <td className="px-3 py-2.5">
                      <SeverityBadge value={event.severity} />
                    </td>
                    <td className="px-3 py-2.5">
                      <StatusBadge value={event.status} />
                    </td>
                    <td className="px-3 py-2.5">
                      <span className="font-mono text-[10px] px-1.5 py-0.5 rounded bg-[#3FB950]/15 text-[#3FB950] border border-[#3FB950]/30 font-bold">
                        VALID
                      </span>
                    </td>
                    <td className="px-3 py-2.5 font-mono text-[11px]">
                      {event.incident_fingerprint ? (
                        <span className="text-[#4F8CFF] truncate max-w-[140px] inline-block" title={event.incident_fingerprint}>
                          {event.incident_fingerprint}
                        </span>
                      ) : (
                        <span className="text-[#8B949E]">—</span>
                      )}
                    </td>
                    <td className="px-3 py-2.5 font-mono text-[11px]">
                      <span className="text-[#3FB950]">
                        {event.archive_status || "ARCHIVED"}
                      </span>
                    </td>
                    <td className="px-3 py-2.5 font-mono text-[11px] text-[#8B949E]">
                      {event.processing_ms}ms
                    </td>
                    <td className="px-4 py-2.5">
                      {event.raw_payload ? (
                        <PayloadViewer payload={event.raw_payload} label="inspect" />
                      ) : (
                        <span className="text-[#8B949E] font-mono text-[10px]">sanitized</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Panel>
    </div>
  );
}
