"use strict";

/**
 * Receipts Route — Child Trade Scoped Encrypted Receipt Upload
 *
 * V3'te dekont parent order'a değil, gerçek child trade'e yazılır.
 * Bu yüzden bütün guard'lar onchainEscrowId / taker_address / LOCKED child trade state'i üstünde uygulanır.
 */

const express = require("express");
const { parsePositiveOnchainId: _parsePositiveOnchainId } = require("../utils/onchain");
const multer = require("multer");
const crypto = require("crypto");
const path = require("path");
const fs = require("fs");
const os = require("os");
const { asyncHandler } = require("../utils/asyncHandler");
const router = express.Router();

const { requireAuth: _requireAuth, requireSessionWalletMatch: _requireSessionWalletMatch } = require("../middleware/auth");
// [TR] B2-17: async auth middleware'leri de reddi next(err)'e iletecek şekilde sarılır.
const requireAuth = asyncHandler(_requireAuth);
const requireSessionWalletMatch = asyncHandler(_requireSessionWalletMatch);
const { receiptUploadLimiter } = require("../middleware/rateLimiter");
const { encryptField } = require("../services/encryption");
const Trade = require("../models/Trade");
const logger = require("../utils/logger");
const { promises: fsp } = fs;

const tmpDir = path.join(os.tmpdir(), "araf-receipts");
if (!fs.existsSync(tmpDir)) fs.mkdirSync(tmpDir, { recursive: true });

const storage = multer.diskStorage({
  destination: (_req, _file, cb) => cb(null, tmpDir),
  filename: (_req, _file, cb) => cb(null, `${Date.now()}-${crypto.randomBytes(8).toString("hex")}`),
});

const upload = multer({
  storage,
  limits: { fileSize: 5 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    const allowed = ["image/jpeg", "image/png", "image/webp", "image/gif", "application/pdf"];
    if (!allowed.includes(file.mimetype)) {
      const err = new Error("UNSUPPORTED_MIME");
      err.code = "UNSUPPORTED_MIME";
      return cb(err);
    }
    cb(null, true);
  },
});

const MAGIC_BYTES_BY_MIME = {
  "image/jpeg": [(buf) => buf.length >= 3 && buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff],
  "image/png": [(buf) => buf.length >= 8 && buf.subarray(0, 8).equals(Buffer.from("89504e470d0a1a0a", "hex"))],
  "image/webp": [(buf) => buf.length >= 12 && buf.subarray(0, 4).toString("ascii") === "RIFF" && buf.subarray(8, 12).toString("ascii") === "WEBP"],
  "image/gif": [(buf) => buf.length >= 6 && (buf.subarray(0, 6).toString("ascii") === "GIF87a" || buf.subarray(0, 6).toString("ascii") === "GIF89a")],
  "application/pdf": [(buf) => buf.length >= 5 && buf.subarray(0, 5).toString("ascii") === "%PDF-"],
};



function _buildIdentityLookup(idString) {
  return { onchain_escrow_id: idString };
}

async function validateFileMagicBytes(filePath, mimeType) {
  const validators = MAGIC_BYTES_BY_MIME[mimeType];
  if (!validators?.length) return false;
  const handle = await fsp.open(filePath, "r");
  try {
    const header = Buffer.alloc(16);
    const { bytesRead } = await handle.read(header, 0, header.length, 0);
    const used = header.subarray(0, bytesRead);
    return validators.some((fn) => fn(used));
  } finally { await handle.close(); }
}

async function encryptFileFromDisk(filePath, wallet) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    const stream = fs.createReadStream(filePath, { encoding: "base64" });
    stream.on("data", (chunk) => chunks.push(chunk));
    stream.on("end", async () => {
      try {
        const base64Content = chunks.join("");
        const encryptedHex = await encryptField(base64Content, wallet);
        const sha256Hash = crypto.createHash("sha256").update(encryptedHex).digest("hex");
        resolve({ encryptedHex, sha256Hash });
      } catch (err) { reject(err); }
    });
    stream.on("error", reject);
  });
}

// [TR] Receipt upload write-adjacent coordination yüzeyidir; generic trade-room bucket'tan ayrıdır.
// [EN] Receipt upload is write-adjacent coordination, isolated from generic room-read bucket.
router.post("/upload", requireAuth, requireSessionWalletMatch, receiptUploadLimiter, upload.single("receipt"), asyncHandler(async (req, res, next) => {
  const tempFilePath = req.file?.path;
  try {
    if (!req.file) return res.status(400).json({ error: "Dekont dosyası eksik veya boş." });

    const onchainId = _parsePositiveOnchainId(req.body?.onchainEscrowId);
    if (!onchainId) {
      return res.status(400).json({ error: "Geçersiz veya eksik onchainEscrowId." });
    }

    const signatureOk = await validateFileMagicBytes(tempFilePath, req.file.mimetype);
    if (!signatureOk) return res.status(415).json({ error: "Dosya içeriği bildirilen MIME tipiyle eşleşmiyor." });

    const { encryptedHex, sha256Hash } = await encryptFileFromDisk(tempFilePath, req.wallet);

    const updatedTrade = await Trade.findOneAndUpdate(
      {
        ..._buildIdentityLookup(onchainId),
        taker_address: req.wallet,
        status: "LOCKED",
        "evidence.receipt_encrypted": null,
      },
      {
        $set: {
          "evidence.receipt_encrypted": encryptedHex,
          "evidence.ipfs_receipt_hash": sha256Hash,
          "evidence.receipt_timestamp": new Date(),
          "evidence.receipt_delete_at": new Date(Date.now() + 30 * 24 * 3600 * 1000),
        },
      },
      { new: false }
    );

    if (!updatedTrade) {
      const existing = await Trade.findOne(_buildIdentityLookup(onchainId))
        .select("taker_address status evidence.receipt_encrypted")
        .lean();
      if (!existing) return res.status(404).json({ error: `#${onchainId} numaralı trade bulunamadı.` });
      if (existing.taker_address !== req.wallet) return res.status(403).json({ error: "Yalnızca taker dekont yükleyebilir." });
      if (existing.evidence?.receipt_encrypted) return res.status(409).json({ error: "Bu işlem için dekont zaten yüklendi. Üzerine yazılamaz." });
      if (existing.status !== "LOCKED") {
        return res.status(400).json({ error: `Dekont yalnızca LOCKED durumunda yüklenebilir (mevcut: ${existing.status}).` });
      }
      return res.status(500).json({ error: "Dekont kaydedilemedi. Lütfen tekrar deneyin." });
    }

    logger.info(`[Receipts] Dekont kaydedildi: trade=#${onchainId} mime=${req.file.mimetype} hash=${sha256Hash.slice(0, 8)}...`);
    return res.status(201).json({ hash: sha256Hash });
  } catch (err) {
    // [TR] B3-01: multer hataları handler'a girmez; globalErrorHandler 413/415/400 + sabit kod döner.
    next(err);
  } finally {
    if (tempFilePath) {
      try { await fsp.unlink(tempFilePath); } catch (cleanupErr) { if (cleanupErr.code !== "ENOENT") logger.warn(`[Receipts] Geçici dosya silinemedi: ${tempFilePath}`); }
    }
  }
}));

module.exports = router;
