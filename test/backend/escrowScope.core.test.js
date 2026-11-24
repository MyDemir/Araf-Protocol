"use strict";

// Escrow kapsamı: escrowScope birimi, şema/indeks sözleşmesi ve listener yazma yolu.

jest.mock("../../backend/scripts/config/redis", () => ({
  getRedisClient: jest.fn(() => ({ get: jest.fn(), setEx: jest.fn(), del: jest.fn(), rPush: jest.fn(), set: jest.fn() })),
}));
jest.mock("../../backend/scripts/utils/logger", () => ({ info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() }));
jest.mock("../../backend/scripts/services/protocolConfig", () => ({
  updateCachedFeeConfig: jest.fn(),
  updateCachedCooldownConfig: jest.fn(),
  updateCachedTokenConfig: jest.fn(),
}));

const { createMemoryModel } = require("./helpers/memoryModel");

const ACTIVE = "0xa042e919978e929e4d8f9bef73f9a2bcffefee8d";
const LEGACY = "legacy:0x1111111111111111111111111111111111111111";

const mockOrder = {};
const mockTrade = {};
jest.mock("../../backend/scripts/models/Order", () => ({
  findOneAndUpdate: (...a) => mockOrder.model.findOneAndUpdate(...a),
  updateOne: (...a) => mockOrder.updateOne(...a),
}));
jest.mock("../../backend/scripts/models/Trade", () => ({
  findOneAndUpdate: (...a) => mockTrade.model.findOneAndUpdate(...a),
  updateOne: jest.fn().mockResolvedValue({}),
  findOne: jest.fn(),
}));
jest.mock("../../backend/scripts/models/User", () => ({ findOne: jest.fn(), findOneAndUpdate: jest.fn() }));
jest.mock("mongoose", () => ({
  startSession: jest.fn().mockResolvedValue({
    startTransaction: jest.fn(),
    commitTransaction: jest.fn().mockResolvedValue(),
    abortTransaction: jest.fn().mockResolvedValue(),
    endSession: jest.fn().mockResolvedValue(),
  }),
}));

const ORIGINAL_ENV = { ...process.env };
const scope = () => require("../../backend/scripts/services/escrowScope");

afterEach(() => {
  process.env = { ...ORIGINAL_ENV };
});

describe("escrowScope", () => {
  it("lowercases the address and returns Number chain id", () => {
    process.env.ARAF_ESCROW_ADDRESS = "0xA042E919978E929E4D8F9BEF73F9A2BCFFEFEE8D";
    process.env.EXPECTED_CHAIN_ID = "84532";
    expect(scope().getActiveEscrowScope()).toEqual({ escrow_address: ACTIVE, chain_id: 84532 });
    expect(scope().escrowScopeFilter()).toEqual({ escrow_address: ACTIVE });
  });

  it("is fail-closed in production when env is missing (ESCROW_SCOPE_UNAVAILABLE)", () => {
    process.env.NODE_ENV = "production";
    delete process.env.ARAF_ESCROW_ADDRESS;
    delete process.env.EXPECTED_CHAIN_ID;
    expect(() => scope().escrowScopeFilter()).toThrow(/ESCROW_SCOPE_UNAVAILABLE/);
    try { scope().getActiveEscrowScope(); } catch (e) { expect(e.code).toBe("ESCROW_SCOPE_UNAVAILABLE"); }
    process.env.ARAF_ESCROW_ADDRESS = ACTIVE;
    expect(() => scope().escrowScopeFilter()).toThrow(/ESCROW_SCOPE_UNAVAILABLE/);
  });

  it("outside production an empty env yields an empty filter (legacy behaviour)", () => {
    process.env.NODE_ENV = "test";
    delete process.env.ARAF_ESCROW_ADDRESS;
    delete process.env.EXPECTED_CHAIN_ID;
    expect(scope().escrowScopeFilter()).toEqual({});
    expect(scope().matchesActiveEscrow({ escrow_address: "anything" })).toBe(true);
  });

  it("matchesActiveEscrow rejects other escrows and missing addresses when scoped", () => {
    process.env.ARAF_ESCROW_ADDRESS = ACTIVE;
    process.env.EXPECTED_CHAIN_ID = "84532";
    const { matchesActiveEscrow } = scope();
    expect(matchesActiveEscrow({ escrow_address: ACTIVE })).toBe(true);
    expect(matchesActiveEscrow({ escrow_address: LEGACY })).toBe(false);
    expect(matchesActiveEscrow({})).toBe(false);
    expect(matchesActiveEscrow(null)).toBe(false);
  });
});

