import { describe, it, expect, vi } from 'vitest';
import { render, screen, act } from '@testing-library/react';
import React from 'react';
import { Navbar } from '../components/Navbar';

// Mock API call in Navbar
vi.mock('../lib/api', () => ({
  api: {
    health: {
      ready: vi.fn().mockResolvedValue({
        status: 'ready',
        checks: { database: { status: 'ok' }, redis: { status: 'ok' } },
        timestamp: new Date().toISOString(),
      }),
    },
  },
}));

describe('Navbar Component', () => {
  it('renders branding and incident badge counts accurately', async () => {
    await act(async () => {
      render(
        <Navbar
          currentUser={null}
          onOpenLogin={vi.fn()}
          onLogout={vi.fn()}
          activeIncidentsCount={7}
          criticalCount={2}
        />
      );
    });

    expect(screen.getByText('Bridge')).toBeInTheDocument();
    expect(screen.getByText('OPERATOR CORE')).toBeInTheDocument();
    expect(screen.getByText('2 CRITICAL')).toBeInTheDocument();
    expect(screen.getByText('7 ACTIVE')).toBeInTheDocument();
    expect(screen.getByText('Operator Login')).toBeInTheDocument();
  });

  it('renders authenticated operator username when logged in', async () => {
    await act(async () => {
      render(
        <Navbar
          currentUser={{
            id: 1,
            username: 'lead-operator',
            email: 'lead@example.com',
            is_staff: true,
          }}
          onOpenLogin={vi.fn()}
          onLogout={vi.fn()}
          activeIncidentsCount={0}
          criticalCount={0}
        />
      );
    });

    expect(screen.getByText('lead-operator')).toBeInTheDocument();
    expect(screen.getByText('(Lead)')).toBeInTheDocument();
    expect(screen.queryByText('Operator Login')).not.toBeInTheDocument();
  });
});
