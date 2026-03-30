"use strict";

/**
 * Stats Route — V3 Protokol İstatistikleri
 *
 * ORTA-13 Fix: İstatistiklerde Matematiksel Yanıltma Düzeltildi.
 *   previous === 0 veya null ise yüzde değişim yerine null döner.
 *
 * V3 Notu:
 *   - Çekirdek metrik artık `active_listings` değildir.
 *   - Parent order ve child trade ekseni baz alınır.
 *   - Bu route authority üretmez; HistoricalStat snapshot'larını sunar.
 */

const express = require("express");
const router  = express.Router();

const { getRedisClient } = require("../config/redis");
const logger             = require("../utils/logger");
const HistoricalStat     = require("../models/HistoricalStat");

const STATS_CACHE_KEY = "cache:protocol_stats:v3";
const STATS_CACHE_TTL = 3600;

function calculateChange(current, previous) {
  if (previous == null || previous === 0) return null;
  if (typeof current !== "number" || Number.isNaN(current)) return null;
  return parseFloat((((current - previous) / Math.abs(previous)) * 100).toFixed(1));
}

router.get("/", async (_req, res, next) => {
  try {
    const redis = getRedisClient();

    const cachedStats = await redis.get(STATS_CACHE_KEY);
    if (cachedStats) {
      logger.debug("[Stats] V3 önbellekten sunuldu.");
      return res.json({ stats: JSON.parse(cachedStats) });
    }

    const currentStatsDoc = await HistoricalStat.findOne().sort({ date: -1 }).lean();
    if (!currentStatsDoc) {
      return res.json({ stats: {} });
    }

    const { _id, date, __v, created_at, ...currentStats } = currentStatsDoc;

    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
    const dateString30d = thirtyDaysAgo.toISOString().split("T")[0];

    const oldStats = await HistoricalStat.findOne({ date: dateString30d }).lean();

    const changes_30d = {};
    if (oldStats) {
      changes_30d.executed_volume_usdt_pct = calculateChange(currentStats.executed_volume_usdt, oldStats.executed_volume_usdt);
      changes_30d.completed_trades_pct = calculateChange(currentStats.completed_trades, oldStats.completed_trades);
      changes_30d.child_trade_count_pct = calculateChange(currentStats.child_trade_count, oldStats.child_trade_count);
      changes_30d.active_child_trades_pct = calculateChange(currentStats.active_child_trades, oldStats.active_child_trades);
      changes_30d.open_sell_orders_pct = calculateChange(currentStats.open_sell_orders, oldStats.open_sell_orders);
      changes_30d.open_buy_orders_pct = calculateChange(currentStats.open_buy_orders, oldStats.open_buy_orders);
      changes_30d.partially_filled_orders_pct = calculateChange(currentStats.partially_filled_orders, oldStats.partially_filled_orders);
      changes_30d.filled_orders_pct = calculateChange(currentStats.filled_orders, oldStats.filled_orders);
      changes_30d.canceled_orders_pct = calculateChange(currentStats.canceled_orders, oldStats.canceled_orders);
      changes_30d.burned_bonds_usdt_pct = calculateChange(currentStats.burned_bonds_usdt, oldStats.burned_bonds_usdt);
    }

    const finalStats = { ...currentStats, changes_30d };
    await redis.setEx(STATS_CACHE_KEY, STATS_CACHE_TTL, JSON.stringify(finalStats));

    return res.json({ stats: finalStats });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
