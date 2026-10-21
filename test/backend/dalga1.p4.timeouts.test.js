"use strict";

jest.useFakeTimers();

const { createRpcPool, RPC_REQUEST_TIMEOUT_MS, RPC_LOGS_REQUEST_TIMEOUT_MS } = require("../../backend/scripts/services/rpcProvider");

const neverTx = () => ({ hash: "0xstuck", wait: jest.fn(() => new Promise(() => {})) });
const quietLogger = () => ({ info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() });

describe("P4 B4-07: tx.wait üst süresi", () => {
  test("reputationDecay: takılan tx iş fonksiyonunu kilitlemez, uyarı basar", async () => {
    jest.resetModules();
    jest.doMock("../../backend/scripts/utils/logger", quietLogger);
    const logger = require("../../backend/scripts/utils/logger");
    const tx = neverTx();
    process.env.ARAF_ESCROW_ADDRESS = "0x" + "22".repeat(20);
    process.env.BASE_RPC_URL = "http://rpc.invalid";
    process.env.RELAYER_PRIVATE_KEY = "0x" + "11".repeat(32);
    jest.doMock("../../backend/scripts/services/rpcProvider", () => ({ getSharedProvider: jest.fn(() => ({})) }));
    jest.doMock("ethers", () => ({
      ethers: {
        Wallet: jest.fn(() => ({ address: "0xrelayer" })),
        Contract: jest.fn(() => ({
          cleanPeriod: jest.fn().mockResolvedValue(1n),
          getReputation: jest.fn().mockResolvedValue({ bannedUntil: 1, consecutiveBans: 1 }),
          decayReputation: jest.fn().mockResolvedValue(tx),
        })),
      },
    }));
    const User = require("../../backend/scripts/models/User");
    const chain = { select: () => chain, sort: () => chain, limit: () => chain, lean: async () => [{ wallet_address: "0xabc" }] };
    jest.spyOn(User, "find").mockReturnValue(chain);
    const { runReputationDecay } = require("../../backend/scripts/jobs/reputationDecay");
    const p = runReputationDecay();
    await jest.advanceTimersByTimeAsync(130_000);
    const res = await p;
    expect(tx.wait).toHaveBeenCalledWith(1, 120_000);
    expect(res.success).toBe(false);
    expect(logger.warn).toHaveBeenCalledWith(expect.stringContaining("0xstuck"));
  });

  test("rewardOutcomeRecorder: takılan tx zaman aşımıyla döner", async () => {
    jest.resetModules();
    jest.doMock("../../backend/scripts/utils/logger", quietLogger);
    const logger = require("../../backend/scripts/utils/logger");
    const tx = neverTx();
    const contract = { recordTradeOutcomes: jest.fn().mockResolvedValue(tx) };
    const Trade = require("../../backend/scripts/models/Trade");
    const chain = { select: () => chain, sort: () => chain, limit: () => chain, lean: async () => [{ onchain_escrow_id: "5" }] };
    jest.spyOn(Trade, "find").mockReturnValue(chain);
    const { runRewardOutcomeRecorder } = require("../../backend/scripts/jobs/rewardOutcomeRecorder");
    const p = runRewardOutcomeRecorder({ contract });
    await jest.advanceTimersByTimeAsync(130_000);
    const res = await p;
    expect(tx.wait).toHaveBeenCalledWith(1, 120_000);
    expect(res.success).toBe(false);
    expect(logger.warn).toHaveBeenCalledWith(expect.stringContaining("0xstuck"));
  });
});

describe("P4 B4-02: RPC üst süreleri", () => {
  beforeEach(() => { process.env.EXPECTED_CHAIN_ID = "8453"; });
  const mk = (send) => createRpcPool({
    urls: ["http://a"],
    probeFor: () => ({ getNetwork: async () => ({ chainId: 8453n }) }),
    createInner: () => ({ _send: send }),
    rateLimiterFor: () => ({ acquire: async () => {} }),
    log: quietLogger(),
  });

  test("takılan normal istek 10 sn'de TIMEOUT ile reddedilir", async () => {
    const pool = mk(() => new Promise(() => {}));
    const assertion = expect(pool.send({ method: "eth_blockNumber" })).rejects.toMatchObject({ code: "TIMEOUT" });
    await jest.advanceTimersByTimeAsync(RPC_REQUEST_TIMEOUT_MS + 100);
    await assertion;
  });

  test("eth_getLogs 10 sn'de kesilmez, uzun sürede kesilir", async () => {
    const pool = mk(() => new Promise(() => {}));
    let settled = false;
    const assertion = expect(pool.send({ method: "eth_getLogs" })).rejects.toMatchObject({ code: "TIMEOUT" }).then(() => { settled = true; });
    await jest.advanceTimersByTimeAsync(RPC_REQUEST_TIMEOUT_MS + 100);
    expect(settled).toBe(false);
    await jest.advanceTimersByTimeAsync(RPC_LOGS_REQUEST_TIMEOUT_MS);
    await assertion;
  });
});

describe("P4 B4-02: getReadiness RPC üst süresi", () => {
  test("takılan provider 5 sn içinde provider_unavailable verir", async () => {
    jest.resetModules();
    const { getReadiness } = require("../../backend/scripts/services/health");
    const provider = { getBlockNumber: () => new Promise(() => {}), getNetwork: () => new Promise(() => {}) };
    const p = getReadiness({ provider });
    await jest.advanceTimersByTimeAsync(5_000);
    const r = await p;
    expect(r.ok).toBe(false);
    expect(JSON.stringify(r)).toContain("provider_unavailable");
  });
});
