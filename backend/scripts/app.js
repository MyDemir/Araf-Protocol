"use strict";

require("dotenv").config();
const express = require("express");
const helmet = require("helmet");
const cors = require("cors");
const mongoSanitize = require("express-mongo-sanitize");
const mongoose = require("mongoose");
const cookieParser = require("cookie-parser");

// [TR] Yapılandırma ve yardımcı araçlar
// [EN] Configuration and utility helpers
const { connectDB, setAllowProcessExitOnDisconnect } = require("./config/db");
const { connectRedis, closeRedis } = require("./config/redis");
const logger = require("./utils/logger");

// [TR] On-chain event'lerini MongoDB'ye yansıtan servis
// [EN] Service that mirrors on-chain events to MongoDB
const worker = require("./services/eventListener");

// [TR] V3 mutable protocol config'ini startup'ta on-chain'den yükler
// [EN] Loads V3 mutable protocol config from on-chain at startup
const {
  loadProtocolConfig,
  refreshProtocolConfig,
  loadStaleProtocolConfig,
  isProtocolConfigStale,
} = require("./services/protocolConfig");

// [TR] Kısıtlı (degraded) mod: RPC'ye bağlı açılış adımları geçici hatada süreci öldürmez.
// [EN] Degraded mode: RPC-bound boot steps do not kill the process on transient errors.
const serviceMode = require("./services/serviceMode");
const { ROUTE_MOUNTS } = require("./routes/mounts");

// [TR] Çalışma ayarları açılışta yüklenir; modül yüklenirken auditEnvAtStartup() tam bir kez çalışır (tekrar çağrı
//      aynı uyarıları çiftler). Worker da bu süreçte çalıştığı için audit açılışta kesin yapılmış olur.
// [EN] Loading the module runs auditEnvAtStartup() exactly once at process start (worker lives in this process).
require("./services/runtimeSettings");
const { requireFullService } = require("./middleware/requireFullService");
const { getRpcUrls, redactRpcUrl, redactRpcSecrets } = require("./services/rpcProvider");

// [TR] Başarısız event'leri izleyen ve yeniden süren DLQ monitörü
// [EN] DLQ monitor that re-drives failed events
const { processDLQ } = require("./services/dlqProcessor");

// [TR] 90 günlük temiz sayfa kuralını on-chain'de tetikleyen periyodik görev
// [EN] Periodic job that triggers the 90-day clean slate rule on-chain
const { runReputationDecay } = require("./jobs/reputationDecay");
const { runRewardOutcomeRecorder } = require("./jobs/rewardOutcomeRecorder");

// [TR] Günlük V3 order + child-trade istatistik snapshot görevi
// [EN] Daily V3 order + child-trade snapshot job
const { runStatsSnapshot } = require("./jobs/statsSnapshot");


// [TR] Hassas veri retention cleanup job'ları
// [EN] Sensitive data retention cleanup jobs
const {
  runReceiptCleanup,
  runPIISnapshotCleanup,
} = require("./jobs/cleanupSensitiveData");

// [TR] User belgesindeki banka risk metadata'sını prune eder.
//      Amaç: bank_change_history kontrolsüz büyümesin, rolling sayaçlar normalize kalsın.
// [EN] Prunes bank risk metadata in User documents.
const {
  runUserBankRiskMetadataCleanup,
} = require("./jobs/cleanupUserBankRiskMetadata");

const { runReferenceTickerJob } = require("./services/referenceTicker");
const { createReadyHandler, createHealthHandler, invalidateReadinessCache } = require("./services/health");
const { verifyIdentityNormalization } = require("./services/identityNormalizationGuard");
const escrowGuard = require("./services/escrowRegistryGuard");
const { parsePositiveTimerMs } = require("./utils/timeEnv");
const { getAdminWallets } = require("./utils/adminWallets");
const { didScheduledJobSucceed } = require("./utils/schedulerSuccess");

// [TR] Global Express hata yakalayıcı
// [EN] Global Express error handler
const { globalErrorHandler } = require("./middleware/errorHandler");

// [TR] Shutdown sırasında AES master key'i RAM'den sıfırlar
// [EN] Zeroes out AES master key from RAM on shutdown
const {
  clearMasterKeyCache,
  runProductionKmsStartupSelfTest,
  blockKeyLoadingUntilSelfTest,
} = require("./services/encryption");

