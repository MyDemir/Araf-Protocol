"use strict";

const express = require("express");
const request = require("supertest");

const WALLET = "0x" + "1".repeat(40);
const OTHER = "0x" + "2".repeat(40);

function chain(value) {
  return jest.fn().mockReturnValue({ select: jest.fn().mockReturnValue({ lean: jest.fn().mockResolvedValue(value) }) });
}

// ── B3-02: receipts ön kontrol ────────────────────────────────────────────────
describe("P25 B3-02: receipts yetki/durum kontrolü dosya işlenmeden önce", () => {
  function load(Trade) {
    let router;
    const encryptField = jest.fn().mockResolvedValue("enc");
    jest.isolateModules(() => {
      jest.doMock("../../backend/scripts/middleware/auth", () => ({
        requireAuth: (req, _res, next) => { req.wallet = WALLET; next(); },
        requireSessionWalletMatch: (_req, _res, next) => next(),
      }));
      jest.doMock("../../backend/scripts/middleware/rateLimiter", () => ({ receiptUploadLimiter: (_req, _res, next) => next() }));
      jest.doMock("../../backend/scripts/services/encryption", () => ({ encryptField }));
      jest.doMock("../../backend/scripts/models/Trade", () => Trade);
      jest.doMock("../../backend/scripts/utils/logger", () => ({ info: jest.fn(), warn: jest.fn(), error: jest.fn() }));
      router = require("../../backend/scripts/routes/receipts");
    });
    const app = express();
    app.use("/api/receipts", router);
    app.use(require("../../backend/scripts/middleware/errorHandler").globalErrorHandler);
    return { app, encryptField };
  }

  const upload = (app) => request(app).post("/api/receipts/upload")
    .field("onchainEscrowId", "5")
    .attach("receipt", Buffer.from("%PDF-1.4 x"), { filename: "a.pdf", contentType: "application/pdf" });

  const cases = [
    ["trade yok", null, 404, "#5 numaralı trade bulunamadı."],
    ["taker değil", { taker_address: OTHER, status: "LOCKED", evidence: {} }, 403, "Yalnızca taker dekont yükleyebilir."],
    ["dekont zaten var", { taker_address: WALLET, status: "LOCKED", evidence: { receipt_encrypted: "x" } }, 409, "Bu işlem için dekont zaten yüklendi. Üzerine yazılamaz."],
    ["LOCKED değil", { taker_address: WALLET, status: "PAID", evidence: {} }, 400, "Dekont yalnızca LOCKED durumunda yüklenebilir (mevcut: PAID)."],
  ];

  it.each(cases)("%s -> ret, şifreleme ve yazma hiç çalışmaz", async (_name, row, status, message) => {
    const Trade = { findOne: chain(row), findOneAndUpdate: jest.fn() };
    const { app, encryptField } = load(Trade);
    const res = await upload(app);
    expect(res.status).toBe(status);
    expect(res.body.error).toBe(message);
    expect(encryptField).not.toHaveBeenCalled();
    expect(Trade.findOneAndUpdate).not.toHaveBeenCalled();
  });

  it("geçerli istek -> 201; atomik findOneAndUpdate yarış için yine çalışır", async () => {
    const Trade = {
      findOne: chain({ taker_address: WALLET, status: "LOCKED", evidence: {} }),
      findOneAndUpdate: jest.fn().mockResolvedValue({ _id: "t" }),
    };
    const { app, encryptField } = load(Trade);
    const res = await upload(app);
    expect(res.status).toBe(201);
    expect(encryptField).toHaveBeenCalledTimes(1);
    expect(Trade.findOneAndUpdate.mock.calls[0][0]).toMatchObject({ taker_address: WALLET, status: "LOCKED", "evidence.receipt_encrypted": null });
  });

  it("ön kontrol geçip yarışta kaybedilirse (findOneAndUpdate null) aynı hata kodu döner", async () => {
    const Trade = {
      findOne: jest.fn()
        .mockReturnValueOnce({ select: () => ({ lean: async () => ({ taker_address: WALLET, status: "LOCKED", evidence: {} }) }) })
        .mockReturnValueOnce({ select: () => ({ lean: async () => ({ taker_address: WALLET, status: "LOCKED", evidence: { receipt_encrypted: "x" } }) }) }),
      findOneAndUpdate: jest.fn().mockResolvedValue(null),
    };
    const { app } = load(Trade);
    const res = await upload(app);
    expect(res.status).toBe(409);
  });
});

