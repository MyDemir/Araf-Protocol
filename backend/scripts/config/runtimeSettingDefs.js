"use strict";

/**
 * Runtime ayar tanımları (saf veri + saf fonksiyonlar; Mongoose/ağ bağımlılığı YOK).
 * Hem runtimeSettings servisi hem tüketiciler (sağlık, önbellek, işler) güvenle require edebilir.
 *
 * KAPSAM DIŞI (bilerek):
 *  - RPC URL'leri, gizli anahtarlar, kontrat adresleri, EXPECTED_CHAIN_ID, finality, CORS, ADMIN_WALLETS, KMS, SEC-01.
 *  - Rate limit SAYILARI (yalnız tier önbellek süresi eklendi).
 *  - PAYMENT_RAILS_CACHE_TTL_MS: ödeme yöntemi kapatma anahtarının yayılma süresini belirler (para/yetki kuralı).
 *  - REDIS_READY_WAIT_MS: yalnız açılışta okunur; yeniden başlatma gerektirir.
 *  - IDENTITY_MIGRATION_BATCH_SIZE: tek seferlik CLI göçü, sunucu süreci değil.
 *  - USER_BANK_RISK_CLEANUP_CURSOR_BATCH_SIZE: PII temizleme yolu.
 */

const SETTING_GROUPS = ["worker", "watchdog", "cache", "ticker", "jobs"];

