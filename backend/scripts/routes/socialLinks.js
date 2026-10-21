"use strict";

const express = require("express");
const { asyncHandler } = require("../utils/asyncHandler");
const router = express.Router();
const { marketReadLimiter } = require("../middleware/rateLimiter");
const socialLinks = require("../services/socialLinks");

// [TR] Herkese açık, kimliksiz okuma: yalnız enabled linkler {label,url}. DB yoksa/hata olursa boş liste
//      (frontend build-time env'e düşer). Kısa önbellek.
// [EN] Public unauthenticated read: enabled links only. Empty list when DB is unavailable.
router.get("/", marketReadLimiter, asyncHandler(async (_req, res, next) => {
  try {
    const links = await socialLinks.getPublicLinks();
    res.set("Cache-Control", "public, max-age=30");
    return res.json({ links });
  } catch (err) {
    return next(err);
  }
}));

module.exports = router;
