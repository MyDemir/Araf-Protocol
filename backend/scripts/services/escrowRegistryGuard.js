"use strict";

/**
 * [TR] Escrow kayıt bekçisi (Arşiv Faz 1). Mongo `escrow_registry` içindeki `_id:"active"` belgesini YALNIZ OKUR ve
 *      ARAF_ESCROW_ADDRESS / EXPECTED_CHAIN_ID ile karşılaştırır. Veri silmez/değiştirmez, tx göndermez.
 *      Modlar (ESCROW_REGISTRY_GUARD_MODE): off | warn | enforce (varsayılan: production'da enforce, diğerlerinde warn).
 *        - warn: yalnız log (tek seferlik + durum değişince) ve /ready bilgi alanı; hiçbir şeyi kapatmaz.
 *        - enforce: uyumsuzsa (veya kayıt okunamazsa, fail-closed) worker başlamaz/durur, CHAIN_BOUND işler atlanır,
 *          escrow'a bağlı route'lar 503 ESCROW_MISMATCH döner. app.js ve middleware/requireFullService.js bağlar.
 *      Bu bayrak serviceMode (degraded) ile KARIŞTIRILMAZ.
 * [EN] Escrow registry guard: read-only comparison of the active registry document with the env.
 */

const mongoose = require("mongoose");
const logger = require("../utils/logger");

const VALID_MODES = ["off", "warn", "enforce"];
const DEFAULT_MODE = "warn";
const ADDRESS_RE = /^0x[0-9a-f]{40}$/;
const READ_TIMEOUT_MS = 5_000;

/**
 * [TR] Boş/geçersiz değer -> varsayılan (+ geçersizse uyarı). Hata fırlatmaz.
 *      B4-12: NODE_ENV=production iken varsayılan enforce (fail-closed; identityNormalizationGuard ile simetrik);
 *      diğer ortamlarda warn. Açıkça yazılmış geçerli değer (off/warn/enforce) her zaman saygı görür.
 */
function resolveMode(raw = process.env.ESCROW_REGISTRY_GUARD_MODE, nodeEnv = process.env.NODE_ENV) {
  const fallback = nodeEnv === "production" ? "enforce" : DEFAULT_MODE;
  const configured = String(raw ?? "").trim().toLowerCase();
  if (!configured) return { mode: fallback, invalid: false };
  if (VALID_MODES.includes(configured)) return { mode: configured, invalid: false };
  return { mode: fallback, invalid: true, requested: configured.slice(0, 32) };
}

/**
 * [TR] Saf değerlendirme. doc: registry belgesi (ya da null). Dönüş: { ok, reason }.
 *      Öncelik: registry_missing > rotating > escrow_mismatch > chain_mismatch.
 */
function evaluateRegistry(doc, env = process.env) {
  if (!doc || typeof doc !== "object") return { ok: false, reason: "registry_missing" };
  if (doc.state === "ROTATING") return { ok: false, reason: "rotating" };

  const docAddress = String(doc.escrow_address || "").trim().toLowerCase();
  const envAddress = String(env.ARAF_ESCROW_ADDRESS || "").trim().toLowerCase();
  if (!ADDRESS_RE.test(docAddress) || !ADDRESS_RE.test(envAddress) || docAddress !== envAddress) {
    return { ok: false, reason: "escrow_mismatch" };
  }

  const envChain = Number(env.EXPECTED_CHAIN_ID);
  if (!Number.isInteger(envChain) || envChain <= 0 || Number(doc.chain_id) !== envChain) {
    return { ok: false, reason: "chain_mismatch" };
  }
  // [TR] Bilinmeyen/eksik state ACTIVE sayılmaz (fail-closed).
  if (doc.state !== "ACTIVE") return { ok: false, reason: "registry_missing" };
  return { ok: true, reason: null };
}

function _defaultReadActive() {
  // [TR] Bağlantı yoksa mongoose istekleri 10 sn tamponlar; bekçi hemen "okunamadı" saymalıdır.
  if (mongoose.connection.readyState !== 1) throw new Error("mongo_not_connected");
  const EscrowRegistry = require("../models/EscrowRegistry");
  return EscrowRegistry.findById("active").maxTimeMS(READ_TIMEOUT_MS).lean();
}

