"use strict";

const express = require("express");
const request = require("supertest");
const fs = require("fs");
const os = require("os");
const path = require("path");

const WALLET = "0x" + "1".repeat(40);

function load(mocks, route) {
  let router;
  jest.isolateModules(() => {
    for (const [k, v] of Object.entries(mocks)) jest.doMock(`../../backend/scripts/${k}`, v);
    router = require(`../../backend/scripts/routes/${route}`);
  });
  return router;
}
const passAuth = () => ({
  requireAuth: (req, _res, next) => { req.wallet = WALLET; next(); },
  requireSessionWalletMatch: (_req, _res, next) => next(),
});
const mkApp = (mount, router) => { const a = express(); a.use(express.json()); a.use(mount, router); return a; };
const noop = (_r, _s, n) => n();
const quietLogger = () => ({ info: jest.fn(), warn: jest.fn(), error: jest.fn() });

afterEach(() => { jest.resetModules(); jest.clearAllMocks(); });

describe("P16 B3-07 stats", () => {
  const doc = { _id: "x", date: "2026-01-01", __v: 0, created_at: new Date(), internal_secret: "gizli", total_volume_usdt: 5, completed_trades: 2 };
  const build = (redis) => {
    const findOne = jest.fn(() => ({ sort: () => ({ lean: async () => doc }), lean: async () => null }));
    const router = load({
      "middleware/rateLimiter": () => ({ statsReadLimiter: noop }),
      "config/redis": () => ({ getRedisClient: () => redis }),
      "models/HistoricalStat": () => ({ findOne }),
      "utils/logger": quietLogger,
    }, "stats");
    return mkApp("/api/stats", router);
  };

  it("Redis get hata verirse 500 değil, DB'den 200 döner", async () => {
    const res = await request(build({ get: jest.fn().mockRejectedValue(new Error("down")), setEx: jest.fn().mockRejectedValue(new Error("down")) })).get("/api/stats");
    expect(res.status).toBe(200);
    expect(res.body.stats.total_volume_usdt).toBe(5);
  });

  it("bozuk JSON cache 500 vermez", async () => {
    const res = await request(build({ get: jest.fn().mockResolvedValue("{bozuk"), setEx: jest.fn() })).get("/api/stats");
    expect(res.status).toBe(200);
  });

  it("şemada olmayan iç alan yanıta sızmaz", async () => {
    const res = await request(build({ get: jest.fn().mockResolvedValue(null), setEx: jest.fn() })).get("/api/stats");
    expect(res.body.stats.internal_secret).toBeUndefined();
    expect(res.body.stats.completed_trades).toBe(2);
    expect(res.body.stats.meta.numeric_fields_are_approximate).toBe(true);
  });
});

describe("P16 B3-05 logs", () => {
  it("url alanındaki cüzdan/e-posta ve küçük harfli IBAN maskelenir", async () => {
    const logger = quietLogger();
    const router = load({ "middleware/rateLimiter": () => ({ clientLogLimiter: noop }), "utils/logger": () => logger }, "logs");
    expect(router.scrubClientErrorText("gb82westllllllllllllllll")).toContain("[REDACTED]");
    const res = await request(mkApp("/api/logs", router)).post("/api/logs/client-error")
      .send({ message: "m", url: `https://x/y?wallet=0x${"a".repeat(40)}&e=a@b.co` });
    expect(res.status).toBe(204);
    const meta = logger.error.mock.calls[0][1];
    expect(meta.url).not.toContain("a".repeat(40));
    expect(meta.url).not.toContain("a@b.co");
  });
});

describe("P16 B3-06 feedback", () => {
  it("yorumdaki IBAN/e-posta maskelenir, log'da cüzdan kısaltılır", async () => {
    const create = jest.fn().mockResolvedValue({});
    const logger = quietLogger();
    const router = load({
      "middleware/auth": passAuth,
      "middleware/rateLimiter": () => ({ feedbackLimiter: noop }),
      "models/Feedback": () => ({ create }),
      "utils/logger": () => logger,
    }, "feedback");
    const res = await request(mkApp("/api/feedback", router)).post("/api/feedback")
      .send({ rating: 5, category: "bug", comment: "iban TR330006100519786457841326 mail a@b.com" });
    expect(res.status).toBe(201);
    const saved = create.mock.calls[0][0].comment;
    expect(saved).not.toContain("TR33000610");
    expect(saved).not.toContain("a@b.com");
    expect(logger.info.mock.calls[0][0]).not.toContain(WALLET);
  });
});

