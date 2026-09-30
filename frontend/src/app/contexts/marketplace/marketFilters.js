import { useCallback, useMemo, useState } from 'react';

// [TR] Pazar filtrelerinin tek kaynağı: varsayılanlar, state hook'u, sunucu sorgusu ve istemci eşleştiricisi.
//      Sunucu asıl filtrelemeyi yapar; istemci eşleştiricisi aynı kuralı debounce arasında, UI Lab verisinde
//      ve yalnız istemcide bilinen "kendi emirlerimi gizle" seçeneğinde uygular.
// [EN] Single source for market filters: defaults, state hook, server query and client matcher.
//      The server does the real filtering; the client matcher mirrors it between debounces, for UI Lab data
//      and for the client-only "hide my orders" option.

export const MARKET_FIAT_OPTIONS = ['TRY', 'USD', 'EUR'];

export const MARKET_FILTER_DEFAULTS = Object.freeze({
  side: 'ALL', // ALL | BUY | SELL (viewer's action)
  token: 'ALL', // ALL | USDT | USDC
  amount: '', // token units the viewer wants to trade
  fiat: 'ALL', // ALL | TRY | USD | EUR
  tier: 'ALL', // ALL | NO_BOND | ELIGIBLE
  sort: 'AUTO', // AUTO (best rate when a side is chosen) | AMOUNT | NEWEST
  hideOwn: false,
});

// [TR] Yalnız sonuç kümesini daraltan filtreler sayılır; sıralama ve taraf sekmesi sayılmaz.
// [EN] Only result-narrowing filters count; sort and the side tab do not.
export const countActiveMarketFilters = (filters = MARKET_FILTER_DEFAULTS) => {
  let count = 0;
  if (filters.token !== 'ALL') count += 1;
  if (parseAmount(filters.amount) !== null) count += 1;
  if (filters.fiat !== 'ALL') count += 1;
  if (filters.tier !== 'ALL') count += 1;
  if (filters.hideOwn) count += 1;
  return count;
};

export function useMarketFilters() {
  const [marketFilters, setMarketFilters] = useState(MARKET_FILTER_DEFAULTS);
  const setMarketFilter = useCallback((key, value) => {
    setMarketFilters((prev) => (prev[key] === value ? prev : { ...prev, [key]: value }));
  }, []);
  // [TR] Taraf sekmesi sıfırlanmaz: kullanıcı "Al" ekranındayken filtreleri temizler.
  // [EN] The side tab survives a reset: the user clears filters while staying on "Buy".
  const resetMarketFilters = useCallback(() => {
    setMarketFilters((prev) => ({ ...MARKET_FILTER_DEFAULTS, side: prev.side }));
  }, []);
  return useMemo(() => ({ marketFilters, setMarketFilter, resetMarketFilters }), [marketFilters, setMarketFilter, resetMarketFilters]);
}

function parseAmount(value) {
  if (value === '' || value === null || value === undefined) return null;
  const n = Number(value);
  return Number.isFinite(n) && n > 0 ? n : null;
}

const SIDE_TO_ORDER_SIDE = { BUY: 'SELL_CRYPTO', SELL: 'BUY_CRYPTO' };

// [TR] Sunucu sorgusu. ELIGIBLE yalnız kullanıcı tier'ı biliniyorsa max_tier gönderir.
// [EN] Server query. ELIGIBLE sends max_tier only when the viewer's tier is known.
export const buildMarketOrdersQuery = ({ filters = MARKET_FILTER_DEFAULTS, tokenAddresses = {}, userTier = null } = {}) => {
  const f = { ...MARKET_FILTER_DEFAULTS, ...filters };
  const params = new URLSearchParams({ status: 'ACTIVE', limit: '50' });
  const side = SIDE_TO_ORDER_SIDE[f.side] || null;
  if (side) params.set('side', side);
  const tokenAddress = f.token !== 'ALL' ? tokenAddresses?.[f.token] : null;
  if (tokenAddress) params.set('token_address', tokenAddress);
  const amount = parseAmount(f.amount);
  if (amount !== null) params.set('min_amount', String(amount));
  if (MARKET_FIAT_OPTIONS.includes(f.fiat)) params.set('fiat', f.fiat);
  if (f.tier === 'NO_BOND') params.set('tier', '0');
  else if (f.tier === 'ELIGIBLE' && Number.isInteger(userTier) && userTier >= 0 && userTier <= 4) params.set('max_tier', String(userTier));
  if (f.sort === 'NEWEST') params.set('sort', 'newest');
  else if (f.sort === 'AUTO' && side) params.set('sort', 'best_rate');
  return `orders?${params.toString()}`;
};

// [TR] Sunucudaki kuralın aynısı: tutar tek fill'e sığmalı (kalan ≥ tutar ve min fill ≤ tutar ya da tam kalan).
// [EN] Mirrors the server rule: the amount must fit one fill (remaining ≥ amount and min fill ≤ amount, or all of it).
export const matchesMarketFilters = (order, filters = MARKET_FILTER_DEFAULTS, { viewerAddress = null, userTier = null } = {}) => {
  const f = { ...MARKET_FILTER_DEFAULTS, ...filters };
  const side = SIDE_TO_ORDER_SIDE[f.side];
  if (side && order.side !== side) return false;
  if (f.token !== 'ALL' && order.crypto !== f.token) return false;
  if (f.fiat !== 'ALL' && order.fiat !== f.fiat) return false;
  if (f.tier === 'NO_BOND' && Number(order.tier) !== 0) return false;
  if (f.tier === 'ELIGIBLE' && Number.isInteger(userTier) && Number(order.tier) > userTier) return false;
  const amount = parseAmount(f.amount);
  if (amount !== null) {
    const remaining = Number(order.remainingAmount || 0);
    const minFill = Number(order.minFillAmount || 0);
    if (remaining < amount || (minFill > amount && remaining !== amount)) return false;
  }
  if (f.hideOwn && viewerAddress && order.makerFull?.toLowerCase() === viewerAddress.toLowerCase()) return false;
  return true;
};
