// ─── services/jobLock.js ──────────────────────────────────────────────────────
"use strict";

/**
 * [TR] B4-05 / B1-10: Redis tabanlı dağıtık iş kilidi (çoklu makine / rolling deploy güvenliği).
 *      - Alma: SET key token NX PX ttl. token = süreç başına rastgele değer.
 *      - Yenileme ve bırakma YALNIZ token eşleşirse (Lua compare-and-pexpire / compare-and-del); başka
 *        makinenin kilidi asla silinmez/uzatılmaz.
 *      - Uzun işlerde kilit ttl/3 aralıkla yenilenir.
 *      - FAIL-CLOSED: Redis erişilemez/hata verirse kilit alınamaz ve iş o turda ÇALIŞMAZ (çift çalışmaktansa atla).
 * [EN] Redis-backed distributed job lock. SET NX PX with a per-process random token; renew/release only when the
 *      token still matches (Lua). Renewed periodically for long jobs. Fail-closed: if Redis errors, the job is
 *      skipped for that tick rather than risking a double run.
 *
 * Env (hepsi isteğe bağlı / all optional):
 *   JOB_LOCK_TTL_MS            varsayılan 120000 (kilit ömrü; ttl/3'te bir yenilenir)
 *   JOB_LOCK_COMMAND_TIMEOUT_MS varsayılan 5000 (tek kilit komutunun zaman aşımı)
 */

const crypto = require("crypto");
const logger = require("../utils/logger");

const KEY_PREFIX = "lock:job:";

const RELEASE_LUA =
  "if redis.call('get', KEYS[1]) == ARGV[1] then return redis.call('del', KEYS[1]) else return 0 end";
const RENEW_LUA =
  "if redis.call('get', KEYS[1]) == ARGV[1] then return redis.call('pexpire', KEYS[1], ARGV[2]) else return 0 end";

function _posIntEnv(name, fallback) {
  const n = Number(process.env[name]);
  return Number.isFinite(n) && n > 0 ? Math.floor(n) : fallback;
}

function _withTimeout(promise, ms, label) {
  let timer;
  const timeout = new Promise((_, reject) => {
    timer = setTimeout(() => reject(new Error(`${label} ${ms}ms içinde yanıtlanmadı`)), ms);
    if (typeof timer.unref === "function") timer.unref();
  });
  return Promise.race([promise, timeout]).finally(() => clearTimeout(timer));
}

function createJobLock({ getClient, token, ttlMs, commandTimeoutMs } = {}) {
  const lockToken = token || crypto.randomBytes(16).toString("hex");
  const ttl = () => ttlMs || _posIntEnv("JOB_LOCK_TTL_MS", 120_000);
  const cmdTimeout = () => commandTimeoutMs || _posIntEnv("JOB_LOCK_COMMAND_TIMEOUT_MS", 5_000);
  const keyOf = (jobKey) => `${KEY_PREFIX}${jobKey}`;

  async function acquire(jobKey) {
    const redis = getClient();
    // [TR] Çağrıda SET yeteneği olmayan istemci (yalnız birim test taklitleri) için koordinasyon katmanı
    //      devre dışı sayılır; gerçek node-redis istemcisinde set her zaman vardır.
    // [EN] A client without SET (unit-test doubles only) disables the coordination layer; real node-redis
    //      clients always have it.
    if (!redis) throw new Error("Redis istemcisi yok");
    if (typeof redis.set !== "function") {
      // [TR] D2: bu dal yalnız NODE_ENV=test'te kabul edilir; aksi hâlde fail-closed (iş atlanır).
      if (process.env.NODE_ENV === "test") return { status: "unsupported" };
      throw new Error("Redis istemcisi SET desteklemiyor");
    }
    const res = await _withTimeout(
      redis.set(keyOf(jobKey), lockToken, { NX: true, PX: ttl() }),
      cmdTimeout(),
      "Redis SET NX"
    );
    return { status: res === "OK" ? "acquired" : "held" };
  }

  async function _evalOwned(script, jobKey, extraArgs = []) {
    const redis = getClient();
    return _withTimeout(
      redis.eval(script, { keys: [keyOf(jobKey)], arguments: [lockToken, ...extraArgs.map(String)] }),
      cmdTimeout(),
      "Redis EVAL"
    );
  }

  const release = (jobKey) => _evalOwned(RELEASE_LUA, jobKey);
  const renew = (jobKey) => _evalOwned(RENEW_LUA, jobKey, [ttl()]);

  /**
   * @returns {Promise<{ran:boolean, skipped?:string, result?:any}>}
   */
  async function runExclusive(jobKey, fn) {
    let acquired;
    try {
      acquired = await acquire(jobKey);
    } catch (err) {
      logger.warn(`[JobLock] ${jobKey} kilidi alınamadı (Redis hatası, fail-closed): ${err.message}`);
      return { ran: false, skipped: "lock_redis_unavailable" };
    }
    if (acquired.status === "held") {
      logger.warn(`[JobLock] ${jobKey} başka bir makinede çalışıyor — bu tick atlandı.`);
      return { ran: false, skipped: "lock_held_elsewhere" };
    }
    if (acquired.status === "unsupported") {
      return { ran: true, result: await fn({ isLockLost: () => false }), lost: false };
    }

    // [TR] D1: yenileme 0 dönerse, hata verirse ya da zaman aşımına uğrarsa kilit KAYBEDİLMİŞ sayılır (sticky).
    //      İş fn'e verilen isLockLost() ile bunu kontrol edip yeni iş/tx başlatmadan durmalıdır.
    // [EN] D1: a renewal that returns 0, errors or times out marks the lock LOST (sticky). The job must poll
    //      isLockLost() and stop before starting new work/txs.
    let lost = false;
    let renewTimer = null;
    const markLost = (why) => {
      if (lost) return;
      lost = true;
      if (renewTimer) clearInterval(renewTimer);
      logger.error(`[JobLock][ALARM] ${jobKey} kilidi kaybedildi (${why}); iş yeni adım başlatmadan duracak.`);
    };
    renewTimer = setInterval(async () => {
      try {
        const ok = await renew(jobKey);
        if (Number(ok) !== 1) markLost("yenileme reddedildi");
      } catch (err) {
        markLost(`yenileme hatası: ${err.message}`);
      }
    }, Math.max(1, Math.floor(ttl() / 3)));
    if (typeof renewTimer.unref === "function") renewTimer.unref();

    try {
      const result = await fn({ isLockLost: () => lost });
      return { ran: true, result, lost };
    } finally {
      clearInterval(renewTimer);
      try {
        await release(jobKey);
      } catch (err) {
        logger.warn(`[JobLock] ${jobKey} kilidi bırakılamadı (TTL ile sona erecek): ${err.message}`);
      }
    }
  }

  return { acquire, release, renew, runExclusive, token: lockToken };
}

// [TR] Varsayılan örnek: süreç başına tek rastgele token, paylaşılan Redis istemcisi.
// [EN] Default instance: one random token per process, shared Redis client.
let _default = null;
function getDefaultJobLock() {
  if (!_default) {
    const { getRedisClient } = require("../config/redis");
    _default = createJobLock({ getClient: () => getRedisClient() });
  }
  return _default;
}

const runExclusive = (jobKey, fn) => getDefaultJobLock().runExclusive(jobKey, fn);

module.exports = { createJobLock, runExclusive, RELEASE_LUA, RENEW_LUA, KEY_PREFIX };
