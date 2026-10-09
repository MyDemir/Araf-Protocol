import React from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen, waitFor, within, fireEvent } from '@testing-library/react';
import AdminRailsPanel from '../../frontend/src/app/contexts/admin/AdminRailsPanel';
import PaymentProfilePanel from '../../frontend/src/app/contexts/profile/PaymentProfilePanel';
import { isOwnerRailDisabled } from '../../frontend/src/app/payoutProfileGate';
import { mapApiOrderToUi } from '../../frontend/src/app/orderUiModel';
import { buildStartTradeAction } from '../../frontend/src/app/actions/contractLifecycleActions';

const ADMIN = '0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa';
const mkRails = (over = {}) => ([
  { code: 'TR_IBAN', name: { TR: 'Türkiye', EN: 'Turkey Bank Transfer' }, countries: ['TR'], riskLevel: 'MEDIUM', enabled: true, changedAt: null, changedBy: null },
  { code: 'US_ACH', name: { TR: 'ABD ACH', EN: 'US ACH' }, countries: ['US'], riskLevel: 'HIGH', enabled: true, changedAt: '2026-01-01T00:00:00Z', changedBy: ADMIN, ...over },
]);

const json = (status, body) => ({ ok: status < 400, status, json: async () => body });

function makeFetch({ rails = mkRails(), putStatus = 200, putBody = { success: true } } = {}) {
  return vi.fn(async (url, opts = {}) => {
    if (opts.method === 'PUT') return json(putStatus, putBody);
    if (String(url).includes('payment-rails/audit')) return json(200, { items: [{ id: 'a1', rail: 'US_ACH', previousEnabled: true, newEnabled: false, adminWallet: ADMIN, reason: 'chargeback', createdAt: '2026-01-01T00:00:00Z' }], total: 1, page: 1, limit: 10 });
    return json(200, { rails });
  });
}

afterEach(() => cleanup());

describe('AdminRailsPanel', () => {
  it('renders each rail with country, risk, accessible switch and audit list', async () => {
    render(<AdminRailsPanel lang="EN" authenticatedFetch={makeFetch()} showToast={vi.fn()} />);
    await waitFor(() => expect(screen.getByText(/Turkey Bank Transfer/)).toBeInTheDocument());
    const switches = screen.getAllByRole('switch');
    expect(switches).toHaveLength(2);
    expect(switches[0]).toHaveAttribute('aria-checked', 'true');
    expect(switches[0].className).toMatch(/min-h-\[44px\]/);
    expect(screen.getByText('HIGH')).toBeInTheDocument();
    await waitFor(() => expect(screen.getByText('chargeback')).toBeInTheDocument());
  });

  it('switch asks for confirmation (optional reason) and PUTs only after confirm, then toasts', async () => {
    const fetchFn = makeFetch();
    const showToast = vi.fn();
    render(<AdminRailsPanel lang="EN" authenticatedFetch={fetchFn} showToast={showToast} />);
    await waitFor(() => screen.getAllByRole('switch'));
    fireEvent.click(screen.getAllByRole('switch')[1]);
    const dialog = screen.getByRole('dialog');
    expect(fetchFn.mock.calls.some(([, o]) => o?.method === 'PUT')).toBe(false);
    fireEvent.change(within(dialog).getByLabelText(/Reason/), { target: { value: 'risk' } });
    fireEvent.click(within(dialog).getByRole('button', { name: 'Confirm' }));
    await waitFor(() => expect(showToast).toHaveBeenCalledWith('Payment method updated.', 'success'));
    const put = fetchFn.mock.calls.find(([, o]) => o?.method === 'PUT');
    expect(put[0]).toMatch(/admin\/payment-rails\/US_ACH$/);
    expect(JSON.parse(put[1].body)).toEqual({ enabled: false, reason: 'risk' });
  });

  it('cancel does not call the API; last-rail 409 shows an error toast', async () => {
    const fetchFn = makeFetch({ putStatus: 409, putBody: { code: 'LAST_ENABLED_RAIL' } });
    const showToast = vi.fn();
    render(<AdminRailsPanel lang="EN" authenticatedFetch={fetchFn} showToast={showToast} />);
    await waitFor(() => screen.getAllByRole('switch'));
    fireEvent.click(screen.getAllByRole('switch')[0]);
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(fetchFn.mock.calls.some(([, o]) => o?.method === 'PUT')).toBe(false);
    fireEvent.click(screen.getAllByRole('switch')[0]);
    fireEvent.click(screen.getByRole('button', { name: 'Confirm' }));
    await waitFor(() => expect(showToast).toHaveBeenCalledWith('At least one payment method must stay enabled.', 'error'));
  });

  it('the only enabled rail cannot be switched off', async () => {
    render(<AdminRailsPanel lang="EN" authenticatedFetch={makeFetch({ rails: mkRails({ enabled: false }) })} showToast={vi.fn()} />);
    await waitFor(() => screen.getAllByRole('switch'));
    expect(screen.getAllByRole('switch')[0]).toBeDisabled();
  });
});

describe('forms and market respect disabled rails', () => {
  const cfg = { US: { US_ACH: { enabled: false } }, TR: { TR_IBAN: { enabled: true } }, EU: { SEPA_IBAN: { enabled: true } } };

  it('payout profile form marks the closed rail as unavailable', () => {
    render(<PaymentProfilePanel lang="EN" paymentRiskConfig={cfg} setPayoutProfileDraft={vi.fn()} handleUpdatePII={vi.fn()} payoutProfileDraft={{ rail: 'TR_IBAN', country: 'TR', contact: {}, fields: {} }} />);
    const opt = screen.getByRole('option', { name: /USA \(ACH\) — currently closed/ });
    expect(opt).toBeDisabled();
    expect(screen.getByRole('option', { name: 'Turkey (IBAN)' })).not.toBeDisabled();
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });

  it('warns when the saved/selected rail is closed', () => {
    render(<PaymentProfilePanel lang="EN" paymentRiskConfig={cfg} setPayoutProfileDraft={vi.fn()} handleUpdatePII={vi.fn()} payoutProfileDraft={{ rail: 'US_ACH', country: 'US', contact: {}, fields: {} }} />);
    expect(screen.getByRole('alert')).toHaveTextContent(/currently closed/);
  });

  it('market order model exposes ownerRailEnabled and the fill action refuses a closed owner rail', async () => {
    const base = { _id: '507f1f77bcf86cd799439011', onchain_order_id: '1', owner_address: ADMIN, side: 'SELL_CRYPTO', status: 'OPEN', tier: 1, token_address: '0x1', market: {}, amounts: {} };
    expect(mapApiOrderToUi({ order: { ...base, owner_rail_enabled: false } }).ownerRailEnabled).toBe(false);
    expect(mapApiOrderToUi({ order: { ...base } }).ownerRailEnabled).toBeNull();
    expect(isOwnerRailDisabled({ ownerRailEnabled: false })).toBe(true);
    expect(isOwnerRailDisabled({ ownerRailEnabled: null })).toBe(false);

    const showToast = vi.fn();
    const fillSellOrder = vi.fn();
    await buildStartTradeAction({
      lang: 'EN', hasPayoutProfile: true, showToast, fillSellOrder, isContractLoading: () => false,
      requireSignedSessionForActiveWallet: () => true,
    })({ side: 'SELL_CRYPTO', ownerRailEnabled: false, onchainId: '1' });
    expect(showToast).toHaveBeenCalledWith("The seller's payment method is currently closed.", 'error');
    expect(fillSellOrder).not.toHaveBeenCalled();
  });
});
