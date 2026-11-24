"use strict";

// Escrow kapsamı: okuma uçları (orders, trades, pii, receipts) eski kontratın aynı numaralı belgesini görmez.

const express = require("express");
const request = require("supertest");
const { createMemoryModel } = require("./helpers/memoryModel");

const ACTIVE = "0xa042e919978e929e4d8f9bef73f9a2bcffefee8d";
const LEGACY = "legacy:0x1111111111111111111111111111111111111111";
const MAKER = "0x1111111111111111111111111111111111111111";
const TAKER = "0x2222222222222222222222222222222222222222";
const STRANGER = "0x3333333333333333333333333333333333333333";
const ORIGINAL_ENV = { ...process.env };

beforeEach(() => {
  process.env.ARAF_ESCROW_ADDRESS = ACTIVE;
  process.env.EXPECTED_CHAIN_ID = "84532";
});
afterEach(() => {
  process.env = { ...ORIGINAL_ENV };
  jest.resetModules();
  jest.clearAllMocks();
});

const logger = () => ({ info: jest.fn(), warn: jest.fn(), error: jest.fn() });

// ── orders ────────────────────────────────────────────────────────────────────
function buildOrdersApp(orders) {
  const Order = createMemoryModel(orders);
  let router;
  jest.isolateModules(() => {
    jest.doMock("../../backend/scripts/middleware/auth", () => ({
      requireAuth: (req, _res, next) => { req.wallet = MAKER; next(); },
      requireSessionWalletMatch: (_req, _res, next) => next(),
    }));
    jest.doMock("../../backend/scripts/services/paymentRails", () => require("./helpers/paymentRailsPassthrough"));
    jest.doMock("../../backend/scripts/middleware/rateLimiter", () => ({
      marketReadLimiter: (_req, _res, next) => next(),
      ordersReadLimiter: (_req, _res, next) => next(),
      ordersWriteLimiter: (_req, _res, next) => next(),
    }));
    jest.doMock("../../backend/scripts/config/redis", () => ({ getRedisClient: () => ({ set: jest.fn(), get: jest.fn() }) }));
    jest.doMock("../../backend/scripts/utils/logger", logger);
    jest.doMock("../../backend/scripts/models/Order", () => Order);
    jest.doMock("../../backend/scripts/models/Trade", () => ({ aggregate: jest.fn().mockResolvedValue([]) }));
    jest.doMock("../../backend/scripts/models/User", () => ({
      findOne: jest.fn().mockReturnValue({ select: jest.fn().mockReturnValue({ lean: jest.fn().mockResolvedValue(null) }) }),
      find: jest.fn().mockReturnValue({ select: jest.fn().mockReturnValue({ lean: jest.fn().mockResolvedValue([]) }) }),
    }));
    jest.doMock("../../backend/scripts/services/protocolConfig", () => ({ getConfig: jest.fn(() => ({})) }));
    router = require("../../backend/scripts/routes/orders");
  });
  const app = express();
  app.use(express.json());
  app.use("/api/orders", router);
  return { app, Order };
}

const orderDoc = (escrow, id, extra = {}) => ({
  escrow_address: escrow,
  chain_id: escrow === ACTIVE ? 84532 : undefined,
  onchain_order_id: id,
  owner_address: MAKER,
  side: "SELL_CRYPTO",
  status: "OPEN",
  ...extra,
});

