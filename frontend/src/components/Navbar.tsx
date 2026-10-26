import React, { useEffect, useState } from 'react';
import { Activity, ShieldAlert, User, LogIn, LogOut, RefreshCw, Menu } from 'lucide-react';
import { api } from '../lib/api';
import type { AuthUser, HealthCheckResponse } from '../types';

interface NavbarProps {
  currentUser: AuthUser | null;
  onOpenLogin: () => void;
  onLogout: () => void;
  activeIncidentsCount: number;
  criticalCount: number;
  onToggleMobileNav?: () => void;
}

export const Navbar: React.FC<NavbarProps> = ({
  currentUser,
  onOpenLogin,
  onLogout,
  activeIncidentsCount,
  criticalCount,
  onToggleMobileNav,
}) => {
  const [health, setHealth] = useState<HealthCheckResponse | null>(null);
  const [isRefreshing, setIsRefreshing] = useState(false);

  const fetchHealth = async () => {
    try {
      setIsRefreshing(true);
      const res = await api.health.ready();
      setHealth(res);
    } catch {
      setHealth({
        status: 'unready',
        checks: { database: { status: 'offline' } },
        timestamp: new Date().toISOString(),
      });
    } finally {
      setIsRefreshing(false);
    }
  };

  useEffect(() => {
    fetchHealth();
    const interval = setInterval(fetchHealth, 15000);
    return () => clearInterval(interval);
  }, []);

  const isReady = health?.status === 'ready';

  return (
    <header className="top-navbar">
      {/* Brand & Perimeter Status */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
        {onToggleMobileNav && (
          <button
            type="button"
            className="mobile-nav-toggle"
            onClick={onToggleMobileNav}
            aria-label="Toggle navigation menu"
          >
            <Menu size={18} />
          </button>
        )}
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <div style={{
            width: '30px',
            height: '30px',
            borderRadius: '8px',
            background: 'linear-gradient(135deg, #2563eb, #1d4ed8)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            boxShadow: '0 0 15px rgba(37, 99, 235, 0.4)'
          }}>
            <Activity size={18} color="#fff" />
          </div>
          <span style={{ fontWeight: 800, fontSize: '16px', letterSpacing: '-0.02em' }}>
            Signal<span style={{ color: '#3b82f6' }}>Bridge</span>
          </span>
          <span style={{
            fontSize: '10px',
            background: 'rgba(255, 255, 255, 0.08)',
            padding: '2px 6px',
            borderRadius: '4px',
            color: 'var(--text-secondary)',
            fontWeight: 600
          }}>
            OPERATOR CORE
          </span>
        </div>

        {/* Health status pill */}
        <div
          onClick={fetchHealth}
          title="Click to check health"
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '8px',
            background: 'var(--bg-surface-elevated)',
            border: '1px solid var(--border-subtle)',
            padding: '4px 10px',
            borderRadius: '20px',
            fontSize: '12px',
            cursor: 'pointer',
          }}
        >
          <div className={`pulse-dot ${isReady ? 'dot-ready' : 'dot-unready'}`} />
          <span style={{ color: isReady ? 'var(--status-up)' : 'var(--status-down)', fontWeight: 600 }}>
            {isReady ? 'SYSTEM HEALTHY' : 'DEGRADED'}
          </span>
          <RefreshCw size={11} className={isRefreshing ? 'animate-spin' : ''} style={{ color: 'var(--text-muted)' }} />
        </div>
      </div>

      {/* Right Controls */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
        {/* Incident Summary Badges */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          {criticalCount > 0 && (
            <div className="badge badge-critical" style={{ animation: 'pulse 2s infinite' }}>
              <ShieldAlert size={12} />
              {criticalCount} CRITICAL
            </div>
          )}
          <div className="badge badge-medium">
            {activeIncidentsCount} ACTIVE
          </div>
        </div>

        {/* Operator User */}
        {currentUser ? (
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <div style={{
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
              background: 'var(--bg-surface-elevated)',
              padding: '5px 12px',
              borderRadius: '20px',
              border: '1px solid var(--border-strong)',
              fontSize: '12px'
            }}>
              <User size={13} style={{ color: 'var(--color-primary)' }} />
              <span style={{ fontWeight: 600 }}>{currentUser.username}</span>
              {currentUser.role ? (
                <span style={{
                  fontSize: '10px',
                  padding: '2px 6px',
                  borderRadius: '4px',
                  background: currentUser.role === 'ADMIN' ? 'rgba(239, 68, 68, 0.15)' : currentUser.role === 'OPERATOR' ? 'rgba(59, 130, 246, 0.15)' : 'rgba(107, 114, 128, 0.15)',
                  color: currentUser.role === 'ADMIN' ? 'var(--color-critical)' : currentUser.role === 'OPERATOR' ? 'var(--color-primary)' : 'var(--text-muted)',
                  fontWeight: 600,
                  textTransform: 'uppercase',
                  letterSpacing: '0.5px'
                }}>
                  {currentUser.role}
                </span>
              ) : currentUser.is_staff ? (
                <span style={{ fontSize: '10px', color: 'var(--text-muted)' }}>(Lead)</span>
              ) : null}
            </div>
            <button onClick={onLogout} className="btn btn-secondary btn-sm" title="Log out">
              <LogOut size={13} />
            </button>
          </div>
        ) : (
          <button onClick={onOpenLogin} className="btn btn-primary btn-sm">
            <LogIn size={13} />
            Operator Login
          </button>
        )}
      </div>
    </header>
  );
};
