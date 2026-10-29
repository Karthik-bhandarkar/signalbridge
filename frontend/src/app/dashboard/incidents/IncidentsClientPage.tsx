"use client";

import { useEffect, useState, useCallback } from "react";
import { RotateCcw } from "lucide-react";
import IncidentSectionsBoard from "@/components/ops/IncidentSectionsBoard";
import IncidentDetailDrawer, { IncidentDetailData } from "@/components/ops/IncidentDetailDrawer";
import OperatorLoginModal from "@/components/ops/OperatorLoginModal";
import { useAuth } from "@/lib/AuthContext";
import { apiClient } from "@/lib/api";
import { useLiveStream } from "@/lib/useLiveStream";

export default function IncidentsClientPage() {
  const { isOperator, openLoginModal } = useAuth();
  const [incidents, setIncidents] = useState<IncidentDetailData[]>([]);
  const [selectedIncident, setSelectedIncident] = useState<IncidentDetailData | null>(null);
  const [authModalOpen, setAuthModalOpen] = useState(false);
  const [showSimulated, setShowSimulated] = useState(true);
  const [isResetting, setIsResetting] = useState(false);

  async function handleResetDemoData() {
    setIsResetting(true);
    try {
      await apiClient.simulator.reset("all");
      fetchIncidents();
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
      fetchIncidents();
    } catch (err) {
      console.error("Failed to delete incident", err);
      fetchIncidents();
    }
  }

  const fetchIncidents = useCallback(async () => {
    try {
      const data = await apiClient.incidents.list({
        limit: "100",
        include_simulated: showSimulated ? "true" : "false",
      });
      if (Array.isArray(data)) {
        setIncidents(data as IncidentDetailData[]);
      }
    } catch {
      // ignore
    }
  }, [showSimulated]);

  useEffect(() => {
    let mounted = true;
    apiClient.incidents
      .list({
        limit: "100",
        include_simulated: showSimulated ? "true" : "false",
      })
      .then((data) => {
        if (mounted && Array.isArray(data)) {
          setIncidents(data as IncidentDetailData[]);
        }
      })
      .catch(() => {});
    return () => {
      mounted = false;
    };
  }, [showSimulated]);

  // Connect to live SSE stream via resilient hook
  useLiveStream({
    url: "/api/v1/stream/",
    onIncidentUpdate: () => {
      fetchIncidents();
    },
    onPoll: () => {
      fetchIncidents();
    },
    pollIntervalMs: 3500,
  });

  async function handleAcknowledge(id: string) {
    if (!isOperator) {
      openLoginModal();
      return;
    }

    setIncidents((prev) =>
      prev.map((inc) =>
        inc.id === id ? { ...inc, status: "ACKNOWLEDGED", acknowledged_at: new Date().toISOString() } : inc
      )
    );

    try {
      await apiClient.incidents.acknowledge(id);
      fetchIncidents();
    } catch {
      fetchIncidents();
    }
  }

  async function handleResolve(id: string, notes: string) {
    if (!isOperator) {
      openLoginModal();
      return;
    }

    setIncidents((prev) =>
      prev.map((inc) =>
        inc.id === id ? { ...inc, status: "RESOLVED", resolved_at: new Date().toISOString() } : inc
      )
    );

    try {
      await apiClient.incidents.resolve(id, notes);
      fetchIncidents();
    } catch {
      fetchIncidents();
    }
  }

  async function handleSelectIncident(inc: IncidentDetailData) {
    try {
      const full = await apiClient.incidents.detail(inc.id);
      setSelectedIncident(full as IncidentDetailData);
    } catch {
      setSelectedIncident(inc);
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-[#232C3D] pb-4">
        <div>
          <h1 className="text-xl font-bold text-[#E6EAF2]">Incident Operations Board</h1>
          <p className="text-xs text-[#8B949E] mt-0.5">
            Real-time incident lifecycle management across Present, In-Progress, and Resolved states.
          </p>
        </div>
        <button
          type="button"
          onClick={handleResetDemoData}
          disabled={isResetting}
          className="flex items-center gap-1.5 rounded-lg border border-[#F85149]/40 bg-[#F85149]/15 px-3 py-1.5 text-xs font-semibold text-[#F85149] hover:bg-[#F85149]/25 hover:border-[#F85149]/70 transition-all cursor-pointer self-start sm:self-auto"
          title="Purge simulated incidents only — preserves AWS & production feed"
        >
          <RotateCcw size={13} className={isResetting ? "animate-spin" : ""} />
          <span>{isResetting ? "Clearing..." : "Clear Simulator Incidents"}</span>
        </button>
      </div>

      <IncidentSectionsBoard
        incidents={incidents}
        onAcknowledge={handleAcknowledge}
        onResolve={handleResolve}
        onSelectIncident={handleSelectIncident}
        isOperator={isOperator}
        onRequestAuth={openLoginModal}
        showSimulated={showSimulated}
        setShowSimulated={setShowSimulated}
        onDelete={handleDeleteIncident}
      />

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
