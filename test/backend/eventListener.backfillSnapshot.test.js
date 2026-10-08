"use strict";

jest.mock("../../backend/scripts/config/redis", () => ({ getRedisClient: jest.fn(() => ({})) }));
const mockLogger = { info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() };
jest.mock("../../backend/scripts/utils/logger", () => mockLogger);
jest.mock("../../backend/scripts/services/protocolConfig", () => ({
  updateCachedFeeConfig: jest.fn(), updateCachedCooldownConfig: jest.fn(), updateCachedTokenConfig: jest.fn(),
}));
jest.mock("../../backend/scripts/models/Order", () => ({}));
jest.mock("mongoose", () => ({}));

const mockState = { trade: null, users: {} };
jest.mock("../../backend/scripts/models/Trade", () => ({
  findOneAndUpdate: jest.fn(async (filter, update) => {
    const t = mockState.trade;
    if (!t) return null;
    if (filter.status && !filter.status.$in.includes(t.status)) return null;
    if (filter["payout_snapshot.captured_at"] === null && t.payout_snapshot.captured_at) return null;
    Object.assign(t.flat, update.$set);
    if (update.$set.status) t.status = update.$set.status;
    if ("payout_snapshot.captured_at" in update.$set) t.payout_snapshot.captured_at = update.$set["payout_snapshot.captured_at"];
    return t;
  }),
}));
jest.mock("../../backend/scripts/models/User", () => ({
  findOne: jest.fn((q) => ({
    select: () => ({ lean: async () => mockState.users[q.wallet_address] || null }),
  })),
}));

const worker = require("../../backend/scripts/services/eventListener");

const MAKER = "0x3333333333333333333333333333333333333333";
const TAKER = "0x1111111111111111111111111111111111111111";
const LOCK = new Date("2026-01-10T00:00:00Z");
const profile = (enc, updatedAt) => ({
  payout_profile: {
    rail: "TR_IBAN", country: "TR", payout_details_enc: enc, contact: {},
    fingerprint: { hash: "h", version: 1 }, updated_at: updatedAt,
  },
});
const args = (advancedStatus) => ({ tradeId: 7n, lockedAt: LOCK, makerAddress: MAKER, takerAddress: TAKER, advancedStatus });

beforeEach(() => {
  jest.clearAllMocks();
  mockState.trade = { status: "PAID", payout_snapshot: { captured_at: null }, flat: {} };
  mockState.users = {};
});

describe("backfill snapshot for PAID/CHALLENGED mirrors", () => {
  it("captures when both profiles provably did not change since lock, without rewinding status", async () => {
    mockState.users[MAKER] = profile("m1", new Date("2026-01-01T00:00:00Z"));
    mockState.users[TAKER] = profile("t1", new Date("2026-01-02T00:00:00Z"));
    await worker._captureLockedTradeSnapshot(args("PAID"));
    expect(mockState.trade.status).toBe("PAID");
    expect(mockState.trade.flat["payout_snapshot.maker.payout_details_enc"]).toBe("m1");
    expect(mockState.trade.payout_snapshot.captured_at).toEqual(LOCK);
  });

  it("never captures when a profile changed after lock; marks incomplete and logs", async () => {
    mockState.users[MAKER] = profile("m-CHANGED", new Date("2026-01-11T00:00:00Z"));
    mockState.users[TAKER] = profile("t1", new Date("2026-01-02T00:00:00Z"));
    await worker._captureLockedTradeSnapshot(args("PAID"));
    expect(mockState.trade.payout_snapshot.captured_at).toBeNull();
    expect(mockState.trade.flat["payout_snapshot.maker.payout_details_enc"]).toBeUndefined();
    expect(mockState.trade.flat["payout_snapshot.is_complete"]).toBe(false);
    expect(mockState.trade.flat["payout_snapshot.incomplete_reason"]).toMatch(/unprovable/);
    expect(mockLogger.error).toHaveBeenCalled();
  });

  it("treats a missing updated_at on a populated profile as unprovable", async () => {
    mockState.users[MAKER] = profile("m1", null);
    mockState.users[TAKER] = profile("t1", new Date("2026-01-02T00:00:00Z"));
    await worker._captureLockedTradeSnapshot(args("CHALLENGED"));
    expect(mockState.trade.payout_snapshot.captured_at).toBeNull();
  });

  it("reconciliation report exposes snapshot_missing_after_backfill", () => {
    const fs = require("fs");
    const src = fs.readFileSync(require.resolve("../../backend/scripts/services/eventListener"), "utf8");
    expect(src).toContain("snapshot_missing_after_backfill");
  });
});