// ── B4-03: RPC yerel limiter ──────────────────────────────────────────────────
describe("P25 B4-03: yerel limiter reddi cooldown'a girmez", () => {
  const { createRpcPool } = require("../../backend/scripts/services/rpcProvider");
  const originalEnv = process.env;
  beforeEach(() => { process.env = { ...originalEnv, EXPECTED_CHAIN_ID: "8453", NODE_ENV: "test" }; });
  afterEach(() => { process.env = originalEnv; });
  const A = "https://a.example/rpc";
  const B = "https://b.example/rpc";
  const localErr = () => Object.assign(new Error("[RpcRateLimiter] Too Many Requests: queue full (1)"), { code: "RPC_LOCAL_RATE_LIMIT" });
  const okLimiter = { acquire: () => Promise.resolve() };
  const quiet = { warn: jest.fn(), error: jest.fn(), info: jest.fn() };
  const mk = (limiterA, innerA) => {
    const sentB = jest.fn().mockResolvedValue([{ id: 1, result: "0x2" }]);
    const pool = createRpcPool({
      urls: [A, B],
      log: quiet,
      probeFor: () => ({ getNetwork: async () => ({ chainId: 8453n }) }),
      createInner: (url) => ({ _send: url === B ? sentB : innerA }),
      rateLimiterFor: (url) => (url === A ? limiterA : okLimiter),
    });
    return { pool, sentB };
  };

  it("send: acquire reddi -> hata fırlar, birincil soğumaya girmez, yedeğe kayılmaz", async () => {
    const { pool, sentB } = mk({ acquire: () => Promise.reject(localErr()) }, jest.fn());
    await expect(pool.send([{ id: 1 }])).rejects.toMatchObject({ code: "RPC_LOCAL_RATE_LIMIT" });
    expect(pool.entries[0].cooldownUntil).toBe(0);
    expect(sentB).not.toHaveBeenCalled();
  });

  it("zincir doğrulaması sırasındaki yerel limiter reddi de soğumaya girmez", async () => {
    let first = true;
    const limiter = { acquire: () => (first ? ((first = false), Promise.reject(localErr())) : Promise.resolve()) };
    const { pool } = mk(limiter, jest.fn().mockResolvedValue([{ id: 1, result: "0x1" }]));
    await expect(pool.send([{ id: 1 }])).rejects.toMatchObject({ code: "RPC_LOCAL_RATE_LIMIT" });
    expect(pool.entries[0].cooldownUntil).toBe(0);
  });

  it("gerçek sağlayıcı 429 hâlâ soğuma + yedek davranışı verir (regresyon)", async () => {
    const real429 = jest.fn().mockRejectedValue(Object.assign(new Error("429 Too Many Requests"), { code: 429 }));
    const { pool, sentB } = mk(okLimiter, real429);
    await expect(pool.send([{ id: 1 }])).resolves.toEqual([{ id: 1, result: "0x2" }]);
    expect(pool.entries[0].cooldownUntil).toBeGreaterThan(0);
    expect(sentB).toHaveBeenCalled();
  });
});

