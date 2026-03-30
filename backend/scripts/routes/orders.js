"use strict";

/**
 * Orders Route — V3 Parent Order Read Surface
 *
 * Bu route yalnızca query / dashboard / market read-model yüzeyidir.
 * Parent order create/fill/cancel state transition'ları kontratta olur.
 * Backend bu route üzerinden authoritative işlem üretmez.
 */

const express = require("express");
const Joi     = require("joi");
const router  = express.Router();

const { requireAuth } = require("../middleware/auth");
const { listingsReadLimiter, tradesLimiter } = require("../middleware/rateLimiter");
const Order = require("../models/Order");
const { Trade } = require("../models/Trade");

const SAFE_ORDER_PROJECTION = [
  "_id",
  "onchain_order_id",
  "owner_address",
  "side",
  "status",
  "tier",
  "token_address",
  "market",
  "amounts",
  "reserves",
  "fee_snapshot",
  "refs.order_ref",
  "stats.child_trade_count",
  "stats.last_fill_tx_hash",
  "timers",
  "created_at",
  "updated_at",
].join(" ");

// ─── GET /api/orders ──────────────────────────────────────────────────────────
router.get("/", listingsReadLimiter, async (req, res, next) => {
  try {
    const schema = Joi.object({
      side:   Joi.string().valid("SELL_CRYPTO", "BUY_CRYPTO").optional(),
      status: Joi.string().valid("OPEN", "PARTIALLY_FILLED", "FILLED", "CANCELED").optional(),
      tier:   Joi.number().valid(0, 1, 2, 3, 4).optional(),
      token:  Joi.string().pattern(/^0x[a-fA-F0-9]{40}$/).optional(),
      page:   Joi.number().integer().min(1).default(1),
      limit:  Joi.number().integer().min(1).max(50).default(20),
    });

    const { error, value } = schema.validate(req.query);
    if (error) return res.status(400).json({ error: error.message });

    const filter = {};
    if (value.side) filter.side = value.side;
    if (value.status) filter.status = value.status;
    if (value.tier !== undefined) filter.tier = value.tier;
    if (value.token) filter.token_address = value.token.toLowerCase();

    const skip = (value.page - 1) * value.limit;
    const orders = await Order.find(filter)
      .select(SAFE_ORDER_PROJECTION)
      .sort({ created_at: -1, _id: -1 })
      .skip(skip)
      .limit(value.limit)
      .lean();

    const total = await Order.countDocuments(filter);
    return res.json({ orders, total, page: value.page, limit: value.limit });
  } catch (err) {
    next(err);
  }
});

// ─── GET /api/orders/my ───────────────────────────────────────────────────────
router.get("/my", requireAuth, tradesLimiter, async (req, res, next) => {
  try {
    const orders = await Order.find({ owner_address: req.wallet })
      .select(SAFE_ORDER_PROJECTION)
      .sort({ created_at: -1, _id: -1 })
      .lean();

    return res.json({ orders });
  } catch (err) {
    next(err);
  }
});

// ─── GET /api/orders/history ──────────────────────────────────────────────────
router.get("/history", requireAuth, tradesLimiter, async (req, res, next) => {
  try {
    const schema = Joi.object({
      page:  Joi.number().integer().min(1).default(1),
      limit: Joi.number().integer().min(1).max(50).default(10),
    });
    const { error, value } = schema.validate(req.query);
    if (error) return res.status(400).json({ error: error.message });

    const filter = {
      owner_address: req.wallet,
      status: { $in: ["FILLED", "CANCELED"] },
    };

    const skip = (value.page - 1) * value.limit;
    const orders = await Order.find(filter)
      .select(SAFE_ORDER_PROJECTION)
      .sort({ "timers.filled_at": -1, "timers.canceled_at": -1, _id: -1 })
      .skip(skip)
      .limit(value.limit)
      .lean();

    const total = await Order.countDocuments(filter);
    return res.json({ orders, total, page: value.page, limit: value.limit });
  } catch (err) {
    next(err);
  }
});

// ─── GET /api/orders/by-order/:onchainId ─────────────────────────────────────
router.get("/by-order/:onchainId", requireAuth, tradesLimiter, async (req, res, next) => {
  try {
    const onchainId = Number(req.params.onchainId);
    if (!Number.isInteger(onchainId) || onchainId <= 0) {
      return res.status(400).json({ error: "Geçersiz on-chain order ID formatı." });
    }

    const order = await Order.findOne({ onchain_order_id: onchainId })
      .select(SAFE_ORDER_PROJECTION)
      .lean();

    if (!order) return res.status(404).json({ error: "Order bulunamadı." });

    // [TR] Order market feed kamusal olabilir; fakat kullanıcı paneli route'larında stricter auth korunur.
    return res.json({ order });
  } catch (err) {
    next(err);
  }
});

// ─── GET /api/orders/:id/children ─────────────────────────────────────────────
router.get("/:id/children", requireAuth, tradesLimiter, async (req, res, next) => {
  try {
    if (!/^[a-fA-F0-9]{24}$/.test(req.params.id)) {
      return res.status(400).json({ error: "Geçersiz order ID formatı." });
    }

    const order = await Order.findById(req.params.id).select("owner_address onchain_order_id").lean();
    if (!order) return res.status(404).json({ error: "Order bulunamadı." });
    if (order.owner_address !== req.wallet) {
      return res.status(403).json({ error: "Erişim reddedildi." });
    }

    const trades = await Trade.find({ parent_order_id: order.onchain_order_id })
      .select("_id onchain_escrow_id parent_order_id trade_origin parent_order_side maker_address taker_address status tier financials timers created_at updated_at")
      .sort({ created_at: -1, _id: -1 })
      .lean();

    return res.json({ trades });
  } catch (err) {
    next(err);
  }
});

// ─── GET /api/orders/:id ──────────────────────────────────────────────────────
router.get("/:id", requireAuth, tradesLimiter, async (req, res, next) => {
  try {
    if (!/^[a-fA-F0-9]{24}$/.test(req.params.id)) {
      return res.status(400).json({ error: "Geçersiz order ID formatı." });
    }

    const order = await Order.findById(req.params.id)
      .select(SAFE_ORDER_PROJECTION)
      .lean();

    if (!order) return res.status(404).json({ error: "Order bulunamadı." });
    if (order.owner_address !== req.wallet) {
      return res.status(403).json({ error: "Erişim reddedildi." });
    }

    return res.json({ order });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
