import React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, render, screen, waitFor } from '@testing-library/react';
import { useAppSessionData } from '../../frontend/src/app/useAppSessionData';

const ADDRESS = '0xabc';
const response = (body, status = 200) => ({ ok: status >= 200 && status < 300, status, json: async () => body });

const makeOrder = (index) => ({
  _id: `order-${index}`,
  onchain_order_id: String(2000 + index),
  owner_address: '0xother',
  side: 'SELL_CRYPTO',
  status: 'OPEN',
  tier: 0,
  market: { crypto_asset: 'USDT', fiat_currency: 'TRY', exchange_rate: 33 },
  amounts: { min_fill_amount: '1000000', remaining_amount: '1000000', min_fill_amount_num: 1, remaining_amount_num: 1 },
  stats: { fills_count: 0 },
});

const baseProps = {
  address: ADDRESS, isConnected: true, connector: null, chainId: 84532, publicClient: null,
  currentView: 'market', showProfileModal: false, profileTab: 'ayarlar', lang: 'EN', isContractLoading: false,
  setShowMakerModal: vi.fn(), setShowProfileModal: vi.fn(), setCurrentView: vi.fn(), showToast: vi.fn(),
  getTakerFeeBps: undefined, getTokenDecimals: undefined, getCurrentAmounts: undefined,
  getWalletRegisteredAt: undefined, getReputation: undefined, getFirstSuccessfulTradeAt: undefined,
  antiSybilCheck: undefined, getCooldownRemaining: undefined, getPaused: undefined,
  SUPPORTED_TOKEN_ADDRESSES: { USDT: '', USDC: '' },
};

let api;
const Harness = () => {
  const state = useAppSessionData({ ...baseProps, connectedWallet: ADDRESS });
  api = state;
  return (
    <div>
      <div data-testid="count">{state.orders.length}</div>
      <div data-testid="ids">{state.orders.map((o) => o.id).join(',')}</div>
      <div data-testid="more">{String(state.marketHasMore)}</div>
    </div>
  );
};

let serverOrders;
const publicCalls = () => global.fetch.mock.calls
  .map(([url]) => new URL(String(url), 'http://localhost'))
  .filter((u) => u.pathname.endsWith('/api/orders'));

const installFetch = () => {
  global.fetch = vi.fn(async (url) => {
    const u = new URL(String(url), 'http://localhost');
    if (u.pathname.endsWith('/api/auth/me')) return response({ wallet: ADDRESS });
    if (u.pathname.endsWith('/api/orders/config')) return response({});
    if (u.pathname.endsWith('/api/stats')) return response({ stats: {} });
    if (u.pathname.endsWith('/api/orders')) {
      const page = Number(u.searchParams.get('page') || 1);
      const limit = Number(u.searchParams.get('limit') || 50);
      return response({ orders: serverOrders.slice((page - 1) * limit, page * limit), total: serverOrders.length, page, limit });
    }
    return response({});
  });
};

const loadMore = async (times) => {
  for (let i = 0; i < times; i += 1) {
    const before = Number(screen.getByTestId('count').textContent);
    await act(async () => { await api.loadMoreMarketOrders(); });
    await waitFor(() => expect(Number(screen.getByTestId('count').textContent)).toBeGreaterThan(before));
  }
};

