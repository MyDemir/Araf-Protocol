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

function build({ ready = true } = {}) {
  jest.resetModules();
  process.env.ADMIN_WALLETS = ADMIN;
  ENV_KEYS.forEach((k) => delete process.env[k]);
  const fakes = makeFakes();
  // Bağlantı "hazır" varsay (servis bağlantı yokken DB'ye hiç gitmez).
  Object.defineProperty(require("mongoose").connection, "readyState", { value: ready ? 1 : 0, configurable: true });

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
  for (const m of ["PaymentRailSetting", "PaymentRailAudit", "SocialLinkSetting", "SocialLinkAudit", "Feedback", "HistoricalStat", "RevenueEvent", "RewardEpoch", "RewardFunding", "RewardClaim"]) {
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
    expect(ok.body.settings.map((s) => s.key).slice(0, 3)).toEqual(ENV_KEYS);
  });

  it("write path returns 503 immediately when the DB connection is not ready", async () => {
    const { app, Setting, Audit } = build({ ready: false });
    const res = await as(request(app).put("/api/admin/runtime-settings/WORKER_BLOCK_BATCH_SIZE").send({ value: 10 }));
    expect(res.status).toBe(503);
    expect(res.body.code).toBe("DB_UNAVAILABLE");
    expect(Setting.findOne).not.toHaveBeenCalled();
    expect(Setting.updateOne).not.toHaveBeenCalled();
    expect(Audit.create).not.toHaveBeenCalled();
    // sınır dışı değer bağlantıdan bağımsız 400 kalır
    expect((await as(request(app).put("/api/admin/runtime-settings/WORKER_BLOCK_BATCH_SIZE").send({ value: 0 }))).status).toBe(400);
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
    expect(v).toMatchObject({ LIVE_POLL_INTERVAL_MS: 5000, WORKER_BLOCK_BATCH_SIZE: 2000, WORKER_REPLAY_BATCH_DELAY_MS: 250 });
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

const NEW_KEYS = [
  "WORKER_CHECKPOINT_INTERVAL_BLOCKS", "WORKER_REPLAY_BACKOFF_BASE_MS", "WORKER_REPLAY_BACKOFF_MAX_MS",
  "WORKER_BLOCK_STALE_MS", "WORKER_WATCHDOG_INTERVAL_MS", "WORKER_LIVENESS_STALE_MS", "WORKER_MAX_LAG_BLOCKS",
  "READY_CACHE_TTL_MS", "MARKET_CACHE_TTL_MS", "CONFIG_CACHE_TTL_SECONDS", "RATE_LIMIT_TIER_CACHE_TTL_SECONDS",
  "REFERENCE_TICKER_CRYPTO_TTL_SECONDS", "REFERENCE_TICKER_FIAT_TTL_SECONDS",
  "REFERENCE_TICKER_LAST_GOOD_TTL_SECONDS", "REFERENCE_TICKER_MAX_STALE_SECONDS",
  "REPUTATION_DECAY_CANDIDATE_LIMIT", "REPUTATION_DECAY_TX_LIMIT",
  "REWARD_RECORDER_CANDIDATE_LIMIT", "REWARD_RECORDER_BATCH_LIMIT",
];
const CODE = (res) => res.body.code;

describe("extended runtime settings: bounds", () => {
  it("all candidates are registered; defaults satisfy bounds and every cross-field constraint", () => {
    const defs = require("../../backend/scripts/config/runtimeSettingDefs");
    for (const k of NEW_KEYS) expect(defs.isKnownSetting(k)).toBe(true);
    const { values } = defs.resolveValues({});
    for (const k of defs.SETTING_KEYS) expect(defs.isInBounds(k, values[k])).toBe(true);
    for (const c of defs.SETTING_CONSTRAINTS) expect(c.check(values)).toBe(true);
    expect(defs.SETTING_DEFS.REPUTATION_DECAY_TX_LIMIT.warning).toBeTruthy();
    expect(defs.SETTING_DEFS.REWARD_RECORDER_BATCH_LIMIT.warning).toBeTruthy();
  });

  it.each(NEW_KEYS)("%s: below min / above max / non-integer rejected with 400; default accepted", async (key) => {
    const { app, store } = build();
    const d = require("../../backend/scripts/config/runtimeSettingDefs").SETTING_DEFS[key];
    const put = (body) => as(request(app).put(`/api/admin/runtime-settings/${key}`).send(body));
    const low = await put({ value: d.min - 1 });
    expect(low.status).toBe(400);
    expect(CODE(low)).toBe("RUNTIME_SETTING_OUT_OF_RANGE");
    expect((await put({ value: d.max + 1 })).status).toBe(400);
    expect((await put({ value: d.min + 0.5 })).status).toBe(400);
    expect((await put({ value: String(d.default) })).status).toBe(400); // Joi strict
    expect(store.setting).toBeNull();
    expect((await put({ value: d.default })).status).toBe(200);
  });

  it("conservative caps on relayer tx / gas affecting limits", () => {
    const { SETTING_DEFS } = require("../../backend/scripts/config/runtimeSettingDefs");
    expect(SETTING_DEFS.REPUTATION_DECAY_TX_LIMIT.max).toBeLessThanOrEqual(100);
    expect(SETTING_DEFS.REWARD_RECORDER_BATCH_LIMIT.max).toBeLessThanOrEqual(100);
  });
});

describe("extended runtime settings: allowlist", () => {
  it.each([
    "REDIS_READY_WAIT_MS", "PAYMENT_RAILS_CACHE_TTL_MS", "IDENTITY_MIGRATION_BATCH_SIZE",
    "USER_BANK_RISK_CLEANUP_CURSOR_BATCH_SIZE", "BASE_RPC_URL", "WORKER_FINALITY_DEPTH", "EXPECTED_CHAIN_ID",
    "ADMIN_WALLETS", "__proto__", "constructor", "toString", "hasOwnProperty",
  ])("%s is not settable", async (key) => {
    const { app, store } = build();
    const res = await as(request(app).put(`/api/admin/runtime-settings/${key}`).send({ value: 5000 }));
    expect(res.status).toBe(400);
    expect(CODE(res)).toBe("RUNTIME_SETTING_UNKNOWN");
    expect(store.setting).toBeNull();
  });
});

describe("extended runtime settings: cross-field constraints (400, effective values admin > env > default)", () => {
  const put = (app, key, body) => as(request(app).put(`/api/admin/runtime-settings/${key}`).send(body));

  it("liveness must be >= 2 x block stale", async () => {
    const { app, store } = build();
    expect((await put(app, "WORKER_LIVENESS_STALE_MS", { value: 100_000 })).status).toBe(400); // 2 x 75000 = 150000
    expect((await put(app, "WORKER_LIVENESS_STALE_MS", { value: 150_000 })).status).toBe(200);
    const bad = await put(app, "WORKER_BLOCK_STALE_MS", { value: 80_000 });
    expect(bad.status).toBe(400);
    expect(CODE(bad)).toBe("RUNTIME_SETTING_CONSTRAINT");
    expect(store.setting.values.WORKER_BLOCK_STALE_MS).toBeUndefined();
    expect((await put(app, "WORKER_LIVENESS_STALE_MS", { value: 300_000 })).status).toBe(200);
    expect((await put(app, "WORKER_BLOCK_STALE_MS", { value: 120_000 })).status).toBe(200);
  });

  it("constraints use env values too", async () => {
    const { app } = build();
    process.env.WORKER_BLOCK_STALE_MS = "200000";
    try {
      const res = await put(app, "WORKER_LIVENESS_STALE_MS", { value: 300_000 });
      expect(res.status).toBe(400);
      expect(CODE(res)).toBe("RUNTIME_SETTING_CONSTRAINT");
      expect((await put(app, "WORKER_LIVENESS_STALE_MS", { value: 400_000 })).status).toBe(200);
    } finally {
      delete process.env.WORKER_BLOCK_STALE_MS;
    }
  });

  it("liveness default follows block stale (2x + 30s) when not overridden", async () => {
    const { svc } = build();
    await svc.setSetting("WORKER_BLOCK_STALE_MS", 300_000, { wallet: ADMIN });
    // block stale 300000 >= 3 x poll 15000 ok; liveness (default source) = 630000
    const v = await svc.getEffectiveValues();
    expect(v.WORKER_LIVENESS_STALE_MS).toBe(630_000);
  });

  it("replay backoff base must be <= max", async () => {
    const { app } = build();
    expect((await put(app, "WORKER_REPLAY_BACKOFF_BASE_MS", { value: 60_000 })).status).toBe(200); // max default 300000
    const res = await put(app, "WORKER_REPLAY_BACKOFF_MAX_MS", { value: 30_000 });
    expect(res.status).toBe(400);
    expect(CODE(res)).toBe("RUNTIME_SETTING_CONSTRAINT");
    expect((await put(app, "WORKER_REPLAY_BACKOFF_MAX_MS", { value: 60_000 })).status).toBe(200);
    expect((await put(app, "WORKER_REPLAY_BACKOFF_BASE_MS", { value: 60_001 })).status).toBe(400);
  });

  it("block stale must be >= 3 x live poll interval", async () => {
    const { app } = build();
    expect((await put(app, "LIVE_POLL_INTERVAL_MS", { value: 60_000 })).status).toBe(200); // poll changes stay unblocked
    const res = await put(app, "WORKER_BLOCK_STALE_MS", { value: 100_000 }); // needs >= 180000
    expect(res.status).toBe(400);
    expect(CODE(res)).toBe("RUNTIME_SETTING_CONSTRAINT");
    expect((await put(app, "WORKER_BLOCK_STALE_MS", { value: 180_000 })).status).toBe(200);
  });

  it("reset (back to env/default) that would violate a constraint is rejected", async () => {
    const { app } = build();
    expect((await put(app, "WORKER_BLOCK_STALE_MS", { value: 45_000 })).status).toBe(200);
    expect((await put(app, "WORKER_LIVENESS_STALE_MS", { value: 90_000 })).status).toBe(200);
    const res = await put(app, "WORKER_BLOCK_STALE_MS", { reset: true }); // default 75000 -> liveness 90000 < 150000
    expect(res.status).toBe(400);
  });

  it("ticker: last-good TTL >= max stale; fiat TTL <= max stale", async () => {
    const { app } = build();
    expect((await put(app, "REFERENCE_TICKER_MAX_STALE_SECONDS", { value: 700_000 })).status).toBe(400); // last-good 604800 < 700000
    expect((await put(app, "REFERENCE_TICKER_LAST_GOOD_TTL_SECONDS", { value: 3_600 })).status).toBe(400); // < max stale 86400
    expect((await put(app, "REFERENCE_TICKER_MAX_STALE_SECONDS", { value: 3_600 })).status).toBe(400); // fiat 21600 > 3600
    expect((await put(app, "REFERENCE_TICKER_FIAT_TTL_SECONDS", { value: 3_600 })).status).toBe(200);
    expect((await put(app, "REFERENCE_TICKER_MAX_STALE_SECONDS", { value: 3_600 })).status).toBe(200);
    expect((await put(app, "REFERENCE_TICKER_LAST_GOOD_TTL_SECONDS", { value: 3_600 })).status).toBe(200);
    expect((await put(app, "REFERENCE_TICKER_FIAT_TTL_SECONDS", { value: 7_200 })).status).toBe(400);
  });

  it("unrelated edits are not blocked by an unrelated violated constraint", async () => {
    const { app, store } = build();
    store.setting = { key: "runtime_settings", version: 1, values: { WORKER_LIVENESS_STALE_MS: { value: 60_000 } } };
    expect((await put(app, "READY_CACHE_TTL_MS", { value: 6_000 })).status).toBe(200);
  });
});

describe("extended runtime settings: applied while running (no restart)", () => {
  it("GET lists group, source and cost warning for new keys", async () => {
    const { app, svc } = build();
    await svc.setSetting("REPUTATION_DECAY_TX_LIMIT", 10, { wallet: ADMIN });
    const res = await as(request(app).get("/api/admin/runtime-settings"));
    const item = res.body.settings.find((s) => s.key === "REPUTATION_DECAY_TX_LIMIT");
    expect(item).toMatchObject({ group: "jobs", source: "admin", value: 10, unit: "tx" });
    expect(item.warning.TR).toMatch(/gas/);
  });

  it("sync reader (cache TTL) sees the admin value right after the change and falls back after reset", async () => {
    const { svc } = build();
    const { runtimeValueSync } = require("../../backend/scripts/utils/runtimeValue");
    expect(runtimeValueSync("READY_CACHE_TTL_MS")).toBe(7000);
    await svc.setSetting("READY_CACHE_TTL_MS", 9_000, { wallet: ADMIN });
    expect(runtimeValueSync("READY_CACHE_TTL_MS")).toBe(9_000);
    await svc.setSetting("READY_CACHE_TTL_MS", null, { wallet: ADMIN });
    expect(runtimeValueSync("READY_CACHE_TTL_MS")).toBe(7_000);
  });

  it("getCachedValue never queries the DB per call; unknown keys throw", async () => {
    const { svc, Setting } = build();
    for (let i = 0; i < 20; i += 1) svc.getCachedValue("MARKET_CACHE_TTL_MS");
    await svc.getEffectiveSettings();
    for (let i = 0; i < 20; i += 1) svc.getCachedValue("MARKET_CACHE_TTL_MS");
    expect(Setting.findOne.mock.calls.length).toBeLessThanOrEqual(2);
    expect(() => svc.getCachedValue("REDIS_READY_WAIT_MS")).toThrow();
  });

  it("job limit: reward recorder batch size follows the admin value on the next run", async () => {
    const { Setting, Audit } = build();
    const chain = (rows) => { const q = { select: () => q, sort: () => q, limit: jest.fn(() => q), lean: async () => rows }; return q; };
    const rows = [1, 2, 3, 4, 5].map((n) => ({ onchain_escrow_id: String(n) }));
    const q = chain(rows);
    jest.doMock("../../backend/scripts/models/Trade", () => ({ find: () => q, updateMany: jest.fn().mockResolvedValue({}) }));
    jest.doMock("../../backend/scripts/utils/logger", () => ({ info: jest.fn(), warn: jest.fn(), error: jest.fn() }));
    jest.doMock("../../backend/scripts/models/RuntimeSetting", () => Setting);
    jest.doMock("../../backend/scripts/models/RuntimeSettingAudit", () => Audit);
    jest.resetModules();
    Object.defineProperty(require("mongoose").connection, "readyState", { value: 1, configurable: true });
    const svc = require("../../backend/scripts/services/runtimeSettings");
    const { runRewardOutcomeRecorder } = require("../../backend/scripts/jobs/rewardOutcomeRecorder");
    const contract = () => ({
      epochDuration: async () => 604800n, claimDelay: async () => 86400n,
      recordTradeOutcomes: jest.fn().mockResolvedValue({ hash: "0x1", wait: async () => ({ blockNumber: 1 }) }),
    });
    const c1 = contract();
    await runRewardOutcomeRecorder({ contract: c1 });
    expect(c1.recordTradeOutcomes).toHaveBeenCalledWith([1n, 2n, 3n, 4n, 5n]);
    expect(q.limit).toHaveBeenLastCalledWith(200);

    await svc.setSetting("REWARD_RECORDER_BATCH_LIMIT", 2, { wallet: ADMIN });
    await svc.setSetting("REWARD_RECORDER_CANDIDATE_LIMIT", 10, { wallet: ADMIN });
    const c2 = contract();
    await runRewardOutcomeRecorder({ contract: c2 });
    expect(c2.recordTradeOutcomes).toHaveBeenCalledWith([1n, 2n]);
    expect(q.limit).toHaveBeenLastCalledWith(10);
  });
});

describe("env visibility: startup warnings and constraintViolations", () => {
  const ENVS = ["WORKER_BLOCK_STALE_MS", "WORKER_LIVENESS_STALE_MS", "READY_CACHE_TTL_MS", "WORKER_MAX_LAG_BLOCKS", "MARKET_CACHE_TTL_MS"];
  afterEach(() => ENVS.forEach((k) => delete process.env[k]));

  function loadWithLogger() {
    const logger = { info: jest.fn(), warn: jest.fn(), error: jest.fn() };
    const fakes = makeFakes();
    jest.resetModules();
    jest.doMock("../../backend/scripts/utils/logger", () => logger);
    jest.doMock("../../backend/scripts/models/RuntimeSetting", () => fakes.Setting);
    jest.doMock("../../backend/scripts/models/RuntimeSettingAudit", () => fakes.Audit);
    return { logger, fakes };
  }

  it("warns once at startup for clamped and non-integer env values; no per-read spam", async () => {
    const { logger } = loadWithLogger();
    process.env.READY_CACHE_TTL_MS = "99999"; // clamped to 10000
    process.env.WORKER_MAX_LAG_BLOCKS = "abc"; // not an integer
    process.env.MARKET_CACHE_TTL_MS = "5000"; // fine: no warning
    const svc = require("../../backend/scripts/services/runtimeSettings");
    const msgs = logger.warn.mock.calls.map((c) => c[0]);
    expect(msgs.some((m) => m.includes("READY_CACHE_TTL_MS") && m.includes("99999") && m.includes("10000"))).toBe(true);
    expect(msgs.some((m) => m.includes("WORKER_MAX_LAG_BLOCKS") && m.includes("abc"))).toBe(true);
    expect(msgs.some((m) => m.includes("MARKET_CACHE_TTL_MS"))).toBe(false);
    const before = logger.warn.mock.calls.length;
    await svc.getEffectiveValues();
    await svc.getEffectiveValues();
    expect(logger.warn.mock.calls.filter((c) => /sınır dışı|tam sayı değil/.test(c[0])).length).toBe(before);
  });

  it("warns at startup when env values violate a cross-field constraint", () => {
    const { logger } = loadWithLogger();
    process.env.WORKER_BLOCK_STALE_MS = "200000";
    process.env.WORKER_LIVENESS_STALE_MS = "250000"; // < 2 x 200000
    require("../../backend/scripts/services/runtimeSettings");
    const msgs = logger.warn.mock.calls.map((c) => c[0]);
    expect(msgs.some((m) => m.includes("liveness_vs_block_stale"))).toBe(true);
  });

  it("no startup warnings with a clean environment", () => {
    const { logger } = loadWithLogger();
    require("../../backend/scripts/services/runtimeSettings");
    expect(logger.warn).not.toHaveBeenCalled();
  });

  it("GET returns constraintViolations per setting and constraint hints", async () => {
    const { app } = build();
    process.env.WORKER_BLOCK_STALE_MS = "200000";
    process.env.WORKER_LIVENESS_STALE_MS = "250000";
    const res = await as(request(app).get("/api/admin/runtime-settings"));
    const by = Object.fromEntries(res.body.settings.map((s) => [s.key, s]));
    expect(by.WORKER_LIVENESS_STALE_MS.constraintViolations.length).toBe(1);
    expect(by.WORKER_BLOCK_STALE_MS.constraintViolations.length).toBe(1);
    expect(by.READY_CACHE_TTL_MS.constraintViolations).toEqual([]);
    expect(by.WORKER_LIVENESS_STALE_MS.constraints[0].EN).toMatch(/2 ×/);
  });

  it("tightened caps: reward batch <= 50, config cache <= 21600; exports follow effective values", async () => {
    const { SETTING_DEFS } = require("../../backend/scripts/config/runtimeSettingDefs");
    expect(SETTING_DEFS.REWARD_RECORDER_BATCH_LIMIT.max).toBe(50);
    expect(SETTING_DEFS.CONFIG_CACHE_TTL_SECONDS.max).toBe(21_600);
    const { svc } = build();
    await svc.setSetting("REFERENCE_TICKER_FIAT_TTL_SECONDS", 3_600, { wallet: ADMIN });
    await svc.setSetting("REFERENCE_TICKER_MAX_STALE_SECONDS", 7_200, { wallet: ADMIN });
    jest.doMock("../../backend/scripts/config/redis", () => ({ getRedisClient: jest.fn(), isReady: () => false }));
    const ticker = require("../../backend/scripts/services/referenceTicker");
    expect(ticker.MAX_STALE_SECONDS).toBe(7_200);
  });
});
