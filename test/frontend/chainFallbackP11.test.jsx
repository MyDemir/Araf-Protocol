import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, renderHook, waitFor } from '@testing-library/react';
import { useChainFallbackRoomSync, useChainFallbackTrades } from '../../frontend/src/app/useChainFallbackTrades';
import { mapChainTradeToRoomTrade, mergeChainTradeIntoRoom } from '../../frontend/src/app/chainFallback';
import { addKnownTradeIds } from '../../frontend/src/app/knownTrades';
import { ME, USDT, chainTrade } from './chainTradeFixture';

afterEach(() => cleanup());

const map = (opts = {}) => mapChainTradeToRoomTrade('7', chainTrade({ id: 7, state: 'PAID', paidAt: 1_700_000_100, ...opts }), { viewer: ME, supportedTokens: { USDT } });
const syncSetters = () => ({ setActiveTrade: vi.fn(), setCancelStatus: vi.fn(), setChargebackAccepted: vi.fn(), setCurrentView: vi.fn() });

describe('F2-03: karşı tarafın iptal teklifi/geri çekmesi başka alan değişmeden yansır', () => {
  it('yalnız cancelStatus değişince merge yeni nesne döner', () => {
    const current = map();
    const fresh = map({ cancelProposedByTaker: true });
    expect(fresh.cancelStatus).toBe('proposed_by_other');
    const merged = mergeChainTradeIntoRoom(current, fresh);
    expect(merged).not.toBe(current);
    expect(merged.cancelStatus).toBe('proposed_by_other');
  });

  it('hiçbir şey değişmediyse aynı nesne döner', () => {
    const current = map();
    expect(mergeChainTradeIntoRoom(current, map())).toBe(current);
  });

  it('oda senkronu yalnız iptal bayrağı değişince setCancelStatus çağırır; geri çekme null yapar', () => {
    const current = map();
    const fresh = map({ cancelProposedByTaker: true });
    const s1 = syncSetters();
    renderHook(() => useChainFallbackRoomSync({ enabled: true, activeTrade: current, address: ME, userRole: 'maker', trades: [fresh], states: { 7: 'PAID' }, ...s1 }));
    expect(s1.setCancelStatus).toHaveBeenCalledWith('proposed_by_other');

    const withProposal = { ...current, cancelStatus: 'proposed_by_other' };
    const s2 = syncSetters();
    renderHook(() => useChainFallbackRoomSync({ enabled: true, activeTrade: withProposal, address: ME, userRole: 'maker', trades: [map()], states: { 7: 'PAID' }, ...s2 }));
    expect(s2.setCancelStatus).toHaveBeenCalledWith(null);
  });
});

describe('F2-04: başarısız okumalar önceki sonucu korur ve failedIds açılır', () => {
  const ESCROW = '0x3333333333333333333333333333333333333333';
  const scope = { wallet: ME, escrow: ESCROW, chainId: 84532 };
  beforeEach(() => window.localStorage.clear());

  it('ikinci okumada id 2 okunamazsa listede kalır ve failedIds [2] olur', async () => {
    addKnownTradeIds(scope, ['1', '2']);
    let fail = false;
    const raws = { 1: chainTrade({ id: 1, state: 'PAID', paidAt: 1_700_000_100 }), 2: chainTrade({ id: 2, state: 'PAID', paidAt: 1_700_000_100 }) };
    const readTrade = vi.fn(async (id) => (fail && id === '2' ? null : raws[id]));
    let now = 1_000_000;
    const props = { enabled: true, viewActive: true, address: ME, chainId: 84532, escrowAddress: ESCROW, readTrade, supportedTokens: { USDT }, tokenDecimalsMap: { USDT: 6 }, nowFn: () => now };
    const { result } = renderHook(() => useChainFallbackTrades(props));
    await waitFor(() => expect(result.current.loadedAt).toBeGreaterThan(0));
    expect(result.current.trades.map((t) => t.onchainId).sort()).toEqual(['1', '2']);
    expect(result.current.failedIds).toEqual([]);

    fail = true;
    now += 60_000;
    await act(async () => { await result.current.refresh(); });
    expect(result.current.trades.map((t) => t.onchainId).sort()).toEqual(['1', '2']);
    expect(result.current.states['2']).toBe('PAID');
    expect(result.current.failedIds).toEqual(['2']);
  });
});
