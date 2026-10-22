"use strict";

/**
 * B4-17: Birleşik unique index'in ÖNEKİ olan gereksiz tekil index'leri canlı koleksiyonlardan düşürür.
 *
 * Şemadan index:true tanımları kaldırıldı; mongoose autoIndex yalnız oluşturur, düşürmez. Bu betik eski
 * index'leri düşürür. Unique kısıtı asla gevşemez: yalnız unique OLMAYAN tekil index düşürülür ve
 * bir index ancak onu kapsayan unique index koleksiyonda MEVCUTSA düşürülür.
 *
 * Usage (backend/ içinden):
 *   node scripts/migrations/dropRedundantIndexes.js          (varsayılan DRY-RUN, yazmaz)
 *   node scripts/migrations/dropRedundantIndexes.js --apply  (index'leri düşürür)
 */

const TARGETS = [
  // collection, düşürülecek index (key), onu kapsayan index (key; unique olmalı)
  { collection: "revenueevents", drop: { tx_hash: 1 }, coveredBy: { tx_hash: 1, log_index: 1 } },
  { collection: "rewardclaims", drop: { tx_hash: 1 }, coveredBy: { tx_hash: 1, log_index: 1 } },
  { collection: "rewardfundings", drop: { tx_hash: 1 }, coveredBy: { tx_hash: 1, log_index: 1 } },
  { collection: "rewardepochallocationevents", drop: { tx_hash: 1 }, coveredBy: { tx_hash: 1, log_index: 1 } },
  { collection: "rewardepochs", drop: { epoch: 1 }, coveredBy: { epoch: 1, token: 1 } },
  { collection: "historical_stats", drop: { date: -1 }, coveredBy: { date: 1 } },
];

function parseArgs(argv = process.argv.slice(2)) {
  return { apply: argv.includes("--apply") };
}

function sameKey(a, b) {
  const ka = Object.entries(a || {});
  const kb = Object.entries(b || {});
  return ka.length === kb.length && ka.every(([k, v], i) => kb[i][0] === k && Number(kb[i][1]) === Number(v));
}

/**
 * [TR] Tek bir hedef için karar: "drop" | "absent" | "skip_not_covered" | "skip_unique".
 *      Kısıt güvenliği: kapsayıcı index unique değilse ya da yoksa ASLA düşürülmez; düşürülecek index
 *      unique ise ASLA düşürülmez.
 */
function decide(target, indexes) {
  const victim = indexes.find((ix) => sameKey(ix.key, target.drop));
  if (!victim) return { action: "absent" };
  if (victim.unique) return { action: "skip_unique", name: victim.name };
  const cover = indexes.find((ix) => sameKey(ix.key, target.coveredBy));
  if (!cover || !cover.unique) return { action: "skip_not_covered", name: victim.name };
  return { action: "drop", name: victim.name };
}

async function runDropRedundantIndexes({ db, apply = false, targets = TARGETS, log = () => {} } = {}) {
  const results = [];
  for (const target of targets) {
    let indexes;
    try {
      indexes = await db.collection(target.collection).indexes();
    } catch (err) {
      // [TR] Koleksiyon henüz yoksa (NamespaceNotFound) yapacak bir şey yok.
      if (err?.codeName === "NamespaceNotFound" || err?.code === 26) {
        results.push({ collection: target.collection, action: "absent", dropped: false });
        continue;
      }
      throw err;
    }
    const decision = decide(target, indexes);
    let dropped = false;
    if (decision.action === "drop" && apply) {
      await db.collection(target.collection).dropIndex(decision.name);
      dropped = true;
    }
    log(`[dropRedundantIndexes] ${target.collection} ${decision.name || ""} -> ${decision.action}${dropped ? " (düşürüldü)" : ""}`);
    results.push({ collection: target.collection, ...decision, dropped });
  }
  return { dryRun: !apply, results };
}

async function main() {
  const mongoose = require("mongoose");
  const { apply } = parseArgs();
  const mongoUri = require("./_mongoUri").resolveMongoUri();
  await mongoose.connect(mongoUri);
  try {
    const out = await runDropRedundantIndexes({ db: mongoose.connection.db, apply, log: (m) => console.log(m) });
    if (out.dryRun) console.log("DRY-RUN: hiçbir index düşürülmedi. Düşürmek için --apply ile çalıştırın.");
  } finally {
    await mongoose.disconnect();
  }
}

if (require.main === module) {
  main().then(() => process.exit(0)).catch((err) => {
    console.error(`[dropRedundantIndexes] ${err.message}`);
    process.exit(1);
  });
}

module.exports = { TARGETS, parseArgs, decide, runDropRedundantIndexes };
