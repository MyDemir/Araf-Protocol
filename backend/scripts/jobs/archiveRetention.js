"use strict";

/**
 * Archive Retention Job — arşivlenmiş trade koleksiyonlarında PII/dekont/snapshot temizliği
 *
 * [TR] `archive_<chainId>_<escrow>_trades` koleksiyonlarında cleanupSensitiveData.js ile aynı
 *      alanları temizler; STATUS FİLTRESİ YOKTUR (arşivdeki terminal olmayan trade hiç terminal olmaz).
 *      Silme zamanı = min(mevcut delete_at, _archive.archived_at + 30 gün).
 *      Yalnız `$set: null` / `$unset` yapar; okuma sonucu dışarı dönmez; şifreli alanlar ASLA çözülmez
 *      (encryption modülü bilerek import edilmez). Mongoose modeli yok: native collection erişimi.
 *      365 günlük TTL'e dokunulmaz.
 * [EN] Same field cleanup as cleanupSensitiveData.js on archive_*_trades collections, with no status
 *      filter. Deadline = min(existing delete_at, archived_at + 30d). Only $set null / $unset; nothing
 *      read is returned; encrypted fields are never decrypted. Native collection access, no model.
 */

const mongoose = require("mongoose");
const logger = require("../utils/logger");

const ARCHIVE_TRADES_COLLECTION_RE = /^archive_\d+_0x[0-9a-f]{40}_trades$/;
const ARCHIVE_MAX_RETENTION_MS = 30 * 24 * 60 * 60 * 1000;

const REPUTATION_FIELDS = [
  "success_rate", "failed_disputes", "effective_tier", "consecutive_bans", "is_banned",
  "banned_until", "manual_release_count", "burn_count", "auto_release_count",
  "mutual_cancel_count", "disputed_resolved_count", "dispute_win_count", "dispute_loss_count",
  "risk_points",
];

function buildSnapshotSet() {
  const set = {};
  for (const side of ["maker", "taker"]) {
    const p = `payout_snapshot.${side}`;
    set[`${p}.rail`] = null;
    set[`${p}.country`] = null;
    set[`${p}.contact_channel`] = null;
    set[`${p}.contact_value_enc`] = null;
    set[`${p}.payout_details_enc`] = null;
    set[`${p}.fingerprint_hash_at_lock`] = null;
    set[`${p}.profile_version_at_lock`] = 0;
    set[`${p}.bank_change_count_7d_at_lock`] = null;
    set[`${p}.bank_change_count_30d_at_lock`] = null;
    set[`${p}.last_bank_change_at_at_lock`] = null;
    for (const f of REPUTATION_FIELDS) set[`${p}.reputation_context_at_lock.${f}`] = null;
  }
  set["payout_snapshot.captured_at"] = null;
  set["payout_snapshot.is_complete"] = true;
  set["payout_snapshot.incomplete_reason"] = null;
  return set;
}

function isArchiveTradesCollectionName(name) {
  return typeof name === "string" && ARCHIVE_TRADES_COLLECTION_RE.test(name);
}

async function listArchiveTradeCollections(db) {
  const infos = await db.listCollections({}, { nameOnly: true }).toArray();
  return infos.map((i) => i && i.name).filter(isArchiveTradesCollectionName);
}

async function cleanupOneCollection(col, now) {
  // [TR] min(delete_at, archived_at+30g) <= now  <=>  delete_at <= now VEYA archived_at <= now-30g
  // [EN] min(a, b) <= now  <=>  a <= now OR b <= now
  const ageCutoff = new Date(now.getTime() - ARCHIVE_MAX_RETENTION_MS);
  const aged = { "_archive.archived_at": { $lte: ageCutoff } };

  const receipt = await col.updateMany(
    {
      $and: [
        { $or: [{ "evidence.receipt_delete_at": { $lte: now } }, aged] },
        {
          $or: [
            { "evidence.receipt_encrypted": { $ne: null } },
            { "evidence.receipt_timestamp": { $ne: null } },
          ],
        },
      ],
    },
    {
      $set: {
        "evidence.receipt_encrypted": null,
        "evidence.receipt_timestamp": null,
        "evidence.receipt_delete_at": null,
      },
    }
  );

  const snapshot = await col.updateMany(
    {
      $and: [
        { $or: [{ "payout_snapshot.snapshot_delete_at": { $lte: now } }, aged] },
        {
          $or: [
            { "payout_snapshot.maker.payout_details_enc": { $ne: null } },
            { "payout_snapshot.taker.payout_details_enc": { $ne: null } },
            { "payout_snapshot.maker.contact_value_enc": { $ne: null } },
            { "payout_snapshot.taker.contact_value_enc": { $ne: null } },
            { "payout_snapshot.captured_at": { $ne: null } },
          ],
        },
      ],
    },
    { $set: buildSnapshotSet(), $unset: { "payout_snapshot.snapshot_delete_at": "" } }
  );

  return (receipt.modifiedCount || 0) + (snapshot.modifiedCount || 0);
}

async function runArchiveRetention(now = new Date()) {
  try {
    const db = mongoose.connection && mongoose.connection.db;
    if (!db) throw new Error("db_unavailable");
    const names = await listArchiveTradeCollections(db);
    let total = 0;
    for (const name of names) {
      const count = await cleanupOneCollection(db.collection(name), now);
      total += count;
      if (count > 0) logger.info(`[Job:ArchiveRetention] ${name}: ${count} güncelleme.`);
    }
    return { success: true, collections: names.length, modifiedCount: total };
  } catch (err) {
    logger.error(`[Job:ArchiveRetention] Temizlik başarısız: ${err.message}`);
    return { success: false, modifiedCount: 0, error: err.message };
  }
}

module.exports = {
  runArchiveRetention,
  isArchiveTradesCollectionName,
  ARCHIVE_TRADES_COLLECTION_RE,
  ARCHIVE_MAX_RETENTION_MS,
};
