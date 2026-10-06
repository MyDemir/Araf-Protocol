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

const mockRecord = jest.fn().mockResolvedValue(true);
jest.mock("../../backend/scripts/services/terminalStats", () => ({ recordTerminalTradeStat: (...a) => mockRecord(...a) }));

jest.mock("mongoose", () => ({
  startSession: jest.fn().mockResolvedValue(mockSession),
}));

const worker = require("../../backend/scripts/services/eventListener");

describe("eventListener terminal transition records the permanent stat counter (B23)", () => {
  beforeEach(() => jest.clearAllMocks());

  it("records the counter row with the transaction session after a terminal transition", async () => {
    const trade = { onchain_escrow_id: "5", status: "RESOLVED", parent_order_id: "7" };
    mockTradeFindOneAndUpdate.mockResolvedValue(trade);
    const session = { s: 1 };
    const out = await worker._applyTerminalTransition({
      tradeIdNum: "5", fromStates: ["LOCKED"], terminalStatus: "RESOLVED", set: {}, statsField: "stats.resolved_child_trade_count", session,
    });
    expect(out).toBe(trade);
    expect(mockRecord).toHaveBeenCalledWith(trade, { session });
  });

  it("does not record when the transition did not apply (already terminal / no match)", async () => {
    mockTradeFindOneAndUpdate.mockResolvedValue(null);
    const out = await worker._applyTerminalTransition({
      tradeIdNum: "5", fromStates: ["LOCKED"], terminalStatus: "RESOLVED", set: {}, statsField: "x", session: {},
    });
    expect(out).toBeNull();
    expect(mockRecord).not.toHaveBeenCalled();
  });
});
