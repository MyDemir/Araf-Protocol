"use strict";

/**
 * Stats Route — V3 Protokol İstatistikleri
 *
 * V3 ile birlikte istatistik dili de değişti:
 *   - active_listings yerine open_sell_orders / open_buy_orders
 *   - trade sayıları artık child trade lifecycle'ı üzerinden okunur
 *   - order ve child trade metrikleri ayrı ayrı raporlanır
 */

const express = require("express");
const { asyncHandler } = require("../utils/asyncHandler");
const router = express.Router();
const { statsReadLimiter } = require("../middleware/rateLimiter");
const { getRedisClient } = require("../config/redis");
const HistoricalStat = require("../models/HistoricalStat");
const logger = require("../utils/logger");

const STATS_CACHE_KEY = "cache:protocol_stats:v3";
const STATS_CACHE_TTL = 300; // [TR] 1 saat yerine 5 dakika — freshness / drift görünürlüğü için daha güvenli.

// [TR] B3-07: yanıt alanları açık beyaz liste (HistoricalStat şeması); modele eklenecek iç alan sızmaz.
const STATS_RESPONSE_FIELDS = [
  "total_volume_usdt", "total_volume_usdt_str",
  "executed_volume_usdt", "executed_volume_usdt_str",
  "completed_trades", "child_trade_count", "active_child_trades",
  "open_sell_orders", "open_buy_orders", "partially_filled_orders",
  "filled_orders", "canceled_orders",
  "burned_bonds_usdt", "burned_bonds_usdt_str",
  "avg_trade_hours",
];

function calculateChange(current, previous) {
  if (previous == null || previous === 0) return null;
  if (typeof current !== "number" || Number.isNaN(current)) return null;
  return parseFloat((((current - previous) / Math.abs(previous)) * 100).toFixed(1));
}

// [TR] Stats endpoint'i public read yüzeyidir; dedicated lightweight bucket ile ayrıştırılır.
// [EN] Stats endpoint is public read surface with dedicated lightweight bucket.
router.get("/", statsReadLimiter, asyncHandler(async (_req, res, next) => {
  try {
    // [TR] B3-07: Redis/cache hatası cache-aside'da yutulur; DB'ye düşülür (public yüzey ayakta kalır).
    let redis = null;
    try { redis = getRedisClient(); } catch (redisErr) { logger.warn(`[Stats] Redis istemcisi alınamadı: ${redisErr.message}`); }
    if (redis) {
      try {
        const cachedStats = await redis.get(STATS_CACHE_KEY);
        if (cachedStats) return res.json({ stats: JSON.parse(cachedStats) });
      } catch (cacheErr) {
        logger.warn(`[Stats] Cache okunamadı, DB'ye düşülüyor: ${cacheErr.message}`);
      }
    }

    const currentStatsDoc = await HistoricalStat.findOne().sort({ date: -1 }).lean();
    if (!currentStatsDoc) return res.json({ stats: {} });

    const currentStats = {};
    for (const k of STATS_RESPONSE_FIELDS) {
      if (currentStatsDoc[k] !== undefined) currentStats[k] = currentStatsDoc[k];
    }
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
    const dateString30d = thirtyDaysAgo.toISOString().split("T")[0];
    const oldStats = await HistoricalStat.findOne({ date: dateString30d }).lean();

    const changes_30d = {};
    if (oldStats) {
      const fields = [
        "total_volume_usdt",
        "executed_volume_usdt",
        "completed_trades",
        "open_sell_orders",
        "open_buy_orders",
        "partially_filled_orders",
        "active_child_trades",
        "child_trade_count",
        "filled_orders",
        "canceled_orders",
        "burned_bonds_usdt",
      ];
      for (const field of fields) {
        changes_30d[`${field}_pct`] = calculateChange(currentStats[field], oldStats[field]);
      }
    }

    // [TR] Approximate alanların yanına string-safe analytics alanlarını da döndürüyoruz.
    //      Frontend isterse approximate sayıyı gösterir, isterse raw string alanları da kullanabilir.
    const finalStats = {
      ...currentStats,
      changes_30d,
      meta: {
        cache_ttl_seconds: STATS_CACHE_TTL,
        open_order_semantics: "OPEN + PARTIALLY_FILLED",
        numeric_fields_are_approximate: true,
      },
    };

    if (redis) {
      try {
        await redis.setEx(STATS_CACHE_KEY, STATS_CACHE_TTL, JSON.stringify(finalStats));
      } catch (cacheErr) {
        logger.warn(`[Stats] Cache yazılamadı: ${cacheErr.message}`);
      }
    }
    return res.json({ stats: finalStats });
  } catch (err) { next(err); }
}));

module.exports = router;
