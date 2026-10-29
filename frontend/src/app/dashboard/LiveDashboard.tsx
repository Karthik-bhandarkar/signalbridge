"use client";

import { useEffect, useState, useCallback, useTransition } from "react";
import Link from "next/link";
import {
  AlertTriangle,
  CheckCircle2,
  Radio,
  RefreshCw,
  Search,
  Shield,
  RotateCcw,
  Trash2,
} from "lucide-react";

import LiveTelemetryBeacon from "@/components/ops/LiveTelemetryBeacon";
import SimulatorStudio from "@/components/ops/SimulatorStudio";
import IncidentDetailDrawer, { IncidentDetailData } from "@/components/ops/IncidentDetailDrawer";
import OperatorLoginModal from "@/components/ops/OperatorLoginModal";
import { useAuth } from "@/lib/AuthContext";
import { apiClient } from "@/lib/api";
import { useLiveStream } from "@/lib/useLiveStream";

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

export default function LiveDashboard() {
  const { user, isOperator, openLoginModal } = useAuth();
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
  const [localModalOpen, setLocalModalOpen] = useState(false);
  const [isPending, startTransition] = useTransition();
  const [isResetting, setIsResetting] = useState(false);

  async function handleResetDemoData() {
    setIsResetting(true);
    try {
      await apiClient.simulator.reset("all");
      refreshAll();
    } catch (err) {
      console.error("Failed to reset demo data", err);
    } finally {
      setIsResetting(false);
    }
  }

  async function handleDeleteIncident(id: string) {
    setIncidents((prev) => prev.filter((i) => i.id !== id));
    if (selectedIncident?.id === id) {
      setSelectedIncident(null);
    }
    try {
      await apiClient.incidents.delete(id);
      refreshAll();
    } catch (err) {
      console.error("Failed to delete incident", err);
      refreshAll();
    }
  }

  // 1. Fetch live KPIs
  const fetchOverview = useCallback(async () => {
    try {
      const data = await apiClient.telemetry.overview(includeSimulated);
      if (data && typeof data === "object") {
        setKpis((prev) => ({ ...prev, ...(data as OverviewKPIs) }));
      }
    } catch {
      // Continue silently
    }
  }, [includeSimulated]);

  // 2. Fetch live incidents
  const fetchIncidents = useCallback(async () => {
    try {
      const data = await apiClient.incidents.list({
        limit: "40",
        include_simulated: includeSimulated ? "true" : "false",
      });
      if (Array.isArray(data)) {
        setIncidents(data as IncidentRecord[]);
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

  // Initial load and periodic polling fallback
  useEffect(() => {
    refreshAll();
  }, [refreshAll]);

  // Connect to live SSE stream via resilient hook
  const { status: streamStatus } = useLiveStream({
    url: "/api/v1/stream/",
    onIncidentUpdate: () => {
      refreshAll();
    },
    onPoll: () => {
      refreshAll();
    },
    pollIntervalMs: 3500,
  });

  // Incident Actions: Acknowledge & Resolve
  async function handleAcknowledge(id: string) {
    if (!isOperator) {
      openLoginModal();
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
      await apiClient.incidents.acknowledge(id);
      refreshAll();
    } catch {
      refreshAll();
    }
  }

  async function handleResolve(id: string, notes: string) {
    if (!isOperator) {
      openLoginModal();
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
      await apiClient.incidents.resolve(id, notes);
      refreshAll();
    } catch {
      refreshAll();
    }
  }

  // Fetch full incident details for drawer
  async function openIncidentDetail(inc: IncidentRecord) {
    try {
      const full = await apiClient.incidents.detail(inc.id);
      setSelectedIncident(full as IncidentDetailData);
    } catch {
      setSelectedIncident(inc as unknown as IncidentDetailData);
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
      {/* Dashboard Sub-Header with Telemetry Beacon & Reset Incidents Action */}
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

        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={handleResetDemoData}
            disabled={isResetting}
            className="flex items-center gap-1.5 rounded-lg border border-[#F85149]/40 bg-[#F85149]/15 px-3 py-1.5 text-xs font-semibold text-[#F85149] hover:bg-[#F85149]/25 hover:border-[#F85149]/70 transition-all cursor-pointer"
            title="Purge test incidents and reset to clean baseline"
          >
            <RotateCcw size={13} className={isResetting ? "animate-spin" : ""} />
            <span>{isResetting ? "Resetting..." : "Reset Incidents (Clean Slate)"}</span>
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
            criticalCount > 0
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
                criticalCount > 0
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
                                type="button"
                                onClick={() => handleAcknowledge(inc.id)}
                                className="rounded border border-[#D29922]/40 bg-[#D29922]/15 px-2 py-1 text-[10px] font-semibold text-[#D29922] hover:bg-[#D29922]/25 transition-colors"
                              >
                                Ack
                              </button>
                            )}
                            {inc.status !== "RESOLVED" && (
                              <button
                                type="button"
                                onClick={() => handleResolve(inc.id, "Quick resolved by operator")}
                                className="rounded border border-[#3FB950]/40 bg-[#3FB950]/15 px-2 py-1 text-[10px] font-semibold text-[#3FB950] hover:bg-[#3FB950]/25 transition-colors"
                              >
                                Resolve
                              </button>
                            )}
                            <button
                              type="button"
                              onClick={() => handleDeleteIncident(inc.id)}
                              title="Delete incident"
                              className="rounded border border-[#F85149]/30 bg-[#F85149]/10 p-1 text-[#F85149] hover:bg-[#F85149]/25 hover:border-[#F85149]/60 transition-colors"
                            >
                              <Trash2 size={11} />
                            </button>
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
            isOperator={isOperator}
            onRequestAuth={openLoginModal}
          />
        </div>
      </div>

      {/* Incident Detail Drawer */}
      <IncidentDetailDrawer
        incident={selectedIncident}
        onClose={() => setSelectedIncident(null)}
        onAcknowledge={handleAcknowledge}
        onResolve={handleResolve}
        onDelete={handleDeleteIncident}
        isOperator={isOperator}
        onRequestAuth={openLoginModal}
      />


    </div>
  );
}
