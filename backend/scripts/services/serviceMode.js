"use strict";

/**
 * [TR] Kısıtlı (degraded) servis modu: durum, hata sınıflandırması ve tek döngülü toparlanma.
 *      - YALNIZ RPC'ye bağlı açılış adımları (SEC-01 zincir doğrulaması, protocol config, worker) için geçerlidir.
 *      - Kesin hata (ChainGuard/yanlış zincir/yapılandırma) ASLA kısıtlı moda düşmez; süreç bugünkü gibi çıkar.
 *      - Bilinmeyen hata = kesin hata (fail-closed). Atlatma bayrağı yoktur.
 * [EN] Degraded service mode: state, error classification and a single-flight recovery loop. Only transient
 *      RPC errors (429/network/timeout) degrade; anything else stays fatal.
 */

const logger = require("../utils/logger");
const { redactRpcSecrets } = require("../utils/logRedaction");
const {
  isRateLimitError,
  isMonthlyCapacityError,
} = require("./rpcProvider");

const SEC01_PREFIX = "SEC-01 BLOCKER";
// encryption._assertTestnetRpcChainOrThrow'un "hiçbir URL doğrulanamadı" mesajının sabit öneki.
const SEC01_UNVERIFIED_MARKER = "doğrulanamadı: ";

const state = {
  degraded: false,
  reasons: new Set(),
  configStale: false,
  since: null,
};

function isDegraded() {
  return state.degraded;
}

function getDegradedReasons() {
  return Array.from(state.reasons);
}

function isConfigStale() {
  return state.configStale;
}

function setConfigStale(value) {
  state.configStale = Boolean(value);
}

function enterDegraded(reason) {
  const wasDegraded = state.degraded;
  state.degraded = true;
  state.reasons.add(reason);
  if (!wasDegraded) state.since = new Date().toISOString();
  return !wasDegraded;
}

function exitDegraded() {
  state.degraded = false;
  state.reasons.clear();
  state.configStale = false;
  state.since = null;
}

function _resetForTests() {
  exitDegraded();
}

// [TR] Hata zincirini (err, cause, error, info.error) düz listeye açar (döngüye karşı sınırlı).
function _chain(err) {
  const out = [];
  let cur = err;
  for (let i = 0; cur && typeof cur === "object" && i < 5; i += 1) {
    out.push(cur);
    cur = cur.cause || cur.error || cur.info?.error || null;
  }
  return out;
}

const NON_RPC_NAME_RE = /^(Mongo|Mongoose)|Redis|^(ClientClosed|SocketClosed|SocketTimeout|ConnectionTimeout|Disconnects|Reconnect)/i;
const NON_RPC_TEXT_RE = /\b(mongo(db)?|mongoose|redis)\b/i;

function _httpStatusOf(e) {
  const raw = e?.info?.responseStatus ?? e?.info?.response?.statusCode ?? e?.status ?? e?.statusCode;
  let n = Number.parseInt(String(raw ?? ""), 10);
  if (!Number.isInteger(n)) {
    const m = /server response (\d{3})/i.exec(String(e?.message || ""));
    n = m ? Number(m[1]) : NaN;
  }
  return Number.isInteger(n) ? n : null;
}

const QUOTA_TEXT_RE = /capacity|limit exceeded|\brate\b/i;

/** [TR] Zincirde Mongo/Redis, 4xx (429 hariç) veya ENOTFOUND varsa KESİN hata (RPC kaynaklı değil/yanlış yapılandırma). */
function _isDefinitiveNonTransient(err) {
  for (const e of _chain(err)) {
    if (NON_RPC_NAME_RE.test(String(e.name || ""))) return true;
    if (NON_RPC_TEXT_RE.test(String(e.message || ""))) return true;
    if (e.code === "ENOTFOUND" || /\bENOTFOUND\b/.test(String(e.message || ""))) return true;
    const st = _httpStatusOf(e);
    if (st !== null && st >= 400 && st < 500 && st !== 429) {
      // [TR] Bazı sağlayıcılar kota/oran aşımı için 403 döner: 403 + kota metni geçicidir. 401 ve diğer 403'ler kesin.
      if (st === 403 && QUOTA_TEXT_RE.test(String(e.message || ""))) continue;
      return true;
    }
  }
  return false;
}

const TRANSIENT_CODES = new Set(["ECONNRESET", "ECONNREFUSED", "ETIMEDOUT", "EAI_AGAIN", "TIMEOUT", "NETWORK_ERROR", "EPIPE"]);
const TRANSIENT_TEXT_RE = /ECONNRESET|ECONNREFUSED|ETIMEDOUT|EAI_AGAIN|socket hang up|timed? ?out|\b50[234]\b/i;

/** [TR] Geçici RPC hatası: 429, aylık kapasite, ağ kopması/timeout, 502/503/504. */
function _isTransientRpc(err) {
  if (isRateLimitError(err) || isMonthlyCapacityError(err)) return true;
  for (const e of _chain(err)) {
    if (TRANSIENT_CODES.has(e.code)) return true;
    const st = _httpStatusOf(e);
    if (st === 429 || st === 502 || st === 503 || st === 504) return true;
    if (st === 403 && QUOTA_TEXT_RE.test(String(e.message || ""))) return true;
    if (TRANSIENT_TEXT_RE.test(String(e.message || ""))) return true;
  }
  return false;
}

