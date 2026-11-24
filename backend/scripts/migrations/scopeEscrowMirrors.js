"use strict";

/**
 * scopeEscrowMirrors — escrow yeniden dağıtımı sonrası Mongo aynalarını escrow kapsamına alan canlı göç.
 * [EN] Live migration that scopes Mongo mirrors (orders, trades, terminal_trade_stats) to an escrow.
 *
 * Sınıflandırma (zaman damgasıyla): ARAF_DEPLOYMENT_BLOCK bloğunun zaman damgası = eşik.
 *   orders/trades            : timers.created_at_onchain, yoksa created_at
 *   terminal_trade_stats     : locked_at -> resolved_at -> recorded_at
 *   >= eşik -> aktif (escrow_address = ARAF_ESCROW_ADDRESS, chain_id = EXPECTED_CHAIN_ID)
 *   <  eşik -> escrow_address = "legacy:<--legacy-address|unknown>"
 *   tarih yok -> DOKUNULMAZ ("sınıflandırılamayan" sayılır).
 *
 * Güvenlik:
 *   - Varsayılan DRY-RUN (hiç yazma). Yazmak için --apply.
 *   - Apply'da --expected-active=N --expected-legacy=M ZORUNLU; dry-run sayıları tutmazsa hiçbir şey yazılmaz.
 *   - Aktif sınıfa düşecek belgenin id'si aktif escrow'da zaten varsa (çakışma) hiçbir şey yazılmaz.
 *   - Yalnız escrow_address'i olmayan belgeler işlenir (idempotent, tekrar çalıştırılabilir).
 *   - Her güncellenen belgeye scope_migration_batch yazılır; --rollback=<batch> yalnız o batch'in
 *     escrow_address, chain_id, scope_migration_batch alanlarını $unset eder (indekslere dokunmaz).
 *   - VERİ SİLME YOK: deleteMany/deleteOne/drop koleksiyon çağrılmaz. Yalnız eski tek alanlı unique indeks düşer.
 *   - İndeks sırası (her koleksiyon): alanları yaz -> yeni bileşik unique oluştur -> bileşik unique VARSA
 *     eski tek alanlı unique'i düşür. Tek alanlı "lookup" indeksi KASTEN oluşturulmaz (IndexOptionsConflict 85/86).
 *
 * Kullanım:
 *   node scripts/migrations/scopeEscrowMirrors.js [--legacy-address=0x..] [--deploy-timestamp=<ISO|unix>]   (dry-run)
 *   node scripts/migrations/scopeEscrowMirrors.js --apply --expected-active=N --expected-legacy=M [--batch=ID]
 *   node scripts/migrations/scopeEscrowMirrors.js --rollback=<batch> [--apply]
 * Çıkış kodu: 0 başarı; 1 hata; 2 ön koşul reddi (expected uyuşmazlığı, çakışma).
 */

require("dotenv").config();
const { redactRpcSecrets } = require("../utils/logRedaction");
const { maskMongoUri } = require("./dropRedundantIndexes");
const { getActiveEscrowScope } = require("../services/escrowScope");

const PREFIX = "[scopeEscrowMirrors]";
const CHUNK = 500;
const BATCH_RE = /^[A-Za-z0-9._:-]{1,64}$/;
const ADDRESS_RE = /^0x[a-fA-F0-9]{40}$/;

const COLLECTIONS = [
  {
    name: "orders",
    idField: "onchain_order_id",
    projection: { "timers.created_at_onchain": 1, created_at: 1, onchain_order_id: 1 },
    dateOf: (d) => d?.timers?.created_at_onchain || d?.created_at || null,
    compound: { key: { escrow_address: 1, onchain_order_id: 1 }, options: { unique: true, name: "escrow_address_1_onchain_order_id_1" } },
    oldIndex: { name: "onchain_order_id_1", key: { onchain_order_id: 1 } },
  },
  {
    name: "trades",
    idField: "onchain_escrow_id",
    projection: { "timers.created_at_onchain": 1, created_at: 1, onchain_escrow_id: 1 },
    dateOf: (d) => d?.timers?.created_at_onchain || d?.created_at || null,
    compound: { key: { escrow_address: 1, onchain_escrow_id: 1 }, options: { unique: true, sparse: true, name: "escrow_address_1_onchain_escrow_id_1" } },
    oldIndex: { name: "onchain_escrow_id_1", key: { onchain_escrow_id: 1 } },
  },
  {
    name: "terminal_trade_stats",
    idField: "trade_key",
    projection: { locked_at: 1, resolved_at: 1, recorded_at: 1, trade_key: 1 },
    dateOf: (d) => d?.locked_at || d?.resolved_at || d?.recorded_at || null,
    compound: { key: { escrow_address: 1, trade_key: 1 }, options: { unique: true, name: "escrow_address_1_trade_key_1" } },
    oldIndex: { name: "trade_key_1", key: { trade_key: 1 } },
  },
];

