"use strict";

/**
 * [TR] Paylaşılan RPC sağlayıcısı.
 *      - Her servis kendi JsonRpcProvider'ını açmak yerine tek örneği paylaşır (ek eth_chainId/eth_blockNumber yükü yok).
 *      - Zincir bir kez doğrulandıktan sonra staticNetwork ile tekrar eth_chainId çağrılmaz.
 *      - BASE_RPC_URL_FALLBACKS (virgülle ayrık) ile sıralı failover: birincil 429/ağ hatası verirse soğuma
 *        süresince sonraki URL kullanılır. HER URL kullanılmadan önce assertProviderExpectedChainOrThrow ile
 *        beklenen zincire karşı doğrulanır; doğrulanamayan URL hiç kullanılmaz.
 *      - URL'ler (API anahtarı içerir) hiçbir log/hata mesajında açık yazılmaz.
 * [EN] Shared RPC provider with one-time chain verification, static network, ordered failover and URL redaction.
 */

const { ethers } = require("ethers");
const logger = require("../utils/logger");
const { redactRpcUrl, redactRpcSecrets } = require("../utils/logRedaction");
const { assertProviderExpectedChainOrThrow, resolveExpectedChainIdOrThrow } = require("./expectedChain");
const { runtimeValueSync } = require("../utils/runtimeValue");

const RATE_LIMIT_COOLDOWN_MS = 60_000;
const MONTHLY_CAPACITY_COOLDOWN_MS = 10 * 60_000;
const NETWORK_ERROR_COOLDOWN_MS = 30_000;
const RPC_RATE_KEY = "RPC_MAX_REQUESTS_PER_SEC";
const RATE_WINDOW_MS = 1_000;
const RATE_QUEUE_MAX = 200;
const RATE_QUEUE_MAX_WAIT_MS = 30_000;
// [TR] HTTP istek üst süresi (ethers varsayılanı 300 sn). Büyük eth_getLogs için ayrı, daha uzun süre.
const RPC_REQUEST_TIMEOUT_MS = 10_000;
const RPC_LOGS_REQUEST_TIMEOUT_MS = 60_000;

function _errText(err) {
  const parts = [err?.message, err?.shortMessage, err?.info?.responseBody, err?.info?.error?.message, err?.error?.message];
  try {
    if (err?.info?.response?.statusCode !== undefined) parts.push(`status ${err.info.response.statusCode}`);
  } catch { /* ignore */ }
  return parts.filter((p) => typeof p === "string").join(" | ");
}

function _statusCodeOf(err) {
  const candidates = [err?.info?.response?.statusCode, err?.info?.error?.code, err?.error?.code, err?.status, err?.statusCode];
  for (const c of candidates) {
    if (Number(c) === 429) return 429;
  }
  return null;
}

/** [TR] Aylık kapasite tükenmesi: uzun bekleme gerektirir. */
function isMonthlyCapacityError(err) {
  return /monthly capacity|capacity limit exceeded|monthly.{0,20}(limit|quota)/i.test(_errText(err));
}

/** [TR] 429 / "compute units" / "capacity" / "exceeded" / "rate limit" hataları. */
function isRateLimitError(err) {
  if (!err) return false;
  if (_statusCodeOf(err) === 429) return true;
  const text = _errText(err);
  return /\b429\b|compute units|capacity|rate.?limit|too many requests|exceeded maximum retry limit|throttl/i.test(text) ||
    (/exceeded/i.test(text) && /(limit|capacity|quota|compute)/i.test(text));
}

/** [TR] Alchemy ücretsiz plan: eth_getLogs blok aralığı / yanıt boyutu sınırı. */
function isBlockRangeError(err) {
  return /block range|log response size exceeded|query returned more than|range (is )?too (large|wide)|limited to a \d+ block|maximum block range/i
    .test(_errText(err));
}

function isNetworkError(err) {
  if (!err) return false;
  if (["NETWORK_ERROR", "TIMEOUT", "SERVER_ERROR"].includes(err.code)) return true;
  if (["ECONNRESET", "ECONNREFUSED", "ETIMEDOUT", "ENOTFOUND", "EAI_AGAIN"].includes(err.code)) return true;
  return /ECONNRESET|ECONNREFUSED|ETIMEDOUT|ENOTFOUND|EAI_AGAIN|socket hang up|network|timeout|\b50[234]\b/i.test(_errText(err));
}

function isChainGuardError(err) {
  return /\[ChainGuard\]/.test(String(err?.message || ""));
}

/** @returns {"monthly"|"rate"|"range"|null} */
function classifyRpcError(err) {
  if (isMonthlyCapacityError(err)) return "monthly";
  if (isBlockRangeError(err)) return "range";
  if (isRateLimitError(err)) return "rate";
  return null;
}

