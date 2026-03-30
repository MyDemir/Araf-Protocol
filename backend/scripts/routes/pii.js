"use strict";

/**
 * PII Route — Active Child Trade PII Access Surface
 *
 * ORTA-07 Fix: PII Token 15 Dakikalık Hayalet Erişim Kapatıldı.
 *   ÖNCEKİ: GET /:tradeId sadece requirePIIToken kontrolüne güveniyordu.
 *   Token alındıktan sonra işlem iptal edilse bile token 15 dk geçerliydi.
 *   ŞİMDİ: Şifre çözme öncesinde anlık statü kontrolü yapılıyor.
 *   Trade LOCKED, PAID veya CHALLENGED değilse erişim reddediliyor.
 *
 * ORTA-08 Fix: taker-name CANCELED/RESOLVED Sonrası Erişim Kapatıldı.
 *   ÖNCEKİ: Sadece LOCKED/PAID/CHALLENGED kontrol ediliyordu.
 *   İşlem bittikten sonra Maker hâlâ Taker ismini görebiliyordu (GDPR/KVKK ihlali).
 *   ŞİMDİ: Aynı allowedStates listesi her iki endpoint'te de uygulanıyor.
 *
 * BACK-05 Fix: PII Token İhracı Log Sızıntısı Azaltıldı.
 *   ÖNCEKİ: Her token isteği logger.info ile tam tradeId ve wallet bilgisiyle loglanıyordu.
 *   ŞİMDİ: Hassas detaylar logdan çıkarıldı — sadece erişim sayısı izleniyor.
 *
 * V3 Notu:
 *   - Bu route parent order değil, gerçek child trade üstünden çalışır.
 *   - LOCKED anında yakalanan snapshot verisi önceliklidir.
 *   - Parent order id'si olsa bile PII reveal kararı child trade state'ine göre verilir.
 */

const express = require("express");
const router  = express.Router();

const { requireAuth, requirePIIToken } = require("../middleware/auth");
const { piiLimiter }                   = require("../middleware/rateLimiter");
const { Trade }                        = require("../models/Trade");
const User                             = require("../models/User");
const { decryptPII, decryptField }     = require("../services/encryption");
const { issuePIIToken }                = require("../services/siwe");
const logger                           = require("../utils/logger");

const ALLOWED_TRADE_STATES = ["LOCKED", "PAID", "CHALLENGED"];

function _isObjectId(ref) {
  return /^[a-fA-F0-9]{24}$/.test(ref);
}

function _isPositiveOnchainId(ref) {
  const n = Number(ref);
  return Number.isInteger(n) && n > 0;
}

async function _findTradeByRef(tradeRef, projection = null) {
  const query = _isObjectId(tradeRef)
    ? { _id: tradeRef }
    : _isPositiveOnchainId(tradeRef)
      ? { onchain_escrow_id: Number(tradeRef) }
      : null;

  if (!query) return null;
  return Trade.findOne(query).select(projection).lean();
}

// ─── GET /api/pii/my ─────────────────────────────────────────────────────────
router.get("/my", requireAuth, piiLimiter, async (req, res, next) => {
  try {
    const user = await User.findOne({ wallet_address: req.wallet })
      .select("pii_data")
      .lean();

    if (!user || !user.pii_data) return res.json({ pii: null });

    const decrypted = await decryptPII(user.pii_data, req.wallet);
    logger.info(`[PII] /my accessed: wallet=${req.wallet.slice(0, 10)}...`);
    return res.json({ pii: decrypted });
  } catch (err) { next(err); }
});

// ─── GET /api/pii/taker-name/:tradeRef ───────────────────────────────────────
router.get("/taker-name/:tradeRef", requireAuth, piiLimiter, async (req, res, next) => {
  try {
    const trade = await _findTradeByRef(
      req.params.tradeRef,
      "maker_address taker_address status pii_snapshot onchain_escrow_id"
    );

    if (!trade) return res.status(404).json({ error: "Trade bulunamadı." });

    if (trade.maker_address !== req.wallet) {
      logger.warn(`[PII] Yetkisiz taker-name erişimi: caller=${req.wallet.slice(0, 10)}...`);
      return res.status(403).json({ error: "Yalnızca satıcı (maker) alıcının ismini görebilir." });
    }

    if (!ALLOWED_TRADE_STATES.includes(trade.status)) {
      return res.status(400).json({
        error: `Taker bilgisi ${trade.status} durumunda alınamaz. Erişim sadece aktif child trade'lerde geçerlidir.`,
      });
    }

    if (!trade.taker_address) return res.json({ bankOwner: null });

    let bankOwner = null;
    if (trade.pii_snapshot?.taker_bankOwner_enc) {
      bankOwner = await decryptField(trade.pii_snapshot.taker_bankOwner_enc, trade.taker_address);
    } else {
      const takerUser = await User.findOne({ wallet_address: trade.taker_address })
        .select("pii_data")
        .lean();
      if (takerUser?.pii_data?.bankOwner_enc) {
        const decrypted = await decryptPII(takerUser.pii_data, trade.taker_address);
        bankOwner = decrypted.bankOwner;
      }
    }

    logger.info(`[PII] taker-name accessed: onchain=#${trade.onchain_escrow_id}`);
    return res.json({ bankOwner });
  } catch (err) { next(err); }
});

