"use strict";

/**
 * Receipts Route — Şifreli Dekont Yükleme
 *
 * [TR] Mimari: Dekont gerçek IPFS'e yüklenmez.
 *      Taker'ın yüklediği dosya backend'de AES-256-GCM ile şifrelenir,
 *      şifreli baytlar Trade.evidence.receipt_encrypted alanında saklanır.
 *      Orijinal dosyanın SHA-256 hash'i frontend'e döner;
 *      bu hash reportPayment() kontrat çağrısında ipfsReceiptHash olarak kullanılır.
 *      İşlem RESOLVED/CANCELED → 24 saat, CHALLENGED/BURNED → 30 gün sonra
 *      şifreli veri kalıcı olarak silinir (Unutulma Hakkı / KVKK).
 *
 * [EN] Architecture: Receipt is NOT uploaded to public IPFS.
 *      File is AES-256-GCM encrypted on the backend and stored in
 *      Trade.evidence.receipt_encrypted. The SHA-256 hash of the original
 *      file is returned to the frontend and used as ipfsReceiptHash in the
 *      reportPayment() contract call.
 *      Encrypted data is permanently deleted 24h after RESOLVED/CANCELED,
 *      30 days after CHALLENGED/BURNED (Right to be Forgotten / GDPR).
 *
 * Güvenlik notları / Security notes:
 *   - Şifreleme anahtarı tradeId + taker wallet kombinasyonundan türetilir.
 *     Bu, şifreli veriyi trade'e özgü kılar.
 *   - Encryption key derived from tradeId + taker wallet combination,
 *     making encrypted data trade-scoped.
 *   - Dosya boyutu limiti: 5 MB. MIME: image/* veya application/pdf.
 *   - File size limit: 5 MB. MIME: image/* or application/pdf.
 */

const express = require("express");
const multer  = require("multer");
const crypto  = require("crypto");
const router  = express.Router();

const { requireAuth }        = require("../middleware/auth");
const { tradesLimiter }      = require("../middleware/rateLimiter");
const { Trade }              = require("../models/Trade");
const { encryptBuffer }      = require("../services/encryption");
const logger                 = require("../utils/logger");

// [TR] Dosya yalnızca bellekte tutulur — diske asla yazılmaz
// [EN] File kept in memory only — never written to disk
const upload = multer({
  storage: multer.memoryStorage(),
  limits:  { fileSize: 5 * 1024 * 1024 }, // 5 MB
  fileFilter: (req, file, cb) => {
    const allowed = ["image/jpeg", "image/png", "image/webp", "image/gif", "application/pdf"];
    if (!allowed.includes(file.mimetype)) {
      return cb(new Error(`Desteklenmeyen dosya türü: ${file.mimetype}`));
    }
    cb(null, true);
  },
});

/**
 * POST /api/receipts/upload
 *
 * [TR] Akış:
 *   1. multer → dosya belleğe alınır (req.file.buffer)
 *   2. tradeId doğrulanır; caller taker mı kontrol edilir
 *   3. SHA-256(original buffer) hesaplanır → on-chain'e gidecek hash
 *   4. AES-256-GCM ile şifrele (context: tradeId + taker wallet)
 *   5. Şifreli baytlar Trade.evidence.receipt_encrypted'e yazılır
 *   6. Hash frontend'e döner
 *
 * [EN] Flow:
 *   1. multer → file into memory (req.file.buffer)
 *   2. Validate tradeId; confirm caller is taker
 *   3. SHA-256(original buffer) computed → hash that goes on-chain
 *   4. AES-256-GCM encrypt (context: tradeId + taker wallet)
 *   5. Encrypted bytes written to Trade.evidence.receipt_encrypted
 *   6. Hash returned to frontend
 */
router.post(
  "/upload",
  requireAuth,
  tradesLimiter,
  upload.single("receipt"),
  async (req, res, next) => {
    try {
      // Dosya geldi mi? / Did file arrive?
      if (!req.file || !req.file.buffer) {
        return res.status(400).json({ error: "Dekont dosyası eksik." });
      }

      const { tradeId } = req.body;
      if (!tradeId || !/^[a-fA-F0-9]{24}$/.test(tradeId)) {
        return res.status(400).json({ error: "Geçersiz tradeId formatı." });
      }

      // [TR] Trade'i bul ve caller'ın taker olduğunu doğrula
      // [EN] Find trade and verify caller is the taker
      const trade = await Trade.findById(tradeId).lean();
      if (!trade) {
        return res.status(404).json({ error: "Trade bulunamadı." });
      }
      if (trade.taker_address !== req.wallet) {
        logger.warn(`[Receipt] Yetkisiz yükleme: caller=${req.wallet} taker=${trade.taker_address}`);
        return res.status(403).json({ error: "Yalnızca taker dekont yükleyebilir." });
      }
      if (trade.status !== "LOCKED") {
        return res.status(400).json({ error: `Dekont yalnızca LOCKED durumunda yüklenebilir (mevcut: ${trade.status})` });
      }

      // [TR] SHA-256(orijinal dosya) → kontrata gidecek hash.
      //      "ipfsReceiptHash" alanı adında IPFS yok — sadece ödeme kanıtı referansı.
      // [EN] SHA-256(original file) → hash that goes to the contract.
      //      Field named "ipfsReceiptHash" but there is no IPFS — just a proof reference.
      const fileBuffer = req.file.buffer;
      const receiptHash = crypto
        .createHash("sha256")
        .update(fileBuffer)
        .digest("hex");

      // [TR] AES-256-GCM şifreleme — context: tradeId + taker wallet (trade'e özgü DEK)
      // [EN] AES-256-GCM encryption — context: tradeId + taker wallet (trade-scoped DEK)
      const encryptedHex = await encryptBuffer(fileBuffer, `${tradeId}-${req.wallet}`);

      // [TR] Şifreli veriyi ve hash'i Trade.evidence'a yaz
      // [EN] Write encrypted data and hash to Trade.evidence
      await Trade.findByIdAndUpdate(tradeId, {
        $set: {
          "evidence.receipt_encrypted":  encryptedHex,
          "evidence.ipfs_receipt_hash":  receiptHash,
          "evidence.receipt_timestamp":  new Date(),
        },
      });

      logger.info(`[Receipt] Şifreli dekont kaydedildi: trade=${tradeId} taker=${req.wallet} size=${fileBuffer.length}B`);

      // [TR] Frontend'e sadece hash döner — şifreli baytlar asla istemciye gitmez
      // [EN] Only hash returned to frontend — encrypted bytes never sent to client
      return res.status(201).json({ hash: receiptHash });

    } catch (err) {
      if (err.message?.includes("File too large")) {
        return res.status(413).json({ error: "Dosya boyutu 5 MB'ı aşıyor." });
      }
      if (err.message?.includes("Desteklenmeyen")) {
        return res.status(415).json({ error: err.message });
      }
      next(err);
    }
  }
);

module.exports = router;
