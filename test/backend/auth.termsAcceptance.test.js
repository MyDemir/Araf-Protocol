"use strict";

const express = require("express");
const request = require("supertest");
const fs = require("fs");
const path = require("path");
const { SiweMessage } = require("siwe");

const WALLET = "0x1111111111111111111111111111111111111111";
const SIG = "0x" + "ab".repeat(65);

function buildMessage(statement) {
  return new SiweMessage({
    domain: "localhost",
    address: "0x1111111111111111111111111111111111111111",
    statement,
    uri: "https://localhost",
    version: "1",
    chainId: 8453,
    nonce: "abcdefgh12345678",
    issuedAt: new Date().toISOString(),
  }).prepareMessage();
}

function loadApp() {
  process.env.JWT_SECRET = "a".repeat(80);
  const verifySiweSignature = jest.fn(async () => WALLET);
  const findOneAndUpdate = jest.fn(async () => ({
    checkBanExpiry: jest.fn(async () => {}),
    toPublicProfile: () => ({ wallet_address: WALLET }),
  }));
  let router;
  jest.isolateModules(() => {
    jest.doMock("../../backend/scripts/middleware/rateLimiter", () => ({
      authLimiter: (_req, _res, next) => next(),
      nonceLimiter: (_req, _res, next) => next(),
    }));
    jest.doMock("../../backend/scripts/middleware/auth", () => ({
      requireAuth: (_req, _res, next) => next(),
      requireSessionWalletMatch: (_req, _res, next) => next(),
    }));
    jest.doMock("../../backend/scripts/services/siwe", () => ({
      generateNonce: jest.fn(),
      verifySiweSignature,
      getSiweConfig: jest.fn(() => ({ domain: "localhost", uri: "https://localhost" })),
      issueJWT: jest.fn(() => "jwt"),
      issueRefreshToken: jest.fn(async () => "refresh"),
      rotateRefreshToken: jest.fn(),
      revokeRefreshToken: jest.fn(),
      blacklistJWT: jest.fn(),
    }));
    jest.doMock("../../backend/scripts/services/encryption", () => ({
      encryptPayoutProfile: jest.fn(),
      decryptPayoutProfile: jest.fn(),
      buildPayoutFingerprint: jest.fn(() => "fingerprint"),
    }));
    jest.doMock("../../backend/scripts/models/User", () => ({ findOneAndUpdate, findOne: jest.fn() }));
    jest.doMock("../../backend/scripts/models/Trade", () => ({ exists: jest.fn() }));
    router = require("../../backend/scripts/routes/auth");
  });
  const app = express();
  app.use(express.json());
  app.use("/api/auth", router);
  return { app, verifySiweSignature, findOneAndUpdate };
}

describe("SIWE login requires signed acceptance of the terms", () => {
  afterEach(() => jest.resetModules());

  it("rejects a signature whose statement does not accept the terms, before consuming the nonce", async () => {
    const { app, verifySiweSignature, findOneAndUpdate } = loadApp();
    const res = await request(app).post("/api/auth/verify").send({ message: buildMessage("Sign in to Araf Protocol."), signature: SIG });
    expect(res.status).toBe(401);
    expect(res.body.code).toBe("TERMS_NOT_ACCEPTED");
    expect(verifySiweSignature).not.toHaveBeenCalled();
    expect(findOneAndUpdate).not.toHaveBeenCalled();
  });

  it("rejects an unknown terms version", async () => {
    const { app } = loadApp();
    const res = await request(app).post("/api/auth/verify").send({ message: buildMessage("I accept the Araf Terms of Use v1999-01-01 and sign in."), signature: SIG });
    expect(res.status).toBe(401);
    expect(res.body.code).toBe("TERMS_NOT_ACCEPTED");
  });

  it("records version, time and message digest when the current terms are accepted", async () => {
    const { CURRENT_TERMS_VERSION } = require("../../backend/scripts/config/terms");
    const { app, findOneAndUpdate } = loadApp();
    const message = buildMessage(`Sign in to Araf Protocol. I accept the Araf Terms of Use v${CURRENT_TERMS_VERSION} and acknowledge that Araf is non-custodial software, not a party to my trades.`);
    const res = await request(app).post("/api/auth/verify").send({ message, signature: SIG });
    expect(res.status).toBe(200);
    expect(res.body.terms.version).toBe(CURRENT_TERMS_VERSION);
    const update = findOneAndUpdate.mock.calls[0][1].$set;
    expect(update.terms_accepted_version).toBe(CURRENT_TERMS_VERSION);
    expect(update.terms_accepted_at).toBeInstanceOf(Date);
    expect(update.terms_acceptance_message_sha256).toMatch(/^[0-9a-f]{64}$/);
  });

  it("frontend and backend use the same terms version", () => {
    const { CURRENT_TERMS_VERSION } = require("../../backend/scripts/config/terms");
    const src = fs.readFileSync(path.join(__dirname, "../../frontend/src/app/legal/terms.js"), "utf8");
    expect(src).toContain(`export const TERMS_VERSION = '${CURRENT_TERMS_VERSION}';`);
  });
});
