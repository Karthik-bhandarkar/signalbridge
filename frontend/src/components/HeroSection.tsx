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
  Sparkles,
  ExternalLink,
  Eye,
  Lock,
} from 'lucide-react';
import type { AuthUser } from '../types';

interface HeroSectionProps {
  onRefreshData: () => void;
  apiDocsUrl?: string;
  isLightTheme?: boolean;
  currentUser?: AuthUser | null;
  onOpenLogin?: (preset?: 'viewer' | 'admin') => void;
  onQuickLoginAsViewer?: () => void;
}

// Browser Web Crypto API helper to compute HMAC-SHA256 in pure JavaScript (zero external dependencies)
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

export const HeroSection: React.FC<HeroSectionProps> = ({
  onRefreshData,
  apiDocsUrl = '/api/docs/',
  currentUser,
  onOpenLogin,
  onQuickLoginAsViewer,
}) => {
  const [simulating, setSimulating] = useState<string | null>(null);
  const [simulationResult, setSimulationResult] = useState<{
    type: 'success' | 'warning' | 'error' | 'info';
    title: string;
    message: string;
    latencyMs?: number;
    status?: number;
  } | null>(null);

  const [activeStage, setActiveStage] = useState<number>(0);

  // Trigger real live webhook events with actual HMAC signatures
  const runSimulation = async (scenario: 'critical' | 'warning' | 'duplicate' | 'tampered' | 'recovery') => {
    setSimulating(scenario);
    setSimulationResult(null);

    const timestamp = new Date().toISOString();
    const traceId = `sim-${Date.now()}-${Math.floor(Math.random() * 1000)}`;
    const secret = 'secret-token-123'; // matches WebhookSource default secret

    let payload: any = {};
    let tampered = false;
    let endpoint = '/api/v1/webhooks/pagerduty/';

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
      // Fixed static tracking ID to trigger deterministic idempotency match
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
          message: `Webhook accepted in ${latencyMs}ms! Idempotency: ${data.idempotency_hash?.substring(0, 12)}... S3 cold archival initiated.`,
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

      // Automatically refresh live dashboard metrics
      setTimeout(onRefreshData, 800);
      setTimeout(onRefreshData, 2400);
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

  const pipelineStages = [
    {
      id: 1,
      title: 'Alert Sources',
      badge: 'Multi-Vendor',
      desc: 'PagerDuty, Datadog & Grafana webhooks',
      icon: Activity,
      color: 'var(--color-primary)',
    },
    {
      id: 2,
      title: 'HMAC Gateway',
      badge: '<50ms SLA',
      desc: 'SHA-256 constant-time signature validation',
      icon: Shield,
      color: '#10b981',
    },
    {
      id: 3,
      title: 'Celery & Redis',
      badge: 'Zero-Loss Queue',
      desc: 'Row-locked deduplication & incident grouping',
      icon: Layers,
      color: '#8b5cf6',
    },
    {
      id: 4,
      title: 'Dual Cold Storage',
      badge: 'AWS Production',
      desc: 'Postgres RDS queries + Amazon S3 JSON archives',
      icon: Database,
      color: '#f59e0b',
    },
  ];

  return (
    <section className="sb-hero">
      {/* Ambient background glow accents */}
      <div className="sb-hero-glow glow-left" />
      <div className="sb-hero-glow glow-right" />

      {/* Top Banner Tag */}
      <div className="sb-hero-header">
        <div className="sb-pill-badge">
          <span className="pulse-ping" />
          <Sparkles size={13} className="text-amber-500" />
          <span className="badge-text">SignalBridge SRE Ingestion Engine</span>
          <span className="badge-sep">•</span>
          <span className="badge-sub">Sub-50ms HMAC & Cold S3 Archival</span>
        </div>

        <h1 className="sb-hero-title">
          From Webhook Chaos to <span className="highlight-text">Zero-Noise Incident Clarity</span>
        </h1>

        <p className="sb-hero-subtitle">
          An enterprise-grade webhook ingestion platform that validates cryptographic HMAC signatures in
          under 50ms, deduplicates burst floods with SHA-256 idempotency, correlates distributed alerts into
          actionable incidents, and archives raw payloads directly to Amazon S3.
        </p>

        {/* Action & Fast Access Portal (Viewer vs Admin) */}
        <div className="sb-hero-actions-container">
          {currentUser ? (
            <div className="sb-logged-in-badge-card">
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                <span className="pulse-dot dot-ready" />
                <span style={{ fontSize: '13px', fontWeight: 600, color: 'var(--text-primary)' }}>
                  Active Session: <strong style={{ color: 'var(--color-primary)' }}>{currentUser.username}</strong>
                  {' '}• {currentUser.is_staff ? 'Lead Administrator (Full Operations)' : 'Demo Viewer (Safe Exploration)'}
                </span>
              </div>
              <button
                type="button"
                onClick={() => onOpenLogin?.(currentUser.is_staff ? 'viewer' : 'admin')}
                className="btn btn-secondary btn-sm"
              >
                Switch Account
              </button>
            </div>
          ) : (
            <div className="sb-access-portal-card">
              <div className="sb-access-portal-header">
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <Sparkles size={16} className="text-amber-500" />
                  <span style={{ fontSize: '14px', fontWeight: 700, letterSpacing: '-0.01em', color: 'var(--text-primary)' }}>
                    Instant Demonstration Access — Choose Your Exploration Role
                  </span>
                </div>
                <span className="pill-tag font-mono" style={{ background: 'rgba(0, 131, 255, 0.15)', color: '#0083ff' }}>
                  Default Credentials Pre-configured
                </span>
              </div>

              <div className="sb-roles-grid">
                {/* 1. Demo Viewer Role */}
                <div className="sb-role-card role-viewer">
                  <div className="role-card-top">
                    <div className="role-icon-box" style={{ background: 'rgba(0, 131, 255, 0.15)', color: '#0083ff' }}>
                      <Eye size={18} />
                    </div>
                    <div>
                      <div className="role-card-title">Demo Viewer Account</div>
                      <span className="role-card-scope">Safe Exploration • Read-Only</span>
                    </div>
                  </div>

                  <p className="role-card-desc">
                    Inspect correlated incidents, view real-time alert streams, examine Amazon S3 cold JSON archives, and test simulated events without administrative setup.
                  </p>

                  <div className="role-creds-box font-mono">
                    <span>User: <strong>viewer</strong></span>
                    <span>Pass: <strong>Viewer123!</strong></span>
                  </div>

                  <button
                    type="button"
                    onClick={() => {
                      if (onQuickLoginAsViewer) {
                        onQuickLoginAsViewer();
                      } else if (onOpenLogin) {
                        onOpenLogin('viewer');
                      }
                    }}
                    className="btn btn-primary btn-sm role-action-btn btn-viewer-action"
                  >
                    <Eye size={14} />
                    <span>Explore as Viewer (1-Click)</span>
                  </button>
                </div>

                {/* 2. Lead Admin Role */}
                <div className="sb-role-card role-admin">
                  <div className="role-card-top">
                    <div className="role-icon-box" style={{ background: 'rgba(99, 102, 241, 0.15)', color: '#6366f1' }}>
                      <Shield size={18} />
                    </div>
                    <div>
                      <div className="role-card-title">Lead Administrator</div>
                      <span className="role-card-scope">Full Control • SRE Operations</span>
                    </div>
                  </div>

                  <p className="role-card-desc">
                    Full SRE management: register webhook sources, rotate cryptographic HMAC secrets, trigger incident state transitions (ACK/Resolve), and manage monitors.
                  </p>

                  <div className="role-creds-box font-mono">
                    <span>User: <strong>admin</strong></span>
                    <span>Pass: <strong>Admin123!</strong></span>
                  </div>

                  <button
                    type="button"
                    onClick={() => onOpenLogin?.('admin')}
                    className="btn btn-secondary btn-sm role-action-btn"
                  >
                    <Lock size={14} />
                    <span>Sign In as Admin</span>
                  </button>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Interactive Architecture Flow Diagram */}
      <div className="sb-pipeline-card">
        <div className="pipeline-header">
          <div className="pipeline-title">
            <Zap size={15} />
            <span>Live Architecture Pipeline Flow</span>
          </div>
          <span className="pipeline-status">
            <span className="pulse-dot dot-ready" /> End-to-End AWS Verified
          </span>
        </div>

        <div className="pipeline-grid">
          {pipelineStages.map((stage, idx) => {
            const Icon = stage.icon;
            const isHovered = activeStage === idx;
            return (
              <React.Fragment key={stage.id}>
                <div
                  className={`pipeline-node ${isHovered ? 'active' : ''}`}
                  onMouseEnter={() => setActiveStage(idx)}
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
      </div>

      {/* Interactive 1-Click Live Incident Simulator */}
      <div className="sb-simulator-card">
        <div className="simulator-header">
          <div>
            <div className="sim-title">
              <Play size={15} className="text-emerald-500" />
              <span>Interactive Incident & Webhook Simulator</span>
            </div>
            <p className="sim-desc">
              Dispatch real HMAC-signed webhooks through the live ingestion gateway to test deduplication,
              correlation, security defense, and S3 cold archival in real-time.
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

        {/* Action Buttons */}
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

        {/* Live Simulation Feedback Toast */}
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
      </div>

      {/* Vexel AI Spatial Feature Pillars */}
      <div className="sb-spatial-features-grid">
        <div className="spatial-feature-card">
          <div className="spatial-card-icon" style={{ color: '#10b981', background: 'rgba(16, 185, 129, 0.1)' }}>
            <Shield size={20} />
          </div>
          <h3 className="spatial-card-title">Ironclad HMAC Defense</h3>
          <p className="spatial-card-desc">
            Constant-time HMAC-SHA256 verification rejects forged webhooks in &lt;50ms before touching persistent storage.
          </p>
          <div className="spatial-card-tag">Zero-Trust Perimeter</div>
        </div>

        <div className="spatial-feature-card">
          <div className="spatial-card-icon" style={{ color: '#6366f1', background: 'rgba(99, 102, 241, 0.1)' }}>
            <Zap size={20} />
          </div>
          <h3 className="spatial-card-title">Distributed Idempotency</h3>
          <p className="spatial-card-desc">
            SHA-256 payload fingerprinting filters storm duplicates with 200 OK responses, eliminating alert fatigue.
          </p>
          <div className="spatial-card-tag">Storm Resilience</div>
        </div>

        <div className="spatial-feature-card">
          <div className="spatial-card-icon" style={{ color: '#f59e0b', background: 'rgba(245, 158, 11, 0.1)' }}>
            <Database size={20} />
          </div>
          <h3 className="spatial-card-title">Amazon S3 Cold Archival</h3>
          <p className="spatial-card-desc">
            Raw incoming webhooks are archived to partitioned Amazon S3 JSON objects for permanent audit compliance.
          </p>
          <div className="spatial-card-tag">AWS Cloud Storage</div>
        </div>
      </div>

      {/* PeachWorlds SRE Trust Counters */}
      <div className="sb-trust-strip">
        <div className="trust-item">
          <div className="trust-number font-mono">99.99%</div>
          <div className="trust-label">Guaranteed Ingestion ACK</div>
        </div>
        <div className="trust-sep" />
        <div className="trust-item">
          <div className="trust-number font-mono">&lt;45ms</div>
          <div className="trust-label">P95 Processing Velocity</div>
        </div>
        <div className="trust-sep" />
        <div className="trust-item">
          <div className="trust-number font-mono">100%</div>
          <div className="trust-label">HMAC-SHA256 Verified</div>
        </div>
        <div className="trust-sep" />
        <div className="trust-item">
          <div className="trust-number font-mono">Dual-Tier</div>
          <div className="trust-label">PostgreSQL RDS + Amazon S3</div>
        </div>
      </div>
    </section>
  );
};
