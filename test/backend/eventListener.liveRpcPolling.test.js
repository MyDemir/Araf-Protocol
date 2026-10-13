"use strict";

// Canlı izleme: zamanlayıcı tabanlı tur, 429 geri çekilmesi, aralığın kaybolmaması, aylık kapasite.

const mockRedis = { get: jest.fn(), set: jest.fn(), rPush: jest.fn(), lLen: jest.fn().mockResolvedValue(0) };
const mockLogger = { info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() };
jest.mock("../../backend/scripts/config/redis", () => ({ getRedisClient: jest.fn(() => mockRedis) }));
jest.mock("../../backend/scripts/utils/logger", () => mockLogger);
jest.mock("../../backend/scripts/services/expectedChain", () => ({ assertProviderExpectedChainOrThrow: jest.fn() }));

const RATE_429 = () => Object.assign(
  new Error('exceeded maximum retry limit (request={"url":"https://base-mainnet.g.alchemy.com/v2/LEAKEDKEY1234567890"}) code 429 "Your app has exceeded its compute units per second capacity"'),
  { code: "SERVER_ERROR" }
);
const MONTHLY = () => new Error("429 Monthly capacity limit exceeded");

describe("eventListener timer-driven live polling", () => {
  let worker;

  beforeEach(() => {
    jest.resetModules();
    Object.values(mockLogger).forEach((fn) => fn.mockClear());
    process.env.WORKER_REPLAY_BATCH_DELAY_MS = "0";
    process.env.WORKER_BLOCK_BATCH_SIZE = "10";
    worker = require("../../backend/scripts/services/eventListener");
    worker.contract = {};
    worker._listenersAttached = true;
    worker._stopRequested = false;
    worker._lastLivePolledBlock = 100;
    worker._lastSafeCheckpointBlock = 100;
    worker.provider = { on: jest.fn(), getBlockNumber: jest.fn().mockResolvedValue(125) };
    worker._pollLiveRange = jest.fn().mockResolvedValue(undefined);
    worker._computeFinalizedUpTo = jest.fn().mockReturnValue(0);
    worker._shouldTriggerLiveReplay = jest.fn().mockReturnValue(false);
  });

  afterEach(() => {
    worker._stopLiveTimer();
    jest.useRealTimers();
    delete process.env.WORKER_REPLAY_BATCH_DELAY_MS;
    delete process.env.WORKER_BLOCK_BATCH_SIZE;
  });

  it("does not subscribe to blocks: attaching only arms a timer (no per-block getLogs)", () => {
    jest.useFakeTimers();
    worker._listenersAttached = false;
    worker._attachLiveListeners();
    expect(worker.provider.on).not.toHaveBeenCalledWith("block", expect.anything());
    expect(worker.provider.getBlockNumber).not.toHaveBeenCalled();
    expect(worker._pollLiveRange).not.toHaveBeenCalled();
    worker._stopWatchdog();
  });

  it("one tick = one eth_blockNumber; range [last+1, head] is split by WORKER_BLOCK_BATCH_SIZE", async () => {
    await worker._liveTick();
    expect(worker.provider.getBlockNumber).toHaveBeenCalledTimes(1);
    expect(worker._pollLiveRange.mock.calls).toEqual([[101, 110], [111, 120], [121, 125]]);
    expect(worker._lastLivePolledBlock).toBe(125);
  });

  it("ticks fire at the interval (default 15s), not per block", async () => {
    jest.useFakeTimers();
    worker._scheduleLiveTick(15_000);
    await jest.advanceTimersByTimeAsync(14_000);
    expect(worker.provider.getBlockNumber).not.toHaveBeenCalled();
    await jest.advanceTimersByTimeAsync(1_500);
    expect(worker.provider.getBlockNumber).toHaveBeenCalledTimes(1);
    await jest.advanceTimersByTimeAsync(15_000);
    expect(worker.provider.getBlockNumber).toHaveBeenCalledTimes(2);
  });

  it("429: backs off exponentially, does not advance the cursor, range is re-read afterwards", async () => {
    worker._pollLiveRange = jest.fn()
      .mockResolvedValueOnce(undefined) // 101-110 ok
      .mockRejectedValueOnce(RATE_429()) // 111-120 429
      .mockResolvedValue(undefined);
    await worker._liveTick();
    expect(worker._lastLivePolledBlock).toBe(110); // yalnız okunan parça ilerledi
    expect(worker._rpcRateLimited).toBe(true);
    const firstBackoff = worker._rpcBackoffMs;
    expect(firstBackoff).toBe(30_000); // 15s x2

    await worker._liveTick(); // hâlâ 429 yok: toparlandı mı?
    expect(worker._pollLiveRange).toHaveBeenLastCalledWith(121, 125);
    expect(worker._lastLivePolledBlock).toBe(125);
    expect(worker._pollLiveRange).toHaveBeenCalledWith(111, 120); // kaçan aralık yeniden okundu
    expect(worker._rpcRateLimited).toBe(false);
  });

  it("repeated 429 doubles the delay up to 5 minutes and jitters", async () => {
    worker._pollLiveRange = jest.fn().mockRejectedValue(RATE_429());
    const delays = [];
    for (let i = 0; i < 8; i += 1) {
      delays.push(worker._noteLivePollFailure(RATE_429()));
    }
    expect(worker._rpcBackoffMs).toBe(300_000);
    expect(delays[0]).toBeGreaterThanOrEqual(30_000);
    expect(delays[0]).toBeLessThanOrEqual(36_000);
    expect(Math.max(...delays)).toBeLessThanOrEqual(360_000);
    expect(delays[1]).toBeGreaterThan(delays[0]);
  });

  it("no log flood: one warn per backoff window, one info on recovery; keys are never logged", async () => {
    worker._pollLiveRange = jest.fn().mockRejectedValue(RATE_429());
    await worker._liveTick();
    await worker._liveTick();
    await worker._liveTick();
    expect(mockLogger.warn).toHaveBeenCalledTimes(1);
    expect(mockLogger.error).not.toHaveBeenCalled();
    expect(JSON.stringify(mockLogger.warn.mock.calls)).not.toContain("LEAKEDKEY");

    worker._pollLiveRange = jest.fn().mockResolvedValue(undefined);
    await worker._liveTick();
    expect(mockLogger.info).toHaveBeenCalledWith(expect.stringContaining("normale döndü"));
    expect(worker._rpcRateLimited).toBe(false);
  });

  it("monthly capacity message waits a long time directly (30 min, not exponential)", () => {
    const delay = worker._noteLivePollFailure(MONTHLY());
    expect(delay).toBeGreaterThanOrEqual(30 * 60_000);
    expect(worker._rpcRateLimitKind).toBe("monthly");
  });

  it("block-range limit errors are recognised like 429 and tell the operator to lower WORKER_BLOCK_BATCH_SIZE", () => {
    worker._noteLivePollFailure(new Error("eth_getLogs is limited to a 10 block range"));
    expect(mockLogger.error).toHaveBeenCalledWith(expect.stringContaining("WORKER_BLOCK_BATCH_SIZE"));
    expect(worker._rpcRateLimited).toBe(true);
  });

  it("watchdog does not reconnect/exit while a deliberate rate-limit backoff is active", async () => {
    worker.isRunning = true;
    worker._state = "live";
    worker._reconnectPromise = null;
    worker._exitProcess = jest.fn();
    worker._reconnect = jest.fn().mockResolvedValue(undefined);
    worker._lastBlockSeenAt = Date.now() - 10 * 60_000;
    worker._rpcRateLimited = true;
    await worker._watchdogTick();
    expect(worker._reconnect).not.toHaveBeenCalled();
    expect(worker._exitProcess).not.toHaveBeenCalled();
    worker.isRunning = false;
  });

  it("non-rate-limit errors keep the normal interval and are logged as errors (redacted)", () => {
    const delay = worker._noteLivePollFailure(new Error("boom https://x.g.alchemy.com/v2/LEAKEDKEY1234567890"));
    expect(delay).toBe(15_000);
    expect(JSON.stringify(mockLogger.error.mock.calls)).not.toContain("LEAKEDKEY");
  });
});
