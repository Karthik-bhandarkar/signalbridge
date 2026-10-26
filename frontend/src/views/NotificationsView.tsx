import React, { useEffect, useState, useCallback } from 'react';
import {
  Plus,
  Send,
  RefreshCw,
  X,
} from 'lucide-react';
import { api } from '../lib/api';
import { useToast } from '../context/ToastContext';
import type { NotificationDelivery, NotificationDestination } from '../types';

export const NotificationsView: React.FC = () => {
  const { toast } = useToast();
  const [destinations, setDestinations] = useState<NotificationDestination[]>([]);
  const [deliveries, setDeliveries] = useState<NotificationDelivery[]>([]);
  const [loading, setLoading] = useState(true);

  // New Destination Modal:
  const [showNewModal, setShowNewModal] = useState(false);
  const [name, setName] = useState('');
  const [destType, setDestType] = useState<'WEBHOOK' | 'SLACK' | 'PAGERDUTY' | 'CONSOLE'>('CONSOLE');
  const [endpointUrl, setEndpointUrl] = useState('');
  const [authHeader, setAuthHeader] = useState('');

  const loadData = useCallback(async () => {
    try {
      setLoading(true);
      const [dests, dels] = await Promise.all([
        api.notifications.destinations(),
        api.notifications.deliveries(),
      ]);
      setDestinations(dests || []);
      setDeliveries(dels || []);
    } catch (err) {
      console.error('[NotificationsView] Error loading data:', err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const handleCreateDestination = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await api.notifications.createDestination({
        name,
        destination_type: destType,
        endpoint_url: endpointUrl,
        auth_header: authHeader,
      });
      toast.success(`Destination '${name}' configured`);
      setShowNewModal(false);
      setName('');
      setEndpointUrl('');
      setAuthHeader('');
      await loadData();
    } catch (err: any) {
      toast.error(`Failed to create destination: ${err.message}`);
    }
  };

  const handleToggleActive = async (dest: NotificationDestination) => {
    try {
      await api.notifications.patchDestination(dest.id, { is_active: !dest.is_active });
      toast.success(`Destination '${dest.name}' ${dest.is_active ? 'disabled' : 'enabled'}`);
      await loadData();
    } catch (err: any) {
      toast.error(`Toggle failed: ${err.message}`);
    }
  };

  return (
    <div>
      {/* View Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
        <div>
          <h1 style={{ fontSize: '22px', fontWeight: 800, letterSpacing: '-0.02em' }}>
            Outbound Notifications
          </h1>
          <p style={{ fontSize: '13px', color: 'var(--text-secondary)' }}>
            Configured downstream dispatch channels and delivery audit logs for incident lifecycle events.
          </p>
        </div>
        <div style={{ display: 'flex', gap: '10px' }}>
          <button onClick={loadData} className="btn btn-secondary btn-sm">
            <RefreshCw size={13} className={loading ? 'animate-spin' : ''} />
            Refresh
          </button>
          <button onClick={() => setShowNewModal(true)} className="btn btn-primary btn-sm">
            <Plus size={13} />
            Add Destination
          </button>
        </div>
      </div>

      {/* Destination Cards Grid */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '16px', marginBottom: '32px' }}>
        {destinations.map((d) => (
          <div key={d.id} className="card">
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '10px' }}>
              <div>
                <h3 style={{ fontSize: '15px', fontWeight: 700, color: 'var(--text-primary)' }}>{d.name}</h3>
                <span style={{ fontSize: '11px', color: 'var(--text-muted)' }}>Type: {d.destination_type}</span>
              </div>
              <span className={`badge ${d.is_active ? 'badge-up' : 'badge-down'}`}>
                {d.is_active ? 'ACTIVE' : 'MUTED'}
              </span>
            </div>
            {d.endpoint_url && (
              <div className="font-mono" style={{ fontSize: '11px', color: 'var(--text-muted)', marginBottom: '14px', wordBreak: 'break-all' }}>
                {d.endpoint_url}
              </div>
            )}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: '10px', fontSize: '12px' }}>
              <span style={{ color: 'var(--text-secondary)' }}>{d.deliveries_count} Dispatches</span>
              <button
                onClick={() => handleToggleActive(d)}
                className={`btn btn-sm ${d.is_active ? 'btn-secondary' : 'btn-success'}`}
                style={{ padding: '3px 8px', fontSize: '11px' }}
              >
                {d.is_active ? 'Mute' : 'Enable'}
              </button>
            </div>
          </div>
        ))}
      </div>

      {/* Deliveries Audit Table */}
      <div className="table-container">
        <div style={{
          padding: '16px 20px',
          borderBottom: '1px solid var(--border-subtle)',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
        }}>
          <h3 style={{ fontSize: '14px', fontWeight: 700, display: 'flex', alignItems: 'center', gap: '8px' }}>
            <Send size={15} style={{ color: 'var(--color-primary)' }} />
            Notification Delivery History
          </h3>
          <span style={{ fontSize: '12px', color: 'var(--text-muted)' }}>Latest {deliveries.length} Dispatches</span>
        </div>

        <table className="data-table">
          <thead>
            <tr>
              <th>Status</th>
              <th>Destination</th>
              <th>Channel Type</th>
              <th>Event Type</th>
              <th>HTTP Status Code</th>
              <th>Timestamp</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr>
                <td colSpan={6} style={{ textAlign: 'center', padding: '40px', color: 'var(--text-muted)' }}>
                  Loading delivery logs...
                </td>
              </tr>
            ) : deliveries.length === 0 ? (
              <tr>
                <td colSpan={6} style={{ textAlign: 'center', padding: '40px', color: 'var(--text-muted)' }}>
                  No outbound deliveries dispatched yet.
                </td>
              </tr>
            ) : (
              deliveries.map((del) => (
                <tr key={del.id}>
                  <td>
                    <span className={`badge ${del.status === 'DELIVERED' ? 'badge-up' : 'badge-down'}`}>
                      {del.status}
                    </span>
                  </td>
                  <td style={{ fontWeight: 600 }}>{del.destination_name}</td>
                  <td style={{ color: 'var(--text-secondary)' }}>{del.destination_type}</td>
                  <td>
                    <span className="badge badge-low" style={{ fontSize: '10px' }}>
                      {del.event_type}
                    </span>
                  </td>
                  <td>
                    <span className="font-mono" style={{ fontSize: '12px' }}>
                      {del.response_status_code || '-'}
                    </span>
                  </td>
                  <td style={{ color: 'var(--text-muted)', fontSize: '12px' }}>
                    {new Date(del.delivered_at).toLocaleTimeString()}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {/* New Destination Modal */}
      {showNewModal && (
        <div className="modal-overlay" onClick={() => setShowNewModal(false)}>
          <div className="modal-content" onClick={(e) => e.stopPropagation()} style={{ maxWidth: '480px' }}>
            <div style={{ padding: '16px 20px', borderBottom: '1px solid var(--border-subtle)', display: 'flex', justifyContent: 'space-between' }}>
              <h3 style={{ fontSize: '15px', fontWeight: 700 }}>Add Notification Destination</h3>
              <button onClick={() => setShowNewModal(false)} className="btn btn-secondary btn-sm"><X size={14} /></button>
            </div>
            <form onSubmit={handleCreateDestination} style={{ padding: '20px', display: 'flex', flexDirection: 'column', gap: '14px' }}>
              <div>
                <label style={{ display: 'block', fontSize: '12px', fontWeight: 600, marginBottom: '6px' }}>Destination Label</label>
                <input
                  type="text"
                  required
                  placeholder="e.g. SRE Alerts Slack Webhook"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  className="input"
                  style={{ width: '100%' }}
                />
              </div>
              <div>
                <label style={{ display: 'block', fontSize: '12px', fontWeight: 600, marginBottom: '6px' }}>Channel Type</label>
                <select
                  value={destType}
                  onChange={(e) => setDestType(e.target.value as any)}
                  className="input"
                  style={{ width: '100%' }}
                >
                  <option value="CONSOLE">Console / Mock Local Delivery</option>
                  <option value="WEBHOOK">Generic Outbound Webhook (HTTP POST)</option>
                  <option value="SLACK">Slack Incoming Webhook</option>
                  <option value="PAGERDUTY">PagerDuty Events API v2</option>
                </select>
              </div>
              {destType !== 'CONSOLE' && (
                <>
                  <div>
                    <label style={{ display: 'block', fontSize: '12px', fontWeight: 600, marginBottom: '6px' }}>Endpoint URL</label>
                    <input
                      type="url"
                      required
                      placeholder="https://hooks.slack.com/services/..."
                      value={endpointUrl}
                      onChange={(e) => setEndpointUrl(e.target.value)}
                      className="input"
                      style={{ width: '100%' }}
                    />
                  </div>
                  <div>
                    <label style={{ display: 'block', fontSize: '12px', fontWeight: 600, marginBottom: '6px' }}>Authorization Header (Optional)</label>
                    <input
                      type="text"
                      placeholder="Bearer xoxb-..."
                      value={authHeader}
                      onChange={(e) => setAuthHeader(e.target.value)}
                      className="input"
                      style={{ width: '100%' }}
                    />
                  </div>
                </>
              )}
              <button type="submit" className="btn btn-primary" style={{ marginTop: '8px' }}>
                Save Destination
              </button>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
