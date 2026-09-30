const now = '2026-05-08T07:00:00.000Z';

export const healthySummary = {
  readiness: { ok: true, checks: { database: true, worker: true, config: true }, worker: { state: 'READY', lagBlocks: 0 }, missingConfig: [] },
  stats: { active_child_trades: 4, open_sell_orders: 8, open_buy_orders: 3, completed_trades: 42, burned_bonds_usdt: 12.5, executed_volume_usdt: 18450, partially_filled_orders: 2, filled_orders: 17, canceled_orders: 5 },
  tradeCounts: { incompleteSnapshot: 0, challenged: 2, locked: 3, paid: 1 },
  dlq: { depth: 0, oldest: null },
  settlementAnalytics: { activeSettlementProposals: 2, expiredSettlementProposals: 1, finalizedSettlementProposals24h: 3, avgSettlementSplitMakerBps: 6100, settlementFinalizationRate: 0.72 },
  resolutionAnalytics: { manualReleaseCount: 28, autoReleaseCount: 4, partialSettlementCount: 3, mutualCancelCount: 5, paymentWindowExpiredCount: 2, disputedResolutionCount: 1, burnedCount: 1, unknownResolvedCount: 0 },
  scheduler: { reputationDecayLastRunAt: now, statsSnapshotLastRunAt: now, sensitiveCleanupLastRunAt: now, userBankRiskCleanupLastRunAt: null },
};

export const degradedSummary = {
  readiness: { ok: false, checks: { database: true, worker: false, config: false }, worker: { state: 'NOT_READY', lagBlocks: 18 }, missingConfig: ['ADMIN_WALLETS', 'INDEXER_RPC_URL'] },
  stats: { active_child_trades: 9, open_sell_orders: 2, open_buy_orders: 1, completed_trades: 38, burned_bonds_usdt: 75 },
  tradeCounts: { incompleteSnapshot: 3, challenged: 5, locked: 2, paid: 2 },
  dlq: { depth: 4, oldest: now },
  settlementAnalytics: { activeSettlementProposals: 5, expiredSettlementProposals: 2, finalizedSettlementProposals24h: 0, avgSettlementSplitMakerBps: 5500, settlementFinalizationRate: 0.31 },
  resolutionAnalytics: { manualReleaseCount: 20, autoReleaseCount: 6, partialSettlementCount: 1, mutualCancelCount: 4, paymentWindowExpiredCount: 3, disputedResolutionCount: 2, burnedCount: 2, unknownResolvedCount: 1 },
  scheduler: { reputationDecayLastRunAt: null, statsSnapshotLastRunAt: now, sensitiveCleanupLastRunAt: null, userBankRiskCleanupLastRunAt: null },
  degraded: { isDegraded: true, errors: [{ source: 'dlq_depth' }, { source: 'latest_stat' }] },
};

const USDT = '0x' + 'a'.repeat(40);
const USDC = '0x' + 'b'.repeat(40);
export const labTokenSymbols = { [USDT]: 'USDT', [USDC]: 'USDC' };

export const revenueRows = [
  { tx_hash: '0x' + '1'.repeat(64), log_index: 0, block_number: 1200, token: USDT, amount: '125000', reward_share: '37500', treasury_share: '87500', kind: 0, trade_id: '4001', created_at_onchain: now },
  { tx_hash: '0x' + '2'.repeat(64), log_index: 1, block_number: 1188, token: USDC, amount: '2500000', reward_share: '750000', treasury_share: '1750000', kind: 4, trade_id: '3990', created_at_onchain: now },
  { tx_hash: '0x' + '3'.repeat(64), log_index: 0, block_number: 1170, token: USDT, amount: '60000', reward_share: '18000', treasury_share: '42000', kind: 1, trade_id: '3981', created_at_onchain: now },
];
export const rewardsHealth = { mirror_only: true, counts: { epochs: 6, funding: 14, claims: 31 } };

// [TR] Lab'daki "Kontrat" sekmesi için zincir okuması taklidi. [EN] Mocked chain read for the lab On-chain tab.
export const protocolConfigFixture = (ownerKind = 'eoa') => ({
  readAt: now,
  escrow: {
    address: '0x' + 'e'.repeat(40), owner: '0x' + 'f'.repeat(40), ownerKind, paused: false, treasury: '0x' + 'c'.repeat(40),
    takerFeeBps: 10, makerFeeBps: 10, tier0CooldownSec: 14400, tier1CooldownSec: 3600, tradeCounter: 4012n, orderCounter: 870n,
    tokenConfigs: [
      { symbol: 'USDT', address: USDT, config: { supported: true, allowSellOrders: true, allowBuyOrders: true, decimals: 6, tierMax: [150000000n, 1500000000n, 7500000000n, 30000000000n] } },
      { symbol: 'USDC', address: USDC, config: { supported: true, allowSellOrders: true, allowBuyOrders: false, decimals: 6, tierMax: [150000000n, 1500000000n, 7500000000n, 30000000000n] } },
    ],
  },
  vault: {
    address: '0x' + 'd'.repeat(40), owner: '0x' + 'f'.repeat(40), ownerKind, paused: false, rewardBps: 3000, finalTreasury: '0x' + '9'.repeat(40), rewards: '0x' + '8'.repeat(40),
    reserves: [{ symbol: 'USDT', treasuryReserve: 129500000n, rewardReserve: 55500000n }, { symbol: 'USDC', treasuryReserve: 1750000n, rewardReserve: 750000n }],
  },
  rewards: { address: '0x' + '8'.repeat(40), owner: '0x' + '7'.repeat(40), ownerKind: 'contract', paused: false, currentEpoch: 6n, epochDurationSec: 2592000, claimDelaySec: 86400, claimWindowSec: 604800 },
});

