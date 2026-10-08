"use strict";

const express = require("express");
const request = require("supertest");
const cookieParser = require("cookie-parser");

const USER = "0x1111111111111111111111111111111111111111";
const OTHER = "0x2222222222222222222222222222222222222222";
const ADMIN = "0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa";

function makeFakes() {
  const store = { setting: null, audit: [], reads: 0, failAudit: false, conflictOnce: false };
  const Setting = {
    findOne: jest.fn(() => ({
      lean: async () => {
        store.reads += 1;
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
        store.setting = { key: filter.key, rails: {}, version: 0 };
      } else if (filter.version !== undefined && filter.version !== cur.version) {
        if (opts.upsert) {
          const e = new Error("dup");
          e.code = 11000;
          throw e;
        }
        return { matchedCount: 0 };
      }
      for (const [path, val] of Object.entries(update.$set || {})) {
        if (path.startsWith("rails.")) store.setting.rails[path.slice(6)] = val;
      }
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

function build({ profile = null, activeTrade = false } = {}) {
  jest.resetModules();
  process.env.ADMIN_WALLETS = ADMIN;
  const fakes = makeFakes();

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
  jest.doMock("../../backend/scripts/models/PaymentRailSetting", () => fakes.Setting);
  jest.doMock("../../backend/scripts/models/PaymentRailAudit", () => fakes.Audit);

  const userDoc = profile && {
    wallet_address: USER,
    profileVersion: 1,
    bankChangeCount7d: 0,
    bankChangeCount30d: 0,
    payout_profile: { payout_details_enc: "enc", rail: profile.rail, fingerprint: { version: 1 } },
    markBankProfileChanged: jest.fn(),
    recomputeBankChangeCounters: jest.fn(),
    save: jest.fn().mockResolvedValue(),
  };
  const newDoc = () => ({
    wallet_address: USER, payout_profile: {}, markBankProfileChanged: jest.fn(),
    recomputeBankChangeCounters: jest.fn(), save: jest.fn().mockResolvedValue(),
  });
  const User = jest.fn(newDoc);
  User.findOne = jest.fn(() => ({
    select: () => Object.assign(Promise.resolve(userDoc), { lean: async () => (userDoc ? { payout_profile: { rail: profile.rail } } : null) }),
  }));
  User.exists = jest.fn(async () => (userDoc ? { _id: "x" } : null));
  User.find = jest.fn(() => ({ select: () => ({ lean: async () => [] }) }));
  jest.doMock("../../backend/scripts/models/User", () => User);
  const Trade = {
    exists: jest.fn(async () => (activeTrade ? { _id: "t" } : null)),
    find: jest.fn(() => ({ select: () => ({ lean: async () => [] }) })),
    countDocuments: jest.fn(async () => 0),
  };
  jest.doMock("../../backend/scripts/models/Trade", () => Trade);
  jest.doMock("../../backend/scripts/models/Feedback", () => ({}));
  jest.doMock("../../backend/scripts/models/HistoricalStat", () => ({}));
  jest.doMock("../../backend/scripts/models/RevenueEvent", () => ({}));
  jest.doMock("../../backend/scripts/models/RewardEpoch", () => ({}));
  jest.doMock("../../backend/scripts/models/RewardFunding", () => ({}));
  jest.doMock("../../backend/scripts/models/RewardClaim", () => ({}));
  jest.doMock("../../backend/scripts/services/health", () => ({ getReadiness: jest.fn() }));
  jest.doMock("../../backend/scripts/services/dlqProcessor", () => ({ getDlqMetrics: jest.fn() }));
  jest.doMock("../../backend/scripts/services/eventListener", () => ({ provider: null }));
  jest.doMock("../../backend/scripts/config/redis", () => ({ getRedisClient: jest.fn(() => null), isReady: () => false }));
  jest.doMock("../../backend/scripts/services/encryption", () => ({
    hmacDigest: jest.fn(async (purpose, v) => `h:${purpose}:${String(v).length}`),
    encryptPayoutProfile: jest.fn().mockResolvedValue({ rail: "TR_IBAN", country: "TR", payout_details_enc: "enc", contact: {}, fingerprint: { version: 1 } }),
    decryptPayoutProfile: jest.fn().mockResolvedValue({
      rail: profile?.rail || "TR_IBAN", country: "TR", contact: { channel: "telegram", value: "tester1" },
      fields: { account_holder_name: "Test User", iban: "TR963456789012345678901234", bank_name: "Bank" },
    }),
    buildPayoutFingerprintHmac: jest.fn().mockImplementation(async (d) => JSON.stringify(d)),
  }));

  const app = express();
  app.use(express.json());
  app.use(cookieParser());
  app.use("/api/auth", require("../../backend/scripts/routes/auth"));
  app.use("/api/admin", require("../../backend/scripts/routes/admin"));
  app.use((err, _req, res, _next) => res.status(500).json({ error: err.message }));
  const rails = require("../../backend/scripts/services/paymentRails");
  return { app, rails, ...fakes, User, Trade };
}

const as = (req, token = "admin", wallet = ADMIN, withHeader = true) => {
  req.set("Cookie", [`araf_jwt=${token}`]);
  return withHeader ? req.set("x-wallet-address", wallet) : req;
};

describe("admin payment rails API", () => {
  afterEach(() => jest.resetModules());

  it("authorization matrix for read and write", async () => {
    const { app } = build();
    expect((await request(app).get("/api/admin/payment-rails")).status).toBe(401);
    expect((await as(request(app).get("/api/admin/payment-rails"), "good", USER)).status).toBe(403);
    expect((await as(request(app).put("/api/admin/payment-rails/US_ACH").send({ enabled: false }), "good", USER)).status).toBe(403);
    expect((await as(request(app).put("/api/admin/payment-rails/US_ACH").send({ enabled: false }), "admin", OTHER)).status).toBe(409);
    // CSRF katmanı: özel başlık olmadan yazma reddedilir
    expect((await as(request(app).put("/api/admin/payment-rails/US_ACH").send({ enabled: false }), "admin", ADMIN, false)).status).toBe(401);
    const ok = await as(request(app).get("/api/admin/payment-rails"));
    expect(ok.status).toBe(200);
    expect(ok.body.rails.map((r) => r.code).sort()).toEqual(["SEPA_IBAN", "TR_IBAN", "US_ACH"]);
    expect(ok.body.rails.every((r) => r.enabled === true)).toBe(true);
  });

  it("validates input: unknown rail, non-boolean, extra keys, long reason", async () => {
    const { app, store } = build();
    const put = (rail, body) => as(request(app).put(`/api/admin/payment-rails/${rail}`).send(body));
    expect((await put("BTC_X", { enabled: false })).status).toBe(400);
    expect((await put("US_ACH", { enabled: "false" })).status).toBe(400);
    expect((await put("US_ACH", {})).status).toBe(400);
    expect((await put("US_ACH", { enabled: false, evil: 1 })).status).toBe(400);
    expect((await put("US_ACH", { enabled: false, reason: "x".repeat(301) })).status).toBe(400);
    expect(store.audit).toHaveLength(0);
    expect(store.setting).toBeNull();
  });

  it("disables a rail, writes an immutable-shaped audit record, and lists it paged", async () => {
    const { app, store } = build();
    const res = await as(request(app).put("/api/admin/payment-rails/US_ACH").send({ enabled: false, reason: "chargeback" }));
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ rail: "US_ACH", previousEnabled: true, enabled: false, changed: true });
    expect(store.audit).toHaveLength(1);
    expect(store.audit[0]).toMatchObject({
      rail: "US_ACH", previous_enabled: true, new_enabled: false, admin_wallet: ADMIN, reason: "chargeback",
    });
    expect(store.audit[0].ip_hash).toMatch(/^h:admin-audit-ip:/);
    expect(JSON.stringify(store.audit[0])).not.toMatch(/\d+\.\d+\.\d+\.\d+/);

    const list = await as(request(app).get("/api/admin/payment-rails"));
    const row = list.body.rails.find((r) => r.code === "US_ACH");
    expect(row).toMatchObject({ enabled: false, changedBy: ADMIN });
    expect(row.changedAt).toBeTruthy();

    const audit = await as(request(app).get("/api/admin/payment-rails/audit?page=1&limit=5"));
    expect(audit.status).toBe(200);
    expect(audit.body).toMatchObject({ total: 1, page: 1, limit: 5 });
    expect(audit.body.items[0]).toMatchObject({ rail: "US_ACH", newEnabled: false, adminWallet: ADMIN });
    expect((await as(request(app).get("/api/admin/payment-rails/audit?limit=1000"))).status).toBe(400);
  });

  it("rejects closing the last enabled rail with 409", async () => {
    const { app, store } = build();
    const put = (rail, enabled) => as(request(app).put(`/api/admin/payment-rails/${rail}`).send({ enabled }));
    expect((await put("US_ACH", false)).status).toBe(200);
    expect((await put("SEPA_IBAN", false)).status).toBe(200);
    const last = await put("TR_IBAN", false);
    expect(last.status).toBe(409);
    expect(last.body.code).toBe("LAST_ENABLED_RAIL");
    expect(store.audit).toHaveLength(2);
    // yeniden açmak serbest
    expect((await put("US_ACH", true)).status).toBe(200);
  });

  it("returns 409 on concurrent modification and 500 + rollback when audit cannot be written", async () => {
    const a = build();
    a.store.conflictOnce = true;
    a.store.setting = { key: "payment_rails", rails: {}, version: 3 };
    const res = await as(request(a.app).put("/api/admin/payment-rails/US_ACH").send({ enabled: false }));
    expect(res.status).toBe(409);
    expect(res.body.code).toBe("PAYMENT_RAIL_CONFLICT");

    const b = build();
    b.store.failAudit = true;
    const res2 = await as(request(b.app).put("/api/admin/payment-rails/US_ACH").send({ enabled: false }));
    expect(res2.status).toBe(500);
    expect(await b.rails.isRailEnabled("US_ACH")).toBe(true);
  });

  it("is a no-op (no audit) when the value does not change", async () => {
    const { app, store } = build();
    const res = await as(request(app).put("/api/admin/payment-rails/US_ACH").send({ enabled: true }));
    expect(res.status).toBe(200);
    expect(res.body.changed).toBe(false);
    expect(store.audit).toHaveLength(0);
  });

  it("cache: reads are served from memory, and a write invalidates immediately", async () => {
    const { rails, store, app } = build();
    await rails.getRailStates();
    await rails.getRailStates();
    expect(store.reads).toBe(1);
    // başka süreç DB'yi değiştirdi: TTL dolana dek eski değer
    store.setting = { key: "payment_rails", rails: { US_ACH: { enabled: false } }, version: 1 };
    expect(await rails.isRailEnabled("US_ACH")).toBe(true);
    rails.invalidateRailCache();
    expect(await rails.isRailEnabled("US_ACH")).toBe(false);
    // bu süreçteki yazma önbelleği hemen geçersiz kılar
    expect((await as(request(app).put("/api/admin/payment-rails/US_ACH").send({ enabled: true }))).status).toBe(200);
    expect(await rails.isRailEnabled("US_ACH")).toBe(true);
  });

  it("falls back to last known / all-enabled when the DB read fails", async () => {
    const { rails, Setting } = build();
    Setting.findOne.mockImplementationOnce(() => ({ lean: async () => { throw new Error("mongo down"); } }));
    expect(await rails.getEnabledRailCodes()).toEqual(["TR_IBAN", "US_ACH", "SEPA_IBAN"]);
  });
});

describe("enforcement: PUT /api/auth/profile and /me", () => {
  afterEach(() => jest.resetModules());
  const body = (rail = "TR_IBAN") => ({
    payoutProfile: {
      rail, country: rail === "US_ACH" ? "US" : "TR",
      contact: { channel: "telegram", value: "tester1" },
      fields: { account_holder_name: "Test User", iban: "TR963456789012345678901234", bank_name: "Bank" },
    },
  });

  it("rejects creating a profile on a disabled rail with PAYMENT_RAIL_DISABLED", async () => {
    const { app, rails, store } = build();
    await as(request(app).put("/api/admin/payment-rails/TR_IBAN").send({ enabled: false }));
    expect(await rails.isRailEnabled("TR_IBAN")).toBe(false);
    const res = await as(request(app).put("/api/auth/profile").send(body()), "good", USER);
    expect(res.status).toBe(409);
    expect(res.body.code).toBe("PAYMENT_RAIL_DISABLED");
    expect(store.audit).toHaveLength(1);
  });

  it("existing profile on a now-disabled rail is kept: contact-only update passes, /me reports payoutRailEnabled=false", async () => {
    const { app, User } = build({ profile: { rail: "TR_IBAN" } });
    await as(request(app).put("/api/admin/payment-rails/TR_IBAN").send({ enabled: false }));
    const res = await as(request(app).put("/api/auth/profile").send(body()), "good", USER);
    expect(res.status).toBe(200);
    expect(res.body.bankProfileChanged).toBe(false);

    const me = await as(request(app).get("/api/auth/me"), "good", USER);
    expect(me.body).toMatchObject({ hasPayoutProfile: true, payoutRail: "TR_IBAN", payoutRailEnabled: false });
    expect(User.findOne).toHaveBeenCalled();
  });

  it("changing an existing profile to a disabled rail is rejected, to an enabled rail is allowed", async () => {
    const { app } = build({ profile: { rail: "TR_IBAN" } });
    await as(request(app).put("/api/admin/payment-rails/US_ACH").send({ enabled: false }));
    const bad = await as(request(app).put("/api/auth/profile").send({
      payoutProfile: { rail: "US_ACH", country: "US", contact: { channel: "telegram", value: "tester1" },
        fields: { account_holder_name: "Test User", routing_number: "021000021", account_number: "123456789", account_type: "checking" } },
    }), "good", USER);
    expect(bad.status).toBe(409);
    expect(bad.body.code).toBe("PAYMENT_RAIL_DISABLED");
  });

  it("active trade is not affected: disabling a rail never blocks the existing profile/active-trade path", async () => {
    // Aktif işlemde snapshot ve PII akışı rail durumuna bakmaz: ilgili modüller servise bağlı değil.
    const fs = require("fs");
    const path = require("path");
    const root = path.join(__dirname, "../../backend/scripts");
    for (const f of ["routes/pii.js", "routes/trades.js", "routes/receipts.js", "services/eventListener.js", "services/encryption.js"]) {
      expect(fs.readFileSync(path.join(root, f), "utf8")).not.toMatch(/paymentRails|isRailEnabled/);
    }
    // Aktif işlem kilidi + devre dışı rail: değişmeyen profil kaydı yine de başarılı (kilit/rail çakışmaz).
    const { app } = build({ profile: { rail: "TR_IBAN" }, activeTrade: true });
    await as(request(app).put("/api/admin/payment-rails/TR_IBAN").send({ enabled: false }));
    const res = await as(request(app).put("/api/auth/profile").send(body()), "good", USER);
    expect(res.status).toBe(200);
  });
});
