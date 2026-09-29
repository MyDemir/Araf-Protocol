import { makeEscrow, UI_LAB_VIEWER } from './operationsFixtures';

// [TR] Profil Merkezi senaryoları: kontrat getReputation çıktısı + backend geçmiş/emir kayıtları.
//      Zamanlar senaryo seçildiği anda "şimdi"ye göre üretilir ki sayaçlar anlamlı olsun.
// [EN] Profile Center scenarios built from getReputation output and backend history/order rows.

const DAY = 86400;
const now = () => Math.floor(Date.now() / 1000);

const reputation = ({
  tier = 0, successful = 0, failed = 0, riskPoints = 0, bannedUntil = 0, consecutiveBans = 0, firstSuccessAgoDays = null, counters = {},
} = {}) => ({
  effectiveTier: tier,
  successful,
  failed,
  bannedUntil,
  consecutiveBans,
  firstSuccessfulTradeAt: firstSuccessAgoDays == null ? 0 : now() - firstSuccessAgoDays * DAY,
  authorityCounters: {
    manualReleaseCount: 0, autoReleaseCount: 0, mutualCancelCount: 0, disputedResolvedCount: 0, burnCount: 0,
    disputeWinCount: 0, disputeLossCount: 0, partialSettlementCount: 0, riskPoints, lastPositiveEventAt: 0, lastNegativeEventAt: 0,
    ...counters,
  },
});

// [TR] Backend ReputationTierThresholdsUpdated aynası (kontrat constructor varsayılanlarıyla aynı değerler).
export const LAB_REPUTATION_POLICY = {
  source: 'onchain_event',
  cleanPeriodSec: 90 * DAY,
  baseBanDurationSec: 30 * DAY,
  banRiskPointsThreshold: 100,
  tierMinSuccessfulTrades: [0, 15, 50, 100, 200],
  tierMaxRiskPoints: [100, 80, 50, 30, 15],
};

const OK_SYBIL = { aged: true, funded: true, cooldownOk: true, cooldownRemaining: 0 };

const order = (id, side, status, total, remaining, extra = {}) => ({
  id: `order-${id}`,
  onchainId: id,
  side,
  sideLabel: side === 'SELL_CRYPTO' ? 'Satış emri' : 'Alış emri',
  status,
  statusLabel: { OPEN: 'Açık', PARTIALLY_FILLED: 'Kısmen doldu', FILLED: 'Doldu', CANCELED: 'İptal' }[status] || status,
  crypto: 'USDT',
  fiat: 'TRY',
  rate: 41.25,
  hasPrice: true,
  totalAmount: total,
  remainingAmount: remaining,
  minFillAmount: 50,
  tier: 1,
  ...extra,
});

const hist = (id, { maker = true, status = 'RESOLVED', resolution = 'MANUAL_RELEASE', amount = 250, fiat = 10312.5, daysAgo = 2 } = {}) => ({
  _id: `hist-${id}`,
  onchain_escrow_id: String(id),
  status,
  resolution_type: resolution,
  maker_address: maker ? UI_LAB_VIEWER.toLowerCase() : '0x' + '9'.repeat(40),
  taker_address: maker ? '0x' + '9'.repeat(40) : UI_LAB_VIEWER.toLowerCase(),
  financials: { crypto_amount: String(amount * 1e6), crypto_asset: 'USDT', fiat_amount: fiat, fiat_currency: 'TRY' },
  timers: { resolved_at: new Date((now() - daysAgo * DAY) * 1000).toISOString() },
});

const historyRows = [
  hist(4101, { maker: true, resolution: 'MANUAL_RELEASE', daysAgo: 1 }),
  hist(4098, { maker: false, resolution: 'AUTO_RELEASE', amount: 120, fiat: 4950, daysAgo: 3 }),
  hist(4090, { maker: true, resolution: 'PARTIAL_SETTLEMENT', amount: 500, fiat: 20625, daysAgo: 6 }),
  hist(4077, { maker: false, status: 'CANCELED', resolution: 'MUTUAL_CANCEL', amount: 80, fiat: 3300, daysAgo: 9 }),
  hist(4060, { maker: true, status: 'CANCELED', resolution: 'PAYMENT_WINDOW_EXPIRED', amount: 200, fiat: 8250, daysAgo: 12 }),
  hist(4012, { maker: false, status: 'BURNED', resolution: 'BURNED', amount: 300, fiat: 12375, daysAgo: 30 }),
];

const trustEscrow = makeEscrow('3101', 'LOCKED', 'maker', {
  rawTrade: {
    offchainHealthScoreInput: {
      readOnly: true, nonBlocking: true, canBlockProtocolActions: false,
      explainableReasons: ['maker_frequent_recent_bank_changes_at_lock'],
    },
  },
});

