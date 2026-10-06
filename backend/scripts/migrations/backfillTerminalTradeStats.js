"use strict";

/**
 * B23: mevcut terminal Trade belgelerinden kalıcı TerminalTradeStat sayacını doldurur.
 *
 * - Idempotent: satırlar trade_key üzerinden $setOnInsert ile upsert edilir; mevcut satırlara dokunulmaz,
 *   tekrar çalıştırmak hiçbir şeyi iki kez saymaz.
 * - Varsayılan DRY-RUN: yazmaz, kaç satır eklenecek olduğunu raporlar. Yazmak için --apply.
 * - DEPLOY SIRASI: ÖNCE yeni backend deploy edilir, SONRA bu script --apply ile çalıştırılır. Gerekçe: eski
 *   backend sayaç yazmaz, o yüzden sayaç ancak yeni backend yayında iken kayıpsız dolar; backfill idempotent
 *   olduğundan deploy sırasında yeni backend'in yazdığı satırlarla çakışmaz, tekrar çalıştırmak güvenlidir.
 *
 * Kullanım / Usage:
 *   node scripts/migrations/backfillTerminalTradeStats.js            (dry-run)
 *   node scripts/migrations/backfillTerminalTradeStats.js --apply
 */

require("dotenv").config();
const { buildTerminalStatDoc } = require("../services/terminalStats");

const TERMINAL_STATES = ["RESOLVED", "CANCELED", "BURNED"];
const DEFAULT_BATCH_SIZE = 500;

function parseArgs(argv = process.argv.slice(2)) {
  return { apply: argv.includes("--apply") };
}

async function runBackfillTerminalTradeStats({ apply = false, batchSize = DEFAULT_BATCH_SIZE, TradeModel, CounterModel } = {}) {
  const Trade = TradeModel || require("../models/Trade");
  const Counter = CounterModel || require("../models/TerminalTradeStat");

  const summary = { dryRun: !apply, scanned: 0, skippedInvalid: 0, wouldInsert: 0, inserted: 0, alreadyPresent: 0 };

  const cursor = Trade.find({ status: { $in: TERMINAL_STATES } })
    .select("onchain_escrow_id status token_address financials timers")
    .lean()
    .cursor();

  let batch = [];
  const flush = async () => {
    if (batch.length === 0) return;
    const keys = batch.map((d) => d.trade_key);
    const existing = await Counter.find({ trade_key: { $in: keys } }).select("trade_key").lean();
    const have = new Set(existing.map((e) => e.trade_key));
    const fresh = batch.filter((d) => !have.has(d.trade_key));
    summary.alreadyPresent += batch.length - fresh.length;
    summary.wouldInsert += fresh.length;
    if (apply && fresh.length > 0) {
      const res = await Counter.bulkWrite(
        fresh.map((doc) => ({
          updateOne: { filter: { trade_key: doc.trade_key }, update: { $setOnInsert: doc }, upsert: true },
        })),
        { ordered: false }
      );
      summary.inserted += Number(res?.upsertedCount ?? fresh.length);
    }
    batch = [];
  };

  for await (const trade of cursor) {
    summary.scanned += 1;
    const doc = buildTerminalStatDoc(trade);
    if (!doc) {
      summary.skippedInvalid += 1;
      continue;
    }
    batch.push(doc);
    if (batch.length >= batchSize) await flush();
  }
  await flush();

  return summary;
}

async function main() {
  const mongoose = require("mongoose");
  const { apply } = parseArgs();
  const mongoUri = process.env.MONGODB_URI || process.env.MONGO_URI;
  if (!mongoUri) throw new Error("MONGODB_URI/MONGO_URI tanımlı değil.");
  await mongoose.connect(mongoUri);
  try {
    const result = await runBackfillTerminalTradeStats({ apply });
    console.log(JSON.stringify(result, null, 2));
    if (result.dryRun) console.log("DRY-RUN: hiçbir kayıt yazılmadı. Yazmak için --apply ile çalıştırın.");
  } finally {
    await mongoose.disconnect();
  }
}

if (require.main === module) {
  main().then(() => process.exit(0)).catch((err) => {
    console.error(`[backfillTerminalTradeStats] ${err.message}`);
    process.exit(1);
  });
}

module.exports = { parseArgs, runBackfillTerminalTradeStats };
