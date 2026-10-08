"use strict";

/**
 * banned_until'i daha önce null'lanmış kullanıcılar için User.last_ban_ends_at alanını zincirden
 * (getReputation().bannedUntil) doldurur. Böylece ban affı (decay) işi bu kullanıcıları aday görebilir.
 *
 * - Varsayılan DRY-RUN; yazmak için --apply.
 * - Idempotent: yalnız last_ban_ends_at'i boş olanlar işlenir; zincirde bannedUntil=0 ise dokunulmaz.
 * - Salt-okunur RPC kullanır (BASE_RPC_URL, ARAF_ESCROW_ADDRESS); relayer anahtarı gerekmez.
 *
 * Kullanım / Usage:
 *   node scripts/migrations/backfillLastBanEndsAt.js            (dry-run)
 *   node scripts/migrations/backfillLastBanEndsAt.js --apply
 */

require("dotenv").config();

const READ_ABI = [
  "function getReputation(address _wallet) view returns (uint256 successful, uint256 failed, uint256 bannedUntil, uint256 consecutiveBans, uint8 effectiveTier, uint256 manualReleaseCount, uint256 autoReleaseCount, uint256 mutualCancelCount, uint256 disputedResolvedCount, uint256 burnCount, uint256 disputeWinCount, uint256 disputeLossCount, uint256 partialSettlementCount, uint256 riskPoints, uint256 lastPositiveEventAt, uint256 lastNegativeEventAt)",
];

function parseArgs(argv = process.argv.slice(2)) {
  return { apply: argv.includes("--apply") };
}

async function runBackfillLastBanEndsAt({ apply = false, UserModel, contract, limit = 5000 } = {}) {
  const User = UserModel || require("../models/User");
  const summary = { dryRun: !apply, scanned: 0, wouldUpdate: 0, updated: 0, noBanOnChain: 0, errors: 0 };

  const users = await User.find({
    consecutive_bans: { $gt: 0 },
    banned_until: null,
    last_ban_ends_at: null,
  })
    .select("wallet_address")
    .limit(limit)
    .lean();

  for (const u of users) {
    summary.scanned += 1;
    try {
      const rep = await contract.getReputation(u.wallet_address);
      const bannedUntil = Number(rep.bannedUntil || 0);
      if (!bannedUntil) {
        summary.noBanOnChain += 1;
        continue;
      }
      summary.wouldUpdate += 1;
      if (apply) {
        const res = await User.updateOne(
          { wallet_address: u.wallet_address, last_ban_ends_at: null },
          { $set: { last_ban_ends_at: new Date(bannedUntil * 1000) } }
        );
        summary.updated += Number(res?.modifiedCount ?? 1);
      }
    } catch (err) {
      summary.errors += 1;
      console.warn(`[backfillLastBanEndsAt] ${u.wallet_address}: ${err.message}`);
    }
  }
  return summary;
}

async function main() {
  const mongoose = require("mongoose");
  const { ethers } = require("ethers");
  const { apply } = parseArgs();
  const rpc = process.env.BASE_RPC_URL;
  const addr = process.env.ARAF_ESCROW_ADDRESS;
  if (!rpc || !addr) throw new Error("BASE_RPC_URL ve ARAF_ESCROW_ADDRESS gerekli.");
  const contract = new ethers.Contract(addr, READ_ABI, new ethers.JsonRpcProvider(rpc));
  await mongoose.connect(require("./_mongoUri").resolveMongoUri());
  try {
    const result = await runBackfillLastBanEndsAt({ apply, contract });
    console.log(JSON.stringify(result, null, 2));
    if (result.dryRun) console.log("DRY-RUN: hiçbir kayıt yazılmadı. Yazmak için --apply ile çalıştırın.");
  } finally {
    await mongoose.disconnect();
  }
}

if (require.main === module) {
  main().then(() => process.exit(0)).catch((err) => {
    console.error(`[backfillLastBanEndsAt] ${err.message}`);
    process.exit(1);
  });
}

module.exports = { parseArgs, runBackfillLastBanEndsAt };