// ── B3-09: admin summary / riskOnly ───────────────────────────────────────────
describe("P25 B3-09: admin summary aggregate + kısa TTL önbellek", () => {
  const ADMIN = "0x1111111111111111111111111111111111111111";
  let prevAdmins;
  beforeEach(() => { prevAdmins = process.env.ADMIN_WALLETS; process.env.ADMIN_WALLETS = ADMIN; });
  afterEach(() => { process.env.ADMIN_WALLETS = prevAdmins; jest.resetModules(); });

  function load(Trade, User = { find: jest.fn() }) {
    let router;
    jest.isolateModules(() => {
      const pass = (_req, _res, next) => next();
      jest.doMock("../../backend/scripts/middleware/auth", () => ({ requireAuth: pass, requireSessionWalletMatch: pass }));
      jest.doMock("../../backend/scripts/services/paymentRails", () => require("./helpers/paymentRailsPassthrough"));
      jest.doMock("../../backend/scripts/middleware/rateLimiter", () => ({ adminReadLimiter: pass, adminWriteLimiter: pass }));
      jest.doMock("../../backend/scripts/services/health", () => ({ getReadiness: jest.fn().mockResolvedValue({ ok: true }) }));
      jest.doMock("../../backend/scripts/services/dlqProcessor", () => ({ getDlqMetrics: jest.fn(() => ({})) }));
      jest.doMock("../../backend/scripts/config/redis", () => ({ getRedisClient: jest.fn(() => ({ lLen: jest.fn().mockResolvedValue(0) })) }));
      jest.doMock("../../backend/scripts/services/eventListener", () => ({ provider: null }));
      jest.doMock("../../backend/scripts/models/HistoricalStat", () => ({
        findOne: jest.fn(() => ({ sort: jest.fn(() => ({ lean: jest.fn().mockResolvedValue(null) })) })),
      }));
      jest.doMock("../../backend/scripts/models/Trade", () => Trade);
      jest.doMock("../../backend/scripts/models/User", () => User);
      jest.doMock("../../backend/scripts/models/Feedback", () => ({ find: jest.fn(), countDocuments: jest.fn() }));
      router = require("../../backend/scripts/routes/admin");
    });
    const app = express();
    app.locals.schedulerState = {};
    app.use((req, _res, next) => { req.wallet = ADMIN; next(); });
    app.use("/api/admin", router);
    return app;
  }

  it("summary: 2 ardışık çağrı DB'yi bir kez sorgular, yanıt şekli aynı; çözünürlük tek aggregate", async () => {
    const Trade = {
      countDocuments: jest.fn().mockResolvedValue(3),
      aggregate: jest.fn().mockResolvedValue([{ _id: "MANUAL_RELEASE", n: 2 }, { _id: "UNKNOWN", n: 1 }]),
    };
    const app = load(Trade);
    const r1 = await request(app).get("/api/admin/summary");
    const callsAfterFirst = Trade.countDocuments.mock.calls.length + Trade.aggregate.mock.calls.length;
    const r2 = await request(app).get("/api/admin/summary");
    expect(r1.status).toBe(200);
    expect(Trade.countDocuments.mock.calls.length + Trade.aggregate.mock.calls.length).toBe(callsAfterFirst);
    expect(r2.body.tradeCounts).toEqual(r1.body.tradeCounts);
    expect(r2.body.resolutionAnalytics).toEqual(r1.body.resolutionAnalytics);
    expect(Object.keys(r1.body.resolutionAnalytics).sort()).toEqual([
      "autoReleaseCount", "burnedCount", "disputedResolutionCount", "manualReleaseCount", "mutualCancelCount",
      "partialSettlementCount", "paymentWindowExpiredCount", "unknownResolvedCount",
    ]);
    expect(r1.body.resolutionAnalytics.manualReleaseCount).toBe(2);
    expect(r1.body.resolutionAnalytics.unknownResolvedCount).toBe(1);
    // Çözünürlük için ayrı countDocuments yok: toplam sorgu sayısı eskisinin (~16) çok altında.
    expect(Trade.countDocuments.mock.calls.some(([f]) => f?.resolution_type !== undefined)).toBe(false);
    expect(callsAfterFirst).toBeLessThanOrEqual(12);
  });

  it("summary: başarısız sonuç önbelleğe alınmaz", async () => {
    const Trade = {
      countDocuments: jest.fn().mockRejectedValueOnce(new Error("boom")).mockResolvedValue(4),
      aggregate: jest.fn().mockResolvedValue([]),
    };
    const app = load(Trade);
    const r1 = await request(app).get("/api/admin/summary");
    expect(r1.body.degraded.sources.tradeCountsFallbackUsed).toBe(true);
    const r2 = await request(app).get("/api/admin/summary");
    expect(r2.body.degraded.sources.tradeCountsFallbackUsed).toBe(false);
    expect(r2.body.tradeCounts.active).toBe(4);
  });

  it("riskOnly: ikinci sayfa isteği 1000'lik taramayı ve User sorgusunu tekrarlamaz; yanıt şekli aynı", async () => {
    const mkTrade = (i) => ({
      _id: String(i), onchain_escrow_id: String(i), status: "LOCKED",
      maker_address: "0x" + String(i).padStart(40, "a"), taker_address: "0x" + "b".repeat(40),
      created_at: new Date(2026, 0, i),
    });
    const rows = [mkTrade(1), mkTrade(2), mkTrade(3)];
    const find = jest.fn(() => ({ select: () => ({ sort: () => ({ limit: () => ({ lean: async () => rows }) }) }) }));
    const userFind = jest.fn(() => ({ select: () => ({ lean: async () => [] }) }));
    const app = load({ find, countDocuments: jest.fn() }, { find: userFind });
    const p1 = await request(app).get("/api/admin/trades?riskOnly=true&page=1&limit=1");
    const p2 = await request(app).get("/api/admin/trades?riskOnly=true&page=2&limit=1");
    expect(p1.status).toBe(200);
    expect(p1.body.paginationScope.mode).toBe("risk_only_bounded_window");
    expect(p2.body.page).toBe(2);
    expect(p2.body.total).toBe(p1.body.total);
    expect(find).toHaveBeenCalledTimes(1);
    expect(userFind).toHaveBeenCalledTimes(1);
  });
});

