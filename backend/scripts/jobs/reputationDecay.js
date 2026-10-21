"use strict";

/**
 * Reputation Decay Job — V3 On-Chain Clean-Slate Trigger
 *
 * V3 kuralı değişmez:
 *   - İtibarın otoritatif kaynağı kontrattır.
 *   - Backend yalnız aday havuzu çıkarır ve uygun kullanıcılar için
 *     on-chain `decayReputation()` çağrısını tetikler.
 *   - Nihai eligibility kararı MongoDB cache'e değil, kontratın kendi
 *     `getReputation()` çıktısına göre verilir.
 *
 * Bu görev:
 *   1. Geniş bir aday havuzu çıkarır (mirror/cache yardımcıdır)
 *   2. Her aday için kontrattan güncel bannedUntil + consecutiveBans okur
 *   3. 90 günlük clean-slate eşiği dolmuşsa decayReputation() çağırır
 *   4. ReputationUpdated event'i eventListener tarafından mirror'a yansıtılır
 */

const { ethers } = require("ethers");
const User = require("../models/User");
const logger = require("../utils/logger");
const { getSharedProvider } = require("../services/rpcProvider");

const DECAY_ABI = [
  "function decayReputation(address _wallet)",
  // [TR] Tam tuple imzası: kısaltılmış çıktı listesi statik alanlarda tesadüfen çalışır ama ABI drift'i gizler.
  // [EN] Full tuple signature: a truncated output list only works by accident on static fields and hides ABI drift.
  "function getReputation(address _wallet) view returns (uint256 successful, uint256 failed, uint256 bannedUntil, uint256 consecutiveBans, uint8 effectiveTier, uint256 manualReleaseCount, uint256 autoReleaseCount, uint256 mutualCancelCount, uint256 disputedResolvedCount, uint256 burnCount, uint256 disputeWinCount, uint256 disputeLossCount, uint256 partialSettlementCount, uint256 riskPoints, uint256 lastPositiveEventAt, uint256 lastNegativeEventAt)",
  "function cleanPeriod() view returns (uint256)",
];

// [TR] Fallback değer; gerçek süre kontrattaki mutable cleanPeriod'dan okunur (setReputationPolicy).
// [EN] Fallback only; the real window is the contract's mutable cleanPeriod (setReputationPolicy).
const CLEAN_SLATE_DAYS = 90;
// [TR] Limitler her çalıştırmada çalışma ayarlarından okunur (admin > env > varsayılan; sınırlı).
const { runtimeValue } = require("../utils/runtimeValue");

let relayerWallet = null;
let decayContract = null;

// [TR] Anahtar bilinçli tanımsızsa görev pasiftir; uyarı süreç başına yalnız bir kez yazılır.
// [EN] A deliberately absent key makes the job passive; the warning is logged once per process.
let passiveWarned = false;
const ZERO_ADDRESS = "0x0000000000000000000000000000000000000000";

function getRelayer() {
  if (relayerWallet) return relayerWallet;

  const provider = getSharedProvider();
  relayerWallet = new ethers.Wallet(process.env.RELAYER_PRIVATE_KEY, provider);
  logger.info(`[DecayJob] Relayer cüzdanı yüklendi: ${relayerWallet.address}`);
  return relayerWallet;
}

// [TR] Dönüş: { contract } | { passive:true } | { error:true }
function getDecayContract() {
  if (decayContract) return { contract: decayContract };

  const contractAddress = process.env.ARAF_ESCROW_ADDRESS;
  if (!contractAddress) {
    logger.error("[DecayJob] ARAF_ESCROW_ADDRESS tanımsız.");
    return { error: true };
  }
  if (contractAddress.toLowerCase() === ZERO_ADDRESS) {
    logger.error("[DecayJob] ARAF_ESCROW_ADDRESS sıfır adres; geçersiz.");
    return { error: true };
  }
  if (!process.env.BASE_RPC_URL) {
    logger.error("[DecayJob] BASE_RPC_URL tanımsız. Görev çalıştırılamıyor.");
    return { error: true };
  }
  if (!process.env.RELAYER_PRIVATE_KEY) {
    if (!passiveWarned) {
      passiveWarned = true;
      logger.warn("[DecayJob] RELAYER_PRIVATE_KEY tanımsız; görev pasif (decayReputation herkes tarafından çağrılabilir).");
    }
    return { passive: true };
  }

  decayContract = new ethers.Contract(contractAddress, DECAY_ABI, getRelayer());
  return { contract: decayContract };
}

