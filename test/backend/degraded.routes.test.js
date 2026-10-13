"use strict";

const express = require("express");
const request = require("supertest");
const cookieParser = require("cookie-parser");

const WALLET = "0x1111111111111111111111111111111111111111";

const { ROUTE_MOUNTS } = require("../../backend/scripts/routes/mounts");

// Degraded modda AÇIK olması beklenen uçların TAM listesi. Yeni uç eklenirse burası ve izin listesi bilinçli
// güncellenmeden test kırılır (varsayılan kapalı).
const EXPECTED_OPEN = [
  "GET /api/auth/me",
  "GET /api/auth/nonce",
  "GET /api/orders/",
  "GET /api/orders/:id",
  "GET /api/orders/config",
  "GET /api/orders/payment-risk-config",
  "GET /api/reference-rates/ticker",
  "GET /api/rewards/:wallet/claimable",
  "GET /api/rewards/:wallet/history",
  "GET /api/rewards/epochs/:epoch",
  "GET /api/rewards/epochs/current",
  "GET /api/rewards/funding/global",
  "GET /api/rewards/funding/product/:productId",
  "GET /api/rewards/health",
  "GET /api/stats/",
  "POST /api/auth/logout",
  "POST /api/auth/refresh",
  "POST /api/auth/verify",
  "POST /api/logs/client-error",
].sort();

function setup() {
  jest.resetModules();
  process.env.ADMIN_WALLETS = WALLET;
  jest.doMock("../../backend/scripts/services/siwe", () => ({
    verifyJWT: jest.fn(() => ({ type: "auth", sub: WALLET, jti: "j1" })),
    isJWTBlacklisted: jest.fn().mockResolvedValue(false),
    revokeRefreshToken: jest.fn().mockResolvedValue(),
    blacklistJWT: jest.fn().mockResolvedValue(),
    issuePIIToken: jest.fn(() => "pii-good"),
  }));
  jest.doMock("../../backend/scripts/middleware/rateLimiter", () => new Proxy({}, { get: () => (_req, _res, next) => next() }));
  const emptyFind = () => ({ select: () => ({ lean: async () => null }) });
  jest.doMock("../../backend/scripts/models/User", () => ({ findOne: jest.fn(emptyFind), find: jest.fn(() => ({ select: () => ({ lean: async () => [] }) })) }));
  jest.doMock("../../backend/scripts/models/Order", () => ({
    find: jest.fn(() => ({ select: () => ({ sort: () => ({ skip: () => ({ limit: () => ({ lean: async () => [] }) }) }) }) })),
    countDocuments: jest.fn(async () => 0),
  }));
  jest.doMock("../../backend/scripts/models/Trade", () => ({
    findById: jest.fn(() => ({ select: () => ({ lean: async () => null }) })),
    findOne: jest.fn(() => ({ select: () => ({ lean: async () => null }) })),
    find: jest.fn(() => ({ select: () => ({ sort: () => ({ limit: () => ({ lean: async () => [] }) }), limit: () => ({ lean: async () => [] }), lean: async () => [] }) })),
  }));
  jest.doMock("../../backend/scripts/models/Feedback", () => ({}));
  jest.doMock("../../backend/scripts/models/HistoricalStat", () => ({ findOne: jest.fn(() => ({ sort: () => ({ lean: async () => null }) })) }));
  jest.doMock("../../backend/scripts/models/RevenueEvent", () => ({ find: jest.fn(() => ({ sort: () => ({ limit: () => ({ lean: async () => [] }) }) })) }));
  jest.doMock("../../backend/scripts/models/RewardEpoch", () => ({ countDocuments: jest.fn(async () => 0) }));
  jest.doMock("../../backend/scripts/models/RewardFunding", () => ({ countDocuments: jest.fn(async () => 0) }));
  jest.doMock("../../backend/scripts/models/RewardClaim", () => ({ countDocuments: jest.fn(async () => 0) }));
  jest.doMock("../../backend/scripts/services/protocolConfig", () => ({
    getConfig: jest.fn(() => ({ tokenMap: {}, bondMap: {}, feeConfig: {}, cooldownConfig: {} })),
  }));
  jest.doMock("../../backend/scripts/services/dlqProcessor", () => ({ getDlqMetrics: jest.fn(async () => ({ depth: 0 })) }));
  jest.doMock("../../backend/scripts/services/encryption", () => ({
    decryptField: jest.fn(), decryptPayoutProfile: jest.fn(), encryptField: jest.fn(), hmacDigest: jest.fn(),
    encryptPayoutProfile: jest.fn(), buildPayoutFingerprintHmac: jest.fn(),
  }));
  jest.doMock("../../backend/scripts/services/identityNormalizationGuard", () => ({ verifyIdentityNormalization: jest.fn(async () => true) }));

  const serviceMode = require("../../backend/scripts/services/serviceMode");
  serviceMode._resetForTests();
  const { requireFullService } = require("../../backend/scripts/middleware/requireFullService");
  const routers = {};
  const app = express();
  app.use(express.json());
  app.use(cookieParser());
  app.use("/api", requireFullService);
  for (const { path: mount, file } of ROUTE_MOUNTS) {
    routers[mount] = require(`../../backend/scripts/routes/${file}`);
    app.use(mount, routers[mount]);
  }
  const fresh = express.Router();
  fresh.get("/brand-new", (_req, res) => res.json({ ok: true }));
  fresh.post("/brand-new", (_req, res) => res.json({ ok: true }));
  app.use("/api/brand-new-feature", fresh);
  return { app, serviceMode, routers, requireFullService };
}

