"use strict";

// scopeEscrowMirrors göçü: sahte db (gerçek indeks davranışı: aynı anahtar + farklı ad/seçenek -> code 85).

const { matches } = require("./helpers/memoryModel");

const ACTIVE = "0xa042e919978e929e4d8f9bef73f9a2bcffefee8d";
const OLD = "0x1111111111111111111111111111111111111111";
const LEGACY = `legacy:${OLD}`;
const T = "2026-01-10T00:00:00.000Z";
const ORIGINAL_ENV = { ...process.env };

const mig = () => require("../../backend/scripts/migrations/scopeEscrowMirrors");

beforeEach(() => {
  process.env.ARAF_ESCROW_ADDRESS = ACTIVE;
  process.env.EXPECTED_CHAIN_ID = "84532";
});
afterEach(() => {
  process.env = { ...ORIGINAL_ENV };
});

const keyName = (key) => Object.entries(key).map(([k, v]) => `${k}_${v}`).join("_");
const sameKey = (a, b) => JSON.stringify(Object.entries(a)) === JSON.stringify(Object.entries(b));

function setPath(doc, path, value) {
  const parts = path.split(".");
  let cur = doc;
  parts.slice(0, -1).forEach((k) => { cur[k] = cur[k] || {}; cur = cur[k]; });
  cur[parts[parts.length - 1]] = value;
}

function createFakeDb({ orders = [], trades = [], stats = [] } = {}) {
  const calls = [];
  const data = {
    orders: orders.map((d, i) => ({ _id: `o${i + 1}`, ...d })),
    trades: trades.map((d, i) => ({ _id: `t${i + 1}`, ...d })),
    terminal_trade_stats: stats.map((d, i) => ({ _id: `s${i + 1}`, ...d })),
  };
  const indexes = {
    orders: [
      { name: "_id_", key: { _id: 1 } },
      { name: "onchain_order_id_1", key: { onchain_order_id: 1 }, unique: true },
    ],
    trades: [
      { name: "_id_", key: { _id: 1 } },
      { name: "onchain_escrow_id_1", key: { onchain_escrow_id: 1 }, unique: true, sparse: true },
    ],
    terminal_trade_stats: [
      { name: "_id_", key: { _id: 1 } },
      { name: "trade_key_1", key: { trade_key: 1 }, unique: true },
    ],
  };
  const unsetPath = (doc, path) => { delete doc[path]; };

  function collection(name) {
    const docs = data[name];
    const log = (op, extra = {}) => calls.push({ op, collection: name, ...extra });
    return {
      find(filter) {
        log("find");
        return { toArray: async () => docs.filter((d) => matches(d, filter)).map((d) => ({ ...d })) };
      },
      async countDocuments(filter) { log("countDocuments"); return docs.filter((d) => matches(d, filter)).length; },
      async updateMany(filter, update) {
        const hit = docs.filter((d) => matches(d, filter));
        log("updateMany", { update, n: hit.length });
        hit.forEach((d) => {
          Object.entries(update.$set || {}).forEach(([k, v]) => setPath(d, k, v));
          Object.keys(update.$unset || {}).forEach((k) => unsetPath(d, k));
        });
        return { matchedCount: hit.length, modifiedCount: hit.length };
      },
      async indexes() { log("indexes"); return indexes[name].map((i) => ({ ...i })); },
      async createIndex(key, options = {}) {
        const compoundPresentBefore = indexes[name].some((i) => i.unique && Object.keys(i.key).length === 2);
        log("createIndex", { key, options, compoundPresentBefore });
        const spec = { name: options.name || keyName(key), key, unique: Boolean(options.unique), sparse: Boolean(options.sparse) };
        const same = indexes[name].find((i) => sameKey(i.key, key));
        if (same) {
          const identical = same.name === spec.name && Boolean(same.unique) === spec.unique && Boolean(same.sparse) === spec.sparse;
          if (identical) return same.name;
          const err = new Error(`Index already exists with a different name/options: ${same.name}`);
          err.code = same.name === spec.name ? 86 : 85;
          throw err;
        }
        if (spec.unique) {
          const seen = new Set();
          for (const d of docs) {
            const k = Object.keys(key).map((f) => String(d[f] ?? null)).join("|");
            if (seen.has(k)) { const e = new Error("E11000 duplicate key"); e.code = 11000; throw e; }
            seen.add(k);
          }
        }
        indexes[name].push(spec);
        return spec.name;
      },
      async dropIndex(indexName) {
        const compoundPresent = indexes[name].some((i) => i.unique && Object.keys(i.key).length === 2);
        log("dropIndex", { indexName, compoundPresent });
        indexes[name] = indexes[name].filter((i) => i.name !== indexName);
      },
      async deleteMany() { log("deleteMany"); throw new Error("deleteMany yasak"); },
      async deleteOne() { log("deleteOne"); throw new Error("deleteOne yasak"); },
      async drop() { log("drop"); throw new Error("drop yasak"); },
    };
  }
  return { collection, calls, data, indexes };
}