const scenario = (id, label, tab, data) => ({
  id,
  label,
  category: 'profile',
  tab,
  address: UI_LAB_VIEWER,
  reputationPolicy: LAB_REPUTATION_POLICY,
  sybilStatus: OK_SYBIL,
  walletAgeRemainingDays: null,
  isBanned: false,
  myOrders: [],
  tradeHistory: [],
  activeEscrows: [],
  ...data,
  // Reputation is rebuilt on selection so day counters are relative to "now".
  build: data.build,
});

export const profileScenarios = [
  scenario('new-wallet', 'Account · new wallet (age check pending)', 'account', {
    build: () => reputation(),
    sybilStatus: { aged: false, funded: true, cooldownOk: true, cooldownRemaining: 0 },
    walletAgeRemainingDays: 4,
  }),
  scenario('account-active', 'Account · T1 trader with orders and trades', 'account', {
    build: () => reputation({ tier: 1, successful: 22, failed: 1, firstSuccessAgoDays: 40, counters: { manualReleaseCount: 18, autoReleaseCount: 3, partialSettlementCount: 1, disputeWinCount: 1 } }),
    myOrders: [order('88', 'SELL_CRYPTO', 'PARTIALLY_FILLED', 1000, 640), order('91', 'BUY_CRYPTO', 'OPEN', 300, 300)],
    activeEscrows: [makeEscrow('3001', 'PAID', 'maker'), makeEscrow('3002', 'LOCKED', 'taker')],
    sybilStatus: { aged: true, funded: true, cooldownOk: false, cooldownRemaining: 1800 },
  }),
  scenario('rep-discount', 'Reputation · T1, zero risk (−1% bond)', 'reputation', {
    build: () => reputation({ tier: 1, successful: 22, failed: 0, firstSuccessAgoDays: 40, counters: { manualReleaseCount: 19, autoReleaseCount: 2, partialSettlementCount: 1 } }),
    activeEscrows: [trustEscrow],
  }),
  scenario('rep-active-period', 'Reputation · counts qualify, 15-day period pending', 'reputation', {
    build: () => reputation({ tier: 0, successful: 16, firstSuccessAgoDays: 5, counters: { manualReleaseCount: 16 } }),
  }),
  scenario('rep-risk-penalty', 'Reputation · T2 with risk points (+3% bond)', 'reputation', {
    build: () => reputation({ tier: 2, successful: 64, failed: 3, riskPoints: 40, firstSuccessAgoDays: 120, counters: { manualReleaseCount: 52, autoReleaseCount: 8, mutualCancelCount: 2, disputedResolvedCount: 2, disputeLossCount: 1, riskPoints: 40 } }),
  }),
  scenario('rep-banned', 'Reputation · active ban', 'reputation', {
    build: () => reputation({ tier: 0, successful: 9, failed: 2, riskPoints: 110, bannedUntil: now() + 12 * DAY, consecutiveBans: 1, firstSuccessAgoDays: 60, counters: { burnCount: 1, disputeLossCount: 1, riskPoints: 110 } }),
    isBanned: true,
  }),
  scenario('rep-clean-slate', 'Reputation · clean slate available, tier capped', 'reputation', {
    build: () => reputation({ tier: 1, successful: 58, failed: 1, riskPoints: 20, bannedUntil: now() - 100 * DAY, consecutiveBans: 1, firstSuccessAgoDays: 300, counters: { manualReleaseCount: 50, burnCount: 1, riskPoints: 20 } }),
  }),
  scenario('rep-top-tier', 'Reputation · Tier 4', 'reputation', {
    build: () => reputation({ tier: 4, successful: 240, failed: 0, firstSuccessAgoDays: 400, counters: { manualReleaseCount: 220, autoReleaseCount: 12, partialSettlementCount: 8 } }),
  }),
  scenario('orders', 'My orders · open / partial / filled', 'orders', {
    build: () => reputation({ tier: 1, successful: 22, firstSuccessAgoDays: 40 }),
    myOrders: [order('88', 'SELL_CRYPTO', 'PARTIALLY_FILLED', 1000, 640), order('91', 'BUY_CRYPTO', 'OPEN', 300, 300), order('72', 'SELL_CRYPTO', 'FILLED', 500, 0)],
  }),
  scenario('history', 'History · all terminal outcomes', 'history', {
    build: () => reputation({ tier: 1, successful: 22, firstSuccessAgoDays: 40 }),
    tradeHistory: historyRows,
    tradeHistoryTotal: 14,
  }),
  scenario('history-empty', 'History · empty', 'history', {
    build: () => reputation(),
  }),
  scenario('payment', 'Payment profile · SEPA', 'payment', {
    build: () => reputation({ tier: 1, successful: 22, firstSuccessAgoDays: 40 }),
    payoutProfileDraft: { rail: 'SEPA_IBAN', country: 'DE', contact: { channel: 'telegram', value: '@araf_user' }, fields: { account_holder_name: 'Ada Yılmaz', iban: 'DE89 3704 0044 0532 0130 00', bic: 'COBADEFFXXX', bank_name: 'Commerzbank', routing_number: null, account_number: null, account_type: null } },
  }),
  scenario('security', 'Security · session', 'security', {
    build: () => reputation({ tier: 1, successful: 22, firstSuccessAgoDays: 40 }),
  }),
];

