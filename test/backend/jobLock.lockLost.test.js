"use strict";

// D1: kilit yenilemesi 0 dönerse ya da hata verirse kilit KAYBEDİLMİŞ sayılır; işler yeni öğe/tx başlatmadan durur.
// D2: set desteği olmayan istemci yalnız NODE_ENV=test'te kilitsiz çalışır; `!redis` her zaman atlar.

jest.mock("../../backend/scripts/utils/logger", () => ({ info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() }));

const { createJobLock, RENEW_LUA } = require("../../backend/scripts/services/jobLock");

function fakeRedis({ renew }) {
  const kv = new Map();
  return {
    kv,
    set: jest.fn(async (k, v, o = {}) => { if (o.NX && kv.has(k)) return null; kv.set(k, v); return "OK"; }),
    eval: jest.fn(async (script, { keys, arguments: args }) => {
      if (script === RENEW_LUA) return renew();
      if (kv.get(keys[0]) === args[0]) { kv.delete(keys[0]); return 1; }
      return 0;
    }),
  };
}
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

describe("jobLock: kilit kaybı (D1)", () => {
  it("yenileme 0 dönünce isLockLost() true olur ve sonuçta lost bildirilir", async () => {
    const redis = fakeRedis({ renew: () => 0 });
    const lock = createJobLock({ getClient: () => redis, token: "m", ttlMs: 30 });
    let seen;
    const res = await lock.runExclusive("dlq", async (ctx) => { await sleep(60); seen = ctx.isLockLost(); });
    expect(seen).toBe(true);
    expect(res.lost).toBe(true);
  });

  it("yenileme hata verince de kilit kaybedilmiş sayılır", async () => {
    const redis = fakeRedis({ renew: () => { throw new Error("ECONNRESET"); } });
    const lock = createJobLock({ getClient: () => redis, token: "m", ttlMs: 30 });
    let seen;
    const res = await lock.runExclusive("dlq", async (ctx) => { await sleep(60); seen = ctx.isLockLost(); });
    expect(seen).toBe(true);
    expect(res.lost).toBe(true);
  });

  it("yenileme zaman aşımına uğrarsa kilit kaybedilmiş sayılır", async () => {
    const redis = fakeRedis({ renew: () => new Promise(() => {}) });
    const lock = createJobLock({ getClient: () => redis, token: "m", ttlMs: 30, commandTimeoutMs: 10 });
    let seen;
    const res = await lock.runExclusive("dlq", async (ctx) => { await sleep(80); seen = ctx.isLockLost(); });
    expect(seen).toBe(true);
    expect(res.lost).toBe(true);
  });

  it("yenileme başarılıysa lost=false", async () => {
    const redis = fakeRedis({ renew: () => 1 });
    const lock = createJobLock({ getClient: () => redis, token: "m", ttlMs: 30 });
    const res = await lock.runExclusive("dlq", async (ctx) => { await sleep(60); return ctx.isLockLost(); });
    expect(res).toMatchObject({ ran: true, result: false, lost: false });
  });
});

describe("jobLock: istemci yok / set yok (D2)", () => {
  const savedEnv = process.env.NODE_ENV;
  afterEach(() => { process.env.NODE_ENV = savedEnv; });

  it("istemci null ise (test dahil) iş atlanır", async () => {
    const lock = createJobLock({ getClient: () => null, token: "m" });
    const job = jest.fn();
    expect(await lock.runExclusive("dlq", job)).toEqual({ ran: false, skipped: "lock_redis_unavailable" });
    expect(job).not.toHaveBeenCalled();
  });

  it("set'siz istemci NODE_ENV=test dışında atlanır", async () => {
    process.env.NODE_ENV = "production";
    const lock = createJobLock({ getClient: () => ({ get: jest.fn() }), token: "m" });
    const job = jest.fn();
    expect(await lock.runExclusive("dlq", job)).toEqual({ ran: false, skipped: "lock_redis_unavailable" });
    expect(job).not.toHaveBeenCalled();
  });

  it("set'siz istemci NODE_ENV=test iken çalışır", async () => {
    process.env.NODE_ENV = "test";
    const lock = createJobLock({ getClient: () => ({ get: jest.fn() }), token: "m" });
    const job = jest.fn(async () => 5);
    expect(await lock.runExclusive("dlq", job)).toMatchObject({ ran: true, result: 5 });
  });
});

