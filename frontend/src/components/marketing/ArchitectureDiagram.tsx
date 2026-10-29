"use client";

import React, { useState, useEffect } from "react";
import {
  ShieldCheck,
  Zap,
  Database,
  Cpu,
  Layers,
  Archive,
  ArrowRight,
  CheckCircle2,
  AlertTriangle,
  Server,
  Lock,
  Flame,
  Radio,
  FileCode,
  Activity,
  Workflow,
} from "lucide-react";
import { Reveal } from "./primitives";

interface ArchitectureNode {
  id: string;
  name: string;
  badge: string;
  role: string;
  icon: React.ComponentType<{ size?: number; className?: string }>;
  color: string;
  borderColor: string;
  bgGlow: string;
  latency: string;
  specs: {
    primitives: string;
    throughput: string;
    resilience: string;
    details: string;
  };
}

const NODES: ArchitectureNode[] = [
  {
    id: "ingress",
    name: "1. Webhook Ingress",
    badge: "EXTERNAL SOURCES",
    role: "PagerDuty, Datadog, GitHub, CloudWatch",
    icon: Radio,
    color: "#ff8fae",
    borderColor: "rgba(255, 143, 174, 0.4)",
    bgGlow: "rgba(255, 143, 174, 0.08)",
    latency: "< 2.1ms",
    specs: {
      primitives: "TLS 1.3 · HTTPS POST · Idempotency-Key Header",
      throughput: "Up to 50,000 req/sec ingress burst",
      resilience: "Global Anycast DNS & CloudFront Edge distribution",
      details: "Ingests raw webhooks from multi-cloud monitoring agents. Automatically normalizes heterogeneous payloads into standard canonical signals.",
    },
  },
  {
    id: "security",
    name: "2. HMAC Gateway",
    badge: "SECURITY GATEWAY",
    role: "Constant-Time Signature Verification",
    icon: ShieldCheck,
    color: "#a974ff",
    borderColor: "rgba(169, 116, 255, 0.4)",
    bgGlow: "rgba(169, 116, 255, 0.08)",
    latency: "0.38ms",
    specs: {
      primitives: "HMAC-SHA256 · hmac.compare_digest · 300s Timestamp Drift",
      throughput: "Zero-allocation cryptographic stream validation",
      resilience: "Replay attack mitigation & unsigned payload 401 drop",
      details: "Performs cryptographic verification using provider-specific shared secrets. Rejects tampered payloads and timestamp replays before hitting business logic.",
    },
  },
  {
    id: "cache",
    name: "3. Redis Dedupe Tier",
    badge: "IN-MEMORY CACHE",
    role: "Sliding-Window Deduplication",
    icon: Zap,
    color: "#ffc46b",
    borderColor: "rgba(255, 196, 107, 0.4)",
    bgGlow: "rgba(255, 196, 107, 0.08)",
    latency: "0.85ms",
    specs: {
      primitives: "Redis 7.0 · Sliding Window · SETNX Distributed Locks",
      throughput: "120,000 IOPS in-memory deduplication lookup",
      resilience: "Multi-AZ Redis Sentinel automatic failover",
      details: "Identifies duplicate deliveries and cascading alert retry loops. Absorbs 70%+ of duplicate requests in-memory without taxing persistent database storage.",
    },
  },
  {
    id: "database",
    name: "4. PostgreSQL Core",
    badge: "PERSISTENT RELATIONAL",
    role: "Incident Correlation & State Machine",
    icon: Database,
    color: "#7ddfb0",
    borderColor: "rgba(125, 223, 176, 0.4)",
    bgGlow: "rgba(125, 223, 176, 0.08)",
    latency: "1.92ms",
    specs: {
      primitives: "PostgreSQL 16 · B-Tree Indexing · Row-Level Locks (FOR UPDATE)",
      throughput: "ACID transactional guarantees for incident state",
      resilience: "WAL archiving, point-in-time recovery, automated replicas",
      details: "Computes deterministic incident fingerprints: sha256(service + alert_type). Merges identical signals into a single actionable incident record with timeline audit logs.",
    },
  },
  {
    id: "workers",
    name: "5. Celery Asynchronous Workers",
    badge: "TASK DISPATCH",
    role: "Background Triage & Escalation",
    icon: Cpu,
    color: "#58a6ff",
    borderColor: "rgba(88, 166, 255, 0.4)",
    bgGlow: "rgba(88, 166, 255, 0.08)",
    latency: "Async queue",
    specs: {
      primitives: "Celery 5.3 · Redis Broker · Dead Letter Queue (DLQ)",
      throughput: "Auto-scaling asynchronous worker pool",
      resilience: "Exponential backoff retries with jitter",
      details: "Executes asynchronous alert post-processing, on-call paging dispatches, external webhook forwards, and scheduled health sweeps.",
    },
  },
  {
    id: "storage",
    name: "6. S3 Cold Tier & Live Console",
    badge: "AUDIT & OBSERVABILITY",
    role: "Immutable Payload Vault & SSE Live Stream",
    icon: Archive,
    color: "#e2b8ff",
    borderColor: "rgba(226, 184, 255, 0.4)",
    bgGlow: "rgba(226, 184, 255, 0.08)",
    latency: "< 25ms async",
    specs: {
      primitives: "AWS S3 / MinIO · SSE-S3 encryption · Gzip payload archiving",
      throughput: "99.999999999% (11 9s) durability archival",
      resilience: "WORM immutable compliance audit trails & SSE telemetry",
      details: "Original raw payloads are compressed and preserved in cold object storage for forensic replay. Live telemetry beacons push status changes directly to the operator dashboard.",
    },
  },
];

