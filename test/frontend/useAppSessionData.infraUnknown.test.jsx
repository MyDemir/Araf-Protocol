import React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import { useAppSessionData } from '../../frontend/src/app/useAppSessionData';
import { __resetInfraForTest, getInfraHealth } from '../../frontend/src/app/infraHealth';

const baseProps = {
  address: '0xabc', isConnected: true, connector: null, chainId: 84532, publicClient: null, currentView: 'home',
  showProfileModal: false, profileTab: 'ayarlar', lang: 'EN', isContractLoading: false,
  setShowMakerModal: vi.fn(), setShowProfileModal: vi.fn(), setCurrentView: vi.fn(), showToast: vi.fn(),
  SUPPORTED_TOKEN_ADDRESSES: { USDT: '', USDC: '' }, connectedWallet: '0xabc',
};

const Harness = (props) => {
  const s = useAppSessionData({ ...baseProps, ...props });
  return (
    <div>
      <span data-testid="checked">{String(s.authChecked)}</span>
      <span data-testid="rpc">{String(s.rpcChecked)}</span>
    </div>
  );
};

const okJson = (body) => Promise.resolve({ ok: true, status: 200, json: async () => body });
const route = (authMe) => vi.fn((url) => {
  const u = String(url);
  if (u.includes('/auth/me')) return authMe();
  if (u.includes('/orders/config')) return okJson({});
  if (u.includes('/orders')) return okJson({ orders: [], total: 0 });
  if (u.includes('/stats')) return okJson({ stats: {} });
  return okJson({});
});

const originalFetch = global.fetch;
beforeEach(() => { __resetInfraForTest(); vi.spyOn(console, 'error').mockImplementation(() => {}); });
afterEach(() => { cleanup(); global.fetch = originalFetch; vi.restoreAllMocks(); __resetInfraForTest(); });

describe('auth/me failure semantics', () => {
  it('a real 401 still ends the check (session cleared path)', async () => {
    global.fetch = route(() => Promise.resolve({ ok: false, status: 401, json: async () => ({}) }));
    render(<Harness />);
    await waitFor(() => expect(screen.getByTestId('checked').textContent).toBe('true'));
  });

  it('a 503 or network failure leaves the session UNKNOWN (authChecked stays false) and flags the backend', async () => {
    global.fetch = route(() => Promise.reject(new TypeError('Failed to fetch')));
    render(<Harness />);
    await waitFor(() => expect(getInfraHealth().backend).toBe(true));
    expect(screen.getByTestId('checked').textContent).toBe('false');
  });

  it('a 5xx status response also leaves the session unknown', async () => {
    global.fetch = route(() => Promise.resolve({ ok: false, status: 503, json: async () => ({}) }));
    render(<Harness />);
    await waitFor(() => expect(getInfraHealth().backend).toBe(true));
    expect(screen.getByTestId('checked').textContent).toBe('false');
  });
});

describe('rpcChecked startup window', () => {
  it('starts false and stays false while paused() is unreadable; true only after a boolean read', async () => {
    global.fetch = route(() => Promise.resolve({ ok: false, status: 401, json: async () => ({}) }));
    const getPaused = vi.fn().mockResolvedValue(null);
    const { rerender } = render(<Harness getPaused={getPaused} />);
    expect(screen.getByTestId('rpc').textContent).toBe('false');
    await waitFor(() => expect(getPaused).toHaveBeenCalled());
    expect(screen.getByTestId('rpc').textContent).toBe('false');
    const getPausedOk = vi.fn().mockResolvedValue(false);
    rerender(<Harness getPaused={getPausedOk} />);
    await waitFor(() => expect(screen.getByTestId('rpc').textContent).toBe('true'));
  });
});
