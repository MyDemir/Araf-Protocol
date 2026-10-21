"use strict";

// B4-05 / B1-10: Redis tabanlı dağıtık iş kilidi. İki "makine" = aynı Redis'e bağlı iki ayrı token.

jest.mock("../../backend/scripts/utils/logger", () => ({ info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() }));

const { createJobLock, RENEW_LUA } = require("../../backend/scripts/services/jobLock");

// Lua'yı çalıştırmayan, ama SET NX PX / compare-and-del / compare-and-pexpire anlamını birebir uygulayan sahte Redis.
function makeFakeRedis() {
  const kv = new Map();
  const ttl = new Map();
  const redis = {
    kv,
    ttl,
    set: jest.fn(async (key, value, opts = {}) => {
      if (opts.NX && kv.has(key)) return null;
      kv.set(key, value);
      if (opts.PX) ttl.set(key, opts.PX);
      return "OK";
    }),
    eval: jest.fn(async (script, { keys, arguments: args }) => {
      const [key] = keys;
      // Betik METNİNİ yorumlar: token karşılaştırması betikte yoksa koşulsuz uygular (mutasyon yakalansın).
      const guarded = script.includes("redis.call('get', KEYS[1]) == ARGV[1]");
      const owned = kv.get(key) === args[0];
      if (guarded && !owned) return 0;
      if (script.includes("'del'")) { kv.delete(key); return 1; }
      if (script.includes("'pexpire'")) { ttl.set(key, Number(args[1])); return 1; }
      throw new Error("unknown script");
    }),
  };
  return redis;
}

describe("jobLock (B4-05)", () => {
  it("(a) iki makine (iki token) aynı kilidi aynı anda alamaz", async () => {
    const redis = makeFakeRedis();
    const m1 = createJobLock({ getClient: () => redis, token: "machine-1" });
    const m2 = createJobLock({ getClient: () => redis, token: "machine-2" });

    let releaseJob1;
    const job1Gate = new Promise((r) => { releaseJob1 = r; });
    const job1 = jest.fn(async () => { await job1Gate; return "j1"; });
    const job2 = jest.fn(async () => "j2");

    const p1 = m1.runExclusive("dlq", job1);
    await new Promise((r) => setImmediate(r)); // m1 kilidi aldı, iş sürüyor
    const r2 = await m2.runExclusive("dlq", job2);

    expect(r2).toEqual({ ran: false, skipped: "lock_held_elsewhere" });
    expect(job2).not.toHaveBeenCalled();

    releaseJob1();
    expect(await p1).toEqual({ ran: true, result: "j1" });

    // m1 bitirince kilit serbest: m2 artık çalışabilir.
    expect(await m2.runExclusive("dlq", job2)).toEqual({ ran: true, result: "j2" });
    expect(job2).toHaveBeenCalledTimes(1);
  });

  it("farklı iş anahtarları birbirini engellemez", async () => {
    const redis = makeFakeRedis();
    const m1 = createJobLock({ getClient: () => redis, token: "machine-1" });
    const m2 = createJobLock({ getClient: () => redis, token: "machine-2" });
    let gate;
    const wait = new Promise((r) => { gate = r; });
    const p = m1.runExclusive("dlq", () => wait);
    await new Promise((r) => setImmediate(r));
    expect(await m2.runExclusive("rewardRecorder", async () => 1)).toEqual({ ran: true, result: 1 });
    gate();
    await p;
  });

  it("(b) token eşleşmeyen serbest bırakma kilidi silmez; eşleşen siler", async () => {
    const redis = makeFakeRedis();
    const owner = createJobLock({ getClient: () => redis, token: "owner" });
    const other = createJobLock({ getClient: () => redis, token: "other" });

    expect((await owner.acquire("dlq")).status).toBe("acquired");
    expect(redis.kv.get("lock:job:dlq")).toBe("owner");

    expect(await other.release("dlq")).toBe(0);
    expect(redis.kv.get("lock:job:dlq")).toBe("owner"); // hâlâ sahibinde

    // yenileme de yalnız sahibine
    expect(await other.renew("dlq")).toBe(0);
    expect(await owner.renew("dlq")).toBe(1);

    expect(await owner.release("dlq")).toBe(1);
    expect(redis.kv.has("lock:job:dlq")).toBe(false);
  });

  it("(c) Redis SET hatasında iş ÇALIŞMAZ (fail-closed)", async () => {
    const redis = makeFakeRedis();
    redis.set.mockRejectedValue(new Error("ECONNREFUSED"));
    const lock = createJobLock({ getClient: () => redis, token: "m" });
    const job = jest.fn(async () => "x");

    const res = await lock.runExclusive("rewardRecorder", job);

    expect(res).toEqual({ ran: false, skipped: "lock_redis_unavailable" });
    expect(job).not.toHaveBeenCalled();
  });

  it("(c) Redis istemcisi hiç yoksa (getClient fırlatır) iş ÇALIŞMAZ", async () => {
    const lock = createJobLock({ getClient: () => { throw new Error("Redis başlatılmamış"); }, token: "m" });
    const job = jest.fn();
    expect(await lock.runExclusive("dlq", job)).toEqual({ ran: false, skipped: "lock_redis_unavailable" });
    expect(job).not.toHaveBeenCalled();
  });

  it("(c) Redis yanıt vermezse komut zaman aşımıyla iş ÇALIŞMAZ", async () => {
    const redis = makeFakeRedis();
    redis.set.mockImplementation(() => new Promise(() => {}));
    const lock = createJobLock({ getClient: () => redis, token: "m", commandTimeoutMs: 20 });
    const job = jest.fn();
    expect(await lock.runExclusive("dlq", job)).toEqual({ ran: false, skipped: "lock_redis_unavailable" });
    expect(job).not.toHaveBeenCalled();
  });

  it("iş hata fırlatsa da kilit bırakılır ve hata yukarı akar", async () => {
    const redis = makeFakeRedis();
    const lock = createJobLock({ getClient: () => redis, token: "m" });
    await expect(lock.runExclusive("dlq", async () => { throw new Error("boom"); })).rejects.toThrow("boom");
    expect(redis.kv.has("lock:job:dlq")).toBe(false);
  });

  it("uzun işte kilit periyodik yenilenir", async () => {
    const redis = makeFakeRedis();
    const lock = createJobLock({ getClient: () => redis, token: "m", ttlMs: 30 });
    await lock.runExclusive("dlq", () => new Promise((r) => setTimeout(r, 80)));
    const renews = redis.eval.mock.calls.filter((c) => c[0] === RENEW_LUA);
    expect(renews.length).toBeGreaterThanOrEqual(1);
    expect(redis.kv.has("lock:job:dlq")).toBe(false);
  });
});
