import React from 'react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, waitFor, act, cleanup } from '@testing-library/react';
import { useAppSessionData } from '../../frontend/src/app/useAppSessionData';

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
  currentView: 'tradeRoom',
  lang: 'EN',
  isContractLoading: false,
  connectedWallet: '0xabc',
  setShowMakerModal: vi.fn(),
  setCurrentView: vi.fn(),
  showToast: vi.fn(),
  SUPPORTED_TOKEN_ADDRESSES: { USDT: '', USDC: '' },
  ...over,
});

const Harness = ({ props }) => {
  const s = useAppSessionData(props);
  return (
    <div>
      <div data-testid="checked">{String(s.authChecked)}</div>
      <div data-testid="authed">{String(s.isAuthenticated)}</div>
      <div data-testid="sybil">{s.sybilStatus ? JSON.stringify(s.sybilStatus) : 'null'}</div>
      <div data-testid="rep">{s.userReputation ? String(s.userReputation.effectiveTier) : 'null'}</div>
    </div>
  );
};

const okJson = (body) => Promise.resolve({ ok: true, status: 200, json: async () => body });

const routeFetch = (meHandler) => vi.fn((url) => {
  const t = String(url);
  if (t.includes('/api/auth/me')) return meHandler();
  if (t.includes('/api/orders/config')) return okJson({});
  if (t.includes('/api/orders')) return okJson({ orders: [], total: 0, page: 1, limit: 50 });
  if (t.includes('/api/trades')) return okJson({ trades: [], total: 0, page: 1, limit: 50 });
  return okJson({});
});

describe('Dalga5 P18 oturum duzeltmeleri', () => {
  const originalFetch = global.fetch;
  beforeEach(() => { vi.clearAllMocks(); });
  afterEach(() => { cleanup(); global.fetch = originalFetch; });

  it('F1-01: wagmi reconnecting iken oturum temizlenmez, ana sayfaya donulmez, authChecked false kalir', async () => {
    global.fetch = routeFetch(() => okJson({ wallet: '0xabc' }));
    const props = makeProps({ isConnected: false, connectedWallet: undefined, address: undefined, isWalletResolving: true });
    const { rerender } = render(<Harness props={props} />);
    await act(async () => { await Promise.resolve(); });
    expect(props.setCurrentView).not.toHaveBeenCalledWith('home');
    expect(screen.getByTestId('checked').textContent).toBe('false');

    const connected = makeProps({ setCurrentView: props.setCurrentView, isWalletResolving: false });
    rerender(<Harness props={connected} />);
    await waitFor(() => expect(screen.getByTestId('checked').textContent).toBe('true'));
    expect(screen.getByTestId('authed').textContent).toBe('true');
    expect(props.setCurrentView).not.toHaveBeenCalledWith('home');
  });

  it('F1-01: reconnect bitip cuzdan baglanmadiysa eskisi gibi temizlenir ve authChecked true olur', async () => {
    global.fetch = routeFetch(() => okJson({ wallet: '0xabc' }));
    const props = makeProps({ isConnected: false, connectedWallet: undefined, address: undefined, isWalletResolving: true });
    const { rerender } = render(<Harness props={props} />);
    rerender(<Harness props={{ ...props, isWalletResolving: false }} />);
    await waitFor(() => expect(screen.getByTestId('checked').textContent).toBe('true'));
    expect(props.setCurrentView).toHaveBeenCalledWith('home');
  });

  it.each([429, 400, 404])('F1-02: /auth/me %i yerel oturumu silmez (bilinmiyor kalir)', async (status) => {
    global.fetch = routeFetch(() => Promise.resolve({ ok: false, status, json: async () => ({}) }));
    render(<Harness props={makeProps()} />);
    await act(async () => { await new Promise((r) => setTimeout(r, 30)); });
    expect(screen.getByTestId('checked').textContent).toBe('false');
  });

  it.each([401, 403])('F1-02: /auth/me %i oturumu temizler ve authChecked true olur', async (status) => {
    global.fetch = routeFetch(() => Promise.resolve({ ok: false, status, json: async () => ({}) }));
    render(<Harness props={makeProps()} />);
    await waitFor(() => expect(screen.getByTestId('checked').textContent).toBe('true'));
    expect(screen.getByTestId('authed').textContent).toBe('false');
  });

  it('F1-03: hesap degisiminde eski hesabin gec sybil yaniti yazilmaz', async () => {
    global.fetch = routeFetch(() => okJson({ wallet: '0xabc' }));
    const aDef = deferred();
    const antiSybilCheck = vi.fn((addr) => (addr === '0xabc' ? aDef.promise : Promise.reject(new Error('rpc'))));
    const base = makeProps({ antiSybilCheck });
    const { rerender } = render(<Harness props={base} />);
    rerender(<Harness props={{ ...base, address: '0xdef', connectedWallet: '0xdef' }} />);
    await act(async () => { aDef.resolve({ aged: true, balanceOk: true, cooldownOk: true }); await Promise.resolve(); });
    await act(async () => { await new Promise((r) => setTimeout(r, 20)); });
    expect(screen.getByTestId('sybil').textContent).toBe('null');
  });

  it('F1-03: hesap degisip okuma hata verince eski hesabin sybil degeri kalmaz', async () => {
    global.fetch = routeFetch(() => okJson({ wallet: '0xabc' }));
    const antiSybilCheck = vi.fn((addr) => (addr === '0xabc'
      ? Promise.resolve({ aged: true, balanceOk: true, cooldownOk: true })
      : Promise.reject(new Error('rpc'))));
    const base = makeProps({ antiSybilCheck });
    const { rerender } = render(<Harness props={base} />);
    await waitFor(() => expect(screen.getByTestId('sybil').textContent).not.toBe('null'));
    rerender(<Harness props={{ ...base, address: '0xdef', connectedWallet: '0xdef' }} />);
    await waitFor(() => expect(screen.getByTestId('sybil').textContent).toBe('null'));
  });

  it('F1-04: B hesabi icin itibar okuma hatasinda A hesabinin itibari kalmaz', async () => {
    global.fetch = routeFetch(() => okJson({ wallet: '0xabc' }));
    const getReputation = vi.fn((addr) => (addr === '0xabc'
      ? Promise.resolve({ effectiveTier: 3n })
      : Promise.reject(new Error('rpc'))));
    const getFirstSuccessfulTradeAt = vi.fn(() => Promise.resolve(0n));
    const base = makeProps({ getReputation, getFirstSuccessfulTradeAt });
    const { rerender } = render(<Harness props={base} />);
    await waitFor(() => expect(screen.getByTestId('rep').textContent).toBe('3'));
    rerender(<Harness props={{ ...base, address: '0xdef', connectedWallet: '0xdef' }} />);
    await waitFor(() => expect(screen.getByTestId('rep').textContent).toBe('null'));
  });

  it('F1-04: baglanti kesilince ucustaki itibar yaniti yazilmaz', async () => {
    global.fetch = routeFetch(() => okJson({ wallet: '0xabc' }));
    const d = deferred();
    const getReputation = vi.fn(() => d.promise);
    const getFirstSuccessfulTradeAt = vi.fn(() => Promise.resolve(0n));
    const base = makeProps({ getReputation, getFirstSuccessfulTradeAt });
    const { rerender } = render(<Harness props={base} />);
    rerender(<Harness props={{ ...base, isConnected: false, address: undefined, connectedWallet: undefined }} />);
    await act(async () => { d.resolve({ effectiveTier: 3n }); await new Promise((r) => setTimeout(r, 20)); });
    expect(screen.getByTestId('rep').textContent).toBe('null');
  });
});
