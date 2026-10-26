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
        backdropFilter: 'blur(16px)',
        backgroundColor: 'rgba(6, 4, 10, 0.78)',
      }}
    >
      <div
        className="modal-content vexel-login-modal"
        onClick={(e) => e.stopPropagation()}
        style={{
          maxWidth: '460px',
          borderRadius: '24px',
          overflow: 'hidden',
          position: 'relative',
          border: '1px solid rgba(0, 131, 255, 0.35)',
          background: 'linear-gradient(145deg, rgba(0, 31, 76, 0.45) 0%, rgba(6, 4, 10, 0.95) 60%)',
          boxShadow: '0 20px 60px -15px rgba(0, 131, 255, 0.3), inset 0 1px 0 rgba(255, 255, 255, 0.2)',
        }}
      >
        {/* Ambient Vexel Blue Background Glow Orb */}
        <div
          style={{
            position: 'absolute',
            top: '-50px',
            right: '-30px',
            width: '200px',
            height: '200px',
            borderRadius: '50%',
            background: '#0083ff',
            filter: 'blur(90px)',
            opacity: 0.25,
            pointerEvents: 'none',
          }}
        />

        {/* Modal Header */}
        <div
          style={{
            padding: '24px 28px 16px',
            borderBottom: '1px solid rgba(255, 255, 255, 0.08)',
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            position: 'relative',
            zIndex: 1,
          }}
        >
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '4px' }}>
              <span
                style={{
                  width: '8px',
                  height: '8px',
                  borderRadius: '50%',
                  backgroundColor: '#0083ff',
                  boxShadow: '0 0 10px #0083ff',
                }}
              />
              <span style={{ fontSize: '11px', fontWeight: 700, letterSpacing: '0.06em', textTransform: 'uppercase', color: '#61acff' }}>
                SignalBridge Perimeter Access
              </span>
            </div>
            <h3 id="login-modal-title" style={{ fontSize: '19px', fontWeight: 800, color: '#fff', letterSpacing: '-0.02em', margin: 0 }}>
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
        <div style={{ padding: '16px 28px 0', position: 'relative', zIndex: 1 }}>
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: '1fr 1fr',
              background: 'rgba(255, 255, 255, 0.05)',
              border: '1px solid rgba(255, 255, 255, 0.1)',
              borderRadius: '14px',
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
                borderRadius: '10px',
                fontSize: '12.5px',
                fontWeight: 700,
                border: 'none',
                cursor: 'pointer',
                transition: 'all 0.2s ease',
                backgroundColor: selectedRole === 'viewer' ? '#0083ff' : 'transparent',
                color: selectedRole === 'viewer' ? '#fff' : 'rgba(255, 255, 255, 0.7)',
                boxShadow: selectedRole === 'viewer' ? '0 4px 14px rgba(0, 131, 255, 0.4)' : 'none',
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
                borderRadius: '10px',
                fontSize: '12.5px',
                fontWeight: 700,
                border: 'none',
                cursor: 'pointer',
                transition: 'all 0.2s ease',
                backgroundColor: selectedRole === 'admin' ? '#4f46e5' : 'transparent',
                color: selectedRole === 'admin' ? '#fff' : 'rgba(255, 255, 255, 0.7)',
                boxShadow: selectedRole === 'admin' ? '0 4px 14px rgba(79, 70, 229, 0.4)' : 'none',
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
              borderRadius: '12px',
              background: selectedRole === 'viewer' ? 'rgba(0, 131, 255, 0.08)' : 'rgba(79, 70, 229, 0.08)',
              border: `1px solid ${selectedRole === 'viewer' ? 'rgba(0, 131, 255, 0.25)' : 'rgba(79, 70, 229, 0.25)'}`,
              fontSize: '12px',
              lineHeight: 1.45,
              color: 'rgba(255, 255, 255, 0.85)',
            }}
          >
            {selectedRole === 'viewer' ? (
              <div>
                <strong style={{ color: '#61acff' }}>👁️ Read-Only Exploration Mode:</strong>
                <p style={{ margin: '4px 0 0', color: 'rgba(255, 255, 255, 0.7)' }}>
                  Inspect live incidents, query correlated alerts, view cold S3 JSON archives, and test simulated webhooks without administrative risk.
                </p>
              </div>
            ) : (
              <div>
                <strong style={{ color: '#a5b4fc' }}>🛡️ Full Administrator Mode:</strong>
                <p style={{ margin: '4px 0 0', color: 'rgba(255, 255, 255, 0.7)' }}>
                  Full control: create and configure webhook endpoints, rotate HMAC secrets, acknowledge, and resolve active production incidents.
                </p>
              </div>
            )}
          </div>
        </div>

        {/* Form Body */}
        <form onSubmit={handleSubmit} style={{ padding: '16px 28px 28px', display: 'flex', flexDirection: 'column', gap: '14px', position: 'relative', zIndex: 1 }}>
          {error && (
            <div
              style={{
                background: 'rgba(244, 63, 94, 0.14)',
                border: '1px solid rgba(244, 63, 94, 0.35)',
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
            <label style={{ display: 'block', fontSize: '11.5px', fontWeight: 600, color: 'rgba(255, 255, 255, 0.75)', marginBottom: '6px' }}>
              Username
            </label>
            <div style={{ position: 'relative' }}>
              <User size={15} style={{ position: 'absolute', left: '12px', top: '12px', color: 'rgba(255, 255, 255, 0.4)' }} />
              <input
                type="text"
                required
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                className="input"
                style={{
                  width: '100%',
                  paddingLeft: '36px',
                  backgroundColor: 'rgba(0, 0, 0, 0.45)',
                  borderColor: 'rgba(255, 255, 255, 0.12)',
                  color: '#fff',
                  borderRadius: '10px',
                  fontSize: '13px',
                }}
                placeholder="username"
              />
            </div>
          </div>

          <div>
            <label style={{ display: 'block', fontSize: '11.5px', fontWeight: 600, color: 'rgba(255, 255, 255, 0.75)', marginBottom: '6px' }}>
              Password
            </label>
            <div style={{ position: 'relative' }}>
              <Lock size={15} style={{ position: 'absolute', left: '12px', top: '12px', color: 'rgba(255, 255, 255, 0.4)' }} />
              <input
                type="password"
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="input"
                style={{
                  width: '100%',
                  paddingLeft: '36px',
                  backgroundColor: 'rgba(0, 0, 0, 0.45)',
                  borderColor: 'rgba(255, 255, 255, 0.12)',
                  color: '#fff',
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
              color: 'rgba(255, 255, 255, 0.65)',
              backgroundColor: 'rgba(255, 255, 255, 0.04)',
              padding: '8px 12px',
              borderRadius: '8px',
              fontFamily: 'JetBrains Mono, monospace',
            }}
          >
            <span>Auto-fill: <strong>{username}</strong></span>
            <span style={{ color: '#0083ff' }}>● {password}</span>
          </div>

          {/* Action Buttons */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', marginTop: '6px' }}>
            <button
              type="submit"
              disabled={loading}
              className="btn btn-primary"
              style={{
                width: '100%',
                padding: '11px',
                borderRadius: '12px',
                fontSize: '13.5px',
                fontWeight: 700,
                backgroundColor: selectedRole === 'viewer' ? '#0083ff' : '#4f46e5',
                borderColor: selectedRole === 'viewer' ? '#0083ff' : '#4f46e5',
                boxShadow: selectedRole === 'viewer' ? '0 4px 18px rgba(0, 131, 255, 0.45)' : '0 4px 18px rgba(79, 70, 229, 0.45)',
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
                  color: '#61acff',
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
