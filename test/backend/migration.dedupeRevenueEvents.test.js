"use strict";

const { findDuplicateEscrowRows, runDedupeRevenueEvents, parseArgs } = require("../../backend/scripts/migrations/dedupeRevenueEvents");

const base = { token: "0xaaa", amount: "100", kind: 0, trade_id: "5", source: "ESCROW_REVENUE" };
const escrowRow = (id, tx = "0x1") => ({ _id: id, tx_hash: tx, log_index: 1, ...base, reward_share: null, treasury_share: null });
const vaultRow = (id, tx = "0x1") => ({ _id: id, tx_hash: tx, log_index: 2, ...base, reward_share: "40", treasury_share: "60" });

function fakeModel(initial) {
  let rows = [...initial];
  return {
    rows: () => rows,
    aggregate: jest.fn(async () => {
      const counts = {};
      rows.forEach((r) => { counts[r.tx_hash] = (counts[r.tx_hash] || 0) + 1; });
      return Object.entries(counts).filter(([, n]) => n > 1).map(([_id, n]) => ({ _id, n }));
    }),
    find: jest.fn((q) => ({ lean: async () => rows.filter((r) => r.tx_hash === q.tx_hash) })),
    deleteMany: jest.fn(async (q) => {
      const ids = new Set(q._id.$in);
      const before = rows.length;
      rows = rows.filter((r) => !ids.has(r._id));
      return { deletedCount: before - rows.length };
    }),
  };
}

describe("dedupeRevenueEvents migration (B16)", () => {
  it("detects the escrow row that duplicates a vault row, never the vault row", () => {
    const dup = findDuplicateEscrowRows([escrowRow("e"), vaultRow("v")]);
    expect(dup.map((d) => d._id)).toEqual(["e"]);
  });

  it("keeps lone escrow rows (legacy/external treasury) and lone vault rows", () => {
    expect(findDuplicateEscrowRows([escrowRow("e")])).toEqual([]);
    expect(findDuplicateEscrowRows([vaultRow("v")])).toEqual([]);
  });

  it("does not match rows that differ in amount/trade/kind and pairs one-to-one", () => {
    const other = { ...escrowRow("e2"), amount: "999" };
    expect(findDuplicateEscrowRows([other, vaultRow("v")])).toEqual([]);
    const dup = findDuplicateEscrowRows([escrowRow("e1"), { ...escrowRow("e2"), log_index: 3 }, vaultRow("v")]);
    expect(dup).toHaveLength(1);
  });

  it("is dry-run by default and deletes nothing", () => {
    expect(parseArgs([]).apply).toBe(false);
    expect(parseArgs(["--apply"]).apply).toBe(true);
  });

  it("dry-run reports but does not delete; --apply deletes; a second apply is a no-op", async () => {
    const model = fakeModel([escrowRow("e"), vaultRow("v"), escrowRow("solo", "0x2")]);

    const dry = await runDedupeRevenueEvents({ model });
    expect(dry).toMatchObject({ dryRun: true, duplicateCount: 1, deleted: 0 });
    expect(model.deleteMany).not.toHaveBeenCalled();
    expect(model.rows()).toHaveLength(3);

    const applied = await runDedupeRevenueEvents({ model, apply: true });
    expect(applied).toMatchObject({ dryRun: false, duplicateCount: 1, deleted: 1 });
    expect(model.rows().map((r) => r._id).sort()).toEqual(["solo", "v"]);

    const again = await runDedupeRevenueEvents({ model, apply: true });
    expect(again).toMatchObject({ duplicateCount: 0, deleted: 0 });
    expect(model.deleteMany).toHaveBeenCalledTimes(1);
  });
});