const SETTING_DEFS = {
  // ── Worker ──
  LIVE_POLL_INTERVAL_MS: {
    group: "worker", unit: "ms", min: 5_000, max: 300_000, default: 15_000,
    description: {
      TR: "Canlı izleme turu aralığı (her tur 1 eth_blockNumber + eth_getLogs).",
      EN: "Live polling interval (each tick = 1 eth_blockNumber + eth_getLogs).",
    },
  },
  WORKER_BLOCK_BATCH_SIZE: {
    group: "worker", unit: "blocks", min: 1, max: 2_000, default: 1_000,
    description: {
      TR: "Tek eth_getLogs çağrısındaki blok sayısı (Alchemy ücretsiz planda 10).",
      EN: "Blocks per eth_getLogs call (10 on the Alchemy free plan).",
    },
  },
  WORKER_REPLAY_BATCH_DELAY_MS: {
    group: "worker", unit: "ms", min: 0, max: 10_000, default: 250,
    description: {
      TR: "Replay/canlı parçaları arası bekleme (saniyelik CU sınırı için).",
      EN: "Delay between replay/live chunks (per-second CU limit).",
    },
  },
  WORKER_CHECKPOINT_INTERVAL_BLOCKS: {
    group: "worker", unit: "blocks", min: 1, max: 1_000, default: 50,
    description: {
      TR: "Canlı modda, son güvenli checkpoint'ten bu kadar blok geçince kaçırılan olaylar yeniden taranır.",
      EN: "In live mode, missed events are re-scanned once this many blocks pass the last safe checkpoint.",
    },
  },
  WORKER_REPLAY_BACKOFF_BASE_MS: {
    group: "worker", unit: "ms", min: 500, max: 60_000, default: 5_000,
    description: {
      TR: "Başarısız replay sonrası ilk bekleme (her başarısızlıkta iki katına çıkar). Üst sınırı aşamaz.",
      EN: "First wait after a failed replay (doubles on each failure). Must not exceed the backoff max.",
    },
  },
  WORKER_REPLAY_BACKOFF_MAX_MS: {
    group: "worker", unit: "ms", min: 5_000, max: 1_800_000, default: 300_000,
    description: {
      TR: "Replay geri çekilmesinin üst sınırı. Taban değerden küçük olamaz.",
      EN: "Upper bound of replay backoff. Must not be lower than the backoff base.",
    },
  },
  // ── Watchdog / Sağlık ──
  WORKER_BLOCK_STALE_MS: {
    group: "watchdog", unit: "ms", min: 30_000, max: 900_000, default: 75_000,
    description: {
      TR: "Bu süre yeni blok görülmezse watchdog yeniden bağlanır, yine blok yoksa süreç çıkar. Canlı tur aralığının en az 3 katı olmalı.",
      EN: "With no new block for this long the watchdog reconnects; still nothing -> process exits. Must be at least 3x the live poll interval.",
    },
  },
  WORKER_WATCHDOG_INTERVAL_MS: {
    group: "watchdog", unit: "ms", min: 5_000, max: 120_000, default: 15_000,
    description: {
      TR: "Watchdog'un kontrol sıklığı.",
      EN: "How often the watchdog checks.",
    },
  },
  WORKER_LIVENESS_STALE_MS: {
    group: "watchdog", unit: "ms", min: 60_000, max: 1_800_000, default: 180_000,
    dynamicDefault: (v) => 2 * v.WORKER_BLOCK_STALE_MS + 30_000,
    description: {
      TR: "/health canlılık eşiği: son blok bundan eskiyse 'stale'. Blok bayatlık süresinin en az 2 katı olmalı. Varsayılan: 2 x blok bayatlık + 30 sn.",
      EN: "/health liveness threshold: 'stale' when the last block is older. Must be at least 2x the block stale time. Default: 2 x block stale + 30s.",
    },
  },
  WORKER_MAX_LAG_BLOCKS: {
    group: "watchdog", unit: "blocks", min: 1, max: 1_000, default: 25,
    description: {
      TR: "/ready: worker bu kadar blok geriye düşerse hazır değil (503) sayılır.",
      EN: "/ready: the worker is reported not ready (503) when it lags this many blocks.",
    },
  },
  // ── Önbellekler ──
  READY_CACHE_TTL_MS: {
    group: "cache", unit: "ms", min: 5_000, max: 10_000, default: 7_000,
    description: {
      TR: "/ready sonucunun bellekte tutulma süresi.",
      EN: "How long the /ready result is cached in memory.",
    },
  },
  MARKET_CACHE_TTL_MS: {
    group: "cache", unit: "ms", min: 0, max: 60_000, default: 10_000,
    description: {
      TR: "Herkese açık pazar listesi yanıtının bellek önbelleği (0 = kapalı).",
      EN: "In-memory cache of the public market list response (0 = off).",
    },
  },
  CONFIG_CACHE_TTL_SECONDS: {
    group: "cache", unit: "s", min: 60, max: 86_400, default: 3_600,
    description: {
      TR: "Zincirden okunan protokol parametrelerinin Redis önbellek süresi (olaylarla ayrıca tazelenir).",
      EN: "Redis cache lifetime of on-chain protocol parameters (also refreshed by events).",
    },
  },
  RATE_LIMIT_TIER_CACHE_TTL_SECONDS: {
    group: "cache", unit: "s", min: 10, max: 600, default: 120,
    description: {
      TR: "Yalnız kullanıcı tier'ının Redis önbellek süresi. Limit sayılarını DEĞİŞTİRMEZ; tier değişikliği bu kadar gecikebilir.",
      EN: "Redis cache lifetime of the user tier lookup only. Does NOT change limit counts; a tier change may lag by this much.",
    },
  },
  // ── Kur referansı ──
  REFERENCE_TICKER_CRYPTO_TTL_SECONDS: {
    group: "ticker", unit: "s", min: 30, max: 3_600, default: 120,
    description: {
      TR: "Kripto kurlarının önbellek süresi.",
      EN: "Cache lifetime of crypto rates.",
    },
  },
  REFERENCE_TICKER_FIAT_TTL_SECONDS: {
    group: "ticker", unit: "s", min: 300, max: 86_400, default: 21_600,
    description: {
      TR: "Fiat kurlarının önbellek süresi. En fazla azami bayatlık kadar olabilir.",
      EN: "Cache lifetime of fiat rates. Must not exceed the max stale age.",
    },
  },
  REFERENCE_TICKER_LAST_GOOD_TTL_SECONDS: {
    group: "ticker", unit: "s", min: 3_600, max: 2_592_000, default: 604_800,
    description: {
      TR: "Son iyi kur kaydının saklanma süresi. Azami bayatlıktan küçük olamaz (aksi halde bayatlık sınırı anlamsızlaşır).",
      EN: "Retention of the last-good rate snapshot. Must not be lower than the max stale age.",
    },
  },
  REFERENCE_TICKER_MAX_STALE_SECONDS: {
    group: "ticker", unit: "s", min: 300, max: 604_800, default: 86_400,
    description: {
      TR: "Bir kur satırı bu süreden eskiyse bayat yedek olarak bile gösterilmez.",
      EN: "A rate row older than this is not shown even as a stale fallback.",
    },
  },
  // ── Arka plan işleri ──
  REPUTATION_DECAY_CANDIDATE_LIMIT: {
    group: "jobs", unit: "users", min: 10, max: 1_000, default: 250,
    description: {
      TR: "İtibar sönümleme işinin her turda taradığı aday kullanıcı sayısı (zincirden okuma maliyeti).",
      EN: "Candidate users scanned per reputation-decay run (on-chain read cost).",
    },
  },
  REPUTATION_DECAY_TX_LIMIT: {
    group: "jobs", unit: "tx", min: 1, max: 100, default: 50,
    warning: {
      TR: "Maliyet uyarısı: her turda bu sayıya kadar relayer işlemi gönderilir; relayer gas'ı harcanır.",
      EN: "Cost warning: up to this many relayer transactions are sent per run; relayer gas is spent.",
    },
    description: {
      TR: "İtibar sönümleme işinin tur başına en fazla işlem yapacağı kullanıcı sayısı.",
      EN: "Maximum users the reputation-decay job processes per run.",
    },
  },
  REWARD_RECORDER_CANDIDATE_LIMIT: {
    group: "jobs", unit: "trades", min: 10, max: 1_000, default: 200,
    description: {
      TR: "Ödül kaydedicinin her turda taradığı aday işlem sayısı (yalnız veritabanı sorgusu).",
      EN: "Candidate trades the reward recorder scans per run (database query only).",
    },
  },
  REWARD_RECORDER_BATCH_LIMIT: {
    group: "jobs", unit: "trades", min: 1, max: 100, default: 50,
    warning: {
      TR: "Maliyet uyarısı: tek relayer işleminde kaydedilen işlem sayısı; büyüdükçe işlem başına gas artar.",
      EN: "Cost warning: trades recorded in one relayer transaction; gas per transaction grows with it.",
    },
    description: {
      TR: "Ödül kaydedicinin tek toplu işlemdeki en fazla işlem sayısı.",
      EN: "Maximum trades the reward recorder sends in one batch transaction.",
    },
  },
};

