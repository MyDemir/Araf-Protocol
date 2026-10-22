import React from 'react';
import { afterEach, beforeEach, describe, it, expect, vi } from 'vitest';
import { act, cleanup, render, screen, waitFor } from '@testing-library/react';
import { buildAppViews } from '../../frontend/src/app/AppViews';
import { __resetOwnerWalletAgeCache, formatOwnerAgeRemaining } from '../../frontend/src/hooks/useOwnerWalletAge';

afterEach(() => { cleanup(); vi.useRealTimers(); });
beforeEach(() => { __resetOwnerWalletAgeCache(); });

const baseCtx = {
  lang: 'EN', setLang: vi.fn(), isConnected: true, isAuthenticated: true, hasPayoutProfile: true,
  isLoggingIn: false, isContractLoading: false, loadingText: '', isPaused: false, authChecked: true,
  currentView: 'market', setCurrentView: vi.fn(), toggleSidebar: vi.fn(), handleAuthAction: vi.fn(),
  formatAddress: (a) => a, address: '0xabc', chainId: 84532, sidebarOpen: false, setSidebarOpen: vi.fn(),
  setExpandedStatus: vi.fn(), expandedStatus: null,
  marketFilters: { side: 'ALL', token: 'ALL', amount: '', fiat: 'ALL', tier: 'ALL', sort: 'AUTO', hideOwn: false },
  setMarketFilter: vi.fn(), resetMarketFilters: vi.fn(), orders: [], activeEscrows: [], loading: false,
  SUPPORTED_TOKEN_ADDRESSES: { USDT: '0x1', USDC: '0x2' }, handleStartTrade: vi.fn(), handleMint: vi.fn(),
  isFaucetEnabled: true, isSupportedChainId: () => true, handleOpenMakerModal: vi.fn(),
  activeEscrowCounts: { LOCKED: 0, PAID: 0, CHALLENGED: 0 }, userReputation: { effectiveTier: 3 },
  sybilStatus: { funded: true, cooldownOk: true, cooldownRemaining: 0 }, takerFeeBps: 10,
  activeTrade: null, userRole: 'taker',
};

const OWNER_A = '0x' + 'a'.repeat(40);
const OWNER_B = '0x' + 'b'.repeat(40);
const buyOrder = (id, makerFull, extra = {}) => ({
  id, onchainId: Number(id.replace(/\D/g, '')) || 1, side: 'BUY_CRYPTO', crypto: 'USDT', tier: 0, fiat: 'TRY', rate: 40,
  remainingAmount: 10, minFillAmount: 1, maker: makerFull.slice(0, 6), makerFull, ...extra,
});
const nowSec = () => Math.floor(Date.now() / 1000);
const DAY = 86400;

const renderMarket = (ctx) => render(<div>{buildAppViews({ ...baseCtx, ...ctx }).renderMarket()}</div>);
const flush = () => act(async () => { await Promise.resolve(); await Promise.resolve(); });

describe('market: buy order owner wallet age hint (fail-open)', () => {
  it('young owner: shows label + remaining time + help, and disables the fill button', async () => {
    const reg = BigInt(nowSec() - DAY / 2); // 1.5 days left -> ~2 days
    const getWalletRegisteredAt = vi.fn().mockResolvedValue(reg);
    renderMarket({ filteredOrders: [buyOrder('b1', OWNER_A)], getWalletRegisteredAt });
    await waitFor(() => expect(screen.getByTestId('fill-owner-too-young')).toBeInTheDocument());
    expect(screen.getByTestId('fill-owner-too-young').textContent).toMatch(/Not fillable yet · ~2 days/);
    expect(screen.getByTestId('fill-owner-too-young').textContent).toMatch(/2-day age period/);
    expect(screen.getByRole('button', { name: /Not fillable yet/ })).toBeDisabled();
  });

  it('old owner: no label, button stays enabled', async () => {
    const getWalletRegisteredAt = vi.fn().mockResolvedValue(BigInt(nowSec() - 5 * DAY));
    renderMarket({ filteredOrders: [buyOrder('b1', OWNER_A)], getWalletRegisteredAt });
    await waitFor(() => expect(getWalletRegisteredAt).toHaveBeenCalled());
    await flush();
    expect(screen.queryByTestId('fill-owner-too-young')).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Not fillable yet/ })).not.toBeInTheDocument();
    expect(screen.getByTestId('market-order-list').querySelector('button')).not.toBeDisabled();
  });

  it('read failure or 0n: no label and the button stays open', async () => {
    for (const fn of [vi.fn().mockRejectedValue(new Error('rpc down')), vi.fn().mockResolvedValue(0n), undefined]) {
      cleanup(); __resetOwnerWalletAgeCache();
      renderMarket({ filteredOrders: [buyOrder('b1', OWNER_A)], getWalletRegisteredAt: fn });
      if (fn) await waitFor(() => expect(fn).toHaveBeenCalled());
      await flush();
      expect(screen.queryByTestId('fill-owner-too-young')).not.toBeInTheDocument();
      expect(screen.getByTestId('market-order-list').querySelector('button')).not.toBeDisabled();
    }
  });

  it('does not read for SELL orders', async () => {
    const getWalletRegisteredAt = vi.fn().mockResolvedValue(BigInt(nowSec()));
    renderMarket({ filteredOrders: [buyOrder('s1', OWNER_A, { side: 'SELL_CRYPTO' })], getWalletRegisteredAt });
    await flush();
    expect(getWalletRegisteredAt).not.toHaveBeenCalled();
    expect(screen.queryByTestId('fill-owner-too-young')).not.toBeInTheDocument();
  });

  it('several orders from the same owner trigger one read per unique owner', async () => {
    const getWalletRegisteredAt = vi.fn().mockResolvedValue(BigInt(nowSec()));
    renderMarket({
      filteredOrders: [buyOrder('b1', OWNER_A), buyOrder('b2', OWNER_A), buyOrder('b3', OWNER_A.toUpperCase().replace('0X', '0x')), buyOrder('b4', OWNER_B)],
      getWalletRegisteredAt,
    });
    await waitFor(() => expect(screen.getAllByTestId('fill-owner-too-young')).toHaveLength(4));
    expect(getWalletRegisteredAt).toHaveBeenCalledTimes(2);
  });

  it('label disappears by itself when the age period ends', async () => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'Date'] });
    const reg = BigInt(nowSec() - 2 * DAY + 30); // 30 s left
    const getWalletRegisteredAt = vi.fn().mockResolvedValue(reg);
    renderMarket({ filteredOrders: [buyOrder('b1', OWNER_A)], getWalletRegisteredAt });
    await flush();
    expect(screen.getByTestId('fill-owner-too-young')).toBeInTheDocument();
    await act(async () => { vi.advanceTimersByTime(40_000); });
    await flush();
    expect(screen.queryByTestId('fill-owner-too-young')).not.toBeInTheDocument();
  });

  it('formats remaining time as days or hours', () => {
    expect(formatOwnerAgeRemaining(1.2 * DAY, 'TR')).toBe('~2 gün');
    expect(formatOwnerAgeRemaining(3 * 3600 - 5, 'EN')).toBe('~3 hours');
    expect(formatOwnerAgeRemaining(10, 'EN')).toBe('~1 hour');
  });
});
