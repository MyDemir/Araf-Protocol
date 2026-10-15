import React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import { useAppSessionData } from '../../frontend/src/app/useAppSessionData';
import { readKnownTradeIds } from '../../frontend/src/app/knownTrades';
import { __resetInfraForTest } from '../../frontend/src/app/infraHealth';

const ADDRESS = '0x1111111111111111111111111111111111111111';
const ESCROW = '0x3333333333333333333333333333333333333333';
const CHAIN = 84532;

const response = (body, status = 200) => ({
  ok: status >= 200 && status < 300,
  status,
  headers: { get: () => null },
  json: async () => body,
  clone() { return this; },
});

const trade = (id, status = 'LOCKED') => ({
  _id: `t-${id}`,
  onchain_escrow_id: String(id),
  maker_address: ADDRESS,
  taker_address: '0x2222222222222222222222222222222222222222',
  status,
  financials: { crypto_amount: '1000000', crypto_asset: 'USDT' },
  timers: {},
});

// [TR] Sabit kimlikli props: her render'da yeni vi.fn() oturum efektlerini sonsuz döngüye sokar.
const HOOK_PROPS = {
  address: ADDRESS,
  isConnected: true,
  connector: null,
  chainId: CHAIN,
  publicClient: null,
  currentView: 'home',
  lang: 'EN',
  isContractLoading: false,
  connectedWallet: ADDRESS,
  setShowMakerModal: vi.fn(),
  setCurrentView: vi.fn(),
  showToast: vi.fn(),
  SUPPORTED_TOKEN_ADDRESSES: { USDT: '', USDC: '' },
};

const Harness = () => {
  const state = useAppSessionData(HOOK_PROPS);
  return (
    <div>
      <span data-testid="auth">{String(state.isAuthenticated)}</span>
      <span data-testid="unavailable">{String(state.tradesBackendUnavailable)}</span>
      <span data-testid="count">{state.activeEscrows.length}</span>
    </div>
  );
};

const installFetch = ({ authMe, tradesMy }) => {
  global.fetch = vi.fn(async (url) => {
    const path = new URL(String(url), 'http://localhost').pathname;
    if (path.endsWith('/api/auth/me')) return authMe();
    if (path.endsWith('/api/trades/my')) return tradesMy();
    if (path.endsWith('/api/orders/my')) return response({ orders: [], total: 0, page: 1, limit: 50 });
    if (path.endsWith('/api/orders/config')) return response({});
    if (path.endsWith('/api/stats')) return response({ stats: {} });
    if (path.endsWith('/api/orders')) return response({ orders: [] });
    return response({});
  });
};

describe('P4 useAppSessionData — backend işlem listesi alınamadı bayrağı', () => {
  const originalFetch = global.fetch;
  beforeEach(() => {
    window.localStorage.clear();
    vi.stubEnv('VITE_ESCROW_ADDRESS', ESCROW);
    __resetInfraForTest?.();
  });
  afterEach(() => {
    cleanup();
    global.fetch = originalFetch;
    vi.unstubAllEnvs();
  });

  it('trades/my başarılı → yedek mod kapalı ve onchain id\'ler kaydedilir', async () => {
    installFetch({
      authMe: () => response({ wallet: ADDRESS }),
      tradesMy: () => response({ trades: [trade(11), trade(12, 'PAID')], total: 2, page: 1, limit: 50 }),
    });
    render(<Harness />);
    await waitFor(() => expect(screen.getByTestId('count').textContent).toBe('2'));
    expect(screen.getByTestId('unavailable').textContent).toBe('false');
    expect(readKnownTradeIds({ wallet: ADDRESS, escrow: ESCROW, chainId: CHAIN }).sort()).toEqual(['11', '12']);
  });

  it('trades/my 503 (degraded) → yedek mod bayrağı açılır', async () => {
    installFetch({
      authMe: () => response({ wallet: ADDRESS }),
      tradesMy: () => response({ error: 'SERVICE_DEGRADED' }, 503),
    });
    const err = vi.spyOn(console, 'error').mockImplementation(() => {});
    render(<Harness />);
    await waitFor(() => expect(screen.getByTestId('unavailable').textContent).toBe('true'));
    expect(screen.getByTestId('auth').textContent).toBe('true');
    err.mockRestore();
  });

  it('trades/my ağ hatası → yedek mod bayrağı açılır', async () => {
    installFetch({
      authMe: () => response({ wallet: ADDRESS }),
      tradesMy: () => { throw new TypeError('Failed to fetch'); },
    });
    const err = vi.spyOn(console, 'error').mockImplementation(() => {});
    render(<Harness />);
    await waitFor(() => expect(screen.getByTestId('unavailable').textContent).toBe('true'));
    err.mockRestore();
  });

  it('/auth/me 5xx → oturum doğrulanamıyor, liste istenemez: bayrak açılır', async () => {
    installFetch({ authMe: () => response({}, 502), tradesMy: () => response({}, 500) });
    render(<Harness />);
    await waitFor(() => expect(screen.getByTestId('unavailable').textContent).toBe('true'));
    expect(screen.getByTestId('auth').textContent).toBe('false');
  });

  it('/auth/me 401 (backend sağlıklı, oturum yok) → bayrak kapalı kalır', async () => {
    installFetch({ authMe: () => response({ error: 'unauth' }, 401), tradesMy: () => response({}, 401) });
    render(<Harness />);
    await waitFor(() => expect(global.fetch).toHaveBeenCalled());
    await new Promise((r) => setTimeout(r, 20));
    expect(screen.getByTestId('unavailable').textContent).toBe('false');
  });
});
