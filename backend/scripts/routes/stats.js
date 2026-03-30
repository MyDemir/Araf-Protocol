"use strict";

/**
 * Stats Route — V3 Protokol İstatistikleri
 *
 * V3 notu:
 *   Bu route artık V2 listing-merkezli metrik üretmez.
 *   Parent order + child trade mimarisinde dashboard/read-model şu iki eksenden beslenir:
 *
 *     1. Order katmanı  → open sell / open buy / partial fill yükü
 *     2. Child trade    → completed trades / active trades / executed volume
 *
 *   Kritik ilke korunur:
 *   - Bu route authority üretmez.
 *   - Yanıt, HistoricalStat snapshot koleksiyonunun okunabilir özetidir.
 *   - Ekonomik enforcement veya canlı protokol kararı için kullanılmaz.
 *
 * ORTA-13 Fix korunur:
 *   - previous === 0 veya previous == null ise yüzde değişim null döner
 *   - Frontend null değeri "—" veya "Yeni" gibi gösterebilir
 */

const express = require("express");
const router  = express.Router();

const { getRedisClient } = require("../config/redis");
const logger             = require("../utils/logger");
const HistoricalStat     = require("../models/HistoricalStat");

const STATS_CACHE_KEY = "cache:protocol_stats:v3";
const STATS_CACHE_TTL = 3600; // 1 saat

/**
 * ORTA-13 Fix: Güvenli yüzde değişim hesaplama.
 *
 * @param {number} current  - Güncel değer
 * @param {number} previous - Önceki değer (0, null veya undefined olabilir)
 * @returns {number|null}
 *   - Geçerli karşılaştırma varsa: yüzde değişim (örn: 12.5 = %12.5)
 *   - Karşılaştırma yapılamıyorsa: null
 */
function calculateChange(current, previous) {
  if (previous == null || previous === 0) return null;
  if (typeof current !== "number" || Number.isNaN(current)) return null;
  return parseFloat((((current - previous) / Math.abs(previous)) * 100).toFixed(1));
}

/**
 * V3 convenience helper.
 *
 * [TR] Route seviyesinde yalnız okunabilir toplamlar üretir; authority değildir.
 * [EN] Produces read-only aggregate conveniences at route level; not authoritative.
 */
function buildDerivedStats(doc = {}) {
  const openSellOrders = Number(doc.open_sell_orders || 0);
  const openBuyOrders = Number(doc.open_buy_orders || 0);
  const partiallyFilledOrders = Number(doc.partially_filled_orders || 0);
  const activeChildTrades = Number(doc.active_child_trades || 0);
  const completedTrades = Number(doc.completed_trades || 0);

  return {
    open_orders_total: openSellOrders + openBuyOrders,
    open_sell_orders: openSellOrders,
    open_buy_orders: openBuyOrders,
    partially_filled_orders: partiallyFilledOrders,
    active_child_trades: activeChildTrades,
    completed_trades: completedTrades,
  };
}

/**
 * 30 gün önceki snapshot tarihini YYYY-MM-DD olarak döndürür.
 */
function getDateStringDaysAgo(days) {
  const d = new Date();
  d.setDate(d.getDate() - days);
  return d.toISOString().split("T")[0];
}

