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
  const termsUpdateOne = jest.fn(async () => ({ acknowledged: true }));
  const termsFindOne = jest.fn(() => ({ lean: async () => null }));
  let router;
  jest.isolateModules(() => {
    jest.doMock("../../backend/scripts/models/TermsAcceptance", () => ({ updateOne: termsUpdateOne, findOne: termsFindOne }));
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
  return { app, verifySiweSignature, findOneAndUpdate, termsUpdateOne, termsFindOne };
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

  it("keeps the first signed acceptance per wallet and version as permanent evidence", async () => {
    const { CURRENT_TERMS_VERSION } = require("../../backend/scripts/config/terms");
    const { app, termsUpdateOne } = loadApp();
    const message = buildMessage(`Sign in to Araf Protocol. I accept the Araf Terms of Use v${CURRENT_TERMS_VERSION} and acknowledge that Araf is non-custodial software, not a party to my trades.`);
    await request(app).post("/api/auth/verify").send({ message, signature: SIG }).expect(200);
    const [filter, update, opts] = termsUpdateOne.mock.calls[0];
    expect(filter).toEqual({ wallet_address: WALLET, terms_version: CURRENT_TERMS_VERSION });
    // $setOnInsert only: later logins never overwrite the first acceptance.
    expect(Object.keys(update)).toEqual(["$setOnInsert"]);
    expect(update.$setOnInsert.signed_message).toBe(message);
    expect(update.$setOnInsert.signature).toBe(SIG);
    expect(update.$setOnInsert.chain_id).toBe(8453);
    expect(opts).toEqual({ upsert: true });
  });

  it("does not open a session when the evidence cannot be stored", async () => {
    const { CURRENT_TERMS_VERSION } = require("../../backend/scripts/config/terms");
    const { app, termsUpdateOne, findOneAndUpdate } = loadApp();
    termsUpdateOne.mockRejectedValueOnce(new Error("db down"));
    const message = buildMessage(`I accept the Araf Terms of Use v${CURRENT_TERMS_VERSION} and sign in.`);
    const res = await request(app).post("/api/auth/verify").send({ message, signature: SIG });
    expect(res.status).toBe(401);
    expect(findOneAndUpdate).not.toHaveBeenCalled();
  });

  it("tolerates a concurrent first acceptance (duplicate key)", async () => {
    const { CURRENT_TERMS_VERSION } = require("../../backend/scripts/config/terms");
    const { app, termsUpdateOne } = loadApp();
    termsUpdateOne.mockRejectedValueOnce(Object.assign(new Error("E11000"), { code: 11000 }));
    const message = buildMessage(`I accept the Araf Terms of Use v${CURRENT_TERMS_VERSION} and sign in.`);
    await request(app).post("/api/auth/verify").send({ message, signature: SIG }).expect(200);
  });

  it("terms-status answers per wallet for the current version without exposing the evidence", async () => {
    const { CURRENT_TERMS_VERSION } = require("../../backend/scripts/config/terms");
    const { app, termsFindOne } = loadApp();
    let res = await request(app).get(`/api/auth/terms-status?wallet=${WALLET.toUpperCase().replace("0X", "0x")}`).expect(200);
    expect(res.body).toEqual({ version: CURRENT_TERMS_VERSION, accepted: false });
    expect(termsFindOne.mock.calls[0][0]).toEqual({ wallet_address: WALLET, terms_version: CURRENT_TERMS_VERSION });
    termsFindOne.mockReturnValueOnce({ lean: async () => ({ _id: "x" }) });
    res = await request(app).get(`/api/auth/terms-status?wallet=${WALLET}`).expect(200);
    expect(res.body).toEqual({ version: CURRENT_TERMS_VERSION, accepted: true });
    await request(app).get("/api/auth/terms-status?wallet=nope").expect(400);
  });

  it("frontend and backend use the same terms version", () => {
    const { CURRENT_TERMS_VERSION } = require("../../backend/scripts/config/terms");
    const src = fs.readFileSync(path.join(__dirname, "../../frontend/src/app/legal/terms.js"), "utf8");
    expect(src).toContain(`export const TERMS_VERSION = '${CURRENT_TERMS_VERSION}';`);
  });
});
