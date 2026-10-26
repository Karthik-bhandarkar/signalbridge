import React, { useEffect, useState, useCallback } from 'react';
import {
  Server,
  Plus,
  Play,
  RefreshCw,
  X,
} from 'lucide-react';
import { api } from '../lib/api';
import { useToast } from '../context/ToastContext';
import type { Monitor, Service } from '../types';

export const ServicesView: React.FC = () => {
  const { toast } = useToast();
  const [services, setServices] = useState<Service[]>([]);
  const [monitors, setMonitors] = useState<Monitor[]>([]);
  const [loading, setLoading] = useState(true);

  // Probe testing state:
  const [probingId, setProbingId] = useState<string | null>(null);
  const [probeResult, setProbeResult] = useState<any>(null);

  // Modals:
  const [showNewService, setShowNewService] = useState(false);
  const [newServiceName, setNewServiceName] = useState('');
  const [newServiceSlug, setNewServiceSlug] = useState('');
  const [newServiceTier, setNewServiceTier] = useState<'TIER_0' | 'TIER_1' | 'TIER_2'>('TIER_1');

  const [showNewMonitor, setShowNewMonitor] = useState(false);
  const [targetServiceId, setTargetServiceId] = useState('');
  const [monitorName, setMonitorName] = useState('');
  const [targetUrl, setTargetUrl] = useState('http://');
  const [threshold, setThreshold] = useState(3);

  const loadData = useCallback(async () => {
    try {
      setLoading(true);
      const [svc, mon] = await Promise.all([
        api.services.list(),
        api.monitors.list(),
      ]);
      setServices(svc || []);
      setMonitors(mon || []);
    } catch (err) {
      console.error('[ServicesView] Error loading services:', err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const handleRunImmediateProbe = async (id: string) => {
    try {
      setProbingId(id);
      setProbeResult(null);
      const res = await api.monitors.test(id);
      setProbeResult(res.probe_result);
      toast.info(`Probe completed: HTTP ${res.probe_result?.status_code || 200}`);
      await loadData();
    } catch (err: any) {
      toast.error(`Probe execution failed: ${err.message}`);
    } finally {
      setProbingId(null);
    }
  };

  const handleCreateService = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await api.services.create({
        name: newServiceName,
        slug: newServiceSlug || newServiceName.toLowerCase().replace(/\s+/g, '-'),
        tier: newServiceTier,
      });
      toast.success(`Service '${newServiceName}' created`);
      setShowNewService(false);
      setNewServiceName('');
      setNewServiceSlug('');
      await loadData();
    } catch (err: any) {
      toast.error(`Failed to create service: ${err.message}`);
    }
  };

  const handleCreateMonitor = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await api.monitors.create({
        service: targetServiceId,
        name: monitorName,
        target_url: targetUrl,
        failure_threshold: Number(threshold),
        interval_seconds: 60,
        timeout_seconds: 5,
      });
      toast.success(`Monitor '${monitorName}' configured`);
      setShowNewMonitor(false);
      setMonitorName('');
      setTargetUrl('http://');
      await loadData();
    } catch (err: any) {
      toast.error(`Failed to create monitor: ${err.message}`);
    }
  };

  return (
    <div>
      {/* View Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
        <div>
          <h1 style={{ fontSize: '22px', fontWeight: 800, letterSpacing: '-0.02em' }}>
            Monitored Services & Synthetic Checks
          </h1>
          <p style={{ fontSize: '13px', color: 'var(--text-secondary)' }}>
            Active HTTP/TCP synthetic health probes with SSRF validation and automated incident correlation.
          </p>
        </div>
        <div style={{ display: 'flex', gap: '10px' }}>
          <button onClick={() => setShowNewService(true)} className="btn btn-secondary btn-sm">
            <Plus size={13} />
            Register Service
          </button>
          <button onClick={() => setShowNewMonitor(true)} className="btn btn-primary btn-sm">
            <Plus size={13} />
            Add Synthetic Probe
          </button>
        </div>
      </div>

      {/* Live Probe Feedback Banner */}
      {probeResult && (
        <div style={{
          background: 'var(--bg-surface-elevated)',
          border: '1px solid var(--border-strong)',
          borderRadius: '8px',
          padding: '12px 16px',
          marginBottom: '20px',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          fontSize: '13px',
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <span className={`badge ${probeResult.status === 'UP' ? 'badge-up' : 'badge-down'}`}>
              {probeResult.status}
            </span>
            <span>
              Probe completed in <strong>{probeResult.duration_ms}ms</strong> (Status Code: {probeResult.status_code || 'N/A'})
            </span>
          </div>
          <button onClick={() => setProbeResult(null)} className="btn btn-secondary btn-sm" style={{ padding: '3px 8px' }}>
            Dismiss
          </button>
        </div>
      )}

      {/* Services Grid */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '16px', marginBottom: '32px' }}>
        {services.map((svc) => (
          <div key={svc.id} className="card">
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '10px' }}>
              <div>
                <h3 style={{ fontSize: '15px', fontWeight: 700, color: 'var(--text-primary)' }}>{svc.name}</h3>
                <span className="font-mono" style={{ fontSize: '11px', color: 'var(--text-muted)' }}>{svc.slug}</span>
              </div>
              <span className={`badge ${
                svc.tier === 'TIER_0' ? 'badge-critical' : svc.tier === 'TIER_1' ? 'badge-high' : 'badge-low'
              }`}>
                {svc.tier}
              </span>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: '16px', fontSize: '12px' }}>
              <span style={{ color: 'var(--text-secondary)' }}>
                {svc.monitors_count} Synthetic Checks
              </span>
              {svc.active_incidents_count > 0 ? (
                <span className="badge badge-critical">{svc.active_incidents_count} Alerting</span>
              ) : (
                <span className="badge badge-up">Healthy</span>
              )}
            </div>
          </div>
        ))}
      </div>

      {/* Synthetic Monitors Table */}
      <div className="table-container">
        <div style={{
          padding: '16px 20px',
          borderBottom: '1px solid var(--border-subtle)',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
        }}>
          <h3 style={{ fontSize: '14px', fontWeight: 700, display: 'flex', alignItems: 'center', gap: '8px' }}>
            <Server size={16} style={{ color: 'var(--color-primary)' }} />
            Active Synthetic Probes
          </h3>
          <button onClick={loadData} className="btn btn-secondary btn-sm">
            <RefreshCw size={13} className={loading ? 'animate-spin' : ''} />
            Refresh
          </button>
        </div>

        <table className="data-table">
          <thead>
            <tr>
              <th>Status</th>
              <th>Probe Name</th>
              <th>Target Service</th>
              <th>Target Endpoint</th>
              <th>Threshold</th>
              <th>Last Round-Trip</th>
              <th>Last Checked</th>
              <th>Action</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr>
                <td colSpan={8} style={{ textAlign: 'center', padding: '40px', color: 'var(--text-muted)' }}>
                  Loading synthetic probes...
                </td>
              </tr>
            ) : monitors.length === 0 ? (
              <tr>
                <td colSpan={8} style={{ textAlign: 'center', padding: '40px', color: 'var(--text-muted)' }}>
                  No synthetic monitors configured. Click "Add Synthetic Probe" to create one.
                </td>
              </tr>
            ) : (
              monitors.map((m) => (
                <tr key={m.id}>
                  <td>
                    <span className={`badge ${
                      m.current_status === 'UP' ? 'badge-up' : m.current_status === 'DOWN' ? 'badge-down' : 'badge-degraded'
                    }`}>
                      {m.current_status}
                    </span>
                  </td>
                  <td style={{ fontWeight: 600 }}>{m.name}</td>
                  <td style={{ color: 'var(--text-secondary)' }}>{m.service_name || m.service_slug}</td>
                  <td>
                    <span className="font-mono" style={{ fontSize: '11px', color: 'var(--text-muted)' }}>
                      {m.target_url}
                    </span>
                  </td>
                  <td style={{ fontSize: '12px' }}>
                    {m.consecutive_failures} / {m.failure_threshold} fails
                  </td>
                  <td style={{ fontSize: '12px' }}>
                    {m.last_response_time_ms > 0 ? `${m.last_response_time_ms.toFixed(1)}ms` : '-'}
                  </td>
                  <td style={{ color: 'var(--text-muted)', fontSize: '12px' }}>
                    {m.last_checked_at ? new Date(m.last_checked_at).toLocaleTimeString() : 'Never'}
                  </td>
                  <td>
                    <button
                      onClick={() => handleRunImmediateProbe(m.id)}
                      disabled={probingId === m.id}
                      className="btn btn-primary btn-sm"
                      style={{ padding: '4px 10px', fontSize: '11px' }}
                    >
                      <Play size={11} className={probingId === m.id ? 'animate-spin' : ''} />
                      {probingId === m.id ? 'Probing...' : 'Run Probe'}
                    </button>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {/* New Service Modal */}
      {showNewService && (
        <div className="modal-overlay" onClick={() => setShowNewService(false)}>
          <div className="modal-content" onClick={(e) => e.stopPropagation()} style={{ maxWidth: '450px' }}>
            <div style={{ padding: '16px 20px', borderBottom: '1px solid var(--border-subtle)', display: 'flex', justifyContent: 'space-between' }}>
              <h3 style={{ fontSize: '15px', fontWeight: 700 }}>Register Monitored Service</h3>
              <button onClick={() => setShowNewService(false)} className="btn btn-secondary btn-sm"><X size={14} /></button>
            </div>
            <form onSubmit={handleCreateService} style={{ padding: '20px', display: 'flex', flexDirection: 'column', gap: '14px' }}>
              <div>
                <label style={{ display: 'block', fontSize: '12px', fontWeight: 600, marginBottom: '6px' }}>Service Name</label>
                <input
                  type="text"
                  required
                  placeholder="e.g. Payments Gateway"
                  value={newServiceName}
                  onChange={(e) => setNewServiceName(e.target.value)}
                  className="input"
                  style={{ width: '100%' }}
                />
              </div>
              <div>
                <label style={{ display: 'block', fontSize: '12px', fontWeight: 600, marginBottom: '6px' }}>Slug</label>
                <input
                  type="text"
                  placeholder="e.g. payments-gateway"
                  value={newServiceSlug}
                  onChange={(e) => setNewServiceSlug(e.target.value)}
                  className="input"
                  style={{ width: '100%' }}
                />
              </div>
              <div>
                <label style={{ display: 'block', fontSize: '12px', fontWeight: 600, marginBottom: '6px' }}>Priority Tier</label>
                <select
                  value={newServiceTier}
                  onChange={(e) => setNewServiceTier(e.target.value as any)}
                  className="input"
                  style={{ width: '100%' }}
                >
                  <option value="TIER_0">Tier 0 (Mission Critical)</option>
                  <option value="TIER_1">Tier 1 (Core Business)</option>
                  <option value="TIER_2">Tier 2 (Internal / Support)</option>
                </select>
              </div>
              <button type="submit" className="btn btn-primary" style={{ marginTop: '8px' }}>
                Save Service
              </button>
            </form>
          </div>
        </div>
      )}

      {/* New Monitor Modal */}
      {showNewMonitor && (
        <div className="modal-overlay" onClick={() => setShowNewMonitor(false)}>
          <div className="modal-content" onClick={(e) => e.stopPropagation()} style={{ maxWidth: '500px' }}>
            <div style={{ padding: '16px 20px', borderBottom: '1px solid var(--border-subtle)', display: 'flex', justifyContent: 'space-between' }}>
              <h3 style={{ fontSize: '15px', fontWeight: 700 }}>Add Synthetic Probe Check</h3>
              <button onClick={() => setShowNewMonitor(false)} className="btn btn-secondary btn-sm"><X size={14} /></button>
            </div>
            <form onSubmit={handleCreateMonitor} style={{ padding: '20px', display: 'flex', flexDirection: 'column', gap: '14px' }}>
              <div>
                <label style={{ display: 'block', fontSize: '12px', fontWeight: 600, marginBottom: '6px' }}>Target Service</label>
                <select
                  required
                  value={targetServiceId}
                  onChange={(e) => setTargetServiceId(e.target.value)}
                  className="input"
                  style={{ width: '100%' }}
                >
                  <option value="">Select Monitored Service</option>
                  {services.map((s) => (
                    <option key={s.id} value={s.id}>{s.name} ({s.slug})</option>
                  ))}
                </select>
              </div>
              <div>
                <label style={{ display: 'block', fontSize: '12px', fontWeight: 600, marginBottom: '6px' }}>Probe Name</label>
                <input
                  type="text"
                  required
                  placeholder="e.g. HTTP Healthz Check"
                  value={monitorName}
                  onChange={(e) => setMonitorName(e.target.value)}
                  className="input"
                  style={{ width: '100%' }}
                />
              </div>
              <div>
                <label style={{ display: 'block', fontSize: '12px', fontWeight: 600, marginBottom: '6px' }}>Target URL (SSRF Protected)</label>
                <input
                  type="url"
                  required
                  placeholder="https://api.example.com/healthz"
                  value={targetUrl}
                  onChange={(e) => setTargetUrl(e.target.value)}
                  className="input"
                  style={{ width: '100%' }}
                />
              </div>
              <div>
                <label style={{ display: 'block', fontSize: '12px', fontWeight: 600, marginBottom: '6px' }}>Failure Threshold (consecutive fails before incident)</label>
                <input
                  type="number"
                  min="1"
                  max="10"
                  value={threshold}
                  onChange={(e) => setThreshold(Number(e.target.value))}
                  className="input"
                  style={{ width: '100%' }}
                />
              </div>
              <button type="submit" className="btn btn-primary" style={{ marginTop: '8px' }}>
                Create Synthetic Monitor
              </button>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
