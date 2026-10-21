"use strict";

// Dalga 5 P14: B1-07 (settlement sıra koruması), B1-08 (DLQ last_error redaksiyonu), B1-09 (DLQ sAdd/rPush sırası),
// B1-11 (boş blok ack kaydı), B1-13 (TradeOutcomeRecorded mirror yok), B1-14 (CHALLENGED release sınıfı zincirden).

const kv = new Map();
const lists = {};
const sets = {};
const L = (k) => (lists[k] = lists[k] || []);
const S = (k) => (sets[k] = sets[k] || new Set());

const mockRedis = {
  get: jest.fn(async (k) => (kv.has(k) ? kv.get(k) : null)),
  set: jest.fn(async (k, v) => { kv.set(k, v); return "OK"; }),
  rPush: jest.fn(async (k, v) => L(k).push(v)),
  lLen: jest.fn(async (k) => L(k).length),
  sIsMember: jest.fn(async (s, m) => (sets[s] && sets[s].has(m) ? 1 : 0)),
  sAdd: jest.fn(async (s, m) => { const had = S(s).has(m); S(s).add(m); return had ? 0 : 1; }),
  sRem: jest.fn(async (s, m) => { if (sets[s]) sets[s].delete(m); return 1; }),
};

jest.mock("../../backend/scripts/config/redis", () => ({ getRedisClient: jest.fn(() => mockRedis) }));
jest.mock("../../backend/scripts/utils/logger", () => ({ info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() }));
jest.mock("../../backend/scripts/services/protocolConfig", () => ({
  updateCachedFeeConfig: jest.fn(),
  updateCachedCooldownConfig: jest.fn(),
  updateCachedTokenConfig: jest.fn(),
  refreshProtocolConfig: jest.fn(),
}));

const mockTrade = { findOneAndUpdate: jest.fn(), findOne: jest.fn(), updateOne: jest.fn() };
jest.mock("../../backend/scripts/models/Trade", () => ({
  findOneAndUpdate: (...a) => mockTrade.findOneAndUpdate(...a),
  findOne: (...a) => mockTrade.findOne(...a),
  updateOne: (...a) => mockTrade.updateOne(...a),
}));
jest.mock("../../backend/scripts/models/Order", () => ({ findOneAndUpdate: jest.fn().mockResolvedValue({}) }));
jest.mock("../../backend/scripts/models/User", () => ({ findOne: jest.fn(), findOneAndUpdate: jest.fn() }));
const mockSession = {
  startTransaction: jest.fn(),
  commitTransaction: jest.fn().mockResolvedValue(),
  abortTransaction: jest.fn().mockResolvedValue(),
  endSession: jest.fn().mockResolvedValue(),
};
jest.mock("mongoose", () => ({ startSession: jest.fn().mockResolvedValue(mockSession) }));

const worker = require("../../backend/scripts/services/eventListener");

const DLQ = "worker:dlq";
const LIVE_SET = "worker:dlq:keys";
const leanOf = (doc) => ({ select: jest.fn().mockReturnValue({ lean: jest.fn().mockResolvedValue(doc) }) });
const mkEvent = (name, block, index, args = {}) => ({
  eventName: name, transactionHash: `0xtx${block}${index}`, index, blockNumber: block, args,
});
const SECRET = "SUPERSECRETKEY1234567890";

beforeEach(() => {
  jest.clearAllMocks();
  kv.clear();
  for (const k of Object.keys(lists)) delete lists[k];
  for (const k of Object.keys(sets)) delete sets[k];
  worker._blockAcks.clear();
  worker._ackCoverage = null;
  worker._lastSafeCheckpointBlock = 0;
  worker.contract = null;
  worker._getEventDate = jest.fn().mockResolvedValue(new Date("2026-01-01T00:00:00Z"));
  mockTrade.findOneAndUpdate.mockResolvedValue({ parent_order_id: "7" });
  mockTrade.updateOne.mockResolvedValue({});
  mockTrade.findOne.mockReturnValue(leanOf({ status: "PAID" }));
});

describe("B1-08: DLQ last_error redaksiyonu", () => {
  const rawMsg = `could not coalesce error (requestUrl="https://base-mainnet.g.alchemy.com/v2/${SECRET}", code=SERVER_ERROR)`;

  it("DLQ girdisine yazılan last_error RPC anahtarını içermez ve 500 karakteri aşmaz", async () => {
    await worker._addToDLQ(mkEvent("FeeConfigUpdated", 5, 1), rawMsg + " x".repeat(400));
    const stored = JSON.parse(L(DLQ)[0]);
    expect(stored.last_error).not.toContain(SECRET);
    expect(stored.last_error.length).toBeLessThanOrEqual(500);
  });

  it("re-drive hata sonucu (NoDLQ) RPC anahtarını içermez", async () => {
    worker._processEvent = jest.fn().mockRejectedValue(new Error(rawMsg));
    const result = await worker._processEventWithRetryNoDLQ(mkEvent("FeeConfigUpdated", 5, 1), 99);
    worker._processEvent = Object.getPrototypeOf(worker)._processEvent;
    expect(result.success).toBe(false);
    expect(result.error).not.toContain(SECRET);
  });
});

