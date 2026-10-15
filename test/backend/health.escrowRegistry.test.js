"use strict";

jest.mock("mongoose", () => ({ connection: { readyState: 1 } }));
jest.mock("../../backend/scripts/config/redis", () => ({
  isReady: jest.fn(() => true),
  getRedisClient: jest.fn(() => ({ get: jest.fn(async () => "1") })),
}));
jest.mock("../../backend/scripts/services/expectedChain", () => ({
  EXPECTED_CHAIN_ENV: "EXPECTED_CHAIN_ID",
  resolveExpectedChainIdOrThrow: jest.fn(() => 84532),
}));

const ADDR = "0x" + "1".repeat(40);

describe("health: escrow registry info in /ready", () => {
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

  function load(guardStatus) {
    jest.resetModules();
    jest.doMock("../../backend/scripts/services/escrowRegistryGuard", () => ({
      getStatus: () => guardStatus,
    }));
    return require("../../backend/scripts/services/health");
  }

  beforeEach(() => {
    process.env = { ...ORIGINAL_ENV };
    process.env.NODE_ENV = "production";
    process.env.MONGODB_URI = "mongodb://localhost:27017/test";
    process.env.REDIS_URL = "redis://localhost:6379";
    process.env.JWT_SECRET = "secret";
    process.env.SIWE_DOMAIN = "example.com";
    process.env.SIWE_URI = "https://example.com/login";
    process.env.ARAF_ESCROW_ADDRESS = ADDR;
    process.env.BASE_RPC_URL = "http://localhost:8545";
    process.env.WORKER_START_BLOCK = "1";
    process.env.ALLOWED_ORIGINS = "https://example.com";
  });
  afterAll(() => { process.env = { ...ORIGINAL_ENV }; });

  const st = (over) => ({ mode: "warn", checked: true, ok: true, reason: null, blocking: false, ...over });

  it("baseline: compatible registry -> ok true", async () => {
    const { getReadiness } = load(st());
    const r = await getReadiness({ worker, provider });
    expect(r.ok).toBe(true);
    expect(r.checks.escrowRegistry).toBe(true);
  });

  it("warn + mismatch: info only, ok stays true", async () => {
    const { getReadiness, toPublicReadiness } = load(st({ ok: false, reason: "escrow_mismatch" }));
    const r = await getReadiness({ worker, provider });
    expect(r.ok).toBe(true);
    expect(r.escrowRegistry).toMatchObject({ mode: "warn", ok: false, reason: "escrow_mismatch" });
    expect(toPublicReadiness(r).escrowRegistry.reason).toBe("escrow_mismatch");
  });

  it("enforce + mismatch: ok false, reason exposed publicly", async () => {
    const { getReadiness, toPublicReadiness } = load(st({ mode: "enforce", ok: false, reason: "rotating", blocking: true }));
    const r = await getReadiness({ worker, provider });
    expect(r.ok).toBe(false);
    expect(r.checks.escrowRegistry).toBe(false);
    const pub = toPublicReadiness(r);
    expect(pub.ok).toBe(false);
    expect(pub.escrowRegistry).toEqual({ mode: "enforce", checked: true, ok: false, reason: "rotating" });
  });
});
