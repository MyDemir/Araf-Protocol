"use strict";

// B1-04: allocation kaydı + epoch_pool artışı atomik; ara hatada tekrar denemede havuz eksik kalmaz.
jest.mock("../../backend/scripts/config/redis", () => ({ getRedisClient: jest.fn(() => ({})) }));
jest.mock("../../backend/scripts/utils/logger", () => ({ info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() }));
jest.mock("../../backend/scripts/services/protocolConfig", () => ({
  updateCachedFeeConfig: jest.fn(), updateCachedCooldownConfig: jest.fn(), updateCachedTokenConfig: jest.fn(),
}));

// Basit transaction simülasyonu: session'lı yazımlar commit'e kadar sahnede bekler, abort'ta atılır.
const mockDb = { allocations: new Map(), pools: new Map() };
let mockStaged = null;
const mockFailures = { poolWrite: 0 };

jest.mock("mongoose", () => ({
  startSession: jest.fn(async () => ({
    startTransaction: () => { mockStaged = { allocations: new Map(), pools: new Map() }; },
    commitTransaction: async () => {
      for (const [k, v] of mockStaged.allocations) mockDb.allocations.set(k, v);
      for (const [k, v] of mockStaged.pools) mockDb.pools.set(k, v);
      mockStaged = null;
    },
    abortTransaction: async () => { mockStaged = null; },
    endSession: async () => {},
  })),
}));

jest.mock("../../backend/scripts/models/RewardEpochAllocationEvent", () => ({
  findOneAndUpdate: jest.fn(async (filter, update, opts) => {
    const k = `${filter.tx_hash}:${filter.log_index}`;
    const existed = mockDb.allocations.has(k) || Boolean(mockStaged && mockStaged.allocations.has(k));
    if (!existed) (opts.session ? mockStaged.allocations : mockDb.allocations).set(k, update.$setOnInsert);
    return { lastErrorObject: { updatedExisting: existed } };
  }),
}));
jest.mock("../../backend/scripts/models/RewardEpoch", () => ({
  findOne: jest.fn((key) => ({
    session: () => ({ lean: async () => mockDb.pools.get(`${key.epoch}:${key.token}`) || null }),
    lean: async () => mockDb.pools.get(`${key.epoch}:${key.token}`) || null,
  })),
  findOneAndUpdate: jest.fn(async (key, update, opts) => {
    if (mockFailures.poolWrite > 0) { mockFailures.poolWrite -= 1; throw new Error("mongo transient"); }
    (opts.session ? mockStaged.pools : mockDb.pools).set(`${key.epoch}:${key.token}`, { epoch_pool: update.$set.epoch_pool });
    return {};
  }),
}));

for (const m of ["Trade", "Order", "User", "RevenueEvent", "RewardFunding", "RewardClaim"]) jest.mock(`../../backend/scripts/models/${m}`, () => ({}));

const worker = require("../../backend/scripts/services/eventListener");

const TOKEN = "0xAAAAaaaaAAAAaaaaAAAAaaaaAAAAaaaaAAAAaaaa";
const ev = () => ({ transactionHash: "0xtx1", blockNumber: 10, index: 3, args: { epoch: 5n, token: TOKEN, amount: 100n } });
const POOL_KEY = `5:${TOKEN.toLowerCase()}`;

beforeEach(() => {
  mockDb.allocations.clear();
  mockDb.pools.clear();
  mockStaged = null;
  mockFailures.poolWrite = 0;
  worker._getEventDate = jest.fn().mockResolvedValue(new Date("2026-01-01T00:00:00Z"));
});

describe("B1-04 EpochRewardAllocated atomikliği", () => {
  it("getBlock hatasında hiçbir şey yazılmaz; tekrar denemede havuz artar", async () => {
    worker._getEventDate.mockRejectedValueOnce(new Error("429"));
    await expect(worker._onEpochRewardAllocated(ev())).rejects.toThrow("429");
    expect(mockDb.allocations.size).toBe(0);
    await worker._onEpochRewardAllocated(ev());
    expect(mockDb.pools.get(POOL_KEY).epoch_pool).toBe("100");
  });

  it("havuz yazımı hata verirse allocation kaydı geri alınır; tekrar denemede havuz tam artar", async () => {
    mockFailures.poolWrite = 1;
    await expect(worker._onEpochRewardAllocated(ev())).rejects.toThrow("mongo transient");
    expect(mockDb.allocations.size).toBe(0);
    await worker._onEpochRewardAllocated(ev());
    expect(mockDb.pools.get(POOL_KEY).epoch_pool).toBe("100");
    expect(mockDb.allocations.size).toBe(1);
  });

  it("aynı event tekrar oynatılırsa havuz iki kez sayılmaz", async () => {
    await worker._onEpochRewardAllocated(ev());
    await worker._onEpochRewardAllocated(ev());
    expect(mockDb.pools.get(POOL_KEY).epoch_pool).toBe("100");
  });
});
