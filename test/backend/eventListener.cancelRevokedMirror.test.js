"use strict";

jest.mock("../../backend/scripts/config/redis", () => ({
  getRedisClient: jest.fn(() => ({
    get: jest.fn(),
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

const mockOrderFindOneAndUpdate = jest.fn().mockResolvedValue({});
jest.mock("../../backend/scripts/models/Order", () => ({
  findOneAndUpdate: (...args) => mockOrderFindOneAndUpdate(...args),
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

const mockSession = {
  startTransaction: jest.fn(),
  commitTransaction: jest.fn().mockResolvedValue(),
  abortTransaction: jest.fn().mockResolvedValue(),
  endSession: jest.fn().mockResolvedValue(),
};

jest.mock("mongoose", () => ({
  startSession: jest.fn().mockResolvedValue(mockSession),
}));

const worker = require("../../backend/scripts/services/eventListener");

const MAKER = "0x1111111111111111111111111111111111111111";
const TAKER = "0x2222222222222222222222222222222222222222";
const leanOf = (v) => ({ select: () => ({ lean: () => Promise.resolve(v) }), lean: () => Promise.resolve(v) });
const ev = (revoker) => ({ eventName: "CancelRevoked", args: { tradeId: 5n, revoker } });

describe("eventListener CancelRevoked mirror (K11)", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockTradeFindOneAndUpdate.mockResolvedValue({});
  });

  it("is registered as an escrow event with canonical arg keys", () => {
    const synthetic = worker.buildSyntheticEventFromDLQEntry({
      eventName: "CancelRevoked", txHash: "0xabc", blockNumber: 1, args: [5n, MAKER],
    });
    expect(synthetic.args.revoker).toBe(MAKER);
    expect(worker._ARAF_ABI_FOR_TESTS).toContain("event CancelRevoked(uint256 indexed tradeId, address indexed revoker)");
  });

  it("clears the whole proposal when the only consenting party revokes", async () => {
    mockTradeFindOne.mockReturnValue(leanOf({
      maker_address: MAKER, taker_address: TAKER,
      cancel_proposal: { proposed_by: MAKER, approved_by: null, maker_signed: true, taker_signed: false },
    }));
    await worker._onCancelRevoked(ev(MAKER));
    const [, update] = mockTradeFindOneAndUpdate.mock.calls[0];
    expect(update.$set).toEqual({
      "cancel_proposal.proposed_by": null,
      "cancel_proposal.proposed_at": null,
      "cancel_proposal.approved_by": null,
      "cancel_proposal.maker_signed": false,
      "cancel_proposal.taker_signed": false,
    });
  });

  it("only drops the revoker's flag when the counterparty consent stays", async () => {
    mockTradeFindOne.mockReturnValue(leanOf({
      maker_address: MAKER, taker_address: TAKER,
      cancel_proposal: { proposed_by: TAKER, approved_by: TAKER, maker_signed: true, taker_signed: true },
    }));
    await worker._onCancelRevoked(ev(TAKER.toUpperCase().replace("0X", "0x")));
    const [, update] = mockTradeFindOneAndUpdate.mock.calls[0];
    expect(update.$set["cancel_proposal.taker_signed"]).toBe(false);
    expect(update.$set["cancel_proposal.maker_signed"]).toBe(true);
    expect(update.$set["cancel_proposal.proposed_by"]).toBe(MAKER);
    expect(update.$set["cancel_proposal.approved_by"]).toBeNull();
  });

  it("is idempotent: replaying on an already-revoked mirror yields the same state", async () => {
    mockTradeFindOne.mockReturnValue(leanOf({
      maker_address: MAKER, taker_address: TAKER,
      cancel_proposal: { proposed_by: null, approved_by: null, maker_signed: false, taker_signed: false },
    }));
    await worker._onCancelRevoked(ev(MAKER));
    await worker._onCancelRevoked(ev(MAKER));
    const [a, b] = mockTradeFindOneAndUpdate.mock.calls.map((c) => c[1]);
    expect(a).toEqual(b);
    expect(a.$set["cancel_proposal.maker_signed"]).toBe(false);
  });

  it("throws when the trade mirror is missing", async () => {
    mockTradeFindOne.mockReturnValue(leanOf(null));
    await expect(worker._onCancelRevoked(ev(MAKER))).rejects.toThrow("CancelRevoked geldi ama trade mirror bulunamadı");
    mockTradeFindOne.mockReturnValue(leanOf({ maker_address: MAKER, taker_address: TAKER, cancel_proposal: { maker_signed: true } }));
    mockTradeFindOneAndUpdate.mockResolvedValue(null);
    await expect(worker._onCancelRevoked(ev(MAKER))).rejects.toThrow("trade mirror bulunamadı");
  });

  it("rejects a revoker that is not a trade party", async () => {
    mockTradeFindOne.mockReturnValue(leanOf({ maker_address: MAKER, taker_address: TAKER, cancel_proposal: {} }));
    await expect(worker._onCancelRevoked(ev("0x3333333333333333333333333333333333333333"))).rejects.toThrow("trade tarafı değil");
  });
});
