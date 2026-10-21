"use strict";

/**
 * Reward Outcome Recorder Job — Proof of Peace ağırlık kaydı tetikleyicisi
 *
 * ArafRewards.recordTradeOutcome(s) permissionless'tır ve authority üretmez: ağırlık yalnız
 * kontratın getRewardableTrade() çıktısından hesaplanır. Ancak kimse çağırmazsa temiz kapanan
 * trade'ler epoch'a hiç yazılmaz ve kullanıcı ödülsüz kalır. Kayıt penceresi epoch sonu + claimDelay'de
 * zamanla kapandığı için bu görev, relayer cüzdanıyla yalnız "tetikleme" yapar.
 *
 * Bu görev:
 *   1. Son kayıt penceresine düşen, ödül ağırlığı üretebilecek (temiz release / partial settlement,
 *      Tier >= 1) trade'leri mirror'dan aday olarak çıkarır
 *   2. Mirror'da reward_recorded_at işareti olmayanları tek bir recordTradeOutcomes([...]) çağrısıyla
 *      gönderir (trade başına RPC okuması yok); kontrat kaydedilmiş/kaydedilemeyenleri revert etmeden atlar
 *   3. Gönderilenleri işaretler; TradeOutcomeRecorded event'i de aynı işareti yazar
 *
 * [EN] Triggers Proof of Peace weight recording with the relayer. The contract derives everything
 *      from getRewardableTrade(); the backend only makes sure the permissionless call happens in time.
 */

const { ethers } = require("ethers");
const { isConfiguredAddress: _isConfiguredAddress } = require("../utils/onchain");
const Trade = require("../models/Trade");
const logger = require("../utils/logger");
const { getSharedProvider } = require("../services/rpcProvider");

const REWARDS_RECORDER_ABI = [
  "function recordTradeOutcomes(uint256[] tradeIds)",
  "function epochDuration() view returns (uint256)",
  "function claimDelay() view returns (uint256)",
];

// [TR] Yalnız pozitif ağırlık üreten sonuçlar kaydedilir; sıfır ağırlıklı kayıt relayer gazını boşa harcar.
// [EN] Only outcomes that can produce positive weight are recorded; zero-weight records waste relayer gas.
const REWARDABLE_RESOLUTION_TYPES = ["MANUAL_RELEASE", "PARTIAL_SETTLEMENT"];
// [TR] Limitler her çalıştırmada çalışma ayarlarından okunur (admin > env > varsayılan; sınırlı).
const { runtimeValue } = require("../utils/runtimeValue");
// [TR] ArafRewards varsayılanı (30 gün); zincirden okunamazsa kullanılır. [EN] ArafRewards default (30 days).
const FALLBACK_EPOCH_SECONDS = 30 * 24 * 3600;
const FALLBACK_CLAIM_DELAY_SECONDS = 24 * 3600;

let rewardsContract = null;
let passiveWarned = false;
let lastSkipReason = null;


function getRewardsContract() {
  lastSkipReason = null;
  if (rewardsContract) return rewardsContract;

  const rpcUrl = process.env.BASE_RPC_URL;
  const privateKey = process.env.RELAYER_PRIVATE_KEY;
  const rewardsAddress = process.env.ARAF_REWARDS_ADDRESS;

  if (!_isConfiguredAddress(rewardsAddress)) {
    logger.info("[RewardRecorder] ARAF_REWARDS_ADDRESS tanımsız; görev pasif.");
    return null;
  }
  if (!rpcUrl) {
    logger.error("[RewardRecorder] BASE_RPC_URL tanımsız. Görev çalıştırılamıyor.");
    return null;
  }
  if (!privateKey) {
    // [TR] Anahtar bilinçli tanımsız: hata değil pasif; süreç başına tek uyarı.
    lastSkipReason = "relayer_not_configured";
    if (!passiveWarned) {
      passiveWarned = true;
      logger.warn("[RewardRecorder] RELAYER_PRIVATE_KEY tanımsız; Proof of Peace kaydı pasif.");
    }
    return null;
  }

  const provider = getSharedProvider();
  const relayer = new ethers.Wallet(privateKey, provider);
  rewardsContract = new ethers.Contract(rewardsAddress, REWARDS_RECORDER_ABI, relayer);
  return rewardsContract;
}

async function _readWindowSeconds(contract) {
  try {
    const [epochDuration, claimDelay] = await Promise.all([contract.epochDuration(), contract.claimDelay()]);
    const total = Number(epochDuration) + Number(claimDelay);
    if (Number.isFinite(total) && total > 0) return total;
  } catch (err) {
    logger.warn(`[RewardRecorder] epochDuration/claimDelay okunamadı, varsayılan pencere kullanılıyor: ${err.message}`);
  }
  return FALLBACK_EPOCH_SECONDS + FALLBACK_CLAIM_DELAY_SECONDS;
}

