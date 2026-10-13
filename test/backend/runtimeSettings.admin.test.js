"use strict";

const express = require("express");
const request = require("supertest");
const cookieParser = require("cookie-parser");

const USER = "0x1111111111111111111111111111111111111111";
const OTHER = "0x2222222222222222222222222222222222222222";
const ADMIN = "0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa";
const ENV_KEYS = ["LIVE_POLL_INTERVAL_MS", "WORKER_BLOCK_BATCH_SIZE", "WORKER_REPLAY_BATCH_DELAY_MS"];

function makeFakes() {
  const store = { setting: null, audit: [], failAudit: false, failRead: false, conflictOnce: false };
  const Setting = {
    findOne: jest.fn(() => ({
      lean: async () => {
        if (store.failRead) throw new Error("db down");
        return store.setting ? JSON.parse(JSON.stringify(store.setting)) : null;
      },
    })),
    updateOne: jest.fn(async (filter, update, opts = {}) => {
      if (store.conflictOnce) {
        store.conflictOnce = false;
        return { matchedCount: 0 };
      }
      const cur = store.setting;
      if (!cur) {
        if (!opts.upsert) return { matchedCount: 0 };
        store.setting = { key: filter.key, values: {}, version: 0 };
      } else if (filter.version !== undefined && filter.version !== cur.version) {
        return { matchedCount: 0 };
      }
      for (const [path, val] of Object.entries(update.$set || {})) {
        if (path.startsWith("values.")) store.setting.values[path.slice(7)] = val;
      }
      for (const path of Object.keys(update.$unset || {})) delete store.setting.values[path.slice(7)];
      store.setting.version += (update.$inc || {}).version || 0;
      return { matchedCount: 1 };
    }),
  };
  const Audit = {
    create: jest.fn(async (doc) => {
      if (store.failAudit) throw new Error("audit down");
      store.audit.push({ _id: `id${store.audit.length}`, ...doc });
      return doc;
    }),
    find: jest.fn(() => {
      let rows = [...store.audit].reverse();
      const chain = {
        sort: () => chain,
        skip: (n) => { rows = rows.slice(n); return chain; },
        limit: (n) => { rows = rows.slice(0, n); return chain; },
        lean: async () => rows,
      };
      return chain;
    }),
    countDocuments: jest.fn(async () => store.audit.length),
  };
  return { store, Setting, Audit };
}

function build() {
  jest.resetModules();
  process.env.ADMIN_WALLETS = ADMIN;
  ENV_KEYS.forEach((k) => delete process.env[k]);
  const fakes = makeFakes();
  // Bağlantı "hazır" varsay (servis bağlantı yokken DB'ye hiç gitmez).
  Object.defineProperty(require("mongoose").connection, "readyState", { value: 1, configurable: true });

  jest.doMock("../../backend/scripts/services/siwe", () => ({
    verifyJWT: jest.fn((token) => {
      if (token === "good") return { type: "auth", sub: USER, jti: "j1" };
      if (token === "admin") return { type: "auth", sub: ADMIN, jti: "j2" };
      throw new Error("invalid");
    }),
    isJWTBlacklisted: jest.fn().mockResolvedValue(false),
    revokeRefreshToken: jest.fn().mockResolvedValue(),
    blacklistJWT: jest.fn().mockResolvedValue(),
    generateNonce: jest.fn(), verifySiweSignature: jest.fn(), getSiweConfig: jest.fn(),
    issueJWT: jest.fn(), issueRefreshToken: jest.fn(), rotateRefreshToken: jest.fn(),
  }));
  jest.doMock("../../backend/scripts/middleware/rateLimiter", () => new Proxy({}, { get: () => (_req, _res, next) => next() }));
  jest.doMock("../../backend/scripts/models/RuntimeSetting", () => fakes.Setting);
  jest.doMock("../../backend/scripts/models/RuntimeSettingAudit", () => fakes.Audit);
  for (const m of ["PaymentRailSetting", "PaymentRailAudit", "Feedback", "HistoricalStat", "RevenueEvent", "RewardEpoch", "RewardFunding", "RewardClaim"]) {
    jest.doMock(`../../backend/scripts/models/${m}`, () => ({}));
  }
  jest.doMock("../../backend/scripts/models/User", () => ({}));
  jest.doMock("../../backend/scripts/models/Trade", () => ({}));
  jest.doMock("../../backend/scripts/services/health", () => ({ getReadiness: jest.fn() }));
  jest.doMock("../../backend/scripts/services/dlqProcessor", () => ({ getDlqMetrics: jest.fn() }));
  jest.doMock("../../backend/scripts/services/eventListener", () => ({ provider: null }));
  jest.doMock("../../backend/scripts/config/redis", () => ({ getRedisClient: jest.fn(() => null), isReady: () => false }));
  jest.doMock("../../backend/scripts/services/encryption", () => ({
    hmacDigest: jest.fn(async (purpose, v) => `h:${purpose}:${String(v).length}`),
  }));

  const app = express();
  app.use(express.json());
  app.use(cookieParser());
  app.use("/api/admin", require("../../backend/scripts/routes/admin"));
  app.use((err, _req, res, _next) => res.status(500).json({ error: err.message }));
  const svc = require("../../backend/scripts/services/runtimeSettings");
  return { app, svc, ...fakes };
}

