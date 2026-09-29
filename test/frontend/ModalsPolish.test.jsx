import React from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import SettlementPreviewModal, { formatTokenUnits } from '../../frontend/src/components/SettlementPreviewModal';
import { buildAppModals } from '../../frontend/src/app/AppModals';

afterEach(cleanup);

describe('SettlementPreviewModal', () => {
  it('formats raw base units as token units', () => {
    expect(formatTokenUnits('250000000', 6)).toBe('250');
    expect(formatTokenUnits('1234567890', 6)).toBe('1,234.56');
    expect(formatTokenUnits('0', 6)).toBe('0');
  });

  it('shows payouts, fees and decayed amount in token units and marks the viewer', () => {
    render(<SettlementPreviewModal isOpen lang="EN" userRole="taker" tokenSymbol="USDT" decimals={6} makerShareBps={6000} takerShareBps={4000}
      previewData={{ pool: '500000000', makerPayout: '299700000', takerPayout: '199800000', makerFee: '300000', takerFee: '200000', decayedAmount: '12000000' }}
      confirmLabel="Submit" onConfirm={vi.fn()} onClose={vi.fn()} />);
    expect(screen.getByText('299.70 USDT')).toBeInTheDocument();
    expect(screen.getByText('199.80 USDT')).toBeInTheDocument();
    expect(screen.getByText('500 USDT')).toBeInTheDocument();
    expect(screen.getByText('12 USDT')).toBeInTheDocument();
    expect(screen.getByText('YOU')).toBeInTheDocument();
    expect(screen.queryByText('makerShareBps')).not.toBeInTheDocument();
  });
});

describe('Feedback modal', () => {
  const base = {
    lang: 'EN', showFeedbackModal: true, setShowFeedbackModal: vi.fn(), feedbackRating: 0, setFeedbackRating: vi.fn(),
    feedbackCategory: '', setFeedbackCategory: vi.fn(), feedbackText: '', setFeedbackText: vi.fn(), feedbackError: '', setFeedbackError: vi.fn(),
    isSubmittingFeedback: false, submitFeedback: vi.fn(), FEEDBACK_MIN_LENGTH: 12, connectors: [],
  };

  it('asks signed-out users to sign in instead of showing a form that would 401', () => {
    const onRequestSignIn = vi.fn();
    const { renderFeedbackModal } = buildAppModals({ ...base, isConnected: false, isAuthenticated: false, onRequestSignIn });
    render(<div>{renderFeedbackModal()}</div>);
    expect(screen.getByTestId('feedback-signin-gate')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Connect wallet' }));
    expect(onRequestSignIn).toHaveBeenCalled();
  });

  it('offers the backend category enum and caps text at 1000 chars', () => {
    const setFeedbackCategory = vi.fn();
    const { renderFeedbackModal } = buildAppModals({ ...base, isConnected: true, isAuthenticated: true, setFeedbackCategory });
    render(<div>{renderFeedbackModal()}</div>);
    fireEvent.click(screen.getByRole('radio', { name: 'Design' }));
    expect(setFeedbackCategory).toHaveBeenCalledWith('ui/ux');
    expect(screen.getByRole('textbox')).toHaveAttribute('maxLength', '1000');
  });
});
