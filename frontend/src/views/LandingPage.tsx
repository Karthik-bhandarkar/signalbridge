import React, { useState } from 'react';
import {
  Activity,
  Shield,
  Layers,
  Database,
  RotateCcw,
  Zap,
  ArrowRight,
  ExternalLink,
  Eye,
  Lock,
  LogIn,
  RefreshCw,
} from 'lucide-react';
import { LivePipelineCard } from '../components/LivePipelineCard';
import type { HealthCheckResponse } from '../types';

interface LandingPageProps {
  onOpenLogin: (preset?: 'viewer' | 'admin') => void;
  onQuickLoginAsViewer: () => void;
  apiDocsUrl?: string;
  health: HealthCheckResponse | null;
  onRefreshHealth: () => void;
  isHealthRefreshing: boolean;
}

// Browser Web Crypto API helper for HMAC-SHA256 simulation
async function calculateHmacSha256(secret: string, message: string): Promise<string> {
  try {
    const enc = new TextEncoder();
    const key = await window.crypto.subtle.importKey(
      'raw',
      enc.encode(secret),
      { name: 'HMAC', hash: 'SHA-256' },
      false,
      ['sign']
    );
    const signature = await window.crypto.subtle.sign('HMAC', key, enc.encode(message));
    const hashArray = Array.from(new Uint8Array(signature));
    return hashArray.map((b) => b.toString(16).padStart(2, '0')).join('');
  } catch (err) {
    console.warn('[HMAC] WebCrypto signature error:', err);
    return 'tampered_signature_fallback';
  }
}

