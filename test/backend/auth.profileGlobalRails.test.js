"use strict";

const express = require("express");
const request = require("supertest");

describe("PUT /api/auth/profile with catalog rails", () => {
  let app;
  let encryptSpy;
  let railGate;

  beforeEach(() => {
    jest.resetModules();
    jest.clearAllMocks();
    railGate = { open: true };

    jest.isolateModules(() => {
      const existingUser = {
        wallet_address: "0x1111111111111111111111111111111111111111",
        profileVersion: 1,
        lastBankChangeAt: null,
        bankChangeCount7d: 0,
        bankChangeCount30d: 0,
        payout_profile: { payout_details_enc: "enc", fingerprint: { version: 0 } },
        markBankProfileChanged: jest.fn(),
        recomputeBankChangeCounters: jest.fn(),
        save: jest.fn().mockResolvedValue(),
      };
      const UserMock = {
        findOne: jest.fn().mockReturnValue({ select: jest.fn().mockResolvedValue(existingUser) }),
        updateOne: jest.fn(async () => ({ matchedCount: 1 })),
      };
      encryptSpy = jest.fn().mockResolvedValue({
        rail: "X", country: "X", contact: { channel: null, value_enc: null },
        payout_details_enc: "enc", fingerprint: { version: 1, hash: "hash" },
      });

      jest.doMock("../../backend/scripts/middleware/auth", () => ({
        requireAuth: (req, _res, next) => { req.wallet = "0x1111111111111111111111111111111111111111"; next(); },
        requireSessionWalletMatch: (_req, _res, next) => next(),
      }));
      jest.doMock("../../backend/scripts/services/paymentRails", () => ({
        ...require("./helpers/paymentRailsPassthrough"),
        isRailEnabledStrict: async () => railGate.open,
      }));
      jest.doMock("../../backend/scripts/middleware/rateLimiter", () => ({
        authLimiter: (_req, _res, next) => next(),
        nonceLimiter: (_req, _res, next) => next(),
      }));
      jest.doMock("../../backend/scripts/services/siwe", () => ({
        generateNonce: jest.fn(), verifySiweSignature: jest.fn(), getSiweConfig: jest.fn(), issueJWT: jest.fn(),
        issueRefreshToken: jest.fn(), rotateRefreshToken: jest.fn(), revokeRefreshToken: jest.fn(), blacklistJWT: jest.fn(),
      }));
      jest.doMock("../../backend/scripts/services/encryption", () => ({
        encryptPayoutProfile: encryptSpy,
        decryptPayoutProfile: jest.fn().mockResolvedValue({
          rail: "TR_IBAN", country: "TR", contact: { channel: null, value: null },
          fields: { account_holder_name: "Test User", iban: "TR963456789012345678901234", bank_name: "Bank" },
        }),
        buildPayoutFingerprintHmac: jest.fn().mockImplementation(async (d) => JSON.stringify(d)),
      }));
      jest.doMock("../../backend/scripts/models/User", () => UserMock);
      jest.doMock("../../backend/scripts/models/Trade", () => ({ exists: jest.fn().mockResolvedValue(false) }));
      jest.doMock("../../backend/scripts/utils/logger", () => ({ info: jest.fn(), warn: jest.fn(), error: jest.fn() }));

      const router = require("../../backend/scripts/routes/auth");
      app = express();
      app.use(express.json());
      app.use("/api/auth", router);
      app.use((err, _req, res, _next) => res.status(500).json({ error: err.message }));
    });
  });

  const legacyNulls = { iban: null, routing_number: null, account_number: null, account_type: null, bic: null };
  const body = (rail, country, fields) => ({
    payoutProfile: {
      rail, country, contact: { channel: null, value: null },
      fields: { account_holder_name: "Test User", bank_name: null, ...legacyNulls, ...fields },
    },
  });
  const put = (b) => request(app).put("/api/auth/profile").send(b);

  it("accepts GB_FPS with catalog keys and stores the {holder, bank_name, ...catalog} canonical object", async () => {
    const res = await put(body("GB_FPS", "GB", { sort_code: "12 34 56", account_number: "12345678" }));
    expect(res.status).toBe(200);
    const stored = encryptSpy.mock.calls[0][0];
    expect(stored.rail).toBe("GB_FPS");
    expect(stored.details).toEqual({
      account_holder_name: "Test User", bank_name: null, account_number: "12345678", sort_code: "123456",
    });
  });

  it("accepts a catalog rail without the 7 legacy keys (only catalog keys)", async () => {
    const res = await put({
      payoutProfile: {
        rail: "BR_PIX", country: "BR", contact: { channel: null, value: null },
        fields: { account_holder_name: "Maria Silva", pix_key_type: "EMAIL", pix_key: "maria@example.com" },
      },
    });
    expect(res.status).toBe(200);
    expect(encryptSpy.mock.calls[0][0].details).toEqual({
      account_holder_name: "Maria Silva", bank_name: null, pix_key: "maria@example.com", pix_key_type: "email",
    });
  });

  it("rejects keys that are neither legacy nor catalog keys, and invalid catalog values", async () => {
    expect((await put(body("GB_FPS", "GB", { sort_code: "123456", account_number: "12345678", evil: "x" }))).status).toBe(400);
    expect((await put(body("GB_FPS", "GB", { sort_code: "12345", account_number: "12345678" }))).status).toBe(400);
    expect((await put(body("GB_FPS", "GB", { sort_code: "123456", account_number: "12345678", routing_number: "021000021" }))).status).toBe(400);
    expect((await put(body("NOPE_X", "GB", {}))).status).toBe(400);
  });

  it("enforces rail-country matching for catalog rails", async () => {
    expect((await put(body("GB_FPS", "US", { sort_code: "123456", account_number: "12345678" }))).status).toBe(400);
    expect((await put(body("MX_SPEI", "MX", { clabe: "002010077777777771" }))).status).toBe(200);
    expect((await put(body("MX_SPEI", "MX", { clabe: "002010077777777772" }))).status).toBe(400);
  });

  it("legacy SEPA rail now accepts the extended EPC countries (BG)", async () => {
    // BG IBAN (22 hane) mod-97 geçerli: BG80BNBG96611020345678
    const res = await put(body("SEPA_IBAN", "BG", { iban: "BG80 BNBG 9661 1020 3456 78" }));
    expect(res.status).toBe(200);
    expect(encryptSpy.mock.calls[0][0].details.iban).toBe("BG80BNBG96611020345678");
  });

  it("returns 409 PAYMENT_RAIL_DISABLED when the rail gate is closed (new rails default closed)", async () => {
    railGate.open = false;
    const res = await put(body("GB_FPS", "GB", { sort_code: "123456", account_number: "12345678" }));
    expect(res.status).toBe(409);
    expect(res.body.code).toBe("PAYMENT_RAIL_DISABLED");
  });

  it("legacy rails still store the exact legacy canonical object through the route", async () => {
    const res = await put(body("US_ACH", "US", {
      routing_number: "021000021", account_number: "1234567890", account_type: "checking", bank_name: "Chase",
    }));
    expect(res.status).toBe(200);
    expect(encryptSpy.mock.calls[0][0].details).toEqual({
      account_holder_name: "Test User", iban: null, routing_number: "021000021", account_number: "1234567890",
      account_type: "checking", bic: null, bank_name: "Chase",
    });
  });
});