export const feedbackRows = [
  { _id: 'fb-1', id: 'fb-1', category: 'ui/ux', rating: 5, comment: 'Preview makes review easier.', wallet_address: '0xFeedback0000000000000000000000000000000001', created_at: now },
  { _id: 'fb-2', id: 'fb-2', category: 'bug', rating: 3, comment: 'Timer copy needs review.', wallet_address: '0xFeedback0000000000000000000000000000000002', created_at: now },
];

export const adminTrades = [
  {
    _id: 'trade-4001',
    id: 'trade-4001',
    onchain_escrow_id: '4001',
    status: 'CHALLENGED',
    maker_address: '0xMaker000000000000000000000000000000000001',
    taker_address: '0xTaker000000000000000000000000000000000001',
    token_symbol: 'USDT',
    crypto_amount: '500000000',
    fiat_currency: 'TRY',
    created_at: now,
    updated_at: now,
    tier: 1,
    origin: 'ORDER_CHILD',
    risk_flags: ['settlement_active'],
    snapshot_complete: true,
    offchain_health_score_input: {
      snapshot: { incompleteReason: '' },
      maker: { reputationBanMirrorContext: { reputation_authority_counters: { burn_count: 0, auto_release_count: 1, mutual_cancel_count: 0, disputed_resolved_count: 2, partial_settlement_count: 1 } } },
    },
  },
];

export const settlementProposals = [
  {
    proposal_id: 'sp-1',
    trade_id: 'trade-4001',
    onchain_escrow_id: '4001',
    status: 'CHALLENGED',
    state: 'PROPOSED',
    maker_address: '0xMaker000000000000000000000000000000000001',
    taker_address: '0xTaker000000000000000000000000000000000001',
    proposed_by: '0xTaker000000000000000000000000000000000001',
    maker_share_bps: 6000,
    taker_share_bps: 4000,
    proposed_at: now,
    expires_at: '2026-05-09T07:00:00.000Z',
    finalized_at: null,
    is_expired: false,
    requires_counterparty_action: true,
    proposal_age_seconds: 300,
    tx_hash: '0xabc123',
  },
];

export const adminScenarios = [
  { id: 'overview-healthy', label: 'Overview healthy', category: 'admin', responseMode: 'healthy', initialTab: 'overview' },
  { id: 'overview-degraded', label: 'Overview degraded', category: 'admin', responseMode: 'degraded', initialTab: 'overview' },
  { id: 'sync-missing-config', label: 'Sync with missing config', category: 'admin', responseMode: 'degraded', initialTab: 'sync' },
  { id: 'feedback-list', label: 'Feedback list', category: 'admin', responseMode: 'healthy', initialTab: 'feedback' },
  { id: 'trades-challenged', label: 'Trades filtered by CHALLENGED', category: 'admin', responseMode: 'healthy', initialTab: 'trades' },
  { id: 'settlement-proposals', label: 'Settlement proposals', category: 'admin', responseMode: 'healthy', initialTab: 'settlement' },
  { id: 'unauthorized-403', label: 'Unauthorized / 403', category: 'admin', responseMode: 'forbidden', initialTab: 'overview' },
  { id: 'session-expired-401', label: 'Session expired / 401', category: 'admin', responseMode: 'expired', initialTab: 'overview' },
  { id: 'empty-admin-data', label: 'Empty admin data', category: 'admin', responseMode: 'empty', initialTab: 'overview' },
  { id: 'revenue-rewards', label: 'Revenue & rewards', category: 'admin', responseMode: 'healthy', initialTab: 'revenue' },
  { id: 'onchain-eoa-owner', label: 'On-chain config (EOA owner warning)', category: 'admin', responseMode: 'healthy', initialTab: 'chain', chainMode: 'eoa' },
  { id: 'onchain-multisig-owner', label: 'On-chain config (multisig owner)', category: 'admin', responseMode: 'healthy', initialTab: 'chain', chainMode: 'contract' },
  { id: 'onchain-unreachable', label: 'On-chain config (RPC unreachable)', category: 'admin', responseMode: 'healthy', initialTab: 'chain', chainMode: 'error' },
];
