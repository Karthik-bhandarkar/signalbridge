import React, { useEffect, useState, useCallback } from 'react';
import {
  AlertTriangle,
  Radio,
  Server,
  ArrowRight,
  ShieldCheck,
  CheckCircle2,
  RefreshCw,
  Gauge,
  CheckCircle,
  CopyCheck,
  XCircle,
} from 'lucide-react';
import { api } from '../lib/api';
import type { Incident, IngestionSummary, Monitor, Service, WebhookSource } from '../types';

interface OverviewViewProps {
  onNavigateTab: (tab: any) => void;
  onOpenIncidentDetail: (id: string) => void;
}

export const OverviewView: React.FC<OverviewViewProps> = ({
  onNavigateTab,
  onOpenIncidentDetail,
}) => {
  const [incidents, setIncidents] = useState<Incident[]>([]);
  const [services, setServices] = useState<Service[]>([]);
  const [monitors, setMonitors] = useState<Monitor[]>([]);
  const [integrations, setIntegrations] = useState<WebhookSource[]>([]);
  const [metricsSummary, setMetricsSummary] = useState<IngestionSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [metricsError, setMetricsError] = useState<string | null>(null);

  const loadData = useCallback(async () => {
    try {
      setLoading(true);
      setMetricsError(null);
      const [incRes, svcRes, monRes, intRes, summaryRes] = await Promise.all([
        api.incidents.list({ page_size: 5 }),
        api.services.list(),
        api.monitors.list(),
        api.integrations.list(),
        api.analytics.summary({ window_minutes: 60 }).catch((err) => {
          console.warn('[Overview] Analytics summary fetch failed:', err);
          setMetricsError(err.message || 'Metrics unavailable');
          return null;
        }),
      ]);
      setIncidents(incRes.results || []);
      setServices(svcRes || []);
      setMonitors(monRes || []);
      setIntegrations(intRes || []);
      setMetricsSummary(summaryRes);
    } catch (err) {
      console.error('[Overview] Error loading data:', err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const openIncidents = incidents.filter((i) => i.status !== 'RESOLVED');
  const criticalCount = openIncidents.filter((i) => i.severity === 'CRITICAL').length;
  const upMonitorsCount = monitors.filter((m) => m.current_status === 'UP').length;
  const totalMonitors = monitors.length;
  const totalHistoricalPayloads = integrations.reduce((acc, curr) => acc + (curr.total_payloads || 0), 0);

  const hasRecentTraffic = metricsSummary && metricsSummary.total_received > 0;
  const displaySla = hasRecentTraffic
    ? `${metricsSummary.acceptance_rate_pct.toFixed(1)}%`
    : '100.0%';

  const p95Text = metricsSummary && metricsSummary.p95_latency_ms > 0
    ? `p95 Latency: ${metricsSummary.p95_latency_ms.toFixed(1)}ms (${metricsSummary.total_received <= 1000 ? 'exact p95' : 'sampled p95'})`
    : 'Target SLA: sub-100ms ACK';

  return (
    <div>
      {/* Page Title & Refresh */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '24px' }}>
        <div>
          <h1 style={{ fontSize: '22px', fontWeight: 800, letterSpacing: '-0.02em', color: 'var(--text-primary)' }}>
            Operations Mission Control
          </h1>
          <p style={{ fontSize: '13px', color: 'var(--text-secondary)' }}>
            Real-time webhook ingestion velocity, incident grouping, and active probe health.
          </p>
        </div>
        <button onClick={loadData} className="btn btn-secondary btn-sm">
          <RefreshCw size={13} className={loading ? 'animate-spin' : ''} />
          Refresh Metrics
        </button>
      </div>

      {/* KPI Cards Grid */}
      <div className="overview-stats-grid" style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '16px', marginBottom: '20px' }}>
        {/* Card 1: Active Incidents */}
        <div className="card" onClick={() => onNavigateTab('incidents')} style={{ cursor: 'pointer' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
            <span style={{ fontSize: '12px', fontWeight: 600, color: 'var(--text-muted)' }}>ACTIVE INCIDENTS</span>
            <div style={{ padding: '6px', borderRadius: '6px', background: 'rgba(244, 63, 94, 0.15)', color: 'var(--severity-critical)' }}>
              <AlertTriangle size={16} />
            </div>
          </div>
          <div style={{ fontSize: '28px', fontWeight: 800, color: 'var(--text-primary)', marginBottom: '4px' }}>
            {openIncidents.length}
          </div>
          <div style={{ fontSize: '12px', color: criticalCount > 0 ? 'var(--severity-critical)' : 'var(--text-muted)' }}>
            {criticalCount > 0 ? `${criticalCount} critical tier emergencies` : 'All systems operating within bounds'}
          </div>
        </div>

        {/* Card 2: Webhooks Ingested */}
        <div className="card" onClick={() => onNavigateTab('integrations')} style={{ cursor: 'pointer' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
            <span style={{ fontSize: '12px', fontWeight: 600, color: 'var(--text-muted)' }}>INGESTED SIGNALS</span>
            <div style={{ padding: '6px', borderRadius: '6px', background: 'rgba(59, 130, 246, 0.15)', color: 'var(--color-primary)' }}>
              <Radio size={16} />
            </div>
          </div>
          <div style={{ fontSize: '28px', fontWeight: 800, color: 'var(--text-primary)', marginBottom: '4px' }}>
            {hasRecentTraffic ? metricsSummary.total_received : totalHistoricalPayloads}
          </div>
          <div style={{ fontSize: '12px', color: 'var(--text-secondary)' }}>
            {hasRecentTraffic
              ? `${metricsSummary.total_accepted} accepted, ${metricsSummary.total_duplicates} duplicates (60m)`
              : `Across ${integrations.length} registered webhook sources`}
          </div>
        </div>

        {/* Card 3: Monitored Services */}
        <div className="card" onClick={() => onNavigateTab('services')} style={{ cursor: 'pointer' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
            <span style={{ fontSize: '12px', fontWeight: 600, color: 'var(--text-muted)' }}>SYNTHETIC PROBES</span>
            <div style={{ padding: '6px', borderRadius: '6px', background: 'rgba(16, 185, 129, 0.15)', color: 'var(--status-up)' }}>
              <Server size={16} />
            </div>
          </div>
          <div style={{ fontSize: '28px', fontWeight: 800, color: 'var(--text-primary)', marginBottom: '4px' }}>
            {upMonitorsCount} / {totalMonitors}
          </div>
          <div style={{ fontSize: '12px', color: 'var(--status-up)' }}>
            {services.length} microservices continuously monitored
          </div>
        </div>

        {/* Card 4: Sub-100ms Ingestion Gateway SLA */}
        <div className="card">
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
            <span style={{ fontSize: '12px', fontWeight: 600, color: 'var(--text-muted)' }}>INGESTION GATEWAY SLA</span>
            <div style={{ padding: '6px', borderRadius: '6px', background: 'rgba(16, 185, 129, 0.15)', color: 'var(--status-up)' }}>
              <ShieldCheck size={16} />
            </div>
          </div>
          <div style={{ fontSize: '28px', fontWeight: 800, color: 'var(--status-up)', marginBottom: '4px' }}>
            {displaySla}
          </div>
          <div style={{ fontSize: '12px', color: 'var(--text-muted)' }}>
            {p95Text}
          </div>
        </div>
      </div>

      {/* Ingestion Metric Error Warning State */}
      {metricsError && (
        <div
          className="card"
          style={{
            marginBottom: '20px',
            padding: '12px 18px',
            background: 'rgba(244, 63, 94, 0.08)',
            border: '1px solid rgba(244, 63, 94, 0.25)',
            display: 'flex',
            alignItems: 'center',
            gap: '10px',
            fontSize: '12px',
            color: 'var(--severity-critical)',
          }}
        >
          <XCircle size={15} />
          <span>Ingestion metrics notice: {metricsError}. Historical database totals displayed.</span>
        </div>
      )}

      {/* Ingestion Metric Outcomes & Rejections Strip */}
      {metricsSummary && (
        <div
          className="card"
          style={{
            marginBottom: '28px',
            padding: '14px 20px',
            background: 'var(--surface-subtle)',
            border: '1px solid var(--border-subtle)',
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            flexWrap: 'wrap',
            gap: '12px',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '16px', flexWrap: 'wrap' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '13px', fontWeight: 700 }}>
              <Gauge size={16} style={{ color: 'var(--color-primary)' }} />
              <span>Ingestion Pipeline (60m Window):</span>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '12px', color: 'var(--text-secondary)' }}>
              <CheckCircle size={14} style={{ color: 'var(--status-up)' }} />
              <span>Accepted: <strong>{metricsSummary.total_accepted}</strong></span>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '12px', color: 'var(--text-secondary)' }}>
              <CopyCheck size={14} style={{ color: 'var(--color-primary)' }} />
              <span>Duplicates: <strong>{metricsSummary.total_duplicates}</strong></span>
            </div>
            {metricsSummary.total_rejected > 0 ? (
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '12px', color: 'var(--severity-critical)' }}>
                <XCircle size={14} />
                <span>
                  Rejections ({metricsSummary.total_rejected}):{' '}
                  {metricsSummary.rejections_by_category.auth > 0 && `Auth: ${metricsSummary.rejections_by_category.auth} `}
                  {metricsSummary.rejections_by_category.rate_limit > 0 && `RateLimit: ${metricsSummary.rejections_by_category.rate_limit} `}
                  {metricsSummary.rejections_by_category.malformed > 0 && `Malformed: ${metricsSummary.rejections_by_category.malformed} `}
                  {metricsSummary.rejections_by_category.inactive > 0 && `Inactive: ${metricsSummary.rejections_by_category.inactive} `}
                  {metricsSummary.rejections_by_category.server_error > 0 && `Server: ${metricsSummary.rejections_by_category.server_error}`}
                </span>
              </div>
            ) : (
              <span style={{ fontSize: '12px', color: 'var(--status-up)' }}>Zero Rejections</span>
            )}
          </div>
          <div style={{ fontSize: '11px', color: 'var(--text-muted)', fontFamily: 'var(--font-mono)' }}>
            Active Sources: {metricsSummary.active_sources_count} | Evaluated: {new Date(metricsSummary.timestamp).toLocaleTimeString()}
          </div>
        </div>
      )}

      {/* Main Grid: Active Incidents + Service Health Radar */}
      <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr', gap: '20px' }}>
        {/* Left: Active Incidents Table */}
        <div className="table-container">
          <div style={{
            padding: '16px 20px',
            borderBottom: '1px solid var(--border-subtle)',
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center'
          }}>
            <h3 style={{ fontSize: '14px', fontWeight: 700, display: 'flex', alignItems: 'center', gap: '8px' }}>
              <AlertTriangle size={16} style={{ color: 'var(--severity-critical)' }} />
              Active Operational Incidents
            </h3>
            <button onClick={() => onNavigateTab('incidents')} className="btn btn-secondary btn-sm">
              View All ({incidents.length})
              <ArrowRight size={13} />
            </button>
          </div>

          <table className="data-table">
            <thead>
              <tr>
                <th>Severity</th>
                <th>Service</th>
                <th>Fingerprint</th>
                <th>Status</th>
                <th>Alerts</th>
                <th>Last Activity</th>
              </tr>
            </thead>
            <tbody>
              {incidents.length === 0 ? (
                <tr>
                  <td colSpan={6} style={{ textAlign: 'center', padding: '36px', color: 'var(--text-muted)' }}>
                    <CheckCircle2 size={24} style={{ color: 'var(--status-up)', marginBottom: '8px' }} />
                    <p>No active incidents. All systems operational.</p>
                  </td>
                </tr>
              ) : (
                incidents.map((inc) => (
                  <tr key={inc.id} onClick={() => onOpenIncidentDetail(inc.id)}>
                    <td>
                      <span className={`badge badge-${inc.severity.toLowerCase()}`}>
                        {inc.severity}
                      </span>
                    </td>
                    <td style={{ fontWeight: 600 }}>{inc.service_name}</td>
                    <td style={{ color: 'var(--text-secondary)' }}>{inc.fingerprint}</td>
                    <td>
                      <span className={`badge ${
                        inc.status === 'OPEN' ? 'badge-critical' : inc.status === 'ACKNOWLEDGED' ? 'badge-medium' : 'badge-up'
                      }`}>
                        {inc.status}
                      </span>
                    </td>
                    <td>
                      <span className="font-mono" style={{ fontWeight: 600 }}>{inc.alert_count}</span>
                    </td>
                    <td style={{ color: 'var(--text-muted)', fontSize: '12px' }}>
                      {new Date(inc.last_seen_at).toLocaleTimeString()}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        {/* Right: Monitored Services Health Radar */}
        <div className="card">
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
            <h3 style={{ fontSize: '14px', fontWeight: 700, display: 'flex', alignItems: 'center', gap: '8px' }}>
              <Server size={16} style={{ color: 'var(--color-primary)' }} />
              Monitored Services
            </h3>
            <button onClick={() => onNavigateTab('services')} className="btn btn-secondary btn-sm" style={{ padding: '4px 8px' }}>
              Manage
            </button>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
            {services.length === 0 ? (
              <p style={{ color: 'var(--text-muted)', fontSize: '12px', textAlign: 'center', padding: '20px' }}>
                No monitored services configured yet.
              </p>
            ) : (
              services.map((svc) => (
                <div
                  key={svc.id}
                  style={{
                    background: 'var(--bg-surface-elevated)',
                    border: '1px solid var(--border-subtle)',
                    borderRadius: '8px',
                    padding: '12px',
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                  }}
                >
                  <div>
                    <div style={{ fontWeight: 600, fontSize: '13px', color: 'var(--text-primary)' }}>{svc.name}</div>
                    <div style={{ fontSize: '11px', color: 'var(--text-muted)' }}>
                      Tier: {svc.tier} · {svc.monitors_count} synthetic checks
                    </div>
                  </div>
                  <div>
                    {svc.active_incidents_count > 0 ? (
                      <span className="badge badge-critical">
                        {svc.active_incidents_count} Alerting
                      </span>
                    ) : (
                      <span className="badge badge-up">
                        Operational
                      </span>
                    )}
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
