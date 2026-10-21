"use strict";

// [TR] Dalga 2 / K3-01: kontrat affı ancak hem ban bitiminden hem son olumsuz olaydan sonra temiz dönem dolunca
//      verir. Backend yalnız aday filtreler: kuralı karşılamayan cüzdana boşuna (revert eden) tx göndermemeli.
// [EN] Wave 2 / K3-01: the backend only filters candidates; it must not send a reverting decay tx.
const mockUsers = [];
const mockDecay = jest.fn().mockResolvedValue({ hash: "0xabc", wait: jest.fn().mockResolvedValue({ blockNumber: 1 }) });
const mockGetReputation = jest.fn();
const mockCleanPeriod = jest.fn();
let mockLastFilter = null;

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

// [TR] Filtre değerlendirici: job'un kullandığı operatörler + noktalı yol. [EN] Evaluates the operators the job uses.
function mockGet(doc, key) {
  const v = key.split(".").reduce((o, p) => (o == null ? undefined : o[p]), doc);
  return v === undefined ? null : v;
}
function mockMatches(doc, filter) {
  return Object.entries(filter).every(([k, cond]) => {
    if (k === "$or") return cond.some((f) => mockMatches(doc, f));
    if (k === "$and") return cond.every((f) => mockMatches(doc, f));
    const v = mockGet(doc, k);
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
  find: jest.fn((filter) => {
    mockLastFilter = filter;
    return {
      select: jest.fn().mockReturnThis(),
      sort: jest.fn().mockReturnThis(),
      limit: jest.fn().mockReturnThis(),
      lean: jest.fn(async () => mockUsers.filter((u) => mockMatches(u, filter))),
    };
  }),
}));

const { runReputationDecay } = require("../../backend/scripts/jobs/reputationDecay");

const DAY_S = 86400;
const CLEAN_S = 90 * DAY_S;
const NOW_MS = new Date("2026-10-21T00:00:00Z").getTime();
const NOW_S = NOW_MS / 1000;
const W_CLEAN = "0x" + "11".repeat(20);
const W_DIRTY = "0x" + "22".repeat(20);
const W_EDGE = "0x" + "33".repeat(20);
const W_STALE_MIRROR = "0x" + "44".repeat(20);

function user(wallet, banEndS, lastNegS) {
  return {
    wallet_address: wallet,
    consecutive_bans: 1,
    banned_until: null,
    last_ban_ends_at: new Date(banEndS * 1000),
    reputation_breakdown: { last_negative_event_at: lastNegS == null ? null : new Date(lastNegS * 1000) },
  };
}

describe("dalga2: decay adayı son olumsuz olaydan sonra temiz dönemi bekler", () => {
  let nowSpy;
  beforeAll(() => {
    process.env.BASE_RPC_URL = "http://localhost:8545";
    process.env.RELAYER_PRIVATE_KEY = "0x" + "11".repeat(32);
    process.env.ARAF_ESCROW_ADDRESS = "0x" + "22".repeat(20);
  });
  beforeEach(() => {
    jest.clearAllMocks();
    mockUsers.length = 0;
    mockLastFilter = null;
    mockCleanPeriod.mockResolvedValue(BigInt(CLEAN_S));
    nowSpy = jest.spyOn(Date, "now").mockReturnValue(NOW_MS);
  });
  afterEach(() => nowSpy.mockRestore());

  it("temiz kalan cüzdan aday seçilir; ban sonrası temiz dönemde olumsuz olayı olan seçilmez", async () => {
    const banEnd = NOW_S - 200 * DAY_S;
    mockUsers.push(user(W_CLEAN, banEnd, banEnd - DAY_S), user(W_DIRTY, banEnd, NOW_S - 10 * DAY_S));
    mockGetReputation.mockImplementation(async (w) => ({
      bannedUntil: BigInt(banEnd),
      consecutiveBans: 1n,
      lastNegativeEventAt: BigInt(w === W_CLEAN ? banEnd - DAY_S : NOW_S - 10 * DAY_S),
    }));

    const res = await runReputationDecay();
    expect(mockDecay).toHaveBeenCalledTimes(1);
    expect(mockDecay).toHaveBeenCalledWith(W_CLEAN);
    expect(res.processed).toBe(1);
  });

  it("ayna boş/eski olsa da zincirdeki lastNegativeEventAt temiz dönemin içindeyse tx gönderilmez", async () => {
    const banEnd = NOW_S - 200 * DAY_S;
    // [TR] Ayna olayı henüz yansıtmamış (null) → havuza girer; karar zincir okumasıyla verilir.
    mockUsers.push(user(W_STALE_MIRROR, banEnd, null));
    mockGetReputation.mockResolvedValue({
      bannedUntil: BigInt(banEnd),
      consecutiveBans: 1n,
      lastNegativeEventAt: BigInt(NOW_S - DAY_S),
    });

    const res = await runReputationDecay();
    expect(mockGetReputation).toHaveBeenCalledWith(W_STALE_MIRROR);
    expect(mockDecay).not.toHaveBeenCalled();
    expect(res.processed).toBe(0);
  });

  it("aday sorgusu son olumsuz olayı temiz dönemin içinde olan aynayı havuza almaz", async () => {
    const banEnd = NOW_S - 200 * DAY_S;
    mockUsers.push(user(W_DIRTY, banEnd, NOW_S - 10 * DAY_S));
    mockGetReputation.mockResolvedValue({ bannedUntil: BigInt(banEnd), consecutiveBans: 1n, lastNegativeEventAt: 0n });

    const res = await runReputationDecay();
    expect(JSON.stringify(mockLastFilter)).toContain("reputation_breakdown.last_negative_event_at");
    expect(mockGetReputation).not.toHaveBeenCalled();
    expect(res.candidates).toBe(0);
  });

  it("sınır: son olumsuz olay tam cleanPeriod önce ise aday, bir saniye sonra ise değil", async () => {
    const banEnd = NOW_S - 200 * DAY_S;
    const W_LATE = "0x" + "55".repeat(20);
    mockUsers.push(user(W_EDGE, banEnd, NOW_S - CLEAN_S), user(W_LATE, banEnd, NOW_S - CLEAN_S + 1));
    mockGetReputation.mockImplementation(async (w) => ({
      bannedUntil: BigInt(banEnd),
      consecutiveBans: 1n,
      lastNegativeEventAt: BigInt(w === W_EDGE ? NOW_S - CLEAN_S : NOW_S - CLEAN_S + 1),
    }));

    await runReputationDecay();
    expect(mockDecay).toHaveBeenCalledTimes(1);
    expect(mockDecay).toHaveBeenCalledWith(W_EDGE);
  });
});
