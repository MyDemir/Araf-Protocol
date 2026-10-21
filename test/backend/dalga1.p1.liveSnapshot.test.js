"use strict";

// B1-01: kilit sonrası değişen profil canlı yolda (advancedStatus yok) snapshot'a giremez.
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
const at = (sec) => new Date(LOCK.getTime() + sec * 1000);
const profile = (enc, updatedAt) => ({
  payout_profile: {
    rail: "TR_IBAN", country: "TR", payout_details_enc: enc, contact: {},
    fingerprint: { hash: "h", version: 1 }, updated_at: updatedAt,
  },
});
const liveArgs = () => ({ tradeId: 7n, lockedAt: LOCK, makerAddress: MAKER, takerAddress: TAKER });

beforeEach(() => {
  jest.clearAllMocks();
  mockState.trade = { status: "LOCKED", payout_snapshot: { captured_at: null }, flat: {} };
  mockState.users = {};
});

describe("B1-01 canlı yol: kilit sonrası profil değişimi", () => {
  it("kilitten sonra değişen profil snapshot'a girmez, eksik işaretlenir ve loglanır", async () => {
    mockState.users[MAKER] = profile("m-CHANGED", at(5));
    mockState.users[TAKER] = profile("t1", at(-3600));
    await worker._captureLockedTradeSnapshot(liveArgs());
    expect(mockState.trade.payout_snapshot.captured_at).toBeNull();
    expect(mockState.trade.flat["payout_snapshot.maker.payout_details_enc"]).toBeUndefined();
    expect(mockState.trade.flat["payout_snapshot.is_complete"]).toBe(false);
    expect(mockState.trade.flat["payout_snapshot.incomplete_reason"]).toMatch(/live_profile_change_after_lock/);
    expect(mockLogger.error).toHaveBeenCalled();
  });

  it("kilit anından hemen önce kaydedilmiş profil canlı yolda alınır", async () => {
    mockState.users[MAKER] = profile("m1", at(-2));
    mockState.users[TAKER] = profile("t1", at(-3600));
    await worker._captureLockedTradeSnapshot(liveArgs());
    expect(mockState.trade.payout_snapshot.captured_at).toEqual(LOCK);
    expect(mockState.trade.flat["payout_snapshot.maker.payout_details_enc"]).toBe("m1");
  });

  it("damga == lockedAt canlı yolda kanıtsızdır (sıkı <)", async () => {
    mockState.users[MAKER] = profile("m1", at(0));
    mockState.users[TAKER] = profile("t1", at(-3600));
    await worker._captureLockedTradeSnapshot(liveArgs());
    expect(mockState.trade.payout_snapshot.captured_at).toBeNull();
  });

  it("taker profili kilitten sonra değiştiyse de snapshot alınmaz", async () => {
    mockState.users[MAKER] = profile("m1", at(-3600));
    mockState.users[TAKER] = profile("t-CHANGED", at(1));
    await worker._captureLockedTradeSnapshot(liveArgs());
    expect(mockState.trade.payout_snapshot.captured_at).toBeNull();
  });
});