const app = express();
// [TR] Admin read-only gözlem endpoint'leri için scheduler çalışma zamanını paylaşır.
// [EN] Shared scheduler runtime state for admin read-only observability endpoints.
app.locals.schedulerState = {
  reputationDecayLastRunAt: null,
  rewardRecorderLastRunAt: null,
  statsSnapshotLastRunAt: null,
  sensitiveCleanupLastRunAt: null,
  userBankRiskCleanupLastRunAt: null,
  referenceTickerLastRunAt: null,
  reconciliationLastRunAt: null,
};
let server = null;
let isShuttingDown = false;
const FATAL_EXIT_TIMEOUT_MS = 8_000;

function _envMs(name, fallbackMs) {
  return parsePositiveTimerMs(process.env[name], fallbackMs);
}

function _resolveIdentityGuardMode() {
  const configured = (process.env.IDENTITY_NORMALIZATION_GUARD || "").trim().toLowerCase();
  if (configured) return configured;

  // [TR] Varsayılanı production'da enforce yapıyoruz ki migration unutulursa
  //      sessiz false-negative drift oluşmasın.
  // [EN] Default to enforce in production to avoid silent drift if migration is skipped.
  return process.env.NODE_ENV === "production" ? "enforce" : "warn";
}

// [TR] Proxy arkasında gerçek client IP'yi her ortamda doğru almak için trust proxy.
// [EN] trust proxy so real client IP is preserved behind reverse proxies.
app.set("trust proxy", 1);

// ── Güvenlik Middleware / Security Middleware ────────────────────────────────

app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      scriptSrc: ["'self'"],
      styleSrc: ["'self'", "'unsafe-inline'"],
      imgSrc: ["'self'", "data:", "https:"],
    },
  },
  hsts: process.env.NODE_ENV === "production"
    ? { maxAge: 31536000, includeSubDomains: true, preload: true }
    : false,
}));

const rawAllowedOrigins = process.env.ALLOWED_ORIGINS;
const allowedOrigins = (rawAllowedOrigins || "http://localhost:5173")
  .split(",")
  .map((o) => o.trim())
  .filter((o) => o.length > 0);

function _validateProductionCorsOriginOrThrow(origin) {
  let parsed;
  try {
    parsed = new URL(origin);
  } catch {
    logger.error(`[GÜVENLİK] Geçersiz CORS origin: "${origin}" — URL parse edilemedi.`);
    process.exit(1);
  }

  if (!["http:", "https:"].includes(parsed.protocol)) {
    logger.error(`[GÜVENLİK] Geçersiz CORS origin: "${origin}" — yalnız http/https kabul edilir.`);
    process.exit(1);
  }

  if ((parsed.pathname && parsed.pathname !== "/") || parsed.search || parsed.hash) {
    logger.error(`[GÜVENLİK] Geçersiz CORS origin: "${origin}" — path/query/hash içeremez.`);
    process.exit(1);
  }
}

// [TR] Production'da CORS wildcard ve boş origin engellenir
// [EN] CORS wildcard and empty origins blocked in production
if (process.env.NODE_ENV === "production") {
  // [TR] Production fail-closed:
  //      ALLOWED_ORIGINS explicit tanımlı değilse localhost fallback'e güvenmeyiz.
  // [EN] Do not allow implicit localhost fallback in production.
  if (!rawAllowedOrigins || rawAllowedOrigins.trim().length === 0) {
    logger.error("[GÜVENLİK] ALLOWED_ORIGINS production'da zorunludur (fail-closed).");
    process.exit(1);
  }
  if (allowedOrigins.includes("*")) {
    logger.error("[GÜVENLİK] CORS wildcard (*) production'da kullanılamaz! Sunucu durduruluyor.");
    process.exit(1);
  }
  if (allowedOrigins.length === 0) {
    logger.error("[GÜVENLİK] ALLOWED_ORIGINS boş! En az bir origin tanımlayın.");
    process.exit(1);
  }
  if (allowedOrigins.length === 1 && allowedOrigins[0] === "http://localhost:5173") {
    logger.error("[GÜVENLİK] Production'da localhost fallback origin kullanılamaz.");
    process.exit(1);
  }
  for (const origin of allowedOrigins) {
    _validateProductionCorsOriginOrThrow(origin);
  }
  logger.info(`[CORS] İzin verilen origin'ler: ${allowedOrigins.join(", ")}`);
}

app.use(cors({
  origin: allowedOrigins,
  credentials: true,
  methods: ["GET", "POST", "PUT", "DELETE"],
}));

app.use(express.json({ limit: "50kb" }));

// [TR] JWT ve refresh token'ı httpOnly cookie'den okumak için
// [EN] Required to read JWT and refresh token from httpOnly cookie
app.use(cookieParser());

app.use(mongoSanitize({
  replaceWith: "_",
  onSanitize: ({ key }) => logger.warn(`[GÜVENLİK] Mongo injection denemesi engellendi: ${key}`),
}));

