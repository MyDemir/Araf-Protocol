"use strict";

const serviceMode = require("../../backend/scripts/services/serviceMode");

describe("serviceMode.classifyStartupError", () => {
  const cases = [
    ["429 text", new Error("server response 429 Too Many Requests"), "transient"],
    ["compute units", new Error("exceeded compute units per second capacity"), "transient"],
    ["ECONNREFUSED code", Object.assign(new Error("x"), { code: "ECONNREFUSED" }), "transient"],
    ["timeout", Object.assign(new Error("request timeout"), { code: "TIMEOUT" }), "transient"],
    ["SEC-01 unverified + 429", new Error("SEC-01 BLOCKER: ... doğrulanamadı: server response 429"), "transient"],
    ["SEC-01 unverified + wrong chain", new Error("SEC-01 BLOCKER: ... doğrulanamadı: actual chain=8453"), "fatal"],
    ["SEC-01 unverified + ChainGuard", new Error("SEC-01 BLOCKER: ... doğrulanamadı: [ChainGuard][x] Chain ID uyuşmazlığı"), "fatal"],
    ["SEC-01 other", new Error("SEC-01 BLOCKER: Production'da KMS_PROVIDER='env' kullanılamaz!"), "fatal"],
    ["SEC-01 no RPC url", new Error("SEC-01 BLOCKER: Testnet env-KMS istisnası için BASE_RPC_URL zorunlu"), "fatal"],
    ["ChainGuard + 429 text", new Error("[ChainGuard][x] 429 network"), "fatal"],
    ["unknown", new Error("boom"), "fatal"],
    ["null", null, "fatal"],
  ];
  it.each(cases)("%s => %s", (_n, err, expected) => {
    expect(serviceMode.classifyStartupError(err)).toBe(expected);
  });
});

describe("serviceMode state + backoff", () => {
  beforeEach(() => serviceMode._resetForTests());

  it("enterDegraded reports first entry only and tracks reasons", () => {
    expect(serviceMode.enterDegraded("rpc_unavailable_at_boot")).toBe(true);
    expect(serviceMode.enterDegraded("rpc_unavailable_at_boot")).toBe(false);
    expect(serviceMode.getDegradedReasons()).toEqual(["rpc_unavailable_at_boot"]);
    serviceMode.exitDegraded();
    expect(serviceMode.isDegraded()).toBe(false);
    expect(serviceMode.getDegradedReasons()).toEqual([]);
  });

  it("backoff grows 5s -> 5min with jitter within bounds", () => {
    expect(serviceMode.computeBackoffMs(0, () => 0.5)).toBe(5_000);
    expect(serviceMode.computeBackoffMs(1, () => 0.5)).toBe(10_000);
    expect(serviceMode.computeBackoffMs(2, () => 0.5)).toBe(20_000);
    expect(serviceMode.computeBackoffMs(20, () => 0.5)).toBe(300_000);
    for (let a = 0; a < 12; a += 1) {
      for (const r of [0, 0.999]) {
        const v = serviceMode.computeBackoffMs(a, () => r);
        expect(v).toBeGreaterThanOrEqual(5_000);
        expect(v).toBeLessThanOrEqual(300_000);
      }
    }
  });
});

describe("serviceMode.createRecoveryLoop", () => {
  beforeEach(() => serviceMode._resetForTests());

  function harness(steps, extra = {}) {
    const timers = [];
    const loop = serviceMode.createRecoveryLoop({
      steps,
      setTimeoutFn: (fn, ms) => { const t = { fn, ms }; timers.push(t); return t; },
      clearTimeoutFn: (t) => { t.cleared = true; },
      random: () => 0.5,
      ...extra,
    });
    return { loop, timers };
  }

  it("single loop: start() twice schedules one timer; no overlap while a step is in flight", async () => {
    serviceMode.enterDegraded("rpc_unavailable_at_boot");
    let release;
    const gate = new Promise((r) => { release = r; });
    const run = jest.fn(() => gate);
    const { loop, timers } = harness([{ name: "a", run }]);
    expect(loop.start()).toBe(true);
    expect(loop.start()).toBe(false);
    expect(timers).toHaveLength(1);
    const first = loop._tick();
    const second = loop._tick(); // overlapping tick is a no-op
    await second;
    expect(run).toHaveBeenCalledTimes(1);
    release();
    await first;
    expect(timers).toHaveLength(1 + 0); // recovered: no further schedule
  });

  it("retries with growing delay on transient failure, then recovers in order and fires onRecovered once", async () => {
    serviceMode.enterDegraded("rpc_unavailable_at_boot");
    const order = [];
    let fail = 2;
    const steps = [
      { name: "sec01_kms", run: async () => { if (fail-- > 0) throw new Error("429 Too Many Requests"); order.push("sec01_kms"); } },
      { name: "protocol_config", run: async () => { order.push("config"); } },
      { name: "worker", run: async () => { order.push("worker"); } },
    ];
    const onRecovered = jest.fn();
    const { loop, timers } = harness(steps, { onRecovered });
    loop.start();
    await loop._tick();
    expect(serviceMode.isDegraded()).toBe(true);
    await loop._tick();
    expect(timers.map((t) => t.ms)).toEqual([5_000, 10_000, 20_000]);
    await loop._tick();
    expect(order).toEqual(["sec01_kms", "config", "worker"]);
    expect(serviceMode.isDegraded()).toBe(false);
    expect(onRecovered).toHaveBeenCalledTimes(1);
    expect(timers).toHaveLength(3); // nothing scheduled after recovery
  });

  it("completed steps are not repeated after a later step fails", async () => {
    serviceMode.enterDegraded("x");
    const sec = jest.fn(async () => {});
    let cfgFail = true;
    const cfg = jest.fn(async () => { if (cfgFail) { cfgFail = false; throw new Error("ETIMEDOUT network timeout"); } });
    const { loop } = harness([{ name: "sec01_kms", run: sec }, { name: "protocol_config", run: cfg }]);
    loop.start();
    await loop._tick();
    await loop._tick();
    expect(sec).toHaveBeenCalledTimes(1);
    expect(cfg).toHaveBeenCalledTimes(2);
  });

  it("fatal error during recovery stops the loop and calls onFatal; stays degraded", async () => {
    serviceMode.enterDegraded("x");
    const onFatal = jest.fn();
    const { loop, timers } = harness([{ name: "sec01_kms", run: async () => { throw new Error("[ChainGuard][x] Chain ID uyuşmazlığı"); } }], { onFatal });
    loop.start();
    await loop._tick();
    expect(onFatal).toHaveBeenCalledTimes(1);
    expect(serviceMode.isDegraded()).toBe(true);
    expect(timers).toHaveLength(1);
    expect(loop.isRunning()).toBe(false);
  });

  it("stop() clears the pending timer", () => {
    const { loop, timers } = harness([{ name: "a", run: async () => {} }]);
    loop.start();
    loop.stop();
    expect(timers[0].cleared).toBe(true);
  });
});
