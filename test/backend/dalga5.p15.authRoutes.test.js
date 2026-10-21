"use strict";

// Dalga 5 P15 (routes/auth.js): B2-08 (dizi parametre -> 400), B2-11 (logout: blacklist başarısızsa 503),
// B2-12 (/nonce 503 genel mesaj), B2-23 (clearCookie secure).

const request = require("supertest");
const express = require("express");
const cookieParser = require("cookie-parser");

const WALLET = "0x1111111111111111111111111111111111111111";

function build({ siweOverrides = {} } = {}) {
  let app;
  const siweMock = {
    generateNonce: jest.fn().mockResolvedValue("nonce123"),
    verifySiweSignature: jest.fn(),
    getSiweConfig: jest.fn().mockReturnValue({ domain: "d", uri: "https://d" }),
    issueJWT: jest.fn(),
    issueRefreshToken: jest.fn(),
    rotateRefreshToken: jest.fn().mockResolvedValue({ token: "t", refreshToken: null, wallet: WALLET }),
    revokeRefreshToken: jest.fn().mockResolvedValue(),
    peekRefreshTokenOwner: jest.fn().mockResolvedValue(null),
    blacklistJWT: jest.fn().mockResolvedValue(true),
    verifyJWT: jest.fn().mockReturnValue({ type: "auth", sub: WALLET }),
    ...siweOverrides,
  };
  jest.isolateModules(() => {
    jest.doMock("../../backend/scripts/middleware/auth", () => ({
      requireAuth: (_q, _s, n) => n(),
      requireSessionWalletMatch: (_q, _s, n) => n(),
    }));
    jest.doMock("../../backend/scripts/middleware/rateLimiter", () => ({
      authLimiter: (_q, _s, n) => n(),
      nonceLimiter: (_q, _s, n) => n(),
    }));
    jest.doMock("../../backend/scripts/services/siwe", () => siweMock);
    jest.doMock("../../backend/scripts/services/encryption", () => ({}));
    jest.doMock("../../backend/scripts/models/User", () => ({}));
    jest.doMock("../../backend/scripts/models/Trade", () => ({}));
    jest.doMock("../../backend/scripts/utils/logger", () => ({ info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() }));
    const router = require("../../backend/scripts/routes/auth");
    app = express();
    app.use(express.json());
    app.use(cookieParser());
    app.use("/api/auth", router);
    app.use((err, _q, res, _n) => res.status(500).json({ error: err.message }));
  });
  return { app, siweMock };
}

afterEach(() => jest.resetModules());

describe("GET /nonce (B2-08, B2-12)", () => {
  test("B2-08: wallet[]=... dizisi 500 değil 400 döner", async () => {
    const { app } = build();
    const res = await request(app).get(`/api/auth/nonce?wallet[]=${WALLET}`);
    expect(res.status).toBe(400);
  });

  test("B2-12: SIWE yapılandırma hatası 503 olur ama ayrıntı sızmaz", async () => {
    const { app } = build({
      siweOverrides: { getSiweConfig: jest.fn(() => { throw new Error("SIWE config uyuşmazlığı: SIWE_URI host=evil, SIWE_DOMAIN=x"); }) },
    });
    const res = await request(app).get(`/api/auth/nonce?wallet=${WALLET}`);
    expect(res.status).toBe(503);
    expect(JSON.stringify(res.body)).not.toMatch(/SIWE_URI|SIWE_DOMAIN|evil/);
  });
});

describe("POST /refresh (B2-08)", () => {
  test("body.wallet string değilse 400", async () => {
    const { app } = build();
    const res = await request(app).post("/api/auth/refresh").set("Cookie", ["araf_refresh=" + "a".repeat(64)]).send({ wallet: [WALLET] });
    expect(res.status).toBe(400);
  });
});

describe("POST /logout (B2-11, B2-23)", () => {
  test("blacklist yazımı başarısızsa 503 + çerezler yine temizlenir", async () => {
    const { app, siweMock } = build({ siweOverrides: { blacklistJWT: jest.fn().mockResolvedValue(false) } });
    const res = await request(app).post("/api/auth/logout").set("Cookie", ["araf_jwt=abc"]);
    expect(res.status).toBe(503);
    expect(res.body.code).toBe("LOGOUT_REVOKE_INCOMPLETE");
    expect(siweMock.revokeRefreshToken).toHaveBeenCalledWith(WALLET);
    const cleared = res.headers["set-cookie"].join("\n");
    expect(cleared).toMatch(/araf_jwt=;/);
    expect(cleared).toMatch(/araf_refresh=;/);
  });

  test("başarılı logout 200 kalır", async () => {
    const { app } = build();
    const res = await request(app).post("/api/auth/logout").set("Cookie", ["araf_jwt=abc"]);
    expect(res.status).toBe(200);
  });

  test("B2-23: production'da clearCookie Secure niteliği taşır", async () => {
    const prev = process.env.NODE_ENV;
    process.env.NODE_ENV = "production";
    try {
      const { app } = build();
      const res = await request(app).post("/api/auth/logout").set("Cookie", ["araf_jwt=abc"]);
      const cleared = res.headers["set-cookie"];
      expect(cleared.length).toBeGreaterThanOrEqual(2);
      for (const c of cleared) expect(c).toMatch(/;\s*Secure/i);
    } finally {
      process.env.NODE_ENV = prev;
    }
  });
});
