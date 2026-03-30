"use strict";

/**
 * Listings Route — V3 Marketplace Compatibility Feed
 *
 * V3 Notu:
 *   - Protokolün kanonik pazar birimi artık `Listing` değil, `Order`'dır.
 *   - Bu route, eski UI / kart yapıları için uyumluluk katmanı sağlar.
 *   - Yani burada dönen kayıtlar, zincirdeki SELL parent order'ların
 *     listing-benzeri görünümüdür.
 *
 * V3 Kuralı korunur:
 *   - Backend yeni order YARATMAZ
 *   - Backend order CANCEL etmez
 *   - Backend remaining_amount authority değildir
 *   - Bu route yalnızca query/read yüzeyidir
 *
 * YÜKS-20 mirası korunur:
 *   - Deterministik sıralama için her zaman ikincil stabil alan kullanılır.
 */

const express = require("express");
const Joi     = require("joi");
const router  = express.Router();

const { listingsReadLimiter } = require("../middleware/rateLimiter");
const logger                  = require("../utils/logger");
const { getConfig }           = require("../services/protocolConfig");
const Order                   = require("../models/Order");

function _toLegacyListingCard(order) {
  return {
    _id: order._id,
    onchain_order_id: order.onchain_order_id,
    maker_address: order.owner_address,
    crypto_asset: order.market?.crypto_asset || null,
    fiat_currency: order.market?.fiat_currency || null,
    exchange_rate: order.market?.exchange_rate ?? null,
    limits: {
      // [TR] V3'te parent order fiat-limit authority'si yoksa null döner.
      //      Frontend bunu "serbest miktar" / amount-input bazlı deneyim olarak ele alabilir.
      min: null,
      max: null,
    },
    tier_rules: {
      required_tier: order.tier,
      maker_bond_pct: null,
      taker_bond_pct: null,
    },
    status: order.status,
    token_address: order.token_address,
    order_ref: order.refs?.order_ref || null,
    listing_ref: null,
    remaining_amount: order.amounts?.remaining_amount || "0",
    remaining_amount_num: order.amounts?.remaining_amount_num || 0,
    min_fill_amount: order.amounts?.min_fill_amount || "0",
    min_fill_amount_num: order.amounts?.min_fill_amount_num || 0,
    created_at: order.created_at,
    updated_at: order.updated_at,
  };
}

// ─── GET /api/listings/config ─────────────────────────────────────────────────
// [TR] Frontend bond/fee/cooldown oranlarını buradan okur (hard-code değil)
router.get("/config", async (_req, res, next) => {
  try {
    const config = getConfig();
    return res.json({
      bondMap: config.bondMap,
      feeConfig: config.feeConfig || null,
      cooldownConfig: config.cooldownConfig || null,
      tokenConfigs: config.tokenConfigs || {},
    });
  } catch (err) {
    if (err.code === "CONFIG_UNAVAILABLE") {
      return res.status(503).json({ error: err.message });
    }
    next(err);
  }
});

// ─── GET /api/listings ────────────────────────────────────────────────────────
// [TR] V3'te listing feed = açık SELL order feed'i
router.get("/", listingsReadLimiter, async (req, res, next) => {
  try {
    const schema = Joi.object({
      fiat:   Joi.string().valid("TRY", "USD", "EUR").optional(),
      amount: Joi.number().positive().optional(),
      tier:   Joi.number().valid(0, 1, 2, 3, 4).optional(),
      token:  Joi.string().pattern(/^0x[a-fA-F0-9]{40}$/).optional(),
      page:   Joi.number().integer().min(1).default(1),
      limit:  Joi.number().integer().min(1).max(50).default(20),
    });

    const { error, value } = schema.validate(req.query);
    if (error) return res.status(400).json({ error: error.message });

    const filter = {
      side: "SELL_CRYPTO",
      status: { $in: ["OPEN", "PARTIALLY_FILLED"] },
    };

    if (value.fiat) filter["market.fiat_currency"] = value.fiat;
    if (value.tier !== undefined) filter.tier = value.tier;
    if (value.token) filter.token_address = value.token.toLowerCase();

    // [TR] amount filtresi approximate cache üzerinde çalışır.
    //      Nihai enforcement kontrattadır; bu yalnız market sorgu kolaylığı sağlar.
    if (value.amount) {
      filter["amounts.remaining_amount_num"] = { $gte: value.amount };
    }

    const skip = (value.page - 1) * value.limit;
    const orders = await Order.find(filter)
      .sort({ "market.exchange_rate": 1, _id: 1 })
      .skip(skip)
      .limit(value.limit)
      .lean();

    const total = await Order.countDocuments(filter);
    const listings = orders.map(_toLegacyListingCard);

    return res.json({ listings, total, page: value.page, limit: value.limit, source: "V3_ORDER_FEED" });
  } catch (err) {
    next(err);
  }
});

// ─── POST /api/listings ───────────────────────────────────────────────────────
// [TR] V3-native sistemde parent order yaratımı kontrat + /api/orders query yüzeyine taşındı.
router.post("/", (_req, res) => {
  return res.status(410).json({
    error: "V3 ile listing create route kullanımdan kaldırıldı. Yeni akış parent order üzerindendir.",
    code: "LISTINGS_ROUTE_DEPRECATED_IN_V3",
    use: "/api/orders",
  });
});

// ─── DELETE /api/listings/:id ─────────────────────────────────────────────────
// [TR] Backend on-chain order/listing state'ini authoritative biçimde silemez.
router.delete("/:id", (_req, res) => {
  return res.status(410).json({
    error: "V3 ile listing delete route kullanımdan kaldırıldı. İptal akışı kontrat üstünden order cancel ile yürür.",
    code: "LISTINGS_DELETE_DEPRECATED_IN_V3",
    use: "cancelSellOrder / cancelBuyOrder",
  });
});

module.exports = router;
