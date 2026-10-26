import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import React from 'react';
import { Sidebar } from '../components/Sidebar';

describe('Sidebar Component', () => {
  it('renders all operation navigation tabs with badges', () => {
    const handleSelect = vi.fn();
    render(
      <Sidebar
        currentTab="overview"
        onSelectTab={handleSelect}
        openIncidentsCount={5}
      />
    );

    expect(screen.getByText('Overview')).toBeInTheDocument();
    expect(screen.getByText('Incidents')).toBeInTheDocument();
    expect(screen.getByText('Alert Signals')).toBeInTheDocument();
    expect(screen.getByText('Services & Monitors')).toBeInTheDocument();
    expect(screen.getByText('Integrations')).toBeInTheDocument();
    expect(screen.getByText('Notifications')).toBeInTheDocument();
    expect(screen.getByText('Audit Log')).toBeInTheDocument();

    // Incident badge check
    expect(screen.getByText('5')).toBeInTheDocument();
  });

  it('triggers onSelectTab and onClose when navigation item is clicked', () => {
    const handleSelect = vi.fn();
    const handleClose = vi.fn();
    render(
      <Sidebar
        currentTab="overview"
        onSelectTab={handleSelect}
        openIncidentsCount={0}
        isOpen={true}
        onClose={handleClose}
      />
    );

    fireEvent.click(screen.getByText('Alert Signals'));
    expect(handleSelect).toHaveBeenCalledWith('alerts');
    expect(handleClose).toHaveBeenCalled();
  });
});
