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
 *   2. Her aday için kontrattan recordedTrade(tradeId) okur (mirror stale olabilir)
 *   3. Kaydedilmemiş olanları tek bir recordTradeOutcomes([...]) çağrısıyla gönderir; kontrat
 *      kaydedilemeyenleri (pencere kapalı vb.) revert etmeden atlar
 *
 * [EN] Triggers Proof of Peace weight recording with the relayer. The contract derives everything
 *      from getRewardableTrade(); the backend only makes sure the permissionless call happens in time.
 */

const { ethers } = require("ethers");
const Trade = require("../models/Trade");
const logger = require("../utils/logger");

const REWARDS_RECORDER_ABI = [
  "function recordTradeOutcomes(uint256[] tradeIds)",
  "function recordedTrade(uint256 tradeId) view returns (bool)",
  "function epochDuration() view returns (uint256)",
  "function claimDelay() view returns (uint256)",
];

// [TR] Yalnız pozitif ağırlık üreten sonuçlar kaydedilir; sıfır ağırlıklı kayıt relayer gazını boşa harcar.
// [EN] Only outcomes that can produce positive weight are recorded; zero-weight records waste relayer gas.
const REWARDABLE_RESOLUTION_TYPES = ["MANUAL_RELEASE", "PARTIAL_SETTLEMENT"];
const DEFAULT_CANDIDATE_LIMIT = Number(process.env.REWARD_RECORDER_CANDIDATE_LIMIT || 200);
const DEFAULT_BATCH_LIMIT = Number(process.env.REWARD_RECORDER_BATCH_LIMIT || 50);
// [TR] ArafRewards varsayılanı (30 gün); zincirden okunamazsa kullanılır. [EN] ArafRewards default (30 days).
const FALLBACK_EPOCH_SECONDS = 30 * 24 * 3600;
const FALLBACK_CLAIM_DELAY_SECONDS = 24 * 3600;

let rewardsContract = null;

function _isConfiguredAddress(addr) {
  return typeof addr === "string"
    && /^0x[a-fA-F0-9]{40}$/.test(addr)
    && addr !== "0x0000000000000000000000000000000000000000";
}

function getRewardsContract() {
  if (rewardsContract) return rewardsContract;

  const rpcUrl = process.env.BASE_RPC_URL;
  const privateKey = process.env.RELAYER_PRIVATE_KEY;
  const rewardsAddress = process.env.ARAF_REWARDS_ADDRESS;

  if (!_isConfiguredAddress(rewardsAddress)) {
    logger.info("[RewardRecorder] ARAF_REWARDS_ADDRESS tanımsız; görev pasif.");
    return null;
  }
  if (!rpcUrl || !privateKey) {
    logger.error("[RewardRecorder] RELAYER_PRIVATE_KEY veya BASE_RPC_URL tanımsız. Görev çalıştırılamıyor.");
    return null;
  }

  const provider = new ethers.JsonRpcProvider(rpcUrl);
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

async function runRewardOutcomeRecorder({ contract = getRewardsContract() } = {}) {
  if (!contract) return { success: true, skipped: "rewards_not_configured", candidates: 0, recorded: 0 };

  // [TR] Bir trade en geç (bitiş epoch'unun sonu + claimDelay) anına kadar kaydedilebilir; bu süre en fazla
  //      epochDuration + claimDelay kadar geriye gider. Daha eski trade'ler zaten kontrat tarafından atlanır.
  // [EN] A trade can be recorded until its epoch end + claimDelay, i.e. at most epochDuration + claimDelay back.
  const windowSeconds = await _readWindowSeconds(contract);
  const since = new Date(Date.now() - windowSeconds * 1000);

  const candidates = await Trade.find({
    resolution_type: { $in: REWARDABLE_RESOLUTION_TYPES },
    tier: { $gte: 1 },
    "timers.resolved_at": { $gte: since },
    onchain_escrow_id: { $ne: null },
  })
    .select("onchain_escrow_id")
    .sort({ "timers.resolved_at": 1 })
    .limit(DEFAULT_CANDIDATE_LIMIT)
    .lean();

  if (candidates.length === 0) return { success: true, candidates: 0, recorded: 0 };

  let hadErrors = false;
  const pending = [];
  for (const trade of candidates) {
    const id = String(trade.onchain_escrow_id || "");
    if (!/^[1-9]\d*$/.test(id)) continue;
    try {
      if (!(await contract.recordedTrade(BigInt(id)))) pending.push(BigInt(id));
    } catch (err) {
      logger.warn(`[RewardRecorder] recordedTrade(${id}) okunamadı: ${err.message}`);
      hadErrors = true;
    }
    if (pending.length >= DEFAULT_BATCH_LIMIT) break;
  }

  if (pending.length === 0) return { success: !hadErrors, candidates: candidates.length, recorded: 0 };

  try {
    const tx = await contract.recordTradeOutcomes(pending);
    const receipt = await tx.wait();
    logger.info(`[RewardRecorder] ${pending.length} trade için kayıt gönderildi: tx=${tx.hash} block=${receipt?.blockNumber || "n/a"}`);
  } catch (err) {
    logger.error(`[RewardRecorder] recordTradeOutcomes başarısız: ${err.reason || err.message}`);
    return { success: false, candidates: candidates.length, recorded: 0 };
  }

  return { success: !hadErrors, candidates: candidates.length, recorded: pending.length };
}

module.exports = { runRewardOutcomeRecorder, REWARDABLE_RESOLUTION_TYPES };
