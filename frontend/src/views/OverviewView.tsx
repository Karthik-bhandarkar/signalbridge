import React, { useEffect, useState, useCallback } from 'react';
import {
  ArrowRight,
  CheckCircle2,
  ChevronRight,
} from 'lucide-react';
import { api } from '../lib/api';
import type { Incident, IngestionSummary, Service, WebhookSource } from '../types';
import { HeroSection } from '../components/HeroSection';
import { SreBentoGrid } from '../components/SreBentoGrid';

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
  const [integrations, setIntegrations] = useState<WebhookSource[]>([]);
  const [metricsSummary, setMetricsSummary] = useState<IngestionSummary | null>(null);

  const loadData = useCallback(async () => {
    try {
      const [incRes, svcRes, intRes, summaryRes] = await Promise.all([
        api.incidents.list({ page_size: 8 }),
        api.services.list(),
        api.integrations.list(),
        api.analytics.summary({ window_minutes: 60 }).catch((err) => {
          console.warn('[Overview] Analytics summary fetch failed:', err);
          return null;
        }),
      ]);
      setIncidents(incRes.results || []);
      setServices(svcRes || []);
      setIntegrations(intRes || []);
      setMetricsSummary(summaryRes);
    } catch (err) {
      console.error('[Overview] Error loading data:', err);
    }
  }, []);

  useEffect(() => {
    loadData();
    const interval = setInterval(loadData, 15000);
    return () => clearInterval(interval);
  }, [loadData]);

  const openIncidents = incidents.filter((i) => i.status !== 'RESOLVED');

  return (
    <div className="overview-page-wrapper">
      {/* 1. Gumloop-inspired Hero Section with Live Architecture & 1-Click Simulator */}
      <HeroSection onRefreshData={loadData} />

      {/* 2. 21st.dev Finance Bento-inspired SRE Telemetry HUD */}
      <SreBentoGrid
        summary={metricsSummary}
        integrations={integrations}
      />

      {/* 3. Real-Time Active Correlated Incidents Table */}
      <div className="card" style={{ marginBottom: '32px' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
          <div>
            <span className="card-kicker">Live Incident Stream</span>
            <h3 className="card-title">Correlated Incidents ({openIncidents.length} Active)</h3>
          </div>
          <button onClick={() => onNavigateTab('incidents')} className="btn btn-secondary btn-sm">
            <span>View All Incidents</span>
            <ArrowRight size={13} />
          </button>
        </div>

        {incidents.length === 0 ? (
          <div style={{ textAlign: 'center', padding: '36px 20px', color: 'var(--text-muted)' }}>
            <CheckCircle2 size={32} style={{ color: 'var(--status-up)', margin: '0 auto 12px' }} />
            <div style={{ fontSize: '15px', fontWeight: 700, color: 'var(--text-primary)' }}>
              No Active Incidents Detected
            </div>
            <p style={{ fontSize: '13px', marginTop: '4px' }}>
              All service streams are healthy. Use the Simulator above to dispatch test webhooks!
            </p>
          </div>
        ) : (
          <div className="table-container">
            <table className="data-table">
              <thead>
                <tr>
                  <th>Status</th>
                  <th>Severity</th>
                  <th>Service & Title</th>
                  <th>Alerts</th>
                  <th>Triggered At</th>
                  <th>Action</th>
                </tr>
              </thead>
              <tbody>
                {incidents.slice(0, 5).map((incident) => {
                  const isCrit = incident.severity === 'CRITICAL';
                  const isHigh = incident.severity === 'HIGH';
                  const isResolved = incident.status === 'RESOLVED';
                  return (
                    <tr
                      key={incident.id}
                      onClick={() => onOpenIncidentDetail(incident.id)}
                      style={{ cursor: 'pointer' }}
                    >
                      <td>
                        <span className={`badge ${isResolved ? 'badge-up' : isCrit ? 'badge-critical' : 'badge-high'}`}>
                          {incident.status}
                        </span>
                      </td>
                      <td>
                        <span className={`badge ${isCrit ? 'badge-critical' : isHigh ? 'badge-high' : 'badge-medium'}`}>
                          {incident.severity}
                        </span>
                      </td>
                      <td>
                        <div style={{ fontWeight: 700, color: 'var(--text-primary)' }}>
                          {incident.service_name.toUpperCase()} · {incident.fingerprint}
                        </div>
                        <div style={{ fontSize: '11px', color: 'var(--text-muted)', fontFamily: 'JetBrains Mono' }}>
                          svc: {incident.service_name || 'unassigned'} • id: {incident.id.substring(0, 8)}...
                        </div>
                      </td>
                      <td>
                        <span className="pill-tag font-mono">
                          {incident.alert_count} {incident.alert_count === 1 ? 'alert' : 'alerts'}
                        </span>
                      </td>
                      <td>
                        <span className="font-mono text-muted text-xs">
                          {new Date(incident.created_at).toLocaleTimeString()}
                        </span>
                      </td>
                      <td>
                        <button
                          type="button"
                          className="btn btn-secondary btn-sm"
                          onClick={(e) => {
                            e.stopPropagation();
                            onOpenIncidentDetail(incident.id);
                          }}
                        >
                          Inspect
                          <ChevronRight size={13} />
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* 4. Infrastructure Health Probes Strip */}
      <div className="card">
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
          <div>
            <span className="card-kicker">Synthetic Monitoring</span>
            <h3 className="card-title">Continuously Probed Microservices</h3>
          </div>
          <button onClick={() => onNavigateTab('services')} className="btn btn-secondary btn-sm">
            Configure Probes
          </button>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(240px, 1fr))', gap: '14px' }}>
          {services.map((svc) => (
            <div
              key={svc.id}
              style={{
                background: 'var(--bg-surface-elevated)',
                border: '1px solid var(--border-subtle)',
                borderRadius: '12px',
                padding: '14px 16px',
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
              }}
            >
              <div>
                <div style={{ fontWeight: 700, fontSize: '13.5px', color: 'var(--text-primary)' }}>
                  {svc.name}
                </div>
                <div style={{ fontSize: '11px', color: 'var(--text-muted)', fontFamily: 'JetBrains Mono' }}>
                  tier: {svc.tier || 'STANDARD'}
                </div>
              </div>
              <span className={`badge ${svc.active_incidents_count > 0 ? 'badge-critical' : svc.is_active ? 'badge-up' : 'badge-degraded'}`}>
                {svc.active_incidents_count > 0 ? `${svc.active_incidents_count} ALERTS` : svc.is_active ? 'HEALTHY' : 'INACTIVE'}
              </span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};