// ── B3-15 / B4-17: şema indeksleri ────────────────────────────────────────────
describe("P25 B3-15 / B4-17: şema index tanımları", () => {
  beforeAll(() => {
    jest.resetModules();
    for (const m of ["Trade", "Order", "HistoricalStat", "User"]) jest.dontMock(`../../backend/scripts/models/${m}`);
  });
  const keys = (model) => model.schema.indexes().map(([k, o]) => ({ k, unique: !!o?.unique }));
  const has = (list, k) => list.some((e) => JSON.stringify(e.k) === JSON.stringify(k));

  it("B3-15: Trade maker/taker + timers.resolved_at, Order owner_address + updated_at", () => {
    const t = keys(require("../../backend/scripts/models/Trade"));
    expect(has(t, { maker_address: 1, "timers.resolved_at": -1 })).toBe(true);
    expect(has(t, { taker_address: 1, "timers.resolved_at": -1 })).toBe(true);
    const o = keys(require("../../backend/scripts/models/Order"));
    expect(has(o, { owner_address: 1, updated_at: -1 })).toBe(true);
  });

  it.each([
    ["RevenueEvent", { tx_hash: 1 }, { tx_hash: 1, log_index: 1 }],
    ["RewardClaim", { tx_hash: 1 }, { tx_hash: 1, log_index: 1 }],
    ["RewardFunding", { tx_hash: 1 }, { tx_hash: 1, log_index: 1 }],
    ["RewardEpochAllocationEvent", { tx_hash: 1 }, { tx_hash: 1, log_index: 1 }],
    ["RewardEpoch", { epoch: 1 }, { epoch: 1, token: 1 }],
    ["HistoricalStat", { date: -1 }, { date: 1 }],
  ])("B4-17: %s önek index'i yok, unique kısıt duruyor", (name, redundant, unique) => {
    const list = keys(require(`../../backend/scripts/models/${name}`));
    expect(has(list, redundant)).toBe(false);
    expect(list.some((e) => JSON.stringify(e.k) === JSON.stringify(unique) && e.unique)).toBe(true);
  });
});

