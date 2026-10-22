"use strict";

// [TR] Dalga 5 K paketi: kontrat event değişikliklerinin backend dinleyicisiyle uyumu.
//      K2-08 TokenLimitsUpdated, K1-06 terminal tx'te yeni event sırası, K3-07 SettlementExpired + SettlementProposed.
// [EN] Wave 5 contract package: backend listener compatibility with the contract event changes.

const mockRedisStore = new Map();
const mockUpdateCachedTokenConfig = jest.fn();
const mockRefreshProtocolConfig = jest.fn();
const mockTradeFindOneAndUpdate = jest.fn();
const mockUserFindOneAndUpdate = jest.fn();
const mockRevenueFindOneAndUpdate = jest.fn();

jest.mock("../../backend/scripts/config/redis", () => ({
  getRedisClient: jest.fn(() => ({
    get: jest.fn(async (k) => (mockRedisStore.has(k) ? mockRedisStore.get(k) : null)),
    set: jest.fn(async (k, v) => { mockRedisStore.set(k, v); return "OK"; }),
    setEx: jest.fn(),
    del: jest.fn(),
    rPush: jest.fn(),
  })),
}));
jest.mock("../../backend/scripts/utils/logger", () => ({ info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() }));
jest.mock("../../backend/scripts/services/protocolConfig", () => ({
  refreshProtocolConfig: (...a) => mockRefreshProtocolConfig(...a),
  updateCachedFeeConfig: jest.fn(),
  updateCachedCooldownConfig: jest.fn(),
  updateCachedTokenConfig: (...a) => mockUpdateCachedTokenConfig(...a),
}));
jest.mock("../../backend/scripts/models/Trade", () => ({
  findOneAndUpdate: (...a) => mockTradeFindOneAndUpdate(...a),
  updateOne: jest.fn().mockResolvedValue({}),
  findOne: jest.fn(() => ({
    select: jest.fn(() => ({ lean: jest.fn().mockResolvedValue({ status: "PAID" }) })),
  })),
}));
jest.mock("../../backend/scripts/models/Order", () => ({ findOneAndUpdate: jest.fn().mockResolvedValue({}) }));
jest.mock("../../backend/scripts/models/User", () => ({
  findOne: jest.fn(() => ({ select: jest.fn(() => ({ lean: jest.fn().mockResolvedValue(null) })) })),
  findOneAndUpdate: (...a) => mockUserFindOneAndUpdate(...a),
}));
jest.mock("../../backend/scripts/models/RevenueEvent", () => ({
  findOneAndUpdate: (...a) => mockRevenueFindOneAndUpdate(...a),
}), { virtual: false });
jest.mock("mongoose", () => ({
  startSession: jest.fn().mockResolvedValue({
    startTransaction: jest.fn(),
    commitTransaction: jest.fn().mockResolvedValue(),
    abortTransaction: jest.fn().mockResolvedValue(),
    endSession: jest.fn().mockResolvedValue(),
  }),
}));

const fs = require("fs");
const path = require("path");
const worker = require("../../backend/scripts/services/eventListener");

const TOKEN = "0x1111111111111111111111111111111111111111";
const MAKER = "0x2222222222222222222222222222222222222222";
const TAKER = "0x3333333333333333333333333333333333333333";
const VAULT = "0x4444444444444444444444444444444444444444";

function ev(eventName, args, blockNumber, index) {
  return { eventName, args, blockNumber, index, transactionHash: "0xabc" };
}

function repArgs(wallet) {
  return {
    wallet, successful: 1n, failed: 0n, bannedUntil: 0n, effectiveTier: 0n,
    manualReleaseCount: 1n, autoReleaseCount: 0n, mutualCancelCount: 0n, disputedResolvedCount: 0n,
    burnCount: 0n, disputeWinCount: 0n, disputeLossCount: 0n, partialSettlementCount: 0n,
    riskPoints: 0n, lastPositiveEventAt: 1n, lastNegativeEventAt: 0n,
  };
}

beforeEach(() => {
  jest.clearAllMocks();
  mockRedisStore.clear();
  mockTradeFindOneAndUpdate.mockResolvedValue({ _id: "t" });
  mockUserFindOneAndUpdate.mockResolvedValue({});
  mockRevenueFindOneAndUpdate.mockResolvedValue({});
  mockUpdateCachedTokenConfig.mockResolvedValue(undefined);
});