/**
 * [TR] "transient" yalnız geçici RPC hatasıdır (429, kapasite, ağ/timeout, 502/503/504). Mongo/Redis hataları,
 *      4xx (401/403...), ENOTFOUND, ChainGuard, yanlış zincir ve bilinmeyen her şey "fatal" (fail-closed).
 * @returns {"transient"|"fatal"}
 */
function classifyStartupError(err) {
  if (!err) return "fatal";
  const message = String(err.message || err);

  if (err.code === "CONFIG_STALE_RETRY") return "transient";
  if (/\[ChainGuard\]/.test(message)) return "fatal";
  // [TR] Kesin yanlış zincir: yalnız hata nesnesi özelliği (encryption.js). Mesaj metni (RPC kaynaklı olabilir) bakılmaz.
  if (err.definitiveWrongChain === true || err.code === "SEC01_WRONG_CHAIN") return "fatal";

  if (message.includes(SEC01_PREFIX)) {
    // SEC-01 hataları yalnız "hiçbir RPC doğrulanamadı + son neden geçici" biçiminde geçicidir.
    const idx = message.indexOf(SEC01_UNVERIFIED_MARKER);
    if (idx === -1) return "fatal";
    const reason = message.slice(idx + SEC01_UNVERIFIED_MARKER.length);
    if (!reason.trim()) return "fatal";
    const probe = { message: reason };
    return !_isDefinitiveNonTransient(probe) && _isTransientRpc(probe) ? "transient" : "fatal";
  }

  if (_isDefinitiveNonTransient(err)) return "fatal";
  return _isTransientRpc(err) ? "transient" : "fatal";
}

const BACKOFF_MIN_MS = 5_000;
const BACKOFF_MAX_MS = 300_000;

/** [TR] 5 sn → 5 dk üstel aralık, ±%20 jitter. attempt 0'dan başlar. */
function computeBackoffMs(attempt, random = Math.random) {
  const base = Math.min(BACKOFF_MAX_MS, BACKOFF_MIN_MS * 2 ** Math.max(0, attempt));
  const jitter = 1 + (random() * 0.4 - 0.2);
  return Math.min(BACKOFF_MAX_MS, Math.max(BACKOFF_MIN_MS, Math.round(base * jitter)));
}

/**
 * [TR] Sıralı RPC'ye bağlı adımları dener. Geçici hatada durur ve { ok:false, failedStep, error } döner;
 *      kesin hatada { fatal:true } döner (çağıran çıkış yapar). Başarılı adımlar `completed` kümesinde tutulur
 *      ve yeniden denemede tekrarlanmaz.
 */
async function runSteps(steps, completed) {
  for (const step of steps) {
    if (completed.has(step.name)) continue;
    try {
      await step.run();
      completed.add(step.name);
    } catch (error) {
      const kind = classifyStartupError(error);
      return { ok: false, fatal: kind === "fatal", failedStep: step.name, error };
    }
  }
  return { ok: true };
}

/**
 * [TR] Tek örnekli toparlanma döngüsü. start() ikinci kez çağrılsa da yalnız bir zamanlayıcı/deneme olur.
 *      Üst üste binme yok: bir deneme bitmeden sonraki planlanmaz.
 */
function createRecoveryLoop({
  steps,
  completed = new Set(),
  onRecovered,
  onFatal,
  setTimeoutFn = setTimeout,
  clearTimeoutFn = clearTimeout,
  random = Math.random,
} = {}) {
  let timer = null;
  let running = false;
  let started = false;
  let stopped = false;
  let attempt = 0;

  const schedule = () => {
    if (stopped) return;
    const delay = computeBackoffMs(attempt, random);
    attempt += 1;
    timer = setTimeoutFn(tick, delay);
    if (timer && typeof timer.unref === "function") timer.unref();
  };

  async function tick() {
    timer = null;
    if (running || stopped) return;
    running = true;
    try {
      const result = await runSteps(steps, completed);
      if (result.ok) {
        stopped = true;
        exitDegraded();
        logger.info("[Degraded] RPC'ye bağlı adımlar tamamlandı; tam hizmet moduna dönüldü.");
        if (typeof onRecovered === "function") await onRecovered();
        return;
      }
      if (result.fatal) {
        stopped = true;
        logger.error(`[Degraded] Toparlanma sırasında KESİN hata (adım=${result.failedStep}): ${redactRpcSecrets(result.error?.message)}`);
        if (typeof onFatal === "function") onFatal(result.error);
        return;
      }
      logger.debug?.(`[Degraded] Yeniden deneme başarısız (adım=${result.failedStep}); tekrar denenecek.`);
    } catch (err) {
      logger.debug?.(`[Degraded] Toparlanma denemesi hatası: ${redactRpcSecrets(err?.message)}`);
    } finally {
      running = false;
    }
    schedule();
  }

  return {
    start() {
      if (started) return false;
      started = true;
      schedule();
      return true;
    },
    stop() {
      stopped = true;
      if (timer) clearTimeoutFn(timer);
      timer = null;
    },
    isRunning: () => started && !stopped,
    _tick: tick,
  };
}

module.exports = {
  isDegraded,
  getDegradedReasons,
  isConfigStale,
  setConfigStale,
  enterDegraded,
  exitDegraded,
  classifyStartupError,
  computeBackoffMs,
  runSteps,
  createRecoveryLoop,
  _resetForTests,
};