function _splitUrls(raw) {
  return String(raw || "").split(",").map((s) => s.trim()).filter(Boolean);
}

/** [TR] [birincil, ...yedekler] (tekrarsız). */
function getRpcUrls(env = process.env) {
  const urls = [];
  for (const u of [env.BASE_RPC_URL, ..._splitUrls(env.BASE_RPC_URL_FALLBACKS)]) {
    if (u && typeof u === "string" && !urls.includes(u.trim())) urls.push(u.trim());
  }
  return urls;
}

function _newFetchRequest(url, timeoutMs = RPC_REQUEST_TIMEOUT_MS) {
  if (typeof ethers.FetchRequest !== "function") return url; // (yalnız ethers'ı taklit eden testler)
  const req = new ethers.FetchRequest(url);
  // [TR] ethers'ın dahili 429 yeniden denemesi KAPALI (maxAttempts: 1): iç yeniden deneme hız sınırlayıcıyı atlar
  //      ve 429 fırtınası yaratır. Yeniden deneme/geri çekilme havuzun soğuma + fallback mantığına bırakılır.
  req.setThrottleParams({ maxAttempts: 1, slotInterval: 250 });
  req.timeout = timeoutMs;
  return req;
}

/**
 * [TR] Yalnız eth_chainId sorar (polling/detectNetwork gürültüsü yok). assertProviderExpectedChainOrThrow ile
 *      uyumlu, getNetwork() sağlayan minimal bir nesne döner.
 */
function createChainProbe(url) {
  return {
    async getNetwork() {
      const req = _newFetchRequest(url);
      req.body = { jsonrpc: "2.0", id: 1, method: "eth_chainId", params: [] };
      const resp = await req.send();
      resp.assertOk();
      const parsed = JSON.parse(resp.bodyText);
      if (parsed?.error) {
        const e = new Error(String(parsed.error.message || "rpc error"));
        e.code = parsed.error.code;
        throw e;
      }
      return { chainId: BigInt(parsed.result) };
    },
  };
}

/**
 * [TR] Kayan pencereli (1 sn) hız sınırlayıcı, FIFO kuyruk: herhangi bir 1 sn'lik pencerede en fazla `getRate()`
 *      istek serbest bırakılır (token bucket'tan daha sıkı: patlama + yenilenme kaynaklı aşım yok). Değer her
 *      denetimde yeniden okunur (çalışma anında değişebilir). Kuyruk dolarsa ya da bekleme süresi aşılırsa
 *      rate-limit sınıfından (isRateLimitError) bir hata ile reddeder.
 * [EN] Sliding-window (1s) FIFO rate limiter; bounded queue and bounded wait, rejects with a rate-limit-class error.
 */
function createRateLimiter({
  getRate = () => runtimeValueSync(RPC_RATE_KEY),
  now = () => Date.now(),
  sleep = (ms) => new Promise((r) => setTimeout(r, ms)),
  maxQueue = RATE_QUEUE_MAX,
  maxWaitMs = RATE_QUEUE_MAX_WAIT_MS,
  onRelease = null, // [TR] test/gözlem kancası: serbest bırakma zamanı
} = {}) {
  const stamps = [];
  const queue = [];
  let pumping = false;

  function localLimitError(msg) {
    const e = new Error(`[RpcRateLimiter] Too Many Requests: ${msg}`);
    e.code = "RPC_LOCAL_RATE_LIMIT";
    return e;
  }

  async function pump() {
    if (pumping) return;
    pumping = true;
    try {
      while (queue.length > 0) {
        const t = now();
        while (stamps.length > 0 && stamps[0] <= t - RATE_WINDOW_MS) stamps.shift();
        const rate = Math.max(1, Number(getRate()) || 1);
        const head = queue[0];
        if (t - head.at >= maxWaitMs) {
          queue.shift();
          head.reject(localLimitError(`queue wait exceeded ${maxWaitMs} ms`));
          continue;
        }
        if (stamps.length < rate) {
          stamps.push(t);
          if (onRelease) onRelease(t);
          queue.shift().resolve();
          continue;
        }
        const wait = stamps[stamps.length - rate] + RATE_WINDOW_MS - t;
        await sleep(Math.max(1, wait));
      }
    } finally {
      pumping = false;
    }
  }

  function acquire() {
    if (queue.length >= maxQueue) return Promise.reject(localLimitError(`queue full (${maxQueue})`));
    return new Promise((resolve, reject) => {
      queue.push({ resolve, reject, at: now() });
      pump();
    });
  }

  return { acquire, get queued() { return queue.length; } };
}

/** [TR] eth_getLogs içeren yük mü? (daha uzun üst süre) */
function _hasGetLogs(payload) {
  const items = Array.isArray(payload) ? payload : [payload];
  return items.some((p) => p?.method === "eth_getLogs");
}

