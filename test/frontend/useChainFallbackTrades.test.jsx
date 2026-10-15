import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, renderHook, waitFor } from '@testing-library/react';
import { useChainFallbackTrades } from '../../frontend/src/app/useChainFallbackTrades';
import { addKnownTradeIds, readKnownTradeIds } from '../../frontend/src/app/knownTrades';
import { ME, OTHER, THIRD, USDT, chainTrade } from './chainTradeFixture';

const ESCROW = '0x3333333333333333333333333333333333333333';
const CHAIN = 84532;
const scope = { wallet: ME, escrow: ESCROW, chainId: CHAIN };

const raws = {
  1: chainTrade({ id: 1, state: 'PAID', paidAt: 1_700_000_100 }),
  2: chainTrade({ id: 2, maker: OTHER, taker: THIRD }),
  3: chainTrade({ id: 3, state: 'CANCELED' }),
  4: chainTrade({ id: 4, maker: OTHER, taker: ME, state: 'CHALLENGED', challengedAt: 1_700_000_900 }),
};

const setHidden = (value) => Object.defineProperty(document, 'hidden', { configurable: true, get: () => value });

const baseProps = (overrides = {}) => ({
  enabled: true,
  viewActive: true,
  address: ME,
  chainId: CHAIN,
  escrowAddress: ESCROW,
  readTrade: vi.fn(async (id) => raws[id] ?? null),
  readTrades: null,
  supportedTokens: { USDT },
  tokenDecimalsMap: { USDT: 6 },
  ...overrides,
});

describe('P4 useChainFallbackTrades', () => {
  beforeEach(() => {
    window.localStorage.clear();
    setHidden(false);
  });
  afterEach(() => {
    vi.useRealTimers();
    setHidden(false);
  });

  it('yedek mod kapalıyken (backend sağlıklı) hiç okuma yapmaz', async () => {
    addKnownTradeIds(scope, ['1']);
    const props = baseProps({ enabled: false });
    const { result } = renderHook(() => useChainFallbackTrades(props));
    await act(async () => {});
    expect(props.readTrade).not.toHaveBeenCalled();
    expect(result.current.active).toBe(false);
    expect(result.current.trades).toEqual([]);
  });

  it('görünüm kapalıyken okuma yapmaz', async () => {
    addKnownTradeIds(scope, ['1']);
    const props = baseProps({ viewActive: false });
    renderHook(() => useChainFallbackTrades(props));
    await act(async () => {});
    expect(props.readTrade).not.toHaveBeenCalled();
  });

  it('bilinen id\'leri getTrade ile okur; yalnız taraf olunan açık işlemleri listeler, kapananı kayıttan siler', async () => {
    addKnownTradeIds(scope, ['1', '2', '3', '4']);
    const props = baseProps();
    const { result } = renderHook(() => useChainFallbackTrades(props));
    await waitFor(() => expect(result.current.loadedAt).toBeGreaterThan(0));
    expect(result.current.trades.map((t) => [t.onchainId, t.role, t.state])).toEqual([['1', 'maker', 'PAID'], ['4', 'taker', 'CHALLENGED']]);
    expect(readKnownTradeIds(scope)).not.toContain('3');
    expect(readKnownTradeIds(scope)).toContain('2');
  });

  it('30 sn\'den sık yenilemez, sekme gizliyken yenilemez ve her turda backend\'i bir kez yeniden dener', async () => {
    vi.useFakeTimers();
    let now = 1_000_000;
    addKnownTradeIds(scope, ['1']);
    const onRetryBackend = vi.fn();
    const props = baseProps({ nowFn: () => now, onRetryBackend });
    const { result } = renderHook(() => useChainFallbackTrades(props));
    await act(async () => { await Promise.resolve(); });
    expect(props.readTrade).toHaveBeenCalledTimes(1);

    // Elle yenileme 30 sn dolmadan okumaz.
    now += 10_000;
    await act(async () => { await result.current.refresh(); });
    expect(props.readTrade).toHaveBeenCalledTimes(1);

    // 30 sn sonra interval bir kez okur.
    now += 20_000;
    await act(async () => { vi.advanceTimersByTime(30_000); await Promise.resolve(); });
    expect(props.readTrade).toHaveBeenCalledTimes(2);
    expect(onRetryBackend).toHaveBeenCalledTimes(1);

    // Sekme gizli: ne okuma ne backend denemesi.
    setHidden(true);
    now += 30_000;
    await act(async () => { vi.advanceTimersByTime(30_000); await Promise.resolve(); });
    expect(props.readTrade).toHaveBeenCalledTimes(2);
    expect(onRetryBackend).toHaveBeenCalledTimes(1);
  });

  it('elle giriş: geçersiz / başkasının işlemi / kapanmış / uygun işlem', async () => {
    const props = baseProps();
    const { result } = renderHook(() => useChainFallbackTrades(props));
    await act(async () => {});

    await expect(result.current.submitManualId('abc')).resolves.toEqual({ status: 'invalid' });
    await expect(result.current.submitManualId('0')).resolves.toEqual({ status: 'invalid' });
    await expect(result.current.submitManualId('-4')).resolves.toEqual({ status: 'invalid' });

    let res;
    await act(async () => { res = await result.current.submitManualId('2'); });
    expect(res.status).toBe('not_party');
    expect(readKnownTradeIds(scope)).not.toContain('2');

    await act(async () => { res = await result.current.submitManualId('3'); });
    expect(res.status).toBe('terminal');

    await act(async () => { res = await result.current.submitManualId('99'); });
    expect(res.status).toBe('read_error');

    await act(async () => { res = await result.current.submitManualId(' 4 '); });
    expect(res.status).toBe('ok');
    expect(res.trade).toMatchObject({ onchainId: '4', role: 'taker', _chainFallback: true });
    expect(readKnownTradeIds(scope)).toEqual(['4']);
    expect(result.current.trades.map((t) => t.onchainId)).toContain('4');
  });

  it('yedek mod kapalıyken elle giriş okuma yapmaz', async () => {
    const props = baseProps({ enabled: false });
    const { result } = renderHook(() => useChainFallbackTrades(props));
    await expect(result.current.submitManualId('4')).resolves.toEqual({ status: 'disabled' });
    expect(props.readTrade).not.toHaveBeenCalled();
  });
});
