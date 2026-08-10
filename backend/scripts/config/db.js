// ─── config/db.js ─────────────────────────────────────────────────────────────
"use strict";

const mongoose = require("mongoose");
const logger = require("../utils/logger");

let isConnected = false;
let listenersAttached = false;
let allowProcessExitOnDisconnect = true;

/**
 * MongoDB bağlantısını kurar.
 *
 * ALT-01 Fix: maxPoolSize 10 → 100 olarak güncellendi.
 *   Worker + API trafiğini kaldıracak bağlantı havuzu.
 *
 * ALT-04 Fix: socketTimeoutMS 45000 → 20000.
 *   Proxy timeout altında tutulur.
 *
 * ALT-05 Fix: Disconnected event'inde Fail-Fast stratejisi.
 *   Beklenmeyen MongoDB bağlantı kopmasında process.exit(1).
 *
 * V3:
 *   Parent Order + Child Trade mimarisinden bağımsızdır.
 *   Event replay + order/trade mirror yükü nedeniyle yüksek pool
 *   kapasitesi ve fail-fast yaklaşımı korunur.
 */
async function connectDB() {
  if (isConnected || mongoose.connection.readyState === 1) {
    isConnected = true;
    return mongoose.connection;
  }

  const uri = process.env.MONGODB_URI;

  if (!uri) {
    const error = new Error(
      "MONGODB_URI ortam değişkeni zorunludur."
    );

    logger.error(`[DB] ${error.message}`);

    throw error;
  }

  // [TR] Sorgu davranışını daha öngörülebilir kıl.
  mongoose.set("strictQuery", true);

  try {
    await mongoose.connect(uri, {
      // ALT-01: Worker + API trafiğini kaldıracak bağlantı havuzu
      maxPoolSize: 100,

      // ALT-04: Proxy timeout altında socket timeout
      socketTimeoutMS: 20_000,

      // İlk MongoDB bağlantısı için maksimum bekleme
      serverSelectionTimeoutMS: 5_000,
    });

    isConnected = true;

    // [TR] Kimlik bilgilerini loglamadan MongoDB hedefini göster.
    const safeTarget =
      uri.split("@").pop()?.split("?")[0] || "unknown";

    logger.info(
      `[DB] MongoDB bağlantısı kuruldu: ${safeTarget}`
    );

    if (!listenersAttached) {
      mongoose.connection.on("error", (err) => {
        logger.error(
          `[DB] MongoDB bağlantı hatası: ` +
          `${err?.name || "Error"}: ${err?.message || err}`
        );
      });

      // ALT-05: Beklenmeyen bağlantı kopmasında Fail-Fast.
      mongoose.connection.on("disconnected", () => {
        isConnected = false;

        if (allowProcessExitOnDisconnect) {
          logger.error(
            "[DB] MongoDB bağlantısı koptu — süreç sonlandırılıyor (Fail-Fast)."
          );

          logger.error(
            "[DB] PM2 veya Docker/container orchestration süreci yeniden başlatmalı."
          );

          process.exit(1);
        } else {
          logger.warn(
            "[DB] MongoDB disconnected during graceful shutdown; " +
            "fail-fast exit suppressed."
          );
        }
      });

      listenersAttached = true;
    }

    return mongoose.connection;
  } catch (err) {
    isConnected = false;

    /*
     * KRİTİK:
     * İlk MongoDB bağlantısı kurulamazsa gerçek hatayı logla.
     *
     * Örneğin:
     * - bad auth
     * - authentication failed
     * - querySrv ENOTFOUND
     * - MongoServerSelectionError
     * - TLS/SSL problemi
     * - network timeout
     * - IP access problemi
     */
    logger.error(
      `[DB] MongoDB bağlantısı kurulamadı: ` +
      `${err?.name || "Error"}: ${err?.message || err}`
    );

    if (err?.reason) {
      logger.error(
        `[DB] MongoDB server selection reason: ${err.reason.message || err.reason}`
      );
    }

    throw err;
  }
}

/**
 * Graceful shutdown sırasında MongoDB disconnected event'inin
 * process.exit(1) tetiklemesini engellemek için kullanılır.
 */
function setAllowProcessExitOnDisconnect(allow) {
  allowProcessExitOnDisconnect = Boolean(allow);
}

module.exports = {
  connectDB,
  setAllowProcessExitOnDisconnect,
};
