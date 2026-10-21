"use strict";

// B1-02: canlı tur head - WORKER_FINALITY_DEPTH ile sınırlanır; checkpoint finalize edilmiş bloğu aşmaz.

const mockRedis = { get: jest.fn(), set: jest.fn(), rPush: jest.fn(), lLen: jest.fn().mockResolvedValue(0) };
jest.mock("../../backend/scripts/config/redis", () => ({ getRedisClient: jest.fn(() => mockRedis) }));
jest.mock("../../backend/scripts/utils/logger", () => ({ info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() }));
jest.mock("../../backend/scripts/services/protocolConfig", () => ({ updateCachedFeeConfig: jest.fn(), updateCachedCooldownConfig: jest.fn(), updateCachedTokenConfig: jest.fn(), refreshProtocolConfig: jest.fn() }));
jest.mock("../../backend/scripts/services/expectedChain", () => ({ assertProviderExpectedChainOrThrow: jest.fn() }));
jest.mock("../../backend/scripts/models/Trade", () => ({}));
jest.mock("../../backend/scripts/models/Order", () => ({}));
jest.mock("../../backend/scripts/models/User", () => ({}));

describe("B1-02 canlı tur finality derinliği (derinlik 6)", () => {
  const ORIGINAL_ENV = { ...process.env };
  let worker;

  const setup = (head, last) => {
    worker.contract = {};
    worker._listenersAttached = true;
    worker._stopRequested = false;
    worker._lastLivePolledBlock = last;
    worker._lastSafeCheckpointBlock = last;
    worker.provider = { on: jest.fn(), getBlockNumber: jest.fn().mockResolvedValue(head) };
    worker._pollLiveRange = jest.fn().mockResolvedValue(undefined);
    worker._shouldTriggerLiveReplay = jest.fn().mockReturnValue(false);
  };

  beforeEach(() => {
    jest.resetModules();
    jest.clearAllMocks();
    process.env = { ...ORIGINAL_ENV, WORKER_FINALITY_DEPTH: "6", WORKER_BLOCK_BATCH_SIZE: "10", WORKER_REPLAY_BATCH_DELAY_MS: "0" };
    worker = require("../../backend/scripts/services/eventListener");
  });
  afterEach(() => { worker._stopLiveTimer(); });
  afterAll(() => { process.env = { ...ORIGINAL_ENV }; });

  it("head'e değil head - 6'ya kadar okur; imleç finalize bloğu aşmaz", async () => {
    setup(125, 100);
    await worker._liveTick();
    expect(worker._pollLiveRange.mock.calls).toEqual([[101, 110], [111, 119]]);
    expect(worker._lastLivePolledBlock).toBe(119);
  });

  it("head < derinlik: negatif aralık yok, boş tur, imleç yerinde, hata yok", async () => {
    setup(4, 0);
    await worker._liveTick();
    expect(worker._pollLiveRange).not.toHaveBeenCalled();
    expect(worker._lastLivePolledBlock).toBe(0);
    expect(worker._rpcRateLimited).toBeFalsy();
  });

  it("head == derinlik: sınır 0, boş tur", async () => {
    setup(6, 0);
    await worker._liveTick();
    expect(worker._pollLiveRange).not.toHaveBeenCalled();
    expect(worker._lastLivePolledBlock).toBe(0);
  });

  it("head ilerlemese bile (imleç zaten sınırda) aynı aralık tekrar okunmaz", async () => {
    setup(125, 119);
    await worker._liveTick();
    expect(worker._pollLiveRange).not.toHaveBeenCalled();
  });

  it("checkpoint head - derinliği aşmaz", async () => {
    setup(125, 100);
    worker._pollLiveRange = jest.fn(async (from, to) => {
      worker._seedAckStateForRange(from, to);
    });
    await worker._liveTick();
    expect(worker._lastSafeCheckpointBlock).toBeLessThanOrEqual(125 - 6);
    expect(worker._lastSafeCheckpointBlock).toBe(119);
  });
});