describe("işler kilit kaybında durur (D1)", () => {
  beforeEach(() => jest.resetModules());

  it("reputationDecay: kilit kaybolunca sonraki kullanıcı için tx gönderilmez", async () => {
    const wallets = ["0x" + "1".repeat(40), "0x" + "2".repeat(40), "0x" + "3".repeat(40)];
    let lost = false;
    const decay = jest.fn(async () => { lost = true; return { hash: "0xa", wait: jest.fn().mockResolvedValue({ blockNumber: 1 }) }; });
    jest.doMock("../../backend/scripts/models/User", () => ({
      find: jest.fn(() => ({
        select: jest.fn().mockReturnThis(), sort: jest.fn().mockReturnThis(), limit: jest.fn().mockReturnThis(),
        lean: jest.fn(async () => wallets.map((w) => ({ wallet_address: w, consecutive_bans: 1, banned_until: new Date("2025-01-01") }))),
      })),
    }));
    jest.doMock("ethers", () => ({
      ethers: {
        JsonRpcProvider: jest.fn(() => ({})), Wallet: jest.fn(() => ({ address: "0xr" })),
        Contract: jest.fn(() => ({
          decayReputation: decay,
          getReputation: jest.fn(async () => ({ bannedUntil: Math.floor(new Date("2025-01-01").getTime() / 1000), consecutiveBans: 1, lastNegativeEventAt: 0 })),
          cleanPeriod: jest.fn(async () => 1),
        })),
      },
    }));
    process.env.BASE_RPC_URL = "http://localhost:8545";
    process.env.RELAYER_PRIVATE_KEY = "0x" + "11".repeat(32);
    process.env.ARAF_ESCROW_ADDRESS = "0x" + "22".repeat(20);
    const { runReputationDecay } = require("../../backend/scripts/jobs/reputationDecay");

    const res = await runReputationDecay({ isLockLost: () => lost });

    expect(decay).toHaveBeenCalledTimes(1); // yalnız ilk kullanıcı
    expect(res.success).toBe(false);
    expect(res.error).toBe("lock_lost");
  });

  it("rewardOutcomeRecorder: kilit kayıpsa recordTradeOutcomes gönderilmez", async () => {
    jest.doMock("../../backend/scripts/models/Trade", () => ({
      find: jest.fn(() => {
        const q = { select: () => q, sort: () => q, limit: () => q, lean: jest.fn().mockResolvedValue([{ onchain_escrow_id: "3" }]) };
        return q;
      }),
      updateMany: jest.fn(),
    }));
    const { runRewardOutcomeRecorder } = require("../../backend/scripts/jobs/rewardOutcomeRecorder");
    const contract = {
      epochDuration: jest.fn().mockResolvedValue(604800n), claimDelay: jest.fn().mockResolvedValue(86400n),
      recordTradeOutcomes: jest.fn(),
    };
    const res = await runRewardOutcomeRecorder({ contract, isLockLost: () => true });
    expect(contract.recordTradeOutcomes).not.toHaveBeenCalled();
    expect(res).toMatchObject({ success: false, error: "lock_lost" });
  });

  it("dlqProcessor: kilit kaybolunca sonraki girdi re-drive edilmez", async () => {
    const list = [1, 2, 3].map((i) => JSON.stringify({ eventName: "X", transactionHash: `0x${i}`, logIndex: i, attempt: 0, idempotencyKey: `k${i}` }));
    const redis = {
      lLen: jest.fn(async () => list.length),
      lRange: jest.fn(async () => [...list]),
      lRem: jest.fn(async () => 1), sRem: jest.fn(), sAdd: jest.fn(), lPush: jest.fn(), rPush: jest.fn(), lTrim: jest.fn(),
    };
    let lost = false;
    const reDriveEvent = jest.fn(async () => { lost = true; return { success: true }; });
    jest.doMock("../../backend/scripts/config/redis", () => ({ getRedisClient: () => redis }));
    jest.doMock("../../backend/scripts/services/eventListener", () => ({
      isRunning: true, contract: {}, reDriveEvent, markEventQuarantined: jest.fn(),
    }));
    const { processDLQ } = require("../../backend/scripts/services/dlqProcessor");

    const res = await processDLQ({ isLockLost: () => lost });

    expect(reDriveEvent).toHaveBeenCalledTimes(1);
    expect(res).toMatchObject({ success: false, error: "lock_lost" });
  });
});
