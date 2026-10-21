// B4-04: temizlik job'u save() yerine koşullu atomik updateOne kullanmalı.
const mongoose = require('mongoose');
const User = require('../../backend/scripts/models/User');
const { runUserBankRiskMetadataCleanup } = require('../../backend/scripts/jobs/cleanupUserBankRiskMetadata');

const NOW = new Date('2026-06-30T00:00:00Z');
const day = 24 * 60 * 60 * 1000;

function makeUser(history) {
  const doc = User.hydrate({
    _id: new mongoose.Types.ObjectId(),
    wallet_address: '0x' + 'ab'.repeat(20),
    profileVersion: 3,
    bank_change_history: history,
    bankChangeCount7d: history.length,
    bankChangeCount30d: history.length,
    lastBankChangeAt: history[history.length - 1] || null,
  });
  doc.save = jest.fn().mockRejectedValue(new Error('save() kullanılmamalı'));
  return doc;
}

function mockCursor(docs) {
  const chain = {
    select: () => chain,
    batchSize: () => chain,
    cursor: () => (async function* () { for (const d of docs) yield d; })(),
  };
  jest.spyOn(User, 'find').mockReturnValue(chain);
}

afterEach(() => jest.restoreAllMocks());

describe('cleanupUserBankRiskMetadata atomik güncelleme', () => {
  const old = new Date(NOW.getTime() - 40 * day);
  const recent = new Date(NOW.getTime() - 2 * day);

  it('okunan diziyi koşul yaparak updateOne çağırır, save çağırmaz, profileVersion yazmaz', async () => {
    const u = makeUser([old, recent]);
    mockCursor([u]);
    const spy = jest.spyOn(User, 'updateOne').mockResolvedValue({ matchedCount: 1, modifiedCount: 1 });

    const res = await runUserBankRiskMetadataCleanup(NOW);

    expect(res).toMatchObject({ success: true, scanned: 1, updated: 1 });
    expect(u.save).not.toHaveBeenCalled();
    const [filter, update] = spy.mock.calls[0];
    expect(filter._id).toEqual(u._id);
    expect(filter.bank_change_history.map((d) => d.getTime())).toEqual([old.getTime(), recent.getTime()]);
    expect(update.$set.bank_change_history.map((d) => d.getTime())).toEqual([recent.getTime()]);
    expect(update.$set.bankChangeCount30d).toBe(1);
    expect(update.$set.bankChangeCount7d).toBe(1);
    expect(update.$set).not.toHaveProperty('profileVersion');
  });

  it('eşzamanlı değişiklikte (matchedCount 0) ezmez ve updated saymaz', async () => {
    mockCursor([makeUser([old, recent])]);
    jest.spyOn(User, 'updateOne').mockResolvedValue({ matchedCount: 0, modifiedCount: 0 });
    const res = await runUserBankRiskMetadataCleanup(NOW);
    expect(res).toMatchObject({ success: true, scanned: 1, updated: 0, skipped: 1 });
  });

  it('legacy: okunan dizi boşsa alanın hiç olmaması da eşleşir', async () => {
    const u = makeUser([]);
    u.bankChangeCount30d = 2; // sayaç tutarsız -> değişiklik var
    mockCursor([u]);
    const spy = jest.spyOn(User, 'updateOne').mockResolvedValue({ matchedCount: 1 });
    await runUserBankRiskMetadataCleanup(NOW);
    const [filter] = spy.mock.calls[0];
    expect(filter.$or).toEqual([{ bank_change_history: [] }, { bank_change_history: { $exists: false } }]);
    expect(filter).not.toHaveProperty('bank_change_history');
  });

  it('değişmeyen belgede updateOne çağırmaz', async () => {
    mockCursor([makeUser([recent])]);
    const spy = jest.spyOn(User, 'updateOne').mockResolvedValue({ matchedCount: 1 });
    const res = await runUserBankRiskMetadataCleanup(NOW);
    expect(spy).not.toHaveBeenCalled();
    expect(res).toMatchObject({ updated: 0, skipped: 0 });
  });
});
