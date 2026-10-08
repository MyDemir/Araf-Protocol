"use strict";

jest.mock("../../backend/scripts/middleware/rateLimiter", () => ({ marketReadLimiter: (_req, _res, next) => next() }));
jest.mock("../../backend/scripts/models/RewardEpoch", () => ({}));
jest.mock("../../backend/scripts/models/RewardClaim", () => ({}));
jest.mock("../../backend/scripts/models/RewardFunding", () => ({}));

const express = require("express");
const request = require("supertest");
const router = require("../../backend/scripts/routes/rewards");

describe("GET /api/rewards/:wallet/claimable", () => {
  const app = express().use("/api/rewards", router);

  it("does not return a silent empty list; marks chain as the source", async () => {
    const wallet = "0x" + "AB".repeat(20);
    const res = await request(app).get(`/api/rewards/${wallet}/claimable`);
    expect(res.status).toBe(200);
    expect(res.body.claimable).toBeNull();
    expect(res.body.available).toBe(false);
    expect(res.body.authority).toBe("chain");
    expect(res.body.wallet).toBe(wallet.toLowerCase());
    expect(res.body.note).toMatch(/claimable\(epoch, user, token\)/);
  });

  it("rejects invalid wallets", async () => {
    const res = await request(app).get("/api/rewards/nope/claimable");
    expect(res.status).toBe(400);
  });
});
