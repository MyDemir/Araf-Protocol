"use strict";

/**
 * Runtime Settings Service — admin panelinden değiştirilebilen performans/operasyon ayarları.
 *
 * Öncelik: admin değeri (DB) > env > koddaki varsayılan. Sınırlar HER kaynak için uygulanır (env dahil).
 * Okuma: süreç-içi 15 sn önbellek. DB okunamazsa son bilinen admin değerleri, o da yoksa env/varsayılan
 * (fail-open: bunlar performans ayarıdır, güvenlik kapısı değildir).
 *
 * KAPSAM DIŞI (bilerek; yalnız env): BASE_RPC_URL, BASE_RPC_URL_FALLBACKS ve tüm RPC URL'leri — ele geçirilmiş
 * bir admin oturumu doğru zincir ID'si bildirip sahte log döndüren bir RPC verebilir ve worker o log'lara güvenir;
 * ayrıca gizli anahtarlar, kontrat adresleri, EXPECTED_CHAIN_ID, finality, CORS, ADMIN_WALLETS, KMS, SEC-01.
 */

const mongoose = require("mongoose");
const RuntimeSetting = require("../models/RuntimeSetting");
const RuntimeSettingAudit = require("../models/RuntimeSettingAudit");
const logger = require("../utils/logger");

const SETTING_KEY = "runtime_settings";
const CACHE_TTL_MS = Math.min(Number(process.env.RUNTIME_SETTINGS_CACHE_TTL_MS ?? 15_000), 30_000);
const NEGATIVE_CACHE_TTL_MS = 5_000;
const DB_READ_TIMEOUT_MS = 2_000;

const SETTING_DEFS = {
  LIVE_POLL_INTERVAL_MS: {
    unit: "ms", min: 5_000, max: 300_000, default: 15_000,
    description: {
      TR: "Canlı izleme turu aralığı (her tur 1 eth_blockNumber + eth_getLogs).",
      EN: "Live polling interval (each tick = 1 eth_blockNumber + eth_getLogs).",
    },
  },
  WORKER_BLOCK_BATCH_SIZE: {
    unit: "blocks", min: 1, max: 2_000, default: 1_000,
    description: {
      TR: "Tek eth_getLogs çağrısındaki blok sayısı (Alchemy ücretsiz planda 10).",
      EN: "Blocks per eth_getLogs call (10 on the Alchemy free plan).",
    },
  },
  WORKER_REPLAY_BATCH_DELAY_MS: {
    unit: "ms", min: 0, max: 10_000, default: 250,
    description: {
      TR: "Replay/canlı parçaları arası bekleme (saniyelik CU sınırı için).",
      EN: "Delay between replay/live chunks (per-second CU limit).",
    },
  },
};

const SETTING_KEYS = Object.keys(SETTING_DEFS);

function isKnownSetting(key) {
  return Object.prototype.hasOwnProperty.call(SETTING_DEFS, key);
}

function isInBounds(key, n) {
  const d = SETTING_DEFS[key];
  return Number.isInteger(n) && n >= d.min && n <= d.max;
}

function _clamp(key, n) {
  const d = SETTING_DEFS[key];
  return Math.min(d.max, Math.max(d.min, n));
}

/** Env değeri: geçerli tam sayıysa sınıra kırpılır; geçersiz/boşsa null. */
function _envValue(key) {
  const raw = process.env[key];
  if (raw === undefined || raw === null || String(raw).trim() === "") return null;
  const n = Number(raw);
  if (!Number.isInteger(n)) return null;
  return _clamp(key, n);
}

function _err(code, message) {
  const e = new Error(message);
  e.code = code;
  return e;
}

let cache = null; // { at, ttl, result }
let lastKnown = null; // { overrides, version }

function invalidateCache() {
  cache = null;
}

function _overridesFromDoc(doc) {
  const out = {};
  const values = doc?.values;
  if (!values) return out;
  const entries = typeof values.entries === "function" ? [...values.entries()] : Object.entries(values);
  for (const [k, v] of entries) {
    if (!isKnownSetting(k) || !v || !isInBounds(k, Number(v.value))) continue; // sınır dışı kayıt yok sayılır
    out[k] = { value: Number(v.value), changed_at: v.changed_at || null, changed_by: v.changed_by || null };
  }
  return out;
}

