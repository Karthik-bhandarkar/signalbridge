"use client";

import { useEffect, useState, useCallback, useTransition } from "react";
import Link from "next/link";
import {
  Activity,
  AlertTriangle,
  ArrowRight,
  CheckCircle2,
  Filter,
  Layers,
  Radio,
  RefreshCw,
  Search,
  Shield,
  Zap,
} from "lucide-react";

import LiveTelemetryBeacon from "@/components/ops/LiveTelemetryBeacon";
import SimulatorStudio from "@/components/ops/SimulatorStudio";
import IncidentDetailDrawer, { IncidentDetailData } from "@/components/ops/IncidentDetailDrawer";
import OperatorLoginModal from "@/components/ops/OperatorLoginModal";

interface OverviewKPIs {
  status: string;
  open_incidents: number;
  critical_open: number;
  acknowledged_incidents: number;
  resolved_24h: number;
  total_incidents: number;
  deliveries_24h: number;
  total_deliveries: number;
  mttr_minutes: number;
  mtta_minutes: number;
  correlation_ratio: number;
  replay_suppression_rate_pct: number;
  timestamp: string;
}

interface IncidentRecord {
  id: string;
  service_name: string;
  fingerprint: string;
  status: "OPEN" | "ACKNOWLEDGED" | "RESOLVED";
  severity: "CRITICAL" | "HIGH" | "MEDIUM" | "LOW";
  alert_count: number;
  source_slug?: string;
  is_simulated?: boolean;
  first_seen_at?: string | null;
  last_seen_at?: string | null;
  acknowledged_at?: string | null;
  resolved_at?: string | null;
  duration_seconds?: number;
}