// ── B4-17: migrasyon betiği ───────────────────────────────────────────────────
describe("P25 B4-17: dropRedundantIndexes migrasyonu", () => {
  const mig = require("../../backend/scripts/migrations/dropRedundantIndexes");

  function fakeDb(state) {
    const dropped = [];
    return {
      dropped,
      db: {
        collection: (name) => ({
          indexes: async () => {
            if (!state[name]) throw Object.assign(new Error("ns"), { codeName: "NamespaceNotFound" });
            return state[name];
          },
          dropIndex: async (ixName) => { dropped.push([name, ixName]); },
        }),
      },
    };
  }
  const full = () => ({
    revenueevents: [{ name: "tx_hash_1", key: { tx_hash: 1 } }, { name: "tx_hash_1_log_index_1", key: { tx_hash: 1, log_index: 1 }, unique: true }],
    rewardepochs: [{ name: "epoch_1", key: { epoch: 1 } }, { name: "epoch_1_token_1", key: { epoch: 1, token: 1 }, unique: true }],
    historical_stats: [{ name: "date_-1", key: { date: -1 } }, { name: "date_1", key: { date: 1 }, unique: true }],
  });

  it("varsayılan kuru çalıştırma: hiçbir index düşürülmez", async () => {
    expect(mig.parseArgs([])).toEqual({ apply: false });
    const { db, dropped } = fakeDb(full());
    const out = await mig.runDropRedundantIndexes({ db });
    expect(out.dryRun).toBe(true);
    expect(dropped).toEqual([]);
    expect(out.results.filter((r) => r.action === "drop")).toHaveLength(3);
  });

  it("--apply: yalnız kapsanan tekil index'ler düşer; unique index'e dokunulmaz", async () => {
    expect(mig.parseArgs(["--apply"])).toEqual({ apply: true });
    const { db, dropped } = fakeDb(full());
    await mig.runDropRedundantIndexes({ db, apply: true });
    expect(dropped.sort()).toEqual([["historical_stats", "date_-1"], ["revenueevents", "tx_hash_1"], ["rewardepochs", "epoch_1"]]);
    expect(dropped.some(([, n]) => ["tx_hash_1_log_index_1", "epoch_1_token_1", "date_1"].includes(n))).toBe(false);
  });

  it("kapsayan unique index yoksa ya da unique değilse düşürülmez (kısıt gevşemez)", async () => {
    const state = {
      revenueevents: [{ name: "tx_hash_1", key: { tx_hash: 1 } }],
      rewardepochs: [{ name: "epoch_1", key: { epoch: 1 } }, { name: "epoch_1_token_1", key: { epoch: 1, token: 1 } }],
    };
    const { db, dropped } = fakeDb(state);
    const out = await mig.runDropRedundantIndexes({ db, apply: true });
    expect(dropped).toEqual([]);
    expect(out.results.filter((r) => r.action === "skip_not_covered")).toHaveLength(2);
  });

  it("düşürülecek anahtar unique ise asla düşürülmez; koleksiyon yoksa atlanır", async () => {
    const { db, dropped } = fakeDb({
      historical_stats: [{ name: "date_-1", key: { date: -1 }, unique: true }, { name: "date_1", key: { date: 1 }, unique: true }],
    });
    const out = await mig.runDropRedundantIndexes({ db, apply: true });
    expect(dropped).toEqual([]);
    expect(out.results.find((r) => r.collection === "historical_stats").action).toBe("skip_unique");
    expect(out.results.find((r) => r.collection === "revenueevents").action).toBe("absent");
  });

  it("idempotent: ikinci çalıştırma düşecek bir şey bulmaz", async () => {
    const state = full();
    const db = { collection: (n) => ({ indexes: async () => state[n] || (() => { throw Object.assign(new Error("ns"), { codeName: "NamespaceNotFound" }); })(), dropIndex: async (ix) => { state[n] = state[n].filter((e) => e.name !== ix); } }) };
    await mig.runDropRedundantIndexes({ db, apply: true });
    const again = await mig.runDropRedundantIndexes({ db, apply: true });
    expect(again.results.filter((r) => r.dropped)).toEqual([]);
  });
});
