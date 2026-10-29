"use client";

import { useState } from "react";
import { Zap, CheckCircle, Clock, ShieldCheck, Layers, AlertCircle, RefreshCw, Lock } from "lucide-react";
import { apiClient, ApiError } from "@/lib/api";

interface PipelineTimings {
  hmac_verified_ms: number;
  dedup_checked_ms: number;
  correlated_ms: number;
  total_pipeline_ms: number;
}

interface DispatchResult {
  status: string;
  scenario: string;
  scenario_name: string;
  tracking_id: string;
  idempotency_hash: string;
  service_name: string;
  fingerprint: string;
  severity: string;
  incident_id: string;
  pipeline_timings_ms: PipelineTimings;
  message: string;
}

interface SimulatorStudioProps {
  onDispatched: () => void;
  isOperator: boolean;
  onRequestAuth: () => void;
}

export default function SimulatorStudio({
  onDispatched,
  isOperator,
  onRequestAuth,
}: SimulatorStudioProps) {
  const [scenario, setScenario] = useState("payment_gateway_saturation");
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<DispatchResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  const scenarios = [
    {
      id: "payment_gateway_saturation",
      name: "Payment Gateway Saturation",
      service: "payment-api",
      severity: "CRITICAL",
      desc: "PgBouncer pool > 96%, P99 latency breached 2800ms.",
    },
    {
      id: "db_pool_exhaustion",
      name: "Database Connection Pool Exhaustion",
      service: "order-service",
      severity: "HIGH",
      desc: "PostgreSQL active connections reached ceiling (198/200).",
    },
    {
      id: "edge_5xx_storm",
      name: "Edge 5xx Storm",
      service: "edge-gateway",
      severity: "CRITICAL",
      desc: "CloudFront / Nginx edge 502 bad gateway wave.",
    },
  ];

  async function handleDispatch() {
    setLoading(true);
    setError(null);
    setResult(null);

    try {
      const data = await apiClient.simulator.dispatch(scenario);
      setResult(data as DispatchResult);
      onDispatched();
    } catch (err: unknown) {
      if (err instanceof ApiError) {
        if (err.status === 401 || err.status === 403) {
          onRequestAuth();
          setError("Operator authentication required to dispatch simulator scenarios.");
        } else if (err.status === 429) {
          setError("Simulator rate limit reached (60/min). Please wait a moment.");
        } else {
          setError(err.message || "Simulator dispatch failed.");
        }
      } else {
        setError(err instanceof Error ? err.message : "Dispatch failed.");
      }
    } finally {
      setLoading(false);
    }
  }

  return (
    <div
      className="rounded-2xl border border-[#232C3D] bg-[#111722] p-5 shadow-xl flex flex-col justify-between"
      style={{ color: "#E6EAF2" }}
    >
      <div>
        {/* Studio Header */}
        <div className="flex items-center justify-between border-b border-[#232C3D] pb-3 mb-4">
          <div className="flex items-center gap-2">
            <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-[#4F8CFF]/15 text-[#4F8CFF]">
              <Zap size={15} />
            </span>
            <div>
              <h3 className="text-xs font-bold uppercase tracking-wider text-[#E6EAF2]">
                Ingestion Simulator Studio
              </h3>
              <p className="text-[10px] text-[#8B949E]">Live HMAC Pipeline Injector</p>
            </div>
          </div>
          <span className="rounded-full border border-[#4F8CFF]/30 bg-[#4F8CFF]/10 px-2 py-0.5 font-mono text-[9px] font-semibold text-[#4F8CFF]">
            MAX 60/MIN
          </span>
        </div>

        {/* Scenario Selection */}
        <div className="space-y-2 mb-4">
          <label className="block text-[11px] font-medium uppercase tracking-wider text-[#8B949E]">
            Outage Scenario
          </label>
          <div className="space-y-1.5">
            {scenarios.map((sc) => (
              <label
                key={sc.id}
                onClick={() => setScenario(sc.id)}
                className={`flex cursor-pointer items-start gap-2.5 rounded-xl border p-2.5 transition-all ${
                  scenario === sc.id
                    ? "border-[#4F8CFF] bg-[#161D2B]"
                    : "border-[#232C3D] bg-[#0A0E14] hover:border-[#8B949E]/40"
                }`}
              >
                <input
                  type="radio"
                  name="scenario"
                  value={sc.id}
                  checked={scenario === sc.id}
                  onChange={() => setScenario(sc.id)}
                  className="mt-0.5 accent-[#4F8CFF]"
                />
                <div className="min-w-0 flex-1">
                  <div className="flex items-center justify-between">
                    <span className="font-mono text-xs font-semibold text-[#E6EAF2]">{sc.name}</span>
                    <span
                      className={`font-mono text-[9px] font-bold ${
                        sc.severity === "CRITICAL" ? "text-[#F85149]" : "text-[#D29922]"
                      }`}
                    >
                      {sc.severity}
                    </span>
                  </div>
                  <p className="mt-0.5 text-[10px] text-[#8B949E] line-clamp-1">{sc.desc}</p>
                </div>
              </label>
            ))}
          </div>
        </div>

        {error && (
          <div className="mb-3 flex items-center gap-2 rounded-xl border border-[#F85149]/40 bg-[#F85149]/10 p-2.5 text-xs text-[#F85149]">
            <AlertCircle size={14} className="shrink-0" />
            <span>{error}</span>
          </div>
        )}

        {/* Dispatch Action Button */}
        {!isOperator ? (
          <button
            type="button"
            onClick={onRequestAuth}
            className="w-full flex items-center justify-center gap-2 rounded-xl border border-[#F0B232]/30 bg-[#F0B232]/10 py-2.5 text-xs font-semibold text-[#F0B232] hover:bg-[#F0B232]/20 transition-all cursor-pointer"
          >
            <Lock size={14} />
            <span>Sign in as demo operator to run the simulator</span>
          </button>
        ) : (
          <button
            type="button"
            onClick={handleDispatch}
            disabled={loading}
            className="w-full flex items-center justify-center gap-2 rounded-xl bg-[#4F8CFF] py-2.5 text-xs font-semibold text-white hover:bg-[#4F8CFF]/90 transition-all disabled:opacity-50 shadow-md shadow-[#4F8CFF]/20 active:scale-[0.99] cursor-pointer"
          >
            {loading ? (
              <>
                <RefreshCw size={14} className="animate-spin" />
                <span>Injecting Live Webhook Pipeline...</span>
              </>
            ) : (
              <>
                <Zap size={14} />
                <span>Dispatch Live Webhook</span>
              </>
            )}
          </button>
        )}
      </div>

      {/* Real Pipeline Timing Tracker */}
      {result && result.pipeline_timings_ms && (
        <div className="mt-4 rounded-xl border border-[#3FB950]/30 bg-[#0A0E14] p-3 text-xs font-mono animate-in fade-in duration-200">
          <div className="flex items-center justify-between border-b border-[#232C3D] pb-1.5 mb-2">
            <span className="flex items-center gap-1.5 text-[11px] font-bold text-[#3FB950]">
              <CheckCircle size={12} />
              <span>Real Execution Verified</span>
            </span>
            <span className="text-[10px] text-[#8B949E]">
              Total: {result.pipeline_timings_ms.total_pipeline_ms}ms
            </span>
          </div>

          <div className="space-y-1 text-[10px] text-[#8B949E]">
            <div className="flex justify-between">
              <span className="text-[#E6EAF2]">1. HMAC Signature:</span>
              <span className="text-[#3FB950] font-bold">
                ✓ {result.pipeline_timings_ms.hmac_verified_ms}ms
              </span>
            </div>
            <div className="flex justify-between">
              <span className="text-[#E6EAF2]">2. Idempotency Check:</span>
              <span className="text-[#3FB950] font-bold">
                ✓ {result.pipeline_timings_ms.dedup_checked_ms}ms
              </span>
            </div>
            <div className="flex justify-between">
              <span className="text-[#E6EAF2]">3. Alert Correlation:</span>
              <span className="text-[#3FB950] font-bold">
                ✓ {result.pipeline_timings_ms.correlated_ms}ms
              </span>
            </div>
            <div className="flex justify-between pt-1 border-t border-[#232C3D]">
              <span className="text-[#8B949E]">Target Incident:</span>
              <span className="text-[#4F8CFF] truncate max-w-[150px]">{result.incident_id}</span>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