// ── Bootstrap ────────────────────────────────────────────────────────────────

async function bootstrap() {
  let dlqInterval = null;
  let reputationDecayDelay = null;
  let reputationDecayInterval = null;
  let rewardRecorderInterval = null;
  let statsSnapshotDelay = null;
  let statsSnapshotInterval = null;
  let sensitiveCleanupDelay = null;
  let sensitiveCleanupInterval = null;
  let userBankRiskCleanupDelay = null;
  let userBankRiskCleanupInterval = null;
  let referenceTickerInterval = null;
  let reconciliationInterval = null;
  let recoveryLoop = null;

  // [TR] Zincire/RPC'ye bağlı job'lar kısıtlı modda ATLANIR (zincir durumunu riske atmamak için).
  // [EN] Chain-bound jobs are skipped while degraded.
  const CHAIN_BOUND_JOBS = new Set(["dlq", "reputationDecay", "rewardRecorder", "reconciliation"]);

  // [TR] Aynı job'ın üst üste binmesini engelleyen hafif scheduler lock'ları.
  // [EN] Lightweight scheduler locks to prevent overlapping runs.
  const jobLocks = {
    dlq: false,
    reputationDecay: false,
    rewardRecorder: false,
    statsSnapshot: false,
    sensitiveCleanup: false,
    userBankRiskCleanup: false,
    referenceTicker: false,
    reconciliation: false,
  };

  const clearRuntimeSchedulers = () => {
    if (dlqInterval) clearInterval(dlqInterval);
    if (reputationDecayDelay) clearTimeout(reputationDecayDelay);
    if (reputationDecayInterval) clearInterval(reputationDecayInterval);
    if (rewardRecorderInterval) clearInterval(rewardRecorderInterval);
    if (statsSnapshotDelay) clearTimeout(statsSnapshotDelay);
    if (statsSnapshotInterval) clearInterval(statsSnapshotInterval);
    if (sensitiveCleanupDelay) clearTimeout(sensitiveCleanupDelay);
    if (sensitiveCleanupInterval) clearInterval(sensitiveCleanupInterval);
    if (userBankRiskCleanupDelay) clearTimeout(userBankRiskCleanupDelay);
    if (userBankRiskCleanupInterval) clearInterval(userBankRiskCleanupInterval);
    if (referenceTickerInterval) clearInterval(referenceTickerInterval);
    if (reconciliationInterval) clearInterval(reconciliationInterval);
    if (recoveryLoop) recoveryLoop.stop();
    escrowGuard.stop();
  };

  /**
   * [TR] Job overlap engelleyici koruma katmanı.
   *      Aynı job henüz bitmemişse bir sonraki tick atlanır.
   *
   * [EN] Prevents overlapping job execution.
   *      If the same job is still running, the next tick is skipped.
   */
  const runScheduledJob = async (jobKey, jobFn, onSuccess) => {
    if (CHAIN_BOUND_JOBS.has(jobKey) && serviceMode.isDegraded()) return;
    // [TR] Escrow bekçisi (enforce + uyumsuz): zincire bağlı işler atlanır; degraded'dan ayrı bayrak.
    if (CHAIN_BOUND_JOBS.has(jobKey) && escrowGuard.isBlocking()) {
      const skipped = `escrow_registry_${escrowGuard.getBlockReason()}`;
      logger.warn(`[Scheduler] ${jobKey} atlandı (${skipped}).`);
      return { success: true, skipped };
    }
    if (jobLocks[jobKey]) {
      logger.warn(`[Scheduler] ${jobKey} hâlâ çalışıyor — bu tick atlandı.`);
      return;
    }

    jobLocks[jobKey] = true;
    try {
      const result = await jobFn();
      const isSuccess = didScheduledJobSucceed(result);
      if (isSuccess && typeof onSuccess === "function") {
        onSuccess();
      } else if (!isSuccess) {
        logger.warn(`[Scheduler] ${jobKey} completed with unsuccessful result contract.`);
      }
    } catch (err) {
      logger.error(`[Scheduler] ${jobKey} başarısız: ${err.message}`, { stack: err.stack });
    } finally {
      jobLocks[jobKey] = false;
    }
  };

  /**
   * [TR] Hassas veri retention cleanup tek bir wrapper altında çalıştırılır.
   *      Böylece scheduler tarafında tek job gibi yönetilir.
   *
   * [EN] Sensitive-data retention cleanup runs under one wrapper,
   *      so the scheduler treats it as a single job.
   */
  const runSensitiveCleanupBundle = async () => {
    const receipt = await runReceiptCleanup();
    const pii = await runPIISnapshotCleanup();
    return {
      success: didScheduledJobSucceed(receipt) && didScheduledJobSucceed(pii),
    };
  };

  const shutdown = async ({ signal = "UNKNOWN", exitCode = 0, reason = null }) => {
    if (isShuttingDown) {
      logger.warn(`[ORCHESTRATOR] Shutdown zaten devam ediyor (${signal}). İkinci tetikleme yok sayıldı.`);
      return;
    }
    isShuttingDown = true;

    const isFatal = exitCode !== 0;
    if (isFatal) {
      logger.error(`[ORCHESTRATOR] FATAL shutdown başlatıldı (${signal}). Exit code=${exitCode}; restart bekleniyor.`);
      if (reason) {
        logger.error("[ORCHESTRATOR] FATAL nedeni:", reason);
      }
    } else {
      logger.info(`[ORCHESTRATOR] Graceful shutdown başlatıldı (${signal}). Exit code=${exitCode}; restart beklenmiyor.`);
    }

    clearMasterKeyCache();
    clearRuntimeSchedulers();

    const forceExitTimer = setTimeout(() => {
      logger.error(`[ORCHESTRATOR] Shutdown timeout (${FATAL_EXIT_TIMEOUT_MS}ms) aşıldı. process.exit(${exitCode}) zorlanıyor.`);
      process.exit(exitCode);
    }, FATAL_EXIT_TIMEOUT_MS);

    try {
      if (server && server.listening) {
        await new Promise((resolve) => server.close(resolve));
        logger.warn("[ORCHESTRATOR] Yeni istek kabulü durduruldu (server.close).");
      } else {
        logger.warn("[ORCHESTRATOR] HTTP sunucusu henüz dinlemede değil; yeni istek akışı yok.");
      }

      await worker.stop();
      logger.info("[ORCHESTRATOR] Worker stop tamamlandı.");

      if (mongoose.connection.readyState !== 0) {
        setAllowProcessExitOnDisconnect(false);
        await mongoose.connection.close();
        logger.info("[ORCHESTRATOR] MongoDB bağlantısı kapatıldı.");
      }

      await closeRedis();
    } catch (shutdownErr) {
      logger.error("[ORCHESTRATOR] Shutdown sırasında hata oluştu:", {
        message: shutdownErr.message,
        stack: shutdownErr.stack,
      });
    } finally {
      clearTimeout(forceExitTimer);
      logger.warn(`[ORCHESTRATOR] Shutdown tamamlandı. process.exit(${exitCode}) çağrılıyor.`);
      process.exit(exitCode);
    }
  };

  // [TR] Fatal process event'leri orchestration uyumlu şekilde kapatılır.
  // [EN] Fatal process events trigger orchestrator-friendly forced exit semantics.
  process.on("uncaughtException", (err) => {
    shutdown({
      signal: "uncaughtException",
      exitCode: 1,
      reason: { message: err.message, stack: err.stack },
    });
  });

  process.on("unhandledRejection", (reason) => {
    shutdown({
      signal: "unhandledRejection",
      exitCode: 1,
      reason: { reason },
    });
  });

  try {
    // [TR] Production'da SIWE_DOMAIN localhost olamaz
    // [EN] SIWE_DOMAIN cannot be localhost in production
    if (process.env.NODE_ENV === "production") {
      const siweDomain = process.env.SIWE_DOMAIN;
      if (!siweDomain || siweDomain === "localhost") {
        logger.error("[GÜVENLİK] SIWE_DOMAIN production'da 'localhost' olamaz! Gerçek domain ayarlayın.");
        process.exit(1);
      }
    }

    // [TR] SEC-01 + KMS: RPC GEÇİCİ hatasında kısıtlı moda düşer (anahtar yüklenmez, PII kapalı).
    //      ChainGuard/yanlış zincir/bilinmeyen hata => bugünkü gibi çıkış (fail-closed).
    const completedRpcSteps = new Set();
    const enterDegradedBoot = (step, err) => {
      const first = serviceMode.enterDegraded("rpc_unavailable_at_boot");
      if (first) {
        const urls = getRpcUrls().map((u) => redactRpcUrl(u)).join(", ") || "n/a";
        logger.warn(`[Degraded] Açılışta RPC'ye ulaşılamadı (adım=${step}, rpc=${urls}); KISITLI modda açılıyor. Neden: ${redactRpcSecrets(err?.message)}`);
      }
    };
    try {
      await runProductionKmsStartupSelfTest();
      completedRpcSteps.add("sec01_kms");
    } catch (err) {
      if (serviceMode.classifyStartupError(err) !== "transient") throw err;
      blockKeyLoadingUntilSelfTest();
      enterDegradedBoot("sec01_kms", err);
    }

    await connectDB();
    await connectRedis();
    logger.info("MongoDB ve Redis bağlantıları başarıyla sağlandı.");

    // [TR] Startup guard default'u production'da enforce:
    //      mixed identity ile sessiz bozuk runtime'a izin vermiyoruz.
    // [EN] Startup guard defaults to enforce in production to prevent silent drift.
    await verifyIdentityNormalization({
      mode: _resolveIdentityGuardMode(),
    });

    // [TR] Escrow kayıt bekçisi: tek Mongo okuması (asla fırlatmaz). enforce+uyumsuz ise worker başlatılmaz.
    //      Varsayılan mod warn: yalnız log + /ready bilgi alanı.
    await escrowGuard.check();

    // [TR] V3 mutable protocol config mirror'ı yüklenir.
    //      Config yüklenemiyorsa server tamamen çökmez; route'lar CONFIG_UNAVAILABLE dönebilir.
    // [EN] V3 mutable protocol config mirror is loaded here.
    if (serviceMode.isDegraded()) {
      // [TR] RPC zaten erişilemez: tekrar vurma; Redis'teki son bilinen config'i BAYAT işaretiyle yükle.
      if (await loadStaleProtocolConfig()) {
        serviceMode.setConfigStale(true);
        logger.warn("[Degraded] Protocol config Redis'teki son bilinen kopyadan yüklendi (BAYAT olabilir).");
      }
    } else {
      try {
        await loadProtocolConfig();
        completedRpcSteps.add("protocol_config");
      } catch (err) {
        if (serviceMode.classifyStartupError(err) !== "transient") throw err;
        enterDegradedBoot("protocol_config", err);
        if (await loadStaleProtocolConfig()) {
          serviceMode.setConfigStale(true);
          logger.warn("[Degraded] Protocol config Redis'teki son bilinen kopyadan yüklendi (BAYAT olabilir).");
        }
      }
    }

    // [TR] Toparlanma adımları (sıra önemli): SEC-01 + KMS anahtarı -> protocol config -> worker.
    // [EN] Recovery steps (order matters): SEC-01 + KMS key -> protocol config -> worker.
    const recoverySteps = [
      { name: "sec01_kms", run: () => runProductionKmsStartupSelfTest() },
      {
        name: "protocol_config",
        // [TR] BİLİNÇLİ FARK: açılışta strictTokens=false (loadProtocolConfig; eksik token "desteklenmiyor" olarak
        //      yüklenir, servis ayağa kalkar). Toparlanmada strictTokens=true (refreshProtocolConfig): tek token
        //      okuması bile başarısızsa adım başarısız sayılır; böylece kısmi/bozuk bir config "tam hizmet"e
        //      çıkarılmaz. Null/bayat sonuç da başarısızdır: configStale temizlenmez, döngü yeniden dener.
        run: async () => {
          const cfg = await refreshProtocolConfig();
          const addr = process.env.ARAF_ESCROW_ADDRESS;
          const expectsConfig = Boolean(addr) && addr !== "0x0000000000000000000000000000000000000000";
          if (expectsConfig && (!cfg || isProtocolConfigStale())) {
            const err = new Error("[Degraded] Protocol config zincirden tazelenemedi (null/bayat); yeniden denenecek.");
            err.code = "CONFIG_STALE_RETRY";
            throw err;
          }
        },
      },
      {
        name: "worker",
        // [TR] Yalnız toparlanma döngüsü başlatır (açılış yolu worker.start()'ı beklemez, B19).
        run: () => {
          // [TR] Escrow bekçisi engelliyorsa worker başlatılmaz; bekçi uyumlu olunca onChange başlatır.
          if (escrowGuard.isBlocking()) return Promise.resolve();
          return worker.start().catch(async (err) => {
            await worker.stop().catch(() => {});
            throw err;
          });
        },
      },
    ];
    const startRecoveryLoop = () => {
      if (recoveryLoop) return;
      recoveryLoop = serviceMode.createRecoveryLoop({
        steps: recoverySteps,
        completed: completedRpcSteps,
        onRecovered: () => invalidateReadinessCache(),
        onFatal: (err) => shutdown({ signal: "degradedRecoveryFatal", exitCode: 1, reason: { message: err?.message } }),
      });
      recoveryLoop.start();
    };

    // [TR] B19: worker.start() (bağlan + replay) burada AWAIT EDİLMEZ; HTTP önce dinlemeye başlar, replay arka
    //      planda sürer ve /ready "replaying" raporlar. Başlatma app.listen'den sonra yapılır.
    // [EN] B19: worker.start() (connect + replay) is NOT awaited here; HTTP starts listening first, the replay
    //      continues in the background and /ready reports "replaying". Startup happens after app.listen.

    // [TR] DLQ monitörü — her 60 saniyede başarısız event'leri kontrol eder
    // [EN] DLQ monitor — checks failed events every 60 seconds
    const DLQ_INTERVAL_MS = _envMs("JOB_DLQ_INTERVAL_MS", 60_000);
    const REPUTATION_DECAY_DELAY_MS = _envMs("JOB_REPUTATION_DECAY_DELAY_MS", 30_000);
    const REPUTATION_DECAY_INTERVAL_MS = _envMs("JOB_REPUTATION_DECAY_INTERVAL_MS", 24 * 60 * 60 * 1000);
    const REWARD_RECORDER_INTERVAL_MS = _envMs("JOB_REWARD_RECORDER_INTERVAL_MS", 60 * 60 * 1000);
    const STATS_SNAPSHOT_DELAY_MS = _envMs("JOB_STATS_SNAPSHOT_DELAY_MS", 60_000);
    const STATS_SNAPSHOT_INTERVAL_MS = _envMs("JOB_STATS_SNAPSHOT_INTERVAL_MS", 24 * 60 * 60 * 1000);
    const SENSITIVE_CLEANUP_DELAY_MS = _envMs("JOB_SENSITIVE_CLEANUP_DELAY_MS", 120_000);
    const SENSITIVE_CLEANUP_INTERVAL_MS = _envMs("JOB_SENSITIVE_CLEANUP_INTERVAL_MS", 30 * 60 * 1000);
    const USER_BANK_RISK_CLEANUP_DELAY_MS = _envMs("JOB_USER_BANK_RISK_CLEANUP_DELAY_MS", 150_000);
    const USER_BANK_RISK_CLEANUP_INTERVAL_MS = _envMs("JOB_USER_BANK_RISK_CLEANUP_INTERVAL_MS", 6 * 60 * 60 * 1000);
    const RECONCILIATION_INTERVAL_MS = _envMs("JOB_RECONCILIATION_INTERVAL_MS", 10 * 60 * 1000);

    dlqInterval = setInterval(() => {
      runScheduledJob("dlq", processDLQ);
    }, DLQ_INTERVAL_MS);

    // [TR] İlk çalıştırma 30 sn geciktirilir — cold start'ta DB'ye eş zamanlı yük binmesini önler
    // [EN] First run delayed by 30s — prevents simultaneous DB load on cold start
    // [TR] schedulerState *LastRunAt yalnız job başarı sözleşmesi true olduğunda güncellenir.
    // [EN] schedulerState *LastRunAt is updated only when job success contract resolves true.
    reputationDecayDelay = setTimeout(() => {
      runScheduledJob("reputationDecay", runReputationDecay, () => {
        app.locals.schedulerState.reputationDecayLastRunAt = new Date().toISOString();
      });
      logger.info("Periyodik İtibar İyileştirme görevi zamanlandı (her 24 saatte bir).");
    }, REPUTATION_DECAY_DELAY_MS);

    reputationDecayInterval = setInterval(() => {
      runScheduledJob("reputationDecay", runReputationDecay, () => {
        app.locals.schedulerState.reputationDecayLastRunAt = new Date().toISOString();
      });
    }, REPUTATION_DECAY_INTERVAL_MS);

    // [TR] Proof of Peace kaydı saatlik tetiklenir; kayıt penceresi (epoch sonu + claimDelay) kaçırılmaz.
    // [EN] Proof of Peace recording is triggered hourly so the recording window is never missed.
    rewardRecorderInterval = setInterval(() => {
      runScheduledJob("rewardRecorder", runRewardOutcomeRecorder, () => {
        app.locals.schedulerState.rewardRecorderLastRunAt = new Date().toISOString();
      });
    }, REWARD_RECORDER_INTERVAL_MS);

    statsSnapshotDelay = setTimeout(() => {
      runScheduledJob("statsSnapshot", runStatsSnapshot, () => {
        app.locals.schedulerState.statsSnapshotLastRunAt = new Date().toISOString();
      });
      logger.info("Periyodik V3 istatistik snapshot görevi zamanlandı (her 24 saatte bir).");
    }, STATS_SNAPSHOT_DELAY_MS);

    statsSnapshotInterval = setInterval(() => {
      runScheduledJob("statsSnapshot", runStatsSnapshot, () => {
        app.locals.schedulerState.statsSnapshotLastRunAt = new Date().toISOString();
      });
    }, STATS_SNAPSHOT_INTERVAL_MS);

    // [TR] Hassas veri retention cleanup — her 30 dakikada bir
    //      Trade üzerindeki:
    //        - şifreli dekont payload
    //        - PII snapshot
    //        - lock anındaki banka risk snapshot metadata
    //      süre dolunca temizlenir.
    // [EN] Sensitive-data retention cleanup every 30 minutes.
    sensitiveCleanupDelay = setTimeout(() => {
      runScheduledJob("sensitiveCleanup", runSensitiveCleanupBundle, () => {
        app.locals.schedulerState.sensitiveCleanupLastRunAt = new Date().toISOString();
      });
      logger.info("Receipt/PII snapshot retention cleanup görevi zamanlandı (her 30 dakikada bir).");
    }, SENSITIVE_CLEANUP_DELAY_MS);

    sensitiveCleanupInterval = setInterval(() => {
      runScheduledJob("sensitiveCleanup", runSensitiveCleanupBundle, () => {
        app.locals.schedulerState.sensitiveCleanupLastRunAt = new Date().toISOString();
      });
    }, SENSITIVE_CLEANUP_INTERVAL_MS);

    // [TR] User bank risk metadata prune — her 6 saatte bir
    //      Amaç:
    //        - bank_change_history dizisini 30 günlük pencere içinde tutmak
    //        - bankChangeCount7d / bankChangeCount30d alanlarını normalize etmek
    //        - kullanıcı bazlı risk metadata'nın gereksiz büyümesini önlemek
    //
    // [EN] User bank risk metadata prune every 6 hours.
    userBankRiskCleanupDelay = setTimeout(() => {
      runScheduledJob("userBankRiskCleanup", runUserBankRiskMetadataCleanup, () => {
        app.locals.schedulerState.userBankRiskCleanupLastRunAt = new Date().toISOString();
      });
      logger.info("User bank risk metadata cleanup görevi zamanlandı (her 6 saatte bir).");
    }, USER_BANK_RISK_CLEANUP_DELAY_MS);

    userBankRiskCleanupInterval = setInterval(() => {
      runScheduledJob("userBankRiskCleanup", runUserBankRiskMetadataCleanup, () => {
        app.locals.schedulerState.userBankRiskCleanupLastRunAt = new Date().toISOString();
      });
    }, USER_BANK_RISK_CLEANUP_INTERVAL_MS);

    const REFERENCE_TICKER_REFRESH_INTERVAL_MS = _envMs("REFERENCE_TICKER_REFRESH_INTERVAL_MS", 120_000);

    // [TR] Referans kur şeridi scheduler'ı bilgilendirme amaçlıdır; settlement akışını etkilemez.
    // [EN] Reference ticker scheduler is informational-only and isolated from settlement flows.
    runScheduledJob("referenceTicker", runReferenceTickerJob, () => {
      app.locals.schedulerState.referenceTickerLastRunAt = new Date().toISOString();
    }).catch((err) => logger.warn(`[Scheduler] referenceTicker startup refresh failed: ${err.message}`));

    referenceTickerInterval = setInterval(() => {
      runScheduledJob("referenceTicker", runReferenceTickerJob, () => {
        app.locals.schedulerState.referenceTickerLastRunAt = new Date().toISOString();
      });
    }, REFERENCE_TICKER_REFRESH_INTERVAL_MS);
    const reconciliationEnabled = process.env.NODE_ENV === "production"
      ? String(process.env.JOB_RECONCILIATION_ENABLED || "true").toLowerCase() !== "false"
      : String(process.env.JOB_RECONCILIATION_ENABLED || "false").toLowerCase() === "true";

    if (reconciliationEnabled) {
      reconciliationInterval = setInterval(() => {
        runScheduledJob("reconciliation", () => worker.runReconciliationReport(), () => {
          app.locals.schedulerState.reconciliationLastRunAt = new Date().toISOString();
        });
      }, RECONCILIATION_INTERVAL_MS);
      logger.info(`[Scheduler] reconciliation report zamanlandı (${RECONCILIATION_INTERVAL_MS}ms).`);
    }


    // [TR] Rotalar DB ve Redis hazır olduktan sonra yüklenir
    // [EN] Routes loaded after DB and Redis are ready

    // [TR] Kısıtlı modda varsayılan-kapalı kapı: izin listesi dışındaki her /api ucu 503 SERVICE_DEGRADED.
    app.use("/api", requireFullService);

    // [TR] Router'lar tek kaynaktan (routes/mounts.js) bağlanır; log rotası listenin başındadır.
    for (const { path: mountPath, file } of ROUTE_MOUNTS) {
      app.use(mountPath, require(`./routes/${file}`));
    }

    // [TR] /health: worker "son blok görülme" eşiğine bağlı liveness (B6). /ready: önbellekli, kimliksiz
    //      görünüm redakte; ayrıntı yalnız READY_INTERNAL_TOKEN ile (B27).
    // [EN] /health: liveness tied to the worker last-block threshold (B6). /ready: cached, redacted for
    //      unauthenticated callers; full detail only with READY_INTERNAL_TOKEN (B27).
    app.get("/health", createHealthHandler({ worker }));

    app.get("/ready", createReadyHandler({ worker, getProvider: () => worker.provider }));

    app.use((_req, res) => res.status(404).json({ error: "İstenen endpoint bulunamadı" }));
    app.use(globalErrorHandler);

    // [TR] ADMIN_WALLETS boşsa kimse admin değildir (menü/panel hiç açılmaz): açılışta tek uyarı. Adres listelenmez.
    // [EN] Empty ADMIN_WALLETS means nobody is admin (panel never opens): one startup warning. No addresses logged.
    if (getAdminWallets().length === 0) {
      logger.warn("[Config] ADMIN_WALLETS boş veya tanımsız: hiçbir cüzdan admin değil, /api/admin/* tüm isteklere 403 döner. Fly secret olarak tanımlayın (virgülle ayrılmış 0x adresleri).");
    }

    const PORT = process.env.PORT || 4000;
    server = app.listen(PORT, () => {
      logger.info("===========================================================");
      logger.info(`🚀 Araf Protocol Backend Dinleniyor: Port ${PORT}`);
      logger.info(`🌍 Ortam: ${process.env.NODE_ENV || "development"}`);
      logger.info("🧭 Mimari: V3-native Order + Child Trade backend mirror");
      logger.info("🛡️  Güvenlik: Non-custodial backend (opsiyonel automation signer olabilir).");
      logger.info("🧹 Retention: receipt / PII snapshot / bank risk metadata cleanup aktif");
      logger.info("===========================================================");
    });

    const startWorkerInBackground = () => worker.startInBackground({
      onFatal: (err) => {
        if (serviceMode.classifyStartupError(err) === "transient") {
          completedRpcSteps.add("sec01_kms");
          completedRpcSteps.add("protocol_config");
          enterDegradedBoot("worker", err);
          worker.stop().catch(() => {});
          startRecoveryLoop();
          return;
        }
        shutdown({ signal: "workerStart", exitCode: 1, reason: { message: err.message, stack: err.stack } });
      },
    }).then(() => {
      if (worker.isRunning) {
        logger.info("Event Listener aktif: V3 Order + Child Trade topology izleniyor.");
      } else {
        logger.warn(`[Worker] Event Listener aktif değil. state=${worker._state || "unknown"}`);
      }
    });

    if (serviceMode.isDegraded()) {
      // [TR] Kısıtlı mod: worker burada BAŞLATILMAZ; tek toparlanma döngüsü RPC gelince başlatır.
      startRecoveryLoop();
    } else if (escrowGuard.isBlocking()) {
      logger.error(`[EscrowRegistryGuard] Worker BAŞLATILMADI (enforce, reason=${escrowGuard.getBlockReason()}).`);
    } else {
      startWorkerInBackground();
    }

    // [TR] Bekçi durum değişimi: engel başlarsa çalışan worker durdurulur; kalkarsa (ve degraded değilse) başlatılır.
    //      Periyodik yeniden kontrol (varsayılan 60 sn); off modunda okuma yapılmaz.
    escrowGuard.setOnChange(async ({ blocking, reason }) => {
      invalidateReadinessCache();
      if (blocking) {
        await worker.stop();
        logger.error(`[EscrowRegistryGuard] Worker durduruldu (reason=${reason}).`);
      } else if (!serviceMode.isDegraded() && !worker.isRunning && !isShuttingDown) {
        logger.info("[EscrowRegistryGuard] Kayıt uyumlu; worker başlatılıyor.");
        startWorkerInBackground();
      }
    });
    escrowGuard.start(_envMs("ESCROW_REGISTRY_GUARD_INTERVAL_MS", 60_000));

    process.on("SIGTERM", () => shutdown({ signal: "SIGTERM", exitCode: 0 }));
    process.on("SIGINT", () => shutdown({ signal: "SIGINT", exitCode: 0 }));
  } catch (err) {
    logger.error("Uygulama başlatılırken kritik hata oluştu:", {
      message: err.message,
      stack: err.stack,
    });
    process.exit(1);
  }
}

bootstrap();

module.exports = app;
module.exports._resolveIdentityGuardMode = _resolveIdentityGuardMode;
module.exports._envMs = _envMs;