const dataset = () => ({
  orders: [
    { onchain_order_id: "2", timers: { created_at_onchain: new Date("2025-12-01T00:00:00Z") }, created_at: new Date("2025-12-01T00:00:00Z") }, // legacy
    { onchain_order_id: "3", timers: { created_at_onchain: null }, created_at: new Date("2026-02-01T00:00:00Z") }, // active (created_at geri dönüşü)
    { onchain_order_id: "9" }, // tarihsiz -> sınıflandırılamayan
    { onchain_order_id: "4", timers: { created_at_onchain: new Date(T) }, created_at: new Date("2025-01-01T00:00:00Z") }, // eşik = aktif
  ],
  trades: [
    { onchain_escrow_id: "2", timers: {}, created_at: new Date("2025-12-05T00:00:00Z") }, // legacy
    { onchain_escrow_id: "5", timers: { created_at_onchain: new Date("2026-03-01T00:00:00Z") } }, // active
  ],
  stats: [
    { trade_key: "2", locked_at: null, resolved_at: new Date("2025-12-06T00:00:00Z") }, // legacy (resolved_at)
    { trade_key: "5", recorded_at: new Date("2026-03-02T00:00:00Z") }, // active (recorded_at)
  ],
});
// Beklenen: aktif = o3,o4,t5,s5 = 4; legacy = o2,t2,s2 = 3; sınıflandırılamayan = 1 (o9)

const args = (extra = {}) => ({
  apply: false, batch: null, rollback: null, expectedActive: null, expectedLegacy: null,
  legacyAddress: OLD, deployTimestamp: T, ...extra,
});
const WRITE_OPS = ["updateMany", "createIndex", "dropIndex"];
const writes = (db) => db.calls.filter((c) => WRITE_OPS.includes(c.op));

describe("scopeEscrowMirrors: fake db fidelity", () => {
  it("same key with a different name/options throws code 85 (and 86 for same name)", async () => {
    const db = createFakeDb();
    const col = db.collection("orders");
    await expect(col.createIndex({ onchain_order_id: 1 }, { name: "onchain_order_id_lookup" })).rejects.toMatchObject({ code: 85 });
    await expect(col.createIndex({ onchain_order_id: 1 }, { name: "onchain_order_id_1" })).rejects.toMatchObject({ code: 86 });
    expect(db.indexes.orders.map((i) => i.name)).toEqual(["_id_", "onchain_order_id_1"]);
  });
});

describe("scopeEscrowMirrors: dry-run", () => {
  it("writes nothing and reports classification counts + index plan", async () => {
    const db = createFakeDb(dataset());
    const out = await mig().runScopeEscrowMirrors({ db, args: args() });
    expect(writes(db)).toEqual([]);
    expect(out).toMatchObject({ mode: "dry-run", applied: false, active: 4, legacy: 3, unclassifiable: 1, conflicts: 0 });
    expect(out.indexes.every((p) => p.createCompound && p.dropOld)).toBe(true);
    expect(db.data.orders.every((d) => d.escrow_address === undefined)).toBe(true);
  });

  it("threshold is inclusive: a document exactly at the deploy timestamp is ACTIVE", async () => {
    const db = createFakeDb({ orders: [{ onchain_order_id: "4", created_at: new Date(T) }] });
    const out = await mig().runScopeEscrowMirrors({ db, args: args() });
    expect(out.collections.orders).toMatchObject({ active: 1, legacy: 0 });
  });
});