describe("K2-08 TokenLimitsUpdated", () => {
  it("listener ABI quotes the contract signature and the event is watched", () => {
    const src = fs.readFileSync(path.join(__dirname, "../../backend/scripts/services/eventListener.js"), "utf8");
    expect(src).toContain('"event TokenLimitsUpdated(address indexed token, uint8 decimals, uint256[4] tierMaxAmountsBaseUnit)"');
    expect(src).toMatch(/"TokenConfigUpdated", "TokenLimitsUpdated"/);
  });

  it("DLQ re-drive maps positional args and patches decimals + tier limits without an RPC", async () => {
    const synthetic = worker.buildSyntheticEventFromDLQEntry({
      eventName: "TokenLimitsUpdated",
      txHash: "0xabc",
      blockNumber: 10,
      args: [TOKEN, 6n, [1n, 2n, 3n, 4n]],
    });
    await worker._processEvent(synthetic);
    expect(mockRefreshProtocolConfig).not.toHaveBeenCalled();
    expect(mockUpdateCachedTokenConfig).toHaveBeenCalledWith(TOKEN, {
      decimals: 6,
      tierMaxAmountsBaseUnit: ["1", "2", "3", "4"],
    });
  });

  it("malformed limits throw (retry/DLQ) instead of writing a partial config", async () => {
    await expect(worker._onTokenLimitsUpdated(ev("TokenLimitsUpdated", { token: TOKEN, decimals: 6n, tierMaxAmountsBaseUnit: [1n, 2n] }, 10, 1)))
      .rejects.toThrow(/4 elemanl/);
    await expect(worker._onTokenLimitsUpdated(ev("TokenLimitsUpdated", { token: TOKEN, tierMaxAmountsBaseUnit: [1n, 2n, 3n, 4n] }, 10, 1)))
      .rejects.toThrow(/decimals/);
    expect(mockUpdateCachedTokenConfig).not.toHaveBeenCalled();
  });

  it("an older TokenLimitsUpdated cannot overwrite newer limits (per-token ordering)", async () => {
    await worker._onTokenLimitsUpdated(ev("TokenLimitsUpdated", { token: TOKEN, decimals: 6n, tierMaxAmountsBaseUnit: [5n, 6n, 7n, 8n] }, 20, 3));
    await worker._onTokenLimitsUpdated(ev("TokenLimitsUpdated", { token: TOKEN, decimals: 6n, tierMaxAmountsBaseUnit: [1n, 2n, 3n, 4n] }, 19, 0));
    expect(mockUpdateCachedTokenConfig).toHaveBeenCalledTimes(1);
    expect(mockUpdateCachedTokenConfig.mock.calls[0][1].tierMaxAmountsBaseUnit).toEqual(["5", "6", "7", "8"]);
  });
});

describe("K1-06 terminal tx event order: ReputationUpdated now precedes revenue + EscrowReleased", () => {
  it("all handlers apply in the new log order (no handler assumes the trade is already terminal)", async () => {
    const prev = {
      vaultContract: worker.vaultContract,
      apply: worker._applyTerminalTransition,
      fetchType: worker._fetchTerminalResolutionType,
      fetchRep: worker._fetchReputationFromChain,
      getDate: worker._getEventDate,
    };
    worker.vaultContract = { target: VAULT };
    worker._applyTerminalTransition = jest.fn().mockResolvedValue({ _id: "t" });
    worker._fetchTerminalResolutionType = jest.fn().mockResolvedValue("MANUAL_RELEASE");
    worker._fetchReputationFromChain = jest.fn().mockResolvedValue({ consecutiveBans: 0n });
    worker._getEventDate = jest.fn(async () => new Date(1_700_000_000_000));
    try {
      // [TR] releaseFunds sonrası gerçek sıra (dalga5.k.test.js K1-06): Rep(maker), Rep(taker), Revenue, Released.
      const seq = [
        ev("ReputationUpdated", repArgs(MAKER), 100, 0),
        ev("ReputationUpdated", repArgs(TAKER), 100, 1),
        ev("ProtocolRevenueSent", { token: TOKEN, amount: 15n, kind: 0n, tradeId: 7n, treasury: VAULT }, 100, 4),
        ev("EscrowReleased", { tradeId: 7n, maker: MAKER, taker: TAKER, takerFee: 15n, makerFee: 15n }, 100, 7),
      ];
      for (const e of seq) await worker._processEvent(e);

      expect(mockUserFindOneAndUpdate).toHaveBeenCalledTimes(2);
      expect(mockUserFindOneAndUpdate.mock.calls.map((c) => c[0].wallet_address)).toEqual([MAKER, TAKER]);
      expect(worker._applyTerminalTransition).toHaveBeenCalledTimes(1);
      expect(worker._applyTerminalTransition.mock.calls[0][0]).toMatchObject({ tradeIdNum: "7", terminalStatus: "RESOLVED" });
      // vault-bound escrow revenue stays skipped (EscrowRevenueReceived is primary), independent of order
      expect(mockRevenueFindOneAndUpdate).not.toHaveBeenCalled();
    } finally {
      worker.vaultContract = prev.vaultContract;
      worker._applyTerminalTransition = prev.apply;
      worker._fetchTerminalResolutionType = prev.fetchType;
      worker._fetchReputationFromChain = prev.fetchRep;
      worker._getEventDate = prev.getDate;
    }
  });
});

describe("K3-07 SettlementExpired(old) + SettlementProposed(new) in one tx", () => {
  function lastSet() {
    const calls = mockTradeFindOneAndUpdate.mock.calls;
    return calls[calls.length - 1][1].$set;
  }

  it("mirror ends with the new PROPOSED proposal; a replayed old SettlementExpired is ignored", async () => {
    const prevDate = worker._getEventDate;
    worker._getEventDate = jest.fn(async () => new Date(1_700_000_000_000));
    try {
      await worker._processEvent(ev("SettlementExpired", { tradeId: 9n, proposalId: 1n }, 200, 2));
      expect(lastSet()["settlement_proposal.state"]).toBe("EXPIRED");
      expect(lastSet()["settlement_proposal.proposal_id"]).toBe("1");

      await worker._processEvent(ev("SettlementProposed", {
        tradeId: 9n, proposalId: 2n, proposer: TAKER, makerShareBps: 4000n, takerShareBps: 6000n, expiresAt: 1_700_003_600n,
      }, 200, 3));
      expect(lastSet()["settlement_proposal.state"]).toBe("PROPOSED");
      expect(lastSet()["settlement_proposal.proposal_id"]).toBe("2");

      const callsBefore = mockTradeFindOneAndUpdate.mock.calls.length;
      await worker._processEvent(ev("SettlementExpired", { tradeId: 9n, proposalId: 1n }, 200, 2));
      expect(mockTradeFindOneAndUpdate.mock.calls.length).toBe(callsBefore);
    } finally {
      worker._getEventDate = prevDate;
    }
  });
});
