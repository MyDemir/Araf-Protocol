"use strict";

// B4-01: Redis protokol config önbelleği escrow adresi + chainId'ye bağlı; rotasyon sonrası eski önbellek kullanılmaz.

describe("protocolConfig cache binding (B4-01)", () => {
  const ESCROW_A = "0x1111111111111111111111111111111111111111";
  const ESCROW_B = "0x3333333333333333333333333333333333333333";
  const token = "0x2222222222222222222222222222222222222222";
  const CACHE_KEY = "cache:protocol_config:v3";
  const LAST_KNOWN = "cache:protocol_config:v3:last_known";

  function load({ escrow, chainId, store, takerFee }) {
    jest.resetModules();
    process.env.BASE_RPC_URL = "http://localhost:8545";
    process.env.EXPECTED_CHAIN_ID = String(chainId);
    process.env.ARAF_ESCROW_ADDRESS = escrow;
    process.env.ARAF_TRACKED_TOKENS = token;

    const redis = {
      get: jest.fn(async (k) => (store.has(k) ? store.get(k) : null)),
      setEx: jest.fn(async (k, _ttl, v) => { store.set(k, v); return "OK"; }),
      set: jest.fn(async (k, v) => { store.set(k, v); return "OK"; }),
    };
    const methods = {
      getFeeConfig: jest.fn().mockResolvedValue({ currentTakerFeeBps: BigInt(takerFee), currentMakerFeeBps: 10n }),
      getCooldownConfig: jest.fn().mockResolvedValue({ currentTier0TradeCooldown: 1n, currentTier1TradeCooldown: 2n }),
      getTokenConfig: jest.fn().mockResolvedValue({ supported: true, allowSellOrders: true, allowBuyOrders: true, decimals: 6, tierMaxAmountsBaseUnit: [1n, 2n, 3n, 4n] }),
    };
    for (let t = 0; t < 5; t += 1) {
      methods[`MAKER_BOND_TIER${t}_BPS`] = jest.fn().mockResolvedValue(1000n);
      methods[`TAKER_BOND_TIER${t}_BPS`] = jest.fn().mockResolvedValue(1000n);
    }
    jest.doMock("../../backend/scripts/config/redis", () => ({ getRedisClient: () => redis }));
    jest.doMock("../../backend/scripts/utils/logger", () => ({ info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() }));
    jest.doMock("../../backend/scripts/services/rpcProvider", () => ({ getSharedProvider: () => ({}) }));
    jest.doMock("../../backend/scripts/services/expectedChain", () => ({ assertProviderExpectedChainOrThrow: jest.fn(async () => {}) }));
    jest.doMock("ethers", () => ({ ethers: { Contract: jest.fn(() => methods) } }));
    const mod = require("../../backend/scripts/services/protocolConfig");
    return { mod, methods, redis };
  }

  it("aynı escrow + chainId: önbellek kullanılır (zincire gidilmez)", async () => {
    const store = new Map();
    const first = load({ escrow: ESCROW_A, chainId: 8453, store, takerFee: 25 });
    await first.mod.loadProtocolConfig(); // zincirden yükler, önbelleğe yazar
    expect(store.has(CACHE_KEY)).toBe(true);

    const second = load({ escrow: ESCROW_A, chainId: 8453, store, takerFee: 99 });
    const cfg = await second.mod.loadProtocolConfig();
    expect(cfg.feeConfig.takerFeeBps).toBe(25); // önbellekten
    expect(second.methods.getFeeConfig).not.toHaveBeenCalled();
  });

  it("(d) rotasyon sonrası farklı escrow ile eski önbellek kullanılmaz", async () => {
    const store = new Map();
    await load({ escrow: ESCROW_A, chainId: 8453, store, takerFee: 25 }).mod.loadProtocolConfig();

    const rotated = load({ escrow: ESCROW_B, chainId: 8453, store, takerFee: 40 });
    const cfg = await rotated.mod.loadProtocolConfig();

    expect(rotated.methods.getFeeConfig).toHaveBeenCalled(); // zincirden okundu
    expect(cfg.feeConfig.takerFeeBps).toBe(40); // eski kontratın 25'i değil
  });

  it("(d) aynı escrow ama farklı chainId ile eski önbellek kullanılmaz", async () => {
    const store = new Map();
    await load({ escrow: ESCROW_A, chainId: 8453, store, takerFee: 25 }).mod.loadProtocolConfig();

    const other = load({ escrow: ESCROW_A, chainId: 84532, store, takerFee: 7 });
    const cfg = await other.mod.loadProtocolConfig();

    expect(other.methods.getFeeConfig).toHaveBeenCalled();
    expect(cfg.feeConfig.takerFeeBps).toBe(7);
  });

  it("(d) bağ bilgisi olmayan eski girdi yok sayılır", async () => {
    const store = new Map();
    const legacy = { bondMap: {}, feeConfig: { takerFeeBps: 1, makerFeeBps: 1 }, cooldownConfig: {}, tokenMap: {} };
    store.set(CACHE_KEY, JSON.stringify(legacy));
    const l = load({ escrow: ESCROW_A, chainId: 8453, store, takerFee: 25 });
    const cfg = await l.mod.loadProtocolConfig();
    expect(l.methods.getFeeConfig).toHaveBeenCalled();
    expect(cfg.feeConfig.takerFeeBps).toBe(25);
  });

  it("(d) son-bilinen kopya da başka escrow'a aitse kısıtlı modda sunulmaz", async () => {
    const store = new Map();
    await load({ escrow: ESCROW_A, chainId: 8453, store, takerFee: 25 }).mod.loadProtocolConfig();
    expect(store.has(LAST_KNOWN)).toBe(true);

    const rotated = load({ escrow: ESCROW_B, chainId: 8453, store, takerFee: 40 });
    expect(await rotated.mod.loadStaleProtocolConfig()).toBeNull();
    const same = load({ escrow: ESCROW_A, chainId: 8453, store, takerFee: 40 });
    expect(await same.mod.loadStaleProtocolConfig()).not.toBeNull();
  });

  it("paymentRiskConfig önbellekten değil koddan gelir", async () => {
    const store = new Map();
    const l = load({ escrow: ESCROW_A, chainId: 8453, store, takerFee: 25 });
    await l.mod.loadProtocolConfig();
    const raw = JSON.parse(store.get(CACHE_KEY));
    raw.paymentRiskConfig = { stale: true };
    store.set(CACHE_KEY, JSON.stringify(raw));

    const again = load({ escrow: ESCROW_A, chainId: 8453, store, takerFee: 25 });
    await again.mod.loadProtocolConfig();
    expect(again.mod.getConfig().paymentRiskConfig).not.toEqual({ stale: true });
  });
});

describe("rotate-escrow redisMoves (B4-01)", () => {
  it("canlı TTL'li config önbellek anahtarı taşıma listesinde", () => {
    const { redisMoves } = require("../../.github/scripts/rotate-escrow.js");
    const moves = redisMoves(8453, "0xAbC0000000000000000000000000000000000001");
    const live = moves.find((m) => m.live === "cache:protocol_config:v3");
    expect(live).toBeDefined();
    expect(live.archive).toBe("cache:protocol_config:v3:archived:8453:0xabc0000000000000000000000000000000000001");
    expect(moves.some((m) => m.live === "cache:protocol_config:v3:last_known")).toBe(true);
  });
});
