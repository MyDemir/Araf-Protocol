"use strict";

// B1-03 + B4-06: sessiz takılma / sessiz veri kaybı görünür; parse hatası karantinaya; karantina sınırlı; DLQ sınırı korunur.

const kv = new Map();
const lists = {};
const sets = {};
const L = (k) => (lists[k] = lists[k] || []);
const S = (k) => (sets[k] = sets[k] || new Set());
const lTrimImpl = (k, s, e) => { lists[k] = L(k).slice(s, e === -1 ? undefined : e + 1); };

const mockRedis = {
  get: jest.fn(async (k) => (kv.has(k) ? kv.get(k) : null)),
  set: jest.fn(async (k, v) => { kv.set(k, v); return "OK"; }),
  rPush: jest.fn(async (k, v) => L(k).push(v)),
  lPush: jest.fn(async (k, v) => L(k).unshift(v)),
  lRange: jest.fn(async (k, s, e) => (e === -1 ? [...L(k)] : L(k).slice(s, e + 1))),
  lLen: jest.fn(async (k) => L(k).length),
  lTrim: jest.fn(async (k, s, e) => lTrimImpl(k, s, e)),
  lRem: jest.fn(async (k, _c, v) => { const i = L(k).indexOf(v); if (i >= 0) L(k).splice(i, 1); return i >= 0 ? 1 : 0; }),
  sIsMember: jest.fn(async (s, m) => (sets[s] && sets[s].has(m) ? 1 : 0)),
  sAdd: jest.fn(async (s, m) => { S(s).add(m); }),
  sRem: jest.fn(async (s, m) => { if (sets[s]) sets[s].delete(m); }),
  multi: jest.fn(() => {
    const ops = [];
    const m = {
      lPush: (k, v) => { ops.push(() => L(k).unshift(v)); return m; },
      sAdd: (s, v) => { ops.push(() => S(s).add(v)); return m; },
      sRem: (s, v) => { ops.push(() => sets[s] && sets[s].delete(v)); return m; },
      expire: () => m,
      lTrim: (k, s, e) => { ops.push(() => lTrimImpl(k, s, e)); return m; },
      exec: async () => { ops.forEach((f) => f()); return []; },
    };
    return m;
  }),
};

const mockLogger = { info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() };
jest.mock("../../backend/scripts/config/redis", () => ({ getRedisClient: jest.fn(() => mockRedis) }));
jest.mock("../../backend/scripts/utils/logger", () => mockLogger);
jest.mock("../../backend/scripts/services/protocolConfig", () => ({ updateCachedFeeConfig: jest.fn(), updateCachedCooldownConfig: jest.fn(), updateCachedTokenConfig: jest.fn(), refreshProtocolConfig: jest.fn() }));
jest.mock("../../backend/scripts/models/Trade", () => ({}));
jest.mock("../../backend/scripts/models/Order", () => ({}));
jest.mock("../../backend/scripts/models/User", () => ({}));

const worker = require("../../backend/scripts/services/eventListener");
const { processDLQ, getDlqMetrics } = require("../../backend/scripts/services/dlqProcessor");

const DLQ = "worker:dlq";
const ARCHIVE = "worker:dlq:archive";
const QUAR = "worker:dlq:quarantine";
const mkEvent = (i) => ({ eventName: "FeeConfigUpdated", transactionHash: `0xtx${i}`, index: 1, blockNumber: 5, args: {} });
const entryRaw = (i, extra = {}) => JSON.stringify({
  eventName: "FeeConfigUpdated", txHash: `0xtx${i}`, logIndex: 1, idempotencyKey: `0xtx${i}:1`, blockNumber: 5,
  namedArgs: {}, args: [], attempt: 0, next_retry_at: new Date(0).toISOString(), first_seen_at: new Date(0).toISOString(), ...extra,
});

beforeEach(() => {
  jest.clearAllMocks();
  kv.clear();
  for (const k of Object.keys(lists)) delete lists[k];
  for (const k of Object.keys(sets)) delete sets[k];
  worker._blockAcks.clear();
  worker._quarantinedCount = 0;
  worker._archivedRequeueCount = 0;
  worker._stopRequested = false;
  worker._replayFailureCount = 0;
  worker.isRunning = true;
  worker.contract = {};
});
afterEach(() => { worker.isRunning = false; worker.contract = null; });

