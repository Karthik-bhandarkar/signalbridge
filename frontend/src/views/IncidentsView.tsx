import React, { useEffect, useState, useCallback } from 'react';
import {
  AlertTriangle,
  Search,
  RefreshCw,
  ChevronLeft,
  ChevronRight,
} from 'lucide-react';
import { api } from '../lib/api';
import type { Incident } from '../types';

interface IncidentsViewProps {
  onOpenIncidentDetail: (id: string) => void;
}

export const IncidentsView: React.FC<IncidentsViewProps> = ({ onOpenIncidentDetail }) => {
  const [incidents, setIncidents] = useState<Incident[]>([]);
  const [loading, setLoading] = useState(true);
  const [totalCount, setTotalCount] = useState(0);

  // Filters:
  const [statusFilter, setStatusFilter] = useState<string>('');
  const [severityFilter, setSeverityFilter] = useState<string>('');
  const [searchQuery, setSearchQuery] = useState('');
  const [page, setPage] = useState(1);

  const fetchIncidents = useCallback(async () => {
    try {
      setLoading(true);
      const res = await api.incidents.list({
        status: statusFilter,
        severity: severityFilter,
        search: searchQuery,
        page: page,
        page_size: 15,
      });
      setIncidents(res.results || []);
      setTotalCount(res.count || 0);
    } catch (err) {
      console.error('[IncidentsView] Error fetching incidents:', err);
    } finally {
      setLoading(false);
    }
  }, [statusFilter, severityFilter, searchQuery, page]);

  useEffect(() => {
    fetchIncidents();
  }, [fetchIncidents]);

  const handleSearchSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setPage(1);
    fetchIncidents();
  };

  const totalPages = Math.ceil(totalCount / 15) || 1;

  return (
    <div>
      {/* View Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
        <div>
          <h1 style={{ fontSize: '22px', fontWeight: 800, letterSpacing: '-0.02em' }}>
            Operational Incidents
          </h1>
          <p style={{ fontSize: '13px', color: 'var(--text-secondary)' }}>
            Correlated alert clusters grouped by service and deterministic fingerprint.
          </p>
        </div>
        <button onClick={fetchIncidents} className="btn btn-secondary btn-sm">
          <RefreshCw size={13} className={loading ? 'animate-spin' : ''} />
          Refresh
        </button>
      </div>

      {/* Filter Toolbar */}
      <div style={{
        background: 'var(--bg-surface)',
        border: '1px solid var(--border-subtle)',
        borderRadius: '10px',
        padding: '12px 16px',
        marginBottom: '20px',
        display: 'flex',
        flexWrap: 'wrap',
        justifyContent: 'space-between',
        alignItems: 'center',
        gap: '12px'
      }}>
        {/* Status Tabs */}
        <div style={{ display: 'flex', gap: '6px' }}>
          {[
            { label: 'All Incidents', value: '' },
            { label: 'Open', value: 'OPEN' },
            { label: 'Acknowledged', value: 'ACKNOWLEDGED' },
            { label: 'Resolved', value: 'RESOLVED' },
          ].map((tab) => {
            const isSelected = statusFilter === tab.value;
            return (
              <button
                key={tab.value}
                onClick={() => {
                  setStatusFilter(tab.value);
                  setPage(1);
                }}
                className={`btn btn-sm ${isSelected ? 'btn-primary' : 'btn-secondary'}`}
              >
                {tab.label}
              </button>
            );
          })}
        </div>

        {/* Search & Severity dropdown */}
        <div style={{ display: 'flex', gap: '10px', alignItems: 'center' }}>
          <select
            value={severityFilter}
            onChange={(e) => {
              setSeverityFilter(e.target.value);
              setPage(1);
            }}
            className="input"
            style={{ fontSize: '12px', padding: '6px 10px' }}
          >
            <option value="">All Severities</option>
            <option value="CRITICAL">Critical</option>
            <option value="HIGH">High</option>
            <option value="MEDIUM">Medium</option>
            <option value="LOW">Low</option>
          </select>

          <form onSubmit={handleSearchSubmit} style={{ display: 'flex', gap: '6px' }}>
            <div style={{ position: 'relative' }}>
              <Search size={14} style={{ position: 'absolute', left: '10px', top: '9px', color: 'var(--text-muted)' }} />
              <input
                type="text"
                placeholder="Search fingerprint, service..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="input"
                style={{ paddingLeft: '30px', fontSize: '12px', width: '220px' }}
              />
            </div>
            <button type="submit" className="btn btn-secondary btn-sm">Search</button>
          </form>
        </div>
      </div>

      {/* Incidents Table */}
      <div className="table-container">
        <table className="data-table">
          <thead>
            <tr>
              <th>Severity</th>
              <th>Service</th>
              <th>Fingerprint</th>
              <th>Status</th>
              <th>Alerts Count</th>
              <th>Assigned To</th>
              <th>Duration</th>
              <th>Last Signal</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr>
                <td colSpan={8} style={{ textAlign: 'center', padding: '40px', color: 'var(--text-muted)' }}>
                  Loading incident records...
                </td>
              </tr>
            ) : incidents.length === 0 ? (
              <tr>
                <td colSpan={8} style={{ textAlign: 'center', padding: '50px', color: 'var(--text-muted)' }}>
                  <AlertTriangle size={24} style={{ marginBottom: '8px', opacity: 0.5 }} />
                  <p>No incidents match the active filter criteria.</p>
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
                      inc.status === 'OPEN'
                        ? 'badge-critical'
                        : inc.status === 'ACKNOWLEDGED'
                        ? 'badge-medium'
                        : 'badge-up'
                    }`}>
                      {inc.status}
                    </span>
                  </td>
                  <td>
                    <span className="font-mono" style={{ fontWeight: 700 }}>{inc.alert_count}</span>
                  </td>
                  <td>
                    {inc.assigned_to ? (
                      <span style={{ color: 'var(--text-primary)', fontSize: '12px' }}>{inc.assigned_to}</span>
                    ) : (
                      <span style={{ color: 'var(--text-muted)', fontSize: '12px' }}>Unassigned</span>
                    )}
                  </td>
                  <td style={{ color: 'var(--text-secondary)', fontSize: '12px' }}>
                    {inc.duration_seconds > 0 ? `${inc.duration_seconds}s` : 'Immediate'}
                  </td>
                  <td style={{ color: 'var(--text-muted)', fontSize: '12px' }}>
                    {new Date(inc.last_seen_at).toLocaleTimeString()}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>

        {/* Pagination Bar */}
        <div style={{
          padding: '12px 20px',
          borderTop: '1px solid var(--border-subtle)',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          fontSize: '12px',
          color: 'var(--text-secondary)',
        }}>
          <div>
            Showing {incidents.length} of {totalCount} total incidents
          </div>
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
    </div>
  );
};