describe("orders: escrow scope", () => {
  it("market list returns only the active escrow's order when both escrows have #2", async () => {
    const { app } = buildOrdersApp([orderDoc(LEGACY, "2", { marker: "old" }), orderDoc(ACTIVE, "2", { marker: "new" })]);
    const res = await request(app).get("/api/orders");
    expect(res.status).toBe(200);
    expect(res.body.total).toBe(1);
    expect(res.body.orders).toHaveLength(1);
    expect(res.body.orders[0].marker).toBe("new");
  });

  it("GET /orders/2 is 404 when only the old contract has #2, and 200 for the active one", async () => {
    const legacyOnly = buildOrdersApp([orderDoc(LEGACY, "2")]);
    expect((await request(legacyOnly.app).get("/api/orders/2")).status).toBe(404);

    const both = buildOrdersApp([orderDoc(LEGACY, "2", { marker: "old" }), orderDoc(ACTIVE, "2", { marker: "new" })]);
    const res = await request(both.app).get("/api/orders/2");
    expect(res.status).toBe(200);
    expect(res.body.order.marker).toBe("new");
  });

  it("/my lists only the active escrow's orders", async () => {
    const { app } = buildOrdersApp([orderDoc(LEGACY, "2"), orderDoc(ACTIVE, "5")]);
    const res = await request(app).get("/api/orders/my");
    expect(res.status).toBe(200);
    expect(res.body.orders.map((o) => o.onchain_order_id)).toEqual(["5"]);
  });

  it("security: market filter includes escrow_address (not an empty filter)", async () => {
    const { app, Order } = buildOrdersApp([orderDoc(ACTIVE, "2")]);
    await request(app).get("/api/orders");
    expect(Order.find.mock.calls[0][0]).toMatchObject({ escrow_address: ACTIVE });
    expect(Order.countDocuments.mock.calls[0][0]).toMatchObject({ escrow_address: ACTIVE });
  });

  it("production without scope env fails closed (no data returned)", async () => {
    const { app } = buildOrdersApp([orderDoc(ACTIVE, "2")]);
    process.env.NODE_ENV = "production";
    delete process.env.ARAF_ESCROW_ADDRESS;
    const res = await request(app).get("/api/orders");
    expect(res.status).not.toBe(200);
    expect(res.body.orders).toBeUndefined();
  });
});

// ── trades ────────────────────────────────────────────────────────────────────
function buildTradesApp(trades, wallet = MAKER) {
  const Trade = createMemoryModel(trades);
  let router;
  jest.isolateModules(() => {
    jest.doMock("../../backend/scripts/middleware/auth", () => ({
      requireAuth: (req, _res, next) => { req.wallet = wallet; next(); },
      requireSessionWalletMatch: (_req, _res, next) => next(),
    }));
    jest.doMock("../../backend/scripts/middleware/rateLimiter", () => ({
      roomReadLimiter: (_req, _res, next) => next(),
      coordinationWriteLimiter: (_req, _res, next) => next(),
    }));
    jest.doMock("../../backend/scripts/models/Trade", () => Trade);
    jest.doMock("../../backend/scripts/models/User", () => ({
      find: jest.fn().mockReturnValue({ select: jest.fn().mockReturnValue({ lean: jest.fn().mockResolvedValue([]) }) }),
    }));
    jest.doMock("../../backend/scripts/services/encryption", () => ({ hmacDigest: jest.fn().mockResolvedValue("h") }));
    jest.doMock("../../backend/scripts/utils/logger", logger);
    router = require("../../backend/scripts/routes/trades");
  });
  const app = express();
  app.use(express.json());
  app.use("/api/trades", router);
  return { app, Trade };
}

const OID_LEGACY = "a".repeat(24);
const OID_ACTIVE = "b".repeat(24);
const tradeDoc = (escrow, _id, extra = {}) => ({
  _id,
  escrow_address: escrow,
  onchain_escrow_id: "2",
  maker_address: MAKER,
  taker_address: TAKER,
  status: "PAID",
  ...extra,
});