describe("eventListener writes are escrow scoped", () => {
  const order = (id) => ({
    id,
    owner: "0x1111111111111111111111111111111111111111",
    side: 0,
    tokenAddress: "0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
    totalAmount: 100n,
    remainingAmount: 100n,
    minFillAmount: 1n,
    remainingMakerBondReserve: 10n,
    remainingTakerBondReserve: 0n,
    takerFeeBpsSnapshot: 15,
    makerFeeBpsSnapshot: 15,
    tier: 1,
    paymentRiskLevel: 1,
    state: 0,
    orderRef: "0x" + "12".repeat(32),
  });

  beforeEach(() => {
    process.env.ARAF_ESCROW_ADDRESS = ACTIVE;
    process.env.EXPECTED_CHAIN_ID = "84532";
    mockOrder.model = createMemoryModel([
      { escrow_address: LEGACY, onchain_order_id: "2", status: "OPEN", marker: "old-contract" },
    ]);
    mockOrder.updateOne = jest.fn().mockResolvedValue({});
    mockTrade.model = createMemoryModel([
      { escrow_address: LEGACY, onchain_escrow_id: "2", status: "LOCKED", marker: "old-trade" },
    ]);
  });

  it("new escrow's order #2 is a separate document; the legacy one is untouched", async () => {
    const worker = require("../../backend/scripts/services/eventListener");
    await worker._upsertOrderMirror(order(2n), {});
    const docs = mockOrder.model.docs;
    expect(docs).toHaveLength(2);
    const legacy = docs.find((d) => d.escrow_address === LEGACY);
    const fresh = docs.find((d) => d.escrow_address === ACTIVE);
    expect(legacy).toMatchObject({ marker: "old-contract", status: "OPEN", onchain_order_id: "2" });
    expect(legacy.chain_id).toBeUndefined();
    expect(fresh).toMatchObject({ onchain_order_id: "2", chain_id: 84532, escrow_address: ACTIVE });
    const [filter, update] = mockOrder.model.findOneAndUpdate.mock.calls[0];
    expect(filter).toEqual({ escrow_address: ACTIVE, onchain_order_id: "2" });
    expect(update.$set).toMatchObject({ escrow_address: ACTIVE, chain_id: 84532 });
  });

  it("new escrow's trade #2 is a separate document; the legacy one is untouched", async () => {
    const worker = require("../../backend/scripts/services/eventListener");
    await worker._upsertTradeMirror(
      {
        id: 2n,
        parentOrderId: 0n,
        maker: "0x3333333333333333333333333333333333333333",
        taker: "0x1111111111111111111111111111111111111111",
        tokenAddress: "0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
        cryptoAmount: 10n,
        makerBond: 1n,
        takerBond: 1n,
        takerFeeBpsSnapshot: 15,
        makerFeeBpsSnapshot: 15,
        tier: 1,
        paymentRiskLevelSnapshot: 1,
        state: 1,
      },
      {}
    ).catch((e) => { throw e; });
    const docs = mockTrade.model.docs;
    expect(docs.filter((d) => d.onchain_escrow_id === "2")).toHaveLength(2);
    expect(docs.find((d) => d.escrow_address === LEGACY)).toMatchObject({ marker: "old-trade", status: "LOCKED" });
    expect(docs.find((d) => d.escrow_address === ACTIVE)).toMatchObject({ chain_id: 84532 });
  });
});
