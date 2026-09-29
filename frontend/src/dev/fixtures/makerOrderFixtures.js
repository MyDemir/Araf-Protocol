// [TR] Emir oluşturma senaryoları: kontratın token politikası, tier limitleri ve itibara bağlı teminat kuralları.
// [EN] Order creation scenarios: token policy, tier caps and reputation-adjusted bond rules.
export const LAB_TOKEN_ADDRESSES = { USDT: '0x' + 'a'.repeat(40), USDC: '0x' + 'b'.repeat(40) };

const caps = (t0, t1, t2, t3) => [t0, t1, t2, t3].map((v) => String(v * 1e6));
const tokenMap = ({ usdcBuy = true, usdtCaps = caps(150, 1500, 7500, 30000) } = {}) => ({
  [LAB_TOKEN_ADDRESSES.USDT]: { supported: true, allowSellOrders: true, allowBuyOrders: true, decimals: 6, tierMaxAmountsBaseUnit: usdtCaps },
  [LAB_TOKEN_ADDRESSES.USDC]: { supported: true, allowSellOrders: true, allowBuyOrders: usdcBuy, decimals: 6, tierMaxAmountsBaseUnit: caps(150, 1500, 7500, 30000) },
});
export const LAB_BOND_MAP = { 0: { maker: 0, taker: 0 }, 1: { maker: 8, taker: 10 }, 2: { maker: 6, taker: 8 }, 3: { maker: 5, taker: 5 }, 4: { maker: 2, taker: 2 } };
export const LAB_FEE_CONFIG = { takerFeeBps: 10, makerFeeBps: 10 };
const rep = (effectiveTier, successful, riskPoints) => ({ effectiveTier, successful, failed: 0, authorityCounters: { riskPoints } });

const scenario = (id, label, form, { reputation = rep(2, 12, 0), map = tokenMap() } = {}) => ({
  id, label, category: 'makerOrder', form, reputation, tokenMap: map,
});

export const makerOrderScenarios = [
  scenario('sell-clean-rep', 'SELL · T1 · clean reputation (−1% bond)', { makerSide: 'SELL_CRYPTO', makerToken: 'USDT', makerAmount: '500', makerRate: '41.25', makerMinLimit: '2000', makerFiat: 'TRY', makerTier: 1 }),
  scenario('buy-risk-penalty', 'BUY · T2 · risk points (+3% bond)', { makerSide: 'BUY_CRYPTO', makerToken: 'USDT', makerAmount: '2000', makerRate: '41.1', makerMinLimit: '', makerFiat: 'TRY', makerTier: 2 }, { reputation: rep(2, 30, 4) }),
  scenario('usdc-buy-closed', 'USDC buy direction closed on-chain', { makerSide: 'BUY_CRYPTO', makerToken: 'USDC', makerAmount: '300', makerRate: '0.93', makerMinLimit: '', makerFiat: 'EUR', makerTier: 1 }, { map: tokenMap({ usdcBuy: false }) }),
  scenario('over-tier-cap', 'Amount above tier cap', { makerSide: 'SELL_CRYPTO', makerToken: 'USDT', makerAmount: '500', makerRate: '41.25', makerMinLimit: '', makerFiat: 'TRY', makerTier: 0 }),
  scenario('new-user', 'New wallet (Tier 0 only, no discount)', { makerSide: 'SELL_CRYPTO', makerToken: 'USDT', makerAmount: '100', makerRate: '41.25', makerMinLimit: '', makerFiat: 'TRY', makerTier: 0 }, { reputation: rep(0, 0, 0) }),
  scenario('uncapped-tier', 'Tier 0 cap = 0 on-chain (no cap)', { makerSide: 'SELL_CRYPTO', makerToken: 'USDT', makerAmount: '5000', makerRate: '41.25', makerMinLimit: '', makerFiat: 'TRY', makerTier: 0 }, { map: tokenMap({ usdtCaps: ['0', ...caps(1500, 7500, 30000).slice(0, 3)] }) }),
];