describe("B1-09: DLQ kayıt sırası", () => {
  it("sAdd 0 dönerse (eşzamanlı yazar anahtarı eklemiş) rPush yapılmaz", async () => {
    mockRedis.sAdd.mockResolvedValueOnce(0);
    const added = await worker._addToDLQ(mkEvent("FeeConfigUpdated", 5, 1), "err");
    expect(added).toBe(false);
    expect(mockRedis.rPush).not.toHaveBeenCalled();
    expect(L(DLQ)).toHaveLength(0);
  });

  it("rPush hata verirse anahtar set'ten geri alınır (set'te olup kuyrukta olmayan anahtar kalmaz)", async () => {
    mockRedis.rPush.mockRejectedValueOnce(new Error("conn lost"));
    await expect(worker._addToDLQ(mkEvent("FeeConfigUpdated", 5, 1), "err")).rejects.toThrow("conn lost");
    expect(S(LIVE_SET).size).toBe(0);
    // sonraki başarısızlıkta aynı event tekrar kuyruğa girebilir (kaybolmaz)
    expect(await worker._addToDLQ(mkEvent("FeeConfigUpdated", 5, 1), "err")).toBe(true);
    expect(L(DLQ)).toHaveLength(1);
  });
});

describe("B1-07: settlement mirror sıra koruması", () => {
  const proposed = (block, id) => mkEvent("SettlementProposed", block, 1, {
    tradeId: 9n, proposalId: id, proposer: "0xAb", makerShareBps: 5000n, takerShareBps: 5000n, expiresAt: 1800000000n,
  });
  const rejected = (block, id) => mkEvent("SettlementRejected", block, 2, { tradeId: 9n, proposalId: id, rejecter: "0xAb" });

  it("sonraki teklif (P2) yazıldıktan sonra yeniden sürülen eski Rejected(P1) mirror'i ezmez", async () => {
    await worker._onSettlementProposed(proposed(20, 2n));
    mockTrade.findOneAndUpdate.mockClear();

    await worker._onSettlementRejected(rejected(10, 1n));

    expect(mockTrade.findOneAndUpdate).not.toHaveBeenCalled();
  });

  it("doğru sırada gelen Proposed(P1) -> Rejected(P1) normal uygulanır", async () => {
    await worker._onSettlementProposed(proposed(10, 1n));
    await worker._onSettlementRejected(rejected(11, 1n));

    expect(mockTrade.findOneAndUpdate).toHaveBeenCalledTimes(2);
    expect(mockTrade.findOneAndUpdate.mock.calls[1][1].$set["settlement_proposal.state"]).toBe("REJECTED");
  });

  it("aynı event tekrarı (eşit konum) idempotent uygulanır", async () => {
    await worker._onSettlementRejected(rejected(11, 1n));
    await worker._onSettlementRejected(rejected(11, 1n));
    expect(mockTrade.findOneAndUpdate).toHaveBeenCalledTimes(2);
  });

  it("sıra işareti Redis'e yazılamazsa mirror yazımı başarılı sayılır (event DLQ'ya düşmez)", async () => {
    mockRedis.set.mockRejectedValueOnce(new Error("redis down"));
    await expect(worker._onSettlementRejected(rejected(11, 1n))).resolves.toBeUndefined();
  });
});

describe("B1-13: TradeOutcomeRecorded", () => {
  const ev = mkEvent("TradeOutcomeRecorded", 5, 1, { tradeId: 5n });

  it("eşleşme yok ve mirror yoksa throw eder (retry/DLQ)", async () => {
    mockTrade.updateOne.mockResolvedValue({ matchedCount: 0 });
    mockTrade.findOne.mockReturnValue(leanOf(null));
    await expect(worker._onTradeOutcomeRecorded(ev)).rejects.toThrow(/mirror bulunamadı/);
  });

  it("eşleşme yok ama mirror varsa (zaten işaretli) sessizce geçer", async () => {
    mockTrade.updateOne.mockResolvedValue({ matchedCount: 0 });
    mockTrade.findOne.mockReturnValue(leanOf({ status: "RESOLVED" }));
    await expect(worker._onTradeOutcomeRecorded(ev)).resolves.toBeUndefined();
  });
});

