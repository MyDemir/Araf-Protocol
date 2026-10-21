"use strict";

jest.mock("../../backend/scripts/utils/logger", () => ({ info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() }));

const { createRpcPool } = require("../../backend/scripts/services/rpcProvider");

const A = "https://primary.example/v2/PRIMARYKEY1234567890";
const B = "https://fallback.example/v2/FALLBACKKEY1234567890";

function localLimitError() {
  const e = new Error("[RpcRateLimiter] Too Many Requests: queue full (200)");
  e.code = "RPC_LOCAL_RATE_LIMIT";
  return e;
}

describe("B4-03: yerel hız sınırı reddi sağlıklı birincil RPC'yi soğumaya sokmaz", () => {
  const originalEnv = process.env;
  beforeEach(() => { process.env = { ...originalEnv, EXPECTED_CHAIN_ID: "8453", NODE_ENV: "test" }; });
  afterAll(() => { process.env = originalEnv; });

  function makePool(limiterForA) {
    const sends = { [A]: jest.fn().mockResolvedValue([{ id: 1, result: "0x1" }]), [B]: jest.fn().mockResolvedValue([{ id: 1, result: "0x1" }]) };
    const pool = createRpcPool({
      urls: [A, B],
      probeFor: () => ({ getNetwork: async () => ({ chainId: 8453n }) }),
      createInner: (url) => ({ _send: (p) => sends[url](p) }),
      rateLimiterFor: (url) => (url === A ? limiterForA : { acquire: async () => {} }),
    });
    return { pool, sends };
  }

  it("yerel limiter reddi: hata fırlar, birincil soğumaya girmez, yedek kullanılmaz", async () => {
    let reject = false;
    const { pool, sends } = makePool({ acquire: async () => { if (reject) throw localLimitError(); } });
    await pool.send([{ id: 0 }]); // doğrulama geçsin
    sends[A].mockClear();
    reject = true;
    await expect(pool.send([{ id: 1 }])).rejects.toMatchObject({ code: "RPC_LOCAL_RATE_LIMIT" });
    expect(pool.entries[0].cooldownUntil).toBe(0);
    expect(sends[B]).not.toHaveBeenCalled();
    reject = false;
    await pool.send([{ id: 2 }]);
    expect(sends[A]).toHaveBeenCalledTimes(1);
  });

  it("sağlayıcıdan gelen gerçek 429 hâlâ yedeğe geçirir", async () => {
    const { pool, sends } = makePool({ acquire: async () => {} });
    sends[A].mockRejectedValue(new Error("429 Too Many Requests"));
    await pool.send([{ id: 1 }]);
    expect(sends[B]).toHaveBeenCalledTimes(1);
    expect(pool.entries[0].cooldownUntil).toBeGreaterThan(0);
  });
});
