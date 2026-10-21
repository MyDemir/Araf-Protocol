"use strict";

// B4-05: app.js zamanlayıcısı DLQ/relayer işlerini Redis kilidi altında çalıştırır; Redis hatasında ya da
// kilit başka makinedeyken iş çalışmaz (fail-closed).

const express = require("express");
const { lockKey } = require("../../backend/scripts/services/jobLock");

const ADDR = "0x" + "a".repeat(40);
const ROUTES = ["logs", "auth", "orders", "trades", "pii", "feedback", "stats", "receipts", "admin", "referenceRates", "rewards", "socialLinks"];

async function boot(redisClient) {
  jest.resetModules();
  jest.useFakeTimers({ doNotFake: ["nextTick", "setImmediate"] });
  process.env.PORT = "0";
  process.env.ARAF_ESCROW_ADDRESS = ADDR;
  process.env.EXPECTED_CHAIN_ID = "84532";
  process.env.ESCROW_REGISTRY_GUARD_MODE = "warn";

  const processDLQ = jest.fn(async () => ({ success: true }));
  jest.doMock("../../backend/scripts/config/db", () => ({ connectDB: jest.fn(async () => {}), setAllowProcessExitOnDisconnect: jest.fn() }));
  jest.doMock("../../backend/scripts/config/redis", () => ({
    connectRedis: jest.fn(async () => {}), closeRedis: jest.fn(async () => {}), isReady: () => true,
    getRedisClient: () => redisClient,
  }));
  jest.doMock("../../backend/scripts/services/eventListener", () => ({
    isRunning: false, provider: null, _state: "stopped", start: jest.fn(async () => {}), stop: jest.fn(async () => {}),
    startInBackground: jest.fn(() => Promise.resolve()), getLivenessSnapshot: () => ({ stale: false, state: "stopped", lastBlockAgeMs: null }),
    runReconciliationReport: jest.fn(), getDiagnostics: () => null,
  }));
  jest.doMock("../../backend/scripts/services/protocolConfig", () => ({
    loadProtocolConfig: jest.fn(async () => {}), refreshProtocolConfig: jest.fn(async () => {}), loadStaleProtocolConfig: jest.fn(async () => null), isProtocolConfigStale: () => false,
  }));
  jest.doMock("../../backend/scripts/services/encryption", () => ({
    clearMasterKeyCache: jest.fn(), runProductionKmsStartupSelfTest: jest.fn(async () => ({ ok: true })), blockKeyLoadingUntilSelfTest: jest.fn(),
  }));
  jest.doMock("../../backend/scripts/services/identityNormalizationGuard", () => ({ verifyIdentityNormalization: jest.fn(async () => true) }));
  jest.doMock("../../backend/scripts/services/dlqProcessor", () => ({ processDLQ }));
  jest.doMock("../../backend/scripts/services/referenceTicker", () => ({ refreshReferenceTicker: jest.fn(async () => ({ success: true })), runReferenceTickerJob: jest.fn(async () => ({ success: true })) }));
  for (const j of ["reputationDecay", "rewardOutcomeRecorder", "statsSnapshot", "cleanupSensitiveData", "cleanupUserBankRiskMetadata"]) {
    jest.doMock(`../../backend/scripts/jobs/${j}`, () => new Proxy({}, { get: () => jest.fn(async () => ({ success: true })) }));
  }
  jest.doMock("../../backend/scripts/services/escrowRegistryGuard", () => {
    const real = jest.requireActual("../../backend/scripts/services/escrowRegistryGuard");
    const doc = { _id: "active", escrow_address: ADDR, chain_id: 84532, deploy_block: 1, state: "ACTIVE" };
    return { ...real, ...real.createEscrowRegistryGuard({ readActive: async () => doc }) };
  });
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
  jest.spyOn(process, "exit").mockImplementation(() => undefined);

  require("../../backend/scripts/app");
  await jest.advanceTimersByTimeAsync(50);
  return { processDLQ };
}

describe("app scheduler distributed job lock (B4-05)", () => {
  const savedEnv = { ...process.env };
  afterEach(() => {
    jest.useRealTimers();
    jest.restoreAllMocks();
    process.env = { ...savedEnv };
  });

  it("Redis SET hata verirse DLQ işi o turda ÇALIŞMAZ (fail-closed)", async () => {
    const redis = { set: jest.fn(async () => { throw new Error("ECONNREFUSED"); }), eval: jest.fn(), get: jest.fn(async () => null) };
    const { processDLQ } = await boot(redis);
    await jest.advanceTimersByTimeAsync(61_000);
    expect(redis.set).toHaveBeenCalled();
    expect(processDLQ).not.toHaveBeenCalled();
  });

  it("kilit başka makinede tutuluyorsa iş çalışmaz", async () => {
    const redis = { set: jest.fn(async () => null), eval: jest.fn(), get: jest.fn(async () => null) };
    const { processDLQ } = await boot(redis);
    await jest.advanceTimersByTimeAsync(61_000);
    expect(processDLQ).not.toHaveBeenCalled();
  });

  it("kilit alınırsa iş çalışır ve bitince token ile bırakılır", async () => {
    const redis = { set: jest.fn(async () => "OK"), eval: jest.fn(async () => 1), get: jest.fn(async () => null) };
    const { processDLQ } = await boot(redis);
    await jest.advanceTimersByTimeAsync(61_000);
    expect(processDLQ).toHaveBeenCalledTimes(1);
    const [key, token, opts] = redis.set.mock.calls.find((c) => c[0] === lockKey("dlq"));
    expect(key).toBe(lockKey("dlq"));
    expect(typeof token).toBe("string");
    expect(token.length).toBeGreaterThanOrEqual(16);
    expect(opts).toMatchObject({ NX: true });
    const releaseCall = redis.eval.mock.calls.find((c) => c[1].arguments[0] === token);
    expect(releaseCall).toBeDefined();
  });
});
