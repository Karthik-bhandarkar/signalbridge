import React, { useEffect, useState, useCallback } from 'react';
import {
  Plus,
  Copy,
  Check,
  RotateCw,
  RefreshCw,
  X,
  Eye,
  EyeOff,
} from 'lucide-react';
import { api } from '../lib/api';
import { useToast } from '../context/ToastContext';
import type { WebhookSource, IngestionMetric } from '../types';

export const IntegrationsView: React.FC = () => {
  const { toast, confirm } = useToast();
  const [sources, setSources] = useState<WebhookSource[]>([]);
  const [metrics, setMetrics] = useState<Record<string, IngestionMetric>>({});
  const [loading, setLoading] = useState(true);

  // Secret display toggles:
  const [visibleSecrets, setVisibleSecrets] = useState<Record<string, boolean>>({});
  const [copiedId, setCopiedId] = useState<string | null>(null);

  // New integration modal:
  const [showNewModal, setShowNewModal] = useState(false);
  const [name, setName] = useState('');
  const [slug, setSlug] = useState('');
  const [rateLimit, setRateLimit] = useState(120);

  const loadSources = useCallback(async () => {
    try {
      setLoading(true);
      const [sourcesData, metricsData] = await Promise.all([
        api.integrations.list(),
        api.analytics.metrics({ limit: 100 }).catch((err) => {
          console.warn('[IntegrationsView] Failed to fetch metrics:', err);
          return [];
        }),
      ]);
      setSources(sourcesData || []);
      const latestMap: Record<string, IngestionMetric> = {};
      (metricsData || []).forEach((m) => {
        if (!latestMap[m.source_slug]) {
          latestMap[m.source_slug] = m;
        }
      });
      setMetrics(latestMap);
    } catch (err) {
      console.error('[IntegrationsView] Error loading webhook sources:', err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadSources();
  }, [loadSources]);

  const toggleSecret = (id: string) => {
    setVisibleSecrets((prev) => ({ ...prev, [id]: !prev[id] }));
  };

  const copySecret = (id: string, secret: string) => {
    navigator.clipboard.writeText(secret);
    setCopiedId(id);
    toast.info('Secret copied to clipboard', 2000);
    setTimeout(() => setCopiedId(null), 2000);
  };

  const handleToggleActive = async (source: WebhookSource) => {
    try {
      await api.integrations.patch(source.id, { is_active: !source.is_active });
      toast.success(`Source '${source.name}' ${source.is_active ? 'deactivated' : 'activated'}`);
      await loadSources();
    } catch (err: any) {
      toast.error(`Toggle failed: ${err.message}`);
    }
  };

  const handleRotateSecret = (id: string, name: string) => {
    confirm({
      title: 'Rotate HMAC Secret Key',
      message: `Are you sure you want to rotate the HMAC secret key for '${name}'? Existing webhook senders must be updated immediately with the new secret.`,
      confirmText: 'Rotate Secret',
      isDanger: true,
      onConfirm: async () => {
        try {
          await api.integrations.regenerateSecret(id);
          toast.success(`Secret key for '${name}' regenerated successfully`);
          await loadSources();
        } catch (err: any) {
          toast.error(`Secret rotation failed: ${err.message}`);
        }
      },
    });
  };

  const handleCreateSource = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await api.integrations.create({
        name,
        slug: slug || name.toLowerCase().replace(/\s+/g, '-'),
        rate_limit_per_minute: Number(rateLimit),
      });
      toast.success(`Webhook source '${name}' registered`);
      setShowNewModal(false);
      setName('');
      setSlug('');
      await loadSources();
    } catch (err: any) {
      toast.error(`Failed to register webhook source: ${err.message}`);
    }
  };

  return (
    <div>
      {/* View Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
        <div>
          <h1 style={{ fontSize: '22px', fontWeight: 800, letterSpacing: '-0.02em' }}>
            Webhook Integrations
          </h1>
          <p style={{ fontSize: '13px', color: 'var(--text-secondary)' }}>
            Configured third-party alert dispatchers, HMAC-SHA256 signature secrets, and rate limiters.
          </p>
        </div>
        <div style={{ display: 'flex', gap: '10px' }}>
          <button onClick={loadSources} className="btn btn-secondary btn-sm">
            <RefreshCw size={13} className={loading ? 'animate-spin' : ''} />
            Refresh
          </button>
          <button onClick={() => setShowNewModal(true)} className="btn btn-primary btn-sm">
            <Plus size={13} />
            Register Webhook Source
          </button>
        </div>
      </div>

      {/* Integrations Table */}
      <div className="table-container">
        <table className="data-table">
          <thead>
            <tr>
              <th>Status</th>
              <th>Source Name</th>
              <th>Slug / Endpoint Path</th>
              <th>Rate Limit (60s)</th>
              <th>Payloads</th>
              <th>p95 Latency</th>
              <th>HMAC Secret Key</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr>
                <td colSpan={8} style={{ textAlign: 'center', padding: '40px', color: 'var(--text-muted)' }}>
                  Loading integrations...
                </td>
              </tr>
            ) : sources.length === 0 ? (
              <tr>
                <td colSpan={8} style={{ textAlign: 'center', padding: '40px', color: 'var(--text-muted)' }}>
                  No webhook sources registered. Click "Register Webhook Source" to create one.
                </td>
              </tr>
            ) : (
              sources.map((src) => {
                const isSecretVisible = visibleSecrets[src.id];
                const srcMetric = metrics[src.slug];
                return (
                  <tr key={src.id}>
                    <td>
                      <span className={`badge ${src.is_active ? 'badge-up' : 'badge-down'}`}>
                        {src.is_active ? 'ACTIVE' : 'DISABLED'}
                      </span>
                    </td>
                    <td style={{ fontWeight: 600 }}>{src.name}</td>
                    <td>
                      <span className="font-mono" style={{ fontSize: '12px', color: 'var(--color-primary)' }}>
                        /api/v1/webhooks/{src.slug}/
                      </span>
                    </td>
                    <td style={{ fontSize: '12px' }}>
                      {src.rate_limit_per_minute} req/min
                    </td>
                    <td>
                      <span className="font-mono" style={{ fontWeight: 600 }}>
                        {src.total_payloads || 0}
                      </span>
                    </td>
                    <td>
                      {srcMetric && srcMetric.p95_latency_ms > 0 ? (
                        <span className="badge badge-up" style={{ fontSize: '11px', fontFamily: 'var(--font-mono)' }}>
                          {srcMetric.p95_latency_ms.toFixed(1)}ms
                        </span>
                      ) : (
                        <span style={{ fontSize: '12px', color: 'var(--text-muted)' }}>&lt; 50ms SLA</span>
                      )}
                    </td>
                    <td>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                        <span className="font-mono" style={{ fontSize: '11px', color: 'var(--text-secondary)' }}>
                          {isSecretVisible ? src.secret_key : `${src.secret_key.slice(0, 6)}••••••••••••••••`}
                        </span>
                        <button
                          onClick={() => toggleSecret(src.id)}
                          className="btn btn-secondary btn-sm"
                          style={{ padding: '3px 6px' }}
                          title={isSecretVisible ? 'Hide Secret' : 'Show Secret'}
                        >
                          {isSecretVisible ? <EyeOff size={11} /> : <Eye size={11} />}
                        </button>
                        <button
                          onClick={() => copySecret(src.id, src.secret_key)}
                          className="btn btn-secondary btn-sm"
                          style={{ padding: '3px 6px' }}
                          title="Copy Secret to Clipboard"
                        >
                          {copiedId === src.id ? <Check size={11} color="var(--status-up)" /> : <Copy size={11} />}
                        </button>
                      </div>
                    </td>
                    <td>
                      <div style={{ display: 'flex', gap: '6px' }}>
                        <button
                          onClick={() => handleToggleActive(src)}
                          className={`btn btn-sm ${src.is_active ? 'btn-secondary' : 'btn-success'}`}
                          style={{ padding: '3px 8px', fontSize: '11px' }}
                        >
                          {src.is_active ? 'Deactivate' : 'Activate'}
                        </button>
                        <button
                          onClick={() => handleRotateSecret(src.id, src.name)}
                          className="btn btn-secondary btn-sm"
                          style={{ padding: '3px 8px', fontSize: '11px' }}
                          title="Rotate HMAC secret key"
                        >
                          <RotateCw size={11} />
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>

      {/* New Integration Modal */}
      {showNewModal && (
        <div className="modal-overlay" onClick={() => setShowNewModal(false)}>
          <div className="modal-content" onClick={(e) => e.stopPropagation()} style={{ maxWidth: '480px' }}>
            <div style={{ padding: '16px 20px', borderBottom: '1px solid var(--border-subtle)', display: 'flex', justifyContent: 'space-between' }}>
              <h3 style={{ fontSize: '15px', fontWeight: 700 }}>Register Webhook Integration</h3>
              <button onClick={() => setShowNewModal(false)} className="btn btn-secondary btn-sm"><X size={14} /></button>
            </div>
            <form onSubmit={handleCreateSource} style={{ padding: '20px', display: 'flex', flexDirection: 'column', gap: '14px' }}>
              <div>
                <label style={{ display: 'block', fontSize: '12px', fontWeight: 600, marginBottom: '6px' }}>Integration Name</label>
                <input
                  type="text"
                  required
                  placeholder="e.g. Datadog Production Alerts"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  className="input"
                  style={{ width: '100%' }}
                />
              </div>
              <div>
                <label style={{ display: 'block', fontSize: '12px', fontWeight: 600, marginBottom: '6px' }}>URL Slug</label>
                <input
                  type="text"
                  placeholder="e.g. datadog-prod"
                  value={slug}
                  onChange={(e) => setSlug(e.target.value)}
                  className="input"
                  style={{ width: '100%' }}
                />
              </div>
              <div>
                <label style={{ display: 'block', fontSize: '12px', fontWeight: 600, marginBottom: '6px' }}>Burst Rate Limit (per 60s)</label>
                <input
                  type="number"
                  min="10"
                  max="5000"
                  value={rateLimit}
                  onChange={(e) => setRateLimit(Number(e.target.value))}
                  className="input"
                  style={{ width: '100%' }}
                />
              </div>
              <button type="submit" className="btn btn-primary" style={{ marginTop: '8px' }}>
                Register Source
              </button>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
