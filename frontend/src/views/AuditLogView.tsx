import React, { useEffect, useState, useCallback } from 'react';
import {
  RefreshCw,
  User,
  ChevronLeft,
  ChevronRight,
} from 'lucide-react';
import { api } from '../lib/api';
import type { IncidentEvent } from '../types';

export const AuditLogView: React.FC = () => {
  const [events, setEvents] = useState<IncidentEvent[]>([]);
  const [totalCount, setTotalCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(1);
  const [eventTypeFilter, setEventTypeFilter] = useState('');

  const fetchAuditLog = useCallback(async () => {
    try {
      setLoading(true);
      const res = await api.audit.list({
        event_type: eventTypeFilter,
        page: page,
        page_size: 20,
      });
      setEvents(res.results || []);
      setTotalCount(res.count || 0);
    } catch (err) {
      console.error('[AuditLogView] Error loading audit logs:', err);
    } finally {
      setLoading(false);
    }
  }, [eventTypeFilter, page]);

  useEffect(() => {
    fetchAuditLog();
  }, [fetchAuditLog]);

  const totalPages = Math.ceil(totalCount / 20) || 1;

  return (
    <div>
      {/* View Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
        <div>
          <h1 style={{ fontSize: '22px', fontWeight: 800, letterSpacing: '-0.02em' }}>
            System Audit Trail
          </h1>
          <p style={{ fontSize: '13px', color: 'var(--text-secondary)' }}>
            Immutable chronological record of automated transitions, operator interventions, and triage notes.
          </p>
        </div>
        <div style={{ display: 'flex', gap: '10px' }}>
          <select
            value={eventTypeFilter}
            onChange={(e) => {
              setEventTypeFilter(e.target.value);
              setPage(1);
            }}
            className="input"
            style={{ fontSize: '12px' }}
          >
            <option value="">All Event Types</option>
            <option value="CREATED">Incident Created</option>
            <option value="ACKNOWLEDGED">Acknowledged</option>
            <option value="ASSIGNED">Assigned</option>
            <option value="RESOLVED">Resolved</option>
            <option value="REOPENED">Reopened</option>
            <option value="NOTE_ADDED">Note Added</option>
          </select>
          <button onClick={fetchAuditLog} className="btn btn-secondary btn-sm">
            <RefreshCw size={13} className={loading ? 'animate-spin' : ''} />
            Refresh
          </button>
        </div>
      </div>

      {/* Audit Events Table */}
      <div className="table-container">
        <table className="data-table">
          <thead>
            <tr>
              <th>Action Category</th>
              <th>Description / Operational Mutation</th>
              <th>Actor</th>
              <th>Timestamp</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr>
                <td colSpan={4} style={{ textAlign: 'center', padding: '40px', color: 'var(--text-muted)' }}>
                  Loading audit log events...
                </td>
              </tr>
            ) : events.length === 0 ? (
              <tr>
                <td colSpan={4} style={{ textAlign: 'center', padding: '40px', color: 'var(--text-muted)' }}>
                  No audit log entries recorded.
                </td>
              </tr>
            ) : (
              events.map((evt) => (
                <tr key={evt.id}>
                  <td>
                    <span className={`badge ${
                      evt.event_type === 'RESOLVED'
                        ? 'badge-up'
                        : evt.event_type === 'REOPENED' || evt.event_type === 'CREATED'
                        ? 'badge-critical'
                        : 'badge-low'
                    }`} style={{ fontSize: '10px' }}>
                      {evt.event_type}
                    </span>
                  </td>
                  <td style={{ color: 'var(--text-primary)', fontSize: '13px' }}>
                    {evt.description}
                  </td>
                  <td>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '12px', color: 'var(--text-secondary)' }}>
                      <User size={13} style={{ color: 'var(--text-muted)' }} />
                      <strong>{evt.actor}</strong>
                    </div>
                  </td>
                  <td style={{ color: 'var(--text-muted)', fontSize: '12px', whiteSpace: 'nowrap' }}>
                    {new Date(evt.created_at).toLocaleString()}
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
          <div>Showing {events.length} of {totalCount} total audit records</div>
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