const as = (req, token = "admin", wallet = ADMIN, withHeader = true) => {
  req.set("Cookie", [`araf_jwt=${token}`]);
  return withHeader ? req.set("x-wallet-address", wallet) : req;
};

afterEach(() => {
  ENV_KEYS.forEach((k) => delete process.env[k]);
  jest.resetModules();
});

describe("admin runtime settings API", () => {
  it("authorization matrix: 401 anonymous, 403 non-admin, 401 without CSRF header", async () => {
    const { app, store } = build();
    expect((await request(app).get("/api/admin/runtime-settings")).status).toBe(401);
    expect((await as(request(app).get("/api/admin/runtime-settings"), "good", USER)).status).toBe(403);
    expect((await as(request(app).put("/api/admin/runtime-settings/LIVE_POLL_INTERVAL_MS").send({ value: 20000 }), "good", USER)).status).toBe(403);
    expect((await as(request(app).put("/api/admin/runtime-settings/LIVE_POLL_INTERVAL_MS").send({ value: 20000 }), "admin", ADMIN, false)).status).toBe(401);
    expect((await as(request(app).put("/api/admin/runtime-settings/LIVE_POLL_INTERVAL_MS").send({ value: 20000 }), "admin", OTHER)).status).toBe(409);
    expect(store.setting).toBeNull();
    const ok = await as(request(app).get("/api/admin/runtime-settings"));
    expect(ok.status).toBe(200);
    expect(ok.body.settings.map((s) => s.key)).toEqual(ENV_KEYS);
  });

  it("rejects out-of-range, non-integer, unknown, malformed bodies with 400", async () => {
    const { app, store } = build();
    const put = (key, body) => as(request(app).put(`/api/admin/runtime-settings/${key}`).send(body));
    expect((await put("LIVE_POLL_INTERVAL_MS", { value: 4999 })).status).toBe(400);
    expect((await put("LIVE_POLL_INTERVAL_MS", { value: 300001 })).status).toBe(400);
    expect((await put("WORKER_BLOCK_BATCH_SIZE", { value: 0 })).status).toBe(400);
    expect((await put("WORKER_BLOCK_BATCH_SIZE", { value: 2001 })).status).toBe(400);
    expect((await put("WORKER_REPLAY_BATCH_DELAY_MS", { value: -1 })).status).toBe(400);
    expect((await put("WORKER_REPLAY_BATCH_DELAY_MS", { value: 10001 })).status).toBe(400);
    expect((await put("WORKER_BLOCK_BATCH_SIZE", { value: 10.5 })).status).toBe(400);
    expect((await put("WORKER_BLOCK_BATCH_SIZE", { value: "10" })).status).toBe(400);
    expect((await put("WORKER_BLOCK_BATCH_SIZE", {})).status).toBe(400);
    expect((await put("WORKER_BLOCK_BATCH_SIZE", { value: 10, reset: true })).status).toBe(400);
    expect((await put("WORKER_BLOCK_BATCH_SIZE", { value: 10, evil: 1 })).status).toBe(400);
    expect((await put("WORKER_BLOCK_BATCH_SIZE", { value: 10, reason: "x".repeat(301) })).status).toBe(400);
    // RPC URL'leri ve finality asla ayarlanamaz
    for (const k of ["BASE_RPC_URL", "BASE_RPC_URL_FALLBACKS", "WORKER_FINALITY_DEPTH", "EXPECTED_CHAIN_ID", "ADMIN_WALLETS"]) {
      expect((await put(k, { value: 5 })).status).toBe(400);
    }
    expect(store.audit).toHaveLength(0);
    expect(store.setting).toBeNull();
  });

  it("accepts boundary values, writes audit with hashed ip, and resets to env", async () => {
    const { app, store } = build();
    const put = (key, body) => as(request(app).put(`/api/admin/runtime-settings/${key}`).send(body));
    expect((await put("LIVE_POLL_INTERVAL_MS", { value: 5000 })).status).toBe(200);
    expect((await put("LIVE_POLL_INTERVAL_MS", { value: 300000 })).status).toBe(200);
    expect((await put("WORKER_REPLAY_BATCH_DELAY_MS", { value: 0 })).status).toBe(200);
    const res = await put("WORKER_BLOCK_BATCH_SIZE", { value: 10, reason: "alchemy free" });
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ key: "WORKER_BLOCK_BATCH_SIZE", previousValue: null, value: 10, changed: true });
    const last = store.audit[store.audit.length - 1];
    expect(last).toMatchObject({ setting: "WORKER_BLOCK_BATCH_SIZE", previous_value: null, new_value: 10, admin_wallet: ADMIN, reason: "alchemy free" });
    expect(last.ip_hash).toMatch(/^h:admin-audit-ip:/);

    const reset = await put("WORKER_BLOCK_BATCH_SIZE", { reset: true, reason: "back to env" });
    expect(reset.status).toBe(200);
    expect(reset.body).toMatchObject({ previousValue: 10, value: null, changed: true });
    expect(store.setting.values.WORKER_BLOCK_BATCH_SIZE).toBeUndefined();

    const audit = await as(request(app).get("/api/admin/runtime-settings/audit?page=1&limit=2"));
    expect(audit.status).toBe(200);
    expect(audit.body).toMatchObject({ total: 5, page: 1, limit: 2 });
    expect(audit.body.items[0]).toMatchObject({ setting: "WORKER_BLOCK_BATCH_SIZE", newValue: null, previousValue: 10 });
  });

  it("409 on stale expectedVersion and on concurrent write; nothing audited", async () => {
    const { app, store } = build();
    const put = (body) => as(request(app).put("/api/admin/runtime-settings/WORKER_BLOCK_BATCH_SIZE").send(body));
    expect((await put({ value: 10 })).status).toBe(200); // version 1
    const stale = await put({ value: 20, expectedVersion: 0 });
    expect(stale.status).toBe(409);
    expect(stale.body.code).toBe("RUNTIME_SETTING_CONFLICT");
    expect((await put({ value: 20, expectedVersion: 1 })).status).toBe(200);
    store.conflictOnce = true;
    const before = store.audit.length;
    expect((await put({ value: 30 })).status).toBe(409);
    expect(store.audit).toHaveLength(before);
    expect(store.setting.values.WORKER_BLOCK_BATCH_SIZE.value).toBe(20);
  });

  it("audit failure rolls the change back (version-conditional) and returns 500", async () => {
    const { app, store } = build();
    const put = (body) => as(request(app).put("/api/admin/runtime-settings/WORKER_BLOCK_BATCH_SIZE").send(body));
    expect((await put({ value: 10 })).status).toBe(200);
    store.failAudit = true;
    const res = await put({ value: 99 });
    expect(res.status).toBe(500);
    expect(res.body.code).toBe("RUNTIME_SETTING_AUDIT_FAILED");
    expect(store.setting.values.WORKER_BLOCK_BATCH_SIZE.value).toBe(10);

    // override yokken: geri alma anahtarı siler
    const other = await as(request(app).put("/api/admin/runtime-settings/LIVE_POLL_INTERVAL_MS").send({ value: 60000 }));
    expect(other.status).toBe(500);
    expect(store.setting.values.LIVE_POLL_INTERVAL_MS).toBeUndefined();
  });

  it("audit failure + concurrent writer: rollback does not clobber, reports conflict", async () => {
    const { app, store, Audit } = build();
    store.failAudit = false;
    Audit.create.mockImplementationOnce(async () => {
      // audit sırasında başka admin yazar (version ilerler)
      store.setting.version += 1;
      store.setting.values.WORKER_BLOCK_BATCH_SIZE = { value: 77 };
      throw new Error("audit down");
    });
    const res = await as(request(app).put("/api/admin/runtime-settings/WORKER_BLOCK_BATCH_SIZE").send({ value: 10 }));
    expect(res.status).toBe(409);
    expect(store.setting.values.WORKER_BLOCK_BATCH_SIZE.value).toBe(77);
  });
});

