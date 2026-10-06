"use strict";

// K2(B): bir maker ping'i düştükten sonra taker da ping atabilir; iki ping zaman damgası birbirini ezmeden aynalanır.
// K2(B): after a maker ping lapses the taker may ping too; both timestamps are mirrored without overwriting each other.

jest.mock("../../backend/scripts/config/redis", () => ({ getRedisClient: jest.fn(() => ({ get: jest.fn(), set: jest.fn() })) }));
jest.mock("../../backend/scripts/utils/logger", () => ({ info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() }));
const mockTrade = { findOne: jest.fn(), findOneAndUpdate: jest.fn() };
jest.mock("../../backend/scripts/models/Trade", () => ({
  findOne: (...a) => mockTrade.findOne(...a),
  findOneAndUpdate: (...a) => mockTrade.findOneAndUpdate(...a),
}));
jest.mock("../../backend/scripts/models/Order", () => ({}));
jest.mock("../../backend/scripts/models/User", () => ({}));
jest.mock("../../backend/scripts/models/RevenueEvent", () => ({}));
jest.mock("../../backend/scripts/services/protocolConfig", () => ({}));
jest.mock("mongoose", () => ({ startSession: jest.fn() }));

const worker = require("../../backend/scripts/services/eventListener");

const MAKER = "0x3333333333333333333333333333333333333333";
const TAKER = "0x1111111111111111111111111111111111111111";

describe("MakerPinged mirror (K2-B)", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    worker._getEventDate = jest.fn().mockResolvedValue(new Date("2026-01-03T00:00:00Z"));
    mockTrade.findOne.mockReturnValue({ lean: jest.fn().mockResolvedValue({ taker_address: TAKER }) });
    mockTrade.findOneAndUpdate.mockResolvedValue({});
  });

  it("taker ping only sets pinged_at / pinged_by_taker (maker's lapsed ping timestamp untouched)", async () => {
    await worker._onMakerPinged({ args: { tradeId: 5n, pinger: TAKER, timestamp: 1n } });
    const update = mockTrade.findOneAndUpdate.mock.calls[0][1].$set;
    expect(update).toEqual({ "timers.pinged_at": expect.any(Date), pinged_by_taker: true });
  });

  it("maker ping only sets challenge_pinged_at / challenge_pinged_by_maker", async () => {
    await worker._onMakerPinged({ args: { tradeId: 5n, pinger: MAKER, timestamp: 1n } });
    const update = mockTrade.findOneAndUpdate.mock.calls[0][1].$set;
    expect(update).toEqual({ "timers.challenge_pinged_at": expect.any(Date), challenge_pinged_by_maker: true });
  });
});
