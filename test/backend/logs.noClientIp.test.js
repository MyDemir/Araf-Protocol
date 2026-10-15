"use strict";

const express = require("express");
const request = require("supertest");

const TEST_IP = "203.0.113.7";

function flatten(calls) {
  return JSON.stringify(calls);
}

describe("client IP is never written to logs", () => {
  let logger;

  beforeEach(() => {
    jest.resetModules();
    logger = { info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() };
    jest.doMock("../../backend/scripts/utils/logger", () => logger);
  });

  afterEach(() => {
    jest.dontMock("../../backend/scripts/utils/logger");
    jest.dontMock("../../backend/scripts/config/redis");
    jest.dontMock("rate-limit-redis");
    jest.dontMock("express-rate-limit");
    jest.dontMock("../../backend/scripts/middleware/rateLimiter");
  });

  it("[FRONTEND-CRASH] log omits ip", async () => {
    jest.doMock("../../backend/scripts/middleware/rateLimiter", () => ({
      clientLogLimiter: (_req, _res, next) => next(),
    }));
    const router = require("../../backend/scripts/routes/logs");
    const app = express();
    app.use(express.json());
    app.use((req, _res, next) => {
      Object.defineProperty(req, "ip", { value: TEST_IP });
      next();
    });
    app.use("/api/logs", router);

    const res = await request(app).post("/api/logs/client-error").send({ message: "boom" });
    expect(res.status).toBe(204);
    expect(logger.error).toHaveBeenCalledWith("[FRONTEND-CRASH]", expect.any(Object));
    const payload = logger.error.mock.calls[0][1];
    expect(payload).not.toHaveProperty("ip");
    expect(flatten(logger.error.mock.calls)).not.toContain(TEST_IP);
  });

  it("[SERVER ERROR] log omits ip", () => {
    const { globalErrorHandler } = require("../../backend/scripts/middleware/errorHandler");
    const req = { path: "/x", method: "GET", ip: TEST_IP, body: {}, wallet: undefined };
    const res = { headersSent: false, status: jest.fn().mockReturnThis(), json: jest.fn() };
    globalErrorHandler(new Error("fail"), req, res, jest.fn());
    expect(logger.error).toHaveBeenCalled();
    expect(logger.error.mock.calls[0][0]).toBe("[SERVER ERROR]");
    expect(logger.error.mock.calls[0][1]).not.toHaveProperty("ip");
    expect(flatten(logger.error.mock.calls)).not.toContain(TEST_IP);
  });

  it("[RateLimit] Engellendi log omits ip and keeps path + wallet", () => {
    const captured = [];
    jest.doMock("../../backend/scripts/config/redis", () => ({
      getRedisClient: () => ({ sendCommand: jest.fn() }),
      isReady: () => true,
    }));
    jest.doMock("rate-limit-redis", () => ({ RedisStore: class {} }));
    jest.doMock("express-rate-limit", () => (opts) => {
      captured.push(opts);
      return (_req, _res, next) => next();
    });
    require("../../backend/scripts/middleware/rateLimiter");

    const handler = captured.find((o) => typeof o.handler === "function").handler;
    const res = { status: jest.fn().mockReturnThis(), json: jest.fn() };
    handler({ ip: TEST_IP, path: "/api/auth/nonce", wallet: "anon-wallet" }, res);

    expect(logger.warn).toHaveBeenCalledWith(
      "[RateLimit] Engellendi: /api/auth/nonce | wallet: anon-wallet"
    );
    expect(flatten(logger.warn.mock.calls)).not.toContain(TEST_IP);
    expect(res.status).toHaveBeenCalledWith(429);
  });
});
