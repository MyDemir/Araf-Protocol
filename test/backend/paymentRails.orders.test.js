"use strict";

const express = require("express");
const request = require("supertest");

const OPEN_OWNER = "0x1111111111111111111111111111111111111111";
const CLOSED_OWNER = "0x2222222222222222222222222222222222222222";

const ENABLED = { enabled: true, changed_at: null, changed_by: null };
const DISABLED = { enabled: false, changed_at: null, changed_by: null };

function build({ states, ownerRail = null, getConfigResult, dbDown = false }) {
  jest.resetModules();
  const base = {
    side: "SELL_CRYPTO", status: "OPEN", tier: 1,
    token_address: "0x9999999999999999999999999999999999999999",
    market: { crypto_asset: "USDT", fiat_currency: "TRY", exchange_rate: 34 },
    amounts: { min_fill_amount_num: 10, remaining_amount_num: 50 },
  };
  const rows = [
    { ...base, _id: "507f1f77bcf86cd799439011", onchain_order_id: "11", owner_address: OPEN_OWNER },
    { ...base, _id: "507f1f77bcf86cd799439012", onchain_order_id: "12", owner_address: CLOSED_OWNER },
  ];
  const chain = {
    select: jest.fn().mockReturnThis(), sort: jest.fn().mockReturnThis(),
    skip: jest.fn().mockReturnThis(), limit: jest.fn().mockReturnThis(),
    lean: jest.fn().mockResolvedValue(rows),
  };
  const Order = {
    find: jest.fn(() => chain), countDocuments: jest.fn().mockResolvedValue(2),
    findOne: jest.fn(() => ({ select: () => ({ lean: async () => null }) })),
    updateOne: jest.fn(),
  };
  const User = {
    find: jest.fn((q) => ({
      select: () => ({
        lean: async () =>
          q["payout_profile.payout_details_enc"]
            ? [
                { wallet_address: OPEN_OWNER, payout_profile: { rail: "TR_IBAN" } },
                { wallet_address: CLOSED_OWNER, payout_profile: { rail: "US_ACH" } },
              ]
            : [],
      }),
    })),
    findOne: jest.fn(() => ({ select: () => ({ lean: async () => (ownerRail ? { payout_profile: { rail: ownerRail } } : null) }) })),
  };
  const redis = { set: jest.fn().mockResolvedValue("OK"), get: jest.fn() };
  let router;
  jest.isolateModules(() => {
    jest.doMock("../../backend/scripts/middleware/auth", () => ({
      requireAuth: (req, _s, n) => { req.wallet = OPEN_OWNER; n(); }, requireSessionWalletMatch: (_r, _s, n) => n(),
    }));
    // Gerçek servis; yalnız Mongo modelleri sahte.
    jest.doMock("../../backend/scripts/models/PaymentRailSetting", () => ({
      findOne: () => ({ lean: async () => { if (dbDown) throw new Error("mongo down"); return { key: "payment_rails", rails: states, version: 1 }; } }),
    }));
    jest.doMock("../../backend/scripts/models/PaymentRailAudit", () => ({}));
    jest.doMock("../../backend/scripts/middleware/rateLimiter", () => ({
      marketReadLimiter: (_r, _s, n) => n(), ordersReadLimiter: (_r, _s, n) => n(), ordersWriteLimiter: (_r, _s, n) => n(),
    }));
    jest.doMock("../../backend/scripts/config/redis", () => ({ getRedisClient: () => redis }));
    jest.doMock("../../backend/scripts/utils/logger", () => ({ info: jest.fn(), warn: jest.fn(), error: jest.fn() }));
    jest.doMock("../../backend/scripts/models/Order", () => Order);
    jest.doMock("../../backend/scripts/models/Trade", () => ({ aggregate: jest.fn().mockResolvedValue([]) }));
    jest.doMock("../../backend/scripts/models/User", () => User);
    jest.doMock("../../backend/scripts/services/protocolConfig", () => ({
      getConfig: jest.fn(() => getConfigResult || { bondMap: {}, feeConfig: {}, cooldownConfig: {}, tokenMap: {} }),
    }));
    router = require("../../backend/scripts/routes/orders");
  });
  const app = express();
  app.use(express.json());
  app.use("/api/orders", router);
  return { app, Order, redis };
}

