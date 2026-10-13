"use strict";

const express = require("express");
const request = require("supertest");

const ROUTES = ["logs", "auth", "orders", "trades", "pii", "feedback", "stats", "receipts", "admin", "referenceRates", "rewards"];

function rpc429() {
  const e = new Error("server response 429 Too Many Requests (compute units exceeded)");
  e.code = "SERVER_ERROR";
  return e;
}
function sec01Transient() {
  return new Error("SEC-01 BLOCKER: ALLOW_ENV_KMS_ON_TESTNET için RPC'nin Base Sepolia (84532) olduğu doğrulanamadı: server response 429 Too Many Requests");
}

async function boot({ selfTest, connectDB, loadConfig } = {}) {
  jest.resetModules();
  jest.useFakeTimers({ doNotFake: ["nextTick", "setImmediate"] });
  process.env.PORT = "0";
  const calls = [];
  const mocks = {
    selfTest: jest.fn(selfTest || (async () => { calls.push("sec01_kms"); return { ok: true }; })),
    block: jest.fn(),
    loadConfig: jest.fn(loadConfig || (async () => { calls.push("config_boot"); })),
    refreshConfig: jest.fn(async () => { calls.push("config"); }),
    loadStale: jest.fn(async () => ({ stale: true })),
    workerStart: jest.fn(async () => { calls.push("worker"); }),
    startInBackground: jest.fn(() => Promise.resolve()),
    isStale: jest.fn(() => false),
    connectDB: jest.fn(connectDB || (async () => {})),
  };

  jest.doMock("../../backend/scripts/config/db", () => ({ connectDB: mocks.connectDB, setAllowProcessExitOnDisconnect: jest.fn() }));
  jest.doMock("../../backend/scripts/config/redis", () => ({
    connectRedis: jest.fn(async () => {}), closeRedis: jest.fn(async () => {}), isReady: () => false,
    getRedisClient: () => ({ get: jest.fn(async () => null) }),
  }));
  jest.doMock("../../backend/scripts/services/eventListener", () => ({
    isRunning: false, provider: null, _state: "stopped", start: mocks.workerStart, stop: jest.fn(async () => {}),
    startInBackground: mocks.startInBackground, getLivenessSnapshot: () => ({ stale: false, state: "stopped", lastBlockAgeMs: null }),
    runReconciliationReport: jest.fn(), getDiagnostics: () => null,
  }));
  jest.doMock("../../backend/scripts/services/protocolConfig", () => ({
    loadProtocolConfig: mocks.loadConfig, refreshProtocolConfig: mocks.refreshConfig, loadStaleProtocolConfig: mocks.loadStale, isProtocolConfigStale: mocks.isStale,
  }));
  jest.doMock("../../backend/scripts/services/encryption", () => ({
    clearMasterKeyCache: jest.fn(), runProductionKmsStartupSelfTest: mocks.selfTest, blockKeyLoadingUntilSelfTest: mocks.block,
  }));
  jest.doMock("../../backend/scripts/services/identityNormalizationGuard", () => ({ verifyIdentityNormalization: jest.fn(async () => true) }));
  jest.doMock("../../backend/scripts/services/dlqProcessor", () => ({ processDLQ: jest.fn() }));
  jest.doMock("../../backend/scripts/services/referenceTicker", () => ({ refreshReferenceTicker: jest.fn(async () => ({ success: true })) }));
  for (const j of ["reputationDecay", "rewardOutcomeRecorder", "statsSnapshot", "cleanupSensitiveData", "cleanupUserBankRiskMetadata"]) {
    jest.doMock(`../../backend/scripts/jobs/${j}`, () => new Proxy({}, { get: () => jest.fn(async () => ({ success: true })) }));
  }
  for (const r of ROUTES) {
    jest.doMock(`../../backend/scripts/routes/${r}`, () => {
      const router = require("express").Router();
      router.use((_req, res) => res.json({ reached: true }));
      return router;
    });
  }
  jest.spyOn(express.application, "listen").mockImplementation(function listen(_port, cb) {
    if (typeof cb === "function") cb();
    return { close: (c) => c && c() };
  });
  const exitSpy = jest.spyOn(process, "exit").mockImplementation(() => undefined);

  const app = require("../../backend/scripts/app");
  await jest.advanceTimersByTimeAsync(50);
  const serviceMode = require("../../backend/scripts/services/serviceMode");
  return { app, mocks, calls, exitSpy, serviceMode };
}

