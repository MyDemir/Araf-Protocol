"use strict";

/**
 * Payment Rails Service — ödeme yöntemi (rail) etkinlik durumu.
 *
 * - Kalıcı kaynak: Mongo tek belge (PaymentRailSetting, key="payment_rails"). Kayıt yoksa kodda tanımlı
 *   tüm rail'ler etkin (mevcut davranış).
 * - Okuma kısa süreli süreç-içi önbellekten (varsayılan 15 sn, en çok 30 sn). Yazma bu süreçte önbelleği
 *   hemen geçersiz kılar; diğer süreçler en geç TTL sonunda görür.
 * - Okuma hatasında son bilinen değer, o da yoksa "hepsi etkin" döner (fail-open: yalnız yeni iş kapısıdır,
 *   mevcut işleri bozmaz).
 * - Bu kapı yalnız UI/API düzeyindedir; kontrat rail bilmez.
 */

const PaymentRailSetting = require("../models/PaymentRailSetting");
const PaymentRailAudit = require("../models/PaymentRailAudit");
const { PAYMENT_RAIL_RISK_CONFIG, SEPA_COUNTRY_ALLOWLIST } = require("../config/paymentRailRiskConfig");
const logger = require("../utils/logger");

const SETTING_KEY = "payment_rails";
const CACHE_TTL_MS = Math.min(Number(process.env.PAYMENT_RAILS_CACHE_TTL_MS ?? 15_000), 30_000);

const RAIL_NAMES = {
  TR_IBAN: { TR: "Türkiye Banka Havalesi (IBAN)", EN: "Turkey Bank Transfer (IBAN)" },
  US_ACH: { TR: "ABD ACH", EN: "US ACH" },
  SEPA_IBAN: { TR: "SEPA (IBAN)", EN: "SEPA (IBAN)" },
};

/** Kodda tanımlı rail kataloğu: [{ code, name, countries, riskLevel }] */
function getRailCatalog() {
  const out = [];
  for (const [bucket, rails] of Object.entries(PAYMENT_RAIL_RISK_CONFIG)) {
    for (const [code, entry] of Object.entries(rails)) {
      out.push({
        code,
        name: RAIL_NAMES[code] || { TR: code, EN: code },
        countries: code === "SEPA_IBAN" && bucket === "EU" ? [...SEPA_COUNTRY_ALLOWLIST] : [bucket],
        riskLevel: entry.riskLevel,
      });
    }
  }
  return out;
}

function getRailCodes() {
  return getRailCatalog().map((r) => r.code);
}

function isKnownRail(code) {
  return getRailCodes().includes(String(code || "").toUpperCase());
}

const NEGATIVE_CACHE_TTL_MS = 5_000;
let cache = null; // { at, ttl, result: { states, degraded, source } }
let lastKnown = null;

function _defaultStates() {
  const states = {};
  for (const code of getRailCodes()) states[code] = { enabled: true, changed_at: null, changed_by: null };
  return states;
}

function _fromDoc(doc) {
  const states = _defaultStates();
  const rails = doc?.rails;
  if (rails) {
    const entries = typeof rails.entries === "function" ? [...rails.entries()] : Object.entries(rails);
    for (const [code, st] of entries) {
      if (!states[code] || !st) continue;
      states[code] = {
        enabled: st.enabled !== false,
        changed_at: st.changed_at || null,
        changed_by: st.changed_by || null,
      };
    }
  }
  return states;
}

function invalidateRailCache() {
  cache = null;
}

function _err(code, message) {
  const e = new Error(message);
  e.code = code;
  return e;
}

/**
 * Durum + kaynak bilgisi. source: "db" | "last_known" (DB hatası, son bilinen değer) | "default" (DB hatası,
 * hiç bilinen değer yok: soğuk açılış). degraded=true iken DB'ye ulaşılamamıştır.
 * DB hatası 5 sn negatif önbelleğe alınır: hata sürerken her istek DB'ye gitmez.
 * @returns {Promise<{states: Record<string,{enabled:boolean,changed_at:Date|null,changed_by:string|null}>, degraded: boolean, source: string}>}
 */
