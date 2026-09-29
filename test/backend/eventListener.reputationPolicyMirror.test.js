"use strict";

const mockUpdateCachedReputationPolicy = jest.fn();

jest.mock("../../backend/scripts/config/redis", () => ({
  getRedisClient: jest.fn(() => ({ get: jest.fn(), setEx: jest.fn(), del: jest.fn(), rPush: jest.fn() })),
}));
jest.mock("../../backend/scripts/utils/logger", () => ({ info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() }));
jest.mock("../../backend/scripts/services/protocolConfig", () => ({
  refreshProtocolConfig: jest.fn(),
  updateCachedFeeConfig: jest.fn(),
  updateCachedCooldownConfig: jest.fn(),
  updateCachedTokenConfig: jest.fn(),
  updateCachedReputationPolicy: (...args) => mockUpdateCachedReputationPolicy(...args),
}));
jest.mock("../../backend/scripts/models/Trade", () => ({}));
jest.mock("../../backend/scripts/models/Order", () => ({}));
jest.mock("../../backend/scripts/models/User", () => ({}));

const worker = require("../../backend/scripts/services/eventListener");

// [TR] Kontratta tier eşikleri / temiz sayfa süresi için getter yok; backend bunları yalnız event'ten aynalar.
describe("eventListener reputation policy mirror", () => {
  beforeEach(() => jest.clearAllMocks());

  it("mirrors ReputationTierThresholdsUpdated as number arrays", async () => {
    await worker._onReputationTierThresholdsUpdated({
      args: { minSuccessfulTrades: [0n, 15n, 50n, 100n, 200n], maxRiskPoints: [100n, 80n, 50n, 30n, 15n] },
    });
    expect(mockUpdateCachedReputationPolicy).toHaveBeenCalledWith({
      tierMinSuccessfulTrades: [0, 15, 50, 100, 200],
      tierMaxRiskPoints: [100, 80, 50, 30, 15],
    });
  });

  it("mirrors ReputationPolicyUpdated with seconds-suffixed durations", async () => {
    await worker._onReputationPolicyUpdated({
      args: {
        cleanPeriod: 7776000n,
        manualReleaseRewardPts: 8n,
        autoReleasePenaltyPts: 60n,
        disputeWinRewardPts: 10n,
        disputeLossPenaltyPts: 60n,
        burnPenaltyPts: 90n,
        mutualCancelPenaltyPts: 20n,
        baseBanDuration: 2592000n,
        banRiskPointsThreshold: 100n,
      },
    });
    const patch = mockUpdateCachedReputationPolicy.mock.calls[0][0];
    expect(patch.cleanPeriodSec).toBe(7776000);
    expect(patch.baseBanDurationSec).toBe(2592000);
    expect(patch.banRiskPointsThreshold).toBe(100);
  });

  it("subscribes both policy events", () => {
    const src = require("fs").readFileSync(require.resolve("../../backend/scripts/services/eventListener"), "utf8");
    expect(src).toMatch(/"ReputationPolicyUpdated", "ReputationTierThresholdsUpdated"/);
    expect(src).toMatch(/event ReputationTierThresholdsUpdated\(uint32\[5\] minSuccessfulTrades, uint32\[5\] maxRiskPoints\)/);
  });
});
