import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent, act } from '@testing-library/react';
import React from 'react';
import { LandingPage } from '../views/LandingPage';

describe('Public LandingPage Component', () => {
  it('renders public branding, live pipeline telemetry card, and fast role access without internal dashboard tools', async () => {
    const handleOpenLogin = vi.fn();
    const handleQuickLoginAsViewer = vi.fn();

    await act(async () => {
      render(
        <LandingPage
          onOpenLogin={handleOpenLogin}
          onQuickLoginAsViewer={handleQuickLoginAsViewer}
          apiDocsUrl="/api/docs/"
          health={{
            status: 'ready',
            checks: { database: { status: 'ok' }, redis: { status: 'ok' } },
            timestamp: new Date().toISOString(),
          }}
          onRefreshHealth={vi.fn()}
          isHealthRefreshing={false}
        />
      );
    });

    // Brand and headline
    expect(screen.getByText('OPERATOR CORE')).toBeInTheDocument();
    expect(screen.getByText('Stop Alert Storms.')).toBeInTheDocument();

    // Live Pipeline Card is present
    expect(screen.getByText('INGESTION GATEWAY TELEMETRY')).toBeInTheDocument();
    expect(screen.getByText('P1 Database Exhaustion')).toBeInTheDocument();

    // Role access hints
    expect(screen.getAllByText(/Demo Viewer/i).length).toBeGreaterThan(0);
    expect(screen.getAllByText(/Lead Admin/i).length).toBeGreaterThan(0);
    expect(screen.getAllByText('Launch Demo Dashboard (1-Click)').length).toBeGreaterThan(0);
  });

  it('triggers quick viewer login and admin sign in from public CTAs', async () => {
    const handleOpenLogin = vi.fn();
    const handleQuickLoginAsViewer = vi.fn();

    await act(async () => {
      render(
        <LandingPage
          onOpenLogin={handleOpenLogin}
          onQuickLoginAsViewer={handleQuickLoginAsViewer}
          apiDocsUrl="/api/docs/"
          health={null}
          onRefreshHealth={vi.fn()}
          isHealthRefreshing={false}
        />
      );
    });

    const quickLoginBtn = screen.getAllByText('Launch Demo Dashboard (1-Click)')[0];
    fireEvent.click(quickLoginBtn);
    expect(handleQuickLoginAsViewer).toHaveBeenCalledTimes(1);

    const adminSignInBtn = screen.getByText('Sign In as Admin');
    fireEvent.click(adminSignInBtn);
    expect(handleOpenLogin).toHaveBeenCalledWith('admin');
  });
});
