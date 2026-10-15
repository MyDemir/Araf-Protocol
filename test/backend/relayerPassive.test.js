"use strict";

// Relayer anahtarı bilinçli tanımsızken job'lar pasif sayılır (hata değil); gerçek yapılandırma hataları error kalır.

const ADDR = "0x" + "22".repeat(20);
const ZERO = "0x" + "0".repeat(40);
const ORIGINAL_ENV = { ...process.env };

function load(modPath, env) {
  jest.resetModules();
  process.env = { ...ORIGINAL_ENV };
  for (const k of ["BASE_RPC_URL", "RELAYER_PRIVATE_KEY", "ARAF_ESCROW_ADDRESS", "ARAF_REWARDS_ADDRESS"]) delete process.env[k];
  Object.assign(process.env, env);
  const logger = { info: jest.fn(), warn: jest.fn(), error: jest.fn() };
  jest.doMock("../../backend/scripts/utils/logger", () => logger);
  jest.doMock("../../backend/scripts/models/User", () => ({ find: jest.fn() }));
  jest.doMock("../../backend/scripts/models/Trade", () => ({ find: jest.fn(), updateMany: jest.fn() }));
  jest.doMock("../../backend/scripts/services/rpcProvider", () => ({ getSharedProvider: jest.fn(() => ({})) }));
  jest.doMock("ethers", () => ({
    ethers: {
      Wallet: jest.fn(() => ({ address: "0xrelayer" })),
      Contract: jest.fn(() => ({ cleanPeriod: jest.fn().mockRejectedValue(new Error("x")) })),
    },
  }));
  return { mod: require(modPath), logger };
}

const allLogs = (logger) => [...logger.info.mock.calls, ...logger.warn.mock.calls, ...logger.error.mock.calls].map((c) => String(c[0]));

describe("reputationDecay passive relayer", () => {
  const P = "../../backend/scripts/jobs/reputationDecay";

  it("(a) no key: single warn across runs, no error, skipped success", async () => {
    const { mod, logger } = load(P, { BASE_RPC_URL: "http://x", ARAF_ESCROW_ADDRESS: ADDR });
    const r1 = await mod.runReputationDecay();
    const r2 = await mod.runReputationDecay();
    expect(r1).toEqual({ success: true, skipped: "relayer_not_configured" });
    expect(r2).toEqual({ success: true, skipped: "relayer_not_configured" });
    expect(logger.warn).toHaveBeenCalledTimes(1);
    expect(logger.warn.mock.calls[0][0]).toContain("RELAYER_PRIVATE_KEY tanımsız; görev pasif");
    expect(logger.error).not.toHaveBeenCalled();
    expect(allLogs(logger).some((m) => m.includes("ARAF_ESCROW_ADDRESS"))).toBe(false);
  });

  it("(b) escrow address missing + key present: error, success:false", async () => {
    const { mod, logger } = load(P, { BASE_RPC_URL: "http://x", RELAYER_PRIVATE_KEY: "0x" + "11".repeat(32) });
    const r = await mod.runReputationDecay();
    expect(r.success).toBe(false);
    expect(logger.error.mock.calls.some((c) => c[0].includes("ARAF_ESCROW_ADDRESS tanımsız"))).toBe(true);
  });

  it("(c) zero escrow address: error, success:false", async () => {
    const { mod, logger } = load(P, { BASE_RPC_URL: "http://x", RELAYER_PRIVATE_KEY: "0x" + "11".repeat(32), ARAF_ESCROW_ADDRESS: ZERO });
    const r = await mod.runReputationDecay();
    expect(r.success).toBe(false);
    expect(logger.error.mock.calls.some((c) => c[0].includes("sıfır adres"))).toBe(true);
  });

  it("missing BASE_RPC_URL is a real error", async () => {
    const { mod, logger } = load(P, { RELAYER_PRIVATE_KEY: "0x" + "11".repeat(32), ARAF_ESCROW_ADDRESS: ADDR });
    const r = await mod.runReputationDecay();
    expect(r.success).toBe(false);
    expect(logger.error.mock.calls.some((c) => c[0].includes("BASE_RPC_URL tanımsız"))).toBe(true);
  });
});

describe("rewardOutcomeRecorder passive relayer", () => {
  const P = "../../backend/scripts/jobs/rewardOutcomeRecorder";

  it("(d) rewards address set + no key: single warn, skipped success", async () => {
    const { mod, logger } = load(P, { BASE_RPC_URL: "http://x", ARAF_REWARDS_ADDRESS: ADDR });
    const r1 = await mod.runRewardOutcomeRecorder();
    const r2 = await mod.runRewardOutcomeRecorder();
    expect(r1).toEqual(expect.objectContaining({ success: true, skipped: "relayer_not_configured" }));
    expect(r2).toEqual(expect.objectContaining({ success: true, skipped: "relayer_not_configured" }));
    expect(logger.warn).toHaveBeenCalledTimes(1);
    expect(logger.warn.mock.calls[0][0]).toContain("Proof of Peace kaydı pasif");
    expect(logger.error).not.toHaveBeenCalled();
  });

  it("(d) rewards address missing: existing info/passive behaviour", async () => {
    const { mod, logger } = load(P, { BASE_RPC_URL: "http://x" });
    const r = await mod.runRewardOutcomeRecorder();
    expect(r).toEqual(expect.objectContaining({ success: true, skipped: "rewards_not_configured" }));
    expect(logger.info.mock.calls[0][0]).toContain("ARAF_REWARDS_ADDRESS tanımsız; görev pasif");
    expect(logger.warn).not.toHaveBeenCalled();
    expect(logger.error).not.toHaveBeenCalled();
  });

  it("missing BASE_RPC_URL with rewards address is a real error", async () => {
    const { mod, logger } = load(P, { ARAF_REWARDS_ADDRESS: ADDR });
    await mod.runRewardOutcomeRecorder();
    expect(logger.error).toHaveBeenCalledTimes(1);
  });
});
