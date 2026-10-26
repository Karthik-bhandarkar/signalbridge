import React, { useEffect, useState } from 'react';
import {
  Activity,
  ShieldAlert,
  User,
  LogIn,
  LogOut,
  RefreshCw,
  Menu,
  Sun,
  Moon,
} from 'lucide-react';
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
  const [theme, setTheme] = useState<'light' | 'dark'>('light');

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme);
    localStorage.setItem('sb-theme', theme);
  }, [theme]);

  const toggleTheme = () => {
    setTheme((prev) => (prev === 'light' ? 'dark' : 'light'));
  };

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

  const isReady = health?.status === 'ready' || (health?.status as string) === 'healthy';

  return (
    <header className="top-navbar">
      {/* Brand & Perimeter Status */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
        {onToggleMobileNav && (
          <button
            type="button"
            className="mobile-nav-toggle btn-secondary btn-sm"
            onClick={onToggleMobileNav}
            aria-label="Toggle navigation menu"
            style={{ padding: '6px', borderRadius: '8px' }}
          >
            <Menu size={18} />
          </button>
        )}

        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          <div
            style={{
              width: '32px',
              height: '32px',
              borderRadius: '10px',
              background: 'linear-gradient(135deg, var(--color-primary), #38bdf8)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              boxShadow: '0 2px 10px var(--color-primary-glow)',
            }}
          >
            <Activity size={18} color="#fff" />
          </div>

          <div style={{ display: 'flex', flexDirection: 'column' }}>
            <span style={{ fontWeight: 800, fontSize: '16px', letterSpacing: '-0.03em', lineHeight: 1.1 }}>
              Signal<span style={{ color: 'var(--color-primary)' }}>Bridge</span>
            </span>
            <span style={{ fontSize: '10px', color: 'var(--text-muted)', fontWeight: 600, letterSpacing: '0.04em' }}>
              OPERATOR CORE
            </span>
          </div>
        </div>

        {/* Health status pill */}
        <div
          onClick={fetchHealth}
          title="Click to re-check readiness probe"
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '8px',
            background: 'var(--bg-surface-elevated)',
            border: '1px solid var(--border-subtle)',
            padding: '5px 12px',
            borderRadius: '20px',
            fontSize: '12px',
            cursor: 'pointer',
            transition: 'background-color 0.15s ease',
          }}
        >
          <div className={`pulse-dot ${isReady ? 'dot-ready' : 'dot-unready'}`} />
          <span style={{ color: isReady ? 'var(--status-up)' : 'var(--status-down)', fontWeight: 700, fontSize: '11px', letterSpacing: '0.04em' }}>
            {isReady ? 'SYSTEM READY' : 'DEGRADED'}
          </span>
          <RefreshCw size={11} className={isRefreshing ? 'animate-spin' : ''} style={{ color: 'var(--text-muted)' }} />
        </div>
      </div>

      {/* Right Controls & Theme Switcher */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
        {/* Incident Summary Badges */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          {criticalCount > 0 && (
            <div className="badge badge-critical">
              <ShieldAlert size={12} />
              {criticalCount} CRITICAL
            </div>
          )}
          <div className="badge badge-medium">
            {activeIncidentsCount} ACTIVE
          </div>
        </div>

        {/* Theme Toggle Button */}
        <button
          onClick={toggleTheme}
          className="btn btn-secondary btn-sm"
          title={`Switch to ${theme === 'light' ? 'Dark' : 'Light'} Mode`}
          style={{ padding: '7px 11px', borderRadius: '10px' }}
        >
          {theme === 'light' ? <Moon size={15} /> : <Sun size={15} />}
        </button>

        {/* Operator User */}
        {currentUser ? (
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '8px',
                background: 'var(--bg-surface-elevated)',
                padding: '5px 12px',
                borderRadius: '12px',
                border: '1px solid var(--border-subtle)',
                fontSize: '12px',
              }}
            >
              <User size={13} style={{ color: 'var(--color-primary)' }} />
              <span style={{ fontWeight: 700 }}>{currentUser.username}</span>
              {currentUser.is_staff && (
                <span style={{ fontSize: '11px', color: 'var(--text-muted)', fontWeight: 600 }}>(Lead)</span>
              )}
              {currentUser.role && (
                <span
                  style={{
                    fontSize: '10px',
                    padding: '2px 6px',
                    borderRadius: '6px',
                    background: currentUser.role === 'ADMIN' ? 'var(--severity-critical-bg)' : 'var(--color-primary-glow)',
                    color: currentUser.role === 'ADMIN' ? 'var(--severity-critical)' : 'var(--color-primary)',
                    fontWeight: 700,
                  }}
                >
                  {currentUser.role}
                </span>
              )}
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