describe("app bootstrap: degraded mode on transient RPC failure", () => {
  const savedEnv = { ...process.env };
  afterEach(() => {
    jest.useRealTimers();
    jest.restoreAllMocks();
    jest.dontMock("../../backend/scripts/services/serviceMode");
    process.env = { ...savedEnv };
  });

  it("RPC 429 at SEC-01: process stays alive, degraded, key loading blocked, /ready 503 with reasons", async () => {
    const { app, mocks, exitSpy, serviceMode } = await boot({ selfTest: async () => { throw sec01Transient(); } });
    expect(exitSpy).not.toHaveBeenCalled();
    expect(serviceMode.isDegraded()).toBe(true);
    expect(mocks.block).toHaveBeenCalledTimes(1);
    expect(mocks.loadConfig).not.toHaveBeenCalled();
    expect(mocks.loadStale).toHaveBeenCalledTimes(1);
    expect(mocks.startInBackground).not.toHaveBeenCalled();
    expect(serviceMode.isConfigStale()).toBe(true);

    const ready = await request(app).get("/ready");
    expect(ready.status).toBe(503);
    expect(ready.body.degraded).toBe(true);
    expect(ready.body.degradedReasons).toContain("rpc_unavailable_at_boot");
    expect(ready.body.checks.fullService).toBe(false);

    expect((await request(app).get("/api/pii/my")).status).toBe(503);
    expect((await request(app).get("/api/receipts/upload")).status).toBe(503);
    expect((await request(app).get("/api/orders")).status).toBe(200);
  });

  it("network error at protocol config (SEC-01 ok): degraded, stale config used, worker not started, no exit", async () => {
    const e = new Error("connect ECONNREFUSED 127.0.0.1:8545");
    e.code = "ECONNREFUSED";
    const { mocks, exitSpy, serviceMode } = await boot({ loadConfig: async () => { throw e; } });
    expect(exitSpy).not.toHaveBeenCalled();
    expect(serviceMode.isDegraded()).toBe(true);
    expect(mocks.block).not.toHaveBeenCalled(); // chain was verified, key legitimately loaded
    expect(mocks.loadStale).toHaveBeenCalledTimes(1);
    expect(mocks.startInBackground).not.toHaveBeenCalled();
  });

  it("healthy boot: not degraded, worker started normally", async () => {
    const { mocks, exitSpy, serviceMode } = await boot();
    expect(serviceMode.isDegraded()).toBe(false);
    expect(exitSpy).not.toHaveBeenCalled();
    expect(mocks.startInBackground).toHaveBeenCalledTimes(1);
  });

  it("ChainGuard (wrong chain) at SEC-01 => exit(1), never degraded", async () => {
    const { exitSpy, serviceMode, mocks } = await boot({
      selfTest: async () => { throw new Error("SEC-01 BLOCKER: ALLOW_ENV_KMS_ON_TESTNET için RPC'nin Base Sepolia (84532) olduğu doğrulanamadı: actual chain=8453"); },
    });
    expect(exitSpy).toHaveBeenCalledWith(1);
    expect(serviceMode.isDegraded()).toBe(false);
    expect(mocks.block).not.toHaveBeenCalled();
    expect(mocks.connectDB).not.toHaveBeenCalled();
  });

  it("[ChainGuard] error => exit(1)", async () => {
    const { exitSpy, serviceMode } = await boot({ selfTest: async () => { throw new Error("[ChainGuard][x] Chain ID uyuşmazlığı. expected=84532 actual=1"); } });
    expect(exitSpy).toHaveBeenCalledWith(1);
    expect(serviceMode.isDegraded()).toBe(false);
  });

  it("unknown error => exit(1) (fail-closed)", async () => {
    const { exitSpy } = await boot({ selfTest: async () => { throw new Error("something unexpected"); } });
    expect(exitSpy).toHaveBeenCalledWith(1);
  });

  it("DB down keeps today's behaviour (exit 1) even when RPC is also degraded", async () => {
    const { exitSpy } = await boot({
      selfTest: async () => { throw sec01Transient(); },
      connectDB: async () => { throw new Error("MongoDB unreachable"); },
    });
    expect(exitSpy).toHaveBeenCalledWith(1);
  });

  it("recovery: SEC-01(+KMS) -> config -> worker in order, then degraded=false and gated routes reopen; single loop", async () => {
    let attempts = 0;
    const order = [];
    const { app, mocks, exitSpy, serviceMode } = await boot({
      selfTest: async () => {
        attempts += 1;
        if (attempts === 1) throw sec01Transient();
        order.push("sec01_kms");
      },
    });
    mocks.refreshConfig.mockImplementation(async () => { order.push("config"); });
    mocks.workerStart.mockImplementation(async () => { order.push("worker"); });
    expect(serviceMode.isDegraded()).toBe(true);
    expect((await request(app).get("/api/pii/my")).status).toBe(503);

    // Seller flood: many degraded requests must not trigger any extra RPC-bound attempt.
    for (let i = 0; i < 20; i += 1) await request(app).get("/api/pii/my");
    expect(attempts).toBe(1);

    await jest.advanceTimersByTimeAsync(6_500);
    expect(order).toEqual(["sec01_kms", "config", "worker"]);
    expect(serviceMode.isDegraded()).toBe(false);
    expect(exitSpy).not.toHaveBeenCalled();

    const ready = await request(app).get("/ready");
    expect(ready.body.degradedReasons).not.toContain("rpc_unavailable_at_boot");
    expect(ready.body.checks.fullService).toBe(true);
    expect((await request(app).get("/api/pii/my")).status).toBe(200);

    // loop is finished: no more attempts
    await jest.advanceTimersByTimeAsync(600_000);
    expect(attempts).toBe(2);
    expect(mocks.workerStart).toHaveBeenCalledTimes(1);
  });
});