describe('F-pazar yoklamasi: yuklu sayfalar yeniden cekilir', () => {
  const originalFetch = global.fetch;
  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers({ shouldAdvanceTime: true });
  });
  afterEach(() => {
    cleanup();
    vi.useRealTimers();
    global.fetch = originalFetch;
  });

  it('3 sayfa yuklu: yoklama 3 istek atar ve sayfa 2+ te artik donmeyen emirler dusar', async () => {
    serverOrders = Array.from({ length: 120 }, (_, i) => makeOrder(i + 1));
    installFetch();
    render(<Harness />);
    await waitFor(() => expect(screen.getByTestId('count').textContent).toBe('50'));
    await loadMore(2);
    expect(screen.getByTestId('count').textContent).toBe('120');
    expect(screen.getByTestId('ids').textContent).toContain('order-70');

    // Sunucuda sayfa 1'den bir, sayfa 2'den bir emir iptal olur.
    serverOrders = serverOrders.filter((o) => o._id !== 'order-5' && o._id !== 'order-70');
    const before = publicCalls().length;
    await act(async () => { await vi.advanceTimersByTimeAsync(30000); });
    await waitFor(() => expect(screen.getByTestId('count').textContent).toBe('118'));
    expect(screen.getByTestId('ids').textContent).not.toContain('order-70');
    expect(screen.getByTestId('ids').textContent).not.toContain('order-5,');
    expect(publicCalls().length - before).toBe(2 + 1);
    const pages = publicCalls().slice(before).map((u) => u.searchParams.get('page') || '1').sort();
    expect(pages).toEqual(['1', '2', '3']);
  });

  it('8 sayfa yuklu: yoklama en fazla 5 sayfa ceker, daha fazla yukle acik kalir', async () => {
    serverOrders = Array.from({ length: 400 }, (_, i) => makeOrder(i + 1));
    installFetch();
    render(<Harness />);
    await waitFor(() => expect(screen.getByTestId('count').textContent).toBe('50'));
    await loadMore(7);
    expect(screen.getByTestId('count').textContent).toBe('400');
    const before = publicCalls().length;
    await act(async () => { await vi.advanceTimersByTimeAsync(30000); });
    await waitFor(() => expect(screen.getByTestId('count').textContent).toBe('250'));
    const pages = publicCalls().slice(before).map((u) => u.searchParams.get('page') || '1').sort();
    expect(pages).toEqual(['1', '2', '3', '4', '5']);
    expect(screen.getByTestId('more').textContent).toBe('true');
    // Sonraki "daha fazla yukle" 6. sayfadan devam eder.
    await loadMore(1);
    expect(screen.getByTestId('count').textContent).toBe('300');
  });

  it('yalniz 1. sayfa yukluyse yoklama tek istek atar (mevcut davranis)', async () => {
    serverOrders = Array.from({ length: 120 }, (_, i) => makeOrder(i + 1));
    installFetch();
    render(<Harness />);
    await waitFor(() => expect(screen.getByTestId('count').textContent).toBe('50'));
    const before = publicCalls().length;
    await act(async () => { await vi.advanceTimersByTimeAsync(30000); });
    await waitFor(() => expect(publicCalls().length - before).toBeGreaterThan(0));
    expect(publicCalls().length - before).toBe(1);
  });
  it('ucusta daha-fazla-yukle varken yoklama sayfayi daraltmaz; liste bosluksuz kalir', async () => {
    serverOrders = Array.from({ length: 450 }, (_, i) => makeOrder(i + 1));
    const baseFetch = (() => { installFetch(); return global.fetch; })();
    let release;
    const gate = new Promise((resolve) => { release = resolve; });
    global.fetch = vi.fn(async (url, ...rest) => {
      const u = new URL(String(url), 'http://localhost');
      if (u.pathname.endsWith('/api/orders') && u.searchParams.get('page') === '9') await gate;
      return baseFetch(url, ...rest);
    });
    render(<Harness />);
    await waitFor(() => expect(screen.getByTestId('count').textContent).toBe('50'));
    await loadMore(7);
    expect(screen.getByTestId('count').textContent).toBe('400');
    let pending;
    await act(async () => { pending = api.loadMoreMarketOrders(); });
    await act(async () => { await vi.advanceTimersByTimeAsync(30000); });
    await act(async () => { release(); await pending; });
    await waitFor(() => expect(screen.getByTestId('count').textContent).toBe('450'));
    const expected = Array.from({ length: 450 }, (_, i) => `order-${i + 1}`).join(',');
    expect(screen.getByTestId('ids').textContent).toBe(expected);
  });
});
