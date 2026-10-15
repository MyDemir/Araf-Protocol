import { describe, expect, it } from 'vitest';
import {
  MAX_KNOWN_TRADES,
  addKnownTradeIds,
  knownTradesStorageKey,
  normalizeKnownTradeId,
  readKnownTradeIds,
  removeKnownTradeIds,
} from '../../frontend/src/app/knownTrades';

const WALLET = '0x1111111111111111111111111111111111111111';
const OTHER_WALLET = '0x2222222222222222222222222222222222222222';
const ESCROW = '0x3333333333333333333333333333333333333333';
const OTHER_ESCROW = '0x4444444444444444444444444444444444444444';
const scope = { wallet: WALLET, escrow: ESCROW, chainId: 84532 };

const memoryStorage = () => {
  const map = new Map();
  return {
    map,
    getItem: (k) => (map.has(k) ? map.get(k) : null),
    setItem: (k, v) => { map.set(k, String(v)); },
    removeItem: (k) => { map.delete(k); },
  };
};

describe('P4 bilinen tradeId kaydı (knownTrades)', () => {
  it('yalnız pozitif tam sayıları kanonik dizgeye çevirir', () => {
    expect(normalizeKnownTradeId('42')).toBe('42');
    expect(normalizeKnownTradeId('#007')).toBe('7');
    expect(normalizeKnownTradeId(12n)).toBe('12');
    expect(normalizeKnownTradeId(5)).toBe('5');
    for (const bad of ['0', '-1', '1.5', 'abc', '', ' ', '1e3', null, undefined, 0, -3, 1.2, '0x10']) {
      expect(normalizeKnownTradeId(bad)).toBeNull();
    }
  });

  it('ekler, en yeniyi başa koyar ve tekrar eklemez', () => {
    const store = memoryStorage();
    expect(addKnownTradeIds(scope, ['5'], store)).toEqual(['5']);
    expect(addKnownTradeIds(scope, ['6', '5', 6n], store)).toEqual(['6', '5']);
    expect(addKnownTradeIds(scope, ['5'], store)).toEqual(['6', '5']);
    expect(readKnownTradeIds(scope, store)).toEqual(['6', '5']);
    // Geçersiz değerler kaydı bozmaz.
    expect(addKnownTradeIds(scope, ['x', null, '0'], store)).toEqual(['6', '5']);
  });

  it(`en fazla ${MAX_KNOWN_TRADES} id tutar; taşan en eskiler düşer`, () => {
    const store = memoryStorage();
    addKnownTradeIds(scope, Array.from({ length: 60 }, (_, i) => String(i + 1)), store);
    const ids = readKnownTradeIds(scope, store);
    expect(ids).toHaveLength(MAX_KNOWN_TRADES);
    addKnownTradeIds(scope, ['999'], store);
    const after = readKnownTradeIds(scope, store);
    expect(after).toHaveLength(MAX_KNOWN_TRADES);
    expect(after[0]).toBe('999');
    expect(after).not.toContain(ids[ids.length - 1]);
  });

  it('cüzdan, escrow ve zincir ayrı listelerdir', () => {
    const store = memoryStorage();
    addKnownTradeIds(scope, ['1'], store);
    addKnownTradeIds({ ...scope, wallet: OTHER_WALLET }, ['2'], store);
    addKnownTradeIds({ ...scope, escrow: OTHER_ESCROW }, ['3'], store);
    addKnownTradeIds({ ...scope, chainId: 8453 }, ['4'], store);
    expect(readKnownTradeIds(scope, store)).toEqual(['1']);
    expect(readKnownTradeIds({ ...scope, wallet: OTHER_WALLET }, store)).toEqual(['2']);
    expect(readKnownTradeIds({ ...scope, escrow: OTHER_ESCROW }, store)).toEqual(['3']);
    expect(readKnownTradeIds({ ...scope, chainId: 8453 }, store)).toEqual(['4']);
    // Büyük/küçük harf aynı cüzdandır.
    expect(readKnownTradeIds({ ...scope, wallet: WALLET.toUpperCase().replace('0X', '0x') }, store)).toEqual(['1']);
    // Saklanan değer yalnız sayı dizgeleridir (PII yok).
    for (const value of store.map.values()) expect(JSON.parse(value).every((v) => /^[0-9]+$/.test(v))).toBe(true);
  });

  it('eksik/geçersiz kapsamda anahtar üretmez ve yazmaz', () => {
    const store = memoryStorage();
    expect(knownTradesStorageKey({ wallet: '0xabc', escrow: ESCROW, chainId: 1 })).toBeNull();
    expect(knownTradesStorageKey({ wallet: WALLET, escrow: undefined, chainId: 1 })).toBeNull();
    expect(knownTradesStorageKey({ wallet: WALLET, escrow: ESCROW, chainId: null })).toBeNull();
    expect(addKnownTradeIds({ wallet: WALLET, escrow: undefined, chainId: 1 }, ['1'], store)).toEqual([]);
    expect(store.map.size).toBe(0);
  });

  it('depolama yoksa ya da hata verirse sessizce çalışmaz', () => {
    expect(addKnownTradeIds(scope, ['1'], null)).toEqual([]);
    expect(readKnownTradeIds(scope, null)).toEqual([]);
    const throwing = { getItem: () => { throw new Error('denied'); }, setItem: () => { throw new Error('quota'); } };
    expect(() => addKnownTradeIds(scope, ['1'], throwing)).not.toThrow();
    expect(readKnownTradeIds(scope, throwing)).toEqual([]);
    const corrupt = memoryStorage();
    corrupt.setItem(knownTradesStorageKey(scope), '{not json');
    expect(readKnownTradeIds(scope, corrupt)).toEqual([]);
    const writeFails = { ...memoryStorage(), setItem: () => { throw new Error('quota'); } };
    expect(addKnownTradeIds(scope, ['1'], writeFails)).toEqual([]);
  });

  it('kapanan işlemleri listeden çıkarır', () => {
    const store = memoryStorage();
    addKnownTradeIds(scope, ['1', '2', '3'], store);
    expect(removeKnownTradeIds(scope, ['2'], store)).toEqual(['1', '3']);
    expect(readKnownTradeIds(scope, store)).toEqual(['1', '3']);
  });
});