describe("scopeEscrowMirrors: apply", () => {
  const applyArgs = (extra = {}) => args({ apply: true, expectedActive: "4", expectedLegacy: "3", batch: "b1", ...extra });

  it("scopes documents, leaves undated ones alone, and stamps the batch", async () => {
    const db = createFakeDb(dataset());
    const out = await mig().runScopeEscrowMirrors({ db, args: applyArgs() });
    expect(out.applied).toBe(true);
    const byId = (id) => db.data.orders.find((d) => d.onchain_order_id === id);
    expect(byId("3")).toMatchObject({ escrow_address: ACTIVE, chain_id: 84532, scope_migration_batch: "b1" });
    expect(byId("4")).toMatchObject({ escrow_address: ACTIVE });
    expect(byId("2")).toMatchObject({ escrow_address: LEGACY, scope_migration_batch: "b1" });
    expect(byId("2").chain_id).toBeUndefined();
    expect(byId("9").escrow_address).toBeUndefined();
    expect(db.data.trades.find((d) => d.onchain_escrow_id === "2").escrow_address).toBe(LEGACY);
    expect(db.data.terminal_trade_stats.find((d) => d.trade_key === "5")).toMatchObject({ escrow_address: ACTIVE, chain_id: 84532 });
  });

  it("index order per collection: fields written -> compound unique created -> old unique dropped (no conflict, no lookup index)", async () => {
    const db = createFakeDb(dataset());
    await mig().runScopeEscrowMirrors({ db, args: applyArgs() });
    for (const name of ["orders", "trades", "terminal_trade_stats"]) {
      const seq = db.calls.filter((c) => c.collection === name && WRITE_OPS.includes(c.op)).map((c) => c.op);
      const firstCreate = seq.indexOf("createIndex");
      const drop = seq.indexOf("dropIndex");
      expect(seq.lastIndexOf("updateMany")).toBeLessThan(firstCreate);
      expect(firstCreate).toBeLessThan(drop);
      expect(seq.filter((o) => o === "createIndex")).toHaveLength(1);
      expect(seq.filter((o) => o === "dropIndex")).toHaveLength(1);
    }
    // eski unique yalnız bileşik unique varken düşer; tek alanlı lookup indeksi hiç oluşturulmaz
    expect(db.calls.filter((c) => c.op === "dropIndex").every((c) => c.compoundPresent)).toBe(true);
    expect(db.calls.filter((c) => c.op === "createIndex").every((c) => Object.keys(c.key).length === 2)).toBe(true);
    expect(db.indexes.orders.map((i) => i.name).sort()).toEqual(["_id_", "escrow_address_1_onchain_order_id_1"]);
    expect(db.indexes.trades.find((i) => i.name === "escrow_address_1_onchain_escrow_id_1")).toMatchObject({ unique: true, sparse: true });
    expect(db.indexes.terminal_trade_stats.map((i) => i.name)).toContain("escrow_address_1_trade_key_1");
    expect(db.indexes.terminal_trade_stats.map((i) => i.name)).not.toContain("trade_key_1");
  });

  it("running apply twice is safe (second run: nothing to scope, indexes skipped)", async () => {
    const db = createFakeDb(dataset());
    await mig().runScopeEscrowMirrors({ db, args: applyArgs() });
    db.calls.length = 0;
    // ikinci çalışma: yalnız tarihsiz (sınıflandırılamayan) belge kaldı; aktif/legacy = 0
    const out = await mig().runScopeEscrowMirrors({ db, args: applyArgs({ expectedActive: "0", expectedLegacy: "0", batch: "b2" }) });
    expect(out).toMatchObject({ applied: true, active: 0, legacy: 0, unclassifiable: 1 });
    expect(db.calls.filter((c) => c.op === "createIndex" || c.op === "dropIndex")).toEqual([]);
    expect(db.calls.filter((c) => c.op === "updateMany" && c.n > 0)).toEqual([]);
  });

  it("picks up documents the old runtime wrote without escrow_address in between (second apply)", async () => {
    const db = createFakeDb(dataset());
    await mig().runScopeEscrowMirrors({ db, args: applyArgs() });
    db.data.orders.push({ _id: "late", onchain_order_id: "77", created_at: new Date("2026-06-01T00:00:00Z") });
    const out = await mig().runScopeEscrowMirrors({ db, args: applyArgs({ expectedActive: "1", expectedLegacy: "0", batch: "b2" }) });
    expect(out.applied).toBe(true);
    expect(db.data.orders.find((d) => d._id === "late")).toMatchObject({ escrow_address: ACTIVE, scope_migration_batch: "b2" });
  });

  it("expected count mismatch writes nothing and is a refusal", async () => {
    const db = createFakeDb(dataset());
    await expect(mig().runScopeEscrowMirrors({ db, args: applyArgs({ expectedActive: "5" }) })).rejects.toMatchObject({ refusal: true });
    await expect(mig().runScopeEscrowMirrors({ db, args: applyArgs({ expectedLegacy: "0" }) })).rejects.toMatchObject({ refusal: true });
    expect(writes(db)).toEqual([]);
  });

  it("missing --expected-* in apply is refused before any scan or write", async () => {
    const db = createFakeDb(dataset());
    await expect(mig().runScopeEscrowMirrors({ db, args: applyArgs({ expectedActive: null }) })).rejects.toMatchObject({ refusal: true });
    expect(db.calls).toEqual([]);
  });

  it("conflict: an ACTIVE-class id that already exists in the active escrow stops apply with zero writes", async () => {
    const data = dataset();
    data.orders.push({ onchain_order_id: "3", escrow_address: ACTIVE, chain_id: 84532, created_at: new Date("2026-05-01T00:00:00Z") });
    const db = createFakeDb(data);
    await expect(mig().runScopeEscrowMirrors({ db, args: applyArgs() })).rejects.toThrow(/Çakışma/);
    expect(writes(db)).toEqual([]);
    const dry = await mig().runScopeEscrowMirrors({ db, args: args() });
    expect(dry.conflicts).toBe(1);
  });

  it("never calls deleteMany/deleteOne/drop", async () => {
    const db = createFakeDb(dataset());
    await mig().runScopeEscrowMirrors({ db, args: applyArgs() });
    await mig().runScopeEscrowMirrors({ db, args: args({ rollback: "b1", apply: true }) });
    expect(db.calls.filter((c) => ["deleteMany", "deleteOne", "drop"].includes(c.op))).toEqual([]);
  });

  it("rejects a legacy address equal to the active escrow and unsafe batch ids", async () => {
    const db = createFakeDb(dataset());
    await expect(mig().runScopeEscrowMirrors({ db, args: applyArgs({ legacyAddress: ACTIVE }) })).rejects.toThrow(/aynı/);
    await expect(mig().runScopeEscrowMirrors({ db, args: applyArgs({ batch: "x; rm -rf /" }) })).rejects.toThrow(/batch/);
    expect(writes(db)).toEqual([]);
  });
});

