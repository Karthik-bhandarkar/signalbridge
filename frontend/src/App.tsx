import React, { useEffect, useState } from 'react';
import { Navbar } from './components/Navbar';
import { Sidebar, type NavTab } from './components/Sidebar';
import { IncidentDetailModal } from './components/IncidentDetailModal';
import { LoginModal } from './components/LoginModal';

import { LandingPage } from './views/LandingPage';
import { OverviewView } from './views/OverviewView';
import { IncidentsView } from './views/IncidentsView';
import { AlertsView } from './views/AlertsView';
import { ServicesView } from './views/ServicesView';
import { IntegrationsView } from './views/IntegrationsView';
import { NotificationsView } from './views/NotificationsView';
import { AuditLogView } from './views/AuditLogView';

import { api } from './lib/api';
import type { AuthUser, HealthCheckResponse, Incident } from './types';

export const App: React.FC = () => {
  const [currentTab, setCurrentTab] = useState<NavTab>('overview');
  const [currentUser, setCurrentUser] = useState<AuthUser | null>(null);
  const [showLoginModal, setShowLoginModal] = useState(false);
  const [loginPreset, setLoginPreset] = useState<'viewer' | 'admin'>('viewer');
  const [selectedIncidentId, setSelectedIncidentId] = useState<string | null>(null);
  const [isMobileNavOpen, setIsMobileNavOpen] = useState(false);

  // Health and incident state
  const [health, setHealth] = useState<HealthCheckResponse | null>(null);
  const [isHealthRefreshing, setIsHealthRefreshing] = useState(false);
  const [activeIncidents, setActiveIncidents] = useState<Incident[]>([]);

  const fetchHealth = async () => {
    try {
      setIsHealthRefreshing(true);
      const res = await api.health.ready();
      setHealth(res);
    } catch {
      setHealth({
        status: 'unready',
        checks: { database: { status: 'offline' } },
        timestamp: new Date().toISOString(),
      });
    } finally {
      setIsHealthRefreshing(false);
    }
  };

  const handleOpenLogin = (preset: 'viewer' | 'admin' = 'viewer') => {
    setLoginPreset(preset);
    setShowLoginModal(true);
  };

  const handleQuickLoginAsViewer = async () => {
    try {
      const res = await api.auth.login({ username: 'viewer', password: 'Viewer123!' });
      setCurrentUser(res.user);
      fetchGlobalIncidentCounts();
    } catch (err) {
      console.error('[App] Quick viewer login error:', err);
      handleOpenLogin('viewer');
    }
  };

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
    fetchHealth();
    fetchCurrentUser();
    const healthInterval = setInterval(fetchHealth, 15000);
    return () => clearInterval(healthInterval);
  }, []);

  useEffect(() => {
    if (currentUser) {
      fetchGlobalIncidentCounts();
      const incInterval = setInterval(fetchGlobalIncidentCounts, 20000);
      return () => clearInterval(incInterval);
    }
  }, [currentUser]);

  const handleLogout = async () => {
    try {
      await api.auth.logout();
      setCurrentUser(null);
      setCurrentTab('overview');
    } catch (err) {
      console.error('[App] Logout error:', err);
      setCurrentUser(null);
    }
  };

  const criticalCount = activeIncidents.filter((i) => i.severity === 'CRITICAL').length;

  // =========================================================================
  // VIEW 1: PUBLIC LANDING PAGE (When NOT logged in)
  // Dashboard & internal tools are strictly hidden until authenticated
  // =========================================================================
  if (!currentUser) {
    return (
      <>
        <LandingPage
          onOpenLogin={handleOpenLogin}
          onQuickLoginAsViewer={handleQuickLoginAsViewer}
          apiDocsUrl="/api/docs/"
          health={health}
          onRefreshHealth={fetchHealth}
          isHealthRefreshing={isHealthRefreshing}
        />

        {showLoginModal && (
          <LoginModal
            initialRole={loginPreset}
            onClose={() => setShowLoginModal(false)}
            onSuccess={(user) => {
              setCurrentUser(user);
              setShowLoginModal(false);
              fetchGlobalIncidentCounts();
            }}
          />
        )}
      </>
    );
  }

  // =========================================================================
  // VIEW 2: OPERATOR COMMAND DASHBOARD (When authenticated)
  // Full operational access to Incidents, Alerts, SRE Bento Grid, and Integrations
  // =========================================================================
  return (
    <div className="app-container">
      {/* Internal Operational Sidebar */}
      <Sidebar
        currentTab={currentTab}
        onSelectTab={setCurrentTab}
        openIncidentsCount={activeIncidents.length}
        isOpen={isMobileNavOpen}
        onClose={() => setIsMobileNavOpen(false)}
      />

      {/* Main Operational View */}
      <div className="main-content">
        <Navbar
          currentUser={currentUser}
          onOpenLogin={() => handleOpenLogin('viewer')}
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
              currentUser={currentUser}
              onOpenLogin={handleOpenLogin}
              onQuickLoginAsViewer={handleQuickLoginAsViewer}
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

      {/* Login / Role Switching Modal */}
      {showLoginModal && (
        <LoginModal
          initialRole={loginPreset}
          onClose={() => setShowLoginModal(false)}
          onSuccess={(user) => {
            setCurrentUser(user);
            setShowLoginModal(false);
            fetchGlobalIncidentCounts();
          }}
        />
      )}
    </div>
  );
};

export default App;
