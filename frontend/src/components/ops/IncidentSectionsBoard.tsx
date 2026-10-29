"use client";

import { useEffect, useState, useMemo } from "react";
import {
  AlertCircle,
  AlertTriangle,
  ArrowRight,
  CheckCircle2,
  ChevronDown,
  ChevronRight,
  Clock,
  Filter,
  History,
  Kanban,
  Layers,
  List,
  Search,
  Sparkles,
  Zap,
  Trash2,
} from "lucide-react";

import { IncidentDetailData } from "./IncidentDetailDrawer";

interface IncidentSectionsBoardProps {
  incidents: IncidentDetailData[];
  onAcknowledge: (id: string) => Promise<void>;
  onResolve: (id: string, notes: string) => Promise<void>;
  onSelectIncident: (inc: IncidentDetailData) => void;
  isOperator: boolean;
  onRequestAuth: () => void;
  showSimulated: boolean;
  setShowSimulated: (val: boolean) => void;
  onDelete?: (id: string) => Promise<void> | void;
}

export default function IncidentSectionsBoard({
  incidents,
  onAcknowledge,
  onResolve,
  onSelectIncident,
  isOperator,
  onRequestAuth,
  showSimulated,
  setShowSimulated,
  onDelete,
}: IncidentSectionsBoardProps) {
  const [viewMode, setViewMode] = useState<"board" | "table">("board");
  const [search, setSearch] = useState("");
  const [severityFilter, setSeverityFilter] = useState("ALL");
  const [serviceFilter, setServiceFilter] = useState("ALL");
  const [historyOpen, setHistoryOpen] = useState(false);
  const [actionLoadingId, setActionLoadingId] = useState<string | null>(null);
  const [now, setNow] = useState(() => 1700000000000);

  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 10000);
    return () => clearInterval(timer);
  }, []);

  // Filtered incidents
  const filtered = useMemo(() => {
    return incidents.filter((inc) => {
      if (!showSimulated && inc.is_simulated) return false;
      if (severityFilter !== "ALL" && inc.severity !== severityFilter) return false;
      if (serviceFilter !== "ALL" && inc.service_name !== serviceFilter) return false;
      if (search) {
        const q = search.toLowerCase();
        return (
          inc.service_name.toLowerCase().includes(q) ||
          inc.fingerprint.toLowerCase().includes(q)
        );
      }
      return true;
    });
  }, [incidents, showSimulated, severityFilter, serviceFilter, search]);

  // Distinct services for filtering
  const services = useMemo(() => {
    const set = new Set<string>();
    incidents.forEach((inc) => {
      if (inc.service_name) set.add(inc.service_name);
    });
    return Array.from(set);
  }, [incidents]);

  // Section 1: Present / Active (OPEN)
  const presentIncidents = useMemo(() => {
    return filtered
      .filter((inc) => inc.status === "OPEN")
      .sort((a, b) => {
        const tA = a.first_seen_at ? new Date(a.first_seen_at).getTime() : 0;
        const tB = b.first_seen_at ? new Date(b.first_seen_at).getTime() : 0;
        return tB - tA; // newest first
      });
  }, [filtered]);

  // Section 2: Acknowledged / In Progress
  const acknowledgedIncidents = useMemo(() => {
    return filtered
      .filter((inc) => inc.status === "ACKNOWLEDGED")
      .sort((a, b) => {
        const tA = a.acknowledged_at ? new Date(a.acknowledged_at).getTime() : 0;
        const tB = b.acknowledged_at ? new Date(b.acknowledged_at).getTime() : 0;
        return tB - tA;
      });
  }, [filtered]);

  // Section 3: Recently Resolved (last 24 hours)
  const dayAgo = now > 0 ? now - 24 * 60 * 60 * 1000 : 0;

  const recentlyResolvedIncidents = useMemo(() => {
    return filtered.filter((inc) => {
      if (inc.status !== "RESOLVED") return false;
      const resTime = inc.resolved_at ? new Date(inc.resolved_at).getTime() : 0;
      return resTime >= dayAgo;
    });
  }, [filtered, dayAgo]);

  // Section 4: History (older than 24h)
  const historyIncidents = useMemo(() => {
    return filtered.filter((inc) => {
      if (inc.status !== "RESOLVED") return false;
      const resTime = inc.resolved_at ? new Date(inc.resolved_at).getTime() : 0;
      return resTime < dayAgo;
    });
  }, [filtered, dayAgo]);

  async function handleAck(e: React.MouseEvent, id: string) {
    e.stopPropagation();
    if (!isOperator) {
      onRequestAuth();
      return;
    }
    setActionLoadingId(id);
    try {
      await onAcknowledge(id);
    } finally {
      setActionLoadingId(null);
    }
  }

  async function handleRes(e: React.MouseEvent, id: string) {
    e.stopPropagation();
    if (!isOperator) {
      onRequestAuth();
      return;
    }
    setActionLoadingId(id);
    try {
      await onResolve(id, "Resolved via Incidents Board");
    } finally {
      setActionLoadingId(null);
    }
  }

  const sevBadges: Record<string, { bg: string; text: string; border: string }> = {
    CRITICAL: { bg: "rgba(248, 81, 73, 0.15)", text: "#F85149", border: "rgba(248, 81, 73, 0.4)" },
    HIGH: { bg: "rgba(210, 153, 34, 0.15)", text: "#D29922", border: "rgba(210, 153, 34, 0.4)" },
    MEDIUM: { bg: "rgba(219, 109, 40, 0.15)", text: "#DB6D28", border: "rgba(219, 109, 40, 0.4)" },
    LOW: { bg: "rgba(88, 166, 255, 0.15)", text: "#58A6FF", border: "rgba(88, 166, 255, 0.4)" },
  };

  function getRelativeAge(isoString?: string | null) {
    if (!isoString) return "just now";
    if (!now) return "recently";
    const delta = Math.max(0, Math.floor((now - new Date(isoString).getTime()) / 1000));
    if (delta < 60) return `${delta}s ago`;
    if (delta < 3600) return `${Math.floor(delta / 60)}m ago`;
    if (delta < 86400) return `${Math.floor(delta / 3600)}h ago`;
    return `${Math.floor(delta / 86400)}d ago`;
  }

  return (
    <div className="space-y-5" style={{ color: "#E6EAF2" }}>
      {/* Controls & Filter Bar */}
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 rounded-2xl border border-[#232C3D] bg-[#111722] p-4 shadow-lg">
        {/* Search & Filters */}
        <div className="flex flex-wrap items-center gap-3">
          {/* Search Input */}
          <div className="relative">
            <Search size={13} className="absolute left-3 top-2.5 text-[#8B949E]" />
            <input
              type="text"
              placeholder="Filter by service or title..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="rounded-xl border border-[#232C3D] bg-[#0A0E14] pl-8 pr-3 py-1.5 text-xs text-[#E6EAF2] placeholder-[#8B949E] focus:border-[#4F8CFF] focus:outline-none w-52 sm:w-64"
            />
          </div>

          {/* Severity Select */}
          <select
            value={severityFilter}
            onChange={(e) => setSeverityFilter(e.target.value)}
            className="rounded-xl border border-[#232C3D] bg-[#0A0E14] px-2.5 py-1.5 text-xs text-[#E6EAF2] focus:border-[#4F8CFF] focus:outline-none font-mono"
          >
            <option value="ALL">All Severities</option>
            <option value="CRITICAL">P1 · Critical</option>
            <option value="HIGH">P2 · High</option>
            <option value="MEDIUM">P3 · Medium</option>
            <option value="LOW">P4 · Low</option>
          </select>

          {/* Service Select */}
          <select
            value={serviceFilter}
            onChange={(e) => setServiceFilter(e.target.value)}
            className="rounded-xl border border-[#232C3D] bg-[#0A0E14] px-2.5 py-1.5 text-xs text-[#E6EAF2] focus:border-[#4F8CFF] focus:outline-none font-mono"
          >
            <option value="ALL">All Services</option>
            {services.map((svc) => (
              <option key={svc} value={svc}>
                {svc}
              </option>
            ))}
          </select>
        </div>

        {/* View Switcher & Simulated Toggle */}
        <div className="flex items-center gap-3">
          {/* Simulated Toggle */}
          <label className="flex items-center gap-1.5 rounded-xl border border-[#232C3D] bg-[#0A0E14] px-3 py-1.5 text-xs text-[#8B949E] cursor-pointer hover:border-[#4F8CFF]/50 transition-colors">
            <input
              type="checkbox"
              checked={showSimulated}
              onChange={(e) => setShowSimulated(e.target.checked)}
              className="accent-[#A974FF] rounded"
            />
            <span className="flex items-center gap-1 text-[#E6EAF2]">
              <span className="h-1.5 w-1.5 rounded-full bg-[#A974FF]" />
              <span>Show simulated</span>
            </span>
          </label>

          {/* Board / Table Switcher */}
          <div className="flex items-center rounded-xl border border-[#232C3D] bg-[#0A0E14] p-1 font-mono text-xs">
            <button
              onClick={() => setViewMode("board")}
              className={`flex items-center gap-1.5 rounded-lg px-2.5 py-1 transition-all ${
                viewMode === "board"
                  ? "bg-[#4F8CFF] text-white font-bold shadow-sm"
                  : "text-[#8B949E] hover:text-[#E6EAF2]"
              }`}
            >
              <Kanban size={13} />
              <span>Board</span>
            </button>
            <button
              onClick={() => setViewMode("table")}
              className={`flex items-center gap-1.5 rounded-lg px-2.5 py-1 transition-all ${
                viewMode === "table"
                  ? "bg-[#4F8CFF] text-white font-bold shadow-sm"
                  : "text-[#8B949E] hover:text-[#E6EAF2]"
              }`}
            >
              <List size={13} />
              <span>Table</span>
            </button>
          </div>
        </div>
      </div>

      {/* Board View Mode */}
      {viewMode === "board" ? (
        <div className="space-y-6">
          {/* Top 3 Live Board Columns */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
            {/* 1. PRESENT / ACTIVE (Red Accent) */}
            <div className="flex flex-col rounded-2xl border border-[#F85149]/30 bg-[#111722] shadow-xl overflow-hidden">
              <div className="flex items-center justify-between border-b border-[#F85149]/30 bg-[#F85149]/10 px-4 py-3">
                <div className="flex items-center gap-2">
                  <span className="h-2 w-2 rounded-full bg-[#F85149] animate-ping" />
                  <h3 className="font-mono text-xs font-bold uppercase tracking-wider text-[#F85149]">
                    Present / Active
                  </h3>
                </div>
                <span className="rounded-full bg-[#F85149]/20 border border-[#F85149]/40 px-2 py-0.5 font-mono text-[10px] font-bold text-[#F85149]">
                  {presentIncidents.length}
                </span>
              </div>

              <div className="flex-1 p-3 space-y-3 overflow-y-auto max-h-[620px]">
                {presentIncidents.length === 0 ? (
                  <div className="py-12 text-center text-xs text-[#8B949E]">
                    <CheckCircle2 size={24} className="mx-auto text-[#3FB950] mb-2" />
                    <span>No active open incidents.</span>
                  </div>
                ) : (
                  presentIncidents.map((inc) => {
                    const sev = sevBadges[inc.severity] || sevBadges.MEDIUM;
                    return (
                      <div
                        key={inc.id}
                        onClick={() => onSelectIncident(inc)}
                        className="cursor-pointer rounded-xl border border-[#232C3D] bg-[#0A0E14] p-3.5 shadow hover:border-[#F85149]/60 transition-all group space-y-2.5"
                      >
                        <div className="flex items-start justify-between gap-2">
                          <span className="font-mono text-xs font-bold text-[#E6EAF2] group-hover:text-[#4F8CFF] transition-colors">
                            {inc.service_name}
                          </span>
                          <div className="flex items-center gap-1.5">
                            {inc.is_simulated && (
                              <span className="rounded bg-[#A974FF]/20 border border-[#A974FF]/40 px-1.5 py-0.2 font-mono text-[9px] font-bold text-[#A974FF]">
                                SIMULATED
                              </span>
                            )}
                            <span
                              className="rounded px-1.5 py-0.5 text-[9px] font-bold border"
                              style={{
                                backgroundColor: sev.bg,
                                color: sev.text,
                                borderColor: sev.border,
                              }}
                            >
                              {inc.severity}
                            </span>
                          </div>
                        </div>

                        <p className="font-mono text-[11px] text-[#8B949E] line-clamp-2">
                          {inc.fingerprint}
                        </p>

                        <div className="flex items-center justify-between pt-2 border-t border-[#232C3D] text-[10px] font-mono">
                          <span className="text-[#8B949E] flex items-center gap-1">
                            <Clock size={11} />
                            <span>{getRelativeAge(inc.first_seen_at)}</span>
                          </span>

                          <span className="rounded bg-[#161D2B] px-1.5 py-0.5 text-[#4F8CFF] font-bold">
                            ×{inc.alert_count} signals
                          </span>
                        </div>

                        <div className="flex items-center gap-1.5">
                          <button
                            type="button"
                            onClick={(e) => handleAck(e, inc.id)}
                            disabled={actionLoadingId === inc.id}
                            className="flex-1 flex items-center justify-center gap-1.5 rounded-lg border border-[#D29922]/40 bg-[#D29922]/15 py-1.5 text-xs font-semibold text-[#D29922] hover:bg-[#D29922]/25 transition-all shadow-sm"
                          >
                            <span>Acknowledge</span>
                            <ArrowRight size={12} />
                          </button>
                          {onDelete && (
                            <button
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation();
                                onDelete(inc.id);
                              }}
                              title="Delete incident"
                              className="rounded-lg border border-[#F85149]/30 bg-[#F85149]/10 p-1.5 text-[#F85149] hover:bg-[#F85149]/25 hover:border-[#F85149]/60 transition-colors"
                            >
                              <Trash2 size={13} />
                            </button>
                          )}
                        </div>
                      </div>
                    );
                  })
                )}
              </div>
            </div>

            {/* 2. ACKNOWLEDGED / IN PROGRESS (Amber Accent) */}
            <div className="flex flex-col rounded-2xl border border-[#D29922]/30 bg-[#111722] shadow-xl overflow-hidden">
              <div className="flex items-center justify-between border-b border-[#D29922]/30 bg-[#D29922]/10 px-4 py-3">
                <div className="flex items-center gap-2">
                  <span className="h-2 w-2 rounded-full bg-[#D29922]" />
                  <h3 className="font-mono text-xs font-bold uppercase tracking-wider text-[#D29922]">
                    Acknowledged / In Progress
                  </h3>
                </div>
                <span className="rounded-full bg-[#D29922]/20 border border-[#D29922]/40 px-2 py-0.5 font-mono text-[10px] font-bold text-[#D29922]">
                  {acknowledgedIncidents.length}
                </span>
              </div>

              <div className="flex-1 p-3 space-y-3 overflow-y-auto max-h-[620px]">
                {acknowledgedIncidents.length === 0 ? (
                  <div className="py-12 text-center text-xs text-[#8B949E]">
                    <span>No incidents currently in progress.</span>
                  </div>
                ) : (
                  acknowledgedIncidents.map((inc) => {
                    const sev = sevBadges[inc.severity] || sevBadges.MEDIUM;
                    return (
                      <div
                        key={inc.id}
                        onClick={() => onSelectIncident(inc)}
                        className="cursor-pointer rounded-xl border border-[#232C3D] bg-[#0A0E14] p-3.5 shadow hover:border-[#D29922]/60 transition-all group space-y-2.5"
                      >
                        <div className="flex items-start justify-between gap-2">
                          <span className="font-mono text-xs font-bold text-[#E6EAF2] group-hover:text-[#4F8CFF] transition-colors">
                            {inc.service_name}
                          </span>
                          <div className="flex items-center gap-1.5">
                            {inc.is_simulated && (
                              <span className="rounded bg-[#A974FF]/20 border border-[#A974FF]/40 px-1.5 py-0.2 font-mono text-[9px] font-bold text-[#A974FF]">
                                SIMULATED
                              </span>
                            )}
                            <span
                              className="rounded px-1.5 py-0.5 text-[9px] font-bold border"
                              style={{
                                backgroundColor: sev.bg,
                                color: sev.text,
                                borderColor: sev.border,
                              }}
                            >
                              {inc.severity}
                            </span>
                          </div>
                        </div>

                        <p className="font-mono text-[11px] text-[#8B949E] line-clamp-2">
                          {inc.fingerprint}
                        </p>

                        <div className="flex items-center justify-between pt-2 border-t border-[#232C3D] text-[10px] font-mono text-[#8B949E]">
                          <span>Ack: {getRelativeAge(inc.acknowledged_at)}</span>
                          <span className="rounded bg-[#161D2B] px-1.5 py-0.5 text-[#4F8CFF] font-bold">
                            ×{inc.alert_count} signals
                          </span>
                        </div>

                        <div className="flex items-center gap-1.5">
                          <button
                            type="button"
                            onClick={(e) => handleRes(e, inc.id)}
                            disabled={actionLoadingId === inc.id}
                            className="flex-1 flex items-center justify-center gap-1.5 rounded-lg border border-[#3FB950]/40 bg-[#3FB950]/15 py-1.5 text-xs font-semibold text-[#3FB950] hover:bg-[#3FB950]/25 transition-all shadow-sm"
                          >
                            <CheckCircle2 size={13} />
                            <span>Resolve Incident</span>
                          </button>
                          {onDelete && (
                            <button
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation();
                                onDelete(inc.id);
                              }}
                              title="Delete incident"
                              className="rounded-lg border border-[#F85149]/30 bg-[#F85149]/10 p-1.5 text-[#F85149] hover:bg-[#F85149]/25 hover:border-[#F85149]/60 transition-colors"
                            >
                              <Trash2 size={13} />
                            </button>
                          )}
                        </div>
                      </div>
                    );
                  })
                )}
              </div>
            </div>

            {/* 3. RECENTLY RESOLVED (last 24h, Green Accent) */}
            <div className="flex flex-col rounded-2xl border border-[#3FB950]/30 bg-[#111722] shadow-xl overflow-hidden">
              <div className="flex items-center justify-between border-b border-[#3FB950]/30 bg-[#3FB950]/10 px-4 py-3">
                <div className="flex items-center gap-2">
                  <span className="h-2 w-2 rounded-full bg-[#3FB950]" />
                  <h3 className="font-mono text-xs font-bold uppercase tracking-wider text-[#3FB950]">
                    Recently Resolved (24h)
                  </h3>
                </div>
                <span className="rounded-full bg-[#3FB950]/20 border border-[#3FB950]/40 px-2 py-0.5 font-mono text-[10px] font-bold text-[#3FB950]">
                  {recentlyResolvedIncidents.length}
                </span>
              </div>

              <div className="flex-1 p-3 space-y-3 overflow-y-auto max-h-[620px]">
                {recentlyResolvedIncidents.length === 0 ? (
                  <div className="py-12 text-center text-xs text-[#8B949E]">
                    <span>No incidents resolved in the last 24 hours.</span>
                  </div>
                ) : (
                  recentlyResolvedIncidents.map((inc) => {
                    const dur = inc.duration_seconds
                      ? `${Math.round(inc.duration_seconds / 60)}m duration`
                      : "resolved";
                    return (
                      <div
                        key={inc.id}
                        onClick={() => onSelectIncident(inc)}
                        className="cursor-pointer rounded-xl border border-[#232C3D] bg-[#0A0E14] p-3.5 shadow hover:border-[#3FB950]/50 transition-all group space-y-2 opacity-90"
                      >
                        <div className="flex items-start justify-between gap-2">
                          <span className="font-mono text-xs font-bold text-[#E6EAF2] group-hover:text-[#4F8CFF] transition-colors">
                            {inc.service_name}
                          </span>
                          <span className="rounded-full bg-[#3FB950]/15 border border-[#3FB950]/30 px-2 py-0.5 font-mono text-[9px] font-semibold text-[#3FB950]">
                            RESOLVED
                          </span>
                        </div>

                        <p className="font-mono text-[11px] text-[#8B949E] line-clamp-2">
                          {inc.fingerprint}
                        </p>

                        <div className="flex items-center justify-between pt-2 border-t border-[#232C3D] text-[10px] font-mono text-[#8B949E]">
                          <span className="text-[#3FB950] font-semibold">{dur}</span>
                          <span>{getRelativeAge(inc.resolved_at)}</span>
                        </div>
                      </div>
                    );
                  })
                )}
              </div>
            </div>
          </div>

          {/* 4. HISTORY (older than 24h) Collapsible Section */}
          <div className="rounded-2xl border border-[#232C3D] bg-[#111722] shadow-xl overflow-hidden">
            <button
              onClick={() => setHistoryOpen(!historyOpen)}
              className="w-full flex items-center justify-between p-4 hover:bg-[#161D2B] transition-colors text-left"
            >
              <div className="flex items-center gap-2.5">
                <History size={16} className="text-[#8B949E]" />
                <h3 className="font-mono text-xs font-bold uppercase tracking-wider text-[#E6EAF2]">
                  Historical Archive (Older than 24 Hours)
                </h3>
                <span className="rounded-full bg-[#161D2B] border border-[#232C3D] px-2 py-0.5 font-mono text-[10px] text-[#8B949E]">
                  {historyIncidents.length} records
                </span>
              </div>
              {historyOpen ? <ChevronDown size={16} /> : <ChevronRight size={16} />}
            </button>

            {historyOpen && (
              <div className="border-t border-[#232C3D] p-4">
                {historyIncidents.length === 0 ? (
                  <p className="text-center text-xs text-[#8B949E] py-6">
                    No historical incidents older than 24 hours.
                  </p>
                ) : (
                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
                    {historyIncidents.slice(0, 12).map((inc) => (
                      <div
                        key={inc.id}
                        onClick={() => onSelectIncident(inc)}
                        className="cursor-pointer rounded-xl border border-[#232C3D] bg-[#0A0E14] p-3 text-xs font-mono hover:border-[#4F8CFF]/40 transition-all space-y-1"
                      >
                        <div className="flex items-center justify-between">
                          <span className="font-bold text-[#E6EAF2]">{inc.service_name}</span>
                          <span className="text-[10px] text-[#8B949E]">{getRelativeAge(inc.resolved_at)}</span>
                        </div>
                        <p className="text-[10px] text-[#8B949E] truncate">{inc.fingerprint}</p>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      ) : (
        /* Table View Mode */
        <div className="rounded-2xl border border-[#232C3D] bg-[#111722] p-4 shadow-xl overflow-x-auto">
          <table className="w-full text-left font-mono text-xs">
            <thead>
              <tr className="border-b border-[#232C3D] text-[10px] uppercase text-[#8B949E]">
                <th className="py-2.5 px-3">Service & Fingerprint</th>
                <th className="py-2.5 px-3">Severity</th>
                <th className="py-2.5 px-3">Status</th>
                <th className="py-2.5 px-3">Signals</th>
                <th className="py-2.5 px-3">Age</th>
                <th className="py-2.5 px-3 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#232C3D]/50">
              {filtered.map((inc) => {
                const sev = sevBadges[inc.severity] || sevBadges.MEDIUM;
                return (
                  <tr
                    key={inc.id}
                    onClick={() => onSelectIncident(inc)}
                    className="cursor-pointer hover:bg-[#161D2B]/80 transition-colors"
                  >
                    <td className="py-3 px-3">
                      <div className="flex items-center gap-2">
                        <span className="font-bold text-[#E6EAF2]">{inc.service_name}</span>
                        {inc.is_simulated && (
                          <span className="rounded bg-[#A974FF]/20 border border-[#A974FF]/40 px-1 py-0.2 text-[9px] text-[#A974FF]">
                            SIMULATED
                          </span>
                        )}
                      </div>
                      <p className="text-[10px] text-[#8B949E] truncate max-w-[240px]">{inc.fingerprint}</p>
                    </td>

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

                    <td className="py-3 px-3 text-[#4F8CFF] font-bold">×{inc.alert_count}</td>
                    <td className="py-3 px-3 text-[#8B949E] text-[10px]">{getRelativeAge(inc.first_seen_at)}</td>

                    <td className="py-3 px-3 text-right" onClick={(e) => e.stopPropagation()}>
                      <div className="flex items-center justify-end gap-1.5">
                        {inc.status === "OPEN" && (
                          <button
                            onClick={(e) => handleAck(e, inc.id)}
                            className="rounded border border-[#D29922]/40 bg-[#D29922]/15 px-2 py-1 text-[10px] font-semibold text-[#D29922] hover:bg-[#D29922]/25 transition-colors"
                          >
                            Ack
                          </button>
                        )}
                        {inc.status !== "RESOLVED" && (
                          <button
                            type="button"
                            onClick={(e) => handleRes(e, inc.id)}
                            className="rounded border border-[#3FB950]/40 bg-[#3FB950]/15 px-2 py-1 text-[10px] font-semibold text-[#3FB950] hover:bg-[#3FB950]/25 transition-colors"
                          >
                            Resolve
                          </button>
                        )}
                        {onDelete && (
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              onDelete(inc.id);
                            }}
                            title="Delete incident"
                            className="rounded border border-[#F85149]/30 bg-[#F85149]/10 p-1 text-[#F85149] hover:bg-[#F85149]/25 hover:border-[#F85149]/60 transition-colors"
                          >
                            <Trash2 size={11} />
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