const MISSING_SCOPE = { $or: [{ escrow_address: { $exists: false } }, { escrow_address: null }] };

class RefusalError extends Error {
  constructor(message) {
    super(message);
    this.refusal = true;
  }
}

function parseArgs(argv = process.argv.slice(2)) {
  const out = { apply: false, batch: null, rollback: null, expectedActive: null, expectedLegacy: null, legacyAddress: null, deployTimestamp: null };
  for (const raw of argv) {
    if (raw === "--apply") { out.apply = true; continue; }
    const m = /^--([a-z-]+)=(.*)$/.exec(raw);
    if (!m) throw new Error(`Bilinmeyen argüman: ${raw}`);
    const [, k, v] = m;
    if (k === "batch") out.batch = v;
    else if (k === "rollback") out.rollback = v;
    else if (k === "expected-active") out.expectedActive = v;
    else if (k === "expected-legacy") out.expectedLegacy = v;
    else if (k === "legacy-address") out.legacyAddress = v;
    else if (k === "deploy-timestamp") out.deployTimestamp = v;
    else throw new Error(`Bilinmeyen argüman: --${k}`);
  }
  return out;
}

function parseDeployTimestamp(raw) {
  const text = String(raw).trim();
  if (/^\d+$/.test(text)) {
    const n = Number(text);
    return new Date(n > 1e12 ? n : n * 1000);
  }
  const d = new Date(text);
  if (Number.isNaN(d.getTime())) throw new Error("--deploy-timestamp geçersiz (ISO ya da unix saniye).");
  return d;
}

async function fetchDeployTimestampFromRpc(env = process.env) {
  const rpcUrl = env.RPC_URL || env.BASE_RPC_URL;
  const block = Number(env.ARAF_DEPLOYMENT_BLOCK);
  if (!rpcUrl) throw new Error("--deploy-timestamp verilmedi ve RPC_URL/BASE_RPC_URL yok.");
  if (!Number.isInteger(block) || block <= 0) throw new Error("--deploy-timestamp verilmedi ve ARAF_DEPLOYMENT_BLOCK geçersiz.");
  const { ethers } = require("ethers");
  const provider = new ethers.JsonRpcProvider(rpcUrl);
  try {
    // [TR] Salt-okunur: yalnız getBlock.
    const b = await provider.getBlock(block);
    if (!b || !Number.isFinite(Number(b.timestamp))) throw new Error(`Blok ${block} bulunamadı.`);
    return new Date(Number(b.timestamp) * 1000);
  } catch (err) {
    throw new Error(`RPC getBlock başarısız: ${redactRpcSecrets(err.message)}`);
  } finally {
    try { provider.destroy(); } catch { /* yok say */ }
  }
}

function classify(doc, def, threshold) {
  const raw = def.dateOf(doc);
  const t = raw instanceof Date ? raw : raw ? new Date(raw) : null;
  if (!t || Number.isNaN(t.getTime())) return "unclassifiable";
  return t.getTime() >= threshold.getTime() ? "active" : "legacy";
}

async function readIndexes(col) {
  try {
    return await col.indexes();
  } catch (err) {
    if (err?.codeName === "NamespaceNotFound" || err?.code === 26) return [];
    throw err;
  }
}

function sameKey(a, b) {
  const ka = Object.entries(a || {});
  const kb = Object.entries(b || {});
  return ka.length === kb.length && ka.every(([k, v], i) => kb[i][0] === k && Number(kb[i][1]) === Number(v));
}

function findCompound(indexes, def) {
  return indexes.find((ix) => sameKey(ix.key, def.compound.key) && ix.unique === true);
}

function findOldUnique(indexes, def) {
  return indexes.find((ix) => ix.name === def.oldIndex.name && sameKey(ix.key, def.oldIndex.key) && ix.unique === true);
}

async function idsOf(col, filter, projection) {
  return col.find(filter, { projection }).toArray();
}

function chunked(arr, size = CHUNK) {
  const out = [];
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
  return out;
}

async function scanCollection(db, def, threshold) {
  const col = db.collection(def.name);
  const docs = await idsOf(col, MISSING_SCOPE, def.projection);
  const buckets = { active: [], legacy: [], unclassifiable: [] };
  for (const d of docs) buckets[classify(d, def, threshold)].push(d);
  return buckets;
}

async function findConflicts(db, def, bucket, targetEscrow) {
  const ids = bucket.map((d) => d[def.idField]).filter((v) => v !== null && v !== undefined && v !== "");
  const col = db.collection(def.name);
  const found = [];
  for (const part of chunked(ids)) {
    const rows = await col.find({ escrow_address: targetEscrow, [def.idField]: { $in: part } }, { projection: { [def.idField]: 1 } }).toArray();
    for (const r of rows) found.push(String(r[def.idField]));
  }
  return found;
}

