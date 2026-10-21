import React from 'react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, waitFor, cleanup } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useAppSessionData } from '../../frontend/src/app/useAppSessionData';
import { buildApiUrl } from '../../frontend/src/app/apiConfig';

const baseProps = {
  address: '0xabc',
  isConnected: true,
  connector: null,
  chainId: 84532,
  publicClient: null,
  currentView: 'home',
  showProfileModal: false,
  profileTab: 'ayarlar',
  lang: 'EN',
  isContractLoading: false,
  setShowMakerModal: vi.fn(),
  setShowProfileModal: vi.fn(),
  setCurrentView: vi.fn(),
  getTakerFeeBps: undefined,
  getTokenDecimals: undefined,
  getCurrentAmounts: undefined,
  getWalletRegisteredAt: undefined,
  getReputation: undefined,
  getFirstSuccessfulTradeAt: undefined,
  antiSybilCheck: undefined,
  getCooldownRemaining: undefined,
  getPaused: undefined,
  SUPPORTED_TOKEN_ADDRESSES: { USDT: '', USDC: '' },
};

let lastResult;
function Harness({ showToast, lang = 'EN' }) {
  const state = useAppSessionData({ ...baseProps, lang, connectedWallet: '0xabc', showToast });
  return (
    <button
      onClick={async () => { lastResult = await state.authenticatedFetch(buildApiUrl('admin/summary')); }}
      type="button"
    >
      Trigger
    </button>
  );
}

function makeFetch(refreshStatus) {
  return vi.fn(async (url) => {
    const target = String(url);
    if (target.includes('/api/auth/me')) return { ok: true, status: 200, json: async () => ({ wallet: '0xabc' }) };
    if (target.includes('/api/auth/refresh')) return { ok: false, status: refreshStatus, json: async () => ({}) };
    if (target.includes('/api/admin/summary')) return { ok: false, status: 401, json: async () => ({}) };
    if (target.includes('/api/orders/config')) return { ok: true, status: 200, json: async () => ({}) };
    if (target.includes('/api/orders')) return { ok: true, status: 200, json: async () => ({ orders: [], total: 0, page: 1, limit: 50 }) };
    if (target.includes('/api/trades')) return { ok: true, status: 200, json: async () => ({ trades: [], total: 0, page: 1, limit: 50 }) };
    if (target.includes('/api/stats')) return { ok: true, status: 200, json: async () => ({ stats: {} }) };
    return { ok: true, status: 200, json: async () => ({}) };
  });
}

describe('authenticatedFetch refresh handling (B2-03)', () => {
  const originalFetch = global.fetch;
  beforeEach(() => { vi.clearAllMocks(); lastResult = undefined; });
  afterEach(() => { cleanup(); global.fetch = originalFetch; });

  it('401 from refresh ends the session with the session-expired toast', async () => {
    const user = userEvent.setup();
    const showToast = vi.fn();
    global.fetch = makeFetch(401);
    render(<Harness showToast={showToast} />);
    await user.click(screen.getByRole('button', { name: /Trigger/i }));
    await waitFor(() => expect(showToast).toHaveBeenCalledTimes(1));
    expect(showToast.mock.calls[0][0]).toMatch(/Session expired/);
  });

  it('503 from refresh keeps the session: transient toast, original response returned, no retry', async () => {
    const user = userEvent.setup();
    const showToast = vi.fn();
    global.fetch = makeFetch(503);
    render(<Harness showToast={showToast} lang="TR" />);
    await user.click(screen.getByRole('button', { name: /Trigger/i }));
    await waitFor(() => expect(showToast).toHaveBeenCalledTimes(1));
    expect(showToast.mock.calls[0][0]).toMatch(/Geçici bağlantı sorunu/);
    expect(lastResult.status).toBe(401);
    const refreshCalls = global.fetch.mock.calls.filter(([u]) => String(u).includes('/api/auth/refresh'));
    expect(refreshCalls).toHaveLength(1);
    const summaryCalls = global.fetch.mock.calls.filter(([u]) => String(u).includes('/api/admin/summary'));
    expect(summaryCalls).toHaveLength(1);
  });
});