describe("runtime settings precedence and fail-open", () => {
  it("admin > env > default, with source reported", async () => {
    const { svc, store } = build();
    let eff = await svc.getEffectiveSettings();
    expect(eff.settings.WORKER_BLOCK_BATCH_SIZE).toMatchObject({ value: 1000, source: "default", envValue: null, adminValue: null });

    process.env.WORKER_BLOCK_BATCH_SIZE = "50";
    svc.invalidateCache();
    eff = await svc.getEffectiveSettings();
    expect(eff.settings.WORKER_BLOCK_BATCH_SIZE).toMatchObject({ value: 50, source: "env", envValue: 50 });

    await svc.setSetting("WORKER_BLOCK_BATCH_SIZE", 7, { wallet: ADMIN });
    eff = await svc.getEffectiveSettings();
    expect(eff.settings.WORKER_BLOCK_BATCH_SIZE).toMatchObject({ value: 7, source: "admin", envValue: 50, adminValue: 7 });

    await svc.setSetting("WORKER_BLOCK_BATCH_SIZE", null, { wallet: ADMIN });
    eff = await svc.getEffectiveSettings();
    expect(eff.settings.WORKER_BLOCK_BATCH_SIZE).toMatchObject({ value: 50, source: "env" });
    expect(store.audit).toHaveLength(2);
  });

  it("env values are clamped to bounds; garbage env falls back to default", async () => {
    const { svc } = build();
    process.env.WORKER_BLOCK_BATCH_SIZE = "999999";
    process.env.LIVE_POLL_INTERVAL_MS = "100";
    process.env.WORKER_REPLAY_BATCH_DELAY_MS = "abc";
    svc.invalidateCache();
    const v = await svc.getEffectiveValues();
    expect(v).toEqual({ LIVE_POLL_INTERVAL_MS: 5000, WORKER_BLOCK_BATCH_SIZE: 2000, WORKER_REPLAY_BATCH_DELAY_MS: 250 });
  });

  it("DB failure: last known admin value, then env/default; out-of-range stored value is ignored", async () => {
    const { svc, store } = build();
    await svc.setSetting("LIVE_POLL_INTERVAL_MS", 40000, { wallet: ADMIN });
    expect((await svc.getEffectiveValues()).LIVE_POLL_INTERVAL_MS).toBe(40000);
    store.failRead = true;
    svc.invalidateCache();
    const eff = await svc.getEffectiveSettings();
    expect(eff).toMatchObject({ degraded: true, source: "last_known" });
    expect(eff.settings.LIVE_POLL_INTERVAL_MS.value).toBe(40000);

    const fresh = build();
    fresh.store.failRead = true;
    expect((await fresh.svc.getEffectiveValues()).LIVE_POLL_INTERVAL_MS).toBe(15000);

    const bad = build();
    bad.store.setting = { key: "runtime_settings", version: 3, values: { LIVE_POLL_INTERVAL_MS: { value: 1 } } };
    expect((await bad.svc.getEffectiveValues()).LIVE_POLL_INTERVAL_MS).toBe(15000);
  });

  it("caches reads for the TTL (15s)", async () => {
    const { svc, Setting } = build();
    await svc.getEffectiveSettings();
    await svc.getEffectiveSettings();
    expect(Setting.findOne).toHaveBeenCalledTimes(1);
  });
});
