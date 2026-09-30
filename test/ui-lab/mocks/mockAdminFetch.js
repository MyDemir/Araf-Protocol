import { adminTrades, degradedSummary, feedbackRows, healthySummary, settlementProposals, revenueRows, rewardsHealth, protocolConfigFixture } from '../fixtures/adminFixtures';

const response = (status, body) => ({
  status,
  ok: status >= 200 && status < 300,
  json: async () => body,
});

export const createMockAdminFetch = (scenario = {}) => async (url) => {
  const mode = scenario.responseMode || 'healthy';
  if (mode === 'forbidden') return response(403, { error: 'forbidden' });
  if (mode === 'expired') return response(401, { error: 'expired' });

  const href = String(url || '');
  const empty = mode === 'empty';
  if (href.includes('admin/summary')) return response(200, empty ? { readiness: { ok: true, checks: {}, worker: {}, missingConfig: [] }, stats: {}, tradeCounts: {}, dlq: {}, settlementAnalytics: {} } : (mode === 'degraded' ? degradedSummary : healthySummary));
  if (href.includes('admin/feedback')) return response(200, { feedback: empty ? [] : feedbackRows, total: empty ? 0 : feedbackRows.length });
  if (href.includes('admin/trades')) return response(200, { trades: empty ? [] : adminTrades, total: empty ? 0 : adminTrades.length, paginationScope: { isWindowed: false } });
  if (href.includes('admin/revenue')) return response(200, { rows: empty ? [] : revenueRows });
  if (href.includes('admin/rewards/health')) return response(200, empty ? { mirror_only: true, counts: { epochs: 0, funding: 0, claims: 0 } } : rewardsHealth);
  if (href.includes('admin/settlement-proposals')) return response(200, { proposals: empty ? [] : settlementProposals, total: empty ? 0 : settlementProposals.length });
  return response(404, { error: 'unknown mock admin endpoint' });
};

// [TR] Lab: "Kontrat" sekmesi için zincir okuması taklidi (RPC hatası dahil).
export const createMockProtocolConfigReader = (scenario = {}) => async () => {
  if (scenario?.chainMode === 'error') throw new Error('rpc_unreachable');
  return protocolConfigFixture(scenario?.chainMode === 'contract' ? 'contract' : 'eoa');
};