const SETTING_KEYS = Object.keys(SETTING_DEFS);

/**
 * Alanlar arası kısıtlar. Etkin değerler (admin > env > varsayılan) üzerinden değerlendirilir.
 * check(v) true ise geçerli.
 */
const SETTING_CONSTRAINTS = [
  {
    id: "liveness_vs_block_stale",
    keys: ["WORKER_LIVENESS_STALE_MS", "WORKER_BLOCK_STALE_MS"],
    check: (v) => v.WORKER_LIVENESS_STALE_MS >= 2 * v.WORKER_BLOCK_STALE_MS,
    message: "WORKER_LIVENESS_STALE_MS, WORKER_BLOCK_STALE_MS değerinin en az 2 katı olmalı.",
  },
  {
    id: "backoff_base_vs_max",
    keys: ["WORKER_REPLAY_BACKOFF_BASE_MS", "WORKER_REPLAY_BACKOFF_MAX_MS"],
    check: (v) => v.WORKER_REPLAY_BACKOFF_BASE_MS <= v.WORKER_REPLAY_BACKOFF_MAX_MS,
    message: "WORKER_REPLAY_BACKOFF_BASE_MS, WORKER_REPLAY_BACKOFF_MAX_MS değerinden büyük olamaz.",
  },
  {
    // Yalnız BLOCK_STALE değiştirilirken zorlanır: poll yükseltmesi watchdog'da max(stale, poll*3) ile zaten korunur.
    id: "block_stale_vs_poll",
    keys: ["WORKER_BLOCK_STALE_MS"],
    check: (v) => v.WORKER_BLOCK_STALE_MS >= 3 * v.LIVE_POLL_INTERVAL_MS,
    message: "WORKER_BLOCK_STALE_MS, LIVE_POLL_INTERVAL_MS değerinin en az 3 katı olmalı (aksi halde watchdog yanlış alarm verir).",
  },
  {
    id: "last_good_vs_max_stale",
    keys: ["REFERENCE_TICKER_LAST_GOOD_TTL_SECONDS", "REFERENCE_TICKER_MAX_STALE_SECONDS"],
    check: (v) => v.REFERENCE_TICKER_LAST_GOOD_TTL_SECONDS >= v.REFERENCE_TICKER_MAX_STALE_SECONDS,
    message: "REFERENCE_TICKER_LAST_GOOD_TTL_SECONDS, REFERENCE_TICKER_MAX_STALE_SECONDS değerinden küçük olamaz.",
  },
  {
    id: "fiat_ttl_vs_max_stale",
    keys: ["REFERENCE_TICKER_FIAT_TTL_SECONDS", "REFERENCE_TICKER_MAX_STALE_SECONDS"],
    check: (v) => v.REFERENCE_TICKER_FIAT_TTL_SECONDS <= v.REFERENCE_TICKER_MAX_STALE_SECONDS,
    message: "REFERENCE_TICKER_FIAT_TTL_SECONDS, REFERENCE_TICKER_MAX_STALE_SECONDS değerinden büyük olamaz.",
  },
];

