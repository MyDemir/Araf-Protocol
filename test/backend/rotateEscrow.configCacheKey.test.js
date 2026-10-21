"use strict";

// D4: rotate-escrow moveRedisKeys, var olmayan canlı config önbellek anahtarını tolere eder; varsa arşive taşır.

const { run } = require("../../.github/scripts/rotate-escrow.js");
const F = require("../contracts/helpers/rotateEscrowFakes.js");

const { OLD, CHAIN, ENV, T0, fakeChain, world } = F;
const CONFIG_KEY = "cache:protocol_config:v3";
const ARCHIVE_KEY = `${CONFIG_KEY}:archived:${CHAIN}:${OLD}`;

async function rotateApply(w) {
  const lines = [];
  const code = await run({
    argv: ["--rotate", "--apply"], env: ENV,
    deps: { mongo: w.mongo, redis: w.redis, chain: fakeChain() },
    out: (l) => lines.push(String(l)), now: () => T0,
  });
  return { code, out: lines.join("\n") };
}

describe("rotate-escrow: canlı config önbellek anahtarı (B4-01 / D4)", () => {
  it("anahtar YOKSA rotasyon hatasız biter, anahtar ABSENT sayılır", async () => {
    const w = world();
    expect(w.redis.st.kv.has(CONFIG_KEY)).toBe(false);
    const r = await rotateApply(w);
    expect(r.code).toBe(0);
    expect(r.out).toContain(`redis ${CONFIG_KEY}: absent`);
    expect(w.redis.st.kv.has(ARCHIVE_KEY)).toBe(false);
  });

  it("anahtar VARSA arşiv adına taşınır ve canlı anahtar kalmaz", async () => {
    const w = world();
    w.redis.st.kv.set(CONFIG_KEY, "{\"cached\":true}");
    const r = await rotateApply(w);
    expect(r.code).toBe(0);
    expect(w.redis.st.kv.has(CONFIG_KEY)).toBe(false);
    expect(w.redis.st.kv.get(ARCHIVE_KEY)).toBe("{\"cached\":true}");
  });
});
