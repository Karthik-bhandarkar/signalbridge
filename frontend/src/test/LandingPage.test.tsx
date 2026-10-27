import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent, act } from '@testing-library/react';
import React from 'react';
import { LandingPage } from '../views/LandingPage';

// Mock WebGL / Three.js canvas in JSDOM environment
vi.mock('../components/Vexel3DCanvas', () => ({
  Vexel3DCanvas: () => <div data-testid="vexel-3d-canvas" className="mock-3d-canvas" />,
}));

describe('Public LandingPage Component', () => {
  it('renders public branding, 3D stage, and fast role access without internal dashboard tools', async () => {
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
    expect(screen.getByText('Incident Correlation')).toBeInTheDocument();

    // 3D canvas is present
    expect(screen.getByTestId('vexel-3d-canvas')).toBeInTheDocument();

    // Role access cards
    expect(screen.getByText('Demo Viewer')).toBeInTheDocument();
    expect(screen.getByText('Lead Administrator')).toBeInTheDocument();
    expect(screen.getByText('Enter Dashboard (1-Click)')).toBeInTheDocument();

    // Public simulator
    expect(screen.getByText('Interactive Public Webhook Simulator')).toBeInTheDocument();
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

    const quickLoginBtn = screen.getByText('Enter Dashboard (1-Click)');
    fireEvent.click(quickLoginBtn);
    expect(handleQuickLoginAsViewer).toHaveBeenCalledTimes(1);

    const adminSignInBtn = screen.getByText('Sign In as Admin');
    fireEvent.click(adminSignInBtn);
    expect(handleOpenLogin).toHaveBeenCalledWith('admin');
  });
});
