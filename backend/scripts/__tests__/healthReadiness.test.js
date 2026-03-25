"use strict";

jest.mock("../config/redis", () => ({
  isReady: jest.fn(),
}));

const mongoose = require("mongoose");
const { isReady } = require("../config/redis");
const { getReadiness } = require("../services/health");

describe("health/readiness service", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    process.env.MONGODB_URI = "mongodb://localhost/test";
    process.env.REDIS_URL = "redis://localhost:6379";
    process.env.ARAF_ESCROW_ADDRESS = "0x1111111111111111111111111111111111111111";
    process.env.JWT_SECRET = "a".repeat(70) + "XYZ123!";
    process.env.SIWE_DOMAIN = "app.araf.io";
  });

  test("returns ok=true when all checks pass", async () => {
    mongoose.connection.readyState = 1;
    isReady.mockReturnValue(true);
    const provider = { getBlockNumber: jest.fn().mockResolvedValue(123) };

    const readiness = await getReadiness({ worker: { isRunning: true, provider }, provider });
    expect(readiness.ok).toBe(true);
    expect(readiness.missingConfig).toHaveLength(0);
  });

  test("returns  missing config and failed checks", async () => {
    delete process.env.SIWE_DOMAIN;
    mongoose.connection.readyState = 0;
    isReady.mockReturnValue(false);

    const readiness = await getReadiness({ worker: { isRunning: false } });
    expect(readiness.ok).toBe(false);
    expect(readiness.checks.mongo).toBe(false);
    expect(readiness.checks.redis).toBe(false);
    expect(readiness.missingConfig).toContain("SIWE_DOMAIN");
  });
});
