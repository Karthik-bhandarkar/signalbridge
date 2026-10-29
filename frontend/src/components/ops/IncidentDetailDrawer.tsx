"use client";

import { useState } from "react";
import { X, CheckCircle2, Clock, AlertTriangle, ShieldAlert, Layers, Archive, History, FileText, Send, Trash2 } from "lucide-react";

export interface IncidentDetailData {
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
  resolution_notes?: string;
  duration_seconds?: number;
  alerts?: Array<{
    id: string;
    title: string;
    severity: string;
    service_name: string;
    created_at: string;
  }>;
  events?: Array<{
    id: string;
    event_type: string;
    description: string;
    actor_type: string;
    created_at: string;
  }>;
}

interface IncidentDetailDrawerProps {
  incident: IncidentDetailData | null;
  onClose: () => void;
  onAcknowledge: (id: string) => Promise<void>;
  onResolve: (id: string, notes: string) => Promise<void>;
  isOperator: boolean;
  onRequestAuth: () => void;
  onDelete?: (id: string) => Promise<void> | void;
}

export default function IncidentDetailDrawer({
  incident,
  onClose,
  onAcknowledge,
  onResolve,
  isOperator,
  onRequestAuth,
  onDelete,
}: IncidentDetailDrawerProps) {
  const [resolutionNotes, setResolutionNotes] = useState("");
  const [actionLoading, setActionLoading] = useState(false);

  if (!incident) return null;

  async function handleAck() {
    if (!incident) return;
    if (!isOperator) {
      onRequestAuth();
      return;
    }
    setActionLoading(true);
    try {
      await onAcknowledge(incident.id);
    } finally {
      setActionLoading(false);
    }
  }

  async function handleResolve() {
    if (!incident) return;
    if (!isOperator) {
      onRequestAuth();
      return;
    }
    setActionLoading(true);
    try {
      await onResolve(incident.id, resolutionNotes || "Resolved by operator via Mission Control.");
      setResolutionNotes("");
    } finally {
      setActionLoading(false);
    }
  }

  const sevColors: Record<string, { bg: string; text: string; border: string }> = {
    CRITICAL: { bg: "rgba(248, 81, 73, 0.15)", text: "#F85149", border: "rgba(248, 81, 73, 0.4)" },
    HIGH: { bg: "rgba(210, 153, 34, 0.15)", text: "#D29922", border: "rgba(210, 153, 34, 0.4)" },
    MEDIUM: { bg: "rgba(219, 109, 40, 0.15)", text: "#DB6D28", border: "rgba(219, 109, 40, 0.4)" },
    LOW: { bg: "rgba(88, 166, 255, 0.15)", text: "#58A6FF", border: "rgba(88, 166, 255, 0.4)" },
  };

  const sevStyle = sevColors[incident.severity] || sevColors.MEDIUM;

  return (
    <div className="fixed inset-0 z-50 flex justify-end bg-black/60 backdrop-blur-sm animate-in fade-in duration-150">
      <div
        className="h-full w-full max-w-lg border-l border-[#232C3D] bg-[#0A0E14] shadow-2xl flex flex-col overflow-hidden animate-in slide-in-from-right duration-200"
        style={{ color: "#E6EAF2" }}
      >
        {/* Drawer Header */}
        <div className="flex items-center justify-between border-b border-[#232C3D] bg-[#111722] px-6 py-4">
          <div className="flex items-center gap-2">
            <span
              className="rounded-md border px-2 py-0.5 font-mono text-[11px] font-bold"
              style={{
                backgroundColor: sevStyle.bg,
                color: sevStyle.text,
                borderColor: sevStyle.border,
              }}
            >
              {incident.severity}
            </span>
            {incident.is_simulated && (
              <span className="rounded-md border border-[#8B949E]/30 bg-[#161D2B] px-1.5 py-0.5 font-mono text-[10px] text-[#8B949E]">
                SIMULATED
              </span>
            )}
            <span
              className={`rounded-md px-2 py-0.5 font-mono text-[11px] font-semibold ${
                incident.status === "OPEN"
                  ? "bg-[#F85149]/20 text-[#F85149]"
                  : incident.status === "ACKNOWLEDGED"
                  ? "bg-[#D29922]/20 text-[#D29922]"
                  : "bg-[#3FB950]/20 text-[#3FB950]"
              }`}
            >
              {incident.status}
            </span>
          </div>

          <button
            onClick={onClose}
            className="rounded-lg p-1 text-[#8B949E] hover:bg-[#161D2B] hover:text-[#E6EAF2] transition-colors"
          >
            <X size={18} />
          </button>
        </div>

        {/* Drawer Body */}
        <div className="flex-1 overflow-y-auto p-6 space-y-6">
          {/* Service & Fingerprint */}
          <div>
            <h3 className="font-mono text-base font-bold text-[#E6EAF2]">{incident.service_name}</h3>
            <p className="mt-1 font-mono text-xs text-[#8B949E] break-all">{incident.fingerprint}</p>
            <p className="mt-1 font-mono text-[10px] text-[#4F8CFF]">ID: {incident.id}</p>
          </div>

          {/* Quick Stats Grid */}
          <div className="grid grid-cols-3 gap-3 rounded-xl border border-[#232C3D] bg-[#111722] p-3 text-center">
            <div>
              <p className="text-[10px] uppercase font-mono text-[#8B949E]">Correlated Signals</p>
              <p className="mt-1 font-mono text-lg font-bold text-[#4F8CFF]">×{incident.alert_count}</p>
            </div>
            <div>
              <p className="text-[10px] uppercase font-mono text-[#8B949E]">Duration</p>
              <p className="mt-1 font-mono text-lg font-bold text-[#E6EAF2]">
                {incident.duration_seconds ? `${Math.round(incident.duration_seconds)}s` : "Live"}
              </p>
            </div>
            <div>
              <p className="text-[10px] uppercase font-mono text-[#8B949E]">Source Slug</p>
              <p className="mt-1 font-mono text-xs font-semibold text-[#8B949E] truncate">
                {incident.source_slug || "webhook"}
              </p>
            </div>
          </div>

          {/* Action Panel */}
          {incident.status !== "RESOLVED" && (
            <div className="rounded-xl border border-[#232C3D] bg-[#111722] p-4 space-y-3">
              <h4 className="text-xs font-semibold uppercase tracking-wider text-[#8B949E]">
                Operator Triage Actions
              </h4>

              {incident.status === "OPEN" && (
                <button
                  onClick={handleAck}
                  disabled={actionLoading}
                  className="w-full flex items-center justify-center gap-2 rounded-lg bg-[#D29922]/20 border border-[#D29922]/40 py-2 text-xs font-semibold text-[#D29922] hover:bg-[#D29922]/30 transition-all disabled:opacity-50"
                >
                  <CheckCircle2 size={14} />
                  <span>Acknowledge Incident</span>
                </button>
              )}

              <div className="space-y-2">
                <input
                  type="text"
                  placeholder="Root cause / resolution summary..."
                  value={resolutionNotes}
                  onChange={(e) => setResolutionNotes(e.target.value)}
                  className="w-full rounded-lg border border-[#232C3D] bg-[#0A0E14] px-3 py-2 text-xs text-[#E6EAF2] placeholder-[#8B949E] focus:border-[#4F8CFF] focus:outline-none"
                />
                <button
                  onClick={handleResolve}
                  disabled={actionLoading}
                  className="w-full flex items-center justify-center gap-2 rounded-lg bg-[#3FB950]/20 border border-[#3FB950]/40 py-2 text-xs font-semibold text-[#3FB950] hover:bg-[#3FB950]/30 transition-all disabled:opacity-50"
                >
                  <CheckCircle2 size={14} />
                  <span>Resolve & Append Audit Record</span>
                </button>
              </div>
            </div>
          )}

          {/* Timeline Audit Log */}
          <div>
            <h4 className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wider text-[#8B949E] mb-3">
              <History size={13} />
              <span>Chronological Timeline Audit Log</span>
            </h4>

            <div className="space-y-2 font-mono text-xs">
              {incident.events && incident.events.length > 0 ? (
                incident.events.map((ev, i) => (
                  <div
                    key={ev.id || i}
                    className="rounded-lg border border-[#232C3D] bg-[#111722] p-2.5 flex items-start gap-2.5"
                  >
                    <span className="h-2 w-2 rounded-full bg-[#4F8CFF] mt-1 shrink-0" />
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center justify-between text-[10px] text-[#8B949E]">
                        <span className="font-bold text-[#4F8CFF]">{ev.event_type}</span>
                        <span>{ev.created_at ? new Date(ev.created_at).toLocaleTimeString() : ""}</span>
                      </div>
                      <p className="mt-1 text-[11px] text-[#E6EAF2]">{ev.description}</p>
                    </div>
                  </div>
                ))
              ) : (
                <div className="rounded-lg border border-[#232C3D] bg-[#111722] p-3 text-center text-xs text-[#8B949E]">
                  <span>Timeline active · Initial incident trigger recorded</span>
                </div>
              )}
            </div>
          </div>

          {/* S3 Tiered Storage Durability Info */}
          <div className="rounded-xl border border-[#232C3D] bg-[#111722] p-3 flex items-center gap-3 text-xs">
            <Archive size={16} className="text-[#4F8CFF] shrink-0" />
            <div className="min-w-0 flex-1 font-mono text-[11px]">
              <p className="font-semibold text-[#E6EAF2]">Cold Object Storage Durability</p>
              <p className="text-[10px] text-[#8B949E] truncate">
                s3://signalbridge-cold-storage/raw/{incident.fingerprint}.json.gz
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

