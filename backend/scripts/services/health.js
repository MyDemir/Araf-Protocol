"use strict";
const mongoose = require("mongoose");
const { isReady: isRedisReady, getRedisClient } = require("../config/redis");
const CHECKPOINT_KEY = "worker:last_block";
const LAST_SAFE_BLOCK_KEY = "worker:last_safe_block";
const MAX_WORKER_LAG_BLOCKS = Number(process.env.WORKER_MAX_LAG_BLOCKS || 25);
async function getReadiness({ worker, provider } = {}) {
  const isProduction = process.env.NODE_ENV === "production";
  const mongoReady = mongoose.connection.readyState === 1;
  const redisReady = isRedisReady();
  const workerRunning = Boolean(worker?.isRunning);
  let providerReady = false;
  let currentBlock = null;
  try { if (provider) { currentBlock = await provider.getBlockNumber(); providerReady = Number.isInteger(currentBlock); } else { providerReady = Boolean(worker?.provider); } } catch { providerReady = false; }
  const requiredConfig = ["MONGODB_URI", "REDIS_URL", "JWT_SECRET", "SIWE_DOMAIN"];
  if (isProduction) requiredConfig.push("SIWE_URI", "ARAF_ESCROW_ADDRESS", "BASE_RPC_URL");
  const missingConfig = requiredConfig.filter((key) => !process.env[key]);
  let replayBootstrapReady = true;
  if (isProduction) {
    const configuredStartRaw = process.env.ARAF_DEPLOYMENT_BLOCK ?? process.env.WORKER_START_BLOCK;
    const hasConfiguredStart = configuredStartRaw !== undefined && configuredStartRaw !== null && configuredStartRaw !== "";
    let hasCheckpoint = false;
    try { const redis = getRedisClient(); const savedBlock = await redis.get(LAST_SAFE_BLOCK_KEY) ?? await redis.get(CHECKPOINT_KEY); hasCheckpoint = savedBlock !== null && savedBlock !== undefined && savedBlock !== ""; } catch { hasCheckpoint = false; }
    replayBootstrapReady = hasCheckpoint || hasConfiguredStart;
  }
  const workerState = worker?._state || "unknown";
  const lastSeenBlock = Number.isInteger(worker?._lastSeenBlock) ? worker._lastSeenBlock : null;
  const lastSafeBlock = Number.isInteger(worker?._lastSafeCheckpointBlock) ? worker._lastSafeCheckpointBlock : null;
  let workerLagBlocks = null;
  if (Number.isInteger(currentBlock) && Number.isInteger(lastSafeBlock)) workerLagBlocks = Math.max(0, currentBlock - lastSafeBlock);
  else if (Number.isInteger(currentBlock) && Number.isInteger(lastSeenBlock)) workerLagBlocks = Math.max(0, currentBlock - lastSeenBlock);
  const workerReady = workerRunning && !["stopped", "reconnecting", "replaying"].includes(workerState) && (workerLagBlocks === null || workerLagBlocks <= MAX_WORKER_LAG_BLOCKS);
  return { ok: mongoReady && redisReady && providerReady && replayBootstrapReady && workerReady && missingConfig.length === 0, checks: { mongo: mongoReady, redis: redisReady, provider: providerReady, worker: workerReady }, worker: { state: workerState, currentBlock, lastSeenBlock, lastSafeBlock, lagBlocks: workerLagBlocks, maxAllowedLagBlocks: MAX_WORKER_LAG_BLOCKS }, missingConfig };
}
function getLiveness() { return { status: "ok", timestamp: new Date().toISOString() }; }
module.exports = { getReadiness, getLiveness };
