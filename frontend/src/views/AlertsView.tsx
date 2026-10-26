import React, { useEffect, useState, useCallback } from 'react';
import {
  Search,
  RefreshCw,
  RotateCcw,
  X,
  FileCode,
  ChevronLeft,
  ChevronRight,
  Database,
} from 'lucide-react';
import { api } from '../lib/api';
import { useToast } from '../context/ToastContext';
import type { AlertDetail, AlertSummary } from '../types';

export const AlertsView: React.FC = () => {
  const { toast } = useToast();
  const [alerts, setAlerts] = useState<AlertSummary[]>([]);
  const [totalCount, setTotalCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [page, setPage] = useState(1);

  // Inspector modal state:
  const [selectedAlertId, setSelectedAlertId] = useState<string | null>(null);
  const [alertDetail, setAlertDetail] = useState<AlertDetail | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [retrying, setRetrying] = useState(false);

  const fetchAlerts = useCallback(async () => {
    try {
      setLoading(true);
      const res = await api.alerts.list({
        search: searchQuery,
        page: page,
        page_size: 15,
      });
      setAlerts(res.results || []);
      setTotalCount(res.count || 0);
    } catch (err) {
      console.error('[AlertsView] Error loading alerts:', err);
    } finally {
      setLoading(false);
    }
  }, [searchQuery, page]);

  useEffect(() => {
    fetchAlerts();
  }, [fetchAlerts]);

  const handleInspect = async (id: string) => {
    try {
      setSelectedAlertId(id);
      setDetailLoading(true);
      const detail = await api.alerts.get(id);
      setAlertDetail(detail);
    } catch (err: any) {
      toast.error(`Failed to load alert detail: ${err.message}`);
    } finally {
      setDetailLoading(false);
    }
  };

  const handleManualRetry = async (id: string) => {
    try {
      setRetrying(true);
      const res = await api.alerts.retry(id);
      toast.success(`Retry dispatched: ${res.message}`);
    } catch (err: any) {
      toast.error(`Manual retry failed: ${err.message}`);
    } finally {
      setRetrying(false);
    }
  };

  const totalPages = Math.ceil(totalCount / 15) || 1;

  return (
    <div>
      {/* View Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
        <div>
          <h1 style={{ fontSize: '22px', fontWeight: 800, letterSpacing: '-0.02em' }}>
            Alert Signals Feed
          </h1>
          <p style={{ fontSize: '13px', color: 'var(--text-secondary)' }}>
            Raw incoming alerts with deduplication fingerprints and S3 cold storage archives.
          </p>
        </div>
        <button onClick={fetchAlerts} className="btn btn-secondary btn-sm">
          <RefreshCw size={13} className={loading ? 'animate-spin' : ''} />
          Refresh Feed
        </button>
      </div>

      {/* Search Bar */}
      <form
        onSubmit={(e) => {
          e.preventDefault();
          setPage(1);
          fetchAlerts();
        }}
        style={{ marginBottom: '20px', display: 'flex', gap: '8px' }}
      >
        <div style={{ position: 'relative', flex: 1, maxWidth: '400px' }}>
          <Search size={14} style={{ position: 'absolute', left: '12px', top: '11px', color: 'var(--text-muted)' }} />
          <input
            type="text"
            placeholder="Search title, external ID, service..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="input"
            style={{ width: '100%', paddingLeft: '34px' }}
          />
        </div>
        <button type="submit" className="btn btn-secondary btn-sm">Search</button>
      </form>

      {/* Alerts Table */}
      <div className="table-container">
        <table className="data-table">
          <thead>
            <tr>
              <th>Severity</th>
              <th>Service</th>
              <th>Alert Title</th>
              <th>Source / Tracking ID</th>
              <th>External ID</th>
              <th>Dedup Hash</th>
              <th>Received</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr>
                <td colSpan={8} style={{ textAlign: 'center', padding: '40px', color: 'var(--text-muted)' }}>
                  Loading alert signals...
                </td>
              </tr>
            ) : alerts.length === 0 ? (
              <tr>
                <td colSpan={8} style={{ textAlign: 'center', padding: '40px', color: 'var(--text-muted)' }}>
                  No alerts found.
                </td>
              </tr>
            ) : (
              alerts.map((a) => (
                <tr key={a.id} onClick={() => handleInspect(a.id)}>
                  <td>
                    <span className={`badge badge-${a.severity.toLowerCase()}`}>
                      {a.severity}
                    </span>
                  </td>
                  <td style={{ fontWeight: 600 }}>{a.service_name}</td>
                  <td>{a.title}</td>
                  <td style={{ fontSize: '11px', color: 'var(--text-muted)' }}>
                    <div>{a.source_name || a.source_slug || 'Webhook'}</div>
                    <div className="font-mono">{a.tracking_id}</div>
                  </td>
                  <td>
                    {a.external_id ? (
                      <span className="font-mono" style={{ fontSize: '11px', color: 'var(--text-secondary)' }}>
                        {a.external_id}
                      </span>
                    ) : (
                      <span style={{ color: 'var(--text-muted)', fontSize: '11px' }}>-</span>
                    )}
                  </td>
                  <td>
                    <span className="font-mono" style={{ fontSize: '11px', color: 'var(--color-primary)' }}>
                      {a.deduplication_hash.slice(0, 10)}...
                    </span>
                  </td>
                  <td style={{ fontSize: '11px', color: 'var(--text-muted)' }}>
                    {new Date(a.created_at).toLocaleTimeString()}
                  </td>
                  <td onClick={(e) => e.stopPropagation()}>
                    <button
                      onClick={() => handleManualRetry(a.id)}
                      disabled={retrying}
                      className="btn btn-secondary btn-sm"
                      style={{ padding: '4px 8px', fontSize: '11px' }}
                      title="Re-enqueue payload to background Celery queue"
                    >
                      <RotateCcw size={12} />
                      Retry
                    </button>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>

        {/* Pagination */}
        <div style={{
          padding: '12px 20px',
          borderTop: '1px solid var(--border-subtle)',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          fontSize: '12px',
          color: 'var(--text-secondary)',
        }}>
          <div>Showing {alerts.length} of {totalCount} total alert records</div>
          <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
            <button
              onClick={() => setPage(Math.max(1, page - 1))}
              disabled={page <= 1}
              className="btn btn-secondary btn-sm"
              style={{ padding: '4px 8px' }}
            >
              <ChevronLeft size={14} />
            </button>
            <span>Page {page} of {totalPages}</span>
            <button
              onClick={() => setPage(Math.min(totalPages, page + 1))}
              disabled={page >= totalPages}
              className="btn btn-secondary btn-sm"
              style={{ padding: '4px 8px' }}
            >
              <ChevronRight size={14} />
            </button>
          </div>
        </div>
      </div>

      {/* Alert JSON Inspector Modal */}
      {selectedAlertId && (
        <div className="modal-overlay" onClick={() => setSelectedAlertId(null)}>
          <div className="modal-content" onClick={(e) => e.stopPropagation()} style={{ maxWidth: '700px' }}>
            <div style={{
              padding: '16px 20px',
              borderBottom: '1px solid var(--border-subtle)',
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
            }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <FileCode size={16} style={{ color: 'var(--color-primary)' }} />
                <h3 style={{ fontSize: '15px', fontWeight: 700 }}>Alert Payload Intelligence</h3>
              </div>
              <button onClick={() => setSelectedAlertId(null)} className="btn btn-secondary btn-sm" style={{ padding: '4px' }}>
                <X size={14} />
              </button>
            </div>

            {detailLoading ? (
              <div style={{ padding: '40px', textAlign: 'center', color: 'var(--text-muted)' }}>
                Loading payload metadata...
              </div>
            ) : alertDetail ? (
              <div style={{ padding: '20px', display: 'flex', flexDirection: 'column', gap: '16px' }}>
                <div>
                  <h4 style={{ fontSize: '16px', fontWeight: 700, marginBottom: '4px' }}>{alertDetail.title}</h4>
                  <p style={{ fontSize: '13px', color: 'var(--text-secondary)' }}>{alertDetail.description || 'No description provided.'}</p>
                </div>

                {/* S3 Archival State */}
                <div style={{
                  background: 'var(--bg-surface-elevated)',
                  border: '1px solid var(--border-subtle)',
                  borderRadius: '8px',
                  padding: '12px 14px',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  fontSize: '12px',
                }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <Database size={15} style={{ color: 'var(--color-primary)' }} />
                    <span>Tiered S3 Cold Storage:</span>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <span className={`badge ${
                      alertDetail.archive_status === 'ARCHIVED'
                        ? 'badge-up'
                        : alertDetail.archive_status === 'FAILED'
                        ? 'badge-down'
                        : 'badge-medium'
                    }`}>
                      {alertDetail.archive_status || 'NOT_STARTED'}
                    </span>
                    {alertDetail.s3_payload_key && (
                      <span className="font-mono" style={{ fontSize: '11px', color: 'var(--text-muted)' }}>
                        {alertDetail.s3_payload_key}
                      </span>
                    )}
                  </div>
                </div>

                {/* Raw Metadata JSON */}
                <div>
                  <div style={{ fontSize: '12px', fontWeight: 600, color: 'var(--text-secondary)', marginBottom: '6px' }}>
                    Raw Normalized Metadata (JSON):
                  </div>
                  <pre
                    className="font-mono"
                    style={{
                      background: 'var(--bg-base)',
                      border: '1px solid var(--border-subtle)',
                      borderRadius: '8px',
                      padding: '14px',
                      fontSize: '12px',
                      color: '#a5b4fc',
                      overflowX: 'auto',
                      maxHeight: '260px',
                    }}
                  >
                    {JSON.stringify(alertDetail.raw_metadata || {}, null, 2)}
                  </pre>
                </div>
              </div>
            ) : null}
          </div>
        </div>
      )}
    </div>
  );
};
