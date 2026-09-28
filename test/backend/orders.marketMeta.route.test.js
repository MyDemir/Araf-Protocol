"use strict";

const express = require("express");
const request = require("supertest");

const OWNER = "0x1111111111111111111111111111111111111111";
const STRANGER = "0x2222222222222222222222222222222222222222";
const ORDER_REF = `0x${"ab".repeat(32)}`;

function buildApp({ wallet = OWNER, existingOrder = null, redisSetResult = "OK" } = {}) {
  const findChain = {
    select: jest.fn().mockReturnThis(),
    sort: jest.fn().mockReturnThis(),
    skip: jest.fn().mockReturnThis(),
    limit: jest.fn().mockReturnThis(),
    lean: jest.fn().mockResolvedValue([]),
  };
  const Order = {
    find: jest.fn(() => findChain),
    countDocuments: jest.fn().mockResolvedValue(0),
    findOne: jest.fn().mockReturnValue({
      select: jest.fn().mockReturnValue({ lean: jest.fn().mockResolvedValue(existingOrder) }),
    }),
    updateOne: jest.fn().mockResolvedValue({ modifiedCount: 1 }),
  };
  const redis = { set: jest.fn().mockResolvedValue(redisSetResult), get: jest.fn() };

  let router;
  jest.isolateModules(() => {
    jest.doMock("../../backend/scripts/middleware/auth", () => ({
      requireAuth: (req, _res, next) => { req.wallet = wallet; next(); },
      requireSessionWalletMatch: (_req, _res, next) => next(),
    }));
    jest.doMock("../../backend/scripts/middleware/rateLimiter", () => ({
      marketReadLimiter: (_req, _res, next) => next(),
      ordersReadLimiter: (_req, _res, next) => next(),
      ordersWriteLimiter: (_req, _res, next) => next(),
    }));
    jest.doMock("../../backend/scripts/config/redis", () => ({ getRedisClient: () => redis }));
    jest.doMock("../../backend/scripts/utils/logger", () => ({ info: jest.fn(), warn: jest.fn(), error: jest.fn() }));
    jest.doMock("../../backend/scripts/models/Order", () => Order);
    jest.doMock("../../backend/scripts/models/Trade", () => ({ aggregate: jest.fn().mockResolvedValue([]) }));
    jest.doMock("../../backend/scripts/models/User", () => ({
      find: jest.fn().mockReturnValue({ select: jest.fn().mockReturnValue({ lean: jest.fn().mockResolvedValue([]) }) }),
    }));
    jest.doMock("../../backend/scripts/services/protocolConfig", () => ({ getConfig: jest.fn(() => ({})) }));
    router = require("../../backend/scripts/routes/orders");
  });

  const app = express();
  app.use(express.json());
  app.use("/api/orders", router);
  return { app, Order, redis, findChain };
}

describe("orders market-meta route (maker fiat/rate enrichment)", () => {
  afterEach(() => {
    jest.resetModules();
    jest.clearAllMocks();
  });

  it("applies fiat/rate directly when the owner's order mirror already exists", async () => {
    const { app, Order } = buildApp({ existingOrder: { owner_address: OWNER, market: { exchange_rate: null } } });
    const res = await request(app).post("/api/orders/market-meta").send({ orderRef: ORDER_REF, fiatCurrency: "TRY", exchangeRate: 34.5 });

    expect(res.status).toBe(201);
    const [filter, update] = Order.updateOne.mock.calls[0];
    expect(filter).toEqual({ "refs.order_ref": ORDER_REF, owner_address: OWNER, "market.exchange_rate": null });
    expect(update.$set).toEqual({ "market.fiat_currency": "TRY", "market.exchange_rate": 34.5 });
  });

  it("security_rejects_non_owner_and_is_set_once", async () => {
    const notOwner = buildApp({ wallet: STRANGER, existingOrder: { owner_address: OWNER, market: {} } });
    const forbidden = await request(notOwner.app).post("/api/orders/market-meta").send({ orderRef: ORDER_REF, fiatCurrency: "TRY", exchangeRate: 34 });
    expect(forbidden.status).toBe(403);
    expect(notOwner.Order.updateOne).not.toHaveBeenCalled();

    jest.resetModules();
    const alreadySet = buildApp({ existingOrder: { owner_address: OWNER, market: { exchange_rate: 33 } } });
    const conflict = await request(alreadySet.app).post("/api/orders/market-meta").send({ orderRef: ORDER_REF, fiatCurrency: "TRY", exchangeRate: 99 });
    expect(conflict.status).toBe(409);
    expect(alreadySet.Order.updateOne).not.toHaveBeenCalled();
  });

  it("stores an owner-scoped pending intent when the mirror is not ready yet", async () => {
    const { app, redis } = buildApp({ existingOrder: null });
    const res = await request(app).post("/api/orders/market-meta").send({ orderRef: ORDER_REF, fiatCurrency: "EUR", exchangeRate: 1.08 });

    expect(res.status).toBe(202);
    const [key, value, opts] = redis.set.mock.calls[0];
    expect(key).toBe(`order_meta:${ORDER_REF}:${OWNER}`);
    expect(JSON.parse(value)).toEqual({ owner: OWNER, fiat_currency: "EUR", exchange_rate: 1.08 });
    expect(opts).toEqual(expect.objectContaining({ NX: true }));
  });

  it("rejects invalid fiat or rate", async () => {
    const { app } = buildApp();
    const badFiat = await request(app).post("/api/orders/market-meta").send({ orderRef: ORDER_REF, fiatCurrency: "GBP", exchangeRate: 1 });
    const badRate = await request(app).post("/api/orders/market-meta").send({ orderRef: ORDER_REF, fiatCurrency: "TRY", exchangeRate: 0 });
    expect(badFiat.status).toBe(400);
    expect(badRate.status).toBe(400);
  });

  it("GET /api/orders?status=ACTIVE filters fillable orders only", async () => {
    const { app, Order } = buildApp();
    const res = await request(app).get("/api/orders?status=ACTIVE");
    expect(res.status).toBe(200);
    expect(Order.find).toHaveBeenCalledWith({ status: { $in: ["OPEN", "PARTIALLY_FILLED"] } });
  });
});