describe("P16 B3-03 / B3-04 receipts", () => {
  const receiptMocks = (Trade) => ({
    "middleware/auth": passAuth,
    "middleware/rateLimiter": () => ({ receiptUploadLimiter: noop }),
    "services/encryption": () => ({ encryptField: jest.fn().mockResolvedValue("enc") }),
    "models/Trade": () => Trade,
    "utils/logger": quietLogger,
  });

  it("sweepStaleReceiptTmp yalnız eski dosyaları siler", () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "sweep-"));
    const old = path.join(dir, "old");
    const fresh = path.join(dir, "fresh");
    fs.writeFileSync(old, "x");
    fs.writeFileSync(fresh, "x");
    const past = new Date(Date.now() - 2 * 3600 * 1000);
    fs.utimesSync(old, past, past);
    const router = load(receiptMocks({}), "receipts");
    expect(router.sweepStaleReceiptTmp(dir)).toBe(1);
    expect(fs.existsSync(old)).toBe(false);
    expect(fs.existsSync(fresh)).toBe(true);
    fs.rmSync(dir, { recursive: true });
  });

  it("BSON boyut hatası 500 değil 413", async () => {
    const Trade = {
      findOneAndUpdate: jest.fn().mockRejectedValue(Object.assign(new Error("BSONObj size: 17000000 is invalid"), { code: 10334 })),
      // [TR] B3-02: ön kontrol (taker + LOCKED + dekont yok) geçer; BSON hatası atomik yazmada oluşur.
      findOne: jest.fn().mockReturnValue({
        select: jest.fn().mockReturnValue({
          lean: jest.fn().mockResolvedValue({ taker_address: WALLET, status: "LOCKED", evidence: {} }),
        }),
      }),
    };
    const router = load(receiptMocks(Trade), "receipts");
    const res = await request(mkApp("/api/receipts", router)).post("/api/receipts/upload")
      .field("onchainEscrowId", "1")
      .attach("receipt", Buffer.from("%PDF-1.4 x"), { filename: "a.pdf", contentType: "application/pdf" });
    expect(res.status).toBe(413);
    expect(res.body.code).toBe("RECEIPT_TOO_LARGE");
  });
});

describe("P16 B3-08 / B3-10 admin summary", () => {
  const prevAdmins = process.env.ADMIN_WALLETS;
  beforeEach(() => { process.env.ADMIN_WALLETS = WALLET; });
  afterAll(() => { if (prevAdmins === undefined) delete process.env.ADMIN_WALLETS; else process.env.ADMIN_WALLETS = prevAdmins; });
  function build(tradeExtra = {}) {
    const router = load({
      "middleware/auth": passAuth,
      "services/paymentRails": () => require("./helpers/paymentRailsPassthrough"),
      "middleware/rateLimiter": () => ({ adminReadLimiter: noop, adminWriteLimiter: noop }),
      "services/health": () => ({ getReadiness: jest.fn().mockRejectedValue(new Error("mongodb://user:pw@host:27017 refused")) }),
      "services/dlqProcessor": () => ({ getDlqMetrics: jest.fn(() => ({})) }),
      "config/redis": () => ({ getRedisClient: () => ({ lLen: jest.fn().mockResolvedValue(0) }) }),
      "services/eventListener": () => ({ provider: null }),
      "models/HistoricalStat": () => ({ findOne: () => ({ sort: () => ({ lean: async () => null }) }) }),
      "models/Trade": () => ({ countDocuments: jest.fn().mockResolvedValue(0), find: jest.fn(), ...tradeExtra }),
      "models/User": () => ({ find: jest.fn() }),
      "models/Feedback": () => ({ find: jest.fn(), countDocuments: jest.fn() }),
      "utils/logger": quietLogger,
    }, "admin");
    return mkApp("/api/admin", router);
  }

  it("B3-08: ortalama aggregate ile hesaplanır, find().limit(5000) kullanılmaz", async () => {
    const aggregate = jest.fn().mockResolvedValue([{ _id: null, avg: 6123.456, n: 7000 }]);
    const find = jest.fn(() => { throw new Error("find kullanılmamalı"); });
    const res = await request(build({ aggregate, find })).get("/api/admin/summary");
    expect(res.status).toBe(200);
    expect(aggregate).toHaveBeenCalled();
    expect(res.body.settlementAnalytics.avgSettlementSplitMakerBps).toBe(6123.46);
  });

  it("B3-10: degraded.errors ham hata mesajı içermez, source korunur", async () => {
    const res = await request(build({ aggregate: jest.fn().mockResolvedValue([]) })).get("/api/admin/summary");
    expect(res.status).toBe(200);
    const err = res.body.degraded.errors.find((e) => e.source === "readiness");
    expect(err.message).toBe("readiness_unavailable");
    expect(JSON.stringify(res.body)).not.toContain("mongodb://");
  });
});
