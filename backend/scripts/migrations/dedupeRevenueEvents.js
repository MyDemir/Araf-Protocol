"use strict";

/**
 * B16 veri temizliği: aynı transfer için iki kez yazılmış RevenueEvent satırlarını temizler.
 *
 * Eski worker, treasury = ArafRevenueVault olan escrow ProtocolRevenueSent event'ini de, vault'un
 * EscrowRevenueReceived event'ini de ESCROW_REVENUE olarak yazıyordu (admin toplamı 2x). Vault satırı
 * birincildir (reward_share/treasury_share taşır); aynı tx_hash + token + amount + kind + trade_id
 * için eşleşen escrow satırı (reward_share/treasury_share null) silinir. Eşleşme bire bir yapılır.
 *
 * Tek seferlik ve idempotent: temizlenmiş veride ikinci çalıştırma hiçbir şey silmez.
 * Varsayılan DRY-RUN'dır; silmek için --apply verilmelidir.
 *
 * Kullanım / Usage:
 *   node scripts/migrations/dedupeRevenueEvents.js            (dry-run)
 *   node scripts/migrations/dedupeRevenueEvents.js --apply
 */

require("dotenv").config();

function parseArgs(argv = process.argv.slice(2)) {
  return { apply: argv.includes("--apply") };
}

function _isVaultRow(row) {
  return row.reward_share !== null && row.reward_share !== undefined;
}

function _identity(row) {
  return [row.tx_hash, String(row.token || "").toLowerCase(), String(row.amount), Number(row.kind), String(row.trade_id)].join("|");
}

/**
 * Saf tespit: satır listesinden silinecek escrow satırlarını döner.
 * Pure detection: returns the escrow rows that duplicate a vault row.
 */
function findDuplicateEscrowRows(rows) {
  const vaultCounts = new Map();
  for (const row of rows) {
    if (_isVaultRow(row)) {
      const key = _identity(row);
      vaultCounts.set(key, (vaultCounts.get(key) || 0) + 1);
    }
  }

  const duplicates = [];
  for (const row of rows) {
    if (_isVaultRow(row)) continue;
    const key = _identity(row);
    const remaining = vaultCounts.get(key) || 0;
    if (remaining > 0) {
      duplicates.push(row);
      vaultCounts.set(key, remaining - 1);
    }
  }
  return duplicates;
}

async function runDedupeRevenueEvents({ apply = false, model } = {}) {
  const RevenueEvent = model || require("../models/RevenueEvent");

  // [TR] Yalnız birden fazla satırı olan tx_hash'ler incelenir.
  // [EN] Only tx hashes carrying more than one row are inspected.
  const multi = await RevenueEvent.aggregate([
    { $match: { source: "ESCROW_REVENUE" } },
    { $group: { _id: "$tx_hash", n: { $sum: 1 } } },
    { $match: { n: { $gt: 1 } } },
  ]);
  const txHashes = multi.map((g) => g._id);

  let scanned = 0;
  const duplicates = [];
  for (const txHash of txHashes) {
    const rows = await RevenueEvent.find({ tx_hash: txHash, source: "ESCROW_REVENUE" }).lean();
    scanned += rows.length;
    duplicates.push(...findDuplicateEscrowRows(rows));
  }

  let deleted = 0;
  if (apply && duplicates.length > 0) {
    const res = await RevenueEvent.deleteMany({ _id: { $in: duplicates.map((d) => d._id) } });
    deleted = Number(res?.deletedCount || 0);
  }

  return {
    dryRun: !apply,
    candidateTxCount: txHashes.length,
    scannedRows: scanned,
    duplicateCount: duplicates.length,
    deleted,
    duplicates: duplicates.map((d) => ({ _id: d._id, tx_hash: d.tx_hash, log_index: d.log_index, amount: d.amount })),
  };
}

async function main() {
  const mongoose = require("mongoose");
  const { apply } = parseArgs();
  const mongoUri = require("./_mongoUri").resolveMongoUri();
  await mongoose.connect(mongoUri);
  try {
    const result = await runDedupeRevenueEvents({ apply });
    console.log(JSON.stringify({ ...result, duplicates: undefined, sample: result.duplicates.slice(0, 20) }, null, 2));
    if (result.dryRun) console.log("DRY-RUN: hiçbir kayıt silinmedi. Silmek için --apply ile çalıştırın.");
  } finally {
    await mongoose.disconnect();
  }
}

if (require.main === module) {
  main().then(() => process.exit(0)).catch((err) => {
    console.error(`[dedupeRevenueEvents] ${err.message}`);
    process.exit(1);
  });
}

module.exports = { parseArgs, findDuplicateEscrowRows, runDedupeRevenueEvents };
