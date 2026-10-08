"use strict";

jest.mock("../../backend/scripts/config/redis", () => ({ getRedisClient: jest.fn(() => ({ get: jest.fn(), set: jest.fn(), setEx: jest.fn(), del: jest.fn(), rPush: jest.fn() })) }));
jest.mock("../../backend/scripts/utils/logger", () => ({ info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() }));
jest.mock("../../backend/scripts/services/protocolConfig", () => ({
  updateCachedFeeConfig: jest.fn(), updateCachedCooldownConfig: jest.fn(), updateCachedTokenConfig: jest.fn(), refreshProtocolConfig: jest.fn(),
}));

const mockEpochFindOne = jest.fn();
const mockEpochFindOneAndUpdate = jest.fn().mockResolvedValue({});
const mockEpochUpdateMany = jest.fn().mockResolvedValue({});
jest.mock("../../backend/scripts/models/RewardEpoch", () => ({
  findOne: (...a) => ({ lean: async () => mockEpochFindOne(...a) }),
  findOneAndUpdate: (...a) => mockEpochFindOneAndUpdate(...a),
  updateMany: (...a) => mockEpochUpdateMany(...a),
}));
const mockClaimUpdate = jest.fn().mockResolvedValue({});
jest.mock("../../backend/scripts/models/RewardClaim", () => ({ findOneAndUpdate: (...a) => mockClaimUpdate(...a) }));

const worker = require("../../backend/scripts/services/eventListener");

const TOKEN = "0xAAAAaaaaAAAAaaaaAAAAaaaaAAAAaaaaAAAAaaaa";

describe("RewardEpoch lifecycle mirror", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockEpochFindOne.mockResolvedValue(null);
    worker._getEventDate = jest.fn().mockResolvedValue(new Date("2026-01-01T00:00:00Z"));
  });

  it("EpochTokenFinalizedEvent sets status CLAIMABLE", async () => {
    await worker._onEpochTokenFinalized({ args: { epoch: 5n, token: TOKEN } });
    const [key, update] = mockEpochFindOneAndUpdate.mock.calls[0];
    expect(key).toEqual({ epoch: "5", token: TOKEN.toLowerCase() });
    expect(update.$set.status).toBe("CLAIMABLE");
  });

  it("does not downgrade a CLOSED epoch on replayed finalization", async () => {
    mockEpochFindOne.mockResolvedValue({ status: "CLOSED" });
    await worker._onEpochTokenFinalized({ args: { epoch: 5n, token: TOKEN } });
    expect(mockEpochFindOneAndUpdate).not.toHaveBeenCalled();
  });

  it("EpochDustRolledOver sets status CLOSED", async () => {
    await worker._onEpochDustRolledOver({ args: { epoch: 5n, token: TOKEN, targetEpoch: 9n, amount: 1n } });
    expect(mockEpochFindOneAndUpdate.mock.calls[0][1].$set.status).toBe("CLOSED");
  });

  it("RewardClaimed mirrors total_weight onto the epoch rows", async () => {
    await worker._onRewardClaimed({
      transactionHash: "0xtx", blockNumber: 1, index: 0,
      args: { epoch: 5n, user: TOKEN, token: TOKEN, amount: 10n, userWeight: 2n, totalWeight: 40n },
    });
    expect(mockEpochUpdateMany).toHaveBeenCalledWith({ epoch: "5" }, { $set: { total_weight: "40" } });
  });

  it("new events are routed to the rewards contract", () => {
    worker.rewardsContract = { id: "r" };
    expect(worker._contractForEvent("EpochTokenFinalizedEvent")).toBe(worker.rewardsContract);
    expect(worker._contractForEvent("EpochDustRolledOver")).toBe(worker.rewardsContract);
  });
});
