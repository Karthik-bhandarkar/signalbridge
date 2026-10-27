import React, { useState } from 'react';
import {
  Shield,
  CheckCircle,
  AlertOctagon,
  RotateCcw,
  ExternalLink,
} from 'lucide-react';

interface LivePipelineCardProps {
  onRunSimulation?: (scenario: 'critical' | 'warning' | 'duplicate' | 'tampered' | 'recovery') => void;
  simulationResult?: {
    type: 'success' | 'warning' | 'error' | 'info';
    title: string;
    message: string;
    latencyMs?: number;
    status?: number;
  } | null;
  simulating?: string | null;
  apiDocsUrl?: string;
}

export const LivePipelineCard: React.FC<LivePipelineCardProps> = ({
  onRunSimulation,
  simulationResult,
  simulating: _simulating,
  apiDocsUrl = '/api/docs/',
}) => {
  const [activeTab, setActiveTab] = useState<'critical' | 'duplicate' | 'tampered' | 'recovery'>('critical');

  const scenarios = {
    critical: {
      title: 'Database Connection Pool Exhaustion',
      vendor: 'PagerDuty',
      severity: 'CRITICAL',
      status: '202 Accepted',
      color: '#e11d48',
      payload: {
        event: 'incident.trigger',
        service: 'payment-api',
        severity: 'CRITICAL',
        tracking_id: 'trace-89241',
        details: { pool_active: 500, pool_limit: 500, waiting_threads: 142 },
        s3_key: 'archives/pagerduty/2026/10/27/e12c-critical.json',
      },
    },
    duplicate: {
      title: 'Duplicate Storm Alert Surge',
      vendor: 'PagerDuty',
      severity: 'HIGH',
      status: '200 Duplicate Ignored',
      color: '#0284c7',
      payload: {
        event: 'incident.trigger',
        service: 'payment-api',
        severity: 'HIGH',
        tracking_id: 'sim-duplicate-fixed-key-001',
        fingerprint_hash: '3f594b613acbb3fb22f6b40d458f4704',
        action: 'Deduplicated by Redis 10m TTL — No Alert Fatigue',
      },
    },
    tampered: {
      title: 'Forged / Tampered Webhook Attack',
      vendor: 'Hacker Injection',
      severity: 'SECURITY',
      status: '401 Unauthorized',
      color: '#dc2626',
      payload: {
        event: 'incident.trigger',
        service: 'hacker-tamper',
        signature: 'sha256=00000000000000000000000000000000',
        action: 'Constant-time HMAC check failed — Dropped at edge',
      },
    },
    recovery: {
      title: 'Service Health Auto-Recovery',
      vendor: 'PagerDuty',
      severity: 'LOW',
      status: '200 Resolved',
      color: '#059669',
      payload: {
        event: 'incident.resolve',
        service: 'payment-api',
        severity: 'LOW',
        action: 'Incident state transitioned from OPEN -> RESOLVED',
        resolution_notes: 'Connection ceiling increased. Latency normalized.',
      },
    },
  };

  const currentScenario = scenarios[activeTab];

  const handleTriggerScenario = (key: 'critical' | 'duplicate' | 'tampered' | 'recovery') => {
    setActiveTab(key);
    if (onRunSimulation) {
      onRunSimulation(key);
    }
  };

  return (
    <div className="live-pipeline-card">
      {/* 1. Header Bar with Real Status */}
      <div className="pipeline-card-topbar">
        <div className="topbar-left">
          <div className="status-indicator">
            <span className="pulse-ping" />
            <span className="pulse-dot dot-ready" />
          </div>
          <span className="topbar-title font-mono">INGESTION GATEWAY TELEMETRY</span>
          <span className="pill-tag font-mono" style={{ fontSize: '10px', background: 'rgba(2, 132, 199, 0.1)', color: '#0284c7' }}>
            HTTP/2 &bull; TLS 1.3
          </span>
        </div>

        <div className="topbar-right">
          <a
            href={apiDocsUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="topbar-link"
          >
            <ExternalLink size={12} />
            <span>OpenAPI Schema</span>
          </a>
        </div>
      </div>

      {/* 2. Scenario Switcher Tabs */}
      <div className="pipeline-scenario-tabs">
        <button
          type="button"
          onClick={() => handleTriggerScenario('critical')}
          className={`scenario-tab ${activeTab === 'critical' ? 'active tab-critical' : ''}`}
        >
          <AlertOctagon size={13} />
          <span>P1 Database Exhaustion</span>
        </button>

        <button
          type="button"
          onClick={() => handleTriggerScenario('duplicate')}
          className={`scenario-tab ${activeTab === 'duplicate' ? 'active tab-duplicate' : ''}`}
        >
          <RotateCcw size={13} />
          <span>Duplicate Storm (200)</span>
        </button>

        <button
          type="button"
          onClick={() => handleTriggerScenario('tampered')}
          className={`scenario-tab ${activeTab === 'tampered' ? 'active tab-tampered' : ''}`}
        >
          <Shield size={13} />
          <span>HMAC Tamper (401)</span>
        </button>

        <button
          type="button"
          onClick={() => handleTriggerScenario('recovery')}
          className={`scenario-tab ${activeTab === 'recovery' ? 'active tab-recovery' : ''}`}
        >
          <CheckCircle size={13} />
          <span>Auto-Recovery</span>
        </button>
      </div>

      {/* 3. Live 4-Stage Architectural Flow Diagram */}
      <div className="pipeline-flow-strip">
        <div className="flow-step active-step">
          <div className="step-num">1</div>
          <div className="step-info">
            <span className="step-name">Ingress</span>
            <span className="step-sub">{currentScenario.vendor}</span>
          </div>
        </div>

        <div className="flow-connector" />

        <div className={`flow-step ${activeTab === 'tampered' ? 'step-error' : 'active-step'}`}>
          <div className="step-num">2</div>
          <div className="step-info">
            <span className="step-name">HMAC Check</span>
            <span className="step-sub">&lt;45ms SLA</span>
          </div>
        </div>

        <div className="flow-connector" />

        <div className={`flow-step ${activeTab === 'duplicate' ? 'step-highlight' : 'active-step'}`}>
          <div className="step-num">3</div>
          <div className="step-info">
            <span className="step-name">Redis Dedup</span>
            <span className="step-sub">SHA-256 Filter</span>
          </div>
        </div>

        <div className="flow-connector" />

        <div className="flow-step active-step">
          <div className="step-num">4</div>
          <div className="step-info">
            <span className="step-name">Celery &amp; S3</span>
            <span className="step-sub">Dual Archival</span>
          </div>
        </div>
      </div>

      {/* 4. Terminal Payload Inspector Window */}
      <div className="pipeline-terminal">
        <div className="terminal-header">
          <div className="terminal-dots">
            <span className="tdot tdot-red" />
            <span className="tdot tdot-yellow" />
            <span className="tdot tdot-green" />
          </div>
          <span className="terminal-title font-mono">
            POST /api/v1/webhooks/{currentScenario.vendor.toLowerCase()}/ &bull; X-Signature-256 verified
          </span>
          <span className="terminal-status-badge font-mono" style={{ borderColor: currentScenario.color, color: currentScenario.color }}>
            {currentScenario.status}
          </span>
        </div>

        <pre className="terminal-code font-mono">
          <code>{JSON.stringify(currentScenario.payload, null, 2)}</code>
        </pre>
      </div>

      {/* 5. Live Simulation Feedback Toast / Trigger Button */}
      <div className="pipeline-action-bar">
        {simulationResult ? (
          <div className={`pipeline-result-toast toast-${simulationResult.type}`}>
            <div className="toast-content">
              {simulationResult.type === 'success' && <CheckCircle size={15} className="text-emerald-500" />}
              {simulationResult.type === 'warning' && <Shield size={15} className="text-rose-500" />}
              {simulationResult.type === 'info' && <RotateCcw size={15} className="text-sky-500" />}
              {simulationResult.type === 'error' && <AlertOctagon size={15} className="text-rose-500" />}
              <span className="result-text">{simulationResult.title} &mdash; {simulationResult.message}</span>
            </div>
            {simulationResult.latencyMs !== undefined && (
              <span className="result-latency font-mono">⚡ {simulationResult.latencyMs}ms</span>
            )}
          </div>
        ) : (
          <div className="pipeline-default-note font-mono">
            <span>Click any scenario tab above to dispatch real HMAC webhooks to the local backend.</span>
          </div>
        )}
      </div>

      {/* 6. High-Trust Architecture Highlights Footer */}
      <div className="pipeline-telemetry-strip">
        <div className="telemetry-item">
          <span className="t-val font-mono">&lt;45ms</span>
          <span className="t-label">P95 Ingestion SLA</span>
        </div>
        <div className="t-sep" />
        <div className="telemetry-item">
          <span className="t-val font-mono">100%</span>
          <span className="t-label">Idempotent Storm Shield</span>
        </div>
        <div className="t-sep" />
        <div className="telemetry-item">
          <span className="t-val font-mono">Dual-Tier</span>
          <span className="t-label">PostgreSQL RDS + S3</span>
        </div>
      </div>
    </div>
  );
};