describe("trades: escrow scope", () => {
  it("/:id returns 404 for a legacy-escrow trade even for its own party; active trade is served", async () => {
    const { app } = buildTradesApp([tradeDoc(LEGACY, OID_LEGACY), tradeDoc(ACTIVE, OID_ACTIVE)]);
    expect((await request(app).get(`/api/trades/${OID_LEGACY}`)).status).toBe(404);
    const ok = await request(app).get(`/api/trades/${OID_ACTIVE}`);
    expect(ok.status).toBe(200);
    expect(ok.body.trade._id).toBe(OID_ACTIVE);
  });

  it("party check stays: a stranger gets 403 on the active trade", async () => {
    const { app } = buildTradesApp([tradeDoc(ACTIVE, OID_ACTIVE)], STRANGER);
    expect((await request(app).get(`/api/trades/${OID_ACTIVE}`)).status).toBe(403);
  });

  it("/by-escrow/2 resolves to the active escrow's trade, never the legacy one", async () => {
    const { app } = buildTradesApp([tradeDoc(LEGACY, OID_LEGACY, { marker: "old" }), tradeDoc(ACTIVE, OID_ACTIVE, { marker: "new" })]);
    const res = await request(app).get("/api/trades/by-escrow/2");
    expect(res.status).toBe(200);
    expect(res.body.trade._id).toBe(OID_ACTIVE);

    const legacyOnly = buildTradesApp([tradeDoc(LEGACY, OID_LEGACY)]);
    expect((await request(legacyOnly.app).get("/api/trades/by-escrow/2")).status).toBe(404);
  });

  it("settlement-proposal and chargeback-ack: legacy trade -> 404, nothing written", async () => {
    const { app, Trade } = buildTradesApp([tradeDoc(LEGACY, OID_LEGACY)]);
    expect((await request(app).get(`/api/trades/${OID_LEGACY}/settlement-proposal`)).status).toBe(404);
    const ack = await request(app).post(`/api/trades/${OID_LEGACY}/chargeback-ack`).send({});
    expect(ack.status).toBe(404);
    expect(Trade.docs[0].chargeback_ack).toBeUndefined();
  });

  it("chargeback-ack on the active trade still works for the maker", async () => {
    const { app, Trade } = buildTradesApp([tradeDoc(ACTIVE, OID_ACTIVE)]);
    const ack = await request(app).post(`/api/trades/${OID_ACTIVE}/chargeback-ack`).send({});
    expect(ack.status).toBe(201);
    expect(Trade.findOneAndUpdate.mock.calls[0][0]).toMatchObject({ escrow_address: ACTIVE });
  });

  it("/my and /history only list the active escrow", async () => {
    const { app } = buildTradesApp([
      tradeDoc(LEGACY, OID_LEGACY, { status: "PAID" }),
      tradeDoc(ACTIVE, OID_ACTIVE, { status: "PAID", onchain_escrow_id: "9" }),
    ]);
    // memoryModel $or desteği eşitlik üzerinden; maker eşleşmesi için filtre doğrudan çalışır.
    const res = await request(app).get("/api/trades/my");
    expect(res.status).toBe(200);
    expect(res.body.trades.map((t) => t.onchain_escrow_id)).toEqual(["9"]);
  });
});

// ── pii ───────────────────────────────────────────────────────────────────────
function buildPiiApp(trades, wallet) {
  const Trade = createMemoryModel(trades);
  const decryptField = jest.fn().mockResolvedValue(JSON.stringify({ iban: "TR00", account_holder_name: "X" }));
  let router;
  jest.isolateModules(() => {
    jest.doMock("../../backend/scripts/middleware/auth", () => ({
      requireAuth: (req, _res, next) => { req.wallet = wallet; next(); },
      requireSessionWalletMatch: (_req, _res, next) => next(),
      requirePIIToken: (_req, _res, next) => next(),
    }));
    jest.doMock("../../backend/scripts/middleware/rateLimiter", () => ({
      piiProfileLimiter: (_req, _res, next) => next(),
      piiTakerNameLimiter: (_req, _res, next) => next(),
      piiTokenRequestLimiter: (_req, _res, next) => next(),
      piiFetchLimiter: (_req, _res, next) => next(),
    }));
    jest.doMock("../../backend/scripts/services/identityNormalizationGuard", () => ({ verifyIdentityNormalization: jest.fn().mockResolvedValue() }));
    jest.doMock("../../backend/scripts/models/Trade", () => Trade);
    jest.doMock("../../backend/scripts/models/User", () => ({ findOne: jest.fn() }));
    jest.doMock("../../backend/scripts/services/encryption", () => ({ decryptField, decryptPayoutProfile: jest.fn() }));
    jest.doMock("../../backend/scripts/services/siwe", () => ({ issuePIIToken: jest.fn(() => "tok") }));
    jest.doMock("../../backend/scripts/services/onchainTradeState", () => ({ isTradeActiveOnChain: jest.fn().mockResolvedValue(true) }));
    jest.doMock("../../backend/scripts/utils/logger", logger);
    router = require("../../backend/scripts/routes/pii");
  });
  const app = express();
  app.use("/api/pii", router);
  return { app, decryptField };
}

const piiTrade = (escrow, _id) => ({
  _id,
  escrow_address: escrow,
  onchain_escrow_id: "2",
  maker_address: MAKER,
  taker_address: TAKER,
  status: "PAID",
  payout_snapshot: {
    is_complete: true,
    maker: { payout_details_enc: "enc", rail: "TR_IBAN" },
    taker: { payout_details_enc: "enc" },
  },
});