/** [TR] Yük başına üst süre: getLogs uzun, diğerleri kısa. Aşılırsa TIMEOUT kodlu hata (ağ hatası sınıfı). */
function _withRequestTimeout(promise, payload) {
  const ms = _hasGetLogs(payload) ? RPC_LOGS_REQUEST_TIMEOUT_MS : RPC_REQUEST_TIMEOUT_MS;
  let timer;
  const timeout = new Promise((_, reject) => {
    timer = setTimeout(() => {
      const e = new Error(`[RpcPool] RPC isteği zaman aşımı (${ms} ms)`);
      e.code = "TIMEOUT";
      reject(e);
    }, ms);
  });
  return Promise.race([promise, timeout]).finally(() => clearTimeout(timer));
}

function _safeError(err) {
  return redactRpcSecrets(err?.message || String(err));
}

/**
 * [TR] Havuz: URL listesi + doğrulama/soğuma durumu. `createInner(url, chainId)` ve `probeFor(url)` test için
 *      enjekte edilebilir.
 */
function createRpcPool({ urls, surface = "RpcPool", probeFor = createChainProbe, createInner, now = () => Date.now(), log = logger, rateLimiterFor = () => createRateLimiter() } = {}) {
  if (!Array.isArray(urls) || urls.length === 0) throw new Error("[RpcPool] En az bir RPC URL gerekli.");
  const entries = urls.map((url, index) => ({
    url, index, label: redactRpcUrl(url),
    verified: false, chainId: null, verifying: null,
    rejected: false, cooldownUntil: 0, inner: null,
    limiter: rateLimiterFor(url, index), // [TR] URL başına bağımsız hız sınırı
  }));

  async function ensureVerified(entry) {
    if (entry.rejected) throw new Error(`[ChainGuard][${surface}] RPC reddedildi (${entry.label}).`);
    if (entry.verified) return entry;
    if (!entry.verifying) {
      entry.verifying = (async () => {
        await entry.limiter.acquire(); // zincir sorgusu da bu URL'ye giden bir istektir
        const { actualChainId } = await assertProviderExpectedChainOrThrow(probeFor(entry.url), {
          rpcUrl: entry.url,
          rpcEnvName: entry.index === 0 ? "BASE_RPC_URL" : `BASE_RPC_URL_FALLBACKS[${entry.index - 1}]`,
          surface,
        });
        entry.chainId = actualChainId;
        entry.verified = true;
      })().finally(() => { entry.verifying = null; });
    }
    await entry.verifying;
    return entry;
  }

  function markCooldown(entry, err) {
    const kind = classifyRpcError(err);
    const ms = kind === "monthly" ? MONTHLY_CAPACITY_COOLDOWN_MS : kind ? RATE_LIMIT_COOLDOWN_MS : NETWORK_ERROR_COOLDOWN_MS;
    if (entries.length > 1) {
      entry.cooldownUntil = now() + ms;
      log.warn(`[RpcPool] ${entry.label} ${Math.round(ms / 1000)} sn devre dışı (${kind || "network"}); sonraki RPC denenecek.`);
    }
  }

  function candidates() {
    const live = entries.filter((e) => !e.rejected);
    const t = now();
    const ready = live.filter((e) => e.cooldownUntil <= t);
    if (ready.length > 0) return ready;
    // Hepsi soğumada: yalnız en erken bitecek olanı dene (hammering yok).
    return live.length ? [[...live].sort((a, b) => a.cooldownUntil - b.cooldownUntil)[0]] : [];
  }

  function innerFor(entry) {
    if (!entry.inner) entry.inner = createInner(entry.url, entry.chainId);
    return entry.inner;
  }

  function _jsonRpcLevelError(result) {
    const items = Array.isArray(result) ? result : [result];
    for (const item of items) {
      if (item?.error && (Number(item.error.code) === 429 || isRateLimitError({ message: item.error.message }))) {
        const e = new Error(String(item.error.message || "rate limited"));
        e.code = item.error.code;
        return e;
      }
    }
    return null;
  }

  async function send(payload) {
    let lastErr = null;
    for (const entry of candidates()) {
      try {
        await ensureVerified(entry);
      } catch (err) {
        if (isChainGuardError(err)) {
          // Birincil URL'de zincir uyuşmazlığı/yapılandırma hatası: sessizce yedeğe geçmek yerine hatayı ilet.
          if (entry.index === 0) throw err;
          entry.rejected = true;
          log.error(`[RpcPool] Yedek RPC zincir doğrulamasından geçemedi, kullanılmayacak: ${entry.label} | ${_safeError(err)}`);
          lastErr = lastErr || err; // asıl (birincil) hata öncelikli
          continue;
        }
        markCooldown(entry, err);
        lastErr = err;
        continue;
      }
      try {
        await entry.limiter.acquire();
        const result = await _withRequestTimeout(Promise.resolve(innerFor(entry)._send(payload)), payload);
        const soft = _jsonRpcLevelError(result);
        if (soft) throw soft;
        return result;
      } catch (err) {
        lastErr = err;
        if (entries.length > 1 && (isRateLimitError(err) || isNetworkError(err))) {
          markCooldown(entry, err);
          continue;
        }
        throw err;
      }
    }
    throw lastErr || new Error("[RpcPool] Kullanılabilir doğrulanmış RPC yok.");
  }

  /** İlk doğrulanabilen URL'nin zincir kimliği (getNetwork için). */
  async function verifiedChainId() {
    let lastErr = null;
    for (const entry of candidates()) {
      try {
        await ensureVerified(entry);
        return entry.chainId;
      } catch (err) {
        if (isChainGuardError(err)) {
          if (entry.index === 0) throw err;
          entry.rejected = true;
        } else {
          markCooldown(entry, err);
        }
        lastErr = err;
      }
    }
    throw lastErr || new Error("[RpcPool] Kullanılabilir doğrulanmış RPC yok.");
  }

  return { entries, send, ensureVerified, verifiedChainId, markCooldown };
}

