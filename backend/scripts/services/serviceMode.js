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
  isNetworkError,
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

function _isTransientText(text) {
  const probe = { message: text };
  return isRateLimitError(probe) || isMonthlyCapacityError(probe) || isNetworkError(probe);
}

/**
 * [TR] "transient" yalnız geçici RPC hatasıdır (429, ağ, zaman aşımı, 5xx). Diğer her şey "fatal".
 * @returns {"transient"|"fatal"}
 */
function classifyStartupError(err) {
  if (!err) return "fatal";
  const message = String(err.message || err);

  if (/\[ChainGuard\]/.test(message)) return "fatal";
  if (/actual chain=/.test(message)) return "fatal";

  if (message.includes(SEC01_PREFIX)) {
    // SEC-01 hataları yalnız "hiçbir RPC doğrulanamadı + son neden geçici" biçiminde geçicidir.
    const idx = message.indexOf(SEC01_UNVERIFIED_MARKER);
    if (idx === -1) return "fatal";
    const reason = message.slice(idx + SEC01_UNVERIFIED_MARKER.length);
    if (!reason.trim()) return "fatal";
    return _isTransientText(reason) ? "transient" : "fatal";
  }

  return _isTransientText(message) ? "transient" : "fatal";
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
