import React from 'react';
import fs from 'node:fs';
import path from 'node:path';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, waitFor, act, cleanup } from '@testing-library/react';
import { useAppSessionData } from '../../frontend/src/app/useAppSessionData';
import { createSessionActions } from '../../frontend/src/app/providers/SessionProvider';

const deferred = () => {
  let resolve;
  let reject;
  const promise = new Promise((res, rej) => { resolve = res; reject = rej; });
  return { promise, resolve, reject };
};

const makeProps = (over = {}) => ({
  address: '0xabc',
  isConnected: true,
  connector: null,
  chainId: 84532,
  publicClient: null,
  currentView: 'home',
  lang: 'EN',
  isContractLoading: false,
  connectedWallet: '0xabc',
  setShowMakerModal: vi.fn(),
  setCurrentView: vi.fn(),
  showToast: vi.fn(),
  SUPPORTED_TOKEN_ADDRESSES: { USDT: '', USDC: '' },
  ...over,
});

const state = { latest: null, firstAuthFetch: null };
const Harness = ({ props }) => {
  const s = useAppSessionData(props);
  state.latest = s;
  if (!state.firstAuthFetch) state.firstAuthFetch = s.authenticatedFetch;
  return (
    <div>
      <div data-testid="checked">{String(s.authChecked)}</div>
      <div data-testid="authed">{String(s.isAuthenticated)}</div>
      <div data-testid="unavail">{String(s.tradesBackendUnavailable)}</div>
    </div>
  );
};

const res = (body, status = 200) => Promise.resolve({ ok: status >= 200 && status < 300, status, json: async () => body });

describe('Dalga5 P18 ek duzeltmeler', () => {
  const originalFetch = global.fetch;
  beforeEach(() => { vi.clearAllMocks(); state.latest = null; state.firstAuthFetch = null; localStorage.clear(); });
  afterEach(() => { cleanup(); global.fetch = originalFetch; });

  it('F1-05: eski hesabin gec 401 yaniti yeni oturumu silmez ve refresh denemez', async () => {
    const stale = deferred();
    const urls = [];
    global.fetch = vi.fn((url) => {
      const t = String(url);
      urls.push(t);
      if (t.includes('/api/auth/me')) {
        const w = urls.filter((u) => u.includes('/api/auth/me')).length === 1 ? '0xabc' : '0xdef';
        return res({ wallet: w });
      }
      if (t.includes('/api/stale')) return stale.promise;
      if (t.includes('/api/auth/refresh')) return res({}, 401);
      if (t.includes('/api/orders')) return res({ orders: [], total: 0, page: 1, limit: 50 });
      if (t.includes('/api/trades')) return res({ trades: [], total: 0, page: 1, limit: 50 });
      return res({});
    });
    const base = makeProps();
    const { rerender } = render(<Harness props={base} />);
    await waitFor(() => expect(screen.getByTestId('authed').textContent).toBe('true'));
    const oldFetch = state.latest.authenticatedFetch;
    let pending;
    await act(async () => { pending = oldFetch('http://x/api/stale'); await Promise.resolve(); });
    rerender(<Harness props={{ ...base, address: '0xdef', connectedWallet: '0xdef' }} />);
    await waitFor(() => expect(screen.getByTestId('checked').textContent).toBe('true'));
    await waitFor(() => expect(screen.getByTestId('authed').textContent).toBe('true'));
    await act(async () => { stale.resolve({ ok: false, status: 401, json: async () => ({}) }); await pending; });
    expect(screen.getByTestId('authed').textContent).toBe('true');
    expect(urls.some((u) => u.includes('/api/auth/refresh'))).toBe(false);
  });

  it('F1-12: trades/my 429 zincir yedek gorunumunu acmaz; 500 acar', async () => {
    const make = (status) => vi.fn((url) => {
      const t = String(url);
      if (t.includes('/api/auth/me')) return res({ wallet: '0xabc' });
      if (t.includes('/api/trades/my')) return res({}, status);
      if (t.includes('/api/orders')) return res({ orders: [], total: 0, page: 1, limit: 50 });
      return res({});
    });
    global.fetch = make(429);
    const { unmount } = render(<Harness props={makeProps()} />);
    await waitFor(() => expect(screen.getByTestId('authed').textContent).toBe('true'));
    await act(async () => { await new Promise((r) => setTimeout(r, 50)); });
    expect(screen.getByTestId('unavail').textContent).toBe('false');
    unmount();
    cleanup();

    global.fetch = make(500);
    render(<Harness props={makeProps()} />);
    await waitFor(() => expect(screen.getByTestId('unavail').textContent).toBe('true'));
  });

  const PENDING = { hash: `0x${'a'.repeat(64)}`, chainId: 84532, createdAt: Date.now() };

  it('F1-08: yanlis zincirde atlanan tx kurtarma dogru zincire gecince yeniden denenir', async () => {
    localStorage.setItem('araf_pending_tx', JSON.stringify(PENDING));
    global.fetch = vi.fn((url) => (String(url).includes('/api/auth/me') ? res({ wallet: '0xabc' }) : res({ orders: [], total: 0, page: 1, limit: 50 })));
    const publicClient = { getTransactionReceipt: vi.fn(() => Promise.resolve({ status: 'success' })) };
    const base = makeProps({ publicClient, chainId: 1, isConnected: true });
    const { rerender } = render(<Harness props={base} />);
    await act(async () => { await new Promise((r) => setTimeout(r, 20)); });
    expect(publicClient.getTransactionReceipt).not.toHaveBeenCalled();
    rerender(<Harness props={{ ...base, chainId: 84532 }} />);
    await waitFor(() => expect(publicClient.getTransactionReceipt).toHaveBeenCalledTimes(1));
  });

  it('F1-07: Pazar disindayken /orders/config sonradan gelince emirler yeni bondMap ile yeniden cekilir', async () => {
    const config = deferred();
    global.fetch = vi.fn((url) => {
      const t = String(url);
      if (t.includes('/api/auth/me')) return res({}, 401);
      if (t.includes('/api/orders/config')) return config.promise;
      if (t.includes('/api/orders')) return res({ orders: [], total: 0, page: 1, limit: 50 });
      return res({});
    });
    const ordersCalls = () => global.fetch.mock.calls.filter((c) => /\/api\/orders\?/.test(String(c[0]))).length;
    render(<Harness props={makeProps({ currentView: 'home' })} />);
    await waitFor(() => expect(ordersCalls()).toBe(1));
    await act(async () => {
      config.resolve({ ok: true, status: 200, headers: { get: () => null }, json: async () => ({ bondMap: { 0: { maker: 0, taker: 0 } } }) });
      await new Promise((r) => setTimeout(r, 30));
    });
    await waitFor(() => expect(ordersCalls()).toBe(2));
  });
});