function _expectedNetworkOrNull() {
  try {
    const id = resolveExpectedChainIdOrThrow({
      isProduction: process.env.NODE_ENV === "production",
      rpcUrl: process.env.BASE_RPC_URL,
      surface: "RpcProvider",
    });
    return id && ethers.Network ? ethers.Network.from(id) : null;
  } catch {
    return null;
  }
}

function _buildJsonRpcProvider(url, network) {
  // [TR] HTTP katmanı en uzun süreye (getLogs) göre; kısa istekler _withRequestTimeout ile 10 sn'de kesilir.
  const req = _newFetchRequest(url, RPC_LOGS_REQUEST_TIMEOUT_MS);
  // [TR] batchMaxCount: 1 -> toplu JSON-RPC yok; her istek ayrı gider ve hız sınırlayıcıdan ayrı ayrı geçer.
  return network
    ? new ethers.JsonRpcProvider(req, network, { staticNetwork: network, batchMaxCount: 1 })
    : new ethers.JsonRpcProvider(req, undefined, { batchMaxCount: 1 });
}

let _shared = null;
let _sharedKey = null;

/**
 * [TR] Süreç genelinde paylaşılan provider. Senkron döner; zincir doğrulaması ilk getNetwork()/RPC çağrısında
 *      (bir kez) yapılır. Kullanılan her URL doğrulanmıştır. destroy() paylaşılan örnek için no-op'tur.
 */
function getSharedProvider() {
  const urls = getRpcUrls();
  if (urls.length === 0) throw new Error("[RpcProvider] BASE_RPC_URL tanımlı değil.");
  const expected = _expectedNetworkOrNull();
  const key = `${urls.join(",")}|${expected ? expected.chainId : ""}`;
  if (_shared && _sharedKey === key) return _shared;

  const provider = _buildJsonRpcProvider(urls[0], expected);
  const primarySend = typeof provider._send === "function" ? provider._send.bind(provider) : null;
  const pool = createRpcPool({
    urls,
    surface: "RpcProvider",
    createInner: (url, chainId) => {
      if (url === urls[0] && primarySend) return { _send: primarySend };
      return _buildJsonRpcProvider(url, chainId ? ethers.Network.from(chainId) : expected);
    },
  });

  provider._send = (payload) => pool.send(payload);
  const originalGetNetwork = typeof provider.getNetwork === "function" ? provider.getNetwork.bind(provider) : null;
  provider.getNetwork = async () => {
    const chainId = await pool.verifiedChainId();
    if (chainId !== null && chainId !== undefined) return ethers.Network.from(chainId);
    return originalGetNetwork ? originalGetNetwork() : { chainId: null };
  };
  const realDestroy = typeof provider.destroy === "function" ? provider.destroy.bind(provider) : null;
  provider.destroy = async () => { /* paylaşılan örnek: tek tek yok edilemez */ };
  provider.__realDestroy = realDestroy;
  provider.__rpcPool = pool;

  _shared = provider;
  _sharedKey = key;
  return provider;
}

function resetSharedProviderForTests() {
  _shared = null;
  _sharedKey = null;
}

module.exports = {
  getSharedProvider,
  resetSharedProviderForTests,
  createRpcPool,
  createChainProbe,
  createRateLimiter,
  _buildJsonRpcProvider,
  RPC_REQUEST_TIMEOUT_MS,
  RPC_LOGS_REQUEST_TIMEOUT_MS,
  getRpcUrls,
  classifyRpcError,
  isRateLimitError,
  isMonthlyCapacityError,
  isBlockRangeError,
  isNetworkError,
  redactRpcUrl,
  redactRpcSecrets,
};
