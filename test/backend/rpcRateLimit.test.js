"use strict";

jest.mock("../../backend/scripts/utils/logger", () => ({ info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() }));

const { ethers } = require("ethers");
const {
  createRpcPool,
  createRateLimiter,
  _buildJsonRpcProvider,
  isRateLimitError,
} = require("../../backend/scripts/services/rpcProvider");

const A = "https://primary.example/v2/PRIMARYKEY1234567890";
const B = "https://fallback.example/v2/FALLBACKKEY1234567890";

function fakeClock() {
  const c = { t: 1_000_000 };
  c.now = () => c.t;
  c.sleep = async (ms) => { c.t += ms; };
  return c;
}
function maxInAnyWindow(stamps) {
  let max = 0;
  for (const s of stamps) max = Math.max(max, stamps.filter((x) => x >= s && x < s + 1000).length);
  return max;
}
function limiterWith(clock, rate, extra = {}) {
  return createRateLimiter({ getRate: () => rate.v, now: clock.now, sleep: clock.sleep, ...extra });
}

describe("RPC rate limiter", () => {
  const originalEnv = process.env;
  beforeEach(() => { process.env = { ...originalEnv, EXPECTED_CHAIN_ID: "8453", NODE_ENV: "test" }; });
  afterAll(() => { process.env = originalEnv; });

  it("12 concurrent calls: at most N per second, FIFO", async () => {
    const clock = fakeClock();
    const stamps = [];
    const lim = limiterWith(clock, { v: 4 }, { onRelease: (t) => stamps.push(t) });
    const order = [];
    await Promise.all(Array.from({ length: 12 }, (_, i) => lim.acquire().then(() => { order.push(i); })));
    expect(stamps).toHaveLength(12);
    expect(maxInAnyWindow(stamps)).toBeLessThanOrEqual(4);
    expect(order).toEqual([...Array(12).keys()]);
    expect(stamps[11] - stamps[0]).toBeGreaterThanOrEqual(2000);
  });

  it("pool applies the limit to send(); primary and fallback limits are independent", async () => {
    const clock = fakeClock();
    const sent = { [A]: [], [B]: [] };
    const released = { [A]: [], [B]: [] };
    const pool = createRpcPool({
      urls: [A, B],
      probeFor: () => ({ getNetwork: async () => ({ chainId: 8453n }) }),
      createInner: (url) => ({ _send: async () => { sent[url].push(clock.now()); return [{ id: 1, result: "0x1" }]; } }),
      rateLimiterFor: (url) => limiterWith(clock, { v: 2 }, { onRelease: (t) => released[url].push(t) }),
    });
    await Promise.all(Array.from({ length: 6 }, () => pool.send([{ id: 1 }])));
    expect(sent[A]).toHaveLength(6);
    expect(released[A]).toHaveLength(7); // 1 chain probe + 6 sends
    expect(maxInAnyWindow(released[A])).toBeLessThanOrEqual(2);
    expect(released[B]).toHaveLength(0);
    const [eA, eB] = pool.entries;
    expect(eA.limiter).not.toBe(eB.limiter);
    const before = clock.now();
    await eB.limiter.acquire();
    await eB.limiter.acquire();
    expect(clock.now()).toBe(before); // fallback bucket is untouched by the primary's backlog
  });

  it("picks up a runtime rate change", async () => {
    const clock = fakeClock();
    const rate = { v: 1 };
    const rel = [];
    const lim = limiterWith(clock, rate, { onRelease: (t) => rel.push(t) });
    await Promise.all(Array.from({ length: 4 }, () => lim.acquire()));
    expect(maxInAnyWindow(rel)).toBe(1);
    rate.v = 10;
    clock.t += 1000;
    rel.length = 0;
    await Promise.all(Array.from({ length: 10 }, () => lim.acquire()));
    expect(new Set(rel).size).toBe(1);
  });

  it("queue overflow and wait timeout reject with a rate-limit-class error", async () => {
    const clock = fakeClock();
    const lim = limiterWith(clock, { v: 1 }, { maxQueue: 2 });
    const first = [lim.acquire(), lim.acquire(), lim.acquire()];
    const overflow = await lim.acquire().catch((e) => e);
    expect(overflow).toBeInstanceOf(Error);
    expect(overflow.message).toMatch(/queue full/);
    expect(isRateLimitError(overflow)).toBe(true);
    await Promise.all(first);

    const lim2 = limiterWith(clock, { v: 1 }, { maxWaitMs: 1500 });
    const res = await Promise.all(Array.from({ length: 4 }, () => lim2.acquire().then(() => "ok", (e) => e)));
    expect(res[0]).toBe("ok");
    const errs = res.filter((r) => r instanceof Error);
    expect(errs.length).toBeGreaterThan(0);
    expect(errs[0].message).toMatch(/queue wait exceeded/);
    expect(isRateLimitError(errs[0])).toBe(true);
  });

  it("B4-03: a local limiter rejection is not a provider failure (no cooldown, no fallback)", async () => {
    const clock = fakeClock();
    const sentB = jest.fn().mockResolvedValue([{ id: 1, result: "0x2" }]);
    const full = { acquire: () => Promise.reject(Object.assign(new Error("[RpcRateLimiter] Too Many Requests: queue full (1)"), { code: "RPC_LOCAL_RATE_LIMIT" })) };
    const pool = createRpcPool({
      urls: [A, B],
      probeFor: () => ({ getNetwork: async () => ({ chainId: 8453n }) }),
      createInner: (url) => ({ _send: url === B ? sentB : jest.fn() }),
      rateLimiterFor: (url) => (url === A ? full : limiterWith(clock, { v: 50 })),
    });
    await expect(pool.send([{ id: 1 }])).rejects.toMatchObject({ code: "RPC_LOCAL_RATE_LIMIT" });
    expect(pool.entries[0].cooldownUntil).toBe(0);
    expect(sentB).not.toHaveBeenCalled();
  });

  it("does not batch: 12 concurrent eth_calls are 12 single-request payloads", async () => {
    const bodies = [];
    ethers.FetchRequest.registerGetUrl(async (r) => {
      const body = JSON.parse(Buffer.from(r.body).toString());
      bodies.push(body);
      const items = Array.isArray(body) ? body : [body];
      const out = items.map((b) => ({ id: b.id, jsonrpc: "2.0", result: "0x" }));
      return { statusCode: 200, statusMessage: "OK", headers: { "content-type": "application/json" }, body: Uint8Array.from(Buffer.from(JSON.stringify(Array.isArray(body) ? out : out[0]))) };
    });
    const net = ethers.Network.from(8453);
    const built = _buildJsonRpcProvider("http://127.0.0.1:1/", net);
    expect(built._getOption("batchMaxCount")).toBe(1);
    try {
      await Promise.all(Array.from({ length: 12 }, () => built.call({ to: "0x" + "11".repeat(20), data: "0x5fbbc0d2" })));
    } finally {
      ethers.FetchRequest.registerGetUrl(ethers.FetchRequest.createGetUrlFunc());
    }
    expect(bodies).toHaveLength(12);
    expect(bodies.every((b) => !Array.isArray(b) || b.length === 1)).toBe(true);
    built.destroy();
    const noNet = _buildJsonRpcProvider("http://127.0.0.1:1/", null);
    expect(noNet._getOption("batchMaxCount")).toBe(1);
    noNet.destroy();
  });
});
