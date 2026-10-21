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
    worker._computeFinalizedUpTo = jest.fn((h) => h - 5); // B1-02: canlı tur head - derinlik (5) kadar okur
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

  it("one tick = one eth_blockNumber; range [last+1, head - depth] is split by WORKER_BLOCK_BATCH_SIZE", async () => {
    await worker._liveTick();
    expect(worker.provider.getBlockNumber).toHaveBeenCalledTimes(1);
    expect(worker._pollLiveRange.mock.calls).toEqual([[101, 110], [111, 120]]);
    expect(worker._lastLivePolledBlock).toBe(120);
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
    expect(worker._pollLiveRange).toHaveBeenLastCalledWith(111, 120);
    expect(worker._lastLivePolledBlock).toBe(120);
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

  describe("bounded backoff suppression of watchdog / liveness", () => {
    let nowSpy;
    beforeEach(() => {
      nowSpy = jest.spyOn(Date, "now").mockReturnValue(50_000_000);
      worker.isRunning = true;
      worker._state = "live";
      worker._reconnectPromise = null;
      worker._staleReconnects = 0;
      worker._exitProcess = jest.fn();
      worker._reconnect = jest.fn().mockResolvedValue(undefined);
      worker._lastBlockSeenAt = 50_000_000 - 10 * 60_000; // 10 dk'dır blok yok
      worker._rpcRateLimited = true;
      worker._rpcRateLimitedUntil = 50_000_000 + 60_000; // geri çekilme 1 dk sonra biter
    });
    afterEach(() => { nowSpy.mockRestore(); worker.isRunning = false; });

    it("is suppressed while inside the backoff window (+ one interval + 60s)", async () => {
      await worker._watchdogTick();
      expect(worker._reconnect).not.toHaveBeenCalled();
      expect(worker.getLivenessSnapshot().stale).toBe(false);
      expect(worker.getLivenessSnapshot().rpcRateLimited).toBe(true);
    });

    it("(a) past the upper bound the watchdog reconnects and liveness reports stale", async () => {
      nowSpy.mockReturnValue(50_000_000 + 60_000 + 15_000 + 60_000 + 1); // pay geçildi
      expect(worker.getLivenessSnapshot().stale).toBe(true);
      await worker._watchdogTick();
      expect(worker._reconnect).toHaveBeenCalledTimes(1);
    });

    it("(b) a non-429 error after a 429 lifts the suppression immediately", async () => {
      worker._noteLivePollFailure(new Error("ECONNRESET socket hang up"));
      expect(worker._rpcRateLimited).toBe(false);
      expect(worker.getLivenessSnapshot().stale).toBe(true);
      await worker._watchdogTick();
      expect(worker._reconnect).toHaveBeenCalledTimes(1);
    });
  });

  it("(b2) a tick failing with a network error after a 429 clears the rate-limited flag", async () => {
    worker._rpcRateLimited = true;
    worker.provider.getBlockNumber = jest.fn().mockRejectedValue(new Error("ECONNRESET"));
    await worker._liveTick();
    expect(worker._rpcRateLimited).toBe(false);
  });

  it("a successful getBlockNumber resets _staleReconnects and refreshes _lastBlockSeenAt", async () => {
    worker._staleReconnects = 1;
    worker._lastBlockSeenAt = 1;
    worker.provider.getBlockNumber = jest.fn().mockResolvedValue(100); // yeni iş yok
    await worker._liveTick();
    expect(worker._staleReconnects).toBe(0);
    expect(worker._lastBlockSeenAt).toBeGreaterThan(1);
  });

  it("epoch: a tick that returns after a reconnect does not move the cursor or flip state", async () => {
    let release;
    worker._pollLiveRange = jest.fn(() => new Promise((resolve) => { release = resolve; }));
    const tick = worker._liveTick();
    await Promise.resolve();
    await Promise.resolve();
    // reconnect başladı: epoch ilerler, imleç yeni bağlantı tarafından sıfırlanır
    worker._liveEpoch += 1;
    worker._livePollInProgress = false;
    worker._lastLivePolledBlock = 7;
    release();
    await tick;
    expect(worker._lastLivePolledBlock).toBe(7);
    expect(worker._livePollInProgress).toBe(false);
    expect(worker._liveTimer).toBeNull(); // eski tur yeniden zamanlamaz
  });

  it("epoch: a stale tick failing with 429 does not flip the rate-limited state", async () => {
    worker._pollLiveRange = jest.fn(async () => {
      worker._liveEpoch += 1;
      throw RATE_429();
    });
    await worker._liveTick();
    expect(worker._rpcRateLimited).toBe(false);
  });

  it("non-rate-limit errors keep the normal interval and are logged as errors (redacted)", () => {
    const delay = worker._noteLivePollFailure(new Error("boom https://x.g.alchemy.com/v2/LEAKEDKEY1234567890"));
    expect(delay).toBe(15_000);
    expect(JSON.stringify(mockLogger.error.mock.calls)).not.toContain("LEAKEDKEY");
  });
});
