"use strict";
/**
 * Feedback Route
 */
const express = require("express");
const Joi = require("joi");
const { asyncHandler } = require("../utils/asyncHandler");
const router = express.Router();
const { requireAuth: _requireAuth, requireSessionWalletMatch: _requireSessionWalletMatch } = require("../middleware/auth");
// [TR] B2-17: async auth middleware'leri de reddi next(err)'e iletecek şekilde sarılır.
const requireAuth = asyncHandler(_requireAuth);
const requireSessionWalletMatch = asyncHandler(_requireSessionWalletMatch);
const { feedbackLimiter } = require("../middleware/rateLimiter");
const Feedback = require("../models/Feedback");
const logger = require("../utils/logger");
// [TR] B3-06: serbest metin kaydedilmeden önce IBAN/e-posta/uzun sayı/token maskelenir. logs.js'i import etmek
//      clientLogLimiter bağımlılığı getireceğinden (route izolasyonu) burada yerel, daha dar bir maskeleme var.
function maskFeedbackPii(text) {
  return String(text)
    .replace(/\b[A-Z]{2}\d{2}(?:\s?[A-Z0-9]{4}){2,7}(?:\s?[A-Z0-9]{1,4})?\b/gi, "[REDACTED]")
    .replace(/\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}\b/g, "[REDACTED]")
    .replace(/\b\d{9,}\b/g, "[REDACTED]")
    .replace(/(bearer\s+)[a-zA-Z0-9\-._~+/]+=*/gi, "$1[REDACTED]")
    .replace(/\beyJ[^\s]+/g, "[REDACTED]");
}
router.post("/", requireAuth, requireSessionWalletMatch, feedbackLimiter, asyncHandler(async (req, res, next) => {
  try {
    const schema = Joi.object({ rating: Joi.number().integer().min(1).max(5).required(), comment: Joi.string().max(1000).allow("").optional(), category: Joi.string().valid("bug", "suggestion", "ui/ux", "other").required() });
    const { error, value } = schema.validate(req.body);
    if (error) return res.status(400).json({ error: error.message });
    await Feedback.create({ wallet_address: req.wallet, rating: value.rating, comment: maskFeedbackPii(value.comment || ""), category: value.category });
    logger.info(`[Feedback] ${String(req.wallet).slice(0, 10)}... → ${value.rating}/5 [${value.category}]`);
    return res.status(201).json({ success: true, message: "Geri bildirim alındı, teşekkürler!" });
  } catch (err) { next(err); }
}));
module.exports = router;
module.exports.maskFeedbackPii = maskFeedbackPii;