function _resolve(overrides) {
  const settings = {};
  for (const key of SETTING_KEYS) {
    const d = SETTING_DEFS[key];
    const ov = overrides[key];
    const env = _envValue(key);
    let value = d.default;
    let source = "default";
    if (env !== null) { value = env; source = "env"; }
    if (ov) { value = ov.value; source = "admin"; }
    settings[key] = {
      key,
      unit: d.unit,
      min: d.min,
      max: d.max,
      default: d.default,
      envValue: env,
      adminValue: ov ? ov.value : null,
      value,
      source,
      description: d.description,
      changedAt: ov ? ov.changed_at : null,
      changedBy: ov ? ov.changed_by : null,
    };
  }
  return settings;
}

async function _readDoc() {
  // Bağlantı yokken (açılış, testler) Mongoose isteği tamponlar ve bekletir: hiç sorgulama.
  if (mongoose.connection.readyState !== 1) throw new Error("db_not_connected");
  let timer;
  try {
    return await Promise.race([
      RuntimeSetting.findOne({ key: SETTING_KEY }).lean(),
      new Promise((_, reject) => { timer = setTimeout(() => reject(new Error("db_read_timeout")), DB_READ_TIMEOUT_MS); }),
    ]);
  } finally {
    clearTimeout(timer);
  }
}

/**
 * @returns {Promise<{settings: Record<string,object>, version:number, degraded:boolean, source:string}>}
 */
async function getEffectiveSettings() {
  const now = Date.now();
  if (cache && now - cache.at < cache.ttl) return cache.result;
  try {
    const doc = await _readDoc();
    const overrides = _overridesFromDoc(doc);
    const version = doc ? Number(doc.version || 0) : 0;
    lastKnown = { overrides, version };
    const result = { settings: _resolve(overrides), version, degraded: false, source: "db" };
    cache = { at: now, ttl: CACHE_TTL_MS, result };
    return result;
  } catch (err) {
    if (err.message !== "db_not_connected") {
      logger.warn(`[RuntimeSettings] ayar okunamadı (${lastKnown ? "son bilinen" : "env/varsayılan"} kullanılıyor): ${err.message}`);
    }
    const overrides = lastKnown ? lastKnown.overrides : {};
    const result = {
      settings: _resolve(overrides),
      version: lastKnown ? lastKnown.version : 0,
      degraded: true,
      source: lastKnown ? "last_known" : "default",
    };
    cache = { at: now, ttl: NEGATIVE_CACHE_TTL_MS, result };
    return result;
  }
}

/** Yalnız etkin sayısal değerler: { LIVE_POLL_INTERVAL_MS, ... }. Asla fırlatmaz. */
async function getEffectiveValues() {
  try {
    const { settings } = await getEffectiveSettings();
    const out = {};
    for (const k of SETTING_KEYS) out[k] = settings[k].value;
    return out;
  } catch {
    const out = {};
    for (const k of SETTING_KEYS) out[k] = _envValue(k) ?? SETTING_DEFS[k].default;
    return out;
  }
}

/**
 * Bir ayarı değiştirir ya da (value === null) admin override'ını siler ("env'e dön").
 * Hatalar: SETTING_UNKNOWN, SETTING_OUT_OF_RANGE, SETTING_CONFLICT, SETTING_AUDIT_FAILED.
 */
