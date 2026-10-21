"use strict";

// Worker, çalışma ayarlarını her turda yeniden okur: yeniden başlatma gerekmeden sonraki turda etkili olur.

const mockRedis = { get: jest.fn(), set: jest.fn(), rPush: jest.fn(), lLen: jest.fn().mockResolvedValue(0) };
const mockLogger = { info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() };
jest.mock("../../backend/scripts/config/redis", () => ({ getRedisClient: jest.fn(() => mockRedis) }));
jest.mock("../../backend/scripts/utils/logger", () => mockLogger);
jest.mock("../../backend/scripts/services/expectedChain", () => ({ assertProviderExpectedChainOrThrow: jest.fn() }));

const ADMIN = "0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa";

function fakeModels() {
  const store = { setting: null, failRead: false };
  const Setting = {
    findOne: jest.fn(() => ({
      lean: async () => {
        if (store.failRead) throw new Error("db down");
        return store.setting ? JSON.parse(JSON.stringify(store.setting)) : null;
      },
    })),
    updateOne: jest.fn(async (filter, update, opts = {}) => {
      if (!store.setting) {
        if (!opts.upsert) return { matchedCount: 0 };
        store.setting = { key: filter.key, values: {}, version: 0 };
      }
      for (const [p, v] of Object.entries(update.$set || {})) if (p.startsWith("values.")) store.setting.values[p.slice(7)] = v;
      for (const p of Object.keys(update.$unset || {})) delete store.setting.values[p.slice(7)];
      store.setting.version += (update.$inc || {}).version || 0;
      return { matchedCount: 1 };
    }),
  };
  const Audit = { create: jest.fn(async (d) => d) };
  return { store, Setting, Audit };
}

