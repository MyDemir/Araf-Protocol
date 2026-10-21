"use strict";

// B1-05: checkpoint yokken ilk getLogs hata verirse bellek checkpoint'i başlangıç-1 olur (genesis taraması yok).

const kv = new Map();
const mockRedis = {
  get: jest.fn(async (k) => (kv.has(k) ? kv.get(k) : null)),
  set: jest.fn(async (k, v) => { kv.set(k, v); return "OK"; }),
  rPush: jest.fn(),
  lRange: jest.fn().mockResolvedValue([]),
  sIsMember: jest.fn().mockResolvedValue(0),
  sAdd: jest.fn(),
};
jest.mock("../../backend/scripts/config/redis", () => ({ getRedisClient: jest.fn(() => mockRedis) }));
jest.mock("../../backend/scripts/utils/logger", () => ({ info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() }));
jest.mock("../../backend/scripts/services/protocolConfig", () => ({ updateCachedFeeConfig: jest.fn(), updateCachedCooldownConfig: jest.fn(), updateCachedTokenConfig: jest.fn(), refreshProtocolConfig: jest.fn() }));
jest.mock("../../backend/scripts/models/Trade", () => ({}));
jest.mock("../../backend/scripts/models/Order", () => ({}));
jest.mock("../../backend/scripts/models/User", () => ({}));

describe("B1-05 ilk replay hatasında genesis taraması", () => {
  const ORIGINAL_ENV = { ...process.env };
  let worker;

  beforeEach(() => {
    jest.resetModules();
    jest.clearAllMocks();
    kv.clear();
    process.env = { ...ORIGINAL_ENV, WORKER_BLOCK_BATCH_SIZE: "10", WORKER_FINALITY_DEPTH: "1", WORKER_START_BLOCK: "50" };
    delete process.env.ARAF_DEPLOYMENT_BLOCK;
    worker = require("../../backend/scripts/services/eventListener");
    worker.contract = {};
    worker.provider = { getBlockNumber: jest.fn().mockResolvedValue(100) };
  });
  afterAll(() => { process.env = { ...ORIGINAL_ENV }; });

  it("ilk getLogs hata verince bellek checkpoint'i 49 olur, Redis'e yazılmaz", async () => {
    worker._fetchRangeEvents = jest.fn().mockRejectedValue(new Error("429"));
    await worker._replayMissedEvents();
    expect(worker._lastSafeCheckpointBlock).toBe(49);
    expect(mockRedis.set).not.toHaveBeenCalled();
  });

  it("kayıtlı checkpoint varsa değişmez", async () => {
    kv.set("worker:last_safe_block", "70");
    worker._fetchRangeEvents = jest.fn().mockRejectedValue(new Error("429"));
    await worker._replayMissedEvents();
    expect(worker._lastSafeCheckpointBlock).toBe(70);
  });
});
