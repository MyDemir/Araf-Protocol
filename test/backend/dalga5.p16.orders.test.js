"use strict";

const express = require("express");
const request = require("supertest");

const OWNER = "0x1111111111111111111111111111111111111111";
const ORDER_REF = `0x${"ab".repeat(32)}`;
const noop = (_r, _s, n) => n();

function buildOrders({ existingOrder = null, updateResult = { modifiedCount: 1, matchedCount: 1 } } = {}) {
  const findChain = {
    select: jest.fn().mockReturnThis(),
    sort: jest.fn().mockReturnThis(),
    skip: jest.fn().mockReturnThis(),
    limit: jest.fn().mockReturnThis(),
    lean: jest.fn().mockResolvedValue([]),
  };
  const Order = {
    find: jest.fn(() => findChain),
    aggregate: jest.fn().mockResolvedValue([]),
    countDocuments: jest.fn().mockResolvedValue(0),
    findOne: jest.fn().mockReturnValue({
      select: jest.fn().mockReturnValue({ lean: jest.fn().mockResolvedValue(existingOrder) }),
    }),
    updateOne: jest.fn().mockResolvedValue(updateResult),
  };
  let router;
  jest.isolateModules(() => {
    jest.doMock("../../backend/scripts/middleware/auth", () => ({
      requireAuth: (req, _res, next) => { req.wallet = OWNER; next(); },
      requireSessionWalletMatch: noop,
    }));
    jest.doMock("../../backend/scripts/services/paymentRails", () => require("./helpers/paymentRailsPassthrough"));
    jest.doMock("../../backend/scripts/middleware/rateLimiter", () => ({
      marketReadLimiter: noop, ordersReadLimiter: noop, ordersWriteLimiter: noop,
    }));
    jest.doMock("../../backend/scripts/config/redis", () => ({ getRedisClient: () => ({ set: jest.fn(), get: jest.fn() }) }));
    jest.doMock("../../backend/scripts/utils/logger", () => ({ info: jest.fn(), warn: jest.fn(), error: jest.fn() }));
    jest.doMock("../../backend/scripts/models/Order", () => Order);
    jest.doMock("../../backend/scripts/models/Trade", () => ({ aggregate: jest.fn().mockResolvedValue([]) }));
    jest.doMock("../../backend/scripts/models/User", () => ({
      findOne: jest.fn().mockReturnValue({ select: jest.fn().mockReturnValue({ lean: jest.fn().mockResolvedValue(null) }) }),
      find: jest.fn().mockReturnValue({ select: jest.fn().mockReturnValue({ lean: jest.fn().mockResolvedValue([]) }) }),
    }));
    jest.doMock("../../backend/scripts/services/protocolConfig", () => ({
      getConfig: jest.fn(() => ({ tokenMap: { ["0x" + "c".repeat(40)]: { decimals: 6 } } })),
    }));
    router = require("../../backend/scripts/routes/orders");
  });
  const app = express();
  app.use(express.json());
  app.use("/api/orders", router);
  return { app, Order, findChain };
}

afterEach(() => { jest.resetModules(); jest.clearAllMocks(); delete process.env.MARKET_CACHE_TTL_MS; });

describe("P16 B3-11 market-meta eşzamanlı yarış", () => {
  it("updateOne matchedCount=0 ise 409 MARKET_META_ALREADY_SET (201 applied değil)", async () => {
    const { app } = buildOrders({
      existingOrder: { owner_address: OWNER, market: { exchange_rate: null } },
      updateResult: { matchedCount: 0, modifiedCount: 0 },
    });
    const res = await request(app).post("/api/orders/market-meta").send({ orderRef: ORDER_REF, fiatCurrency: "TRY", exchangeRate: 34.5 });
    expect(res.status).toBe(409);
    expect(res.body.code).toBe("MARKET_META_ALREADY_SET");
  });
});

