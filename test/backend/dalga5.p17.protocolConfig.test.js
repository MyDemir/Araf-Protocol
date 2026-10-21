"use strict";

// B4-10: kısmi token hatası önbelleğe yazılmaz; bayat (last_known) config taze anahtara yazılmaz.

describe("protocolConfig önbellek yazımı (B4-10)", () => {
  const escrow = "0x1111111111111111111111111111111111111111";
  const token = "0x2222222222222222222222222222222222222222";

  function setup() {
    jest.resetModules();
    process.env.BASE_RPC_URL = "http://localhost:8545";
    process.env.EXPECTED_CHAIN_ID = "8453";
    process.env.ARAF_ESCROW_ADDRESS = escrow;
    process.env.ARAF_TRACKED_TOKENS = token;

    const redis = {
      get: jest.fn().mockResolvedValue(null),
      setEx: jest.fn().mockResolvedValue("OK"),
      set: jest.fn().mockResolvedValue("OK"),
      del: jest.fn().mockResolvedValue(1),
    };
    const state = { failToken: false };
    const methods = {
      getFeeConfig: jest.fn().mockResolvedValue({ currentTakerFeeBps: 25n, currentMakerFeeBps: 10n }),
      getCooldownConfig: jest.fn().mockResolvedValue({ currentTier0TradeCooldown: 1n, currentTier1TradeCooldown: 2n }),
      getTokenConfig: jest.fn(async () => {
        if (state.failToken) throw new Error("token rpc down");
        return { supported: true, allowSellOrders: true, allowBuyOrders: true, decimals: 6, tierMaxAmountsBaseUnit: [1n, 2n, 3n, 4n] };
      }),
    };
    for (let t = 0; t < 5; t += 1) {
      methods[`MAKER_BOND_TIER${t}_BPS`] = jest.fn().mockResolvedValue(1000n);
      methods[`TAKER_BOND_TIER${t}_BPS`] = jest.fn().mockResolvedValue(1000n);
    }
    jest.doMock("../../backend/scripts/config/redis", () => ({ getRedisClient: () => redis }));
    jest.doMock("../../backend/scripts/utils/logger", () => ({ info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() }));
    jest.doMock("../../backend/scripts/services/rpcProvider", () => ({ getSharedProvider: () => new (require("ethers").ethers.JsonRpcProvider)() }));
    jest.doMock("ethers", () => ({
      ethers: {
        JsonRpcProvider: jest.fn(() => ({ getNetwork: jest.fn().mockResolvedValue({ chainId: 8453n }) })),
        Contract: jest.fn(() => methods),
      },
    }));
    return { service: require("../../backend/scripts/services/protocolConfig"), redis, state };
  }

  it("tek token okuma hatası: bellekte fail-closed (supported:false) ama Redis'e (TTL ve last_known) yazılmaz", async () => {
    const { service, redis, state } = setup();
    state.failToken = true;
    await service.loadProtocolConfig();
    expect(service.getConfig().tokenMap[token].supported).toBe(false);
    expect(redis.setEx).not.toHaveBeenCalled();
    expect(redis.set).not.toHaveBeenCalled();
  });

  it("tüm tokenlar okunursa eskisi gibi yazılır", async () => {
    const { service, redis } = setup();
    await service.loadProtocolConfig();
    expect(redis.setEx).toHaveBeenCalledTimes(1);
    expect(redis.set).toHaveBeenCalledTimes(1);
  });

  it("bayat (last_known) config üzerine event yaması taze anahtara yazılmaz, bellekte uygulanır", async () => {
    const { service, redis } = setup();
    await service.loadProtocolConfig();
    const lastKnownJson = redis.set.mock.calls[0][1];

    redis.get.mockResolvedValue(lastKnownJson);
    await service.loadStaleProtocolConfig();
    expect(service.isProtocolConfigStale()).toBe(true);
    redis.setEx.mockClear();
    redis.set.mockClear();

    await service.updateCachedFeeConfig(99, 88);
    expect(service.getConfig().feeConfig.takerFeeBps).toBe(99);
    expect(redis.setEx).not.toHaveBeenCalled();
    expect(service.isProtocolConfigStale()).toBe(true);
  });

  it("taze config üzerine event yaması yazılmaya devam eder", async () => {
    const { service, redis } = setup();
    await service.loadProtocolConfig();
    redis.setEx.mockClear();
    await service.updateCachedFeeConfig(99, 88);
    expect(redis.setEx).toHaveBeenCalledTimes(1);
  });
});