type SimulationMode = "healthy" | "storm" | "tampered";

export default function ArchitectureDiagram() {
  const [selectedNode, setSelectedNode] = useState<ArchitectureNode>(NODES[1]);
  const [mode, setMode] = useState<SimulationMode>("healthy");
  const [packetStep, setPacketStep] = useState(0);

  useEffect(() => {
    const timer = setInterval(() => {
      setPacketStep((prev) => (prev + 1) % 6);
    }, 1800);
    return () => clearInterval(timer);
  }, [mode]);

  return (
    <section id="architecture" className="lp-section py-24 relative overflow-hidden" aria-labelledby="arch-title">
      {/* Background ambient lighting */}
      <div
        className="pointer-events-none absolute -top-40 left-1/2 -translate-x-1/2 w-[800px] h-[400px] rounded-full blur-[140px] opacity-20"
        style={{ background: "radial-gradient(circle, #a974ff 0%, #371b68 70%, transparent 100%)" }}
      />

      <div className="lp-wrap max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 relative z-10">
        {/* Section Header */}
        <div className="text-center max-w-3xl mx-auto mb-14">
          <Reveal>
            <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full border border-[#a974ff]/30 bg-[#a974ff]/10 text-xs font-semibold text-[#d7b4ff] mb-4 uppercase tracking-wider font-mono">
              <Workflow size={13} className="text-[#a974ff]" />
              System Architecture & Pipeline Engineering
            </div>
          </Reveal>
          <Reveal delay={0.06}>
            <h2 id="arch-title" className="text-3xl sm:text-4xl md:text-5xl font-extrabold tracking-tight text-white mb-4">
              How SignalBridge Processes Alerts End-to-End
            </h2>
          </Reveal>
          <Reveal delay={0.12}>
            <p className="text-base sm:text-lg text-[#b8aed6] leading-relaxed">
              From the moment an alert fires in your cloud infrastructure to single-incident triage in the operator console.
              Click any stage below to inspect its cryptographic primitives, caching strategy, and resilience guarantees.
            </p>
          </Reveal>

          {/* Interactive Simulation Controls */}
          <Reveal delay={0.18}>
            <div className="mt-8 flex flex-wrap items-center justify-center gap-2.5">
              <button
                type="button"
                onClick={() => setMode("healthy")}
                className={`inline-flex items-center gap-2 px-3.5 py-1.5 rounded-lg text-xs font-semibold transition-all cursor-pointer ${
                  mode === "healthy"
                    ? "bg-[#7ddfb0]/20 text-[#7ddfb0] border border-[#7ddfb0]/60 shadow-[0_0_15px_rgba(125,223,176,0.3)]"
                    : "bg-[#181128]/80 text-[#9d92b8] border border-[#3b2d5a] hover:border-[#6f56a3] hover:text-white"
                }`}
              >
                <CheckCircle2 size={13} />
                <span>Normal Pipeline (P99 &lt; 5ms)</span>
              </button>

              <button
                type="button"
                onClick={() => setMode("storm")}
                className={`inline-flex items-center gap-2 px-3.5 py-1.5 rounded-lg text-xs font-semibold transition-all cursor-pointer ${
                  mode === "storm"
                    ? "bg-[#ffc46b]/20 text-[#ffc46b] border border-[#ffc46b]/60 shadow-[0_0_15px_rgba(255,196,107,0.3)]"
                    : "bg-[#181128]/80 text-[#9d92b8] border border-[#3b2d5a] hover:border-[#6f56a3] hover:text-white"
                }`}
              >
                <Flame size={13} />
                <span>Alert Storm (Redis Deduplication: 88% Absorbed)</span>
              </button>

              <button
                type="button"
                onClick={() => setMode("tampered")}
                className={`inline-flex items-center gap-2 px-3.5 py-1.5 rounded-lg text-xs font-semibold transition-all cursor-pointer ${
                  mode === "tampered"
                    ? "bg-[#ff8fae]/20 text-[#ff8fae] border border-[#ff8fae]/60 shadow-[0_0_15px_rgba(255,143,174,0.3)]"
                    : "bg-[#181128]/80 text-[#9d92b8] border border-[#3b2d5a] hover:border-[#6f56a3] hover:text-white"
                }`}
              >
                <Lock size={13} />
                <span>Tampered Signature (HMAC Rejection Drop)</span>
              </button>
            </div>
          </Reveal>
        </div>

        {/* Dynamic Animated Flow Canvas */}
        <div className="relative mb-12">
          {/* Node Cards Grid */}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
            {NODES.map((node, index) => {
              const Icon = node.icon;
              const isSelected = selectedNode.id === node.id;
              const isPacketHere = packetStep === index;

              return (
                <div
                  key={node.id}
                  onClick={() => setSelectedNode(node)}
                  className={`group relative p-5 rounded-2xl border transition-all duration-300 cursor-pointer overflow-hidden backdrop-blur-md ${
                    isSelected
                      ? "ring-2 shadow-xl"
                      : "border-[#2c2049] bg-[#160f29]/80 hover:border-[#523d83] hover:bg-[#1f153a]/90"
                  }`}
                  style={{
                    borderColor: isSelected ? node.color : undefined,
                    boxShadow: isSelected ? `0 0 25px ${node.bgGlow}, inset 0 0 15px ${node.bgGlow}` : undefined,
                    backgroundColor: isSelected ? "rgba(26, 17, 49, 0.95)" : undefined,
                  }}
                >
                  {/* Active packet indicator light pulse */}
                  {isPacketHere && (
                    <div
                      className="absolute top-0 left-0 right-0 h-1 animate-pulse"
                      style={{ background: `linear-gradient(90deg, transparent, ${node.color}, transparent)` }}
                    />
                  )}

                  <div className="flex items-start justify-between gap-3 mb-3">
                    <div className="flex items-center gap-3">
                      <div
                        className="w-10 h-10 rounded-xl flex items-center justify-center border transition-transform duration-300 group-hover:scale-105"
                        style={{
                          backgroundColor: node.bgGlow,
                          borderColor: node.borderColor,
                          color: node.color,
                        }}
                      >
                        <Icon size={20} />
                      </div>
                      <div>
                        <span className="text-[10px] font-mono uppercase tracking-wider font-semibold" style={{ color: node.color }}>
                          {node.badge}
                        </span>
                        <h3 className="text-base font-bold text-white leading-tight">
                          {node.name}
                        </h3>
                      </div>
                    </div>

                    <span className="text-[10px] font-mono px-2 py-0.5 rounded-full border border-white/10 bg-white/5 text-[#d0c6ea]">
                      {node.latency}
                    </span>
                  </div>

                  <p className="text-xs text-[#a99fc6] line-clamp-2 mb-4 leading-relaxed">
                    {node.role}
                  </p>

                  <div className="pt-3 border-t border-white/10 flex items-center justify-between text-[11px]">
                    <span className="text-[#8477a3] font-mono">
                      Step {index + 1} of 6
                    </span>
                    <span
                      className="inline-flex items-center gap-1 font-semibold transition-colors"
                      style={{ color: isSelected ? node.color : "#9f93c2" }}
                    >
                      {isSelected ? "Inspecting" : "Click to inspect"}
                      <ArrowRight size={12} className={isSelected ? "translate-x-0.5" : ""} />
                    </span>
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Selected Stage Deep-Dive Technical Spec Panel */}
        <div className="rounded-3xl border border-[#3b2d5a] bg-[#140c26]/95 backdrop-blur-xl p-6 sm:p-8 shadow-2xl relative overflow-hidden">
          <div
            className="absolute top-0 right-0 w-80 h-80 rounded-full blur-[100px] pointer-events-none opacity-20"
            style={{ background: selectedNode.color }}
          />

          <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-6 pb-6 border-b border-white/10">
            <div className="flex items-center gap-4">
              <div
                className="w-14 h-14 rounded-2xl flex items-center justify-center border shadow-lg"
                style={{
                  backgroundColor: selectedNode.bgGlow,
                  borderColor: selectedNode.borderColor,
                  color: selectedNode.color,
                }}
              >
                {React.createElement(selectedNode.icon, { size: 28 })}
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <span className="text-xs font-mono font-bold uppercase tracking-wider" style={{ color: selectedNode.color }}>
                    Technical Specifications
                  </span>
                  <span className="h-1.5 w-1.5 rounded-full" style={{ backgroundColor: selectedNode.color }} />
                  <span className="text-xs text-[#9f93c2]">{selectedNode.badge}</span>
                </div>
                <h3 className="text-xl sm:text-2xl font-bold text-white mt-0.5">
                  {selectedNode.name}
                </h3>
              </div>
            </div>

            <div className="flex items-center gap-3">
              <div className="px-3.5 py-1.5 rounded-xl border border-white/10 bg-white/5 flex items-center gap-2">
                <Activity size={14} className="text-[#7ddfb0]" />
                <span className="text-xs text-[#cdc3ee] font-mono">
                  Measured Latency: <strong className="text-white">{selectedNode.latency}</strong>
                </span>
              </div>
            </div>
          </div>

          <div className="mt-6 grid grid-cols-1 md:grid-cols-3 gap-6">
            <div className="rounded-xl border border-white/5 bg-white/[0.02] p-4">
              <span className="text-[10px] font-mono uppercase tracking-wider text-[#9d92b8] block mb-1">
                Engineering Primitives
              </span>
              <p className="text-sm font-semibold text-white font-mono leading-relaxed">
                {selectedNode.specs.primitives}
              </p>
            </div>

            <div className="rounded-xl border border-white/5 bg-white/[0.02] p-4">
              <span className="text-[10px] font-mono uppercase tracking-wider text-[#9d92b8] block mb-1">
                Measured Throughput
              </span>
              <p className="text-sm font-semibold text-white font-mono leading-relaxed">
                {selectedNode.specs.throughput}
              </p>
            </div>

            <div className="rounded-xl border border-white/5 bg-white/[0.02] p-4">
              <span className="text-[10px] font-mono uppercase tracking-wider text-[#9d92b8] block mb-1">
                Resilience & Failover
              </span>
              <p className="text-sm font-semibold text-white font-mono leading-relaxed">
                {selectedNode.specs.resilience}
              </p>
            </div>
          </div>

          <div className="mt-6 pt-6 border-t border-white/10 flex flex-col sm:flex-row sm:items-center justify-between gap-4 text-xs text-[#b8aed6]">
            <p className="max-w-3xl leading-relaxed">
              <strong className="text-white">Pipeline Context: </strong>
              {selectedNode.specs.details}
            </p>
            <a
              href="/docs"
              className="inline-flex items-center gap-1.5 font-semibold text-[#d7b4ff] hover:text-white transition-colors shrink-0"
            >
              <FileCode size={13} />
              <span>Read API Specification</span>
            </a>
          </div>
        </div>
      </div>
    </section>
  );
}