describe("scopeEscrowMirrors: rollback", () => {
  it("dry-run writes nothing; apply unsets only that batch's three fields and leaves indexes alone", async () => {
    const db = createFakeDb(dataset());
    await mig().runScopeEscrowMirrors({ db, args: args({ apply: true, expectedActive: "4", expectedLegacy: "3", batch: "b1" }) });
    // başka bir batch'in belgesi
    db.data.orders.push({ _id: "other", onchain_order_id: "88", escrow_address: ACTIVE, chain_id: 84532, scope_migration_batch: "b2" });
    db.calls.length = 0;

    const dry = await mig().runScopeEscrowMirrors({ db, args: args({ rollback: "b1" }) });
    expect(writes(db)).toEqual([]);
    expect(dry).toMatchObject({ mode: "rollback", applied: false });
    expect(dry.collections.orders.matched).toBe(3);

    const done = await mig().runScopeEscrowMirrors({ db, args: args({ rollback: "b1", apply: true }) });
    expect(done.applied).toBe(true);
    expect(db.calls.filter((c) => c.op === "createIndex" || c.op === "dropIndex")).toEqual([]);
    const upd = db.calls.filter((c) => c.op === "updateMany");
    upd.forEach((c) => expect(c.update).toEqual({ $unset: { escrow_address: "", chain_id: "", scope_migration_batch: "" } }));
    const o = (id) => db.data.orders.find((d) => d.onchain_order_id === id);
    expect(o("3").escrow_address).toBeUndefined();
    expect(o("3").scope_migration_batch).toBeUndefined();
    expect(o("2").escrow_address).toBeUndefined();
    expect(o("88")).toMatchObject({ escrow_address: ACTIVE, scope_migration_batch: "b2" });
  });

  it("rejects unsafe rollback batch ids", async () => {
    const db = createFakeDb(dataset());
    await expect(mig().runScopeEscrowMirrors({ db, args: args({ rollback: "$ne" }) })).rejects.toThrow(/rollback/);
    expect(db.calls).toEqual([]);
  });
});

