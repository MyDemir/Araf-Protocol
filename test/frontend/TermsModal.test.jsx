import React from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { buildAppModals } from '../../frontend/src/app/AppModals';
import {
  buildTermsStatement, isTermsAcceptedLocally, markTermsAcceptedLocally, TERMS_ACKNOWLEDGEMENTS, TERMS_SECTIONS, TERMS_VERSION,
} from '../../frontend/src/app/legal/terms';

afterEach(() => { cleanup(); localStorage.clear(); });

const W1 = '0x' + '1'.repeat(40);
const W2 = '0x' + '2'.repeat(40);

describe('terms helpers', () => {
  it('stores acceptance per wallet and per version', () => {
    markTermsAcceptedLocally(W1);
    expect(isTermsAcceptedLocally(W1)).toBe(true);
    expect(isTermsAcceptedLocally(W1.toUpperCase().replace('0X', '0x'))).toBe(true);
    expect(isTermsAcceptedLocally(W2)).toBe(false);
    expect(isTermsAcceptedLocally(W1, '2099-01-01')).toBe(false);
  });

  it('builds a signed statement the backend can parse', () => {
    expect(buildTermsStatement()).toMatch(new RegExp(`I accept the Araf Terms of Use v${TERMS_VERSION}\\b`));
  });

  it('has the same sections and acknowledgements in both languages', () => {
    expect(TERMS_SECTIONS.TR.length).toBe(TERMS_SECTIONS.EN.length);
    expect(TERMS_ACKNOWLEDGEMENTS.TR.map((a) => a.key)).toEqual(TERMS_ACKNOWLEDGEMENTS.EN.map((a) => a.key));
  });
});

describe('Terms modal', () => {
  const ctx = (o = {}) => ({ lang: 'EN', isConnected: true, isAuthenticated: false, termsAccepted: false, address: W1, connectors: [], onAcceptTerms: vi.fn(), onDeclineTerms: vi.fn(), ...o });

  it('is hidden when accepted or when no wallet is connected', () => {
    const a = buildAppModals(ctx({ termsAccepted: true }));
    const { container } = render(<div>{a.renderTermsModal()}</div>);
    expect(container.querySelector('[data-testid="terms-modal"]')).toBeNull();
    cleanup();
    const b = buildAppModals(ctx({ isConnected: false }));
    render(<div>{b.renderTermsModal()}</div>);
    expect(screen.queryByTestId('terms-modal')).not.toBeInTheDocument();
  });

  it('keeps accept disabled until every acknowledgement is ticked, then signs', () => {
    const c = ctx();
    const { renderTermsModal } = buildAppModals(c);
    render(<div>{renderTermsModal()}</div>);
    const accept = screen.getByRole('button', { name: 'I accept, confirm with signature' });
    const boxes = screen.getAllByRole('checkbox');
    expect(boxes.length).toBe(4);
    boxes.slice(0, 3).forEach((b) => fireEvent.click(b));
    expect(accept).toBeDisabled();
    fireEvent.click(boxes[3]);
    expect(accept).not.toBeDisabled();
    fireEvent.click(accept);
    expect(c.onAcceptTerms).toHaveBeenCalledTimes(1);
  });

  it('decline disconnects', () => {
    const c = ctx();
    const { renderTermsModal } = buildAppModals(c);
    render(<div>{renderTermsModal()}</div>);
    fireEvent.click(screen.getByRole('button', { name: 'Decline and disconnect' }));
    expect(c.onDeclineTerms).toHaveBeenCalled();
  });

  it('states the software-only role and that the contract decides', () => {
    const { renderTermsModal } = buildAppModals(ctx());
    render(<div>{renderTermsModal()}</div>);
    expect(screen.getAllByText(/not a broker, custodian/).length).toBeGreaterThan(0);
    expect(screen.getAllByText(/only the contract decides outcomes/).length).toBeGreaterThan(0);
  });
});
