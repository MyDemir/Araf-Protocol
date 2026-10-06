"use strict";

const TerminalTradeStat = require("../models/TerminalTradeStat");

const TERMINAL = new Set(["RESOLVED", "CANCELED", "BURNED"]);

function _big(value) {
  const text = String(value ?? "0");
  return /^\d+$/.test(text) ? BigInt(text) : 0n;
}

/**
 * [TR] Trade belgesinden (veya lean obje) kalıcı sayaç satırını üretir. Terminal değilse null.
 * [EN] Builds the permanent counter row from a trade document; null when not terminal.
 */
function buildTerminalStatDoc(trade) {
  if (!trade || !TERMINAL.has(trade.status)) return null;
  const key = trade.onchain_escrow_id;
  if (key === null || key === undefined || key === "") return null;

  const lockedAt = trade.timers?.locked_at ? new Date(trade.timers.locked_at) : null;
  const resolvedAt = trade.timers?.resolved_at ? new Date(trade.timers.resolved_at) : null;
  const durationMs = lockedAt && resolvedAt ? Math.max(0, resolvedAt.getTime() - lockedAt.getTime()) : 0;
  const burned = _big(trade.financials?.total_decayed) + _big(trade.financials?.burned_amount);

  return {
    trade_key: String(key),
    status: trade.status,
    token_address: trade.token_address ? String(trade.token_address).toLowerCase() : null,
    crypto_amount: String(trade.financials?.crypto_amount ?? "0"),
    crypto_amount_num: Number(trade.financials?.crypto_amount_num || 0),
    burned_amount: burned.toString(),
    burned_amount_num:
      Number(trade.financials?.total_decayed_num || 0) + Number(trade.financials?.burned_amount_num || 0),
    locked_at: lockedAt,
    resolved_at: resolvedAt,
    duration_ms: durationMs,
  };
}

/**
 * [TR] İdempotent: trade başına bir kez ($setOnInsert + unique trade_key). Tekrar çağrı sayacı artırmaz.
 * [EN] Idempotent: once per trade ($setOnInsert on unique trade_key); replays never double count.
 */
async function recordTerminalTradeStat(trade, { session } = {}) {
  const doc = buildTerminalStatDoc(trade);
  if (!doc) return false;
  await TerminalTradeStat.updateOne(
    { trade_key: doc.trade_key },
    { $setOnInsert: doc },
    { upsert: true, ...(session ? { session } : {}) }
  );
  return true;
}

module.exports = { buildTerminalStatDoc, recordTerminalTradeStat };
