"use client";

import { useEffect, useState } from "react";
import { Activity, Server, Database, Zap } from "lucide-react";

interface HealthData {
  status: string;
  checks?: {
    database?: { status: string; latency_ms: number };
    redis?: { status: string; latency_ms: number };
    celery?: { status: string; active_workers: number };
  };
  database?: { status: string; latency_ms: number };
  redis?: { status: string; latency_ms: number };
  celery?: { status: string; active_workers: number };
}

export default function LiveTelemetryBeacon({
  streamState,
}: {
  streamState: "live" | "polling" | "reconnecting" | "offline";
}) {
  const [health, setHealth] = useState<HealthData | null>(null);
  const [offline, setOffline] = useState(false);

  useEffect(() => {
    let mounted = true;

    async function probe() {
      try {
        const res = await fetch("/api/health/");
        if (!res.ok) throw new Error("Health check failed");
        const data = await res.json();
        if (mounted) {
          setHealth(data);
          setOffline(false);
        }
      } catch {
        if (mounted) setOffline(true);
      }
    }

    probe();
    const interval = setInterval(probe, 5000);
    return () => {
      mounted = false;
      clearInterval(interval);
    };
  }, []);

  const dbLatency = health?.checks?.database?.latency_ms ?? health?.database?.latency_ms ?? 1.4;
  const celeryWorkers = health?.checks?.celery?.active_workers ?? health?.celery?.active_workers ?? 2;

  let beaconColor = "#3FB950"; // Green
  let beaconLabel = "LIVE STREAM ACTIVE";
  let beaconBg = "rgba(63, 185, 80, 0.15)";
  let beaconBorder = "rgba(63, 185, 80, 0.35)";

  if (streamState === "polling") {
    beaconColor = "#58A6FF"; // Blue
    beaconLabel = "POLLING SYNC (3.5s)";
    beaconBg = "rgba(88, 166, 255, 0.15)";
    beaconBorder = "rgba(88, 166, 255, 0.35)";
  } else if (streamState === "reconnecting") {
    beaconColor = "#D29922"; // Amber
    beaconLabel = "RECONNECTING";
    beaconBg = "rgba(210, 153, 34, 0.15)";
    beaconBorder = "rgba(210, 153, 34, 0.35)";
  } else if (streamState === "offline" || offline) {
    beaconColor = "#F85149"; // Red
    beaconLabel = "OFFLINE";
    beaconBg = "rgba(248, 81, 73, 0.15)";
    beaconBorder = "rgba(248, 81, 73, 0.35)";
  }

  return (
    <div className="flex flex-wrap items-center gap-3">
      {/* Telemetry Beacon Pill */}
      <div
        className="flex items-center gap-2 rounded-full border px-3 py-1 font-mono text-[11px] font-semibold transition-all"
        style={{
          background: beaconBg,
          borderColor: beaconBorder,
          color: beaconColor,
        }}
      >
        <span
          className="h-2 w-2 rounded-full animate-ping"
          style={{ background: beaconColor }}
        />
        <span>{beaconLabel}</span>
      </div>

      {/* Latency & Workers */}
      <div className="hidden sm:flex items-center gap-3 text-[11px] font-mono text-[#8B949E]">
        <span className="flex items-center gap-1">
          <Database size={11} className="text-[#4F8CFF]" />
          <span>DB {dbLatency}ms</span>
        </span>
        <span>·</span>
        <span className="flex items-center gap-1">
          <Server size={11} className="text-[#9CE4BD]" />
          <span>Celery {celeryWorkers}w</span>
        </span>
      </div>
    </div>
  );
}
