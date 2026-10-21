"use strict";

const express = require("express");
const request = require("supertest");

const MAKER = "0x1111111111111111111111111111111111111111";

afterEach(() => { jest.useRealTimers(); jest.resetModules(); jest.clearAllMocks(); });

describe("P16 B3-16 settlement preview RPC zaman aşımı", () => {
  it("getCurrentAmounts asılı kalırsa 4 sn sonra 503 PREVIEW_UNAVAILABLE", async () => {
    const tradeDoc = { _id: "507f1f77bcf86cd799439015", maker_address: MAKER, taker_address: "0x" + "2".repeat(40), status: "CHALLENGED", onchain_escrow_id: "99" };
    const Trade = {
      findById: jest.fn().mockReturnValue({ select: jest.fn().mockReturnValue({ lean: jest.fn().mockResolvedValue(tradeDoc) }) }),
      find: jest.fn(),
      countDocuments: jest.fn(),
      findOne: jest.fn(),
    };
    let router;
    jest.isolateModules(() => {
      process.env.BASE_RPC_URL = "http://rpc.invalid";
      process.env.ARAF_ESCROW_ADDRESS = "0x" + "3".repeat(40);
      jest.doMock("ethers", () => {
        const actual = jest.requireActual("ethers");
        return { ...actual, ethers: { ...actual.ethers, Contract: function Contract() { return { getCurrentAmounts: () => new Promise(() => {}) }; } } };
      });
      jest.doMock("../../backend/scripts/services/rpcProvider", () => ({ getSharedProvider: () => ({}) }));
      jest.doMock("../../backend/scripts/services/expectedChain", () => ({ assertProviderExpectedChainOrThrow: jest.fn().mockResolvedValue(undefined) }));
      jest.doMock("../../backend/scripts/middleware/auth", () => ({
        requireAuth: (req, _res, next) => { req.wallet = MAKER; next(); },
        requireSessionWalletMatch: (_req, _res, next) => next(),
      }));
      jest.doMock("../../backend/scripts/middleware/rateLimiter", () => ({
        roomReadLimiter: (_r, _s, n) => n(),
        coordinationWriteLimiter: (_r, _s, n) => n(),
      }));
      jest.doMock("../../backend/scripts/models/Trade", () => Trade);
      jest.doMock("../../backend/scripts/models/User", () => ({ find: jest.fn() }));
      jest.doMock("../../backend/scripts/utils/logger", () => ({ info: jest.fn(), warn: jest.fn(), error: jest.fn() }));
      router = require("../../backend/scripts/routes/trades");
    });
    const app = express();
    app.use(express.json());
    app.use("/api/trades", router);

    jest.useFakeTimers({ doNotFake: ["nextTick", "setImmediate", "clearImmediate", "setInterval", "clearInterval", "queueMicrotask", "performance", "hrtime"] });
    const pending = request(app)
      .post("/api/trades/507f1f77bcf86cd799439015/settlement-proposal/preview")
      .send({ makerShareBps: 7000 })
      .then((r) => r);
    // İstek handler'a ulaşıp zamanlayıcıyı kurana kadar gerçek I/O turlarına izin ver.
    for (let i = 0; i < 40; i += 1) {
      await new Promise((resolve) => setImmediate(resolve));
      jest.advanceTimersByTime(500);
    }
    const res = await pending;
    expect(res.status).toBe(503);
    expect(res.body.code).toBe("PREVIEW_UNAVAILABLE");
  }, 15000);
});
