"use strict";

// Ban süresi dolup checkBanExpiry'den geçen kullanıcı (banned_until=null) decay adayı olmalı.
const mockUsers = [];
const mockDecay = jest.fn().mockResolvedValue({ hash: "0xabc", wait: jest.fn().mockResolvedValue({ blockNumber: 1 }) });
const mockGetReputation = jest.fn();

jest.mock("ethers", () => ({
  ethers: {
    JsonRpcProvider: jest.fn(() => ({})),
    Wallet: jest.fn(() => ({ address: "0xrelayer" })),
    Contract: jest.fn(() => ({ decayReputation: mockDecay, getReputation: mockGetReputation })),
  },
}));

// Filtre değerlendirici: yalnızca job'un kullandığı operatörler.
function mockMatches(doc, filter) {
  return Object.entries(filter).every(([k, cond]) => {
    if (k === "$or") return cond.some((f) => mockMatches(doc, f));
    const v = doc[k] === undefined ? null : doc[k];
    if (cond && typeof cond === "object" && !(cond instanceof Date)) {
      if ("$gt" in cond && !(v > cond.$gt)) return false;
      if ("$ne" in cond && v === cond.$ne) return false;
      if ("$lte" in cond && !(v !== null && v <= cond.$lte)) return false;
      return true;
    }
    return v === cond;
  });
}

jest.mock("../../backend/scripts/models/User", () => ({
  find: jest.fn((filter) => ({
    select: jest.fn().mockReturnThis(),
    sort: jest.fn().mockReturnThis(),
    limit: jest.fn().mockReturnThis(),
    lean: jest.fn(async () => mockUsers.filter((u) => mockMatches(u, filter))),
  })),
}));

const { runReputationDecay } = require("../../backend/scripts/jobs/reputationDecay");

describe("reputationDecay: expired-ban candidate", () => {
  beforeAll(() => {
    process.env.BASE_RPC_URL = "http://localhost:8545";
    process.env.RELAYER_PRIVATE_KEY = "0x" + "11".repeat(32);
    process.env.ARAF_ESCROW_ADDRESS = "0x" + "22".repeat(20);
  });
  beforeEach(() => { jest.clearAllMocks(); mockUsers.length = 0; });

  it("checkBanExpiry preserves last_ban_ends_at and the user becomes a candidate after cleanPeriod", async () => {
    const UserActual = jest.requireActual("../../backend/scripts/models/User");
    const endsAt = new Date(Date.now() - 100 * 24 * 3600 * 1000);
    const doc = new UserActual({
      wallet_address: "0x" + "33".repeat(20),
      is_banned: true,
      banned_until: endsAt,
      consecutive_bans: 1,
    });
    doc.save = jest.fn().mockResolvedValue(doc);
    expect(await doc.checkBanExpiry()).toBe(true);
    expect(doc.banned_until).toBeNull();
    expect(doc.last_ban_ends_at).toEqual(endsAt);

    mockUsers.push({
      wallet_address: doc.wallet_address,
      consecutive_bans: doc.consecutive_bans,
      banned_until: doc.banned_until,
      last_ban_ends_at: doc.last_ban_ends_at,
    });
    mockGetReputation.mockResolvedValue({ bannedUntil: Math.floor(endsAt.getTime() / 1000), consecutiveBans: 1 });

    await runReputationDecay();
    expect(mockDecay).toHaveBeenCalledWith(doc.wallet_address);
  });
});
