"use strict";

const mongoose = require("mongoose");
const { isReady: isRedisReady } = require("../config/redis");

async function getReadiness({ worker, provider } = {}) {
  const mongoReady = mongoose.connection.readyState === 1;
  const redisReady = isRedisReady();
  const workerReady = Boolean(worker?.isRunning);
  let providerReady = false;

  try {
    if (provider) {
      await provider.getBlockNumber();
      providerReady = true;
    } else {
      providerReady = Boolean(worker?.provider);
    }
  } catch {
    providerReady = false;
  }

  const requiredConfig = [
    "MONGODB_URI",
    "REDIS_URL",
    "ARAF_ESCROW_ADDRESS",
    "JWT_SECRET",
    "SIWE_DOMAIN",
  ];
  const missingConfig = requiredConfig.filter((key) => !process.env[key]);
  const configReady = missingConfig.length === 0;

  return {
    ok: mongoReady && redisReady && workerReady && providerReady && configReady,
    checks: {
      mongo: mongoReady,
      redis: redisReady,
      worker: workerReady,
      provider: providerReady,
      config: configReady,
    },
    missingConfig,
  };
}

function getLiveness() {
  return { status: "ok", timestamp: new Date().toISOString() };
}

module.exports = { getReadiness, getLiveness };
