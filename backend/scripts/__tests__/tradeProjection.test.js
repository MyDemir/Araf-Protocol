"use strict";

const express = require("express");
const request = require("supertest");

const mockFindChain = {
  select: jest.fn().mockReturnThis(),
  sort: jest.fn().mockReturnThis(),
  skip: jest.fn().mockReturnThis(),
  limit: jest.fn().mockReturnThis(),
  lean: jest.fn().mockResolvedValue([]),
};

jest.mock("../middleware/auth", () => ({
  requireAuth: (req, _res, next) => {
    req.wallet = "0xabc";
    next();
  },
}));

jest.mock("../middleware/rateLimiter", () => ({
  tradesLimiter: (_req, _res, next) => next(),
}));

jest.mock("../models/Trade", () => ({
  Trade: {
    find: jest.fn(() => mockFindChain),
    countDocuments: jest.fn().mockResolvedValue(0),
    findById: jest.fn(() => mockFindChain),
    findOne: jest.fn(() => ({ select: jest.fn().mockReturnThis(), lean: jest.fn().mockResolvedValue(null) })),
    findOneAndUpdate: jest.fn(),
  },
}));

const { Trade } = require("../models/Trade");
const routes = require("../routes/trades");

describe("Trade routes projection", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockFindChain.select.mockReturnThis();
    mockFindChain.sort.mockReturnThis();
    mockFindChain.skip.mockReturnThis();
    mockFindChain.limit.mockReturnThis();
    mockFindChain.lean.mockResolvedValue([]);
  });

  test("/my uses safe projection excluding sensitive fields", async () => {
    const app = express();
    app.use(express.json());
    app.use("/api/trades", routes);

    const res = await request(app).get("/api/trades/my");
    expect(res.status).toBe(200);

    const projection = mockFindChain.select.mock.calls[0][0];
    expect(projection).not.toContain("receipt_encrypted");
    expect(projection).not.toContain("pii_snapshot");
    expect(projection).not.toContain("maker_signature");
    expect(projection).not.toContain("ip_hash");
  });

  test("/:id also uses safe projection", async () => {
    const app = express();
    app.use(express.json());
    app.use("/api/trades", routes);

    const id = "507f191e810c19729de860ea";
    await request(app).get(`/api/trades/${id}`);

    expect(Trade.findById).toHaveBeenCalled();
    const projection = mockFindChain.select.mock.calls[0][0];
    expect(projection).toContain("evidence.ipfs_receipt_hash");
  });
});