function listRoutes(router, mount) {
  const out = [];
  for (const layer of router.stack) {
    if (!layer.route) continue;
    for (const method of Object.keys(layer.route.methods)) {
      out.push({ method: method.toUpperCase(), path: `${mount}${layer.route.path === "/" ? "/" : layer.route.path}` });
    }
  }
  return out;
}

describe("requireFullService (degraded default-deny gate)", () => {
  it("routes extracted from code: open set equals the explicit allowlist, everything else is closed", () => {
    const { routers, requireFullService } = setup();
    const gate = require("../../backend/scripts/middleware/requireFullService");
    const all = [];
    for (const [mount, router] of Object.entries(routers)) all.push(...listRoutes(router, mount));
    expect(all.length).toBeGreaterThan(40);

    const open = [];
    for (const r of all) {
      const rel = r.path.replace(/^\/api/, "").replace(/:[A-Za-z]+/g, (m) => (m === ":id" ? "1" : m === ":wallet" ? WALLET : "1"));
      if (gate._findAllowEntry(gate.DEGRADED_ALLOWLIST, r.method, rel)) open.push(`${r.method} ${r.path}`);
    }
    expect(open.sort()).toEqual(EXPECTED_OPEN);
    expect(typeof requireFullService).toBe("function");

    // Hassas alanlar asla açık olmamalı
    const sensitive = all.filter((r) => /\/(pii|receipts|admin|trades)(\/|$)/.test(r.path) || r.path === "/api/auth/profile");
    expect(sensitive.length).toBeGreaterThan(10);
    for (const r of sensitive) expect(open).not.toContain(`${r.method} ${r.path}`);
  });

  it("not degraded: gate is transparent (pii route reaches its own auth, not SERVICE_DEGRADED)", async () => {
    const { app } = setup();
    const res = await request(app).get("/api/pii/my");
    expect(res.body.code).not.toBe("SERVICE_DEGRADED");
    const fresh = await request(app).get("/api/brand-new-feature/brand-new");
    expect(fresh.status).toBe(200);
  });

  it("degraded: PII, receipts, profile payout write, trades, admin write => 503 SERVICE_DEGRADED", async () => {
    const { app, serviceMode } = setup();
    serviceMode.enterDegraded("rpc_unavailable_at_boot");
    const cookie = ["araf_jwt=good"];
    const cases = [
      ["get", "/api/pii/my"],
      ["get", "/api/pii/taker-name/1"],
      ["post", "/api/pii/request-token/507f1f77bcf86cd799439011"],
      ["get", "/api/pii/507f1f77bcf86cd799439011"],
      ["post", "/api/receipts/upload"],
      ["put", "/api/auth/profile"],
      ["get", "/api/trades/my"],
      ["get", "/api/trades/507f1f77bcf86cd799439011"],
      ["post", "/api/trades/507f1f77bcf86cd799439011/chargeback-ack"],
      ["put", "/api/admin/runtime-settings/x"],
      ["put", "/api/admin/payment-rails/SEPA"],
      ["get", "/api/admin/summary"],
      ["get", "/api/orders/my"],
      ["post", "/api/orders/market-meta"],
      ["post", "/api/feedback"],
    ];
    for (const [method, url] of cases) {
      const res = await request(app)[method](url).set("Cookie", cookie);
      expect([method, url, res.status, res.body.code]).toEqual([method, url, 503, "SERVICE_DEGRADED"]);
      expect(res.body.degradedReasons).toContain("rpc_unavailable_at_boot");
    }
  });

  it("degraded: unknown/new endpoints are closed by default (case and trailing-slash variants too)", async () => {
    const { app, serviceMode } = setup();
    serviceMode.enterDegraded("rpc_unavailable_at_boot");
    for (const [m, u] of [["get", "/api/brand-new-feature/brand-new"], ["post", "/api/brand-new-feature/brand-new"], ["get", "/api/PII/my"], ["get", "/api/orders/%6dy"]]) {
      const res = await request(app)[m](u);
      expect([u, res.status, res.body.code]).toEqual([u, 503, "SERVICE_DEGRADED"]);
    }
  });

  it("degraded: allowlisted public reads stay open (200) and are flagged", async () => {
    const { serviceMode, requireFullService } = setup();
    serviceMode.enterDegraded("rpc_unavailable_at_boot");
    serviceMode.setConfigStale(true);
    const stub = express();
    stub.use("/api", requireFullService);
    stub.use((_req, res) => res.json({ passed: true }));
    const list = await request(stub).get("/api/orders");
    expect(list.status).toBe(200);
    expect(list.headers["x-araf-degraded"]).toBe("true");
    const cfg = await request(stub).get("/api/orders/config");
    expect(cfg.status).toBe(200);
    expect(cfg.headers["x-araf-config-stale"]).toBe("true");
    expect((await request(stub).get("/api/auth/nonce")).status).toBe(200);
    expect((await request(stub).post("/api/auth/verify")).status).toBe(200);
    expect((await request(stub).get("/api/orders/my")).status).toBe(503);
  });

  it("recovery: after exitDegraded the closed endpoints open again", async () => {
    const { app, serviceMode } = setup();
    serviceMode.enterDegraded("rpc_unavailable_at_boot");
    expect((await request(app).get("/api/brand-new-feature/brand-new")).status).toBe(503);
    serviceMode.exitDegraded();
    expect((await request(app).get("/api/brand-new-feature/brand-new")).status).toBe(200);
  });
});
