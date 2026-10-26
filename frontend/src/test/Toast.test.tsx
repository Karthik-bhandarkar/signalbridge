import { describe, it, expect } from 'vitest';
import { render, screen, fireEvent, act } from '@testing-library/react';
import React from 'react';
import { ToastProvider } from '../context/ToastContext';
import { useToast } from '../context/useToast';

const TestComponent = () => {
  const { toast, confirm } = useToast();
  return (
    <div>
      <button onClick={() => toast.success('Webhook processed successfully')}>
        Trigger Success
      </button>
      <button onClick={() => toast.error('Ingestion failed')}>
        Trigger Error
      </button>
      <button
        onClick={() =>
          confirm({
            title: 'Delete Service',
            message: 'Are you sure you want to remove this service?',
            onConfirm: () => {},
          })
        }
      >
        Trigger Confirm
      </button>
    </div>
  );
};

describe('Toast and Confirm Dialog System', () => {
  it('renders success and error toasts properly', () => {
    render(
      <ToastProvider>
        <TestComponent />
      </ToastProvider>
    );

    act(() => {
      fireEvent.click(screen.getByText('Trigger Success'));
    });
    expect(screen.getByText('Webhook processed successfully')).toBeInTheDocument();

    act(() => {
      fireEvent.click(screen.getByText('Trigger Error'));
    });
    expect(screen.getByText('Ingestion failed')).toBeInTheDocument();
  });

  it('renders modal dialog when confirmation is requested', () => {
    render(
      <ToastProvider>
        <TestComponent />
      </ToastProvider>
    );

    act(() => {
      fireEvent.click(screen.getByText('Trigger Confirm'));
    });

    expect(screen.getByText('Delete Service')).toBeInTheDocument();
    expect(
      screen.getByText('Are you sure you want to remove this service?')
    ).toBeInTheDocument();
    expect(screen.getByRole('dialog')).toBeInTheDocument();
  });
});
