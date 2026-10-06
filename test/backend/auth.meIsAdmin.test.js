"use strict";

const express = require("express");
const request = require("supertest");
const cookieParser = require("cookie-parser");

const WALLET = "0x1111111111111111111111111111111111111111";
const ADMIN = "0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa";

let mockUserExists = jest.fn().mockResolvedValue(null);
function buildApp(adminWallets) {
  jest.resetModules();
  jest.doMock("../../backend/scripts/models/User", () => ({ exists: (...a) => mockUserExists(...a) }));
  if (adminWallets === undefined) delete process.env.ADMIN_WALLETS;
  else process.env.ADMIN_WALLETS = adminWallets;
  jest.doMock("../../backend/scripts/services/siwe", () => ({
    verifyJWT: jest.fn((token) => {
      if (token === "good") return { type: "auth", sub: WALLET, jti: "j1" };
      if (token === "admin") return { type: "auth", sub: ADMIN, jti: "j2" };
      throw new Error("invalid");
    }),
    isJWTBlacklisted: jest.fn().mockResolvedValue(false),
    revokeRefreshToken: jest.fn().mockResolvedValue(),
    blacklistJWT: jest.fn().mockResolvedValue(),
  }));
  jest.doMock("../../backend/scripts/middleware/rateLimiter", () => new Proxy({}, { get: () => (_req, _res, next) => next() }));
  const app = express();
  app.use(express.json());
  app.use(cookieParser());
  app.use("/api/auth", require("../../backend/scripts/routes/auth"));
  return app;
}

const me = (app, token, wallet) =>
  request(app).get("/api/auth/me").set("Cookie", [`araf_jwt=${token}`]).set("x-wallet-address", wallet);

describe("/api/auth/me isAdmin", () => {
  afterAll(() => { delete process.env.ADMIN_WALLETS; });

  it("is true for a wallet listed in ADMIN_WALLETS (case/space insensitive)", async () => {
    const app = buildApp(` ${ADMIN.toUpperCase().replace("0X", "0x")} , 0xbbbb `);
    const res = await me(app, "admin", ADMIN);
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ wallet: ADMIN, authenticated: true, isAdmin: true, hasPayoutProfile: false });
  });

  it("is false for a normal wallet", async () => {
    const res = await me(buildApp(ADMIN), "good", WALLET);
    expect(res.body.isAdmin).toBe(false);
  });

  it("is false when ADMIN_WALLETS is unset or empty", async () => {
    expect((await me(buildApp(undefined), "admin", ADMIN)).body.isAdmin).toBe(false);
    expect((await me(buildApp(""), "admin", ADMIN)).body.isAdmin).toBe(false);
  });
});

describe("/api/auth/me hasPayoutProfile", () => {
  afterEach(() => { mockUserExists = jest.fn().mockResolvedValue(null); });

  it("is true only as a boolean when a saved profile exists (no PII)", async () => {
    mockUserExists = jest.fn().mockResolvedValue({ _id: "x" });
    const res = await me(buildApp(undefined), "good", WALLET);
    expect(res.body.hasPayoutProfile).toBe(true);
    expect(Object.keys(res.body).sort()).toEqual(["authenticated", "hasPayoutProfile", "isAdmin", "wallet"]);
  });

  it("is false when no saved profile exists", async () => {
    const res = await me(buildApp(undefined), "good", WALLET);
    expect(res.body.hasPayoutProfile).toBe(false);
  });

  it("is null (unknown) when the lookup fails, so clients fail closed", async () => {
    mockUserExists = jest.fn().mockRejectedValue(new Error("db down"));
    const res = await me(buildApp(undefined), "good", WALLET);
    expect(res.status).toBe(200);
    expect(res.body.hasPayoutProfile).toBeNull();
  });
});
