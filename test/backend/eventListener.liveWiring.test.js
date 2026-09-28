"use strict";

const mockRedisGet = jest.fn();
jest.mock("../../backend/scripts/config/redis", () => ({
  getRedisClient: jest.fn(() => ({
    get: (...args) => mockRedisGet(...args),
    set: jest.fn(),
    setEx: jest.fn(),
    del: jest.fn(),
    rPush: jest.fn(),
  })),
}));

jest.mock("../../backend/scripts/utils/logger", () => ({
  info: jest.fn(),
  warn: jest.fn(),
  error: jest.fn(),
  debug: jest.fn(),
}));

jest.mock("../../backend/scripts/services/protocolConfig", () => ({
  updateCachedFeeConfig: jest.fn(),
  updateCachedCooldownConfig: jest.fn(),
  updateCachedTokenConfig: jest.fn(),
  refreshProtocolConfig: jest.fn(),
}));

const mockOrderFindOneAndUpdate = jest.fn();
const mockOrderUpdateOne = jest.fn().mockResolvedValue({});
jest.mock("../../backend/scripts/models/Order", () => ({
  findOneAndUpdate: (...args) => mockOrderFindOneAndUpdate(...args),
  updateOne: (...args) => mockOrderUpdateOne(...args),
}));

const mockTradeFindOneAndUpdate = jest.fn();
const mockTradeFindOne = jest.fn();
jest.mock("../../backend/scripts/models/Trade", () => ({
  findOneAndUpdate: (...args) => mockTradeFindOneAndUpdate(...args),
  updateOne: jest.fn().mockResolvedValue({}),
  findOne: (...args) => mockTradeFindOne(...args),
}));

jest.mock("../../backend/scripts/models/User", () => ({
  findOne: jest.fn(),
  findOneAndUpdate: jest.fn(),
}));

jest.mock("mongoose", () => ({
  startSession: jest.fn().mockResolvedValue({
    startTransaction: jest.fn(),
    commitTransaction: jest.fn().mockResolvedValue(),
    abortTransaction: jest.fn().mockResolvedValue(),
    endSession: jest.fn().mockResolvedValue(),
  }),
}));

const worker = require("../../backend/scripts/services/eventListener");

const MAKER = "0x3333333333333333333333333333333333333333";
const TAKER = "0x1111111111111111111111111111111111111111";
const TOKEN = "0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa";

const tradeData = {
  id: 5n,
  parentOrderId: 7n,
  maker: MAKER,
  taker: TAKER,
  tokenAddress: TOKEN,
  cryptoAmount: 100n,
  makerBond: 8n,
  takerBond: 10n,
  takerFeeBpsSnapshot: 15,
  makerFeeBpsSnapshot: 15,
  tier: 1,
  paymentRiskLevelSnapshot: 1,
  state: 1,
  lockedAt: 1000n,
  paidAt: 0n,
  challengedAt: 0n,
  ipfsReceiptHash: "",
  pingedAt: 0n,
  pingedByTaker: false,
  challengePingedAt: 0n,
  challengePingedByMaker: false,
};

const parentOrder = { side: 0, orderRef: `0x${"cd".repeat(32)}` };

