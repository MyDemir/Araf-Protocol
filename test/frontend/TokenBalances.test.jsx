import React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, render, renderHook, screen } from '@testing-library/react';
import { TokenBalancesView } from '../../frontend/src/components/TokenBalances';
import { buildTokenList, useTokenBalances, watchToken } from '../../frontend/src/hooks/useTokenBalances';

const USDT = '0x1111111111111111111111111111111111111111';
const USDC = '0x2222222222222222222222222222222222222222';
const OWNER = '0x3333333333333333333333333333333333333333';
const tokens = [
  { key: 'USDT', symbol: 'USDT', address: USDT, decimals: 6 },
  { key: 'USDC', symbol: 'USDC', address: USDC, decimals: 6 },
];

const setVisibility = (state) => Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => state });

beforeEach(() => { vi.useFakeTimers(); setVisibility('visible'); });
afterEach(() => { cleanup(); vi.useRealTimers(); vi.restoreAllMocks(); setVisibility('visible'); });

describe('buildTokenList', () => {
  it('reads configured addresses and decimals, skips zero/invalid', () => {
    const list = buildTokenList({ VITE_USDT_ADDRESS: '0x0000000000000000000000000000000000000000', VITE_USDC_ADDRESS: USDC }, { USDC: 18 });
    expect(list).toHaveLength(1);
    expect(list[0]).toMatchObject({ key: 'USDC', decimals: 18 });
    expect(list[0].address.toLowerCase()).toBe(USDC);
  });
});

describe('TokenBalancesView', () => {
  it('formats by decimals and shows "okunamadı" (not 0) on failed read', () => {
    render(<TokenBalancesView lang="TR" tokens={tokens}
      balances={{ USDT: { status: 'ok', raw: 20_000_000n }, USDC: { status: 'error' } }} onWatch={() => {}} />);
    expect(screen.getByTestId('token-balance-USDT').textContent).toBe('20');
    expect(screen.getByTestId('token-balance-USDC').textContent).toBe('okunamadı');
  });
  it('respects decimals', () => {
    render(<TokenBalancesView lang="EN" tokens={[{ ...tokens[0], decimals: 18 }]} balances={{ USDT: { status: 'ok', raw: 1_500_000_000_000_000_000n } }} onWatch={() => {}} />);
    expect(screen.getByTestId('token-balance-USDT').textContent).toBe('1.5');
  });
});

describe('useTokenBalances', () => {
  it('marks failed reads as error, not zero', async () => {
    const publicClient = { readContract: vi.fn().mockRejectedValue(new Error('rpc down')) };
    const { result } = renderHook(() => useTokenBalances({ publicClient, owner: OWNER, tokens }));
    await act(async () => { await vi.advanceTimersByTimeAsync(0); });
    expect(result.current.balances.USDT).toEqual({ status: 'error' });
  });
  it('reads balanceOf and refreshes no faster than 30s', async () => {
    const publicClient = { readContract: vi.fn().mockResolvedValue(5n) };
    const { result } = renderHook(() => useTokenBalances({ publicClient, owner: OWNER, tokens, intervalMs: 1000 }));
    await act(async () => { await vi.advanceTimersByTimeAsync(0); });
    expect(result.current.balances.USDT).toEqual({ status: 'ok', raw: 5n });
    expect(publicClient.readContract).toHaveBeenCalledWith(expect.objectContaining({ functionName: 'balanceOf', args: [OWNER], address: USDT }));
    expect(publicClient.readContract).toHaveBeenCalledTimes(2);
    await act(async () => { await vi.advanceTimersByTimeAsync(29_000); });
    expect(publicClient.readContract).toHaveBeenCalledTimes(2);
    await act(async () => { await vi.advanceTimersByTimeAsync(1_500); });
    expect(publicClient.readContract).toHaveBeenCalledTimes(4);
  });
  it('does not read while the tab is hidden', async () => {
    setVisibility('hidden');
    const publicClient = { readContract: vi.fn().mockResolvedValue(5n) };
    renderHook(() => useTokenBalances({ publicClient, owner: OWNER, tokens }));
    await act(async () => { await vi.advanceTimersByTimeAsync(95_000); });
    expect(publicClient.readContract).not.toHaveBeenCalled();
  });
});

describe('watchToken', () => {
  it('sends EIP-747 params', async () => {
    const provider = { request: vi.fn().mockResolvedValue(true) };
    expect(await watchToken(provider, tokens[0])).toBe('added');
    expect(provider.request).toHaveBeenCalledWith({
      method: 'wallet_watchAsset',
      params: { type: 'ERC20', options: { address: USDT, symbol: 'USDT', decimals: 6 } },
    });
  });
  it('does not log a user rejection as an error', async () => {
    const err = vi.spyOn(console, 'error').mockImplementation(() => {});
    const provider = { request: vi.fn().mockRejectedValue(Object.assign(new Error('User rejected the request.'), { code: 4001 })) };
    expect(await watchToken(provider, tokens[0])).toBe('rejected');
    expect(err).not.toHaveBeenCalled();
  });
  it('reports unsupported wallets without logging', async () => {
    const err = vi.spyOn(console, 'error').mockImplementation(() => {});
    expect(await watchToken(null, tokens[0])).toBe('unsupported');
    const provider = { request: vi.fn().mockRejectedValue(Object.assign(new Error('Method not found'), { code: -32601 })) };
    expect(await watchToken(provider, tokens[0])).toBe('unsupported');
    expect(err).not.toHaveBeenCalled();
  });
  it('logs unexpected failures', async () => {
    const err = vi.spyOn(console, 'error').mockImplementation(() => {});
    const provider = { request: vi.fn().mockRejectedValue(new Error('boom')) };
    expect(await watchToken(provider, tokens[0])).toBe('error');
    expect(err).toHaveBeenCalled();
  });
});
