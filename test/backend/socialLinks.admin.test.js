"use strict";

const express = require("express");
const request = require("supertest");
const cookieParser = require("cookie-parser");

const USER = "0x1111111111111111111111111111111111111111";
const OTHER = "0x2222222222222222222222222222222222222222";
const ADMIN = "0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa";

function makeFakes() {
  const store = { setting: null, audit: [], failAudit: false };
  const Setting = {
    findOne: jest.fn(() => ({ lean: async () => (store.setting ? JSON.parse(JSON.stringify(store.setting)) : null) })),
    updateOne: jest.fn(async (filter, update, opts = {}) => {
      const cur = store.setting;
      if (!cur) {
        if (!opts.upsert) return { matchedCount: 0 };
        store.setting = { key: filter.key, links: [], version: 0 };
      } else if (filter.version !== undefined && filter.version !== cur.version) {
        return { matchedCount: 0 };
      }
      if (update.$set?.links) store.setting.links = update.$set.links;
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
  const fakes = makeFakes();
  jest.doMock("../../backend/scripts/services/siwe", () => ({
    verifyJWT: jest.fn((token) => {
      if (token === "good") return { type: "auth", sub: USER, jti: "j1" };
      if (token === "admin") return { type: "auth", sub: ADMIN, jti: "j2" };
      throw new Error("invalid");
    }),
    isJWTBlacklisted: jest.fn().mockResolvedValue(false),
  }));
  jest.doMock("../../backend/scripts/middleware/rateLimiter", () => new Proxy({}, { get: () => (_req, _res, next) => next() }));
  jest.doMock("../../backend/scripts/models/SocialLinkSetting", () => fakes.Setting);
  jest.doMock("../../backend/scripts/models/SocialLinkAudit", () => fakes.Audit);
  for (const m of ["User", "Trade", "Feedback", "HistoricalStat", "RevenueEvent", "RewardEpoch", "RewardFunding", "RewardClaim"]) {
    jest.doMock(`../../backend/scripts/models/${m}`, () => ({}));
  }
  jest.doMock("../../backend/scripts/services/health", () => ({ getReadiness: jest.fn() }));
  jest.doMock("../../backend/scripts/services/dlqProcessor", () => ({ getDlqMetrics: jest.fn() }));
  jest.doMock("../../backend/scripts/services/eventListener", () => ({ provider: null }));
  jest.doMock("../../backend/scripts/config/redis", () => ({ getRedisClient: jest.fn(() => null), isReady: () => false }));
  jest.doMock("../../backend/scripts/services/encryption", () => ({
    hmacDigest: jest.fn(async (purpose, v) => `h:${purpose}:${String(v).length}`),
  }));

  const app = express();
  app.use(express.json({ limit: "50kb" }));
  app.use(cookieParser());
  app.use("/api/admin", require("../../backend/scripts/routes/admin"));
  app.use("/api/social-links", require("../../backend/scripts/routes/socialLinks"));
  app.use((err, _req, res, _next) => res.status(500).json({ error: err.message }));
  Object.defineProperty(require("mongoose").connection, "readyState", { value: ready ? 1 : 0, configurable: true });
  return { app, ...fakes };
}

const as = (req, token = "admin", wallet = ADMIN, withHeader = true) => {
  req.set("Cookie", [`araf_jwt=${token}`]);
  return withHeader ? req.set("x-wallet-address", wallet) : req;
};
const put = (app, body, opts = []) => as(request(app).put("/api/admin/social-links").send(body), ...opts);
const L = (url, label = "L", enabled = true) => ({ label, url, enabled });

describe("admin social links API", () => {
  afterEach(() => jest.resetModules());

  it("authorization matrix: unauthenticated 401, non-admin 403, missing CSRF header 401", async () => {
    const { app, Setting, Audit } = build();
    const body = { links: [L("https://x.com/a")], expectedVersion: 0 };
    expect((await request(app).get("/api/admin/social-links")).status).toBe(401);
    expect((await request(app).put("/api/admin/social-links").send(body)).status).toBe(401);
    expect((await put(app, body, ["good", USER])).status).toBe(403);
    expect((await as(request(app).get("/api/admin/social-links/audit"), "good", USER)).status).toBe(403);
    expect((await put(app, body, ["admin", ADMIN, false])).status).toBe(401);
    expect((await put(app, body, ["admin", OTHER])).status).toBe(409);
    expect(Setting.updateOne).not.toHaveBeenCalled();
    expect(Audit.create).not.toHaveBeenCalled();
  });

  it("saves, bumps version, writes audit with before/after/wallet/version/ip hash", async () => {
    const { app, store } = build();
    const get0 = await as(request(app).get("/api/admin/social-links"));
    expect(get0.body).toEqual({ links: [], version: 0 });

    const res = await put(app, { links: [L("https://x.com/araf", "X"), L("https://github.com/a", "GitHub", false)], expectedVersion: 0, reason: "init" });
    expect(res.status).toBe(200);
    expect(res.body.version).toBe(1);
    expect(res.body.links.map((l) => l.order)).toEqual([0, 1]);
    expect(store.audit).toHaveLength(1);
    expect(store.audit[0]).toMatchObject({ admin_wallet: ADMIN, version: 1, reason: "init", previous_links: [] });
    expect(store.audit[0].new_links).toHaveLength(2);
    expect(store.audit[0].ip_hash).toMatch(/^h:admin-audit-ip:/);

    const res2 = await put(app, { links: [L("https://x.com/araf", "X")], expectedVersion: 1 });
    expect(res2.status).toBe(200);
    expect(store.audit[1].previous_links).toHaveLength(2);
    expect(store.audit[1].new_links).toHaveLength(1);

    const audit = await as(request(app).get("/api/admin/social-links/audit"));
    expect(audit.status).toBe(200);
    expect(audit.body.total).toBe(2);
    expect(audit.body.items[0]).toMatchObject({ version: 2, adminWallet: ADMIN });
  });

  it("version mismatch -> 409 and nothing is written", async () => {
    const { app, store } = build();
    await put(app, { links: [L("https://x.com/a")], expectedVersion: 0 });
    const res = await put(app, { links: [L("https://x.com/b")], expectedVersion: 0 });
    expect(res.status).toBe(409);
    expect(res.body.code).toBe("SOCIAL_LINKS_CONFLICT");
    expect(store.audit).toHaveLength(1);
    expect(store.setting.links[0].url).toBe("https://x.com/a");
  });

  it("requires expectedVersion and rejects invalid bodies with 400 (no write)", async () => {
    const { app, store } = build();
    const bad = [
      { links: [L("https://x.com/a")] },
      { links: [L("https://x.com/a")], expectedVersion: "0" },
      { links: [L("http://x.com/a")], expectedVersion: 0 },
      { links: [L("javascript:alert(1)")], expectedVersion: 0 },
      { links: [L("https://evilx.com/a")], expectedVersion: 0 },
      { links: [L("https://user:p@x.com/a")], expectedVersion: 0 },
      { links: [{ ...L("https://x.com/a"), extra: 1 }], expectedVersion: 0 },
      { links: [L("https://x.com/a"), L("https://x.com/a")], expectedVersion: 0 },
      { links: Array.from({ length: 9 }, (_, i) => L(`https://github.com/u${i}`)), expectedVersion: 0 },
      { links: [], expectedVersion: 0, evil: true },
      { links: [L("https://x.com/a", "")], expectedVersion: 0 },
    ];
    for (const b of bad) expect((await put(app, b)).status).toBe(400);
    expect(store.audit).toHaveLength(0);
    expect(store.setting).toBeNull();
  });

  it("503 when DB not ready; audit failure rolls back", async () => {
    const down = build({ ready: false });
    expect((await put(down.app, { links: [], expectedVersion: 0 })).status).toBe(503);
    expect(down.Audit.create).not.toHaveBeenCalled();

    const { app, store } = build();
    await put(app, { links: [L("https://x.com/a")], expectedVersion: 0 });
    store.failAudit = true;
    const res = await put(app, { links: [L("https://x.com/b")], expectedVersion: 1 });
    expect(res.status).toBe(500);
    expect(res.body.code).toBe("SOCIAL_LINKS_AUDIT_FAILED");
    expect(store.setting.links[0].url).toBe("https://x.com/a");
  });

  it("public endpoint is unauthenticated, returns only enabled {label,url}, short cache, re-validates on read", async () => {
    const { app, store } = build();
    await put(app, { links: [L("https://x.com/a", "X"), L("https://github.com/b", "GH", false)], expectedVersion: 0 });
    const res = await request(app).get("/api/social-links");
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ links: [{ label: "X", url: "https://x.com/a" }] });
    expect(res.headers["cache-control"]).toMatch(/max-age=\d+/);

    // Bozuk/izin dışı kayıt (ör. DB'ye doğrudan yazılmış) yayınlanmaz.
    store.setting.links.push({ id: "z", label: "Evil", url: "https://evil.com/x", order: 5, enabled: true });
    store.setting.links.push({ id: "j", label: "JS", url: "javascript:alert(1)", order: 6, enabled: true });
    const res2 = await request(app).get("/api/social-links");
    expect(res2.body.links).toEqual([{ label: "X", url: "https://x.com/a" }]);
  });

  it("public endpoint returns an empty list when the DB is not ready", async () => {
    const { app } = build({ ready: false });
    const res = await request(app).get("/api/social-links");
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ links: [] });
  });
});
