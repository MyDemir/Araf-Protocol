import React from 'react';
import { act } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, waitFor } from '@testing-library/react';
import { useAppSessionData } from '../../frontend/src/app/useAppSessionData';
import { __resetInfraForTest, getInfraHealth, markEscrowMismatch } from '../../frontend/src/app/infraHealth';

const baseProps = {
  address: '0xabc', isConnected: true, connector: null, chainId: 84532, publicClient: null, currentView: 'home',
  showProfileModal: false, profileTab: 'ayarlar', lang: 'EN', isContractLoading: false,
  setShowMakerModal: vi.fn(), setShowProfileModal: vi.fn(), setCurrentView: vi.fn(), showToast: vi.fn(),
  SUPPORTED_TOKEN_ADDRESSES: { USDT: '', USDC: '' }, connectedWallet: '0xabc',
};
const Harness = () => { useAppSessionData(baseProps); return null; };

const okJson = (body) => Promise.resolve({ ok: true, status: 200, json: async () => body });
let configMode = 'ok';
const configCalls = () => global.fetch.mock.calls.filter(([u]) => String(u).includes('/orders/config')).length;
const route = () => vi.fn((url) => {
  const u = String(url);
  if (u.includes('/orders/config')) {
    if (configMode === 'mismatch') {
      const body = { code: 'ESCROW_MISMATCH', reason: 'rotating' };
      return Promise.resolve({ ok: false, status: 503, json: async () => body, clone: () => ({ json: async () => body }) });
    }
    return okJson({});
  }
  if (u.includes('/auth/me')) return Promise.resolve({ ok: false, status: 401, json: async () => ({}) });
  if (u.includes('/orders')) return okJson({ orders: [], total: 0 });
  return okJson({});
});

let hidden = false;
let now = 1_000_000;
const originalFetch = global.fetch;
const focus = async () => { await act(async () => { window.dispatchEvent(new Event('focus')); await new Promise((r) => setTimeout(r, 20)); }); };

beforeEach(() => {
  hidden = false; now = 1_000_000; configMode = 'ok';
  Object.defineProperty(document, 'hidden', { configurable: true, get: () => hidden });
  Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => (hidden ? 'hidden' : 'visible') });
  vi.spyOn(Date, 'now').mockImplementation(() => now);
  vi.spyOn(console, 'error').mockImplementation(() => {});
  __resetInfraForTest();
  global.fetch = route();
});
afterEach(() => { cleanup(); global.fetch = originalFetch; vi.restoreAllMocks(); __resetInfraForTest(); });

const mountSettled = async () => {
  render(<Harness />);
  await waitFor(() => expect(configCalls()).toBeGreaterThan(0));
  await act(async () => { await new Promise((r) => setTimeout(r, 50)); });
  act(() => { markEscrowMismatch('rotating'); });
  expect(getInfraHealth().escrowMismatch).toBe(true);
};

describe('focus revalidation of escrowMismatch', () => {
  it('clears the flag when orders/config answers 200', async () => {
    await mountSettled();
    await focus();
    expect(getInfraHealth().escrowMismatch).toBe(false);
  });

  it('keeps the flag on 503 ESCROW_MISMATCH', async () => {
    await mountSettled();
    configMode = 'mismatch';
    await focus();
    expect(getInfraHealth().escrowMismatch).toBe(true);
  });

  it('does not send a second request within 15s of the first focus', async () => {
    await mountSettled();
    await focus();
    const after = configCalls();
    now += 5000;
    await focus();
    expect(configCalls()).toBe(after);
    now += 11000;
    await focus();
    expect(configCalls()).toBe(after + 1);
  });

  it('sends no request while the tab is hidden', async () => {
    await mountSettled();
    const before = configCalls();
    hidden = true;
    await focus();
    document.dispatchEvent(new Event('visibilitychange'));
    expect(configCalls()).toBe(before);
    expect(getInfraHealth().escrowMismatch).toBe(true);
  });
});