async function getRailStatesDetailed() {
  const now = Date.now();
  if (cache && now - cache.at < cache.ttl) return cache.result;
  try {
    const doc = await PaymentRailSetting.findOne({ key: SETTING_KEY }).lean();
    const states = _fromDoc(doc);
    const result = { states, degraded: false, source: "db" };
    cache = { at: now, ttl: CACHE_TTL_MS, result };
    lastKnown = states;
    return result;
  } catch (err) {
    logger.warn(`[PaymentRails] ayar okunamadı (${lastKnown ? "son bilinen" : "varsayılan"} kullanılıyor): ${err.message}`);
    const result = lastKnown
      ? { states: lastKnown, degraded: true, source: "last_known" }
      : { states: _defaultStates(), degraded: true, source: "default" };
    cache = { at: now, ttl: NEGATIVE_CACHE_TTL_MS, result };
    return result;
  }
}

/** Okuma yolları için: hata durumunda son bilinen / hepsi etkin (açık). */
async function getRailStates() {
  return (await getRailStatesDetailed()).states;
}

/**
 * Yazma kapıları için (fail-closed): hiç bilinen durum yokken DB okunamadıysa RAIL_STATE_UNAVAILABLE fırlatır.
 * Son bilinen değer varsa onunla karar verilir.
 */
async function isRailEnabledStrict(code) {
  const { states, degraded, source } = await getRailStatesDetailed();
  if (degraded && source === "default") {
    throw _err("RAIL_STATE_UNAVAILABLE", "Ödeme yöntemi durumu şu an doğrulanamıyor.");
  }
  const st = states[String(code || "").toUpperCase()];
  return st ? st.enabled : true;
}

async function isRailEnabled(code) {
  const states = await getRailStates();
  const st = states[String(code || "").toUpperCase()];
  // Katalogda olmayan rail zaten ayrı doğrulamada reddedilir; burada "bilinmiyor" = kapalı sayılmaz.
  return st ? st.enabled : true;
}

async function getEnabledRailCodes() {
  const states = await getRailStates();
  return Object.keys(states).filter((c) => states[c].enabled);
}

/** Admin listesi için katalog + durum. */
async function listRails() {
  const states = await getRailStates();
  return getRailCatalog().map((r) => ({
    ...r,
    enabled: states[r.code].enabled,
    changedAt: states[r.code].changed_at,
    changedBy: states[r.code].changed_by,
  }));
}

/**
 * Config yanıtına rail etkinliğini uygular (girdiyi değiştirmez).
 */
async function applyRailStatesToRiskConfig(riskConfig) {
  const states = await getRailStates();
  const out = {};
  for (const [bucket, rails] of Object.entries(riskConfig || {})) {
    out[bucket] = {};
    for (const [code, entry] of Object.entries(rails || {})) {
      out[bucket][code] = { ...entry, enabled: entry.enabled !== false && (states[code] ? states[code].enabled : true) };
    }
  }
  return out;
}

/**
 * Rail etkinliğini değiştirir (optimistic concurrency + son-rail kuralı) ve audit yazar.
 * Hatalar: RAIL_UNKNOWN, LAST_ENABLED_RAIL, RAIL_CONFLICT.
 */
