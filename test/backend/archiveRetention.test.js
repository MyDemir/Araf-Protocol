// [TR] archiveRetention: sahte native db ile; gerçek Mongo yok. / [EN] Fake native db, no real Mongo.
const mockCollections = {};
const mockNames = [];
jest.mock('mongoose', () => ({
  connection: {
    db: {
      listCollections: () => ({ toArray: async () => mockNames.map((name) => ({ name })) }),
      collection: (name) => {
        if (!mockCollections[name]) {
          mockCollections[name] = {
            updateMany: jest.fn().mockResolvedValue({ modifiedCount: 2 }),
            find: jest.fn(),
            findOne: jest.fn(),
            aggregate: jest.fn(),
            deleteMany: jest.fn(),
          };
        }
        return mockCollections[name];
      },
    },
  },
}));
jest.mock('../../backend/scripts/utils/logger', () => ({ info: jest.fn(), warn: jest.fn(), error: jest.fn() }));

const fs = require('fs');
const path = require('path');
const logger = require('../../backend/scripts/utils/logger');
const { runArchiveRetention } = require('../../backend/scripts/jobs/archiveRetention');

const GOOD = `archive_8453_0x${'ab'.repeat(20)}_trades`;
const NOW = new Date('2026-06-01T00:00:00Z');

beforeEach(() => {
  mockNames.length = 0;
  Object.keys(mockCollections).forEach((k) => delete mockCollections[k]);
  jest.clearAllMocks();
});

describe('archiveRetention', () => {
  it('cleans a matching collection without any status filter (non-terminal archived trades included)', async () => {
    mockNames.push(GOOD);
    const res = await runArchiveRetention(NOW);
    expect(res).toMatchObject({ success: true, collections: 1, modifiedCount: 4 });
    const calls = mockCollections[GOOD].updateMany.mock.calls;
    expect(calls).toHaveLength(2);
    for (const [query] of calls) expect(JSON.stringify(query)).not.toMatch(/status/);
    const [, snapUpdate] = calls[1];
    expect(snapUpdate.$set['payout_snapshot.maker.payout_details_enc']).toBeNull();
    expect(snapUpdate.$set['payout_snapshot.taker.reputation_context_at_lock.risk_points']).toBeNull();
    expect(snapUpdate.$unset).toEqual({ 'payout_snapshot.snapshot_delete_at': '' });
    expect(calls[0][1].$set).toEqual({
      'evidence.receipt_encrypted': null,
      'evidence.receipt_timestamp': null,
      'evidence.receipt_delete_at': null,
    });
  });

  it('applies min(delete_at, archived_at + 30d): delete_at OR archived_at <= now-30d', async () => {
    mockNames.push(GOOD);
    await runArchiveRetention(NOW);
    const cutoff = new Date(NOW.getTime() - 30 * 24 * 3600 * 1000);
    const [receiptQuery] = mockCollections[GOOD].updateMany.mock.calls[0];
    const [snapQuery] = mockCollections[GOOD].updateMany.mock.calls[1];
    expect(receiptQuery.$and[0].$or).toEqual([
      { 'evidence.receipt_delete_at': { $lte: NOW } },
      { '_archive.archived_at': { $lte: cutoff } },
    ]);
    expect(snapQuery.$and[0].$or).toEqual([
      { 'payout_snapshot.snapshot_delete_at': { $lte: NOW } },
      { '_archive.archived_at': { $lte: cutoff } },
    ]);
  });

  it('never touches names outside the strict pattern (live trades, loose archive names)', async () => {
    const bad = [
      'trades', 'archive_x_trades', `archive_8453_0x${'AB'.repeat(20)}_trades`,
      `archive_8453_0x${'ab'.repeat(19)}_trades`, `archive_8453_0x${'ab'.repeat(20)}_trades_old`,
      `xarchive_8453_0x${'ab'.repeat(20)}_trades`, `archive_8453_0x${'ab'.repeat(20)}_orders`,
    ];
    mockNames.push(...bad);
    const res = await runArchiveRetention(NOW);
    expect(res).toMatchObject({ success: true, collections: 0, modifiedCount: 0 });
    expect(Object.keys(mockCollections)).toHaveLength(0);
  });

  it('never reads documents or returns them; logs only collection name + count', async () => {
    mockNames.push(GOOD);
    const res = await runArchiveRetention(NOW);
    const col = mockCollections[GOOD];
    expect(col.find).not.toHaveBeenCalled();
    expect(col.findOne).not.toHaveBeenCalled();
    expect(col.aggregate).not.toHaveBeenCalled();
    expect(col.deleteMany).not.toHaveBeenCalled();
    expect(Object.keys(res).sort()).toEqual(['collections', 'modifiedCount', 'success']);
    expect(logger.info.mock.calls[0][0]).toBe(`[Job:ArchiveRetention] ${GOOD}: 4 güncelleme.`);
  });

  it('does not import the encryption module', () => {
    const src = fs.readFileSync(path.join(__dirname, '../../backend/scripts/jobs/archiveRetention.js'), 'utf8');
    expect(src).not.toMatch(/require\([^)]*encryption/);
    expect(src).not.toMatch(/require\([^)]*(crypto|kms|vault)/i);
    expect(src).not.toMatch(/\bdecrypt\w*\s*\(/i);
  });

  it('continues with remaining collections when the first one fails, then returns success:false', async () => {
    const SECOND = `archive_8453_0x${'cd'.repeat(20)}_trades`;
    mockNames.push(GOOD, SECOND);
    mockCollections[GOOD] = { updateMany: jest.fn().mockRejectedValue(new Error('secret-detail')) };
    const res = await runArchiveRetention(NOW);
    expect(res.success).toBe(false);
    expect(mockCollections[SECOND].updateMany).toHaveBeenCalledTimes(2);
    const logged = logger.error.mock.calls.map((c) => c[0]).join('\n');
    expect(logged).toContain(GOOD);
    expect(logged).not.toContain('secret-detail');
  });

  it('fails closed when an update throws', async () => {
    mockNames.push(GOOD);
    mockCollections[GOOD] = { updateMany: jest.fn().mockRejectedValue(new Error('boom')) };
    const res = await runArchiveRetention(NOW);
    expect(res.success).toBe(false);
  });
});