describe("scopeEscrowMirrors: args and secrets", () => {
  it("parseArgs handles flags and rejects unknown ones", () => {
    const p = mig().parseArgs(["--apply", "--expected-active=3", "--expected-legacy=1", "--batch=b1", "--legacy-address=" + OLD, "--deploy-timestamp=1767225600"]);
    expect(p).toMatchObject({ apply: true, expectedActive: "3", expectedLegacy: "1", batch: "b1", legacyAddress: OLD, deployTimestamp: "1767225600" });
    expect(() => mig().parseArgs(["--drop"])).toThrow(/Bilinmeyen/);
    expect(() => mig().parseArgs(["--evil=1"])).toThrow(/Bilinmeyen/);
  });

  it("parseDeployTimestamp accepts ISO and unix seconds", () => {
    expect(mig().parseDeployTimestamp("2026-01-10T00:00:00Z").toISOString()).toBe(T);
    expect(mig().parseDeployTimestamp("1768003200").toISOString()).toBe(T);
    expect(() => mig().parseDeployTimestamp("nope")).toThrow();
  });

  it("maskError hides the Mongo URI credentials and RPC keys", () => {
    const env = { MONGODB_URI: "mongodb+srv://user:p4ss@cluster0.example.net/db", BASE_RPC_URL: "https://base-sepolia.g.alchemy.com/v2/abcdefghijklmnopqrstuvwxyz123456" };
    const text = mig().maskError(new Error(`connect failed ${env.MONGODB_URI} and ${env.BASE_RPC_URL}`), env);
    expect(text).not.toContain("p4ss");
    expect(text).not.toContain("abcdefghijklmnopqrstuvwxyz123456");
    const text2 = mig().maskError(new Error("bad mongodb://u:secretpw@h:27017/x and https://rpc.example/v2/abcdefghijklmnopqrstuvwxyz123456"), {});
    expect(text2).not.toContain("secretpw");
    expect(text2).not.toContain("abcdefghijklmnopqrstuvwxyz123456");
  });

  it("resolves the threshold from RPC getBlock through an injected resolver when no timestamp is given", async () => {
    const db = createFakeDb(dataset());
    const resolveThreshold = jest.fn().mockResolvedValue(new Date(T));
    const out = await mig().runScopeEscrowMirrors({ db, args: args({ deployTimestamp: null }), resolveThreshold });
    expect(resolveThreshold).toHaveBeenCalled();
    expect(out.threshold).toBe(T);
  });

  it("classification leaves undated stats untouched (count only)", async () => {
    const db = createFakeDb({ stats: [{ trade_key: "7" }] });
    const out = await mig().runScopeEscrowMirrors({ db, args: args({ apply: true, expectedActive: "0", expectedLegacy: "0", batch: "bx" }) });
    expect(out.collections.terminal_trade_stats).toMatchObject({ unclassifiable: 1, written: 0 });
    expect(db.data.terminal_trade_stats[0].escrow_address).toBeUndefined();
  });
});
