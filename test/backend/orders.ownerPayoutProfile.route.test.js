"use strict";

const express = require("express");
const request = require("supertest");

const WITH = "0x1111111111111111111111111111111111111111";
const WITHOUT = "0x2222222222222222222222222222222222222222";

describe("orders route owner_has_payout_profile boolean", () => {
  afterEach(() => {
    jest.resetModules();
    jest.clearAllMocks();
  });

  it("flags owners without a saved payout profile and never leaks profile data", async () => {
    const base = {
      side: "SELL_CRYPTO", status: "OPEN", tier: 1,
      token_address: "0x9999999999999999999999999999999999999999",
      market: { crypto_asset: "USDT", fiat_currency: "TRY", exchange_rate: 34 },
      amounts: { min_fill_amount_num: 10, remaining_amount_num: 50 },
    };
    const rows = [
      { ...base, _id: "507f1f77bcf86cd799439011", onchain_order_id: "11", owner_address: WITH },
      { ...base, _id: "507f1f77bcf86cd799439012", onchain_order_id: "12", owner_address: WITHOUT },
    ];
    const findChain = {
      select: jest.fn().mockReturnThis(), sort: jest.fn().mockReturnThis(),
      skip: jest.fn().mockReturnThis(), limit: jest.fn().mockReturnThis(),
      lean: jest.fn().mockResolvedValue(rows),
    };
    const Order = { find: jest.fn(() => findChain), countDocuments: jest.fn().mockResolvedValue(2), findOne: jest.fn() };
    const Trade = { aggregate: jest.fn().mockResolvedValue([]) };
    const User = {
      find: jest.fn((q) => ({
        select: () => ({
          lean: async () =>
            q["payout_profile.payout_details_enc"]
              ? [{ wallet_address: WITH }]
              : [{ wallet_address: WITH }, { wallet_address: WITHOUT }],
        }),
      })),
    };

    let router;
    jest.isolateModules(() => {
      jest.doMock("../../backend/scripts/middleware/auth", () => ({
        requireAuth: (_r, _s, n) => n(), requireSessionWalletMatch: (_r, _s, n) => n(),
      }));
      jest.doMock("../../backend/scripts/middleware/rateLimiter", () => ({
        marketReadLimiter: (_r, _s, n) => n(), ordersReadLimiter: (_r, _s, n) => n(), ordersWriteLimiter: (_r, _s, n) => n(),
      }));
      jest.doMock("../../backend/scripts/models/Order", () => Order);
      jest.doMock("../../backend/scripts/models/Trade", () => Trade);
      jest.doMock("../../backend/scripts/models/User", () => User);
      jest.doMock("../../backend/scripts/services/protocolConfig", () => ({ getConfig: jest.fn(() => ({ bondMap: {}, feeConfig: {}, cooldownConfig: {}, tokenMap: {} })) }));
      router = require("../../backend/scripts/routes/orders");
    });
    const app = express();
    app.use("/api/orders", router);

    const res = await request(app).get("/api/orders");
    expect(res.status).toBe(200);
    const byOwner = Object.fromEntries(res.body.orders.map((o) => [o.owner_address, o]));
    expect(byOwner[WITH].owner_has_payout_profile).toBe(true);
    expect(byOwner[WITHOUT].owner_has_payout_profile).toBe(false);
    expect(JSON.stringify(res.body)).not.toContain("payout_details_enc");
  });
});
