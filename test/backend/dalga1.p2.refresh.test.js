"use strict";

// B2-03: /api/auth/refresh AuthError -> 401 + cookies cleared; infra error -> 503 constant code, cookies kept.

const express = require("express");
const request = require("supertest");

function loadApp(rotateRefreshToken) {
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
      verifySiweSignature: jest.fn(),
      getSiweConfig: jest.fn(() => ({ domain: "localhost", uri: "https://localhost" })),
      issueJWT: jest.fn(),
      issueRefreshToken: jest.fn(),
      rotateRefreshToken,
      revokeRefreshToken: jest.fn(),
      blacklistJWT: jest.fn(),
    }));
    jest.doMock("../../backend/scripts/services/encryption", () => ({}));
    jest.doMock("../../backend/scripts/models/User", () => ({ findOneAndUpdate: jest.fn(), findOne: jest.fn() }));
    jest.doMock("../../backend/scripts/models/Trade", () => ({ exists: jest.fn() }));
    router = require("../../backend/scripts/routes/auth");
  });
  const app = express();
  app.use(express.json());
  app.use((req, _res, next) => { req.cookies = { araf_refresh: "tok" }; next(); });
  app.use("/api/auth", router);
  return app;
}

function authError(code) {
  const e = new Error("Refresh token geçersiz veya süresi dolmuş.");
  e.name = "AuthError"; e.isAuthError = true; e.code = code; e.statusCode = 401;
  return e;
}

describe("POST /api/auth/refresh hata ayrımı (B2-03)", () => {
  afterEach(() => jest.resetModules());

  test("AuthError -> 401 ve çerezler silinir", async () => {
    const res = await request(loadApp(jest.fn().mockRejectedValue(authError("REFRESH_INVALID")))).post("/api/auth/refresh").send({});
    expect(res.status).toBe(401);
    const set = res.headers["set-cookie"] || [];
    expect(set.some((c) => c.startsWith("araf_jwt=;"))).toBe(true);
    expect(set.some((c) => c.startsWith("araf_refresh=;"))).toBe(true);
  });

  test("altyapı hatası -> 503 sabit kod, çerez silinmez, ham mesaj sızmaz", async () => {
    const res = await request(loadApp(jest.fn().mockRejectedValue(new Error("redis://user:pw@10.0.0.5:6379 ECONNREFUSED"))))
      .post("/api/auth/refresh").send({});
    expect(res.status).toBe(503);
    expect(res.body).toEqual({ error: "AUTH_REFRESH_UNAVAILABLE" });
    expect(JSON.stringify(res.body)).not.toMatch(/redis|ECONNREFUSED|10\.0/);
    expect(res.headers["set-cookie"]).toBeUndefined();
  });
});
