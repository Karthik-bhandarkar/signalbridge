"use client";

import { useEffect, useState, useCallback } from "react";
import IncidentSectionsBoard from "@/components/ops/IncidentSectionsBoard";
import IncidentDetailDrawer, { IncidentDetailData } from "@/components/ops/IncidentDetailDrawer";
import OperatorLoginModal from "@/components/ops/OperatorLoginModal";

export default function IncidentsClientPage({
  initialUser,
}: {
  initialUser?: { name: string; email: string; role: string } | null;
}) {
  const [user, setUser] = useState<{ username: string; role: string } | null>(
    initialUser ? { username: initialUser.name, role: initialUser.role } : null
  );
  const [incidents, setIncidents] = useState<IncidentDetailData[]>([]);
  const [selectedIncident, setSelectedIncident] = useState<IncidentDetailData | null>(null);
  const [authModalOpen, setAuthModalOpen] = useState(false);
  const [showSimulated, setShowSimulated] = useState(true);

  const fetchIncidents = useCallback(async () => {
    try {
      const res = await fetch(`/api/v1/public/incidents/?limit=100&include_simulated=true`);
      if (res.ok) {
        const data = await res.json();
        setIncidents(data);
      }
    } catch {
      // ignore
    }
  }, []);

  useEffect(() => {
    const timer = setTimeout(fetchIncidents, 0);
    const interval = setInterval(fetchIncidents, 3500);
    return () => {
      clearTimeout(timer);
      clearInterval(interval);
    };
  }, [fetchIncidents]);

  // SSE Stream listener
  useEffect(() => {
    let evtSource: EventSource | null = null;
    try {
      evtSource = new EventSource("/api/v1/stream/");
      evtSource.addEventListener("incident_update", () => {
        fetchIncidents();
      });
    } catch {
      // fallback to polling
    }
    return () => {
      if (evtSource) evtSource.close();
    };
  }, [fetchIncidents]);

  async function handleAcknowledge(id: string) {
    if (!user) {
      setAuthModalOpen(true);
      return;
    }

    setIncidents((prev) =>
      prev.map((inc) => (inc.id === id ? { ...inc, status: "ACKNOWLEDGED", acknowledged_at: new Date().toISOString() } : inc))
    );

    try {
      let csrfToken = "";
      try {
        const csrfRes = await fetch("/api/v1/auth/csrf/");
        if (csrfRes.ok) csrfToken = (await csrfRes.json()).csrfToken || "";
      } catch {}

      const headers: Record<string, string> = { "Content-Type": "application/json" };
      if (csrfToken) headers["X-CSRFToken"] = csrfToken;

      const res = await fetch(`/api/v1/incidents/${id}/acknowledge/`, { method: "POST", headers });
      if (!res.ok) {
        if (res.status === 401 || res.status === 403) setAuthModalOpen(true);
        fetchIncidents();
      }
    } catch {
      fetchIncidents();
    }
  }

  async function handleResolve(id: string, notes: string) {
    if (!user) {
      setAuthModalOpen(true);
      return;
    }

    setIncidents((prev) =>
      prev.map((inc) => (inc.id === id ? { ...inc, status: "RESOLVED", resolved_at: new Date().toISOString() } : inc))
    );

    try {
      let csrfToken = "";
      try {
        const csrfRes = await fetch("/api/v1/auth/csrf/");
        if (csrfRes.ok) csrfToken = (await csrfRes.json()).csrfToken || "";
      } catch {}

      const headers: Record<string, string> = { "Content-Type": "application/json" };
      if (csrfToken) headers["X-CSRFToken"] = csrfToken;

      const res = await fetch(`/api/v1/incidents/${id}/resolve/`, {
        method: "POST",
        headers,
        body: JSON.stringify({ resolution_notes: notes }),
      });
      if (!res.ok) {
        if (res.status === 401 || res.status === 403) setAuthModalOpen(true);
        fetchIncidents();
      }
    } catch {
      fetchIncidents();
    }
  }

  async function handleSelectIncident(inc: IncidentDetailData) {
    try {
      const res = await fetch(`/api/v1/public/incidents/${inc.id}/`);
      if (res.ok) {
        setSelectedIncident(await res.json());
      } else {
        setSelectedIncident(inc);
      }
    } catch {
      setSelectedIncident(inc);
    }
  }

  return (
    <div className="space-y-6">
      <div className="border-b border-[#232C3D] pb-4">
        <h1 className="text-xl font-bold text-[#E6EAF2]">Incident Operations Board</h1>
        <p className="text-xs text-[#8B949E] mt-0.5">
          Real-time incident lifecycle management across Present, In-Progress, and Resolved states.
        </p>
      </div>

      <IncidentSectionsBoard
        incidents={incidents}
        onAcknowledge={handleAcknowledge}
        onResolve={handleResolve}
        onSelectIncident={handleSelectIncident}
        isOperator={Boolean(user)}
        onRequestAuth={() => setAuthModalOpen(true)}
        showSimulated={showSimulated}
        setShowSimulated={setShowSimulated}
      />

      <IncidentDetailDrawer
        incident={selectedIncident}
        onClose={() => setSelectedIncident(null)}
        onAcknowledge={handleAcknowledge}
        onResolve={handleResolve}
        isOperator={Boolean(user)}
        onRequestAuth={() => setAuthModalOpen(true)}
      />

      <OperatorLoginModal
        isOpen={authModalOpen}
        onClose={() => setAuthModalOpen(false)}
        onSuccess={(u) => {
          setUser(u);
          fetchIncidents();
        }}
      />
    </div>
  );
}

