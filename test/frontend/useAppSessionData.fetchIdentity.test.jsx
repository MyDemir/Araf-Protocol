import React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render } from '@testing-library/react';
import { useAppSessionData } from '../../frontend/src/app/useAppSessionData';

const baseProps = {
  address: '0xabc', isConnected: true, connector: null, chainId: 84532, publicClient: null,
  currentView: 'home', showProfileModal: false, profileTab: 'ayarlar', isContractLoading: false,
  setShowMakerModal: vi.fn(), setShowProfileModal: vi.fn(), setCurrentView: vi.fn(),
  getTakerFeeBps: undefined, getTokenDecimals: undefined, getCurrentAmounts: undefined,
  getWalletRegisteredAt: undefined, getReputation: undefined, getFirstSuccessfulTradeAt: undefined,
  antiSybilCheck: undefined, getCooldownRemaining: undefined, getPaused: undefined,
  SUPPORTED_TOKEN_ADDRESSES: { USDT: '', USDC: '' },
};

const seen = [];
function Harness({ lang, showToast }) {
  const state = useAppSessionData({ ...baseProps, connectedWallet: '0xabc', lang, showToast });
  seen.push(state.authenticatedFetch);
  return null;
}

describe('P10 authenticatedFetch kimliği (F1-06)', () => {
  const originalFetch = global.fetch;
  beforeEach(() => {
    seen.length = 0;
    global.fetch = vi.fn(async () => ({ ok: true, status: 200, json: async () => ({}) }));
  });
  afterEach(() => { cleanup(); global.fetch = originalFetch; });

  it('dil ve showToast değişince authenticatedFetch aynı kalır', () => {
    const { rerender } = render(<Harness lang="EN" showToast={vi.fn()} />);
    const first = seen[seen.length - 1];
    rerender(<Harness lang="TR" showToast={vi.fn()} />);
    expect(seen[seen.length - 1]).toBe(first);
  });
});