// ─── POST /api/pii/request-token/:tradeRef ───────────────────────────────────
router.post("/request-token/:tradeRef", requireAuth, piiLimiter, async (req, res, next) => {
  try {
    const callerWallet = req.wallet;
    const trade = await _findTradeByRef(req.params.tradeRef, "_id onchain_escrow_id taker_address status");

    if (!trade) return res.status(404).json({ error: "Trade bulunamadı." });

    if (trade.taker_address !== callerWallet) {
      logger.warn(`[PII] Yetkisiz token talebi: tradeRef=${String(req.params.tradeRef).slice(0, 8)}...`);
      return res.status(403).json({ error: "Yalnızca taker PII token talep edebilir." });
    }

    if (!ALLOWED_TRADE_STATES.includes(trade.status)) {
      return res.status(400).json({ error: `PII token ${trade.status} durumunda alınamaz.` });
    }

    const piiToken = issuePIIToken(callerWallet, String(trade._id));

    logger.info(`[PII] Token issued (onchain=#${trade.onchain_escrow_id})`);
    return res.json({ piiToken, tradeId: trade._id, onchainEscrowId: trade.onchain_escrow_id });
  } catch (err) { next(err); }
});

// ─── GET /api/pii/:tradeRef ───────────────────────────────────────────────────
router.get("/:tradeRef", requirePIIToken, piiLimiter, async (req, res, next) => {
  try {
    const callerWallet = req.wallet;
    const trade = await _findTradeByRef(
      req.params.tradeRef,
      "maker_address status taker_address pii_snapshot onchain_escrow_id"
    );

    if (!trade) return res.status(404).json({ error: "Trade bulunamadı." });

    if (trade.taker_address !== callerWallet) {
      return res.status(403).json({ error: "Yetkisiz erişim." });
    }

    if (!ALLOWED_TRADE_STATES.includes(trade.status)) {
      return res.status(403).json({
        error: `İşlem artık aktif değil (${trade.status}). PII erişimi kaldırıldı.`,
      });
    }

    let bankOwner = null;
    let iban      = null;
    let telegram  = null;
    if (trade.pii_snapshot?.maker_bankOwner_enc || trade.pii_snapshot?.maker_iban_enc) {
      if (trade.pii_snapshot?.maker_bankOwner_enc) {
        bankOwner = await decryptField(trade.pii_snapshot.maker_bankOwner_enc, trade.maker_address);
      }
      if (trade.pii_snapshot?.maker_iban_enc) {
        iban = await decryptField(trade.pii_snapshot.maker_iban_enc, trade.maker_address);
      }
    } else {
      const makerUser = await User.findOne({ wallet_address: trade.maker_address })
        .select("pii_data")
        .lean();
      if (!makerUser || !makerUser.pii_data) {
        return res.status(404).json({ error: "Satıcı ödeme bilgilerini henüz girmemiş." });
      }
      const decrypted = await decryptPII(makerUser.pii_data, trade.maker_address);
      bankOwner = decrypted.bankOwner;
      iban      = decrypted.iban;
      telegram  = decrypted.telegram;
    }

    logger.info(`[PII] Accessed: onchain=#${trade.onchain_escrow_id}`);

    res.set("Cache-Control", "no-store, max-age=0");
    res.set("Pragma", "no-cache");

    return res.json({
      bankOwner,
      iban,
      telegram,
      notice: "Bu bilgiler şifreli kanaldan iletildi. Blockchain'e veya loglara kaydedilmez.",
    });
  } catch (err) {
    const tradeRef = String(req.params.tradeRef || "");
    if (err.message?.includes("Unsupported state") || err.message?.includes("Invalid auth tag")) {
      logger.error(`[PII] Şifre çözme hatası: tradeRef=${tradeRef.slice(0, 8)}...`);
      return res.status(500).json({ error: "Şifre çözme başarısız. Lütfen daha sonra tekrar deneyin." });
    }
    next(err);
  }
});

module.exports = router;
