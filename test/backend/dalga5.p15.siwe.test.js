"use strict";

// Dalga 5 P15: B2-10 (JWT algoritması sabit, refresh biçim kontrolü), B2-11 (blacklistJWT sonuç döner),
// B2-13 (legacy SCAN env ile kapatılabilir), B2-18 (PII token süresi üst sınırı).

const jwt = require("jsonwebtoken");

const JWT_SECRET = "k7Q2vX9pL4mZ8rT1wB6nY3cF5hJ0dS2gA7eU9iO4qW1xR8tV6yN3bM5zK2jH0lP9sD4fG7aC1";
const WALLET = "0x1111111111111111111111111111111111111111";

function loadSiwe(redis, env = {}) {
  let svc;
  const saved = { ...process.env };
  Object.assign(process.env, { JWT_SECRET }, env);
  jest.isolateModules(() => {
    jest.doMock("../../backend/scripts/config/redis", () => ({ getRedisClient: () => redis, isReady: () => true }));
    jest.doMock("../../backend/scripts/utils/logger", () => ({ info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() }));
    svc = jest.requireActual("../../backend/scripts/services/siwe");
  });
  process.env = saved;
  return svc;
}

afterEach(() => jest.resetModules());

describe("B2-10 JWT algoritması", () => {
  test("HS256 dışı algoritmayla imzalı token reddedilir", () => {
    const svc = loadSiwe({});
    const hs512 = jwt.sign({ sub: WALLET, type: "auth", jti: "x" }, JWT_SECRET, { algorithm: "HS512", expiresIn: "5m" });
    expect(() => svc.verifyJWT(hs512)).toThrow();
    const hs256 = jwt.sign({ sub: WALLET, type: "auth", jti: "x" }, JWT_SECRET, { algorithm: "HS256", expiresIn: "5m" });
    expect(svc.verifyJWT(hs256).sub).toBe(WALLET);
    expect(svc.verifyJWT(svc.issueJWT(WALLET)).type).toBe("auth");
  });

  test("biçimsiz refresh token Redis'e gitmeden reddedilir", async () => {
    const redis = { get: jest.fn(), set: jest.fn() };
    const svc = loadSiwe(redis);
    await expect(svc.rotateRefreshToken("../x:y")).rejects.toMatchObject({ statusCode: 401 });
    expect(redis.get).not.toHaveBeenCalled();
  });
});

describe("B2-11 blacklistJWT sonucu", () => {
  test("Redis yazımı başarısızsa false, başarılıysa true", async () => {
    const token = jwt.sign({ sub: WALLET, type: "auth", jti: "j1" }, JWT_SECRET, { expiresIn: "5m" });
    const bad = loadSiwe({ setEx: jest.fn().mockRejectedValue(new Error("down")) });
    expect(await bad.blacklistJWT(token)).toBe(false);
    const good = loadSiwe({ setEx: jest.fn().mockResolvedValue("OK") });
    expect(await good.blacklistJWT(token)).toBe(true);
  });
});

describe("B2-13 legacy SCAN", () => {
  test("REFRESH_LEGACY_SCAN=false iken tüm keyspace taranmaz", async () => {
    const redis = { sMembers: jest.fn().mockResolvedValue([]), scan: jest.fn().mockResolvedValue({ cursor: 0, keys: [] }), del: jest.fn() };
    process.env.REFRESH_LEGACY_SCAN = "false";
    const svc = loadSiwe(redis);
    await svc.revokeRefreshToken(WALLET);
    delete process.env.REFRESH_LEGACY_SCAN;
    expect(redis.scan).not.toHaveBeenCalled();
  });
});

describe("B2-18 PII token süresi", () => {
  function ttlOf(env) {
    const svc = loadSiwe({}, env);
    const t = svc.issuePIIToken(WALLET, "a".repeat(24));
    const p = jwt.decode(t);
    return p.exp - p.iat;
  }
  test("varsayılan 15 dk; üst sınırı aşan env 15 dk'ya indirilir", () => {
    expect(ttlOf({ PII_TOKEN_EXPIRES_IN: "" })).toBe(900);
    expect(ttlOf({ PII_TOKEN_EXPIRES_IN: "30d" })).toBe(900);
    expect(ttlOf({ PII_TOKEN_EXPIRES_IN: "1h" })).toBe(900);
    expect(ttlOf({ PII_TOKEN_EXPIRES_IN: "5m" })).toBe(300);
  });
});

describe("B2-12 açılışta SIWE yapılandırma doğrulaması", () => {
  test("production'da SIWE_URI host'u SIWE_DOMAIN'den farklıysa ya da EXPECTED_CHAIN_ID yoksa fırlatır", () => {
    const base = { NODE_ENV: "production", SIWE_DOMAIN: "araf.xyz", SIWE_URI: "https://araf.xyz", EXPECTED_CHAIN_ID: "8453" };
    const svc = loadSiwe({});
    const withEnv = (env, fn) => {
      const saved = { ...process.env };
      Object.assign(process.env, env);
      try { return fn(); } finally { process.env = saved; }
    };
    expect(() => withEnv(base, () => svc.assertSiweBootConfigOrThrow())).not.toThrow();
    expect(() => withEnv({ ...base, SIWE_URI: "https://evil.example" }, () => svc.assertSiweBootConfigOrThrow())).toThrow(/SIWE/);
    expect(() => withEnv({ ...base, EXPECTED_CHAIN_ID: "" }, () => svc.assertSiweBootConfigOrThrow())).toThrow(/EXPECTED_CHAIN_ID/);
  });

  test("app.js bootstrap bu doğrulamayı çağırıp başarısızlıkta çıkar", () => {
    const src = require("fs").readFileSync(require.resolve("../../backend/scripts/app"), "utf8");
    expect(src).toMatch(/assertSiweBootConfigOrThrow\(\)/);
  });
});