async function runReputationDecay() {
  logger.info("[DecayJob] V3 itibar temizleme görevi başlatıldı...");

  const resolved = getDecayContract();
  if (resolved.passive) return { success: true, skipped: "relayer_not_configured" };
  const contract = resolved.contract;
  if (!contract) return { success: false, reason: "contract_unavailable" };

  let cleanPeriodMs = CLEAN_SLATE_DAYS * 24 * 3600 * 1000;
  try {
    const onchainCleanPeriod = Number(await contract.cleanPeriod());
    if (Number.isFinite(onchainCleanPeriod) && onchainCleanPeriod > 0) cleanPeriodMs = onchainCleanPeriod * 1000;
  } catch (err) {
    logger.warn(`[DecayJob] cleanPeriod() okunamadı, ${CLEAN_SLATE_DAYS} gün fallback kullanılıyor: ${err.message}`);
  }
  const cutoffMs = Date.now() - cleanPeriodMs;
  let hadErrors = false;

  // [TR] Mirror alanları stale olabilir. Bu yüzden query yalnız aday havuzu içindir.
  //      Nihai eligibility kararı kontratın getReputation() çağrısından gelir.
  // [EN] Mirror fields may be stale. This query only builds a candidate pool.
  const candidateLimit = await runtimeValue("REPUTATION_DECAY_CANDIDATE_LIMIT");
  const txLimit = await runtimeValue("REPUTATION_DECAY_TX_LIMIT");
  const candidates = await User.find({
    consecutive_bans: { $gt: 0 },
    // [TR] banned_until ban bitince null'lanır; bu yüzden kalıcı last_ban_ends_at esas alınır
    //      (banned_until yalnız eski kayıtlar için yedek).
    // [EN] banned_until is nulled on expiry, so the persistent last_ban_ends_at is the primary key.
    $or: [
      { last_ban_ends_at: { $ne: null, $lte: new Date(cutoffMs) } },
      { banned_until: { $ne: null, $lte: new Date(cutoffMs) } },
    ],
  })
    .select("wallet_address consecutive_bans banned_until last_ban_ends_at")
    .sort({ last_ban_ends_at: 1, banned_until: 1, wallet_address: 1 })
    .limit(candidateLimit)
    .lean();

  if (candidates.length === 0) {
    logger.info("[DecayJob] Aday havuzunda kullanıcı bulunamadı.");
    return { success: true, candidates: 0, processed: 0 };
  }

  const usersToClean = [];
  for (const user of candidates) {
    try {
      const rep = await contract.getReputation(user.wallet_address);
      const bannedUntil = Number(rep.bannedUntil || 0);
      const consecutiveBans = Number(rep.consecutiveBans || 0);

      if (!bannedUntil || consecutiveBans <= 0) continue;
      const bannedUntilMs = bannedUntil * 1000;
      if (bannedUntilMs <= cutoffMs) {
        usersToClean.push(user.wallet_address);
      }
      if (usersToClean.length >= txLimit) break;
    } catch (err) {
      logger.warn(`[DecayJob] getReputation() okunamadı: ${user.wallet_address} err=${err.message}`);
      hadErrors = true;
    }
  }

  if (usersToClean.length === 0) {
    logger.info("[DecayJob] On-chain koşullara göre temizlenecek kullanıcı bulunamadı.");
    return { success: !hadErrors, candidates: candidates.length, processed: 0 };
  }

  logger.info(`[DecayJob] ${usersToClean.length} kullanıcı için decayReputation() denenecek.`);

  for (const wallet of usersToClean) {
    try {
      const tx = await contract.decayReputation(wallet);
      const receipt = await _waitForReceipt(tx);
      logger.info(
        `[DecayJob] decayReputation onaylandı: wallet=${wallet} tx=${tx.hash} block=${receipt?.blockNumber || "n/a"}`
      );
    } catch (err) {
      if (err?.code === "TX_WAIT_TIMEOUT") logger.warn(`[DecayJob] ${wallet} ${err.message}`);
      logger.error(`[DecayJob] ${wallet} için itibar temizleme başarısız: ${err.reason || err.message}`);
      hadErrors = true;
    }
  }

  return {
    success: !hadErrors,
    candidates: candidates.length,
    processed: usersToClean.length,
  };
}


// [TR] tx.wait() için üst süre: takılan tx iş kilidini (app.js jobLocks) kalıcı tutmasın.
// [EN] Upper bound for tx.wait() so a stuck tx cannot hold the scheduler lock forever.
const TX_WAIT_TIMEOUT_MS = 120_000;

async function _waitForReceipt(tx, timeoutMs = TX_WAIT_TIMEOUT_MS) {
  let timer;
  const timeout = new Promise((_, reject) => {
    timer = setTimeout(() => {
      const e = new Error(`tx.wait zaman aşımı (${timeoutMs} ms) tx=${tx?.hash || "n/a"}`);
      e.code = "TX_WAIT_TIMEOUT";
      reject(e);
    }, timeoutMs);
  });
  try {
    return await Promise.race([tx.wait(1, timeoutMs), timeout]);
  } finally {
    clearTimeout(timer);
  }
}

module.exports = { runReputationDecay };
