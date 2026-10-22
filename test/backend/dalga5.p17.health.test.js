"use strict";

// B4-11: invalidateReadinessCache sonrası uçuştaki eski readiness sonucu önbelleği yeniden doldurmamalı.

jest.mock("mongoose", () => ({ connection: { readyState: 1 } }));
jest.mock("../../backend/scripts/config/redis", () => ({
  isReady: jest.fn(() => true),
  getRedisClient: jest.fn(() => ({ get: jest.fn().mockResolvedValue("1") })),
}));
jest.mock("../../backend/scripts/services/expectedChain", () => ({
  EXPECTED_CHAIN_ENV: "EXPECTED_CHAIN_ID",
  resolveExpectedChainIdOrThrow: jest.fn(() => 84532),
}));

describe("B4-11: readiness önbelleği invalidate yarışı", () => {
  const ORIGINAL_ENV = { ...process.env };
  const worker = { isRunning: true, _state: "live", _lastSafeCheckpointBlock: 99, _runtimeConfig: { WORKER_FINALITY_DEPTH: 6 }, getDiagnostics: () => ({}) };
  let health;

  beforeEach(() => {
    jest.resetModules();
    process.env = { ...ORIGINAL_ENV, NODE_ENV: "production", MONGODB_URI: "m", REDIS_URL: "r", JWT_SECRET: "s", SIWE_DOMAIN: "example.com" };
    health = require("../../backend/scripts/services/health");
    health._resetReadinessCacheForTests();
  });
  afterAll(() => { process.env = { ...ORIGINAL_ENV }; });

  it("uçuştaki eski sonuç invalidate'ten sonra önbelleğe yazılmaz; sonraki çağrı taze hesaplar", async () => {
    let releaseFirst;
    const getBlockNumber = jest.fn()
      .mockImplementationOnce(() => new Promise((resolve) => { releaseFirst = () => resolve(100); }))
      .mockResolvedValue(100);
    const provider = { getBlockNumber, getNetwork: jest.fn().mockResolvedValue({ chainId: 84532 }) };

    const inflight = health.getCachedReadiness({ worker, provider });
    await new Promise((r) => setImmediate(r));
    health.invalidateReadinessCache(); // onRecovered
    releaseFirst();
    await inflight;

    await health.getCachedReadiness({ worker, provider });
    expect(getBlockNumber).toHaveBeenCalledTimes(2); // eski sonuç önbelleğe yazılmadıysa ikinci çağrı yeniden hesaplar
  });

  it("invalidate olmadan önbellek çalışmaya devam eder", async () => {
    const provider = { getBlockNumber: jest.fn().mockResolvedValue(100), getNetwork: jest.fn().mockResolvedValue({ chainId: 84532 }) };
    await health.getCachedReadiness({ worker, provider });
    await health.getCachedReadiness({ worker, provider });
    expect(provider.getBlockNumber).toHaveBeenCalledTimes(1);
  });
});
