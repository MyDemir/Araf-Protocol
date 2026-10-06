import React from 'react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import { useAppSessionData } from '../../frontend/src/app/useAppSessionData';

const baseProps = {
  address: '0xabc',
  connectedWallet: '0xabc',
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
  showToast: vi.fn(),
  SUPPORTED_TOKEN_ADDRESSES: { USDT: '', USDC: '' },
};

const Harness = () => {
  const s = useAppSessionData(baseProps);
  return (
    <div>
      <span data-testid="auth">{String(s.isAuthenticated)}</span>
      <span data-testid="checked">{String(s.authChecked)}</span>
      <span data-testid="admin">{String(s.isAdmin)}</span>
      <span data-testid="profile">{String(s.hasPayoutProfile)}</span>
    </div>
  );
};

const mockFetch = (authMe) => {
  global.fetch = vi.fn((url) => {
    const target = String(url);
    if (target.includes('/api/auth/me')) return Promise.resolve(authMe);
    if (target.includes('/api/orders/config')) return Promise.resolve({ ok: true, json: async () => ({}) });
    if (target.includes('/api/orders')) return Promise.resolve({ ok: true, json: async () => ({ orders: [], total: 0, page: 1, limit: 50 }) });
    if (target.includes('/api/trades')) return Promise.resolve({ ok: true, json: async () => ({ trades: [], total: 0, page: 1, limit: 50 }) });
    return Promise.resolve({ ok: true, json: async () => ({}) });
  });
};

describe('items 11-12: isAdmin from /auth/me and 409 handling', () => {
  const originalFetch = global.fetch;
  beforeEach(() => { vi.clearAllMocks(); vi.spyOn(console, 'error').mockImplementation(() => {}); });
  afterEach(() => { cleanup(); global.fetch = originalFetch; });

  it('exposes the server isAdmin=true flag', async () => {
    mockFetch({ ok: true, status: 200, json: async () => ({ wallet: '0xabc', isAdmin: true }) });
    render(<Harness />);
    await waitFor(() => expect(screen.getByTestId('admin').textContent).toBe('true'));
    expect(screen.getByTestId('auth').textContent).toBe('true');
  });

  it('isAdmin=false stays false; a response without the field stays null (unknown)', async () => {
    mockFetch({ ok: true, status: 200, json: async () => ({ wallet: '0xabc', isAdmin: false }) });
    const first = render(<Harness />);
    await waitFor(() => expect(screen.getByTestId('checked').textContent).toBe('true'));
    expect(screen.getByTestId('admin').textContent).toBe('false');
    first.unmount();

    mockFetch({ ok: true, status: 200, json: async () => ({ wallet: '0xabc' }) });
    render(<Harness />);
    await waitFor(() => expect(screen.getByTestId('checked').textContent).toBe('true'));
    expect(screen.getByTestId('admin').textContent).toBe('null');
  });

  it('item 12: a 409 WITHOUT the SESSION_WALLET_MISMATCH code does not show the wallet-mismatch toast', async () => {
    mockFetch({ ok: false, status: 409, clone() { return this; }, json: async () => ({ code: 'SOMETHING_ELSE' }) });
    render(<Harness />);
    await waitFor(() => expect(screen.getByTestId('checked').textContent).toBe('true'));
    expect(baseProps.showToast).not.toHaveBeenCalledWith(expect.stringContaining('does not match your wallet'), 'info');
    expect(screen.getByTestId('auth').textContent).toBe('false');
  });

  it('item 12: a 409 with SESSION_WALLET_MISMATCH shows the wallet-mismatch toast', async () => {
    mockFetch({ ok: false, status: 409, clone() { return this; }, json: async () => ({ code: 'SESSION_WALLET_MISMATCH' }) });
    render(<Harness />);
    await waitFor(() => expect(baseProps.showToast).toHaveBeenCalledWith(expect.stringContaining('does not match your wallet'), 'info'));
  });
});

describe('hasPayoutProfile from /auth/me (saved backend profile, fail-closed when unknown)', () => {
  const originalFetch = global.fetch;
  beforeEach(() => { vi.clearAllMocks(); });
  afterEach(() => { cleanup(); global.fetch = originalFetch; });

  it.each([[true, 'true'], [false, 'false']])('exposes hasPayoutProfile=%s', async (flag, text) => {
    mockFetch({ ok: true, status: 200, json: async () => ({ wallet: '0xabc', hasPayoutProfile: flag }) });
    render(<Harness />);
    await waitFor(() => expect(screen.getByTestId('checked').textContent).toBe('true'));
    expect(screen.getByTestId('profile').textContent).toBe(text);
  });

  it('stays null (unknown) when the field is missing or null', async () => {
    mockFetch({ ok: true, status: 200, json: async () => ({ wallet: '0xabc', hasPayoutProfile: null }) });
    render(<Harness />);
    await waitFor(() => expect(screen.getByTestId('checked').textContent).toBe('true'));
    expect(screen.getByTestId('profile').textContent).toBe('null');
  });
});