async function setSetting(rawKey, value, { wallet, reason = "", ipHash = null, expectedVersion = undefined } = {}) {
  const key = String(rawKey || "");
  if (!isKnownSetting(key)) throw _err("SETTING_UNKNOWN", "Bilinmeyen ayar.");
  if (value !== null && !isInBounds(key, value)) throw _err("SETTING_OUT_OF_RANGE", "Değer sınırlar dışında.");
  // Bağlantı yoksa Mongoose işlemi tamponda bekletir: hemen 503.
  if (mongoose.connection.readyState !== 1) throw _err("DB_UNAVAILABLE", "Veritabanı şu an kullanılamıyor.");

  const doc = await RuntimeSetting.findOne({ key: SETTING_KEY }).lean();
  const currentVersion = doc ? Number(doc.version || 0) : 0;
  if (expectedVersion !== undefined && expectedVersion !== currentVersion) {
    throw _err("SETTING_CONFLICT", "Ayarlar başka bir yönetici tarafından değiştirildi; yenileyin.");
  }
  const prevEntry = _overridesFromDoc(doc)[key] || null;
  const previous = prevEntry ? prevEntry.value : null;
  if (previous === value) return { key, previousValue: previous, value, changed: false, version: currentVersion };

  const now = new Date();
  const update = value === null
    ? { $unset: { [`values.${key}`]: "" }, $set: { updated_at: now }, $inc: { version: 1 } }
    : {
      $set: { [`values.${key}`]: { value, changed_at: now, changed_by: String(wallet || "").toLowerCase() }, updated_at: now },
      $inc: { version: 1 },
    };
  try {
    // Belge yokken de version=0 koşulu: eşzamanlı oluşturma upsert'te duplicate key (11000) → conflict.
    const res = await RuntimeSetting.updateOne({ key: SETTING_KEY, version: currentVersion }, update, { upsert: !doc });
    if (doc && res && res.matchedCount === 0) throw _err("SETTING_CONFLICT", "Eşzamanlı değişiklik; yenileyin.");
  } catch (err) {
    if (err.code === "SETTING_CONFLICT") throw err;
    if (err.code === 11000) throw _err("SETTING_CONFLICT", "Eşzamanlı değişiklik; yenileyin.");
    throw err;
  }
  invalidateCache();

  try {
    await RuntimeSettingAudit.create({
      setting: key,
      previous_value: previous,
      new_value: value,
      admin_wallet: wallet,
      reason: String(reason || "").slice(0, 300),
      ip_hash: ipHash,
      created_at: now,
    });
  } catch (auditErr) {
    logger.error(`[RuntimeSettings] audit yazılamadı, değişiklik geri alınıyor: ${auditErr.message}`);
    let rollbackRes = null;
    try {
      const rollback = prevEntry
        ? { $set: { [`values.${key}`]: prevEntry }, $inc: { version: 1 } }
        : { $unset: { [`values.${key}`]: "" }, $inc: { version: 1 } };
      // Yalnız kendi yazdığımız version'a koşullu: araya giren başka admin değişikliği ezilmez.
      rollbackRes = await RuntimeSetting.updateOne({ key: SETTING_KEY, version: currentVersion + 1 }, rollback);
    } catch (rollbackErr) {
      logger.error(`[RuntimeSettings] geri alma başarısız: ${rollbackErr.message}`);
    }
    invalidateCache();
    if (rollbackRes && rollbackRes.matchedCount === 0) {
      logger.error(`[RuntimeSettings] RUNTIME_SETTING_ROLLBACK_CONFLICT: audit yazılamadı ve araya başka değişiklik girdi (setting=${key}).`);
      throw _err("SETTING_CONFLICT", "Eşzamanlı değişiklik; denetim kaydı yazılamadı, yenileyin.");
    }
    throw _err("SETTING_AUDIT_FAILED", "Denetim kaydı yazılamadı; değişiklik uygulanmadı.");
  }

  return { key, previousValue: previous, value, changed: true, changedAt: now, version: currentVersion + 1 };
}

async function listAudit({ page = 1, limit = 20 } = {}) {
  const [items, total] = await Promise.all([
    RuntimeSettingAudit.find({}).sort({ created_at: -1, _id: -1 }).skip((page - 1) * limit).limit(limit).lean(),
    RuntimeSettingAudit.countDocuments({}),
  ]);
  return {
    items: items.map((a) => ({
      id: String(a._id),
      setting: a.setting,
      previousValue: a.previous_value ?? null,
      newValue: a.new_value ?? null,
      adminWallet: a.admin_wallet,
      reason: a.reason || "",
      ipHash: a.ip_hash || null,
      createdAt: a.created_at,
    })),
    total,
    page,
    limit,
  };
}

/** Test yardımcısı. */
function _resetForTests() {
  cache = null;
  lastKnown = null;
}

module.exports = {
  SETTING_DEFS,
  SETTING_KEYS,
  isKnownSetting,
  isInBounds,
  getEffectiveSettings,
  getEffectiveValues,
  setSetting,
  listAudit,
  invalidateCache,
  _resetForTests,
};