describe("payment rails on orders surfaces", () => {
  afterEach(() => jest.resetModules());

  it("market list exposes owner_rail_enabled boolean per owner (no PII)", async () => {
    const { app } = build({ states: { TR_IBAN: ENABLED, US_ACH: DISABLED, SEPA_IBAN: ENABLED } });
    const res = await request(app).get("/api/orders");
    expect(res.status).toBe(200);
    const byOwner = Object.fromEntries(res.body.orders.map((o) => [o.owner_address, o]));
    expect(byOwner[OPEN_OWNER].owner_rail_enabled).toBe(true);
    expect(byOwner[CLOSED_OWNER].owner_rail_enabled).toBe(false);
    expect(byOwner[CLOSED_OWNER].owner_has_payout_profile).toBe(true);
    expect(JSON.stringify(res.body)).not.toContain("payout_details_enc");
  });

  it("config and payment-risk-config return only the enabled-rail overlay", async () => {
    const getConfigResult = {
      bondMap: {}, feeConfig: {}, cooldownConfig: {}, tokenMap: {},
      paymentRiskConfig: {
        TR: { TR_IBAN: { enabled: true, riskLevel: "MEDIUM" } },
        US: { US_ACH: { enabled: true, riskLevel: "HIGH" } },
      },
    };
    const { app } = build({ states: { TR_IBAN: ENABLED, US_ACH: DISABLED, SEPA_IBAN: ENABLED }, getConfigResult });
    for (const url of ["/api/orders/config", "/api/orders/payment-risk-config"]) {
      const res = await request(app).get(url);
      expect(res.status).toBe(200);
      expect(res.body.enabledPaymentRails).toEqual(["TR_IBAN", "SEPA_IBAN"]);
      expect(res.body.paymentRiskConfig.US.US_ACH.enabled).toBe(false);
      expect(res.body.paymentRiskConfig.TR.TR_IBAN.enabled).toBe(true);
    }
    // girdi nesnesi değiştirilmemeli (paylaşılan önbellek)
    expect(getConfigResult.paymentRiskConfig.US.US_ACH.enabled).toBe(true);
  });

  it("market-meta rejects an owner whose saved rail is disabled; allows enabled rail", async () => {
    const payload = { orderRef: `0x${"a".repeat(64)}`, fiatCurrency: "TRY", exchangeRate: 34 };
    const closed = build({ states: { TR_IBAN: DISABLED, US_ACH: ENABLED, SEPA_IBAN: ENABLED }, ownerRail: "TR_IBAN" });
    const bad = await request(closed.app).post("/api/orders/market-meta").send(payload);
    expect(bad.status).toBe(409);
    expect(bad.body.code).toBe("PAYMENT_RAIL_DISABLED");
    expect(closed.redis.set).not.toHaveBeenCalled();

    const open = build({ states: { TR_IBAN: ENABLED, US_ACH: ENABLED, SEPA_IBAN: ENABLED }, ownerRail: "TR_IBAN" });
    const ok = await request(open.app).post("/api/orders/market-meta").send(payload);
    expect(ok.status).toBe(202);
  });
});

describe("cold start + DB error: reads stay open, write gates fail closed", () => {
  afterEach(() => jest.resetModules());
  const states = { TR_IBAN: ENABLED, US_ACH: ENABLED, SEPA_IBAN: ENABLED };

  it("market list and config keep working (all enabled)", async () => {
    const { app } = build({ states, dbDown: true });
    const list = await request(app).get("/api/orders");
    expect(list.status).toBe(200);
    expect(list.body.orders.every((o) => o.owner_rail_enabled === true)).toBe(true);
    const cfg = await request(app).get("/api/orders/payment-risk-config");
    expect(cfg.status).toBe(200);
    expect(cfg.body.enabledPaymentRails).toEqual(["TR_IBAN", "US_ACH", "SEPA_IBAN"]);
  });

  it("market-meta answers 503 PAYMENT_RAIL_STATE_UNAVAILABLE when the owner has a rail", async () => {
    const payload = { orderRef: `0x${"a".repeat(64)}`, fiatCurrency: "TRY", exchangeRate: 34 };
    const { app, redis } = build({ states, ownerRail: "TR_IBAN", dbDown: true });
    const res = await request(app).post("/api/orders/market-meta").send(payload);
    expect(res.status).toBe(503);
    expect(res.body.code).toBe("PAYMENT_RAIL_STATE_UNAVAILABLE");
    expect(redis.set).not.toHaveBeenCalled();
  });
});

describe("PaymentRailAudit immutability", () => {
  it("update/delete operations are rejected before reaching the DB", async () => {
    jest.resetModules();
    jest.dontMock("../../backend/scripts/models/PaymentRailAudit");
    const Audit = require("../../backend/scripts/models/PaymentRailAudit");
    await expect(Audit.updateOne({}, { $set: { reason: "x" } }).exec()).rejects.toThrow(/değiştirilemez/);
    await expect(Audit.deleteMany({}).exec()).rejects.toThrow(/değiştirilemez/);
    await expect(Audit.findOneAndUpdate({}, { $set: { reason: "x" } }).exec()).rejects.toThrow(/değiştirilemez/);
  });
});