function isKnownSetting(key) {
  return Object.prototype.hasOwnProperty.call(SETTING_DEFS, key);
}

function isInBounds(key, n) {
  if (!isKnownSetting(key)) return false;
  const d = SETTING_DEFS[key];
  return Number.isInteger(n) && n >= d.min && n <= d.max;
}

function clamp(key, n) {
  const d = SETTING_DEFS[key];
  return Math.min(d.max, Math.max(d.min, n));
}

/** Env değeri: geçerli tam sayıysa sınıra kırpılır; geçersiz/boşsa null. */
function envValue(key) {
  const raw = process.env[key];
  if (raw === undefined || raw === null || String(raw).trim() === "") return null;
  const n = Number(raw);
  if (!Number.isInteger(n)) return null;
  return clamp(key, n);
}

/** Etkin değerler (admin override'ları verilerek): { KEY: number }. dynamicDefault yalnız kaynak "default" ise. */
function resolveValues(overrides = {}) {
  const out = {};
  const sources = {};
  for (const key of SETTING_KEYS) {
    const d = SETTING_DEFS[key];
    const env = envValue(key);
    const ov = overrides[key];
    if (ov !== undefined && ov !== null) {
      out[key] = typeof ov === "object" ? ov.value : ov;
      sources[key] = "admin";
    } else if (env !== null) {
      out[key] = env;
      sources[key] = "env";
    } else {
      out[key] = d.default;
      sources[key] = "default";
    }
  }
  for (const key of SETTING_KEYS) {
    const d = SETTING_DEFS[key];
    if (typeof d.dynamicDefault === "function" && sources[key] === "default") {
      out[key] = clamp(key, d.dynamicDefault(out));
    }
  }
  return { values: out, sources };
}

/** Değiştirilen anahtarı ilgilendiren, ihlal edilen ilk kısıtın mesajı ya da null. */
function findConstraintViolation(values, changedKey) {
  for (const c of SETTING_CONSTRAINTS) {
    if (!c.keys.includes(changedKey)) continue;
    if (!c.check(values)) return c.message;
  }
  return null;
}

module.exports = {
  SETTING_GROUPS,
  SETTING_DEFS,
  SETTING_KEYS,
  SETTING_CONSTRAINTS,
  isKnownSetting,
  isInBounds,
  clamp,
  envValue,
  resolveValues,
  findConstraintViolation,
};
