import React, { useEffect, useState } from 'react';
import { Navbar } from './components/Navbar';
import { Sidebar, type NavTab } from './components/Sidebar';
import { IncidentDetailModal } from './components/IncidentDetailModal';
import { LoginModal } from './components/LoginModal';

import { OverviewView } from './views/OverviewView';
import { IncidentsView } from './views/IncidentsView';
import { AlertsView } from './views/AlertsView';
import { ServicesView } from './views/ServicesView';
import { IntegrationsView } from './views/IntegrationsView';
import { NotificationsView } from './views/NotificationsView';
import { AuditLogView } from './views/AuditLogView';

import { api } from './lib/api';
import type { AuthUser, Incident } from './types';

export const App: React.FC = () => {
  const [currentTab, setCurrentTab] = useState<NavTab>('overview');
  const [currentUser, setCurrentUser] = useState<AuthUser | null>(null);
  const [showLoginModal, setShowLoginModal] = useState(false);
  const [selectedIncidentId, setSelectedIncidentId] = useState<string | null>(null);
  const [isMobileNavOpen, setIsMobileNavOpen] = useState(false);

  // Global counts for badges:
  const [activeIncidents, setActiveIncidents] = useState<Incident[]>([]);

  const fetchCurrentUser = async () => {
    try {
      const res = await api.auth.me();
      if (res.authenticated && res.user) {
        setCurrentUser(res.user);
      } else {
        setCurrentUser(null);
      }
    } catch {
      setCurrentUser(null);
    }
  };

  const fetchGlobalIncidentCounts = async () => {
    try {
      const res = await api.incidents.list({ status: 'OPEN', page_size: 50 });
      setActiveIncidents(res.results || []);
    } catch (err) {
      console.warn('[App] Could not load incident counts:', err);
    }
  };

  useEffect(() => {
    fetchCurrentUser();
    fetchGlobalIncidentCounts();
    const interval = setInterval(fetchGlobalIncidentCounts, 20000);
    return () => clearInterval(interval);
  }, []);

  const handleLogout = async () => {
    try {
      await api.auth.logout();
      setCurrentUser(null);
    } catch (err) {
      console.error('[App] Logout error:', err);
    }
  };

  const criticalCount = activeIncidents.filter((i) => i.severity === 'CRITICAL').length;

  return (
    <div className="app-container">
      {/* Sidebar Navigation */}
      <Sidebar
        currentTab={currentTab}
        onSelectTab={setCurrentTab}
        openIncidentsCount={activeIncidents.length}
        isOpen={isMobileNavOpen}
        onClose={() => setIsMobileNavOpen(false)}
      />

      {/* Main Mission Control Body */}
      <div className="main-content">
        <Navbar
          currentUser={currentUser}
          onOpenLogin={() => setShowLoginModal(true)}
          onLogout={handleLogout}
          activeIncidentsCount={activeIncidents.length}
          criticalCount={criticalCount}
          onToggleMobileNav={() => setIsMobileNavOpen((prev) => !prev)}
        />

        <main className="page-body">
          {currentTab === 'overview' && (
            <OverviewView
              onNavigateTab={setCurrentTab}
              onOpenIncidentDetail={setSelectedIncidentId}
            />
          )}

          {currentTab === 'incidents' && (
            <IncidentsView onOpenIncidentDetail={setSelectedIncidentId} />
          )}

          {currentTab === 'alerts' && <AlertsView />}

          {currentTab === 'services' && <ServicesView />}

          {currentTab === 'integrations' && <IntegrationsView />}

          {currentTab === 'notifications' && <NotificationsView />}

          {currentTab === 'audit' && <AuditLogView />}
        </main>
      </div>

      {/* Incident Detail Modal */}
      {selectedIncidentId && (
        <IncidentDetailModal
          incidentId={selectedIncidentId}
          onClose={() => setSelectedIncidentId(null)}
          onRefreshList={fetchGlobalIncidentCounts}
        />
      )}

      {/* Operator Login Modal */}
      {showLoginModal && (
        <LoginModal
          onClose={() => setShowLoginModal(false)}
          onSuccess={(user) => {
            setCurrentUser(user);
            fetchGlobalIncidentCounts();
          }}
        />
      )}
    </div>
  );
};

export default App;