describe("B1-03 arşivlenmiş event yeniden başarısız olunca", () => {
  it("DLQ'ya geri alınır, alarm üretilir, arşiv indeksinden çıkar", async () => {
    const ev = mkEvent(1);
    S("worker:dlq:archive:keys").add("0xtx1:1");
    const added = await worker._addToDLQOrRequeueArchived(ev, "boom");
    expect(added).toBe(true);
    expect(L(DLQ)).toHaveLength(1);
    expect(sets["worker:dlq:archive:keys"].has("0xtx1:1")).toBe(false);
    expect(sets["worker:dlq:keys"].has("0xtx1:1")).toBe(true);
    expect(mockLogger.error).toHaveBeenCalledWith(expect.stringContaining("ALARM"));
  });

  it("replay arşivlenmiş event'i DLQ'ya geri alır (sessiz takılma yok)", async () => {
    const ev = mkEvent(2);
    S("worker:dlq:archive:keys").add("0xtx2:1");
    kv.set("worker:last_safe_block", "0");
    worker.provider = { getBlockNumber: jest.fn().mockResolvedValue(31) };
    worker._fetchRangeEvents = jest.fn().mockResolvedValue([ev]);
    worker._processEvent = jest.fn().mockRejectedValue(new Error("x"));
    await worker._replayMissedEvents();
    expect(L(DLQ)).toHaveLength(1);
    expect(kv.get("worker:last_safe_block")).toBe("0");
  });

  it("canlı DLQ'daki event tekrar eklenmez (üst sınır korunur)", async () => {
    S("worker:dlq:keys").add("0xtx3:1");
    expect(await worker._addToDLQOrRequeueArchived(mkEvent(3), "x")).toBe(false);
    expect(L(DLQ)).toHaveLength(0);
  });

  it("ardışık replay başarısızlığı eşikten sonra alarm üretir", () => {
    for (let i = 0; i < 4; i += 1) worker._noteReplayFailure();
    expect(mockLogger.error).not.toHaveBeenCalledWith(expect.stringContaining("Replay"));
    worker._noteReplayFailure();
    expect(mockLogger.error).toHaveBeenCalledWith(expect.stringContaining("[ALARM] Replay 5 kez"));
  });
});

describe("B4-06 DLQ işlemcisi", () => {
  it("taşma: eskiler arşive gider, logger.error ile alarm, DLQ 100'e kırpılır", async () => {
    for (let i = 0; i < 105; i += 1) L(DLQ).push(entryRaw(i, { next_retry_at: new Date(Date.now() + 3600e3).toISOString() }));
    await processDLQ();
    expect(L(DLQ)).toHaveLength(100);
    expect(L(ARCHIVE)).toHaveLength(5);
    expect(mockLogger.error).toHaveBeenCalledWith(expect.stringContaining("Taşma"));
    expect(getDlqMetrics().overflowArchived).toBe(5);
  });

  it("parse edilemeyen girdi karantinaya taşınır, ham metin loglanmaz", async () => {
    const bad = "{not-json SECRET-IBAN-TR000";
    L(DLQ).push(bad);
    await processDLQ();
    expect(L(DLQ)).toHaveLength(0);
    expect(L(QUAR)).toHaveLength(1);
    const q = JSON.parse(L(QUAR)[0]);
    expect(q.parse_error).toBe(true);
    expect(q.raw).toBe(bad);
    const logged = JSON.stringify([...mockLogger.error.mock.calls, ...mockLogger.warn.mock.calls, ...mockLogger.info.mock.calls]);
    expect(logged).not.toContain("SECRET-IBAN");
    expect(mockLogger.error).toHaveBeenCalledWith(expect.stringContaining("ALARM"));
  });

  it("backoff'ta bekleyen ilk 10+ girdi hazır girdiyi engellemez", async () => {
    const future = new Date(Date.now() + 3600e3).toISOString();
    for (let i = 0; i < 12; i += 1) L(DLQ).push(entryRaw(i, { next_retry_at: future }));
    L(DLQ).push(entryRaw(99));
    worker._processEventWithRetryNoDLQ = jest.fn().mockResolvedValue({ success: true });
    const res = await processDLQ();
    expect(worker._processEventWithRetryNoDLQ).toHaveBeenCalledTimes(1);
    expect(res.processed).toBe(1);
    expect(L(DLQ)).toHaveLength(12);
  });

  it("tur başına en çok 10 hazır girdi işlenir", async () => {
    for (let i = 0; i < 25; i += 1) L(DLQ).push(entryRaw(i));
    worker._processEventWithRetryNoDLQ = jest.fn().mockResolvedValue({ success: true });
    await processDLQ();
    expect(worker._processEventWithRetryNoDLQ).toHaveBeenCalledTimes(10);
  });

  it("karantina listesi sınırlanır (lTrim 0..999)", async () => {
    L(DLQ).push(entryRaw(1, { attempt: 9 }));
    worker._processEventWithRetryNoDLQ = jest.fn().mockResolvedValue({ success: false, error: "e" });
    await processDLQ();
    expect(L(QUAR)).toHaveLength(1);
    expect(mockRedis.lTrim).toHaveBeenCalledWith(QUAR, 0, 999);
  });
});