// ── GET /api/stats ─────────────────────────────────────────────────────────────
router.get("/", async (req, res, next) => {
  try {
    const redis = getRedisClient();

    // 1. Önbelleği kontrol et
    const cachedStats = await redis.get(STATS_CACHE_KEY);
    if (cachedStats) {
      logger.debug("[Stats] V3 stats önbellekten sunuldu.");
      return res.json({ stats: JSON.parse(cachedStats) });
    }

    logger.debug("[Stats] V3 stats önbelleği boş, yeniden hesaplanıyor...");

    // 2. En son snapshot'ı çek
    const currentStatsDoc = await HistoricalStat.findOne().sort({ date: -1 }).lean();
    if (!currentStatsDoc) {
      return res.json({ stats: {} });
    }

    const {
      _id,
      date,
      __v,
      created_at,
      ...currentStats
    } = currentStatsDoc;

    // 3. 30 gün önceki snapshot'ı çek
    const oldStats = await HistoricalStat.findOne({ date: getDateStringDaysAgo(30) }).lean();

    // 4. V3 derived görünüm
    const derived = buildDerivedStats(currentStats);

    // 5. 30 günlük güvenli kıyaslar
    const changes_30d = {};
    if (oldStats) {
      changes_30d.total_volume_usdt_pct = calculateChange(
        currentStats.total_volume_usdt,
        oldStats.total_volume_usdt
      );
      changes_30d.executed_volume_usdt_pct = calculateChange(
        currentStats.executed_volume_usdt,
        oldStats.executed_volume_usdt
      );
      changes_30d.completed_trades_pct = calculateChange(
        currentStats.completed_trades,
        oldStats.completed_trades
      );
      changes_30d.child_trade_count_pct = calculateChange(
        currentStats.child_trade_count,
        oldStats.child_trade_count
      );
      changes_30d.active_child_trades_pct = calculateChange(
        currentStats.active_child_trades,
        oldStats.active_child_trades
      );
      changes_30d.open_sell_orders_pct = calculateChange(
        currentStats.open_sell_orders,
        oldStats.open_sell_orders
      );
      changes_30d.open_buy_orders_pct = calculateChange(
        currentStats.open_buy_orders,
        oldStats.open_buy_orders
      );
      changes_30d.partially_filled_orders_pct = calculateChange(
        currentStats.partially_filled_orders,
        oldStats.partially_filled_orders
      );
      changes_30d.filled_orders_pct = calculateChange(
        currentStats.filled_orders,
        oldStats.filled_orders
      );
      changes_30d.canceled_orders_pct = calculateChange(
        currentStats.canceled_orders,
        oldStats.canceled_orders
      );
      changes_30d.burned_bonds_usdt_pct = calculateChange(
        currentStats.burned_bonds_usdt,
        oldStats.burned_bonds_usdt
      );
      changes_30d.avg_trade_hours_pct = calculateChange(
        currentStats.avg_trade_hours,
        oldStats.avg_trade_hours
      );
      changes_30d.open_orders_total_pct = calculateChange(
        derived.open_orders_total,
        Number(oldStats.open_sell_orders || 0) + Number(oldStats.open_buy_orders || 0)
      );
    }

    const finalStats = {
      schema_version: currentStats.snapshot_version || "v3",
      snapshot_date: date,
      order_metrics: {
        open_sell_orders: currentStats.open_sell_orders,
        open_buy_orders: currentStats.open_buy_orders,
        open_orders_total: derived.open_orders_total,
        partially_filled_orders: currentStats.partially_filled_orders,
        filled_orders: currentStats.filled_orders,
        canceled_orders: currentStats.canceled_orders,
      },
      trade_metrics: {
        total_volume_usdt: currentStats.total_volume_usdt,
        executed_volume_usdt: currentStats.executed_volume_usdt,
        completed_trades: currentStats.completed_trades,
        child_trade_count: currentStats.child_trade_count,
        active_child_trades: currentStats.active_child_trades,
        resolved_child_trades: currentStats.resolved_child_trades,
        canceled_child_trades: currentStats.canceled_child_trades,
        burned_child_trades: currentStats.burned_child_trades,
        burned_bonds_usdt: currentStats.burned_bonds_usdt,
        avg_trade_hours: currentStats.avg_trade_hours,
      },
      changes_30d,
    };

    // 6. Önbelleğe al ve döndür
    await redis.setEx(STATS_CACHE_KEY, STATS_CACHE_TTL, JSON.stringify(finalStats));

    return res.json({ stats: finalStats });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
