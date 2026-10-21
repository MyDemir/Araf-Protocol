"use strict";

// [TR] Dalga 4 / P12: kontrat bannedUntil + cleanPeriod eşitliğinde revert eder (block.timestamp <= bannedUntil + cleanPeriod).
//      Backend aday sınırı kontratla bire bir (strict) olmalı: eşitlikte tx gönderilmez.
// [EN] Contract reverts when now == bannedUntil + cleanPeriod; the backend boundary must be strict as well.
const mockUsers = [];
const mockDecay = jest.fn().mockResolvedValue({ hash: "0xabc", wait: jest.fn().mockResolvedValue({ blockNumber: 1 }) });
const mockGetReputation = jest.fn();
const mockCleanPeriod = jest.fn();

jest.mock("ethers", () => ({
  ethers: {
    JsonRpcProvider: jest.fn(() => ({})),
    Wallet: jest.fn(() => ({ address: "0xrelayer" })),
    Contract: jest.fn(() => ({
      decayReputation: mockDecay,
      getReputation: mockGetReputation,
      cleanPeriod: mockCleanPeriod,
    })),
  },
}));

jest.mock("../../backend/scripts/models/User", () => ({
  find: jest.fn(() => ({
    select: jest.fn().mockReturnThis(),
    sort: jest.fn().mockReturnThis(),
    limit: jest.fn().mockReturnThis(),
    lean: jest.fn(async () => mockUsers.slice()),
  })),
}));

const { runReputationDecay } = require("../../backend/scripts/jobs/reputationDecay");

const CLEAN_S = 90 * 86400;
const NOW_MS = new Date("2026-10-21T00:00:00Z").getTime();
const NOW_S = NOW_MS / 1000;
const W_EDGE = "0x" + "33".repeat(20);
const W_EARLY = "0x" + "55".repeat(20);

function user(wallet, banEndS) {
  return {
    wallet_address: wallet,
    consecutive_bans: 1,
    banned_until: null,
    last_ban_ends_at: new Date(banEndS * 1000),
    reputation_breakdown: { last_negative_event_at: null },
  };
}

describe("dalga4 P12: decay ban-bitiş sınırı kontratla aynı (strict)", () => {
  let nowSpy;
  beforeAll(() => {
    process.env.BASE_RPC_URL = "http://localhost:8545";
    process.env.RELAYER_PRIVATE_KEY = "0x" + "11".repeat(32);
    process.env.ARAF_ESCROW_ADDRESS = "0x" + "22".repeat(20);
  });
  beforeEach(() => {
    jest.clearAllMocks();
    mockUsers.length = 0;
    mockCleanPeriod.mockResolvedValue(BigInt(CLEAN_S));
    nowSpy = jest.spyOn(Date, "now").mockReturnValue(NOW_MS);
  });
  afterEach(() => nowSpy.mockRestore());

  it("bannedUntil + cleanPeriod == şimdi ise aday değil; bir saniye önce ise aday", async () => {
    const endOf = { [W_EDGE]: NOW_S - CLEAN_S, [W_EARLY]: NOW_S - CLEAN_S - 1 };
    mockUsers.push(user(W_EDGE, endOf[W_EDGE]), user(W_EARLY, endOf[W_EARLY]));
    mockGetReputation.mockImplementation(async (w) => ({
      bannedUntil: BigInt(endOf[w]),
      consecutiveBans: 1n,
      lastNegativeEventAt: 0n,
    }));

    await runReputationDecay();
    expect(mockGetReputation).toHaveBeenCalledWith(W_EDGE);
    expect(mockDecay).toHaveBeenCalledTimes(1);
    expect(mockDecay).toHaveBeenCalledWith(W_EARLY);
  });
});
