import { act, cleanup, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useAppSessionData } from '../../frontend/src/app/useAppSessionData';
import { __resetOwnerWalletAgeCache, useOwnerWalletAge, WALLET_AGE_MIN_SEC } from '../../frontend/src/hooks/useOwnerWalletAge';

const baseProps = {
  address: '0xabc0000000000000000000000000000000000000', isConnected: true, connector: null, chainId: 84532,
  publicClient: null, currentView: 'market', showProfileModal: false, profileTab: 'ayarlar', lang: 'EN',
  isContractLoading: false, setShowMakerModal: vi.fn(), setShowProfileModal: vi.fn(), setCurrentView: vi.fn(),
  setActiveTrade: vi.fn(), showToast: vi.fn(),
  SUPPORTED_TOKEN_ADDRESSES: { USDT: '', USDC: '' }, connectedWallet: '0xabc0000000000000000000000000000000000000',
};
const flush = async (ms = 0) => { await act(async () => { await vi.advanceTimersByTimeAsync(ms); }); };
const DAY = 86400;

beforeEach(() => {
  vi.useFakeTimers();
  vi.spyOn(console, 'error').mockImplementation(() => {});
  global.fetch = vi.fn(async () => ({ ok: true, status: 200, json: async () => ({}), clone() { return this; } }));
  __resetOwnerWalletAgeCache();
});
afterEach(() => { cleanup(); vi.useRealTimers(); vi.restoreAllMocks(); });

describe('chain clock offset without an open trade or ban', () => {
  const chainSec = () => Math.floor(Date.now() / 1000) - 3 * DAY; // device clock is 3 days ahead
  const mount = (publicClient) => renderHook(() => useAppSessionData({ ...baseProps, publicClient, getWalletRegisteredAt: vi.fn().mockResolvedValue(0n) }));

  it('no BUY orders, no trade, no ban: block time is not read', async () => {
    const publicClient = { getBlock: vi.fn().mockResolvedValue({ timestamp: BigInt(chainSec()) }) };
    mount(publicClient);
    await flush(0);
    expect(publicClient.getBlock).not.toHaveBeenCalled();
  });

  it('BUY orders listed: block time is read once and offset applied; refreshed every 5 min', async () => {
    const publicClient = { getBlock: vi.fn().mockImplementation(async () => ({ timestamp: BigInt(chainSec()) })) };
    const { result } = mount(publicClient);
    await act(async () => { result.current.setOrders([{ id: 'b1', side: 'BUY_CRYPTO' }]); });
    await flush(0);
    expect(publicClient.getBlock).toHaveBeenCalledTimes(1);
    expect(Math.abs(result.current.chainOffsetMs + 3 * DAY * 1000)).toBeLessThan(2000);
    await flush(5 * 60 * 1000);
    expect(publicClient.getBlock).toHaveBeenCalledTimes(2);
  });

  it('getBlock failure keeps the current offset (0)', async () => {
    const publicClient = { getBlock: vi.fn().mockRejectedValue(new Error('rpc')) };
    const { result } = mount(publicClient);
    await act(async () => { result.current.setOrders([{ id: 'b1', side: 'BUY_CRYPTO' }]); });
    await flush(0);
    expect(result.current.chainOffsetMs).toBe(0);
  });
});

describe('young-owner label follows the chain clock when the device clock is ahead', () => {
  const OWNER = '0x' + 'a'.repeat(40);
  it('chain offset keeps the label; without it the device clock would hide it', async () => {
    const chainNowSec = Math.floor(Date.now() / 1000) - 3 * DAY;
    const reg = BigInt(chainNowSec - DAY / 2); // young on chain clock
    const get = vi.fn().mockResolvedValue(reg);
    const run = (chainOffsetMs) => renderHook(() => useOwnerWalletAge({ owners: [OWNER], getWalletRegisteredAt: get, chainOffsetMs }));
    const withOffset = run(-3 * DAY * 1000);
    await flush(0);
    expect(withOffset.result.current.remainingSecFor(OWNER)).toBeGreaterThan(0);
    expect(withOffset.result.current.remainingSecFor(OWNER)).toBeLessThanOrEqual(WALLET_AGE_MIN_SEC);
    const noOffset = run(0);
    await flush(0);
    expect(noOffset.result.current.remainingSecFor(OWNER)).toBeNull();
  });
});
