"use strict";

// B2-02: authenticated wallet must share one PII bucket regardless of source IP.
// Redis reported not ready so the process-local fallback (same key scheme) is exercised.

function loadLimiters() {
  let mod;
  jest.isolateModules(() => {
    jest.doMock("../../backend/scripts/config/redis", () => ({
      isReady: () => false,
      getRedisClient: () => ({ sendCommand: async () => "sha" }),
    }));
    jest.doMock("../../backend/scripts/models/User", () => ({ findOne: jest.fn() }));
    jest.doMock("../../backend/scripts/utils/logger", () => ({
      info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn(),
    }));
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
    limiter({ params: {}, query: {}, ...req }, res, () => resolve({ status: 200 }));
  });
}

describe("PII limiter key (B2-02)", () => {
  afterEach(() => jest.resetModules());

  test("same wallet from different IPs shares one bucket", async () => {
    const l = loadLimiters();
    const params = { tradeId: "a".repeat(24) };
    for (let i = 0; i < 5; i += 1) {
      expect((await call(l.piiFetchLimiter, { ip: `10.0.0.${i}`, wallet: "0xabc", params })).status).toBe(200);
    }
    expect((await call(l.piiFetchLimiter, { ip: "10.0.9.9", wallet: "0xabc", params })).status).toBe(429);
  });

  test("wallet case differences map to the same bucket", async () => {
    const l = loadLimiters();
    for (let i = 0; i < 10; i += 1) {
      const wallet = i % 2 ? "0xABC" : "0xabc";
      expect((await call(l.piiProfileLimiter, { ip: `10.0.1.${i}`, wallet })).status).toBe(200);
    }
    expect((await call(l.piiProfileLimiter, { ip: "10.0.1.99", wallet: "0xAbC" })).status).toBe(429);
  });

  test("different wallets and different trades stay separate", async () => {
    const l = loadLimiters();
    const tradeA = { tradeId: "a".repeat(24) };
    const tradeB = { tradeId: "b".repeat(24) };
    for (let i = 0; i < 5; i += 1) {
      await call(l.piiFetchLimiter, { ip: "1.1.1.1", wallet: "0xabc", params: tradeA });
    }
    expect((await call(l.piiFetchLimiter, { ip: "1.1.1.1", wallet: "0xabc", params: tradeA })).status).toBe(429);
    expect((await call(l.piiFetchLimiter, { ip: "1.1.1.1", wallet: "0xdef", params: tradeA })).status).toBe(200);
    expect((await call(l.piiFetchLimiter, { ip: "1.1.1.1", wallet: "0xabc", params: tradeB })).status).toBe(200);
  });

  test("without a wallet the bucket is per IP", async () => {
    const l = loadLimiters();
    for (let i = 0; i < 10; i += 1) {
      expect((await call(l.piiProfileLimiter, { ip: "2.2.2.2" })).status).toBe(200);
    }
    expect((await call(l.piiProfileLimiter, { ip: "2.2.2.2" })).status).toBe(429);
    expect((await call(l.piiProfileLimiter, { ip: "3.3.3.3" })).status).toBe(200);
  });
});