// [TR] Ödüller sekmesi için sahte ArafRewards okuyucusu: kontrat varsayılanları (30g dönem, 24s gecikme,
//      7g talep penceresi). Pencere dönemden kısa olduğu için aynı anda en fazla bir dönem talep edilebilir.
//      `hoursIntoEpoch` "şimdi"yi mevcut dönem içinde sabitler: 72 → önceki dönem talep edilebilir,
//      12 → önceki dönem kesinleşiyor (talep henüz açılmadı).
const LAB_REWARD_TOKENS = { USDT: '0x' + 'a'.repeat(40), USDC: '0x' + 'b'.repeat(40) };
const u6 = (n) => BigInt(Math.round(n * 1e6));

export const buildLabRewards = ({ hoursIntoEpoch = 72 } = {}) => {
  const dur = 30 * DAY;
  const cur = Math.floor(Date.now() / 1000 / dur);
  const now = cur * dur + hoursIntoEpoch * 3600;
  // epochOffset -> { u, t, pools: {USDT, USDC}, finalized: {..}, claimed: {..} }
  const plan = {
    0: { u: 300n, t: 10000n, pools: { USDT: 4800, USDC: 1600 } },
    1: { u: 500n, t: 8000n, pools: { USDT: 3600, USDC: 800 }, finalized: { USDT: true } },
    2: { u: 250n, t: 5000n, pools: { USDT: 4000, USDC: 900 }, finalized: { USDT: true, USDC: true }, claimed: { USDT: true } },
    3: { u: 0n, t: 6000n, pools: { USDT: 3200, USDC: 0 }, finalized: { USDT: true } },
    4: { u: 600n, t: 12000n, pools: { USDT: 4400, USDC: 1000 }, finalized: { USDT: true, USDC: true }, claimed: { USDT: true, USDC: true } },
    5: { u: 400n, t: 10000n, pools: { USDT: 3000, USDC: 0 }, finalized: { USDT: true } },
  };
  const at = (epoch) => plan[cur - Number(epoch)] || { u: 0n, t: 0n, pools: {} };
  const sym = (addr) => Object.keys(LAB_REWARD_TOKENS).find((k) => LAB_REWARD_TOKENS[k] === addr);
  const reader = {
    isConfigured: true,
    isSupportedChain: true,
    tokens: LAB_REWARD_TOKENS,
    currentEpoch: async () => BigInt(cur),
    epochDuration: async () => BigInt(dur),
    claimDelay: async () => BigInt(DAY),
    claimWindow: async () => BigInt(7 * DAY),
    totalWeight: async (e) => at(e).t,
    userWeight: async (e) => at(e).u,
    epochRewardPool: async (e, token) => u6(at(e).pools[sym(token)] || 0),
    epochTokenFinalized: async (e, token) => Boolean(at(e).finalized?.[sym(token)]),
    hasClaimed: async (e, _user, token) => Boolean(at(e).claimed?.[sym(token)]),
    finalizeEpochToken: async () => ({ status: 'success' }),
    claim: async () => ({ status: 'success' }),
  };
  const claimRow = (offset, symbol) => {
    const p = plan[offset];
    return {
      tx_hash: `0x${String(offset).repeat(64)}`.slice(0, 66), log_index: offset, epoch: String(cur - offset),
      token: LAB_REWARD_TOKENS[symbol], amount: ((u6(p.pools[symbol]) * p.u) / p.t).toString(),
    };
  };
  const history = [claimRow(2, 'USDT'), claimRow(4, 'USDT'), claimRow(4, 'USDC')];
  return { reader, now, fetchClaimHistory: async () => history };
};

profileScenarios.push(scenario('rewards', 'Rewards · claim window open (day 3 of epoch)', 'rewards', {
  build: () => reputation({ tier: 2, successful: 64, firstSuccessAgoDays: 120 }),
  labRewards: { hoursIntoEpoch: 72 },
}));
profileScenarios.push(scenario('rewards-finalizing', 'Rewards · previous epoch finalizing (hour 12)', 'rewards', {
  build: () => reputation({ tier: 2, successful: 64, firstSuccessAgoDays: 120 }),
  labRewards: { hoursIntoEpoch: 12 },
}));
