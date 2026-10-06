"use strict";

jest.mock("../../backend/scripts/config/redis", () => ({ getRedisClient: jest.fn(() => ({})) }));
jest.mock("../../backend/scripts/utils/logger", () => ({
  info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn(),
}));
jest.mock("../../backend/scripts/services/protocolConfig", () => ({
  updateCachedFeeConfig: jest.fn(), updateCachedCooldownConfig: jest.fn(), updateCachedTokenConfig: jest.fn(),
}));
jest.mock("../../backend/scripts/models/Order", () => ({}));
jest.mock("mongoose", () => ({}));

// In-memory Trade: honors the status + payout_snapshot.captured_at conditions like Mongo would.
const mockState = { trade: null, users: {} };
jest.mock("../../backend/scripts/models/Trade", () => ({
  findOneAndUpdate: jest.fn(async (filter, update) => {
    const t = mockState.trade;
    if (!t) return null;
    if (filter.status && !filter.status.$in.includes(t.status)) return null;
    if (filter["payout_snapshot.captured_at"] === null && t.payout_snapshot.captured_at) return null;
    const old = JSON.parse(JSON.stringify(t));
    Object.assign(t.flat, update.$set);
    t.status = update.$set.status;
    t.payout_snapshot.captured_at = update.$set["payout_snapshot.captured_at"];
    return old;
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
const profile = (enc) => ({ rail: "TR_IBAN", country: "TR", payout_details_enc: enc, contact: {}, fingerprint: { version: 1 } });
const args = () => ({ tradeId: 99n, lockedAt: new Date("2026-01-01T00:00:00Z"), makerAddress: MAKER, takerAddress: TAKER });

beforeEach(() => {
  mockState.trade = { status: "LOCKED", payout_snapshot: { captured_at: null }, flat: {} };
  mockState.users = {};
});

describe("_captureLockedTradeSnapshot is one-shot", () => {
  it("does not change the snapshot when the profile changes and the event is replayed", async () => {
    mockState.users[MAKER] = { payout_profile: profile("maker-enc-1") };
    mockState.users[TAKER] = { payout_profile: profile("taker-enc-1") };
    await worker._captureLockedTradeSnapshot(args());
    expect(mockState.trade.flat["payout_snapshot.maker.payout_details_enc"]).toBe("maker-enc-1");

    mockState.users[MAKER] = { payout_profile: profile("maker-enc-EVIL") };
    mockState.users[TAKER] = { payout_profile: profile("taker-enc-EVIL") };
    await worker._captureLockedTradeSnapshot(args());

    expect(mockState.trade.flat["payout_snapshot.maker.payout_details_enc"]).toBe("maker-enc-1");
    expect(mockState.trade.flat["payout_snapshot.taker.payout_details_enc"]).toBe("taker-enc-1");
  });

  it("does not complete an incomplete snapshot on replay", async () => {
    mockState.users[MAKER] = { payout_profile: profile("maker-enc-1") };
    // taker has no profile -> incomplete snapshot
    await worker._captureLockedTradeSnapshot(args());
    expect(mockState.trade.flat["payout_snapshot.is_complete"]).toBe(false);

    mockState.users[TAKER] = { payout_profile: profile("taker-enc-late") };
    await worker._captureLockedTradeSnapshot(args());

    expect(mockState.trade.flat["payout_snapshot.is_complete"]).toBe(false);
    expect(mockState.trade.flat["payout_snapshot.taker.payout_details_enc"]).toBeNull();
  });
});
