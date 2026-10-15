import { describe, expect, it, vi } from 'vitest';
import {
  CHAIN_FALLBACK_CONCURRENCY,
  CHAIN_FALLBACK_MAX_READS,
  CHAIN_FALLBACK_REFRESH_MS,
  canRefreshChainFallback,
  classifyChainTrade,
  loadChainFallbackTrades,
  mapChainTradeToRoomTrade,
  mergeChainTradeIntoRoom,
  runWithConcurrency,
  shouldUseChainFallback,
} from '../../frontend/src/app/chainFallback';
import { ME, OTHER, THIRD, USDT, chainTrade } from './chainTradeFixture';


describe('P4 zincir yedek görünümü — saf yardımcılar', () => {
  it('yalnız backend listesi alınamadığında ve cüzdan bağlıyken açılır', () => {
    expect(shouldUseChainFallback({ backendTradesUnavailable: true, isConnected: true, address: ME })).toBe(true);
    expect(shouldUseChainFallback({ backendTradesUnavailable: false, isConnected: true, address: ME })).toBe(false);
    expect(shouldUseChainFallback({ backendTradesUnavailable: true, isConnected: false, address: ME })).toBe(false);
    expect(shouldUseChainFallback({ backendTradesUnavailable: true, isConnected: true, address: null })).toBe(false);
    expect(shouldUseChainFallback({ backendTradesUnavailable: true, isConnected: true, address: ME, devScenarioActive: true })).toBe(false);
  });

  it('işlemi sınıflandırır: taraf/terminal/yok', () => {
    expect(classifyChainTrade(chainTrade(), ME)).toBe('ok');
    expect(classifyChainTrade(chainTrade({ maker: OTHER, taker: ME }), ME.toUpperCase().replace('0X', '0x'))).toBe('ok');
    expect(classifyChainTrade(chainTrade({ maker: OTHER, taker: THIRD }), ME)).toBe('not_party');
    for (const s of ['RESOLVED', 'CANCELED', 'BURNED']) expect(classifyChainTrade(chainTrade({ state: s }), ME)).toBe('terminal');
    expect(classifyChainTrade(chainTrade({ maker: '0x0000000000000000000000000000000000000000', taker: '0x0000000000000000000000000000000000000000', state: 'OPEN' }), ME)).toBe('not_found');
    expect(classifyChainTrade(null, ME)).toBe('not_found');
  });

  it('zincir okumasını oda biçimine çevirir; backend alanları boş, ping bayrağı olmadan zaman damgası yok sayılır', () => {
    const t = mapChainTradeToRoomTrade('7', chainTrade({ id: 7, state: 'PAID', paidAt: 1_700_000_100, pingedAt: 1_700_000_500, pingedByTaker: false, challengePingedAt: 1_700_000_600, challengePingedByMaker: true, cancelProposedByTaker: true }), { viewer: ME, supportedTokens: { USDT }, tokenDecimalsMap: { USDT: 6 } });
    expect(t).toMatchObject({
      id: null, onchainId: '7', _chainFallback: true, role: 'maker', state: 'PAID', crypto: 'USDT', tokenDecimals: 6,
      cryptoAmountRaw: '100000000', makerBondRaw: '5000000', takerBondRaw: '3000000', takerFeeBps: 10,
      lockedAt: 1_700_000_000, paidAt: 1_700_000_100, challengedAt: null, pingedAt: null, challengePingedAt: 1_700_000_600,
      cancelStatus: 'proposed_by_other', fiat: null, paymentIpfsHash: null,
    });
    expect(mapChainTradeToRoomTrade('7', chainTrade({ maker: OTHER, taker: THIRD }), { viewer: ME })).toBeNull();
  });

  it('yalnız taraf olunan ve kapanmamış işlemleri listeler; kapananları ayrıca bildirir', async () => {
    const raws = {
      1: chainTrade({ id: 1, state: 'LOCKED' }),
      2: chainTrade({ id: 2, maker: OTHER, taker: THIRD, state: 'PAID' }),
      3: chainTrade({ id: 3, state: 'RESOLVED' }),
      4: chainTrade({ id: 4, maker: OTHER, taker: ME, state: 'CHALLENGED', challengedAt: 1_700_000_900 }),
    };
    const readTrade = vi.fn(async (id) => raws[id] ?? null);
    const { trades, terminalIds, failedIds, states } = await loadChainFallbackTrades({ ids: ['1', '2', '3', '4', '5'], viewer: ME, readTrade, supportedTokens: { USDT } });
    expect(trades.map((t) => [t.onchainId, t.role, t.state])).toEqual([['1', 'maker', 'LOCKED'], ['4', 'taker', 'CHALLENGED']]);
    expect(terminalIds).toEqual(['3']);
    expect(failedIds).toEqual(['5']);
    expect(states).toMatchObject({ 1: 'LOCKED', 2: 'PAID', 3: 'RESOLVED', 4: 'CHALLENGED' });
  });

  it('toplu okuyucu (multicall) varsa tek çağrı yapar, tek tek okumaz', async () => {
    const readTrades = vi.fn(async (ids) => ids.map((id) => chainTrade({ id: Number(id) })));
    const readTrade = vi.fn();
    const { trades } = await loadChainFallbackTrades({ ids: ['1', '2'], viewer: ME, readTrade, readTrades });
    expect(readTrades).toHaveBeenCalledTimes(1);
    expect(readTrade).not.toHaveBeenCalled();
    expect(trades).toHaveLength(2);
  });

  it('multicall yoksa en fazla 4 eşzamanlı ve en fazla 50 okuma yapar', async () => {
    let inFlight = 0;
    let peak = 0;
    const readTrade = vi.fn(async (id) => {
      inFlight += 1;
      peak = Math.max(peak, inFlight);
      await new Promise((r) => setTimeout(r, 1));
      inFlight -= 1;
      return chainTrade({ id: Number(id) });
    });
    const ids = Array.from({ length: 70 }, (_, i) => String(i + 1));
    const { trades } = await loadChainFallbackTrades({ ids, viewer: ME, readTrade, readTrades: async () => null });
    expect(CHAIN_FALLBACK_CONCURRENCY).toBe(4);
    expect(CHAIN_FALLBACK_MAX_READS).toBe(50);
    expect(peak).toBeLessThanOrEqual(CHAIN_FALLBACK_CONCURRENCY);
    expect(peak).toBeGreaterThan(1);
    expect(readTrade).toHaveBeenCalledTimes(CHAIN_FALLBACK_MAX_READS);
    expect(trades).toHaveLength(CHAIN_FALLBACK_MAX_READS);
  });

  it('runWithConcurrency sırayı korur ve tek hatada diğerlerini sürdürür', async () => {
    const out = await runWithConcurrency([1, 2, 3], async (n) => { if (n === 2) throw new Error('x'); return n * 10; }, 2);
    expect(out).toEqual([10, null, 30]);
  });

  it('yenileme 30 sn sınırına ve sekme görünürlüğüne bağlıdır', () => {
    expect(CHAIN_FALLBACK_REFRESH_MS).toBe(30_000);
    expect(canRefreshChainFallback({ lastAt: 0, now: 1 })).toBe(true);
    expect(canRefreshChainFallback({ lastAt: 1_000, now: 1_000 + 29_999 })).toBe(false);
    expect(canRefreshChainFallback({ lastAt: 1_000, now: 1_000 + 30_000 })).toBe(true);
    expect(canRefreshChainFallback({ lastAt: 0, now: 1, hidden: true })).toBe(false);
  });

  it('açık odayı birleştirirken durum geri gitmez, dolu zaman damgası silinmez, terminal durum işlenir', () => {
    const base = mapChainTradeToRoomTrade('1', chainTrade({ state: 'PAID', paidAt: 1_700_000_100 }), { viewer: ME });
    const room = { ...base, state: 'CHALLENGED', challengedAt: 1_700_000_200 };
    // RPC gecikmesi: zincir hâlâ PAID diyor → oda CHALLENGED kalır.
    expect(mergeChainTradeIntoRoom(room, base)).toBe(room);
    const pinged = { ...base, pingedAt: '2024-01-01T00:00:00Z' };
    expect(mergeChainTradeIntoRoom(pinged, base).pingedAt).toBe('2024-01-01T00:00:00Z');
    expect(mergeChainTradeIntoRoom(base, { ...base })).toBe(base);
    expect(mergeChainTradeIntoRoom(base, null, 'RESOLVED').state).toBe('RESOLVED');
    expect(mergeChainTradeIntoRoom(base, null, 'LOCKED')).toBe(base);
  });
});
