"use strict";

const mockDecayReputation = jest.fn();
const mockReputation = jest.fn();

jest.mock("ethers", () => ({
  ethers: {
    JsonRpcProvider: jest.fn(),
    Wallet: jest.fn(() => ({ address: "0xrelayer" })),
    Contract: jest.fn(() => ({
      decayReputation: mockDecayReputation,
      reputation: mockReputation,
    })),
  },
}));

jest.mock("../models/User", () => ({
  find: jest.fn(() => ({
    select: jest.fn().mockReturnThis(),
    limit: jest.fn().mockResolvedValue([
      { wallet_address: "0x1111111111111111111111111111111111111111" },
      { wallet_address: "0x2222222222222222222222222222222222222222" },
    ]),
  })),
}));

const { runReputationDecay } = require("../jobs/reputationDecay");

describe("runReputationDecay", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    process.env.BASE_RPC_URL = "http://localhost:8545";
    process.env.RELAYER_PRIVATE_KEY = "0x1234567890123456789012345678901234567890123456789012345678901234";
    process.env.ARAF_ESCROW_ADDRESS = "0x3333333333333333333333333333333333333333";
  });

  test("uses on-chain reputation to select eligible users", async () => {
    const oldTs = Math.floor((Date.now() - 181 * 24 * 3600 * 1000) / 1000);
    const recentTs = Math.floor((Date.now() - 10 * 24 * 3600 * 1000) / 1000);
    mockReputation
      .mockResolvedValueOnce({ bannedUntil: BigInt(oldTs), consecutiveBans: 2n })
      .mockResolvedValueOnce({ bannedUntil: BigInt(recentTs), consecutiveBans: 2n });
    mockDecayReputation.mockResolvedValue({ hash: "0xtx" });

    await runReputationDecay();

    expect(mockDecayReputation).toHaveBeenCalledTimes(1);
    expect(mockDecayReputation).toHaveBeenCalledWith("0x1111111111111111111111111111111111111111");
  });
});