describe('Dalga5 P18 SessionProvider', () => {
  const deps = (over = {}) => ({
    address: '0xabc0000000000000000000000000000000000000',
    connectedWallet: '0xabc0000000000000000000000000000000000000',
    chainId: 84532,
    isConnected: true,
    isAuthenticated: false,
    authenticatedWallet: null,
    authChecked: true,
    lang: 'EN',
    signMessageAsync: vi.fn(),
    disconnect: vi.fn(),
    showToast: vi.fn(),
    setIsLoggingIn: vi.fn(),
    setIsAuthenticated: vi.fn(),
    setAuthenticatedWallet: vi.fn(),
    bestEffortBackendLogout: vi.fn().mockResolvedValue(true),
    clearLocalSessionState: vi.fn(),
    setShowWalletModal: vi.fn(),
    openProfilePage: vi.fn(),
    onTermsRequired: vi.fn(),
    ...over,
  });

  afterEach(() => { vi.useRealTimers(); });

  it('F1-14: asili kalan auth/nonce istegi zaman asiminda girisi serbest birakir', async () => {
    vi.useFakeTimers();
    global.fetch = vi.fn(() => new Promise(() => {}));
    const d = deps();
    const p = createSessionActions(d).loginWithSIWE();
    await vi.advanceTimersByTimeAsync(30000);
    await p;
    expect(d.setIsLoggingIn).toHaveBeenLastCalledWith(false);
    expect(d.showToast).toHaveBeenCalledWith('Login failed.', 'error');
  });

  it('F1-14: sunucu cikisi basarisizsa kullanici uyarilir; basariliysa uyari yok', async () => {
    const failed = deps({ bestEffortBackendLogout: vi.fn().mockResolvedValue(false) });
    await createSessionActions(failed).handleLogoutAndDisconnect();
    expect(failed.showToast).toHaveBeenCalledWith(expect.stringContaining('Could not end the server session'), 'info');
    expect(failed.disconnect).toHaveBeenCalled();

    const ok = deps();
    await createSessionActions(ok).handleLogoutAndDisconnect();
    expect(ok.showToast).not.toHaveBeenCalled();
  });
});

describe('Dalga5 P18 statik kontroller', () => {
  const read = (rel) => fs.readFileSync(path.resolve(__dirname, '../../', rel), 'utf8');

  it('F1-01: App.jsx useAccount().isReconnecting degerini isWalletResolving olarak hook\'a verir', () => {
    const src = read('frontend/src/App.jsx');
    expect(src).toMatch(/isReconnecting,/);
    expect(src).toContain('isWalletResolving: Boolean(isReconnecting)');
  });

  it('F1-10: otomatik kapanan anahtarli toast activeToastKeyRef anahtarini birakir', () => {
    const src = read('frontend/src/App.jsx');
    expect(src).toMatch(/if \(key && activeToastKeyRef\.current === key\) activeToastKeyRef\.current = null;/);
  });
});