describe("pii: escrow scope", () => {
  it("taker-name for the same id in another escrow -> 404 and no decryption", async () => {
    const { app, decryptField } = buildPiiApp([piiTrade(LEGACY, OID_LEGACY)], MAKER);
    const res = await request(app).get("/api/pii/taker-name/2");
    expect(res.status).toBe(404);
    expect(decryptField).not.toHaveBeenCalled();
  });

  it("taker-name: a foreign wallet still gets 403 on the active trade", async () => {
    const { app, decryptField } = buildPiiApp([piiTrade(ACTIVE, OID_ACTIVE)], STRANGER);
    const res = await request(app).get("/api/pii/taker-name/2");
    expect(res.status).toBe(403);
    expect(decryptField).not.toHaveBeenCalled();
  });

  it("request-token and /:tradeId: legacy trade -> 404, no decryption; stranger on active -> 403", async () => {
    const legacy = buildPiiApp([piiTrade(LEGACY, OID_LEGACY)], TAKER);
    expect((await request(legacy.app).post(`/api/pii/request-token/${OID_LEGACY}`)).status).toBe(404);
    expect((await request(legacy.app).get(`/api/pii/${OID_LEGACY}`)).status).toBe(404);
    expect(legacy.decryptField).not.toHaveBeenCalled();

    const stranger = buildPiiApp([piiTrade(ACTIVE, OID_ACTIVE)], STRANGER);
    expect((await request(stranger.app).post(`/api/pii/request-token/${OID_ACTIVE}`)).status).toBe(403);
    expect((await request(stranger.app).get(`/api/pii/${OID_ACTIVE}`)).status).toBe(403);
    expect(stranger.decryptField).not.toHaveBeenCalled();
  });

  it("the active trade's taker is still served (scope does not break the happy path)", async () => {
    const { app, decryptField } = buildPiiApp([piiTrade(ACTIVE, OID_ACTIVE)], TAKER);
    const res = await request(app).get(`/api/pii/${OID_ACTIVE}`);
    expect(res.status).toBe(200);
    expect(decryptField).toHaveBeenCalled();
  });
});

// ── receipts ──────────────────────────────────────────────────────────────────
function buildReceiptsApp(trades) {
  const Trade = createMemoryModel(trades);
  let router;
  jest.isolateModules(() => {
    jest.doMock("../../backend/scripts/middleware/auth", () => ({
      requireAuth: (req, _res, next) => { req.wallet = TAKER; next(); },
      requireSessionWalletMatch: (_req, _res, next) => next(),
    }));
    jest.doMock("../../backend/scripts/middleware/rateLimiter", () => ({ receiptUploadLimiter: (_req, _res, next) => next() }));
    jest.doMock("../../backend/scripts/services/encryption", () => ({ encryptField: jest.fn(async () => "enc") }));
    jest.doMock("../../backend/scripts/models/Trade", () => Trade);
    jest.doMock("../../backend/scripts/utils/logger", logger);
    router = require("../../backend/scripts/routes/receipts");
  });
  const app = express();
  app.use("/api/receipts", router);
  return { app, Trade };
}

describe("receipts: escrow scope", () => {
  const upload = (app) =>
    request(app)
      .post("/api/receipts/upload")
      .field("onchainEscrowId", "2")
      .attach("receipt", Buffer.from("%PDF-1.4 test"), { filename: "r.pdf", contentType: "application/pdf" });

  it("legacy-escrow trade with the same id -> 404, receipt not written", async () => {
    const { app, Trade } = buildReceiptsApp([{ ...piiTrade(LEGACY, OID_LEGACY), status: "LOCKED" }]);
    const res = await upload(app);
    expect(res.status).toBe(404);
    expect(Trade.docs[0].evidence).toBeUndefined();
  });

  it("active trade accepts the receipt and the write is scoped", async () => {
    const { app, Trade } = buildReceiptsApp([
      { ...piiTrade(LEGACY, OID_LEGACY), status: "LOCKED" },
      { ...piiTrade(ACTIVE, OID_ACTIVE), status: "LOCKED" },
    ]);
    const res = await upload(app);
    expect(res.status).toBe(201);
    expect(Trade.findOneAndUpdate.mock.calls[0][0]).toMatchObject({ escrow_address: ACTIVE, onchain_escrow_id: "2" });
    expect(Trade.docs.find((d) => d.escrow_address === LEGACY).evidence).toBeUndefined();
    expect(Trade.docs.find((d) => d.escrow_address === ACTIVE).evidence.receipt_encrypted).toBe("enc");
  });
});