export const LandingPage: React.FC<LandingPageProps> = ({
  onOpenLogin,
  onQuickLoginAsViewer,
  apiDocsUrl = '/api/docs/',
  health,
  onRefreshHealth,
  isHealthRefreshing,
}) => {
  const [simulating, setSimulating] = useState<string | null>(null);
  const [simulationResult, setSimulationResult] = useState<{
    type: 'success' | 'warning' | 'error' | 'info';
    title: string;
    message: string;
    latencyMs?: number;
    status?: number;
  } | null>(null);

  const [activePipelineStage, setActivePipelineStage] = useState<number>(0);

  const runSimulation = async (scenario: 'critical' | 'warning' | 'duplicate' | 'tampered' | 'recovery') => {
    setSimulating(scenario);
    setSimulationResult(null);

    const timestamp = new Date().toISOString();
    const traceId = `pub-sim-${Date.now()}-${Math.floor(Math.random() * 1000)}`;
    const secret = 'secret-token-123';

    let payload: any = {};
    let tampered = false;
    const endpoint = '/api/v1/webhooks/pagerduty/';

    if (scenario === 'critical') {
      payload = {
        event: 'incident.trigger',
        service: 'payment-api',
        title: 'CRITICAL: Database connection pool exhaustion under peak load',
        severity: 'CRITICAL',
        tracking_id: traceId,
        details: { pool_active: 500, pool_limit: 500, waiting_threads: 142 },
        timestamp,
      };
    } else if (scenario === 'warning') {
      payload = {
        event: 'incident.trigger',
        service: 'auth-service',
        title: 'WARNING: Elevated p99 latency detected in OAuth token exchange',
        severity: 'WARNING',
        tracking_id: traceId,
        details: { p99_latency_ms: 382.4, threshold_ms: 200.0 },
        timestamp,
      };
    } else if (scenario === 'duplicate') {
      payload = {
        event: 'incident.trigger',
        service: 'payment-gateway',
        title: 'CRITICAL: Database connection pool exhaustion under peak load',
        severity: 'CRITICAL',
        tracking_id: 'sim-duplicate-fixed-key-001',
        timestamp: '2026-10-26T12:00:00Z',
      };
    } else if (scenario === 'tampered') {
      tampered = true;
      payload = {
        event: 'incident.trigger',
        service: 'hacker-tamper',
        title: 'FORGED: Malicious unauthorized payload injection attempt',
        severity: 'CRITICAL',
        tracking_id: traceId,
        timestamp,
      };
    } else if (scenario === 'recovery') {
      payload = {
        event: 'incident.resolve',
        service: 'payment-gateway',
        title: 'RECOVERY: Database pool recycled, latency returned to normal (14ms)',
        severity: 'LOW',
        tracking_id: traceId,
        timestamp,
      };
    }

    const payloadString = JSON.stringify(payload);
    const signature = tampered
      ? 'sha256=0000000000000000000000000000000000000000000000000000000000000000'
      : `sha256=${await calculateHmacSha256(secret, payloadString)}`;

    const t0 = performance.now();
    try {
      const res = await fetch(endpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Signature-256': signature,
        },
        body: payloadString,
      });

      const t1 = performance.now();
      const latencyMs = Math.round(t1 - t0);
      const data = await res.json().catch(() => ({}));

      if (res.status === 202) {
        setSimulationResult({
          type: 'success',
          title: 'HTTP 202 Accepted — Queued to Celery',
          message: `Webhook verified & accepted in ${latencyMs}ms! Idempotency: ${data.idempotency_hash?.substring(0, 12)}... S3 cold archival initiated.`,
          latencyMs,
          status: 202,
        });
      } else if (res.status === 200 && data.status === 'duplicate_ignored') {
        setSimulationResult({
          type: 'info',
          title: 'HTTP 200 OK — Idempotent Duplicate Ignored',
          message: `Deduplication shield active! Payload matched existing fingerprint without re-alerting.`,
          latencyMs,
          status: 200,
        });
      } else if (res.status === 401) {
        setSimulationResult({
          type: 'warning',
          title: 'HTTP 401 Unauthorized — HMAC Tamper Defense Blocked',
          message: `Cryptographic verification successfully rejected bad signature in ${latencyMs}ms.`,
          latencyMs,
          status: 401,
        });
      } else {
        setSimulationResult({
          type: 'info',
          title: `HTTP ${res.status}`,
          message: data.message || data.error || 'Webhook processed.',
          latencyMs,
          status: res.status,
        });
      }
    } catch (err: any) {
      setSimulationResult({
        type: 'error',
        title: 'Simulation Request Failed',
        message: err.message || 'Network error connecting to ingestion gateway.',
      });
    } finally {
      setSimulating(null);
    }
  };

  const isReady = health?.status === 'ready' || (health?.status as string) === 'healthy';

  const pipelineStages = [
    {
      id: 1,
      title: 'Alert Sources',
      badge: 'Multi-Vendor',
      desc: 'Ingests webhook streams from PagerDuty, Datadog & Grafana',
      icon: Activity,
      color: '#0284c7',
    },
    {
      id: 2,
      title: 'HMAC Gateway',
      badge: '<50ms SLA',
      desc: 'Constant-time SHA-256 cryptographic verification at the perimeter',
      icon: Shield,
      color: '#10b981',
    },
    {
      id: 3,
      title: 'Celery & Redis',
      badge: 'Zero-Loss Buffer',
      desc: 'Row-locked deduplication & automated incident grouping',
      icon: Layers,
      color: '#8b5cf6',
    },
    {
      id: 4,
      title: 'Dual Cold Storage',
      badge: 'AWS Production',
      desc: 'Fast PostgreSQL RDS queries + immutable Amazon S3 JSON archives',
      icon: Database,
      color: '#f59e0b',
    },
  ];

  return (
    <div className="public-landing-container">
      {/* 1. Solid, Crisp Public Top Navigation */}
      <header className="public-navbar">
        <div className="pub-nav-left">
          <div className="pub-brand-logo">
            <Activity size={20} color="#fff" />
          </div>
          <div className="pub-brand-text">
            <span className="pub-brand-name">
              Signal<span style={{ color: '#0284c7' }}>Bridge</span>
            </span>
            <span className="pub-brand-sub">OPERATOR CORE</span>
          </div>

          <div
            className="pub-health-pill"
            onClick={onRefreshHealth}
            title="Click to refresh system readiness probe"
          >
            <span className={`pulse-dot ${isReady ? 'dot-ready' : 'dot-unready'}`} />
            <span className="pub-health-label">
              {isReady ? 'SYSTEM READY' : 'DEGRADED'}
            </span>
            <RefreshCw
              size={11}
              className={isHealthRefreshing ? 'animate-spin' : ''}
              style={{ color: 'var(--text-muted)' }}
            />
          </div>
        </div>

        <div className="pub-nav-right">
          <a
            href={apiDocsUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="btn btn-secondary btn-sm nav-docs-btn"
          >
            <ExternalLink size={13} />
            <span>API Docs</span>
          </a>

          <button
            type="button"
            onClick={onQuickLoginAsViewer}
            className="btn btn-primary btn-sm pub-cta-btn"
          >
            <Eye size={14} />
            <span>Live Demo (1-Click)</span>
          </button>

          <button
            type="button"
            onClick={() => onOpenLogin('admin')}
            className="btn btn-secondary btn-sm"
          >
            <LogIn size={14} />
            <span>Sign In</span>
          </button>
        </div>
      </header>

      {/* 2. Main Centered Hero Layout: Clean Typography, Clear Actions & Telemetry Showcase */}
      <main className="pub-main-content">
        <section className="pub-hero-centered">
          <div className="sb-pill-badge">
            <span className="pulse-ping" />
            <span className="badge-text">v1.2.0 • SRE Ingestion Gateway</span>
            <span className="badge-sep">•</span>
            <span className="badge-sub">Sub-50ms HMAC-SHA256 & Cold S3 Storage</span>
          </div>

          <h1 className="pub-hero-title-centered">
            Stop Alert Storms.{' '}
            <span className="highlight-text-blue">Ingest Webhooks in &lt;50ms.</span>
          </h1>

          <p className="pub-hero-subtitle-centered">
            SignalBridge is an enterprise webhook ingestion engine engineered to eliminate on-call alert fatigue.
            It validates cryptographic HMAC signatures at the perimeter, deduplicates burst floods with distributed
            Redis SHA-256 caching, aggregates cascading alerts into actionable incident cases, and cold-archives
            raw JSON payloads directly to Amazon S3.
          </p>

          {/* Primary Action Buttons */}
          <div className="pub-hero-cta-group">
            <button
              type="button"
              onClick={onQuickLoginAsViewer}
              className="btn btn-primary pub-hero-primary-btn"
            >
              <Eye size={16} />
              <span>Launch Demo Dashboard (1-Click)</span>
            </button>

            <button
              type="button"
              onClick={() => onOpenLogin('admin')}
              className="btn btn-secondary pub-hero-secondary-btn"
            >
              <Lock size={15} />
              <span>Sign In as Admin</span>
            </button>
          </div>

          {/* Pre-configured Credentials Banner */}
          <div className="pub-creds-hint-banner font-mono">
            <span className="hint-pill">Default Accounts:</span>
            <span>Demo Viewer: <strong>viewer / Viewer123!</strong></span>
            <span className="hint-sep">•</span>
            <span>Lead Admin: <strong>admin / Admin123!</strong></span>
          </div>

          {/* SRE Trust Metrics Strip */}
          <div className="pub-hero-metrics-strip">
            <div className="h-metric">
              <span className="h-val font-mono">&lt;45ms</span>
              <span className="h-lbl">P95 Ingestion SLA</span>
            </div>
            <div className="h-sep" />
            <div className="h-metric">
              <span className="h-val font-mono">100%</span>
              <span className="h-lbl">Idempotent Storm Shield</span>
            </div>
            <div className="h-sep" />
            <div className="h-metric">
              <span className="h-val font-mono">Zero-Loss</span>
              <span className="h-lbl">Celery & Redis Buffer</span>
            </div>
            <div className="h-sep" />
            <div className="h-metric">
              <span className="h-val font-mono">Dual-Tier</span>
              <span className="h-lbl">PostgreSQL RDS + S3</span>
            </div>
          </div>

          {/* Full-Width Telemetry & Pipeline Showcase Card */}
          <div className="pub-showcase-container">
            <LivePipelineCard
              onRunSimulation={runSimulation}
              simulationResult={simulationResult}
              simulating={simulating}
              apiDocsUrl={apiDocsUrl}
            />
          </div>
        </section>

        {/* 3. Architecture Pipeline Flow Visualization */}
        <section className="pub-section-card">
          <div className="pipeline-header">
            <div className="pipeline-title">
              <Zap size={16} color="#0284c7" />
              <span>End-to-End Ingestion &amp; Incident Lifecycle</span>
            </div>
            <span className="pipeline-status">
              <span className="pulse-dot dot-ready" /> Verified Local &amp; AWS Deployment
            </span>
          </div>

          <div className="pipeline-grid">
            {pipelineStages.map((stage, idx) => {
              const Icon = stage.icon;
              const isHovered = activePipelineStage === idx;
              return (
                <React.Fragment key={stage.id}>
                  <div
                    className={`pipeline-node ${isHovered ? 'active' : ''}`}
                    onMouseEnter={() => setActivePipelineStage(idx)}
                  >
                    <div className="node-icon-wrapper" style={{ backgroundColor: `${stage.color}15`, color: stage.color }}>
                      <Icon size={20} />
                    </div>
                    <div className="node-content">
                      <div className="node-title-row">
                        <span className="node-title">{stage.title}</span>
                        <span className="node-badge">{stage.badge}</span>
                      </div>
                      <p className="node-desc">{stage.desc}</p>
                    </div>
                  </div>

                  {idx < pipelineStages.length - 1 && (
                    <div className="pipeline-connector">
                      <ArrowRight size={16} />
                    </div>
                  )}
                </React.Fragment>
              );
            })}
          </div>
        </section>

        {/* 4. Four Core Architectural Pillars */}
        <section className="pub-features-grid">
          <div className="spatial-feature-card">
            <div className="spatial-card-icon" style={{ color: '#10b981', background: 'rgba(16, 185, 129, 0.1)' }}>
              <Shield size={20} />
            </div>
            <h3 className="spatial-card-title">Ironclad HMAC Perimeter</h3>
            <p className="spatial-card-desc">
              Constant-time SHA-256 signature verification rejects forged payloads in &lt;50ms before touching persistent storage or database connections.
            </p>
            <div className="spatial-card-tag">Zero-Trust Security</div>
          </div>

          <div className="spatial-feature-card">
            <div className="spatial-card-icon" style={{ color: '#0284c7', background: 'rgba(2, 132, 199, 0.1)' }}>
              <RotateCcw size={20} />
            </div>
            <h3 className="spatial-card-title">Distributed Idempotency</h3>
            <p className="spatial-card-desc">
              SHA-256 canonical payload hashing with Redis deduplication drops storm floods with HTTP 200 responses, eradicating on-call alert fatigue.
            </p>
            <div className="spatial-card-tag">Storm Resilience</div>
          </div>

          <div className="spatial-feature-card">
            <div className="spatial-card-icon" style={{ color: '#8b5cf6', background: 'rgba(139, 92, 246, 0.1)' }}>
              <Layers size={20} />
            </div>
            <h3 className="spatial-card-title">Intelligent Correlation</h3>
            <p className="spatial-card-desc">
              Automatically aggregates cascade alerts into a single actionable incident case based on service, fingerprint, and escalation thresholds.
            </p>
            <div className="spatial-card-tag">Celery Async Engine</div>
          </div>

          <div className="spatial-feature-card">
            <div className="spatial-card-icon" style={{ color: '#f59e0b', background: 'rgba(245, 158, 11, 0.1)' }}>
              <Database size={20} />
            </div>
            <h3 className="spatial-card-title">Amazon S3 Cold Archival</h3>
            <p className="spatial-card-desc">
              Raw incoming webhooks are archived to partitioned Amazon S3 JSON objects for permanent compliance, legal retention, and forensic post-mortems.
            </p>
            <div className="spatial-card-tag">AWS Cloud Storage</div>
          </div>
        </section>

        {/* 5. Bottom Call to Action Banner */}
        <section className="pub-cta-banner">
          <div className="cta-left">
            <h3 className="cta-heading">Ready to explore the Operator Control Room?</h3>
            <p className="cta-sub">
              Log in as Demo Viewer to examine live alert streams and S3 keys, or sign in as Lead Administrator for full SRE operational control.
            </p>
          </div>
          <div className="cta-actions">
            <button
              type="button"
              onClick={onQuickLoginAsViewer}
              className="btn btn-primary"
              style={{ padding: '12px 24px', fontSize: '14px', fontWeight: 600 }}
            >
              <Eye size={16} />
              <span>Launch Demo Dashboard</span>
            </button>
            <button
              type="button"
              onClick={() => onOpenLogin('admin')}
              className="btn btn-secondary"
              style={{ padding: '12px 20px', fontSize: '14px' }}
            >
              <Lock size={15} />
              <span>Operator Sign In</span>
            </button>
          </div>
        </section>
      </main>

      {/* 6. Clean Engineering Footer */}
      <footer className="pub-footer">
        <div className="footer-left">
          <div className="footer-brand">
            <span style={{ fontWeight: 800, fontSize: '14px' }}>
              Signal<span style={{ color: '#0284c7' }}>Bridge</span>
            </span>
            <span style={{ fontSize: '11px', color: 'var(--text-muted)', marginLeft: '8px' }}>
              Production SRE Webhook Ingestion Engine
            </span>
          </div>
        </div>

        <div className="footer-right font-mono" style={{ fontSize: '12px', color: 'var(--text-muted)' }}>
          <span>PostgreSQL 16</span> • <span>Redis 7</span> • <span>Celery Worker</span> • <span>Amazon S3</span>
        </div>
      </footer>
    </div>
  );
};
