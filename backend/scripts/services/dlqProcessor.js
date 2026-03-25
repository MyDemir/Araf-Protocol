"use strict";

/**
 * DLQ Processor — Dead Letter Queue Monitor
 *
 * Başarısız event'ler eventListener tarafından Redis DLQ'ya rPush ile yazılır.
 * rPush: Yeni entry'ler listenin SONUNA eklenir.
 *   → index 0 = en eski event (ilk giren)
 *   → index -1 = en yeni event (son giren)
 *
 * KRİT-03 Fix: LIFO/FIFO Ters Mantık Düzeltildi.
 *   ÖNCEKİ: lRange(DLQ_KEY, -overflow, -1) kullanılıyordu.
 *     -overflow:-1 = listenin SONU = EN YENİ event'ler arşive gidiyordu!
 *     lTrim(DLQ_KEY, 0, MAX_DLQ_SIZE - 1) = BAŞTA kalan ESKİ/BOZUK event'ler
 *     sonsuza DLQ'da kalıyor, hiç retry edilmiyordu.
 *     Kritik yeni event'ler (EscrowReleased, EscrowBurned) yutuluyordu.
 *   ŞİMDİ: lRange(DLQ_KEY, 0, overflow - 1) = listenin BAŞI = EN ESKİ event'ler
 *     arşive taşınıyor. lTrim(DLQ_KEY, overflow, -1) = baştan kesiliyor.
 *     FIFO düzeni sağlandı: İlk giren, ilk işlenen.
 *
 * app.js tarafından setInterval(() => processDLQ({ retryHandler }), 60_000) ile çağrılır.
 */

const { getRedisClient } = require("../config/redis");
const logger             = require("../utils/logger");

const DLQ_KEY           = "worker:dlq";
const DLQ_ARCHIVE_KEY   = "worker:dlq:archive"; // İnceleme için arşiv (7 gün TTL)
const ALERT_THRESHOLD   = 5;   // Bu sayının üzerinde entry varsa uyarı ver
const MAX_DLQ_SIZE      = 100; // DLQ'da tutulan maksimum entry sayısı
const ALERT_COOLDOWN_MS = 10 * 60 * 1000; // Alert cooldown: 10 dakika
const MAX_RETRY_ATTEMPTS = 5;
const RETRY_BASE_DELAY_MS = 30 * 1000;

// [TR] Son alert zamanı — cooldown için bellekte tutulur
let _lastAlertTimestamp = 0;

/**
 * DLQ'yu kontrol eder, loglar, arşivler ve gerekirse kırpar.
 *
 * Akış:
 * 1. DLQ uzunluğunu kontrol et
 * 2. MAX_DLQ_SIZE'dan fazlaysa EN ESKİ entry'leri arşive taşı (FIFO — KRİT-03)
 * 3. Kuyruğun başındaki 10 entry'yi logla ve sil
 * 4. Eşik aşıldıysa ve cooldown geçtiyse uyarı ver
 */
function _calculateNextRetryAt(attempt) {
  const delay = RETRY_BASE_DELAY_MS * Math.max(1, attempt);
  return new Date(Date.now() + delay).toISOString();
}