function createEscrowRegistryGuard({
  readActive = _defaultReadActive,
  getEnv = () => process.env,
  log = logger,
  onChange = null,
} = {}) {
  let mode = DEFAULT_MODE;
  let changeHandler = onChange;
  let status = { ok: true, reason: null, checked: false, checkedAt: null };
  let lastKey = null;
  let timer = null;
  let inFlight = null;

  function refreshMode() {
    const env = getEnv();
    const r = resolveMode(env.ESCROW_REGISTRY_GUARD_MODE, env.NODE_ENV);
    if (r.invalid && r.requested !== lastInvalid) {
      lastInvalid = r.requested;
      log.warn(`[EscrowRegistryGuard] ESCROW_REGISTRY_GUARD_MODE geçersiz ("${r.requested}"); ${r.mode} kullanılıyor.`);
    }
    mode = r.mode;
    return mode;
  }
  let lastInvalid = null;

  function isBlocking() {
    return mode === "enforce" && status.checked && !status.ok;
  }

  function getBlockReason() {
    return isBlocking() ? status.reason : null;
  }

  function getStatus() {
    return {
      mode,
      checked: status.checked,
      ok: status.ok,
      reason: status.reason,
      blocking: isBlocking(),
      checkedAt: status.checkedAt,
    };
  }

  async function _doCheck() {
    const wasBlocking = isBlocking();
    let next;
    try {
      const doc = await Promise.race([
        Promise.resolve().then(() => readActive()),
        new Promise((_, reject) => {
          const t = setTimeout(() => reject(new Error("registry_read_timeout")), READ_TIMEOUT_MS + 1_000);
          if (typeof t.unref === "function") t.unref();
        }),
      ]);
      next = evaluateRegistry(doc, getEnv());
    } catch (err) {
      // [TR] Okunamadı: enforce'ta fail-closed (uyumsuz say), warn'da yalnız log.
      next = { ok: false, reason: "registry_unreadable" };
      log.warn(`[EscrowRegistryGuard] Kayıt okunamadı: ${String(err?.message || err).slice(0, 120)}`);
    }
    status = { ok: next.ok, reason: next.reason, checked: true, checkedAt: new Date().toISOString() };

    const key = `${mode}:${next.ok}:${next.reason}`;
    if (key !== lastKey) {
      lastKey = key;
      if (next.ok) {
        log.info(`[EscrowRegistryGuard] Kayıt uyumlu (mode=${mode}).`);
      } else if (mode === "enforce") {
        log.error(`[EscrowRegistryGuard] UYUMSUZ (reason=${next.reason}); enforce: worker/işler/escrow route'ları kapalı.`);
      } else {
        log.warn(`[EscrowRegistryGuard] UYUMSUZ (reason=${next.reason}); warn modu: yalnız bilgi, hiçbir şey kapatılmadı.`);
      }
    }

    const nowBlocking = isBlocking();
    if (typeof changeHandler === "function" && wasBlocking !== nowBlocking) {
      try {
        await changeHandler({ blocking: nowBlocking, reason: status.reason });
      } catch (err) {
        log.error(`[EscrowRegistryGuard] onChange hatası: ${String(err?.message || err).slice(0, 120)}`);
      }
    }
    return getStatus();
  }

  /** [TR] Tek uçuşlu kontrol (üst üste binmez). Asla fırlatmaz. off modunda hiçbir okuma yapmaz. */
  function check() {
    const before = mode;
    refreshMode();
    if (mode === "off") {
      // [TR] off'a geçişte eski engel kalıntısı olmasın.
      const wasBlocking = status.checked && !status.ok && before === "enforce";
      status = { ok: true, reason: null, checked: false, checkedAt: null };
      lastKey = null;
      if (wasBlocking && typeof changeHandler === "function") {
        return Promise.resolve(changeHandler({ blocking: false, reason: null })).catch(() => {}).then(getStatus);
      }
      return Promise.resolve(getStatus());
    }
    if (inFlight) return inFlight;
    inFlight = _doCheck().finally(() => { inFlight = null; });
    return inFlight;
  }

  function start(intervalMs = 60_000) {
    if (timer) return false;
    timer = setInterval(() => { check(); }, intervalMs);
    if (typeof timer.unref === "function") timer.unref();
    return true;
  }

  function stop() {
    if (timer) clearInterval(timer);
    timer = null;
  }

  function setOnChange(fn) {
    changeHandler = fn;
  }

  function _resetForTests() {
    stop();
    mode = DEFAULT_MODE;
    changeHandler = onChange;
    status = { ok: true, reason: null, checked: false, checkedAt: null };
    lastKey = null;
    lastInvalid = null;
    inFlight = null;
  }

  return {
    check, start, stop, setOnChange, isBlocking, getBlockReason, getStatus,
    getMode: () => mode, refreshMode, _resetForTests,
  };
}

const defaultGuard = createEscrowRegistryGuard();

module.exports = {
  VALID_MODES,
  DEFAULT_MODE,
  resolveMode,
  evaluateRegistry,
  createEscrowRegistryGuard,
  ...defaultGuard,
};
