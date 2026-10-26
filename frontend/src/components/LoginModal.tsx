import React, { useState, useEffect } from 'react';
import { X, Lock, User, AlertCircle, Shield, Eye, Sparkles } from 'lucide-react';
import { api } from '../lib/api';
import { useToast } from '../context/ToastContext';
import type { AuthUser } from '../types';

interface LoginModalProps {
  onClose: () => void;
  onSuccess: (user: AuthUser) => void;
  initialRole?: 'viewer' | 'admin';
}

export const LoginModal: React.FC<LoginModalProps> = ({
  onClose,
  onSuccess,
  initialRole = 'viewer',
}) => {
  const { toast } = useToast();
  const [selectedRole, setSelectedRole] = useState<'viewer' | 'admin'>(initialRole);
  const [username, setUsername] = useState(initialRole === 'admin' ? 'admin' : 'viewer');
  const [password, setPassword] = useState(initialRole === 'admin' ? 'Admin123!' : 'Viewer123!');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [onClose]);

  const selectRole = (role: 'viewer' | 'admin') => {
    setSelectedRole(role);
    setError(null);
    if (role === 'viewer') {
      setUsername('viewer');
      setPassword('Viewer123!');
    } else {
      setUsername('admin');
      setPassword('Admin123!');
    }
  };

  const handleLogin = async (userToAuth: string, passToAuth: string) => {
    try {
      setLoading(true);
      setError(null);
      const res = await api.auth.login({ username: userToAuth, password: passToAuth });
      const roleLabel = res.user.is_staff ? 'Lead Administrator' : 'Demo Viewer (Read-Only)';
      toast.success(`Authenticated as ${res.user.username} (${roleLabel})`);
      onSuccess(res.user);
      onClose();
    } catch (err: any) {
      setError(err.message || 'Login failed. Verify operator credentials.');
    } finally {
      setLoading(false);
    }
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!username || !password) return;
    handleLogin(username, password);
  };

  const handleQuickGuestLogin = () => {
    selectRole('viewer');
    handleLogin('viewer', 'Viewer123!');
  };

  return (
    <div
      className="modal-overlay"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-labelledby="login-modal-title"
      style={{
        backdropFilter: 'blur(8px)',
        backgroundColor: 'rgba(15, 23, 42, 0.45)',
      }}
    >
      <div
        className="modal-content"
        onClick={(e) => e.stopPropagation()}
        style={{
          maxWidth: '460px',
          borderRadius: '20px',
          overflow: 'hidden',
          position: 'relative',
          border: '1px solid var(--border-subtle)',
          background: 'var(--bg-surface)',
          boxShadow: '0 20px 40px -10px rgba(0, 0, 0, 0.12), 0 1px 3px rgba(0, 0, 0, 0.05)',
        }}
      >
        {/* Modal Header */}
        <div
          style={{
            padding: '24px 28px 16px',
            borderBottom: '1px solid var(--border-subtle)',
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
          }}
        >
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '4px' }}>
              <span
                style={{
                  width: '8px',
                  height: '8px',
                  borderRadius: '50%',
                  backgroundColor: '#0284c7',
                }}
              />
              <span style={{ fontSize: '11px', fontWeight: 700, letterSpacing: '0.06em', textTransform: 'uppercase', color: 'var(--color-primary)' }}>
                Perimeter Security Access
              </span>
            </div>
            <h3 id="login-modal-title" style={{ fontSize: '18px', fontWeight: 800, color: 'var(--text-primary)', letterSpacing: '-0.02em', margin: 0 }}>
              Operator Authentication
            </h3>
          </div>
          <button
            onClick={onClose}
            className="btn btn-secondary btn-sm"
            style={{ padding: '8px', borderRadius: '10px' }}
            aria-label="Close modal"
          >
            <X size={15} />
          </button>
        </div>

        {/* Role Selector Tabs */}
        <div style={{ padding: '16px 28px 0' }}>
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: '1fr 1fr',
              background: 'var(--bg-surface-elevated)',
              border: '1px solid var(--border-subtle)',
              borderRadius: '12px',
              padding: '4px',
              gap: '4px',
            }}
          >
            <button
              type="button"
              onClick={() => selectRole('viewer')}
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: '8px',
                padding: '9px 12px',
                borderRadius: '8px',
                fontSize: '12.5px',
                fontWeight: 700,
                border: 'none',
                cursor: 'pointer',
                transition: 'all 0.15s ease',
                backgroundColor: selectedRole === 'viewer' ? '#0284c7' : 'transparent',
                color: selectedRole === 'viewer' ? '#ffffff' : 'var(--text-secondary)',
                boxShadow: selectedRole === 'viewer' ? '0 1px 3px rgba(0, 0, 0, 0.1)' : 'none',
              }}
            >
              <Eye size={14} />
              <span>Demo Viewer</span>
            </button>

            <button
              type="button"
              onClick={() => selectRole('admin')}
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: '8px',
                padding: '9px 12px',
                borderRadius: '8px',
                fontSize: '12.5px',
                fontWeight: 700,
                border: 'none',
                cursor: 'pointer',
                transition: 'all 0.15s ease',
                backgroundColor: selectedRole === 'admin' ? '#0f172a' : 'transparent',
                color: selectedRole === 'admin' ? '#ffffff' : 'var(--text-secondary)',
                boxShadow: selectedRole === 'admin' ? '0 1px 3px rgba(0, 0, 0, 0.1)' : 'none',
              }}
            >
              <Shield size={14} />
              <span>Lead Admin</span>
            </button>
          </div>

          {/* Role Description Card */}
          <div
            style={{
              marginTop: '12px',
              padding: '12px 14px',
              borderRadius: '10px',
              background: selectedRole === 'viewer' ? 'rgba(2, 132, 199, 0.06)' : 'rgba(15, 23, 42, 0.04)',
              border: `1px solid ${selectedRole === 'viewer' ? 'rgba(2, 132, 199, 0.2)' : 'var(--border-subtle)'}`,
              fontSize: '12px',
              lineHeight: 1.45,
              color: 'var(--text-secondary)',
            }}
          >
            {selectedRole === 'viewer' ? (
              <div>
                <strong style={{ color: '#0284c7' }}>👁️ Read-Only Exploration Mode:</strong>
                <p style={{ margin: '4px 0 0', color: 'var(--text-secondary)' }}>
                  Inspect live incidents, query correlated alerts, view cold S3 JSON archives, and test simulated webhooks without administrative risk.
                </p>
              </div>
            ) : (
              <div>
                <strong style={{ color: 'var(--text-primary)' }}>🛡️ Full Administrator Mode:</strong>
                <p style={{ margin: '4px 0 0', color: 'var(--text-secondary)' }}>
                  Full control: create and configure webhook endpoints, rotate HMAC secrets, acknowledge, and resolve active production incidents.
                </p>
              </div>
            )}
          </div>
        </div>

        {/* Form Body */}
        <form onSubmit={handleSubmit} style={{ padding: '16px 28px 28px', display: 'flex', flexDirection: 'column', gap: '14px' }}>
          {error && (
            <div
              style={{
                background: 'rgba(244, 63, 94, 0.1)',
                border: '1px solid rgba(244, 63, 94, 0.3)',
                borderRadius: '10px',
                padding: '10px 14px',
                fontSize: '12px',
                color: '#f43f5e',
                display: 'flex',
                alignItems: 'center',
                gap: '8px',
              }}
            >
              <AlertCircle size={15} />
              <span>{error}</span>
            </div>
          )}

          <div>
            <label style={{ display: 'block', fontSize: '11.5px', fontWeight: 600, color: 'var(--text-secondary)', marginBottom: '6px' }}>
              Username
            </label>
            <div style={{ position: 'relative' }}>
              <User size={15} style={{ position: 'absolute', left: '12px', top: '12px', color: 'var(--text-muted)' }} />
              <input
                type="text"
                required
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                className="input"
                style={{
                  width: '100%',
                  paddingLeft: '36px',
                  backgroundColor: 'var(--bg-surface-elevated)',
                  borderColor: 'var(--border-subtle)',
                  color: 'var(--text-primary)',
                  borderRadius: '10px',
                  fontSize: '13px',
                }}
                placeholder="username"
              />
            </div>
          </div>

          <div>
            <label style={{ display: 'block', fontSize: '11.5px', fontWeight: 600, color: 'var(--text-secondary)', marginBottom: '6px' }}>
              Password
            </label>
            <div style={{ position: 'relative' }}>
              <Lock size={15} style={{ position: 'absolute', left: '12px', top: '12px', color: 'var(--text-muted)' }} />
              <input
                type="password"
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="input"
                style={{
                  width: '100%',
                  paddingLeft: '36px',
                  backgroundColor: 'var(--bg-surface-elevated)',
                  borderColor: 'var(--border-subtle)',
                  color: 'var(--text-primary)',
                  borderRadius: '10px',
                  fontSize: '13px',
                }}
                placeholder="password"
              />
            </div>
          </div>

          {/* Credentials Chip */}
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              fontSize: '11.5px',
              color: 'var(--text-secondary)',
              backgroundColor: 'var(--bg-surface-elevated)',
              padding: '8px 12px',
              borderRadius: '8px',
              border: '1px solid var(--border-subtle)',
              fontFamily: 'JetBrains Mono, monospace',
            }}
          >
            <span>Preset: <strong>{username}</strong></span>
            <span style={{ color: '#0284c7' }}>● {password}</span>
          </div>

          {/* Action Buttons */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', marginTop: '6px' }}>
            <button
              type="submit"
              disabled={loading}
              className="btn btn-primary"
              style={{
                width: '100%',
                padding: '10px',
                borderRadius: '10px',
                fontSize: '13.5px',
                fontWeight: 700,
                backgroundColor: selectedRole === 'viewer' ? '#0284c7' : '#0f172a',
                borderColor: selectedRole === 'viewer' ? '#0284c7' : '#0f172a',
              }}
            >
              {loading ? 'Authenticating...' : `Sign In as ${selectedRole === 'viewer' ? 'Demo Viewer' : 'Lead Admin'}`}
            </button>

            {selectedRole !== 'viewer' && (
              <button
                type="button"
                onClick={handleQuickGuestLogin}
                className="btn btn-secondary btn-sm"
                style={{
                  width: '100%',
                  padding: '9px',
                  borderRadius: '10px',
                  fontSize: '12px',
                  color: '#0284c7',
                }}
              >
                <Sparkles size={13} />
                <span>Switch to 1-Click Guest Viewer Login</span>
              </button>
            )}
          </div>
        </form>
      </div>
    </div>
  );
};