export default function LiveDashboard({
  initialUser,
}: {
  initialUser?: { name: string; email: string; role: string } | null;
}) {
  const [user, setUser] = useState<{ username: string; role: string } | null>(
    initialUser ? { username: initialUser.name, role: initialUser.role } : null
  );
  const [kpis, setKpis] = useState<OverviewKPIs>({
    status: "operational",
    open_incidents: 0,
    critical_open: 0,
    acknowledged_incidents: 0,
    resolved_24h: 0,
    total_incidents: 0,
    deliveries_24h: 0,
    total_deliveries: 0,
    mttr_minutes: 0,
    mtta_minutes: 0,
    correlation_ratio: 1.0,
    replay_suppression_rate_pct: 0,
    timestamp: new Date().toISOString(),
  });
  const [incidents, setIncidents] = useState<IncidentRecord[]>([]);
  const [search, setSearch] = useState("");
  const [includeSimulated, setIncludeSimulated] = useState(true);
  const [selectedIncident, setSelectedIncident] = useState<IncidentDetailData | null>(null);
  const [authModalOpen, setAuthModalOpen] = useState(false);
  const [streamStatus, setStreamStatus] = useState<"live" | "polling" | "reconnecting" | "offline">("live");
  const [isPending, startTransition] = useTransition();

  // 1. Fetch live KPIs
  const fetchOverview = useCallback(async () => {
    try {
      const res = await fetch("/api/v1/public/overview/");
      if (res.ok) {
        const data = await res.json();
        setKpis(data);
      }
    } catch {
      // Continue silently
    }
  }, []);

  // 2. Fetch live incidents
  const fetchIncidents = useCallback(async () => {
    try {
      const url = `/api/v1/public/incidents/?limit=40&include_simulated=${includeSimulated}`;
      const res = await fetch(url);
      if (res.ok) {
        const data = await res.json();
        setIncidents(data);
      }
    } catch {
      // Continue silently
    }
  }, [includeSimulated]);

  // Combined refresh
  const refreshAll = useCallback(() => {
    startTransition(() => {
      fetchOverview();
      fetchIncidents();
    });
  }, [fetchOverview, fetchIncidents]);

  // Initial load and periodic polling (every 3.5 seconds)
  useEffect(() => {
    refreshAll();
    const interval = setInterval(refreshAll, 3500);
    return () => clearInterval(interval);
  }, [refreshAll]);

  // SSE Stream listener with auto-fallback
  useEffect(() => {
    let evtSource: EventSource | null = null;
    try {
      evtSource = new EventSource("/api/v1/stream/");

      evtSource.onopen = () => {
        setStreamStatus("live");
      };

      evtSource.addEventListener("incident_update", (e) => {
        try {
          const updated = JSON.parse(e.data);
          if (Array.isArray(updated) && updated.length > 0) {
            fetchIncidents();
            fetchOverview();
          }
        } catch {
          // ignore parse errors
        }
      });

      evtSource.addEventListener("ping", () => {
        setStreamStatus("live");
      });

      evtSource.onerror = () => {
        // SSE buffering or disconnect, gracefully fallback to polling
        setStreamStatus("polling");
      };
    } catch {
      // EventSource unavailable or errored synchronously
      const timer = setTimeout(() => setStreamStatus("polling"), 0);
      return () => clearTimeout(timer);
    }

    return () => {
      if (evtSource) evtSource.close();
    };
  }, [fetchIncidents, fetchOverview]);

  // Incident Actions: Acknowledge & Resolve
  async function handleAcknowledge(id: string) {
    if (!user) {
      setAuthModalOpen(true);
      return;
    }

    // Optimistic UI update
    setIncidents((prev) =>
      prev.map((inc) => (inc.id === id ? { ...inc, status: "ACKNOWLEDGED" } : inc))
    );
    if (selectedIncident && selectedIncident.id === id) {
      setSelectedIncident((prev) => (prev ? { ...prev, status: "ACKNOWLEDGED" } : null));
    }

    try {
      let csrfToken = "";
      try {
        const csrfRes = await fetch("/api/v1/auth/csrf/");
        if (csrfRes.ok) {
          const csrfData = await csrfRes.json();
          csrfToken = csrfData.csrfToken || "";
        }
      } catch {
        // continue
      }

      const headers: Record<string, string> = { "Content-Type": "application/json" };
      if (csrfToken) headers["X-CSRFToken"] = csrfToken;

      const res = await fetch(`/api/v1/incidents/${id}/acknowledge/`, {
        method: "POST",
        headers,
      });

      if (!res.ok) {
        if (res.status === 401 || res.status === 403) setAuthModalOpen(true);
        refreshAll();
      } else {
        refreshAll();
      }
    } catch {
      refreshAll();
    }
  }

  async function handleResolve(id: string, notes: string) {
    if (!user) {
      setAuthModalOpen(true);
      return;
    }

    // Optimistic UI update
    setIncidents((prev) =>
      prev.map((inc) => (inc.id === id ? { ...inc, status: "RESOLVED" } : inc))
    );
    if (selectedIncident && selectedIncident.id === id) {
      setSelectedIncident((prev) => (prev ? { ...prev, status: "RESOLVED" } : null));
    }

    try {
      let csrfToken = "";
      try {
        const csrfRes = await fetch("/api/v1/auth/csrf/");
        if (csrfRes.ok) {
          const csrfData = await csrfRes.json();
          csrfToken = csrfData.csrfToken || "";
        }
      } catch {
        // continue
      }

      const headers: Record<string, string> = { "Content-Type": "application/json" };
      if (csrfToken) headers["X-CSRFToken"] = csrfToken;

      const res = await fetch(`/api/v1/incidents/${id}/resolve/`, {
        method: "POST",
        headers,
        body: JSON.stringify({ resolution_notes: notes }),
      });

      if (!res.ok) {
        if (res.status === 401 || res.status === 403) setAuthModalOpen(true);
        refreshAll();
      } else {
        refreshAll();
      }
    } catch {
      refreshAll();
    }
  }

  // Fetch full incident details for the drawer
  async function openIncidentDetail(inc: IncidentRecord) {
    try {
      const res = await fetch(`/api/v1/public/incidents/${inc.id}/`);
      if (res.ok) {
        const full = await res.json();
        setSelectedIncident(full);
      } else {
        setSelectedIncident(inc);
      }
    } catch {
      setSelectedIncident(inc);
    }
  }

  // Filtered incidents
  const filtered = incidents.filter((inc) => {
    if (!includeSimulated && inc.is_simulated) return false;
    if (!search) return true;
    const q = search.toLowerCase();
    return (
      inc.service_name.toLowerCase().includes(q) ||
      inc.fingerprint.toLowerCase().includes(q) ||
      inc.severity.toLowerCase().includes(q)
    );
  });

  const sevColors: Record<string, { bg: string; text: string; border: string }> = {
    CRITICAL: { bg: "rgba(248, 81, 73, 0.15)", text: "#F85149", border: "rgba(248, 81, 73, 0.4)" },
    HIGH: { bg: "rgba(210, 153, 34, 0.15)", text: "#D29922", border: "rgba(210, 153, 34, 0.4)" },
    MEDIUM: { bg: "rgba(219, 109, 40, 0.15)", text: "#DB6D28", border: "rgba(219, 109, 40, 0.4)" },
    LOW: { bg: "rgba(88, 166, 255, 0.15)", text: "#58A6FF", border: "rgba(88, 166, 255, 0.4)" },
  };

  const openCount = includeSimulated
    ? kpis.open_incidents
    : incidents.filter((i) => i.status === "OPEN" && !i.is_simulated).length;
  const criticalCount = includeSimulated
    ? kpis.critical_open
    : incidents.filter((i) => i.status === "OPEN" && !i.is_simulated && i.severity === "CRITICAL").length;

  return (
    <div className="space-y-6" style={{ color: "#E6EAF2" }}>
      {/* Top Bar Header with Telemetry Beacon */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-[#232C3D] pb-5">
        <div>
          <div className="flex items-center gap-3">
            <h1 className="text-xl font-bold tracking-tight text-[#E6EAF2]">Mission Control</h1>
            <LiveTelemetryBeacon streamState={streamStatus} />
          </div>
          <p className="mt-1 text-xs text-[#8B949E]">
            Real-time webhook ingestion, correlation, and automated incident triage feed.
          </p>
        </div>

        <div className="flex items-center gap-2">
          {!user ? (
            <button
              onClick={() => setAuthModalOpen(true)}
              className="flex items-center gap-1.5 rounded-lg border border-[#4F8CFF]/40 bg-[#4F8CFF]/15 px-3 py-1.5 text-xs font-semibold text-[#58A6FF] hover:bg-[#4F8CFF]/25 transition-colors"
            >
              <Shield size={13} />
              <span>Sign In as Operator</span>
            </button>
          ) : (
            <div className="flex items-center gap-2 rounded-lg border border-[#232C3D] bg-[#111722] px-3 py-1 text-xs font-mono">
              <span className="h-1.5 w-1.5 rounded-full bg-[#3FB950]" />
              <span className="text-[#8B949E]">Operator:</span>
              <span className="font-semibold text-[#E6EAF2]">{user.username}</span>
            </div>
          )}

          <button
            onClick={refreshAll}
            disabled={isPending}
            className="flex items-center gap-1 rounded-lg border border-[#232C3D] bg-[#111722] p-1.5 text-xs text-[#8B949E] hover:text-[#E6EAF2] hover:bg-[#161D2B] transition-colors"
            title="Refresh stream data"
          >
            <RefreshCw size={14} className={isPending ? "animate-spin" : ""} />
          </button>
        </div>
      </div>

      {/* Row 1: 4 Dynamic KPI Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
        {/* Deliveries 24h */}
        <div className="rounded-2xl border border-[#232C3D] bg-[#111722] p-5 shadow-lg">
          <div className="flex items-center justify-between">
            <span className="font-mono text-[11px] uppercase tracking-wider text-[#8B949E]">
              Deliveries · 24h
            </span>
            <span className="rounded-md bg-[#4F8CFF]/10 p-1 text-[#4F8CFF]">
              <Radio size={14} />
            </span>
          </div>
          <div className="mt-3 flex items-baseline gap-2">
            <span className="font-mono text-2xl font-bold text-[#E6EAF2]">
              {kpis.deliveries_24h.toLocaleString()}
            </span>
            <span className="text-[11px] text-[#8B949E]">events</span>
          </div>
          <p className="mt-1 text-[11px] text-[#8B949E]">
            {kpis.total_deliveries.toLocaleString()} total lifetime deliveries
          </p>
        </div>

        {/* Open Incidents */}
        <div
          className={`rounded-2xl border p-5 shadow-lg ${
            kpis.critical_open > 0
              ? "border-[#F85149]/40 bg-[#111722]"
              : "border-[#232C3D] bg-[#111722]"
          }`}
        >
          <div className="flex items-center justify-between">
            <span className="font-mono text-[11px] uppercase tracking-wider text-[#8B949E]">
              Open Incidents
            </span>
            <span
              className={`rounded-md p-1 ${
                kpis.critical_open > 0
                  ? "bg-[#F85149]/15 text-[#F85149]"
                  : "bg-[#3FB950]/15 text-[#3FB950]"
              }`}
            >
              <AlertTriangle size={14} />
            </span>
          </div>
          <div className="mt-3 flex items-baseline gap-2">
            <span
              className={`font-mono text-2xl font-bold ${
                criticalCount > 0 ? "text-[#F85149]" : "text-[#E6EAF2]"
              }`}
            >
              {openCount}
            </span>
            {criticalCount > 0 && (
              <span className="rounded-full bg-[#F85149]/20 px-2 py-0.5 text-[10px] font-bold text-[#F85149]">
                {criticalCount} CRITICAL
              </span>
            )}
          </div>
          <p className="mt-1 text-[11px] text-[#8B949E]">
            {kpis.acknowledged_incidents} in progress · {kpis.resolved_24h} resolved today
          </p>
        </div>

        {/* Replay Suppression Rate */}
        <div className="rounded-2xl border border-[#232C3D] bg-[#111722] p-5 shadow-lg">
          <div className="flex items-center justify-between">
            <span className="font-mono text-[11px] uppercase tracking-wider text-[#8B949E]">
              Replays Suppressed
            </span>
            <span className="rounded-md bg-[#D29922]/10 p-1 text-[#D29922]">
              <Shield size={14} />
            </span>
          </div>
          <div className="mt-3 flex items-baseline gap-2">
            <span className="font-mono text-2xl font-bold text-[#D29922]">
              {kpis.replay_suppression_rate_pct.toFixed(1)}%
            </span>
            <span className="text-[11px] text-[#8B949E]">rate</span>
          </div>
          <p className="mt-1 text-[11px] text-[#8B949E]">
            Deduplicated before worker processing
          </p>
        </div>

        {/* MTTR */}
        <div className="rounded-2xl border border-[#232C3D] bg-[#111722] p-5 shadow-lg">
          <div className="flex items-center justify-between">
            <span className="font-mono text-[11px] uppercase tracking-wider text-[#8B949E]">
              Mean Resolution (MTTR)
            </span>
            <span className="rounded-md bg-[#3FB950]/10 p-1 text-[#3FB950]">
              <CheckCircle2 size={14} />
            </span>
          </div>
          <div className="mt-3 flex items-baseline gap-2">
            <span className="font-mono text-2xl font-bold text-[#3FB950]">
              {kpis.mttr_minutes.toFixed(1)}m
            </span>
            <span className="text-[11px] text-[#8B949E]">avg</span>
          </div>
          <p className="mt-1 text-[11px] text-[#8B949E]">
            Computed dynamically from real database timestamps
          </p>
        </div>
      </div>

      {/* Row 2: 2/3 Live Incident Feed + 1/3 Simulator Studio */}
      <div className="grid grid-cols-1 xl:grid-cols-3 gap-6">
        {/* Left 2/3: Live Incident Table */}
        <div className="xl:col-span-2 rounded-2xl border border-[#232C3D] bg-[#111722] p-5 shadow-xl flex flex-col">
          {/* Controls Bar */}
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-[#232C3D] pb-4 mb-4">
            <div className="flex items-center gap-3">
              <h3 className="font-mono text-xs font-bold uppercase tracking-wider text-[#E6EAF2]">
                Active Incident Triage Feed
              </h3>
              <span className="rounded-full bg-[#161D2B] border border-[#232C3D] px-2 py-0.5 font-mono text-[10px] text-[#8B949E]">
                {filtered.length} active
              </span>
              <Link
                href="/dashboard/incidents"
                className="hidden sm:inline-flex items-center gap-1 text-[11px] font-mono text-[#4F8CFF] hover:underline"
              >
                <span>Full Board View →</span>
              </Link>
            </div>

            <div className="flex flex-wrap items-center gap-3">
              {/* Search input */}
              <div className="relative">
                <Search size={12} className="absolute left-2.5 top-2.5 text-[#8B949E]" />
                <input
                  type="text"
                  placeholder="Filter service or fingerprint..."
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  className="rounded-lg border border-[#232C3D] bg-[#0A0E14] pl-7 pr-3 py-1.5 text-xs text-[#E6EAF2] placeholder-[#8B949E] focus:border-[#4F8CFF] focus:outline-none w-48 sm:w-56"
                />
              </div>

              {/* Show simulated toggle */}
              <label className="flex items-center gap-1.5 text-xs text-[#8B949E] cursor-pointer">
                <input
                  type="checkbox"
                  checked={includeSimulated}
                  onChange={(e) => setIncludeSimulated(e.target.checked)}
                  className="accent-[#4F8CFF] rounded"
                />
                <span>Include Simulated</span>
              </label>
            </div>
          </div>

          {/* Table Container */}
          <div className="overflow-x-auto flex-1">
            <table className="w-full text-left font-mono text-xs">
              <thead>
                <tr className="border-b border-[#232C3D] text-[10px] uppercase text-[#8B949E]">
                  <th className="py-2 px-3 font-semibold">Service & Fingerprint</th>
                  <th className="py-2 px-3 font-semibold">Severity</th>
                  <th className="py-2 px-3 font-semibold">Signals</th>
                  <th className="py-2 px-3 font-semibold">Status</th>
                  <th className="py-2 px-3 text-right font-semibold">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#232C3D]/50">
                {filtered.length === 0 ? (
                  <tr>
                    <td colSpan={5} className="py-12 text-center text-xs text-[#8B949E]">
                      <div className="flex flex-col items-center gap-2">
                        <CheckCircle2 size={24} className="text-[#3FB950]" />
                        <span>No open incidents matching filter</span>
                        <span className="text-[10px]">All upstream services operating nominally.</span>
                      </div>
                    </td>
                  </tr>
                ) : (
                  filtered.map((inc) => {
                    const sev = sevColors[inc.severity] || sevColors.MEDIUM;
                    return (
                      <tr
                        key={inc.id}
                        onClick={() => openIncidentDetail(inc)}
                        className="cursor-pointer transition-colors hover:bg-[#161D2B]/80 group"
                      >
                        {/* Service & Fingerprint */}
                        <td className="py-3 px-3">
                          <div className="flex items-center gap-2">
                            <span className="font-bold text-[#E6EAF2] group-hover:text-[#4F8CFF] transition-colors">
                              {inc.service_name}
                            </span>
                            {inc.is_simulated && (
                              <span className="rounded border border-[#8B949E]/30 bg-[#0A0E14] px-1 py-0.2 font-mono text-[9px] text-[#8B949E]">
                                SIMULATED
                              </span>
                            )}
                          </div>
                          <p className="mt-0.5 text-[10px] text-[#8B949E] truncate max-w-[220px]">
                            {inc.fingerprint}
                          </p>
                        </td>

                        {/* Severity */}
                        <td className="py-3 px-3">
                          <span
                            className="rounded px-2 py-0.5 text-[10px] font-bold border"
                            style={{
                              backgroundColor: sev.bg,
                              color: sev.text,
                              borderColor: sev.border,
                            }}
                          >
                            {inc.severity}
                          </span>
                        </td>

                        {/* Signals */}
                        <td className="py-3 px-3">
                          <span className="rounded bg-[#161D2B] px-1.5 py-0.5 font-bold text-[#4F8CFF]">
                            ×{inc.alert_count}
                          </span>
                        </td>

                        {/* Status */}
                        <td className="py-3 px-3">
                          <span
                            className={`rounded px-1.5 py-0.5 text-[10px] font-semibold ${
                              inc.status === "OPEN"
                                ? "bg-[#F85149]/20 text-[#F85149]"
                                : inc.status === "ACKNOWLEDGED"
                                ? "bg-[#D29922]/20 text-[#D29922]"
                                : "bg-[#3FB950]/20 text-[#3FB950]"
                            }`}
                          >
                            {inc.status}
                          </span>
                        </td>

                        {/* Actions */}
                        <td className="py-3 px-3 text-right" onClick={(e) => e.stopPropagation()}>
                          <div className="flex items-center justify-end gap-1.5">
                            {inc.status === "OPEN" && (
                              <button
                                onClick={() => handleAcknowledge(inc.id)}
                                className="rounded border border-[#D29922]/40 bg-[#D29922]/15 px-2 py-1 text-[10px] font-semibold text-[#D29922] hover:bg-[#D29922]/25 transition-colors"
                              >
                                Ack
                              </button>
                            )}
                            {inc.status !== "RESOLVED" && (
                              <button
                                onClick={() => handleResolve(inc.id, "Quick resolved by operator")}
                                className="rounded border border-[#3FB950]/40 bg-[#3FB950]/15 px-2 py-1 text-[10px] font-semibold text-[#3FB950] hover:bg-[#3FB950]/25 transition-colors"
                              >
                                Resolve
                              </button>
                            )}
                          </div>
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        </div>

        {/* Right 1/3: Simulator Studio */}
        <div className="xl:col-span-1">
          <SimulatorStudio
            onDispatched={refreshAll}
            isOperator={Boolean(user)}
            onRequestAuth={() => setAuthModalOpen(true)}
          />
        </div>
      </div>

      {/* Incident Detail Drawer */}
      <IncidentDetailDrawer
        incident={selectedIncident}
        onClose={() => setSelectedIncident(null)}
        onAcknowledge={handleAcknowledge}
        onResolve={handleResolve}
        isOperator={Boolean(user)}
        onRequestAuth={() => setAuthModalOpen(true)}
      />

      {/* Operator Login Modal */}
      <OperatorLoginModal
        isOpen={authModalOpen}
        onClose={() => setAuthModalOpen(false)}
        onSuccess={(u) => {
          setUser(u);
          refreshAll();
        }}
      />
    </div>
  );
}

