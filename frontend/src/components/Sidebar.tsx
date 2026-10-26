import React from 'react';
import {
  LayoutDashboard,
  AlertTriangle,
  Radio,
  Server,
  Layers,
  Bell,
  ScrollText,
} from 'lucide-react';

export type NavTab =
  | 'overview'
  | 'incidents'
  | 'alerts'
  | 'services'
  | 'integrations'
  | 'notifications'
  | 'audit';

interface SidebarProps {
  currentTab: NavTab;
  onSelectTab: (tab: NavTab) => void;
  openIncidentsCount: number;
  isOpen?: boolean;
  onClose?: () => void;
}

export const Sidebar: React.FC<SidebarProps> = ({
  currentTab,
  onSelectTab,
  openIncidentsCount,
  isOpen = false,
  onClose,
}) => {
  const navItems: { id: NavTab; label: string; icon: React.ReactNode; badge?: number }[] = [
    { id: 'overview', label: 'Overview', icon: <LayoutDashboard size={17} /> },
    { id: 'incidents', label: 'Incidents', icon: <AlertTriangle size={17} />, badge: openIncidentsCount },
    { id: 'alerts', label: 'Alert Signals', icon: <Radio size={17} /> },
    { id: 'services', label: 'Services & Monitors', icon: <Server size={17} /> },
    { id: 'integrations', label: 'Integrations', icon: <Layers size={17} /> },
    { id: 'notifications', label: 'Notifications', icon: <Bell size={17} /> },
    { id: 'audit', label: 'Audit Log', icon: <ScrollText size={17} /> },
  ];

  const handleSelect = (tab: NavTab) => {
    onSelectTab(tab);
    if (onClose) onClose();
  };

  return (
    <>
      {isOpen && <div className="sidebar-overlay" onClick={onClose} aria-hidden="true" />}
      <aside className={`sidebar ${isOpen ? 'sidebar-open' : ''}`} aria-label="Main Navigation">
      {/* Navigation Links */}
      <div style={{ padding: '16px 10px', flex: 1, display: 'flex', flexDirection: 'column', gap: '4px' }}>
        <div style={{
          padding: '4px 12px 10px',
          fontSize: '11px',
          textTransform: 'uppercase',
          fontWeight: 700,
          color: 'var(--text-muted)',
          letterSpacing: '0.08em'
        }}>
          Operations
        </div>

        {navItems.map((item) => {
          const isActive = currentTab === item.id;
          return (
            <button
              key={item.id}
              onClick={() => handleSelect(item.id)}
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                padding: '10px 14px',
                borderRadius: '8px',
                background: isActive ? 'var(--bg-surface-elevated)' : 'transparent',
                color: isActive ? 'var(--text-primary)' : 'var(--text-secondary)',
                fontWeight: isActive ? 600 : 500,
                border: 'none',
                cursor: 'pointer',
                transition: 'all 0.15s ease',
                textAlign: 'left',
                width: '100%',
              }}
              onMouseEnter={(e) => {
                if (!isActive) e.currentTarget.style.background = 'var(--bg-surface-hover)';
              }}
              onMouseLeave={(e) => {
                if (!isActive) e.currentTarget.style.background = 'transparent';
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                <span style={{ color: isActive ? 'var(--color-primary)' : 'inherit' }}>
                  {item.icon}
                </span>
                <span style={{ fontSize: '13px' }}>{item.label}</span>
              </div>
              {item.badge !== undefined && item.badge > 0 && (
                <span style={{
                  fontSize: '11px',
                  fontWeight: 700,
                  padding: '2px 7px',
                  borderRadius: '10px',
                  background: 'rgba(244, 63, 94, 0.2)',
                  color: 'var(--severity-critical)',
                  border: '1px solid rgba(244, 63, 94, 0.3)'
                }}>
                  {item.badge}
                </span>
              )}
            </button>
          );
        })}
      </div>

      {/* Footer Info */}
      <div style={{
        padding: '16px',
        borderTop: '1px solid var(--border-subtle)',
        fontSize: '11px',
        color: 'var(--text-muted)',
        display: 'flex',
        flexDirection: 'column',
        gap: '4px'
      }}>
        <div style={{ display: 'flex', justifyContent: 'space-between' }}>
          <span>Pipeline:</span>
          <span style={{ color: 'var(--text-secondary)', fontWeight: 600 }}>Active (Celery)</span>
        </div>
        <div style={{ display: 'flex', justifyContent: 'space-between' }}>
          <span>Ack Target:</span>
          <span style={{ color: 'var(--status-up)', fontWeight: 600 }}>&lt; 50ms</span>
        </div>
      </div>
    </aside>
    </>
  );
};
