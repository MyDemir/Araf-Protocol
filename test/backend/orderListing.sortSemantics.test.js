"use strict";

const express = require("express");
const request = require("supertest");



function buildOrdersApp({ tokenMap = {} } = {}) {
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
    findOne: jest.fn(),
  };
  let router;
  jest.isolateModules(() => {
    jest.doMock("../../backend/scripts/middleware/auth", () => ({
      requireAuth: (_req, _res, next) => next(),
      requireSessionWalletMatch: (_req, _res, next) => next(),
    }));
    jest.doMock("../../backend/scripts/middleware/rateLimiter", () => ({
      marketReadLimiter: (_req, _res, next) => next(),
      ordersReadLimiter: (_req, _res, next) => next(),
      ordersWriteLimiter: (_req, _res, next) => next(),
    }));
    jest.doMock("../../backend/scripts/models/Order", () => Order);
    jest.doMock("../../backend/scripts/models/Trade", () => ({ find: jest.fn(), aggregate: jest.fn().mockResolvedValue([]) }));
    jest.doMock("../../backend/scripts/models/User", () => ({
      find: jest.fn().mockReturnValue({ select: jest.fn().mockReturnValue({ lean: jest.fn().mockResolvedValue([]) }) }),
    }));
    jest.doMock("../../backend/scripts/services/protocolConfig", () => ({ getConfig: jest.fn(() => ({ bondMap: {}, feeConfig: {}, cooldownConfig: {}, tokenMap })) }));
    router = require("../../backend/scripts/routes/orders");
  });
  const app = express();
  app.use(express.json());
  app.use("/api/orders", router);
  return { app, Order, findChain };
}

const USDT = "0x" + "a".repeat(40);
const DAI = "0x" + "b".repeat(40);

