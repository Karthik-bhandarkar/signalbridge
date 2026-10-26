import React, { useEffect, useState, useCallback } from 'react';
import {
  X,
  CheckCircle,
  UserCheck,
  RotateCcw,
  Clock,
  Layers,
  Send,
} from 'lucide-react';
import { api } from '../lib/api';
import { useToast } from '../context/ToastContext';
import type { IncidentDetail } from '../types';

interface IncidentDetailModalProps {
  incidentId: string;
  onClose: () => void;
  onRefreshList: () => void;
}

export const IncidentDetailModal: React.FC<IncidentDetailModalProps> = ({
  incidentId,
  onClose,
  onRefreshList,
}) => {
  const { toast } = useToast();
  const [incident, setIncident] = useState<IncidentDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Action states:
  const [showAssignInput, setShowAssignInput] = useState(false);
  const [assignee, setAssignee] = useState('');

  const [showResolveInput, setShowResolveInput] = useState(false);
  const [resolutionNotes, setResolutionNotes] = useState('');

  const [showReopenInput, setShowReopenInput] = useState(false);
  const [reopenReason, setReopenReason] = useState('');

  const [noteText, setNoteText] = useState('');
  const [submittingAction, setSubmittingAction] = useState(false);

  const fetchDetail = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const data = await api.incidents.get(incidentId);
      setIncident(data);
      setAssignee(data.assigned_to || '');
    } catch (err: any) {
      setError(err.message || 'Failed to load incident detail');
    } finally {
      setLoading(false);
    }
  }, [incidentId]);

  useEffect(() => {
    fetchDetail();
  }, [fetchDetail]);

  // Keyboard Escape listener
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [onClose]);

  const handleAcknowledge = async () => {
    try {
      setSubmittingAction(true);
      await api.incidents.acknowledge(incidentId);
      toast.success('Incident acknowledged');
      await fetchDetail();
      onRefreshList();
    } catch (err: any) {
      toast.error(`Acknowledge failed: ${err.message}`);
    } finally {
      setSubmittingAction(false);
    }
  };

  const handleAssign = async () => {
    if (!assignee.trim()) return;
    try {
      setSubmittingAction(true);
      await api.incidents.assign(incidentId, assignee.trim());
      toast.success(`Assigned to ${assignee.trim()}`);
      setShowAssignInput(false);
      await fetchDetail();
      onRefreshList();
    } catch (err: any) {
      toast.error(`Assignment failed: ${err.message}`);
    } finally {
      setSubmittingAction(false);
    }
  };

  const handleResolve = async () => {
    if (!resolutionNotes.trim()) {
      toast.warning('Please provide resolution notes explaining root cause.');
      return;
    }
    try {
      setSubmittingAction(true);
      await api.incidents.resolve(incidentId, resolutionNotes.trim());
      toast.success('Incident resolved');
      setShowResolveInput(false);
      await fetchDetail();
      onRefreshList();
    } catch (err: any) {
      toast.error(`Resolution failed: ${err.message}`);
    } finally {
      setSubmittingAction(false);
    }
  };

  const handleReopen = async () => {
    if (!reopenReason.trim()) {
      toast.warning('Please state a reason for reopening.');
      return;
    }
    try {
      setSubmittingAction(true);
      await api.incidents.reopen(incidentId, reopenReason.trim());
      toast.info('Incident reopened');
      setShowReopenInput(false);
      await fetchDetail();
      onRefreshList();
    } catch (err: any) {
      toast.error(`Reopen failed: ${err.message}`);
    } finally {
      setSubmittingAction(false);
    }
  };

  const handleAddNote = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!noteText.trim()) return;
    try {
      setSubmittingAction(true);
      await api.incidents.addNote(incidentId, noteText.trim());
      toast.success('Note added');
      setNoteText('');
      await fetchDetail();
    } catch (err: any) {
      toast.error(`Failed to add note: ${err.message}`);
    } finally {
      setSubmittingAction(false);
    }
  };

  return (
    <div
      className="modal-overlay"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-labelledby="incident-modal-title"
    >
      <div className="modal-content" onClick={(e) => e.stopPropagation()} style={{ maxWidth: '820px' }}>
        {/* Modal Header */}
        <div style={{
          padding: '20px 24px',
          borderBottom: '1px solid var(--border-subtle)',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'flex-start',
        }}>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '8px' }}>
              <span className={`badge badge-${(incident?.severity || 'medium').toLowerCase()}`}>
                {incident?.severity}
              </span>
              <span className={`badge ${
                incident?.status === 'OPEN'
                  ? 'badge-critical'
                  : incident?.status === 'ACKNOWLEDGED'
                  ? 'badge-medium'
                  : 'badge-up'
              }`}>
                {incident?.status}
              </span>
              <span style={{ fontSize: '13px', color: 'var(--text-muted)' }}>
                Service: <strong style={{ color: 'var(--text-primary)' }}>{incident?.service_name}</strong>
              </span>
            </div>
            <h2 id="incident-modal-title" style={{ fontSize: '18px', fontWeight: 700, letterSpacing: '-0.01em' }}>
              {incident?.fingerprint}
            </h2>
          </div>
          <button onClick={onClose} className="btn btn-secondary btn-sm" style={{ padding: '6px' }}>
            <X size={16} />
          </button>
        </div>

        {/* Modal Body */}
        {loading ? (
          <div style={{ padding: '60px', textAlign: 'center', color: 'var(--text-secondary)' }}>
            Loading incident intelligence...
          </div>
        ) : error ? (
          <div style={{ padding: '40px', color: 'var(--severity-critical)', textAlign: 'center' }}>
            {error}
          </div>
        ) : incident ? (
          <div style={{ padding: '24px', display: 'flex', flexDirection: 'column', gap: '24px' }}>
            {/* Action Bar */}
            <div style={{
              background: 'var(--bg-surface-elevated)',
              padding: '12px 16px',
              borderRadius: '8px',
              display: 'flex',
              flexWrap: 'wrap',
              gap: '10px',
              alignItems: 'center',
              border: '1px solid var(--border-subtle)'
            }}>
              {incident.status === 'OPEN' && (
                <button
                  onClick={handleAcknowledge}
                  disabled={submittingAction}
                  className="btn btn-primary btn-sm"
                >
                  <CheckCircle size={14} />
                  Acknowledge Incident
                </button>
              )}

              <button
                onClick={() => setShowAssignInput(!showAssignInput)}
                className="btn btn-secondary btn-sm"
              >
                <UserCheck size={14} />
                {incident.assigned_to ? `Assigned: ${incident.assigned_to}` : 'Assign Operator'}
              </button>

              {incident.status !== 'RESOLVED' ? (
                <button
                  onClick={() => setShowResolveInput(!showResolveInput)}
                  className="btn btn-success btn-sm"
                >
                  <CheckCircle size={14} />
                  Resolve Incident
                </button>
              ) : (
                <button
                  onClick={() => setShowReopenInput(!showReopenInput)}
                  className="btn btn-danger btn-sm"
                >
                  <RotateCcw size={14} />
                  Reopen Incident
                </button>
              )}
            </div>

            {/* Inline Action Forms */}
            {showAssignInput && (
              <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                <input
                  type="text"
                  placeholder="Operator username or oncall-team"
                  value={assignee}
                  onChange={(e) => setAssignee(e.target.value)}
                  className="input"
                  style={{ flex: 1 }}
                />
                <button onClick={handleAssign} disabled={submittingAction} className="btn btn-primary btn-sm">
                  Save Assignee
                </button>
              </div>
            )}

            {showResolveInput && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                <textarea
                  rows={3}
                  placeholder="Describe root cause and resolution fix (required)..."
                  value={resolutionNotes}
                  onChange={(e) => setResolutionNotes(e.target.value)}
                  className="input"
                  style={{ width: '100%', resize: 'vertical' }}
                />
                <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '8px' }}>
                  <button onClick={() => setShowResolveInput(false)} className="btn btn-secondary btn-sm">Cancel</button>
                  <button onClick={handleResolve} disabled={submittingAction} className="btn btn-success btn-sm">
                    Confirm Resolution
                  </button>
                </div>
              </div>
            )}

            {showReopenInput && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                <input
                  type="text"
                  placeholder="Reason for manual reopening (e.g. error rate re-spiked)..."
                  value={reopenReason}
                  onChange={(e) => setReopenReason(e.target.value)}
                  className="input"
                />
                <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '8px' }}>
                  <button onClick={() => setShowReopenInput(false)} className="btn btn-secondary btn-sm">Cancel</button>
                  <button onClick={handleReopen} disabled={submittingAction} className="btn btn-danger btn-sm">
                    Confirm Reopen
                  </button>
                </div>
              </div>
            )}

            {incident.resolution_notes && (
              <div style={{
                background: 'rgba(16, 185, 129, 0.08)',
                border: '1px solid rgba(16, 185, 129, 0.25)',
                padding: '14px 16px',
                borderRadius: '8px',
                fontSize: '13px'
              }}>
                <strong style={{ color: 'var(--status-up)', display: 'block', marginBottom: '4px' }}>
                  Resolution Notes:
                </strong>
                <p style={{ color: 'var(--text-secondary)' }}>{incident.resolution_notes}</p>
              </div>
            )}

            {/* Incident Metrics Grid */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '12px' }}>
              <div className="card" style={{ padding: '12px' }}>
                <span style={{ fontSize: '11px', color: 'var(--text-muted)' }}>Correlated Alerts</span>
                <p style={{ fontSize: '18px', fontWeight: 700, color: 'var(--text-primary)' }}>{incident.alert_count}</p>
              </div>
              <div className="card" style={{ padding: '12px' }}>
                <span style={{ fontSize: '11px', color: 'var(--text-muted)' }}>Duration</span>
                <p style={{ fontSize: '18px', fontWeight: 700, color: 'var(--text-primary)' }}>
                  {incident.duration_seconds > 0 ? `${incident.duration_seconds}s` : 'Immediate'}
                </p>
              </div>
              <div className="card" style={{ padding: '12px' }}>
                <span style={{ fontSize: '11px', color: 'var(--text-muted)' }}>First Triggered</span>
                <p style={{ fontSize: '12px', fontWeight: 600, color: 'var(--text-secondary)' }}>
                  {new Date(incident.first_seen_at).toLocaleTimeString()}
                </p>
              </div>
              <div className="card" style={{ padding: '12px' }}>
                <span style={{ fontSize: '11px', color: 'var(--text-muted)' }}>Latest Signal</span>
                <p style={{ fontSize: '12px', fontWeight: 600, color: 'var(--text-secondary)' }}>
                  {new Date(incident.last_seen_at).toLocaleTimeString()}
                </p>
              </div>
            </div>

            {/* Correlated Alerts Feed */}
            <div>
              <h3 style={{ fontSize: '14px', fontWeight: 700, marginBottom: '12px', display: 'flex', alignItems: 'center', gap: '8px' }}>
                <Layers size={16} style={{ color: 'var(--color-primary)' }} />
                Correlated Incoming Alerts ({incident.alerts.length})
              </h3>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', maxHeight: '200px', overflowY: 'auto' }}>
                {incident.alerts.map((alert) => (
                  <div
                    key={alert.id}
                    style={{
                      background: 'var(--bg-surface-elevated)',
                      border: '1px solid var(--border-subtle)',
                      borderRadius: '8px',
                      padding: '12px 14px',
                      display: 'flex',
                      justifyContent: 'space-between',
                      alignItems: 'center',
                      fontSize: '12px',
                    }}
                  >
                    <div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '4px' }}>
                        <span className={`badge badge-${alert.severity.toLowerCase()}`} style={{ fontSize: '9px', padding: '1px 5px' }}>
                          {alert.severity}
                        </span>
                        <strong style={{ color: 'var(--text-primary)' }}>{alert.title}</strong>
                        {alert.external_id && (
                          <span className="font-mono" style={{ color: 'var(--text-muted)', fontSize: '10px' }}>
                            ext:{alert.external_id}
                          </span>
                        )}
                      </div>
                      <div style={{ display: 'flex', gap: '12px', color: 'var(--text-muted)', fontSize: '11px' }}>
                        <span>Source: <strong style={{ color: 'var(--text-secondary)' }}>{alert.source_name || alert.source_slug || 'Webhook'}</strong></span>
                        <span className="font-mono">Tracking: {alert.tracking_id}</span>
                        <span className="font-mono">Dedup: {alert.deduplication_hash.slice(0, 10)}...</span>
                      </div>
                    </div>
                    <span style={{ color: 'var(--text-muted)', fontSize: '11px' }}>
                      {new Date(alert.created_at).toLocaleTimeString()}
                    </span>
                  </div>
                ))}
              </div>
            </div>

            {/* Timeline Audit Events */}
            <div>
              <h3 style={{ fontSize: '14px', fontWeight: 700, marginBottom: '12px', display: 'flex', alignItems: 'center', gap: '8px' }}>
                <Clock size={16} style={{ color: 'var(--color-primary)' }} />
                Lifecycle Timeline & Audit Log
              </h3>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', maxHeight: '220px', overflowY: 'auto' }}>
                {incident.events.map((evt) => (
                  <div
                    key={evt.id}
                    style={{
                      padding: '8px 12px',
                      borderLeft: '2px solid var(--color-primary)',
                      background: 'var(--bg-surface-elevated)',
                      borderRadius: '0 6px 6px 0',
                      fontSize: '12px',
                    }}
                  >
                    <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '2px' }}>
                      <span style={{ fontWeight: 600, color: 'var(--text-primary)' }}>{evt.event_type}</span>
                      <span style={{ color: 'var(--text-muted)', fontSize: '11px' }}>
                        {new Date(evt.created_at).toLocaleTimeString()} by <strong style={{ color: 'var(--text-secondary)' }}>{evt.actor}</strong>
                      </span>
                    </div>
                    <p style={{ color: 'var(--text-secondary)', fontSize: '12px' }}>{evt.description}</p>
                  </div>
                ))}
              </div>

              {/* Add Note Input */}
              <form onSubmit={handleAddNote} style={{ display: 'flex', gap: '8px', marginTop: '12px' }}>
                <input
                  type="text"
                  placeholder="Add investigation observation or runbook link..."
                  value={noteText}
                  onChange={(e) => setNoteText(e.target.value)}
                  className="input"
                  style={{ flex: 1 }}
                />
                <button type="submit" disabled={submittingAction || !noteText.trim()} className="btn btn-secondary btn-sm">
                  <Send size={13} />
                  Add Note
                </button>
              </form>
            </div>
          </div>
        ) : null}
      </div>
    </div>
  );
};