describe("recovery: stale/null config and fatal worker errors", () => {
  const savedEnv = { ...process.env };
  afterEach(() => {
    jest.useRealTimers();
    jest.restoreAllMocks();
    process.env = { ...savedEnv };
  });

  async function degradedBoot() {
    process.env.ARAF_ESCROW_ADDRESS = "0x" + "1".repeat(40);
    let n = 0;
    const ctx = await boot({ selfTest: async () => { n += 1; if (n === 1) throw sec01Transient(); } });
    ctx.serviceMode.setConfigStale(true);
    return ctx;
  }

  it("refresh returns null => step fails, still degraded and configStale NOT cleared, worker not started", async () => {
    const { mocks, serviceMode, exitSpy } = await degradedBoot();
    mocks.refreshConfig.mockResolvedValue(null);
    await jest.advanceTimersByTimeAsync(6_500);
    expect(serviceMode.isDegraded()).toBe(true);
    expect(serviceMode.isConfigStale()).toBe(true);
    expect(mocks.workerStart).not.toHaveBeenCalled();
    expect(exitSpy).not.toHaveBeenCalled();
  });

  it("refresh returns a stale config => same; recovers once fresh", async () => {
    const { mocks, serviceMode } = await degradedBoot();
    mocks.refreshConfig.mockResolvedValue({ stale: true });
    mocks.isStale.mockReturnValue(true);
    await jest.advanceTimersByTimeAsync(6_500);
    expect(serviceMode.isDegraded()).toBe(true);
    expect(serviceMode.isConfigStale()).toBe(true);
    mocks.isStale.mockReturnValue(false);
    await jest.advanceTimersByTimeAsync(300_000);
    expect(serviceMode.isDegraded()).toBe(false);
    expect(serviceMode.isConfigStale()).toBe(false);
    expect(mocks.workerStart).toHaveBeenCalledTimes(1);
  });

  it("worker step hits a Mongo error during recovery => exit(1)", async () => {
    const { mocks, exitSpy } = await degradedBoot();
    mocks.refreshConfig.mockResolvedValue({ ok: true });
    mocks.workerStart.mockRejectedValue(Object.assign(new Error("connect ECONNREFUSED"), { name: "MongoNetworkError" }));
    await jest.advanceTimersByTimeAsync(6_500);
    await jest.advanceTimersByTimeAsync(10);
    expect(exitSpy).toHaveBeenCalledWith(1);
  });
});