describe("eventListener reads runtime settings every round", () => {
  let worker;
  let svc;
  let fakes;

  beforeEach(() => {
    jest.resetModules();
    Object.values(mockLogger).forEach((fn) => fn.mockClear());
    ["LIVE_POLL_INTERVAL_MS", "WORKER_BLOCK_BATCH_SIZE", "WORKER_REPLAY_BATCH_DELAY_MS"].forEach((k) => delete process.env[k]);
    process.env.WORKER_REPLAY_BATCH_DELAY_MS = "0";
    process.env.WORKER_BLOCK_BATCH_SIZE = "10";
    fakes = fakeModels();
    jest.doMock("../../backend/scripts/models/RuntimeSetting", () => fakes.Setting);
    jest.doMock("../../backend/scripts/models/RuntimeSettingAudit", () => fakes.Audit);
    worker = require("../../backend/scripts/services/eventListener");
    svc = require("../../backend/scripts/services/runtimeSettings");
    Object.defineProperty(require("mongoose").connection, "readyState", { value: 1, configurable: true });
    worker.contract = {};
    worker._listenersAttached = true;
    worker._stopRequested = false;
    worker._lastLivePolledBlock = 0;
    worker._lastSafeCheckpointBlock = 0;
    worker.provider = { on: jest.fn(), getBlockNumber: jest.fn().mockResolvedValue(20) };
    worker._pollLiveRange = jest.fn().mockResolvedValue(undefined);
    worker._computeFinalizedUpTo = jest.fn((h) => h - 5); // B1-02: canlı tur head - derinlik (5) kadar okur
    worker._shouldTriggerLiveReplay = jest.fn().mockReturnValue(false);
  });

  afterEach(() => {
    worker._stopLiveTimer();
    jest.useRealTimers();
    ["WORKER_REPLAY_BATCH_DELAY_MS", "WORKER_BLOCK_BATCH_SIZE"].forEach((k) => delete process.env[k]);
  });

  it("uses env until an admin value is saved; the new batch size applies on the next tick, no restart", async () => {
    await worker._refreshRuntimeSettings();
    await worker._liveTick();
    expect(worker._pollLiveRange.mock.calls).toEqual([[1, 10], [11, 15]]);

    await svc.setSetting("WORKER_BLOCK_BATCH_SIZE", 4, { wallet: ADMIN });
    worker._pollLiveRange.mockClear();
    worker._lastLivePolledBlock = 0;
    await worker._refreshRuntimeSettings();
    await worker._liveTick();
    expect(worker._pollLiveRange.mock.calls).toEqual([[1, 4], [5, 8], [9, 12], [13, 15]]);

    // env'e dön: override silinir, env (10) geri gelir
    await svc.setSetting("WORKER_BLOCK_BATCH_SIZE", null, { wallet: ADMIN });
    worker._pollLiveRange.mockClear();
    worker._lastLivePolledBlock = 0;
    await worker._refreshRuntimeSettings();
    await worker._liveTick();
    expect(worker._pollLiveRange.mock.calls).toEqual([[1, 10], [11, 15]]);
  });

  it("timer path: interval change applies from the next scheduled tick", async () => {
    jest.useFakeTimers();
    await svc.setSetting("LIVE_POLL_INTERVAL_MS", 20_000, { wallet: ADMIN });
    worker._scheduleLiveTick(1_000);
    await jest.advanceTimersByTimeAsync(1_500);
    expect(worker.provider.getBlockNumber).toHaveBeenCalledTimes(1);
    // tur sonunda bir sonraki tur 20 sn sonraya kuruldu
    await jest.advanceTimersByTimeAsync(19_000);
    expect(worker.provider.getBlockNumber).toHaveBeenCalledTimes(1);
    await jest.advanceTimersByTimeAsync(1_500);
    expect(worker.provider.getBlockNumber).toHaveBeenCalledTimes(2);

    // admin aralığı 6 sn yapar: mevcut zamanlayıcı bitince, sonraki tur 6 sn sonraya kurulur
    await svc.setSetting("LIVE_POLL_INTERVAL_MS", 6_000, { wallet: ADMIN });
    await jest.advanceTimersByTimeAsync(20_000);
    expect(worker.provider.getBlockNumber).toHaveBeenCalledTimes(3);
    await jest.advanceTimersByTimeAsync(6_500);
    expect(worker.provider.getBlockNumber).toHaveBeenCalledTimes(4);
  });

  it("DB failure keeps the last known value; bounds still apply", async () => {
    await svc.setSetting("WORKER_BLOCK_BATCH_SIZE", 5, { wallet: ADMIN });
    await worker._refreshRuntimeSettings();
    expect(worker._cfg("WORKER_BLOCK_BATCH_SIZE")).toBe(5);
    fakes.store.failRead = true;
    svc.invalidateCache();
    await worker._refreshRuntimeSettings();
    expect(worker._cfg("WORKER_BLOCK_BATCH_SIZE")).toBe(5);

    // sınır dışı değer asla kabul edilmez
    worker._rt = { WORKER_BLOCK_BATCH_SIZE: 5000, LIVE_POLL_INTERVAL_MS: 1, WORKER_REPLAY_BATCH_DELAY_MS: -4 };
    expect(worker._cfg("WORKER_BLOCK_BATCH_SIZE")).toBe(10); // env
    expect(worker._cfg("LIVE_POLL_INTERVAL_MS")).toBe(15_000);
  });

  describe("worker/watchdog thresholds apply on the next round, no restart", () => {
    it("checkpoint interval (blocks)", async () => {
      delete worker._shouldTriggerLiveReplay; // gerçek metot
      worker._replayInProgress = false;
      worker._replayNextAttemptAt = 0;
      worker._lastSafeCheckpointBlock = 0;
      await worker._refreshRuntimeSettings();
      expect(worker._shouldTriggerLiveReplay(60)).toBe(true); // varsayılan 50
      await svc.setSetting("WORKER_CHECKPOINT_INTERVAL_BLOCKS", 100, { wallet: ADMIN });
      await worker._refreshRuntimeSettings();
      expect(worker._shouldTriggerLiveReplay(60)).toBe(false);
      expect(worker._shouldTriggerLiveReplay(100)).toBe(true);
    });

    it("replay backoff base/max", async () => {
      await svc.setSetting("WORKER_REPLAY_BACKOFF_BASE_MS", 1_000, { wallet: ADMIN });
      await svc.setSetting("WORKER_REPLAY_BACKOFF_MAX_MS", 5_000, { wallet: ADMIN });
      await worker._refreshRuntimeSettings();
      worker._replayFailureCount = 0;
      const t0 = Date.now();
      worker._noteReplayFailure(); // 1000
      expect(worker._replayNextAttemptAt - t0).toBeGreaterThanOrEqual(1_000);
      expect(worker._replayNextAttemptAt - t0).toBeLessThan(1_500);
      for (let i = 0; i < 10; i += 1) worker._noteReplayFailure();
      expect(worker._replayNextAttemptAt - Date.now()).toBeLessThanOrEqual(5_000);
    });

    it("watchdog block-stale threshold", async () => {
      worker.isRunning = true;
      worker._state = "live";
      worker._reconnectPromise = null;
      worker._staleReconnects = 0;
      worker._rpcRateLimitedUntil = 0;
      worker._recoverOrExit = jest.fn().mockResolvedValue(undefined);
      worker._lastBlockSeenAt = Date.now() - 80_000;
      await worker._refreshRuntimeSettings();
      await worker._watchdogTick();
      expect(worker._recoverOrExit).toHaveBeenCalledTimes(1); // varsayılan 75 sn aşıldı

      await svc.setSetting("WORKER_BLOCK_STALE_MS", 120_000, { wallet: ADMIN });
      await worker._refreshRuntimeSettings();
      worker._staleReconnects = 0;
      worker._recoverOrExit.mockClear();
      worker._lastBlockSeenAt = Date.now() - 80_000;
      await worker._watchdogTick();
      expect(worker._recoverOrExit).not.toHaveBeenCalled(); // eşik 120 sn'ye çıktı
    });

    it("liveness threshold in /health snapshot", async () => {
      worker.isRunning = true;
      worker._state = "live";
      worker._rpcRateLimitedUntil = 0;
      worker._lastBlockSeenAt = Date.now() - 200_000;
      await worker._refreshRuntimeSettings();
      expect(worker.getLivenessSnapshot().stale).toBe(true); // varsayılan 180 sn
      await svc.setSetting("WORKER_LIVENESS_STALE_MS", 400_000, { wallet: ADMIN });
      await worker._refreshRuntimeSettings();
      expect(worker.getLivenessSnapshot().stale).toBe(false);
    });

    it("watchdog interval is re-read each round (chained timer)", async () => {
      jest.useFakeTimers();
      worker._watchdogTick = jest.fn().mockResolvedValue(undefined);
      await svc.setSetting("WORKER_WATCHDOG_INTERVAL_MS", 30_000, { wallet: ADMIN });
      await worker._refreshRuntimeSettings();
      worker._watchdogTimer = null;
      worker._startWatchdog();
      await jest.advanceTimersByTimeAsync(29_000);
      expect(worker._watchdogTick).not.toHaveBeenCalled();
      await jest.advanceTimersByTimeAsync(2_000);
      expect(worker._watchdogTick).toHaveBeenCalledTimes(1);
      await jest.advanceTimersByTimeAsync(30_000);
      expect(worker._watchdogTick).toHaveBeenCalledTimes(2);
      worker._stopWatchdog();
      await jest.advanceTimersByTimeAsync(60_000);
      expect(worker._watchdogTick).toHaveBeenCalledTimes(2);
    });
  });
});