describe("P16 B3-12 / B3-13 pazar sorgu sınırları", () => {
  it("page > 200 -> 400, 200 -> 200", async () => {
    const { app } = buildOrders();
    expect((await request(app).get("/api/orders?page=201")).status).toBe(400);
    expect((await request(app).get("/api/orders?page=200")).status).toBe(200);
  });

  it("aşırı büyük min_amount 503 değil 400; makul değer 200", async () => {
    const { app } = buildOrders();
    expect((await request(app).get("/api/orders?min_amount=1e305")).status).toBe(400);
    expect((await request(app).get("/api/orders?min_amount=100")).status).toBe(200);
  });
});

describe("P16 B3-14 pazar cache anahtarı kanonik + LRU", () => {
  it("parametre sırası farklı aynı sorgu cache'ten (X-Cache: HIT) gelir", async () => {
    process.env.MARKET_CACHE_TTL_MS = "10000";
    const { app, Order } = buildOrders();
    const first = await request(app).get("/api/orders?side=SELL_CRYPTO&limit=10");
    expect(first.status).toBe(200);
    expect(first.headers["x-cache"]).toBeUndefined();
    const second = await request(app).get("/api/orders?limit=10&side=SELL_CRYPTO");
    expect(second.status).toBe(200);
    expect(second.headers["x-cache"]).toBe("HIT");
    expect(Order.find).toHaveBeenCalledTimes(1);
  });

  it("LRU: sık erişilen anahtar 200 farklı sorguyla doldurulunca atılmaz", async () => {
    process.env.MARKET_CACHE_TTL_MS = "10000";
    const { app } = buildOrders();
    await request(app).get("/api/orders?limit=7");
    for (let i = 1; i <= 205; i += 1) {
      await request(app).get(`/api/orders?min_amount=${i}`);
      if (i % 50 === 0) await request(app).get("/api/orders?limit=7");
    }
    const again = await request(app).get("/api/orders?limit=7");
    expect(again.headers["x-cache"]).toBe("HIT");
  }, 30000);
});

describe("P16 B3-19 rewards epoch sorguları limitli", () => {
  it("RewardEpoch.find çağrıları limit(200) ile", async () => {
    const limit = jest.fn(() => ({ lean: async () => [] }));
    const find = jest.fn(() => ({ limit }));
    let router;
    jest.isolateModules(() => {
      jest.doMock("../../backend/scripts/middleware/rateLimiter", () => ({ marketReadLimiter: noop }));
      jest.doMock("../../backend/scripts/models/RewardEpoch", () => ({ find }));
      jest.doMock("../../backend/scripts/models/RewardClaim", () => ({}));
      jest.doMock("../../backend/scripts/models/RewardFunding", () => ({}));
      router = require("../../backend/scripts/routes/rewards");
    });
    const app = express();
    app.use("/api/rewards", router);
    expect((await request(app).get("/api/rewards/epochs/5")).status).toBe(200);
    expect((await request(app).get("/api/rewards/epochs/current")).status).toBe(200);
    expect(limit).toHaveBeenCalledTimes(2);
    expect(limit).toHaveBeenCalledWith(200);
  });
});

describe("P16 B3-20 tradeRisk mirror bağlamı", () => {
  it("reputation_semantics, authority sayaçlarıyla aynı değerde ama ayrı nesne", () => {
    const { buildTradeHealthSignals } = require("../../backend/scripts/routes/tradeRisk");
    const health = buildTradeHealthSignals(
      { payout_snapshot: { is_complete: true, maker: { reputation_context_at_lock: { manual_release_count: 4, is_banned: true } } } },
      { reputation_breakdown: { burn_count: 2 } },
      {}
    );
    const json = JSON.stringify(health);
    expect(json).toContain("\"manual_release_count\":4");
    const ctx = health.maker.reputationBanMirrorContext;
    expect(ctx.reputation_semantics).toEqual(ctx.reputation_authority_counters);
    expect(ctx.reputation_semantics).not.toBe(ctx.reputation_authority_counters);
    expect(ctx.reputation_semantics.burn_count).toBe(2);
  });
});