async function runRewardOutcomeRecorder(opts = {}) {
  const injected = Object.prototype.hasOwnProperty.call(opts || {}, "contract");
  const contract = injected ? opts.contract : getRewardsContract();
  if (!contract) {
    const skipped = !injected && lastSkipReason ? lastSkipReason : "rewards_not_configured";
    return { success: true, skipped, candidates: 0, recorded: 0 };
  }

  // [TR] Bir trade en geç (bitiş epoch'unun sonu + claimDelay) anına kadar kaydedilebilir; bu süre en fazla
  //      epochDuration + claimDelay kadar geriye gider. Daha eski trade'ler zaten kontrat tarafından atlanır.
  // [EN] A trade can be recorded until its epoch end + claimDelay, i.e. at most epochDuration + claimDelay back.
  const windowSeconds = await _readWindowSeconds(contract);
  const since = new Date(Date.now() - windowSeconds * 1000);

  const candidateLimit = await runtimeValue("REWARD_RECORDER_CANDIDATE_LIMIT");
  const batchLimit = await runtimeValue("REWARD_RECORDER_BATCH_LIMIT");
  const candidates = await Trade.find({
    resolution_type: { $in: REWARDABLE_RESOLUTION_TYPES },
    tier: { $gte: 1 },
    "timers.resolved_at": { $gte: since },
    "timers.reward_recorded_at": null,
    onchain_escrow_id: { $ne: null },
  })
    .select("onchain_escrow_id")
    .sort({ "timers.resolved_at": 1 })
    .limit(candidateLimit)
    .lean();

  if (candidates.length === 0) return { success: true, candidates: 0, recorded: 0 };

  // [TR] Trade başına recordedTrade() RPC okuması yapılmaz: kontratın toplu kaydı zaten kaydedilmiş veya
  //      kaydedilemeyen id'leri revert etmeden atlar (kayıtlı id başına ~2k gas). Tekrar göndermeyi mirror'daki
  //      reward_recorded_at işareti önler.
  // [EN] No per-trade recordedTrade() RPC read: the batch already skips recorded/unrecordable ids without
  //      reverting (~2k gas each). The mirror's reward_recorded_at marker prevents resending.
  const pending = [];
  const pendingRaw = [];
  for (const trade of candidates) {
    const id = String(trade.onchain_escrow_id || "");
    if (!/^[1-9]\d*$/.test(id)) continue;
    pending.push(BigInt(id));
    pendingRaw.push(trade.onchain_escrow_id);
    if (pending.length >= batchLimit) break;
  }

  if (pending.length === 0) return { success: true, candidates: candidates.length, recorded: 0 };

  // [TR] D1: Redis iş kilidi kaybolduysa tx gönderilmez (başka makine aynı relayer ile çalışıyor olabilir).
  // [EN] D1: if the Redis job lock was lost, no tx is sent.
  if (typeof opts?.isLockLost === "function" && opts.isLockLost()) {
    logger.error("[RewardRecorder] İş kilidi kaybedildi; tx gönderilmeden duruldu.");
    return { success: false, candidates: candidates.length, recorded: 0, error: "lock_lost" };
  }

  try {
    const tx = await contract.recordTradeOutcomes(pending);
    const receipt = await _waitForReceipt(tx);
    logger.info(`[RewardRecorder] ${pending.length} trade için kayıt gönderildi: tx=${tx.hash} block=${receipt?.blockNumber || "n/a"}`);
  } catch (err) {
    if (err?.code === "TX_WAIT_TIMEOUT") logger.warn(`[RewardRecorder] ${err.message}`);
    logger.error(`[RewardRecorder] recordTradeOutcomes başarısız: ${err.reason || err.message}`);
    return { success: false, candidates: candidates.length, recorded: 0 };
  }

  try {
    await Trade.updateMany(
      { onchain_escrow_id: { $in: pendingRaw }, "timers.reward_recorded_at": null },
      { $set: { "timers.reward_recorded_at": new Date() } }
    );
  } catch (err) {
    // [TR] İşaret yazılamazsa bir sonraki tur aynı id'leri tekrar gönderir; kontrat onları atlar.
    logger.warn(`[RewardRecorder] reward_recorded_at işareti yazılamadı: ${err.message}`);
  }

  return { success: true, candidates: candidates.length, recorded: pending.length };
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

module.exports = { runRewardOutcomeRecorder, REWARDABLE_RESOLUTION_TYPES };