async function processDLQ({ retryHandler } = {}) {
  try {
    const redis  = getRedisClient();
    const length = await redis.lLen(DLQ_KEY);

    if (length === 0) {
      logger.debug("[DLQ] Kuyruk temiz.");
      return;
    }

    logger.warn(`[DLQ] ${length} işlenemeyen event bulundu.`);

    // KRİT-03 Fix: MAX_DLQ_SIZE aşıldığında EN ESKİ entry'leri arşive taşı
    if (length > MAX_DLQ_SIZE) {
      const overflow = length - MAX_DLQ_SIZE;

      // [TR] lRange(0, overflow-1) = listenin BAŞI = EN ESKİ entry'ler
      // [EN] lRange(0, overflow-1) = list HEAD = OLDEST entries
      const oldEntries = await redis.lRange(DLQ_KEY, 0, overflow - 1);

      if (oldEntries.length > 0) {
        const multi = redis.multi();

        // [TR] Eski entry'leri arşive taşı
        for (const entry of oldEntries) {
          multi.lPush(DLQ_ARCHIVE_KEY, entry);
        }

        // [TR] Arşivi sınırlı tut (max 1000 entry)
        multi.lTrim(DLQ_ARCHIVE_KEY, 0, 999);

        // [TR] Arşiv TTL: 7 gün
        multi.expire(DLQ_ARCHIVE_KEY, 7 * 24 * 3600);

        // KRİT-03 Fix: Ana DLQ'yu BAŞTAN kes — EN ESKİ entry'ler gitti
        // ÖNCEKİ: lTrim(DLQ_KEY, 0, MAX_DLQ_SIZE - 1) = başı tutuyordu (YANLIŞ)
        // ŞİMDİ:  lTrim(DLQ_KEY, overflow, -1) = baştan kes (DOĞRU FIFO)
        multi.lTrim(DLQ_KEY, overflow, -1);

        await multi.exec();

        logger.info(`[DLQ] ${oldEntries.length} eski entry arşive taşındı, DLQ ${MAX_DLQ_SIZE}'a kırpıldı.`);
      }
    }

    // [TR] Kuyruğun başındaki 10 entry'yi işle (FIFO — en eski önce)
    const entries = await redis.lRange(DLQ_KEY, 0, 9);
    let processedCount = 0;
    let requeuedCount = 0;
    let quarantinedCount = 0;

    for (const raw of entries) {
      let entry = null;
      try {
        entry = JSON.parse(raw);
      } catch {
        logger.error(`[DLQ] Ham entry parse edilemedi: ${raw}`);
        processedCount += 1;
        continue;
      }

      const attempt = Number(entry.attempt || 0) + 1;
      const nowIso = new Date().toISOString();
      if (entry.next_retry_at && entry.next_retry_at > nowIso) {
        // Henüz retry zamanı değil — kuyruğun sonuna bırak
        await redis.rPush(DLQ_KEY, raw);
        processedCount += 1;
        requeuedCount += 1;
        continue;
      }

      const canRetry = typeof retryHandler === "function";
      let success = false;
      if (canRetry) {
        success = await retryHandler(entry);
      } else {
        logger.warn("[DLQ] retryHandler tanımlı değil — fallback gözlem modunda.");
      }

      if (success) {
        processedCount += 1;
        logger.info(`[DLQ] Re-drive başarılı: ${entry.eventName} tx=${entry.txHash}`);
        continue;
      }

      if (attempt >= MAX_RETRY_ATTEMPTS) {
        const quarantined = {
          ...entry,
          attempt,
          quarantined_at: nowIso,
          last_error: entry.error || "retry_handler_failed",
        };
        await redis.lPush(DLQ_ARCHIVE_KEY, JSON.stringify(quarantined));
        await redis.lTrim(DLQ_ARCHIVE_KEY, 0, 999);
        await redis.expire(DLQ_ARCHIVE_KEY, 7 * 24 * 3600);
        processedCount += 1;
        quarantinedCount += 1;
        logger.error(`[DLQ] Quarantine'a taşındı: ${entry.eventName} tx=${entry.txHash} attempts=${attempt}`);
        continue;
      }

      const requeued = {
        ...entry,
        attempt,
        next_retry_at: _calculateNextRetryAt(attempt),
        last_error: entry.error || "retry_handler_failed",
      };
      await redis.rPush(DLQ_KEY, JSON.stringify(requeued));
      processedCount += 1;
      requeuedCount += 1;
      logger.warn(`[DLQ] Retry başarısız, yeniden kuyruğa alındı: ${entry.eventName} tx=${entry.txHash} attempt=${attempt}`);
    }

    if (processedCount > 0) {
      // [TR] İşlenen girişleri baştan sil (FIFO)
      await redis.lTrim(DLQ_KEY, processedCount, -1);
      logger.info(
        `[DLQ] İşlenen=${processedCount} requeue=${requeuedCount} quarantine=${quarantinedCount}`
      );
    }

    // [TR] Alert cooldown — aynı uyarı 10 dakikada bir kez
    if (length >= ALERT_THRESHOLD) {
      const now = Date.now();
      if (now - _lastAlertTimestamp >= ALERT_COOLDOWN_MS) {
        _lastAlertTimestamp = now;
        logger.error(
          `[DLQ] ⚠ KRİTİK: DLQ'da ${length} event birikti! Manuel müdahale gerekebilir.`
        );
        // TODO: Slack/PagerDuty webhook buraya eklenecek
        // await sendAlert(`DLQ kritik seviye: ${length} işlenemeyen event`);
      }
    }
  } catch (err) {
    logger.error(`[DLQ] Processor hatası: ${err.message}`, { stack: err.stack });
  }
}

module.exports = { processDLQ };
