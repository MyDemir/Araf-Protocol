"use strict";

// Dalga 5 P15: B2-01 (limit logunda IP yok), B2-02 (PII anahtarı kimlikli istekte yalnız cüzdan),
// B2-14 (in-memory fallback: anahtar sınırı + Redis dönünce uyarı bayrağı sıfırlanır).

let mockReady = false;
let mockLogger;

function loadLimiters() {
  let mod;
  jest.isolateModules(() => {
    jest.doMock("../../backend/scripts/config/redis", () => ({
      isReady: () => mockReady,
      getRedisClient: () => ({ sendCommand: async () => "sha" }),
    }));
    jest.doMock("../../backend/scripts/models/User", () => ({ findOne: jest.fn() }));
    mockLogger = { info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() };
    jest.doMock("../../backend/scripts/utils/logger", () => mockLogger);
    mod = require("../../backend/scripts/middleware/rateLimiter");
  });
  return mod;
}

function call(limiter, req) {
  return new Promise((resolve) => {
    const res = {
      statusCode: 200,
      status(code) { this.statusCode = code; return this; },
      json(body) { resolve({ status: this.statusCode, body }); return this; },
    };
    limiter({ ip: "1.2.3.4", params: {}, query: {}, headers: {}, ...req }, res, () => resolve({ status: 200 }));
  });
}

describe("rateLimiter (Dalga 5 P15)", () => {
  beforeEach(() => { mockReady = false; });
  afterEach(() => jest.resetModules());

  test("B2-01: limit aşıldığında log satırı istemci IP'sini içermez", async () => {
    const l = loadLimiters();
    const ip = "203.0.113.77";
    for (let i = 0; i < 11; i += 1) await call(l.authLimiter, { ip });
    const warnings = mockLogger.warn.mock.calls.map((c) => String(c[0])).join("\n");
    expect(warnings).toMatch(/limit aşıldı/);
    expect(warnings).not.toContain(ip);
  });

  test("B2-14: in-memory anahtar sayısı sınırlıdır (en eski anahtar atılır)", async () => {
    const l = loadLimiters();
    const limiter = l.__private.makeInMemoryLimiter({
      label: "T", windowMs: 60_000, max: 1, maxKeys: 3,
      keyGenerator: (req) => req.k, errorMessage: () => ({ error: "x" }),
    });
    expect((await call(limiter, { k: "A" })).status).toBe(200);
    expect((await call(limiter, { k: "A" })).status).toBe(429);
    for (const k of ["B", "C", "D"]) expect((await call(limiter, { k })).status).toBe(200);
    // A sınır nedeniyle atıldı: yeniden 200 (bellek sınırlı)
    expect((await call(limiter, { k: "A" })).status).toBe(200);
  });

  test("B2-14: Redis geri gelip yine düşünce fallback uyarısı tekrar yazılır", async () => {
    const l = loadLimiters();
    const downWarnings = () => mockLogger.warn.mock.calls.filter((c) => /Redis down/.test(String(c[0]))).length;
    await call(l.authLimiter, {});
    await call(l.authLimiter, {});
    expect(downWarnings()).toBe(1);
    mockReady = true;
    await call(l.authLimiter, {});
    mockReady = false;
    await call(l.authLimiter, {});
    expect(downWarnings()).toBe(2);
  });
});
