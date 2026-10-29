"use client";

import { useEffect, useState, useCallback } from "react";
import Link from "next/link";
import { ArrowLeft, CheckCircle2, AlertTriangle, Shield, Clock, Layers, RefreshCw, Check } from "lucide-react";
import { apiClient, ApiError } from "@/lib/api";
import { SeverityBadge, StatusBadge } from "@/components/ops/Badges";
import { Panel } from "@/components/ui/controls";
import { relativeTime } from "@/lib/format";

export default function IncidentDetailClient({ refParam }: { refParam: string }) {
  const [incident, setIncident] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [actionSuccess, setActionSuccess] = useState<string | null>(null);

  const loadDetail = useCallback(async () => {
    try {
      setActionLoading(true);
      const data = await apiClient.incidents.detail(refParam);
      setIncident(data);
      setError(null);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Incident not found.");
    } finally {
      setActionLoading(false);
    }
  }, [refParam]);

  useEffect(() => {
    let mounted = true;
    apiClient.incidents
      .detail(refParam)
      .then((data) => {
        if (mounted) {
          setIncident(data);
          setError(null);
          setLoading(false);
        }
      })
      .catch((err: unknown) => {
        if (mounted) {
          setError(err instanceof Error ? err.message : "Incident not found.");
          setLoading(false);
        }
      });
    return () => {
      mounted = false;
    };
  }, [refParam]);

  async function handleAcknowledge() {
    if (!incident) return;
    setActionLoading(true);
    try {
      await apiClient.incidents.acknowledge(incident.id);
      setIncident((prev: any) => ({ ...prev, status: "ACKNOWLEDGED" }));
      setActionSuccess("Incident successfully acknowledged.");
      setTimeout(() => setActionSuccess(null), 3000);
    } catch (err: unknown) {
      if (err instanceof ApiError && err.status === 409) {
        setError("Incident was already updated by another operator.");
      } else {
        setError(err instanceof Error ? err.message : "Failed to acknowledge incident.");
      }
    } finally {
      setActionLoading(false);
    }
  }

  async function handleResolve() {
    if (!incident) return;
    setActionLoading(true);
    try {
      await apiClient.incidents.resolve(incident.id, "Resolved via Operator Console.");
      setIncident((prev: any) => ({ ...prev, status: "RESOLVED" }));
      setActionSuccess("Incident successfully resolved.");
      setTimeout(() => setActionSuccess(null), 3000);
    } catch (err: unknown) {
      if (err instanceof ApiError && err.status === 409) {
        setError("Incident was already resolved by another operator.");
      } else {
        setError(err instanceof Error ? err.message : "Failed to resolve incident.");
      }
    } finally {
      setActionLoading(false);
    }
  }

  if (loading) {
    return (
      <div className="p-12 text-center text-xs text-[#8B949E] flex items-center justify-center gap-2">
        <RefreshCw size={15} className="animate-spin text-[#4F8CFF]" />
        <span>Loading incident details...</span>
      </div>
    );
  }

  if (error && !incident) {
    return (
      <div className="p-8 text-center space-y-3">
        <p className="text-xs text-[#F85149]">{error}</p>
        <Link
          href="/dashboard/incidents"
          className="inline-flex items-center gap-1.5 text-xs text-[#4F8CFF] hover:underline"
        >
          <ArrowLeft size={13} />
          <span>Back to Incidents Board</span>
        </Link>
      </div>
    );
  }

  return (
    <div className="space-y-5">
      {/* Back button and breadcrumb */}
      <div className="flex items-center justify-between">
        <Link
          href="/dashboard/incidents"
          className="inline-flex items-center gap-1.5 text-xs font-mono text-[#8B949E] hover:text-[#E6EAF2] transition-colors"
        >
          <ArrowLeft size={13} />
          <span>Back to Incidents Board</span>
        </Link>

        <button
          onClick={loadDetail}
          className="text-xs text-[#8B949E] hover:text-[#E6EAF2] flex items-center gap-1 cursor-pointer"
        >
          <RefreshCw size={12} />
          <span>Refresh</span>
        </button>
      </div>

      {actionSuccess && (
        <div className="flex items-center gap-2 p-3 rounded-xl border border-[#3FB950]/30 bg-[#3FB950]/10 text-xs text-[#3FB950]">
          <Check size={14} />
          <span>{actionSuccess}</span>
        </div>
      )}

      {error && (
        <div className="flex items-center gap-2 p-3 rounded-xl border border-[#F85149]/40 bg-[#F85149]/10 text-xs text-[#F85149]">
          <AlertTriangle size={14} />
          <span>{error}</span>
        </div>
      )}

      {/* Incident Header Card */}
      <Panel as="div" variant="ops" padding="md" className="space-y-4">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="space-y-2">
            <div className="flex flex-wrap items-center gap-2">
              <span className="font-mono text-xs font-bold text-[#E6EAF2]">#{incident.id.slice(0, 8)}</span>
              <SeverityBadge value={incident.severity} />
              <StatusBadge value={incident.status} />
              {incident.is_simulated && (
                <span className="px-1.5 py-0.5 rounded text-[10px] font-mono bg-[#8B949E]/10 text-[#8B949E] border border-[#8B949E]/20">
                  SIMULATED
                </span>
              )}
            </div>
            <h1 className="text-base sm:text-lg font-bold text-[#E6EAF2]">
              {incident.service_name} — {incident.fingerprint}
            </h1>
            <p className="font-mono text-xs text-[#8B949E]">
              {incident.alert_count} correlated alerts grouped across failure window
            </p>
          </div>

          {/* Action Buttons */}
          <div className="flex items-center gap-2">
            {incident.status === "OPEN" && (
              <button
                type="button"
                onClick={handleAcknowledge}
                disabled={actionLoading}
                className="px-3.5 py-2 rounded-xl bg-[#F0B232]/20 border border-[#F0B232]/40 text-xs font-semibold text-[#F0B232] hover:bg-[#F0B232]/30 transition-all cursor-pointer disabled:opacity-50"
              >
                {actionLoading ? "Updating..." : "Acknowledge Incident"}
              </button>
            )}

            {incident.status !== "RESOLVED" && (
              <button
                type="button"
                onClick={handleResolve}
                disabled={actionLoading}
                className="px-3.5 py-2 rounded-xl bg-[#3FB950]/20 border border-[#3FB950]/40 text-xs font-semibold text-[#3FB950] hover:bg-[#3FB950]/30 transition-all cursor-pointer disabled:opacity-50"
              >
                {actionLoading ? "Updating..." : "Resolve Incident"}
              </button>
            )}
          </div>
        </div>

        {/* Timestamps */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 pt-3 border-t border-[#232C3D] text-xs font-mono">
          <div>
            <span className="text-[#8B949E] text-[10px] uppercase block">First Detected</span>
            <span className="text-[#E6EAF2]">{incident.first_seen_at ? relativeTime(new Date(incident.first_seen_at)) : "—"}</span>
          </div>
          <div>
            <span className="text-[#8B949E] text-[10px] uppercase block">Last Signal</span>
            <span className="text-[#E6EAF2]">{incident.last_seen_at ? relativeTime(new Date(incident.last_seen_at)) : "—"}</span>
          </div>
          <div>
            <span className="text-[#8B949E] text-[10px] uppercase block">Acknowledged At</span>
            <span className="text-[#E6EAF2]">{incident.acknowledged_at ? relativeTime(new Date(incident.acknowledged_at)) : "Pending"}</span>
          </div>
          <div>
            <span className="text-[#8B949E] text-[10px] uppercase block">Resolved At</span>
            <span className="text-[#E6EAF2]">{incident.resolved_at ? relativeTime(new Date(incident.resolved_at)) : "Active"}</span>
          </div>
        </div>
      </Panel>

      {/* Correlated Alerts List */}
      <Panel as="div" variant="ops" padding="md" className="space-y-3">
        <h2 className="text-xs font-mono font-semibold uppercase tracking-wider text-[#8B949E]">
          Correlated Alerts ({incident.alerts?.length || 0})
        </h2>
        {incident.alerts && incident.alerts.length > 0 ? (
          <div className="space-y-2">
            {incident.alerts.map((al: any) => (
              <div key={al.id} className="p-3 rounded-xl border border-[#232C3D] bg-[#111722] flex items-center justify-between">
                <div>
                  <div className="flex items-center gap-2">
                    <span className="font-mono text-xs font-semibold text-[#E6EAF2]">{al.title}</span>
                    <SeverityBadge value={al.severity} />
                  </div>
                  <span className="font-mono text-[11px] text-[#8B949E]">{al.fingerprint}</span>
                </div>
                <span className="font-mono text-[10px] text-[#8B949E]">
                  {al.created_at ? relativeTime(new Date(al.created_at)) : ""}
                </span>
              </div>
            ))}
          </div>
        ) : (
          <p className="text-xs text-[#8B949E]">No individual alerts found.</p>
        )}
      </Panel>
    </div>
  );
}
