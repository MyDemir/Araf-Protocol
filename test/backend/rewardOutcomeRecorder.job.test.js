const mockFind = jest.fn();
jest.mock('../../backend/scripts/models/Trade', () => ({ find: (...args) => mockFind(...args) }));
jest.mock('../../backend/scripts/utils/logger', () => ({ info: jest.fn(), warn: jest.fn(), error: jest.fn() }));

const { runRewardOutcomeRecorder, REWARDABLE_RESOLUTION_TYPES } = require('../../backend/scripts/jobs/rewardOutcomeRecorder');

function chain(result) {
  const q = {
    select: jest.fn(() => q),
    sort: jest.fn(() => q),
    limit: jest.fn(() => q),
    lean: jest.fn().mockResolvedValue(result),
  };
  return q;
}

function mockContract(recorded = {}) {
  return {
    epochDuration: jest.fn().mockResolvedValue(7n * 24n * 3600n),
    claimDelay: jest.fn().mockResolvedValue(24n * 3600n),
    recordedTrade: jest.fn(async (id) => Boolean(recorded[String(id)])),
    recordTradeOutcomes: jest.fn().mockResolvedValue({ hash: '0xtx', wait: jest.fn().mockResolvedValue({ blockNumber: 7 }) }),
  };
}

describe('rewardOutcomeRecorder job', () => {
  beforeEach(() => mockFind.mockReset());

  it('is a no-op when the rewards contract is not configured', async () => {
    const res = await runRewardOutcomeRecorder({ contract: null });
    expect(res).toEqual(expect.objectContaining({ success: true, recorded: 0 }));
    expect(mockFind).not.toHaveBeenCalled();
  });

  it('queries only rewardable, tier>=1 trades inside the recording window', async () => {
    mockFind.mockReturnValue(chain([]));
    await runRewardOutcomeRecorder({ contract: mockContract() });
    const [filter] = mockFind.mock.calls[0];
    expect(filter.resolution_type.$in).toEqual(REWARDABLE_RESOLUTION_TYPES);
    expect(filter.tier).toEqual({ $gte: 1 });
    const windowMs = Date.now() - filter['timers.resolved_at'].$gte.getTime();
    expect(windowMs).toBeGreaterThanOrEqual(8 * 24 * 3600 * 1000 - 5000);
    expect(windowMs).toBeLessThanOrEqual(8 * 24 * 3600 * 1000 + 5000);
  });

  it('records only trades the contract has not recorded yet, in one batch', async () => {
    mockFind.mockReturnValue(chain([{ onchain_escrow_id: '3' }, { onchain_escrow_id: '4' }, { onchain_escrow_id: 'bad' }]));
    const contract = mockContract({ 3: true });
    const res = await runRewardOutcomeRecorder({ contract });
    expect(contract.recordTradeOutcomes).toHaveBeenCalledWith([4n]);
    expect(res).toEqual(expect.objectContaining({ success: true, recorded: 1 }));
  });
});
