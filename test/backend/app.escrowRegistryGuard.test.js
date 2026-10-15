"use strict";

const express = require("express");
const request = require("supertest");

const ROUTES = ["logs", "auth", "orders", "trades", "pii", "feedback", "stats", "receipts", "admin", "referenceRates", "rewards", "socialLinks"];
const ADDR = "0x" + "a".repeat(40);
const OTHER = "0x" + "b".repeat(40);
const goodDoc = { _id: "active", escrow_address: ADDR, chain_id: 84532, deploy_block: 1, state: "ACTIVE" };

async function boot({ mode, doc, readError = false } = {}) {
  jest.resetModules();
  jest.useFakeTimers({ doNotFake: ["nextTick", "setImmediate"] });
  process.env.PORT = "0";
  process.env.ARAF_ESCROW_ADDRESS = ADDR;
  process.env.EXPECTED_CHAIN_ID = "84532";
  if (mode === undefined) delete process.env.ESCROW_REGISTRY_GUARD_MODE;
  else process.env.ESCROW_REGISTRY_GUARD_MODE = mode;

  const ctl = { doc, readError };
  const mocks = {
    workerStart: jest.fn(async () => {}),
    workerStop: jest.fn(async () => {}),
    startInBackground: jest.fn(() => Promise.resolve()),
    processDLQ: jest.fn(async () => ({ success: true })),
    read: jest.fn(async () => { if (ctl.readError) throw new Error("mongo down"); return ctl.doc; }),
  };

  jest.doMock("../../backend/scripts/config/db", () => ({ connectDB: jest.fn(async () => {}), setAllowProcessExitOnDisconnect: jest.fn() }));
  jest.doMock("../../backend/scripts/config/redis", () => ({
    connectRedis: jest.fn(async () => {}), closeRedis: jest.fn(async () => {}), isReady: () => false,
    getRedisClient: () => ({ get: jest.fn(async () => null) }),
  }));
  jest.doMock("../../backend/scripts/services/eventListener", () => ({
    isRunning: false, provider: null, _state: "stopped", start: mocks.workerStart, stop: mocks.workerStop,
    startInBackground: mocks.startInBackground, getLivenessSnapshot: () => ({ stale: false, state: "stopped", lastBlockAgeMs: null }),
    runReconciliationReport: jest.fn(), getDiagnostics: () => null,
  }));
  jest.doMock("../../backend/scripts/services/protocolConfig", () => ({
    loadProtocolConfig: jest.fn(async () => {}), refreshProtocolConfig: jest.fn(async () => {}), loadStaleProtocolConfig: jest.fn(async () => null), isProtocolConfigStale: () => false,
  }));
  jest.doMock("../../backend/scripts/services/encryption", () => ({
    clearMasterKeyCache: jest.fn(), runProductionKmsStartupSelfTest: jest.fn(async () => ({ ok: true })), blockKeyLoadingUntilSelfTest: jest.fn(),
  }));
  jest.doMock("../../backend/scripts/services/identityNormalizationGuard", () => ({ verifyIdentityNormalization: jest.fn(async () => true) }));
  jest.doMock("../../backend/scripts/services/dlqProcessor", () => ({ processDLQ: mocks.processDLQ }));
  jest.doMock("../../backend/scripts/services/referenceTicker", () => ({ refreshReferenceTicker: jest.fn(async () => ({ success: true })), runReferenceTickerJob: jest.fn(async () => ({ success: true })) }));
  for (const j of ["reputationDecay", "rewardOutcomeRecorder", "statsSnapshot", "cleanupSensitiveData", "cleanupUserBankRiskMetadata"]) {
    jest.doMock(`../../backend/scripts/jobs/${j}`, () => new Proxy({}, { get: () => jest.fn(async () => ({ success: true })) }));
  }
  // Real guard logic, injected registry reader (the Mongo read is the only thing replaced).
  jest.doMock("../../backend/scripts/services/escrowRegistryGuard", () => {
    const real = jest.requireActual("../../backend/scripts/services/escrowRegistryGuard");
    return { ...real, ...real.createEscrowRegistryGuard({ readActive: mocks.read }) };
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
  const exitSpy = jest.spyOn(process, "exit").mockImplementation(() => undefined);

  const app = require("../../backend/scripts/app");
  await jest.advanceTimersByTimeAsync(50);
  return { app, mocks, ctl, exitSpy };
}

const CASES = [
  ["match", goodDoc, null],
  ["missing", null, "registry_missing"],
  ["address", { ...goodDoc, escrow_address: OTHER }, "escrow_mismatch"],
  ["chain", { ...goodDoc, chain_id: 1 }, "chain_mismatch"],
  ["rotating", { ...goodDoc, state: "ROTATING" }, "rotating"],
];

const ESCROW_ROUTES = [
  ["GET", "/api/orders"],
  ["GET", "/api/orders/config"],
  ["GET", "/api/trades/my"],
  ["GET", "/api/pii/my"],
  ["POST", "/api/receipts/upload"],
  ["GET", "/api/stats"],
  ["GET", "/api/rewards/epochs"],
  ["GET", "/api/admin/stats"],
];
const INDEPENDENT_ROUTES = [
  ["GET", "/api/auth/nonce"],
  ["POST", "/api/auth/verify"],
  ["GET", "/api/auth/me"],
  ["POST", "/api/logs/client-error"],
  ["GET", "/api/social-links"],
  ["GET", "/api/reference-rates/ticker"],
];

const call = (app, [method, url]) => request(app)[method.toLowerCase()](url);

describe("app: escrow registry guard wiring", () => {
  const savedEnv = { ...process.env };
  afterEach(() => {
    jest.useRealTimers();
    jest.restoreAllMocks();
    process.env = { ...savedEnv };
  });

  describe.each(CASES)("enforce / %s", (_n, doc, reason) => {
    it(reason ? "worker not started, escrow routes 503 ESCROW_MISMATCH, independent routes open, /health 200, /ready 503" : "everything open", async () => {
      const { app, mocks, exitSpy } = await boot({ mode: "enforce", doc });
      expect(exitSpy).not.toHaveBeenCalled();
      const health = await request(app).get("/health");
      expect(health.status).toBe(200);
      const ready = await request(app).get("/ready");

      if (!reason) {
        expect(mocks.startInBackground).toHaveBeenCalledTimes(1);
        for (const r of ESCROW_ROUTES) expect((await call(app, r)).status).toBe(200);
        expect(ready.body.escrowRegistry).toMatchObject({ mode: "enforce", ok: true, reason: null });
        return;
      }

      expect(mocks.startInBackground).not.toHaveBeenCalled();
      expect(mocks.workerStart).not.toHaveBeenCalled();
      for (const r of ESCROW_ROUTES) {
        const res = await call(app, r);
        expect([r.join(" "), res.status]).toEqual([r.join(" "), 503]);
        expect(res.body).toMatchObject({ code: "ESCROW_MISMATCH", reason });
      }
      for (const r of INDEPENDENT_ROUTES) {
        const res = await call(app, r);
        expect([r.join(" "), res.status]).toEqual([r.join(" "), 200]);
      }
      expect(ready.status).toBe(503);
      expect(ready.body.escrowRegistry).toMatchObject({ mode: "enforce", ok: false, reason });
      expect(ready.body.checks.escrowRegistry).toBe(false);
    });
  });

  describe.each(CASES)("warn / %s", (_n, doc, reason) => {
    it("closes nothing: worker started, every route reachable, /health 200; mismatch only informational in /ready", async () => {
      const { app, mocks } = await boot({ mode: "warn", doc });
      expect(mocks.startInBackground).toHaveBeenCalledTimes(1);
      for (const r of [...ESCROW_ROUTES, ...INDEPENDENT_ROUTES]) expect((await call(app, r)).status).toBe(200);
      expect((await request(app).get("/health")).status).toBe(200);
      const ready = await request(app).get("/ready");
      expect(ready.body.escrowRegistry).toMatchObject({ mode: "warn", ok: !reason, reason });
      expect(ready.body.checks.escrowRegistry).toBe(true);
      // /ready status is decided by the existing checks only (this harness has no redis/provider => 503 regardless).
      const cleanDoc = (await boot({ mode: "off", doc: null })).app;
      const readyOff = await request(cleanDoc).get("/ready");
      expect(readyOff.status).toBe(ready.status);
    });
  });

  it("default mode (env unset) behaves as warn", async () => {
    const { app, mocks } = await boot({ mode: undefined, doc: null });
    expect(mocks.startInBackground).toHaveBeenCalledTimes(1);
    expect((await call(app, ["GET", "/api/orders"])).status).toBe(200);
    const ready = await request(app).get("/ready");
    expect(ready.body.escrowRegistry).toMatchObject({ mode: "warn", ok: false, reason: "registry_missing" });
  });

  it("invalid mode behaves as warn", async () => {
    const { app } = await boot({ mode: "enfroce", doc: null });
    expect((await call(app, ["GET", "/api/orders"])).status).toBe(200);
  });

  it("off: registry is never read, nothing closed", async () => {
    const { app, mocks } = await boot({ mode: "off", doc: null });
    expect(mocks.read).not.toHaveBeenCalled();
    expect((await call(app, ["GET", "/api/orders"])).status).toBe(200);
  });

  it("enforce: registry read failure fails closed; warn: stays open", async () => {
    const e = await boot({ mode: "enforce", readError: true });
    const res = await call(e.app, ["GET", "/api/trades/my"]);
    expect(res.status).toBe(503);
    expect(res.body).toMatchObject({ code: "ESCROW_MISMATCH", reason: "registry_unreadable" });
    expect(e.mocks.startInBackground).not.toHaveBeenCalled();

    const w = await boot({ mode: "warn", readError: true });
    expect((await call(w.app, ["GET", "/api/trades/my"])).status).toBe(200);
    expect(w.mocks.startInBackground).toHaveBeenCalledTimes(1);
  });

  it("CHAIN_BOUND scheduled jobs are skipped under enforce mismatch, run otherwise", async () => {
    const blocked = await boot({ mode: "enforce", doc: null });
    await jest.advanceTimersByTimeAsync(61_000);
    expect(blocked.mocks.processDLQ).not.toHaveBeenCalled();

    const open = await boot({ mode: "warn", doc: null });
    await jest.advanceTimersByTimeAsync(61_000);
    expect(open.mocks.processDLQ).toHaveBeenCalled();
  });

  it("periodic re-check: registry fixed -> worker starts and routes reopen; registry broken -> worker stopped and routes close", async () => {
    const { app, mocks, ctl } = await boot({ mode: "enforce", doc: null });
    expect(mocks.startInBackground).not.toHaveBeenCalled();
    expect((await call(app, ["GET", "/api/orders"])).status).toBe(503);

    ctl.doc = goodDoc;
    await jest.advanceTimersByTimeAsync(60_500);
    expect(mocks.startInBackground).toHaveBeenCalledTimes(1);
    expect((await call(app, ["GET", "/api/orders"])).status).toBe(200);

    ctl.doc = { ...goodDoc, state: "ROTATING" };
    await jest.advanceTimersByTimeAsync(60_500);
    expect(mocks.workerStop).toHaveBeenCalled();
    const res = await call(app, ["GET", "/api/orders"]);
    expect(res.status).toBe(503);
    expect(res.body.reason).toBe("rotating");
  });
});
