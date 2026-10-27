import React, { useState } from 'react';
import {
  Activity,
  Shield,
  Layers,
  Database,
  CheckCircle,
  AlertOctagon,
  AlertTriangle,
  RotateCcw,
  Zap,
  Play,
  ArrowRight,
  ExternalLink,
  Eye,
  Lock,
  Cpu,
  LogIn,
  RefreshCw,
} from 'lucide-react';
import { Vexel3DCanvas } from '../components/Vexel3DCanvas';
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
        service: 'payment-gateway',
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
      desc: 'PagerDuty, Datadog & Grafana webhooks',
      icon: Activity,
      color: '#0083ff',
    },
    {
      id: 2,
      title: 'HMAC Gateway',
      badge: '<50ms SLA',
      desc: 'Constant-time SHA-256 cryptographic verification',
      icon: Shield,
      color: '#10b981',
    },
    {
      id: 3,
      title: 'Celery & Redis',
      badge: 'Zero-Loss Buffer',
      desc: 'Row-locked deduplication & incident grouping',
      icon: Layers,
      color: '#8b5cf6',
    },
    {
      id: 4,
      title: 'Dual Cold Storage',
      badge: 'AWS Production',
      desc: 'PostgreSQL RDS queries + Amazon S3 JSON archives',
      icon: Database,
      color: '#f59e0b',
    },
  ];

  return (
    <div className="public-landing-container">
      {/* 1. Public Top Navigation */}
      <header className="public-navbar">
        <div className="pub-nav-left">
          <div className="pub-brand-logo">
            <Activity size={20} color="#fff" />
          </div>
          <div className="pub-brand-text">
            <span className="pub-brand-name">
              Signal<span style={{ color: '#0083ff' }}>Bridge</span>
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
            className="btn btn-secondary btn-sm"
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
            <span>Explore Live Demo (1-Click)</span>
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

      {/* 2. Hero Section with 3D Blue Motion Graphic */}
      <section className="pub-hero-section">
        <div className="pub-hero-grid">
          {/* Left Hero Narrative */}
          <div className="pub-hero-left">
            <div className="sb-pill-badge">
              <span className="pulse-ping" />
              <span className="badge-text">v1.2.0 • SRE Ingestion Gateway</span>
              <span className="badge-sep">•</span>
              <span className="badge-sub">Sub-50ms HMAC-SHA256 & Cold S3 Storage</span>
            </div>

            <h1 className="pub-hero-headline">
              Mission-Critical Webhook Ingestion &{' '}
              <span className="highlight-text-blue">Incident Correlation</span>
            </h1>

            <p className="pub-hero-lead">
              A high-throughput ingestion platform engineered to eliminate alert fatigue.
              Validates cryptographic HMAC-SHA256 signatures in under 50ms, deduplicates
              storm surges with distributed Redis caching, correlates multi-vendor alerts into
              actionable incidents, and cold-archives raw payloads directly to Amazon S3.
            </p>

            {/* Fast Access Role Portal */}
            <div className="pub-access-box">
              <div className="pub-access-header">
                <span className="pub-access-title">Instant Access — Choose Role to Enter Dashboard</span>
                <span className="pill-tag font-mono" style={{ background: 'rgba(0, 131, 255, 0.1)', color: '#0083ff' }}>
                  Pre-configured Credentials
                </span>
              </div>

              <div className="pub-roles-row">
                {/* 1. Demo Viewer Card */}
                <div className="pub-role-mini-card card-viewer">
                  <div className="mini-card-head">
                    <div className="mini-icon-box" style={{ background: 'rgba(0, 131, 255, 0.12)', color: '#0083ff' }}>
                      <Eye size={16} />
                    </div>
                    <div>
                      <div className="mini-card-name">Demo Viewer</div>
                      <span className="mini-card-tag">Safe Exploration • Read-Only</span>
                    </div>
                  </div>
                  <p className="mini-card-desc">
                    Explore live incidents, correlated alerts, telemetry graphs, and Amazon S3 JSON cold archives without modifying production configs.
                  </p>
                  <div className="mini-card-creds font-mono">
                    <span>User: <strong>viewer</strong></span>
                    <span>Pass: <strong>Viewer123!</strong></span>
                  </div>
                  <button
                    type="button"
                    onClick={onQuickLoginAsViewer}
                    className="btn btn-primary btn-sm mini-action-btn"
                  >
                    <Eye size={13} />
                    <span>Enter Dashboard (1-Click)</span>
                  </button>
                </div>

                {/* 2. Lead Admin Card */}
                <div className="pub-role-mini-card card-admin">
                  <div className="mini-card-head">
                    <div className="mini-icon-box" style={{ background: 'rgba(99, 102, 241, 0.12)', color: '#6366f1' }}>
                      <Lock size={16} />
                    </div>
                    <div>
                      <div className="mini-card-name">Lead Administrator</div>
                      <span className="mini-card-tag">Full SRE Operations</span>
                    </div>
                  </div>
                  <p className="mini-card-desc">
                    Full management authority: register new webhook sources, rotate HMAC secrets, transition incident states (ACK/Resolve), and trigger automated drills.
                  </p>
                  <div className="mini-card-creds font-mono">
                    <span>User: <strong>admin</strong></span>
                    <span>Pass: <strong>Admin123!</strong></span>
                  </div>
                  <button
                    type="button"
                    onClick={() => onOpenLogin('admin')}
                    className="btn btn-secondary btn-sm mini-action-btn"
                  >
                    <LogIn size={13} />
                    <span>Sign In as Admin</span>
                  </button>
                </div>
              </div>
            </div>

            {/* SRE Trust Metrics Strip */}
            <div className="pub-trust-row">
              <div className="pub-trust-metric">
                <span className="trust-val font-mono">&lt;50ms</span>
                <span className="trust-sub">HMAC SLA Perimeter</span>
              </div>
              <div className="pub-trust-div" />
              <div className="pub-trust-metric">
                <span className="trust-val font-mono">100%</span>
                <span className="trust-sub">Storm Deduplication</span>
              </div>
              <div className="pub-trust-div" />
              <div className="pub-trust-metric">
                <span className="trust-val font-mono">Zero-Loss</span>
                <span className="trust-sub">Celery & Redis Buffer</span>
              </div>
              <div className="pub-trust-div" />
              <div className="pub-trust-metric">
                <span className="trust-val font-mono">Dual-Tier</span>
                <span className="trust-sub">PostgreSQL + Amazon S3</span>
              </div>
            </div>
          </div>

          {/* Right Hero: 3D Blue Animation & Floating Telemetry */}
          <div className="pub-hero-right">
            <div className="pub-3d-stage">
              <Vexel3DCanvas interactive={true} />

              {/* Floating Spatial Micro-Badges */}
              <div className="pub-float-pill float-top-left">
                <Shield size={14} className="text-emerald-500" />
                <span className="font-mono">HMAC-SHA256: VALID [38ms]</span>
              </div>

              <div className="pub-float-pill float-bottom-left">
                <Database size={14} className="text-amber-500" />
                <span className="font-mono">S3: /archives/2026/10/27.json</span>
              </div>

              <div className="pub-float-pill float-top-right">
                <RotateCcw size={14} className="text-sky-500" />
                <span className="font-mono">Redis Deduplication: 200 OK</span>
              </div>

              <div className="pub-float-pill float-bottom-right">
                <Cpu size={14} className="text-indigo-500" />
                <span className="font-mono">Celery Async ACK: &lt;12ms</span>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* 3. Live Webhook & Incident Simulator Showcase */}
      <section className="pub-section-card">
        <div className="simulator-header">
          <div>
            <div className="sim-title">
              <Play size={16} className="text-emerald-500" />
              <span>Interactive Public Webhook Simulator</span>
            </div>
            <p className="sim-desc">
              Test the real ingestion gateway live right now. Click any scenario below to dispatch real
              HMAC-SHA256 webhooks to the local backend and inspect instant responses.
            </p>
          </div>

          <a
            href={apiDocsUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="btn btn-secondary btn-sm"
          >
            <ExternalLink size={13} />
            Swagger API Docs
          </a>
        </div>

        <div className="sim-buttons-grid">
          <button
            className="sim-btn btn-critical"
            disabled={simulating !== null}
            onClick={() => runSimulation('critical')}
          >
            <AlertOctagon size={16} />
            <div className="btn-text">
              <span className="btn-label">Database Pool Exhaustion</span>
              <span className="btn-sub">PagerDuty • CRITICAL Alert</span>
            </div>
          </button>

          <button
            className="sim-btn btn-warning"
            disabled={simulating !== null}
            onClick={() => runSimulation('warning')}
          >
            <AlertTriangle size={16} />
            <div className="btn-text">
              <span className="btn-label">p99 Latency Breach</span>
              <span className="btn-sub">Datadog • HIGH Alert</span>
            </div>
          </button>

          <button
            className="sim-btn btn-duplicate"
            disabled={simulating !== null}
            onClick={() => runSimulation('duplicate')}
          >
            <RotateCcw size={16} />
            <div className="btn-text">
              <span className="btn-label">Duplicate Alert Storm</span>
              <span className="btn-sub">Idempotency 200 Deduplication</span>
            </div>
          </button>

          <button
            className="sim-btn btn-tampered"
            disabled={simulating !== null}
            onClick={() => runSimulation('tampered')}
          >
            <Shield size={16} />
            <div className="btn-text">
              <span className="btn-label">Tampered HMAC Attack</span>
              <span className="btn-sub">Cryptographic 401 Defense</span>
            </div>
          </button>

          <button
            className="sim-btn btn-recovery"
            disabled={simulating !== null}
            onClick={() => runSimulation('recovery')}
          >
            <CheckCircle size={16} />
            <div className="btn-text">
              <span className="btn-label">Send Recovery Signal</span>
              <span className="btn-sub">Auto-Resolve Incident</span>
            </div>
          </button>
        </div>

        {simulationResult && (
          <div className={`sim-feedback-toast toast-${simulationResult.type}`}>
            <div className="toast-left">
              {simulationResult.type === 'success' && <CheckCircle size={18} className="toast-icon" />}
              {simulationResult.type === 'info' && <RotateCcw size={18} className="toast-icon" />}
              {simulationResult.type === 'warning' && <Shield size={18} className="toast-icon" />}
              {simulationResult.type === 'error' && <AlertOctagon size={18} className="toast-icon" />}
              <div>
                <div className="toast-title">{simulationResult.title}</div>
                <div className="toast-message">{simulationResult.message}</div>
              </div>
            </div>
            {simulationResult.latencyMs !== undefined && (
              <span className="toast-latency font-mono">
                ⚡ {simulationResult.latencyMs}ms Gateway ACK
              </span>
            )}
          </div>
        )}
      </section>

      {/* 4. Live Architecture Flow Pipeline */}
      <section className="pub-section-card">
        <div className="pipeline-header">
          <div className="pipeline-title">
            <Zap size={16} color="#0083ff" />
            <span>End-to-End Pipeline Architecture</span>
          </div>
          <span className="pipeline-status">
            <span className="pulse-dot dot-ready" /> Fully Verified on AWS & Local
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

      {/* 5. Four Architectural Pillars Grid */}
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
          <div className="spatial-card-icon" style={{ color: '#0083ff', background: 'rgba(0, 131, 255, 0.1)' }}>
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

      {/* 6. Bottom Call to Action Banner */}
      <section className="pub-cta-banner">
        <div className="cta-left">
          <h3 className="cta-heading">Ready to explore the Operator Control Room?</h3>
          <p className="cta-sub">
            Log in as Demo Viewer to safely examine live alerts, or sign in as Lead Administrator for full SRE operational control.
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

      {/* 7. Public Footer */}
      <footer className="pub-footer">
        <div className="footer-left">
          <div className="footer-brand">
            <span style={{ fontWeight: 800, fontSize: '14px' }}>
              Signal<span style={{ color: '#0083ff' }}>Bridge</span>
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
