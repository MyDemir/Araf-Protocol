"use strict";

// B1-10: checkpoint karşılaştır+yaz atomik; iki yazar yarışsa da checkpoint geriye gitmez, iki anahtar ayrışmaz.

jest.mock("../../backend/scripts/utils/logger", () => ({ info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() }));
jest.mock("../../backend/scripts/services/protocolConfig", () => ({
  updateCachedFeeConfig: jest.fn(), updateCachedCooldownConfig: jest.fn(), updateCachedTokenConfig: jest.fn(), refreshProtocolConfig: jest.fn(),
}));
jest.mock("../../backend/scripts/models/Trade", () => ({}));
jest.mock("../../backend/scripts/models/Order", () => ({}));
jest.mock("../../backend/scripts/models/User", () => ({}));

const kv = new Map();
const tick = () => new Promise((r) => setImmediate(r));
// Gerçek Redis gibi: her komut ağ turu yapar (araya başka istek girebilir); EVAL ise tek komuttur (atomik).
const mockRedis = {
  get: jest.fn(async (k) => { await tick(); return kv.has(k) ? kv.get(k) : null; }),
  set: jest.fn(async (k, v) => { await tick(); kv.set(k, v); return "OK"; }),
  eval: jest.fn(async (script, { keys, arguments: args }) => {
    await tick();
    const [safeKey, lastKey] = keys;
    const cur = Number(kv.get(safeKey) ?? kv.get(lastKey) ?? 0);
    if (Number(args[0]) > cur) { kv.set(safeKey, args[0]); kv.set(lastKey, args[0]); return 1; }
    return 0;
  }),
};
jest.mock("../../backend/scripts/config/redis", () => ({ getRedisClient: jest.fn(() => mockRedis) }));

describe("eventListener atomic checkpoint (B1-10)", () => {
  let worker;
  beforeEach(() => {
    jest.resetModules();
    kv.clear();
    mockRedis.eval.mockClear();
    worker = require("../../backend/scripts/services/eventListener");
  });

  it("(e) iki yazar yarışsa da checkpoint geriye gitmez ve iki anahtar aynı kalır", async () => {
    kv.set("worker:last_safe_block", "10");
    kv.set("worker:last_block", "10");

    // Küçük değeri yazan yavaş yazar, büyük değeri yazan hızlı yazarla yarışır.
    await Promise.all([
      worker._updateSafeCheckpointIfHigher(50),
      worker._updateSafeCheckpointIfHigher(100),
    ]);

    expect(kv.get("worker:last_safe_block")).toBe("100");
    expect(kv.get("worker:last_block")).toBe("100");
  });

  it("(e) mevcuttan küçük/eşit blok checkpoint'i değiştirmez", async () => {
    kv.set("worker:last_safe_block", "100");
    kv.set("worker:last_block", "100");
    worker._lastSafeCheckpointBlock = 100;

    await worker._updateSafeCheckpointIfHigher(90);
    await worker._updateSafeCheckpointIfHigher(100);

    expect(kv.get("worker:last_safe_block")).toBe("100");
    expect(kv.get("worker:last_block")).toBe("100");
    expect(worker._lastSafeCheckpointBlock).toBe(100);
  });

  it("ilerleme iki anahtarı birlikte yazar ve tek EVAL kullanır", async () => {
    await worker._updateSafeCheckpointIfHigher(7);
    expect(mockRedis.eval).toHaveBeenCalledTimes(1);
    expect(kv.get("worker:last_safe_block")).toBe("7");
    expect(kv.get("worker:last_block")).toBe("7");
    expect(worker._lastSafeCheckpointBlock).toBe(7);
  });
});
