"use strict";

/**
 * On-chain trade state check for PII access.
 *
 * [TR] PII kararı Mongo mirror'ına ek olarak zincirdeki gerçek state ile de doğrulanır: trade zincirde
 *      kapanmış ama event henüz mirror edilmemişse PII açılmaz. Yük bindirmemek için sonuçlar kısa süre
 *      önbelleğe alınır; RPC erişilemezse karar mirror'a bırakılır (aktif trade'de PII kilitlenmesin).
 * [EN] PII decisions are checked against the real on-chain state in addition to the Mongo mirror: a trade
 *      closed on-chain but not yet mirrored does not reveal PII. Results are cached briefly to avoid load;
 *      if the RPC is unreachable the mirror decides (so PII never locks up during an active trade).
 */

const { ethers } = require("ethers");
const logger = require("../utils/logger");
const { isConfiguredAddress } = require("../utils/onchain");

const GET_TRADE_ABI = [
  "function getTrade(uint256 _tradeId) view returns ((uint64 id,uint64 parentOrderId,address maker,address taker,address tokenAddress,uint256 cryptoAmount,uint256 makerBond,uint256 takerBond,uint16 takerFeeBpsSnapshot,uint16 makerFeeBpsSnapshot,uint8 tier,uint8 paymentRiskLevelSnapshot,uint8 state,uint64 lockedAt,uint64 paidAt,uint64 challengedAt,bool cancelProposedByMaker,bool cancelProposedByTaker,uint64 pingedAt,bool pingedByTaker,uint64 challengePingedAt,bool challengePingedByMaker))",
];

// [TR] ArafEscrow.TradeState: OPEN, LOCKED, PAID, CHALLENGED, RESOLVED, CANCELED, BURNED
const ACTIVE_STATES = new Set([1, 2, 3]);
const ACTIVE_TTL_MS = 10_000;
const TERMINAL_TTL_MS = 5 * 60_000;
const RPC_TIMEOUT_MS = 2_000;
const MAX_CACHE_ENTRIES = 5_000;

let contract = null;
let contractResolved = false;
const cache = new Map();

function getContract() {
  if (contractResolved) return contract;
  contractResolved = true;
  const rpcUrl = process.env.BASE_RPC_URL;
  const address = process.env.ARAF_ESCROW_ADDRESS;
  if (!rpcUrl || !isConfiguredAddress(address)) return null;
  contract = new ethers.Contract(address, GET_TRADE_ABI, new ethers.JsonRpcProvider(rpcUrl));
  return contract;
}

function withTimeout(promise, ms) {
  let timer;
  return Promise.race([
    promise,
    new Promise((_, reject) => { timer = setTimeout(() => reject(new Error("rpc timeout")), ms); }),
  ]).finally(() => clearTimeout(timer));
}

/**
 * @returns {Promise<boolean|null>} true: active on-chain, false: closed on-chain, null: unknown (no RPC / error)
 */
async function isTradeActiveOnChain(onchainId, { reader = getContract(), now = Date.now() } = {}) {
  const id = String(onchainId ?? "");
  if (!reader || !/^[1-9]\d*$/.test(id)) return null;

  const hit = cache.get(id);
  if (hit && hit.expiresAt > now) return hit.active;

  try {
    const trade = await withTimeout(reader.getTrade(BigInt(id)), RPC_TIMEOUT_MS);
    const active = ACTIVE_STATES.has(Number(trade.state));
    if (cache.size >= MAX_CACHE_ENTRIES) cache.clear();
    cache.set(id, { active, expiresAt: now + (active ? ACTIVE_TTL_MS : TERMINAL_TTL_MS) });
    return active;
  } catch (err) {
    logger.warn(`[PII] on-chain state okunamadı (#${id}), mirror kararı geçerli: ${err.message}`);
    return null;
  }
}

function _resetForTests() {
  cache.clear();
  contract = null;
  contractResolved = false;
}

module.exports = { isTradeActiveOnChain, _resetForTests };
