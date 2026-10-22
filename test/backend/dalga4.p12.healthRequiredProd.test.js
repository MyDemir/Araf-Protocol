"use strict";

// [TR] P12: production'da ARAF_ESCROW_ADDRESS ve EXPECTED_CHAIN_ID eksikse readiness missingConfig bildirir
//      (expectedChain GERÇEK modül; diğer health testleri onu mock'lar).
// [EN] In production, missing ARAF_ESCROW_ADDRESS / EXPECTED_CHAIN_ID is reported by readiness (real chain guard).
jest.mock("mongoose", () => ({ connection: { readyState: 1 } }));
jest.mock("../../backend/scripts/config/redis", () => ({
  isReady: jest.fn(() => true),
  getRedisClient: jest.fn(() => ({ get: jest.fn().mockResolvedValue("1") })),
}));

describe("health readiness production zorunlu config", () => {
  const ORIGINAL_ENV = { ...process.env };
  const provider = {
    getBlockNumber: jest.fn().mockResolvedValue(100),
    getNetwork: jest.fn().mockResolvedValue({ chainId: 84532 }),
  };
  const worker = {
    getDiagnostics: jest.fn(() => ({ reconciliation: { lastReport: { dlqPending: 0 } } })),
    isRunning: true,
    _state: "live",
    _lastSafeCheckpointBlock: 99,
    _runtimeConfig: { WORKER_FINALITY_DEPTH: 6 },
  };

  beforeEach(() => {
    jest.resetModules();
    process.env = { ...ORIGINAL_ENV };
    Object.assign(process.env, {
      NODE_ENV: "production",
      MONGODB_URI: "mongodb://localhost:27017/test",
      REDIS_URL: "redis://localhost:6379",
      JWT_SECRET: "secret",
      SIWE_DOMAIN: "example.com",
      SIWE_URI: "https://example.com/login",
      ALLOWED_ORIGINS: "https://example.com",
      ARAF_ESCROW_ADDRESS: "0x1111111111111111111111111111111111111111",
      BASE_RPC_URL: "http://localhost:8545",
      EXPECTED_CHAIN_ID: "84532",
      WORKER_START_BLOCK: "1",
    });
  });
  afterAll(() => { process.env = { ...ORIGINAL_ENV }; });

  it("EXPECTED_CHAIN_ID yoksa missingConfig içinde bildirilir", async () => {
    delete process.env.EXPECTED_CHAIN_ID;
    const { getReadiness } = require("../../backend/scripts/services/health");
    const r = await getReadiness({ worker, provider });
    expect(r.missingConfig).toContain("EXPECTED_CHAIN_ID");
    expect(r.missingConfig.filter((k) => k === "EXPECTED_CHAIN_ID")).toHaveLength(1);
  });

  it("ARAF_ESCROW_ADDRESS yoksa missingConfig içinde bildirilir", async () => {
    delete process.env.ARAF_ESCROW_ADDRESS;
    const { getReadiness } = require("../../backend/scripts/services/health");
    const r = await getReadiness({ worker, provider });
    expect(r.missingConfig).toContain("ARAF_ESCROW_ADDRESS");
  });

  it("ikisi de tanımlıyken ikisi de eksik listesinde değil", async () => {
    const { getReadiness } = require("../../backend/scripts/services/health");
    const r = await getReadiness({ worker, provider });
    expect(r.missingConfig).not.toContain("EXPECTED_CHAIN_ID");
    expect(r.missingConfig).not.toContain("ARAF_ESCROW_ADDRESS");
  });
});
