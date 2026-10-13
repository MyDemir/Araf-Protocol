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

const defs = require("../config/runtimeSettingDefs");

const { SETTING_DEFS, SETTING_KEYS, isKnownSetting, isInBounds } = defs;
const _envValue = defs.envValue;

function _err(code, message) {
  const e = new Error(message);
  e.code = code;
  return e;
}

let cache = null; // { at, ttl, result }
let lastKnown = null; // { overrides, version }

let generation = 0; // invalidateCache() sonrası, uçuştaki eski bir okumanın önbelleği ezmesini engeller

function invalidateCache() {
  cache = null;
  generation += 1;
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
  const { values, sources } = defs.resolveValues(overrides);
  const settings = {};
  for (const key of SETTING_KEYS) {
    const d = SETTING_DEFS[key];
    const ov = overrides[key];
    settings[key] = {
      key,
      group: d.group,
      unit: d.unit,
      min: d.min,
      max: d.max,
      default: d.default,
      envValue: _envValue(key),
      adminValue: ov ? ov.value : null,
      value: values[key],
      source: sources[key],
      description: d.description,
      warning: d.warning || null,
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
  const startGen = generation;
  try {
    const doc = await _readDoc();
    const overrides = _overridesFromDoc(doc);
    const version = doc ? Number(doc.version || 0) : 0;
    const result = { settings: _resolve(overrides), version, degraded: false, source: "db" };
    if (startGen === generation) {
      lastKnown = { overrides, version };
      cache = { at: now, ttl: CACHE_TTL_MS, result };
    }
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
    if (startGen === generation) cache = { at: now, ttl: NEGATIVE_CACHE_TTL_MS, result };
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

/** Tek etkin değer (asenkron; 15 sn önbellekli). Asla fırlatmaz: okunamazsa env/varsayılan. */
async function getEffectiveValue(key) {
  if (!isKnownSetting(key)) throw _err("SETTING_UNKNOWN", "Bilinmeyen ayar.");
  return (await getEffectiveValues())[key];
}

let _bgRefresh = null;
/**
 * SENKRON okuma: önbellekteki son değer (süresi dolmuş olsa da), yoksa son bilinen/env/varsayılan.
 * Önbellek süresi dolmuşsa arka planda TEK bir yenileme tetiklenir; istek başına DB sorgusu yapılmaz.
 */
function getCachedValue(key) {
  if (!isKnownSetting(key)) throw _err("SETTING_UNKNOWN", "Bilinmeyen ayar.");
  if (!cache || Date.now() - cache.at >= cache.ttl) {
    if (!_bgRefresh) {
      _bgRefresh = getEffectiveSettings().catch(() => {}).finally(() => { _bgRefresh = null; });
    }
  }
  if (cache) return cache.result.settings[key].value;
  return defs.resolveValues(lastKnown ? lastKnown.overrides : {}).values[key];
}

/**
 * Bir ayarı değiştirir ya da (value === null) admin override'ını siler ("env'e dön").
 * Hatalar: SETTING_UNKNOWN, SETTING_OUT_OF_RANGE, SETTING_CONSTRAINT, SETTING_CONFLICT, SETTING_AUDIT_FAILED.
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
  const currentOverrides = _overridesFromDoc(doc);
  if (value !== null || currentOverrides[key]) {
    // Kısıtlar etkin değerler (admin > env > varsayılan) üzerinden, önerilen değişiklik uygulanmış halde değerlendirilir.
    const proposed = { ...currentOverrides };
    if (value === null) delete proposed[key]; else proposed[key] = { value };
    const violation = defs.findConstraintViolation(defs.resolveValues(proposed).values, key);
    if (violation) throw _err("SETTING_CONSTRAINT", violation);
  }
  const prevEntry = currentOverrides[key] || null;
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
  // Aynı süreçteki senkron okuyucular (getCachedValue) değişikliği hemen görsün.
  const nextOverrides = { ...currentOverrides };
  if (value === null) delete nextOverrides[key];
  else nextOverrides[key] = { value, changed_at: now, changed_by: String(wallet || "").toLowerCase() };
  lastKnown = { overrides: nextOverrides, version: currentVersion + 1 };

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
    lastKnown = { overrides: currentOverrides, version: currentVersion + 2 };
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
  _bgRefresh = null;
}

module.exports = {
  SETTING_DEFS,
  SETTING_KEYS,
  isKnownSetting,
  isInBounds,
  getEffectiveSettings,
  getEffectiveValues,
  getEffectiveValue,
  getCachedValue,
  setSetting,
  listAudit,
  invalidateCache,
  _resetForTests,
  SETTING_CONSTRAINTS: defs.SETTING_CONSTRAINTS,
  SETTING_GROUPS: defs.SETTING_GROUPS,
};