describe("eventListener live wiring hardening", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockRedisGet.mockResolvedValue(null);
    mockTradeFindOneAndUpdate.mockResolvedValue({ lastErrorObject: { updatedExisting: true }, value: {} });
  });

  it("routes vault/rewards events to their own contracts and skips them when not configured", () => {
    const escrow = { id: "escrow" };
    const vault = { id: "vault" };
    const rewards = { id: "rewards" };
    worker.contract = escrow;
    worker.vaultContract = vault;
    worker.rewardsContract = rewards;

    expect(worker._contractForEvent("OrderFilled")).toBe(escrow);
    expect(worker._contractForEvent("EscrowRevenueReceived")).toBe(vault);
    expect(worker._contractForEvent("ExternalRewardFunded")).toBe(vault);
    expect(worker._contractForEvent("EpochRewardAllocated")).toBe(rewards);
    expect(worker._contractForEvent("RewardClaimed")).toBe(rewards);

    worker.vaultContract = null;
    expect(worker._contractForEvent("EscrowRevenueReceived")).toBeNull();
  });

  it("security_trade_mirror_upsert_uses_dotted_paths_and_never_wipes_receipt_or_decay_fields", async () => {
    await worker._upsertTradeMirror(tradeData, { parentOrder, listingRef: `0x${"ab".repeat(32)}` });

    const [, update] = mockTradeFindOneAndUpdate.mock.calls[0];
    const keys = Object.keys(update.$set);
    ["evidence", "financials", "canonical_refs", "fee_snapshot", "fill_metadata"].forEach((nested) => {
      expect(keys).not.toContain(nested);
    });
    expect(update.$set["financials.crypto_amount"]).toBe("100");
    expect(update.$set["evidence.ipfs_receipt_hash"]).toBeUndefined();
  });

  it("copies the parent order fiat/rate enrichment into the child trade", async () => {
    await worker._upsertTradeMirror(tradeData, {
      parentOrder,
      marketMeta: { fiat_currency: "TRY", exchange_rate: 34.25 },
    });
    const [, update] = mockTradeFindOneAndUpdate.mock.calls[0];
    expect(update.$set["financials.fiat_currency"]).toBe("TRY");
    expect(update.$set["financials.exchange_rate"]).toBe(34.25);
  });

  it("applies an owner-matched pending market meta intent when the order mirror is created", async () => {
    mockRedisGet.mockResolvedValue(JSON.stringify({ owner: MAKER, fiat_currency: "USD", exchange_rate: 1 }));
    const market = await worker._applyPendingMarketMeta({
      onchain_order_id: "7",
      owner_address: MAKER,
      refs: { order_ref: parentOrder.orderRef },
      market: { crypto_asset: "USDT", exchange_rate: null },
    });

    expect(mockRedisGet).toHaveBeenCalledWith(`order_meta:${parentOrder.orderRef}:${MAKER}`);
    expect(market).toEqual(expect.objectContaining({ fiat_currency: "USD", exchange_rate: 1 }));
    expect(mockOrderUpdateOne).toHaveBeenCalledWith(
      { onchain_order_id: "7", "market.exchange_rate": null },
      { $set: { "market.fiat_currency": "USD", "market.exchange_rate": 1 } },
      { session: undefined }
    );
  });

  it("classifies EscrowReleased as AUTO_RELEASE from the contract terminal snapshot", async () => {
    mockTradeFindOne.mockReturnValue({
      select: jest.fn().mockReturnValue({ lean: jest.fn().mockResolvedValue({ status: "PAID" }) }),
    });
    mockTradeFindOneAndUpdate.mockResolvedValue({ parent_order_id: null });
    worker.contract = { getRewardableTrade: jest.fn().mockResolvedValue({ outcome: 2n }) };
    worker._getEventDate = jest.fn().mockResolvedValue(new Date("2026-01-01T00:00:00Z"));

    await worker._onEscrowReleased({ eventName: "EscrowReleased", args: { tradeId: 5n } });

    const [, update] = mockTradeFindOneAndUpdate.mock.calls[0];
    expect(update.$set.resolution_type).toBe("AUTO_RELEASE");
  });

  it("stores the burned total from EscrowBurned (burnExpired emits no BleedingDecayed)", async () => {
    mockTradeFindOneAndUpdate.mockResolvedValue({ parent_order_id: null });
    worker._getEventDate = jest.fn().mockResolvedValue(new Date("2026-01-01T00:00:00Z"));

    await worker._onEscrowBurned({ eventName: "EscrowBurned", args: { tradeId: 5n, burnedAmount: 118n } });

    const [, update] = mockTradeFindOneAndUpdate.mock.calls[0];
    expect(update.$set["financials.burned_amount"]).toBe("118");
    expect(update.$set["financials.burned_amount_num"]).toBe(118);
  });
});
