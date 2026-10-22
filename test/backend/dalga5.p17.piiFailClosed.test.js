"use strict";

// B4-13 / B3-18: production'da zincir durumu okunamazsa (null) PII açılmaz (fail-closed, 503).
// Geliştirme/test ortamında mevcut davranış (mirror karar verir) korunur.

const express = require("express");
const request = require("supertest");

const WALLET = "0x1111111111111111111111111111111111111111";
const MAKER = "0x2222222222222222222222222222222222222222";
const TRADE_ID = "a".repeat(24);

describe("PII routes: zincir durumu bilinmiyorsa production'da fail-closed", () => {
  const savedEnv = process.env.NODE_ENV;
  afterEach(() => { process.env.NODE_ENV = savedEnv; jest.resetModules(); jest.clearAllMocks(); });

  function buildApp(activeOnChain) {
    const decryptField = jest.fn().mockResolvedValue(JSON.stringify({ iban: "TR00", account_holder_name: "X" }));
    const trade = {
      maker_address: MAKER,
      taker_address: WALLET,
      status: "PAID",
      onchain_escrow_id: "42",
      payout_snapshot: {
        is_complete: true,
        maker: { payout_details_enc: "enc", rail: "TR_IBAN" },
        taker: { payout_details_enc: "enc" },
      },
    };
    let router;
    jest.isolateModules(() => {
      jest.doMock("../../backend/scripts/middleware/auth", () => ({
        requireAuth: (req, _res, next) => { req.wallet = req.headers["x-test-wallet"] || WALLET; next(); },
        requireSessionWalletMatch: (_req, _res, next) => next(),
        requirePIIToken: (_req, _res, next) => next(),
      }));
      jest.doMock("../../backend/scripts/middleware/rateLimiter", () => ({ piiProfileLimiter: (_req, _res, next) => next(), piiTakerNameLimiter: (_req, _res, next) => next(), piiTokenRequestLimiter: (_req, _res, next) => next(), piiFetchLimiter: (_req, _res, next) => next() }));
      jest.doMock("../../backend/scripts/services/identityNormalizationGuard", () => ({
        verifyIdentityNormalization: jest.fn().mockResolvedValue(),
      }));
      const lean = () => ({ lean: jest.fn().mockResolvedValue(trade) });
      jest.doMock("../../backend/scripts/models/Trade", () => ({
        findById: jest.fn(() => ({ select: jest.fn(lean) })),
        findOne: jest.fn(() => ({ select: jest.fn(lean) })),
      }));
      jest.doMock("../../backend/scripts/models/User", () => ({ findOne: jest.fn() }));
      jest.doMock("../../backend/scripts/services/encryption", () => ({ decryptField, decryptPayoutProfile: jest.fn() }));
      jest.doMock("../../backend/scripts/services/siwe", () => ({ issuePIIToken: jest.fn() }));
      jest.doMock("../../backend/scripts/services/onchainTradeState", () => ({
        isTradeActiveOnChain: jest.fn().mockResolvedValue(activeOnChain),
      }));
      jest.doMock("../../backend/scripts/utils/logger", () => ({ info: jest.fn(), warn: jest.fn(), error: jest.fn() }));
      router = require("../../backend/scripts/routes/pii");
    });
    const app = express();
    app.use("/api/pii", router);
    return { app, decryptField };
  }

  it("production + null: taker PII 503, şifre çözülmez", async () => {
    const { app, decryptField } = buildApp(null);
    process.env.NODE_ENV = "production";
    const res = await request(app).get(`/api/pii/${TRADE_ID}`);
    expect(res.status).toBe(503);
    expect(res.body.code).toBe("ONCHAIN_STATE_UNAVAILABLE");
    expect(decryptField).not.toHaveBeenCalled();
  });

  it("production + null: maker taker-name 503, şifre çözülmez", async () => {
    const { app, decryptField } = buildApp(null);
    process.env.NODE_ENV = "production";
    const res = await request(app).get("/api/pii/taker-name/42").set("x-test-wallet", MAKER);
    expect(res.status).toBe(503);
    expect(decryptField).not.toHaveBeenCalled();
  });

  it("production + zincir aktif diyor: PII servis edilir", async () => {
    const { app, decryptField } = buildApp(true);
    process.env.NODE_ENV = "production";
    const res = await request(app).get(`/api/pii/${TRADE_ID}`);
    expect(res.status).toBe(200);
    expect(decryptField).toHaveBeenCalled();
  });

  it("test ortamı + null: mevcut davranış, mirror karar verir", async () => {
    const { app } = buildApp(null);
    process.env.NODE_ENV = "test";
    const res = await request(app).get(`/api/pii/${TRADE_ID}`);
    expect(res.status).toBe(200);
  });
});