describe("orders and trades routes use deterministic _id tie-break sort semantics", () => {
  afterEach(() => {
    jest.resetModules();
    jest.clearAllMocks();
  });

  it("orders market route does not use lexicographic onchain_order_id tie-break", async () => {
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
      findOne: jest.fn(),
    };

    let router;
    jest.isolateModules(() => {
      jest.doMock("../../backend/scripts/middleware/auth", () => ({
        requireAuth: (_req, _res, next) => next(),
        requireSessionWalletMatch: (_req, _res, next) => next(),
      }));
      jest.doMock("../../backend/scripts/middleware/rateLimiter", () => ({
        marketReadLimiter: (_req, _res, next) => next(),
        ordersReadLimiter: (_req, _res, next) => next(),
        ordersWriteLimiter: (_req, _res, next) => next(),
      }));
      jest.doMock("../../backend/scripts/models/Order", () => Order);
      jest.doMock("../../backend/scripts/models/Trade", () => ({ find: jest.fn(), aggregate: jest.fn().mockResolvedValue([]) }));
      jest.doMock("../../backend/scripts/models/User", () => ({
        find: jest.fn().mockReturnValue({
          select: jest.fn().mockReturnValue({ lean: jest.fn().mockResolvedValue([]) }),
        }),
      }));
      jest.doMock("../../backend/scripts/services/protocolConfig", () => ({ getConfig: jest.fn(() => ({ bondMap: {}, feeConfig: {}, cooldownConfig: {}, tokenMap: {} })) }));
      router = require("../../backend/scripts/routes/orders");
    });

    const app = express();
    app.use(express.json());
    app.use("/api/orders", router);

    const res = await request(app).get("/api/orders");
    expect(res.status).toBe(200);

    const sortArg = findChain.sort.mock.calls[0][0];
    expect(sortArg._id).toBe(-1);
    expect(sortArg.onchain_order_id).toBeUndefined();
  });

  it("market search: fiat and min_amount (token units) are applied server-side per token decimals", async () => {
    const { app, Order } = buildOrdersApp({ tokenMap: { [USDT.toUpperCase().replace("0X", "0x")]: { decimals: 6 }, [DAI]: { decimals: 18 } } });
    const res = await request(app).get("/api/orders?status=ACTIVE&fiat=TRY&min_amount=50");
    expect(res.status).toBe(200);
    const filter = Order.find.mock.calls[0][0];
    expect(filter["market.fiat_currency"]).toBe("TRY");
    expect(filter.$or).toEqual([
      { token_address: USDT, "amounts.remaining_amount_num": { $gte: 50e6 } },
      { token_address: DAI, "amounts.remaining_amount_num": { $gte: 50e18 } },
    ]);
  });

  it("market search: min_amount with a token filter uses only that token's decimals", async () => {
    const { app, Order } = buildOrdersApp({ tokenMap: { [USDT]: { decimals: 6 }, [DAI]: { decimals: 18 } } });
    await request(app).get(`/api/orders?token_address=${DAI}&min_amount=2`).expect(200);
    expect(Order.find.mock.calls[0][0].$or).toEqual([{ token_address: DAI, "amounts.remaining_amount_num": { $gte: 2e18 } }]);
  });

  it("market search: min_amount fails closed (503) when token decimals are unknown", async () => {
    const { app } = buildOrdersApp({ tokenMap: {} });
    await request(app).get("/api/orders?min_amount=10").expect(503);
  });

  it("best_rate sort: lowest rate first for SELL_CRYPTO, highest for BUY_CRYPTO, unrated orders last", async () => {
    const sell = buildOrdersApp();
    await request(sell.app).get("/api/orders?side=SELL_CRYPTO&sort=best_rate").expect(200);
    const sellPipeline = sell.Order.aggregate.mock.calls[0][0];
    expect(sellPipeline.find((st) => st.$sort).$sort).toEqual({ _rateMissing: 1, "market.exchange_rate": 1, _id: -1 });
    expect(sellPipeline.find((st) => st.$project).$project).toMatchObject({ market: 1, amounts: 1 });
    expect(sellPipeline.find((st) => st.$project).$project.payout_snapshot).toBeUndefined();

    const buy = buildOrdersApp();
    await request(buy.app).get("/api/orders?side=BUY_CRYPTO&sort=best_rate").expect(200);
    expect(buy.Order.aggregate.mock.calls[0][0].find((st) => st.$sort).$sort["market.exchange_rate"]).toBe(-1);
    expect(buy.Order.find).not.toHaveBeenCalled();
  });

  it("trades history route uses _id tie-break instead of onchain_escrow_id lexicographic sort", async () => {
    const findChain = {
      select: jest.fn().mockReturnThis(),
      sort: jest.fn().mockReturnThis(),
      skip: jest.fn().mockReturnThis(),
      limit: jest.fn().mockReturnThis(),
      lean: jest.fn().mockResolvedValue([]),
    };
    const Trade = {
      find: jest.fn(() => findChain),
      countDocuments: jest.fn().mockResolvedValue(0),
    };

    let router;
    jest.isolateModules(() => {
      jest.doMock("../../backend/scripts/middleware/auth", () => ({
        requireAuth: (req, _res, next) => { req.wallet = "0x1111111111111111111111111111111111111111"; next(); },
        requireSessionWalletMatch: (_req, _res, next) => next(),
      }));
      jest.doMock("../../backend/scripts/middleware/rateLimiter", () => ({
        roomReadLimiter: (_req, _res, next) => next(),
        coordinationWriteLimiter: (_req, _res, next) => next(),
      }));
      jest.doMock("../../backend/scripts/models/Trade", () => Trade);
      jest.doMock("../../backend/scripts/models/User", () => ({
        find: jest.fn().mockReturnValue({
          select: jest.fn().mockReturnValue({ lean: jest.fn().mockResolvedValue([]) }),
        }),
      }));
      jest.doMock("../../backend/scripts/utils/logger", () => ({ info: jest.fn(), warn: jest.fn(), error: jest.fn() }));
      router = require("../../backend/scripts/routes/trades");
    });

    const app = express();
    app.use(express.json());
    app.use("/api/trades", router);

    const res = await request(app).get("/api/trades/history");
    expect(res.status).toBe(200);

    const sortArg = findChain.sort.mock.calls[0][0];
    expect(sortArg["timers.resolved_at"]).toBe(-1);
    expect(sortArg._id).toBe(-1);
    expect(sortArg.onchain_escrow_id).toBeUndefined();
  });
});