describe("B1-14: CHALLENGED mirror'dan release sınıfı zincirden okunur", () => {
  const ev = mkEvent("EscrowReleased", 5, 1, { tradeId: 5n });
  beforeEach(() => {
    mockTrade.findOne.mockReturnValue(leanOf({ status: "CHALLENGED", timers: { resolved_at: null } }));
  });

  it("zincir outcome=1 (MANUAL_RELEASE) diyorsa mirror CHALLENGED olsa da zincir kazanır", async () => {
    worker.contract = { getRewardableTrade: jest.fn().mockResolvedValue({ outcome: 1n }) };
    await worker._onEscrowReleased(ev);
    expect(worker.contract.getRewardableTrade).toHaveBeenCalled();
    expect(mockTrade.findOneAndUpdate.mock.calls[0][1].$set.resolution_type).toBe("MANUAL_RELEASE");
  });

  it("zincir outcome=5 ise DISPUTED_RESOLUTION", async () => {
    worker.contract = { getRewardableTrade: jest.fn().mockResolvedValue({ outcome: 5n }) };
    await worker._onEscrowReleased(ev);
    expect(mockTrade.findOneAndUpdate.mock.calls[0][1].$set.resolution_type).toBe("DISPUTED_RESOLUTION");
  });

  it("zincir görünümü yoksa CHALLENGED mirror DISPUTED_RESOLUTION'a düşer", async () => {
    worker.contract = null;
    await worker._onEscrowReleased(ev);
    expect(mockTrade.findOneAndUpdate.mock.calls[0][1].$set.resolution_type).toBe("DISPUTED_RESOLUTION");
  });

  it("zincir okuması hata verirse throw eder (UNKNOWN/yanlış sınıf yazılmaz)", async () => {
    worker.contract = { getRewardableTrade: jest.fn().mockRejectedValue(new Error("rpc down")) };
    await expect(worker._onEscrowReleased(ev)).rejects.toThrow("rpc down");
    expect(mockTrade.findOneAndUpdate).not.toHaveBeenCalled();
  });
});

describe("B1-11: boş bloklar için ack kaydı birikmez", () => {
  const setupPoll = (events = []) => {
    worker.contract = {};
    worker._liveEpoch = worker._liveEpoch ?? 0;
    worker._stopRequested = false;
    worker._cfg = jest.fn(() => 100);
    worker._fetchRangeEvents = jest.fn(async () => events);
  };

  afterEach(() => {
    delete worker._cfg;
    delete worker._fetchRangeEvents;
    delete worker._processEventWithRetry;
  });

  it("1000 boş blok okunduktan sonra _blockAcks boş kalır ve checkpoint aralığın sonuna ilerler", async () => {
    setupPoll([]);
    await worker._pollLiveRange(1, 1000);
    expect(worker._blockAcks.size).toBe(0);

    await worker._advanceSafeCheckpointFromAcks(1000);
    expect(worker._lastSafeCheckpointBlock).toBe(1000);
  });

  it("unsafe blok checkpoint'i o blokta tutar; blok kurtarılınca ilerler", async () => {
    setupPoll([]);
    await worker._pollLiveRange(1, 50);
    worker._markBlockUnsafe(20, "0xtx:1");

    await worker._advanceSafeCheckpointFromAcks(50);
    expect(worker._lastSafeCheckpointBlock).toBe(19);

    worker._blockAcks.get(20).unsafe = false;
    worker._blockAcks.get(20).failed.clear();
    await worker._advanceSafeCheckpointFromAcks(50);
    expect(worker._lastSafeCheckpointBlock).toBe(50);
  });

  it("okunmamış (kapsam dışı) bloklar boş sayılıp geçilmez", async () => {
    setupPoll([]);
    await worker._pollLiveRange(10, 20);
    await worker._advanceSafeCheckpointFromAcks(20);
    expect(worker._lastSafeCheckpointBlock).toBe(0);
  });

  it("event içeren blok kaydı tutulur; başarılı işlenince checkpoint geçer", async () => {
    setupPoll([mkEvent("FeeConfigUpdated", 5, 1)]);
    worker._processEventWithRetry = jest.fn().mockResolvedValue(true);
    mockRedis.sIsMember.mockResolvedValue(0);
    await worker._pollLiveRange(1, 10);
    expect(worker._blockAcks.size).toBe(1);
    await worker._advanceSafeCheckpointFromAcks(10);
    expect(worker._lastSafeCheckpointBlock).toBe(10);
  });
});