async function setRailEnabled(rawCode, enabled, { wallet, reason = "", ipHash = null } = {}) {
  const code = String(rawCode || "").toUpperCase();
  if (!isKnownRail(code)) throw _err("RAIL_UNKNOWN", "Bilinmeyen ödeme yöntemi.");

  const doc = await PaymentRailSetting.findOne({ key: SETTING_KEY }).lean();
  const states = _fromDoc(doc);
  const previous = states[code].enabled;

  if (previous === enabled) {
    return { rail: code, previousEnabled: previous, enabled, changed: false };
  }
  if (!enabled) {
    const stillEnabled = Object.keys(states).filter((c) => c !== code && states[c].enabled);
    if (stillEnabled.length === 0) {
      throw _err("LAST_ENABLED_RAIL", "En az bir ödeme yöntemi açık kalmalıdır.");
    }
  }

  const now = new Date();
  const currentVersion = doc ? Number(doc.version || 0) : 0;
  const set = {
    [`rails.${code}`]: { enabled, changed_at: now, changed_by: String(wallet || "").toLowerCase() },
    updated_at: now,
  };
  try {
    // Belge yokken de version=0 koşulu: eşzamanlı oluşturma upsert'te duplicate key (11000) → conflict.
    const res = await PaymentRailSetting.updateOne(
      { key: SETTING_KEY, version: currentVersion },
      { $set: set, $inc: { version: 1 } },
      { upsert: !doc }
    );
    if (doc && res && res.matchedCount === 0) throw _err("RAIL_CONFLICT", "Eşzamanlı değişiklik; yeniden deneyin.");
  } catch (err) {
    if (err.code === "RAIL_CONFLICT") throw err;
    if (err.code === 11000) throw _err("RAIL_CONFLICT", "Eşzamanlı değişiklik; yeniden deneyin.");
    throw err;
  }
  invalidateRailCache();

  try {
    await PaymentRailAudit.create({
      rail: code,
      previous_enabled: previous,
      new_enabled: enabled,
      admin_wallet: wallet,
      reason: String(reason || "").slice(0, 300),
      ip_hash: ipHash,
      created_at: now,
    });
  } catch (auditErr) {
    // Audit yazılamadıysa değişiklik geri alınır: denetimsiz değişiklik bırakılmaz.
    logger.error(`[PaymentRails] audit yazılamadı, değişiklik geri alınıyor: ${auditErr.message}`);
    // Geri alma yalnız kendi yazdığımız version'a koşulludur: arada başka admin yazdıysa onun değişikliği ezilmez.
    let rollbackRes = null;
    try {
      rollbackRes = await PaymentRailSetting.updateOne(
        { key: SETTING_KEY, version: currentVersion + 1 },
        { $set: { [`rails.${code}`]: states[code] }, $inc: { version: 1 } }
      );
    } catch (rollbackErr) {
      logger.error(`[PaymentRails] geri alma başarısız: ${rollbackErr.message}`);
    }
    invalidateRailCache();
    if (rollbackRes && rollbackRes.matchedCount === 0) {
      logger.error(`[PaymentRails] PAYMENT_RAIL_ROLLBACK_CONFLICT: audit yazılamadı ve araya başka değişiklik girdi (rail=${code}); geri alma uygulanmadı.`);
      throw _err("RAIL_CONFLICT", "Eşzamanlı değişiklik; denetim kaydı yazılamadı, yeniden deneyin.");
    }
    throw _err("RAIL_AUDIT_FAILED", "Denetim kaydı yazılamadı; değişiklik uygulanmadı.");
  }

  return { rail: code, previousEnabled: previous, enabled, changed: true, changedAt: now };
}

async function listAudit({ page = 1, limit = 20 } = {}) {
  const [items, total] = await Promise.all([
    PaymentRailAudit.find({})
      .sort({ created_at: -1, _id: -1 })
      .skip((page - 1) * limit)
      .limit(limit)
      .lean(),
    PaymentRailAudit.countDocuments({}),
  ]);
  return {
    items: items.map((a) => ({
      id: String(a._id),
      rail: a.rail,
      previousEnabled: a.previous_enabled,
      newEnabled: a.new_enabled,
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

module.exports = {
  getRailCatalog,
  getRailCodes,
  isKnownRail,
  getRailStates,
  getRailStatesDetailed,
  isRailEnabledStrict,
  isRailEnabled,
  getEnabledRailCodes,
  listRails,
  applyRailStatesToRiskConfig,
  setRailEnabled,
  listAudit,
  invalidateRailCache,
};