async function planIndexes(db, def) {
  const indexes = await readIndexes(db.collection(def.name));
  const compoundPresent = Boolean(findCompound(indexes, def));
  const oldPresent = Boolean(findOldUnique(indexes, def));
  return {
    collection: def.name,
    createCompound: !compoundPresent,
    dropOld: oldPresent,
  };
}

async function applyIndexes(db, def, log) {
  const col = db.collection(def.name);
  let indexes = await readIndexes(col);
  let created = false;
  let dropped = false;
  if (!findCompound(indexes, def)) {
    try {
      await col.createIndex(def.compound.key, def.compound.options);
    } catch (err) {
      if (err?.code === 85 || err?.code === 86) {
        throw new Error(`${def.name}: bileşik indeks mevcut bir indeksle çakışıyor (code ${err.code}); elle incele: ${err.message}`);
      }
      throw err;
    }
    created = true;
    log(`${def.name}: bileşik unique indeks oluşturuldu (${def.compound.options.name})`);
    indexes = await readIndexes(col);
  }
  // [TR] Eski tek alanlı unique YALNIZ bileşik unique varken düşürülür (sıra: yaz -> oluştur -> düşür).
  if (findCompound(indexes, def) && findOldUnique(indexes, def)) {
    await col.dropIndex(def.oldIndex.name);
    dropped = true;
    log(`${def.name}: eski tek alanlı unique düşürüldü (${def.oldIndex.name})`);
  }
  return { created, dropped };
}

async function runRollback({ db, args, log }) {
  if (!BATCH_RE.test(String(args.rollback))) throw new Error("--rollback değeri geçersiz (güvenli karakter seti).");
  const summary = { mode: "rollback", applied: false, batch: args.rollback, collections: {} };
  for (const def of COLLECTIONS) {
    const col = db.collection(def.name);
    const filter = { scope_migration_batch: args.rollback };
    const count = await col.countDocuments(filter);
    summary.collections[def.name] = { matched: count, unset: 0 };
    log(`${def.name}: batch=${args.rollback} eşleşen=${count}`);
  }
  if (!args.apply) {
    log("DRY-RUN: hiçbir şey yazılmadı. Geri almak için --apply ekleyin.");
    return summary;
  }
  for (const def of COLLECTIONS) {
    const res = await db.collection(def.name).updateMany(
      { scope_migration_batch: args.rollback },
      { $unset: { escrow_address: "", chain_id: "", scope_migration_batch: "" } }
    );
    summary.collections[def.name].unset = Number(res?.modifiedCount ?? res?.matchedCount ?? 0);
    log(`${def.name}: geri alındı=${summary.collections[def.name].unset}`);
  }
  summary.applied = true;
  return summary;
}

async function runScopeEscrowMirrors({ db, args, env = process.env, now = () => new Date(), resolveThreshold, log = () => {} } = {}) {
  if (args.rollback) return runRollback({ db, args, log });

  const scope = getActiveEscrowScope();
  if (!scope) throw new Error("ARAF_ESCROW_ADDRESS ve EXPECTED_CHAIN_ID gerekli.");
  if (args.legacyAddress && !ADDRESS_RE.test(args.legacyAddress)) throw new Error("--legacy-address geçersiz (0x + 40 hex).");
  const legacyAddr = args.legacyAddress ? args.legacyAddress.toLowerCase() : null;
  if (legacyAddr && legacyAddr === scope.escrow_address) throw new Error("--legacy-address aktif escrow ile aynı olamaz.");
  const legacyEscrow = `legacy:${legacyAddr || "unknown"}`;

  const batch = args.batch || now().toISOString();
  if (!BATCH_RE.test(batch)) throw new Error("--batch geçersiz (güvenli karakter seti, en çok 64).");

  if (args.apply) {
    if (!/^\d+$/.test(String(args.expectedActive ?? "")) || !/^\d+$/.test(String(args.expectedLegacy ?? ""))) {
      throw new RefusalError("--apply için --expected-active=N ve --expected-legacy=M zorunlu (negatif olmayan tamsayı).");
    }
  }

  const threshold = args.deployTimestamp
    ? parseDeployTimestamp(args.deployTimestamp)
    : await (resolveThreshold || fetchDeployTimestampFromRpc)(env);
  log(`eşik (deploy bloğu zaman damgası)=${threshold.toISOString()} aktif=${scope.escrow_address} chain=${scope.chain_id} legacy=${legacyEscrow}`);

  const scans = {};
  const summary = {
    mode: args.apply ? "apply" : "dry-run",
    applied: false,
    batch,
    threshold: threshold.toISOString(),
    active_escrow: scope.escrow_address,
    legacy_escrow: legacyEscrow,
    active: 0,
    legacy: 0,
    unclassifiable: 0,
    conflicts: 0,
    collections: {},
    indexes: [],
  };

  for (const def of COLLECTIONS) {
    const b = await scanCollection(db, def, threshold);
    scans[def.name] = b;
    summary.collections[def.name] = { active: b.active.length, legacy: b.legacy.length, unclassifiable: b.unclassifiable.length, written: 0 };
    summary.active += b.active.length;
    summary.legacy += b.legacy.length;
    summary.unclassifiable += b.unclassifiable.length;
    log(`${def.name}: aktif=${b.active.length} legacy=${b.legacy.length} sınıflandırılamayan=${b.unclassifiable.length}`);
  }

  const conflictList = [];
  for (const def of COLLECTIONS) {
    const b = scans[def.name];
    const a = await findConflicts(db, def, b.active, scope.escrow_address);
    const l = await findConflicts(db, def, b.legacy, legacyEscrow);
    for (const id of [...a, ...l]) conflictList.push(`${def.name}:${id}`);
  }
  summary.conflicts = conflictList.length;
  if (conflictList.length > 0) {
    log(`ÇAKIŞMA: ${conflictList.length} belge hedef escrow'da zaten var (ör. ${conflictList.slice(0, 5).join(", ")}); hiçbir şey yazılmadı.`);
  }

  for (const def of COLLECTIONS) summary.indexes.push(await planIndexes(db, def));
  for (const p of summary.indexes) {
    log(`${p.collection}: indeks planı createCompound=${p.createCompound} dropOld=${p.dropOld}`);
  }

  if (!args.apply) {
    log("DRY-RUN: hiçbir şey yazılmadı. Yazmak için --apply --expected-active=N --expected-legacy=M ekleyin.");
    return summary;
  }

  if (conflictList.length > 0) throw new RefusalError("Çakışma var; apply durdu (hiçbir şey yazılmadı).");
  if (summary.active !== Number(args.expectedActive) || summary.legacy !== Number(args.expectedLegacy)) {
    throw new RefusalError(
      `Beklenen sayılar tutmuyor: aktif ${summary.active} (beklenen ${args.expectedActive}), legacy ${summary.legacy} (beklenen ${args.expectedLegacy}); hiçbir şey yazılmadı.`
    );
  }

  for (const def of COLLECTIONS) {
    const col = db.collection(def.name);
    const b = scans[def.name];
    const plan = [
      [b.active, { escrow_address: scope.escrow_address, chain_id: scope.chain_id, scope_migration_batch: batch }],
      [b.legacy, { escrow_address: legacyEscrow, scope_migration_batch: batch }],
    ];
    for (const [bucket, setDoc] of plan) {
      for (const part of chunked(bucket.map((d) => d._id))) {
        // [TR] Yarış emniyeti: yalnız hâlâ kapsamsız olanlar güncellenir.
        const res = await col.updateMany({ _id: { $in: part }, ...MISSING_SCOPE }, { $set: setDoc });
        summary.collections[def.name].written += Number(res?.modifiedCount ?? res?.matchedCount ?? 0);
      }
    }
    log(`${def.name}: yazılan=${summary.collections[def.name].written}`);
    const r = await applyIndexes(db, def, log);
    summary.indexes = summary.indexes.map((p) => (p.collection === def.name ? { ...p, created: r.created, dropped: r.dropped } : p));
  }
  summary.applied = true;
  return summary;
}

async function main() {
  const mongoose = require("mongoose");
  const mongoUri = require("./_mongoUri").resolveMongoUri();
  const args = parseArgs();
  const log = (m) => console.log(`${PREFIX} ${redactRpcSecrets(maskMongoUri(m))}`);
  try {
    await mongoose.connect(mongoUri);
    const summary = await runScopeEscrowMirrors({ db: mongoose.connection.db, args, log });
    console.log(`${PREFIX} summary ${JSON.stringify(summary)}`);
  } finally {
    await mongoose.disconnect().catch(() => {});
  }
}

function maskError(err, env = process.env) {
  let text = String(err?.message || err);
  for (const secret of [env.MONGODB_URI, env.MONGO_URI, env.RPC_URL, env.BASE_RPC_URL]) {
    if (secret && secret.length > 8) text = text.split(secret).join("[REDACTED]");
  }
  return redactRpcSecrets(maskMongoUri(text));
}

if (require.main === module) {
  main().then(() => process.exit(0)).catch((err) => {
    console.error(`${PREFIX} HATA: ${maskError(err)}`);
    console.log(`${PREFIX} summary ${JSON.stringify({ applied: false, error: maskError(err) })}`);
    process.exit(err?.refusal ? 2 : 1);
  });
}

module.exports = { parseArgs, parseDeployTimestamp, classify, runScopeEscrowMirrors, maskError, COLLECTIONS, RefusalError };
