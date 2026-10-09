"use strict";

const request = require("supertest");
const express = require("express");

jest.mock("../../backend/scripts/services/protocolConfig", () => ({
  getConfig: jest.fn(() => ({
    bondMap: { 1: { maker: 800, taker: 1000 } },
    feeConfig: { currentTakerFeeBps: 10, currentMakerFeeBps: 5 },
    cooldownConfig: { currentTier0TradeCooldown: 3600, currentTier1TradeCooldown: 600 },
    tokenMap: {
      usdt: {
        supported: true,
        allowSellOrders: true,
        allowBuyOrders: true,
        decimals: 6,
        tierMaxAmountsBaseUnit: ["150000000", "1500000000", "7500000000", "30000000000"],
      },
    },
    paymentRiskConfig: {
      TR: {
        TR_IBAN: {
          riskLevel: "MEDIUM",
          minBondSurchargeBps: 0,
          feeSurchargeBps: 0,
          warningKey: "BANK_TRANSFER_CONFIRMATION_REQUIRED",
          enabled: true,
          description: { TR: "x", EN: "y" },
        },
      },
    },
  })),
}));

jest.mock("../../backend/scripts/middleware/auth", () => ({
  requireAuth: (_req, _res, next) => next(),
  requireSessionWalletMatch: (_req, _res, next) => next(),
}));

jest.mock("../../backend/scripts/services/paymentRails", () => require("./helpers/paymentRailsPassthrough"));
jest.mock("../../backend/scripts/middleware/rateLimiter", () => ({
  marketReadLimiter: (_req, _res, next) => next(),
  ordersReadLimiter: (_req, _res, next) => next(),
  ordersWriteLimiter: (_req, _res, next) => next(),
}));

describe("GET /api/orders/config", () => {
  it("orders_config_exposes_token_decimals_and_tier_limits", async () => {
    const router = require("../../backend/scripts/routes/orders");
    const app = express();
    app.use("/api/orders", router);

    const res = await request(app).get("/api/orders/config").expect(200);
    expect(res.body).toHaveProperty("bondMap");
    expect(res.body).toHaveProperty("feeConfig");
    expect(res.body).toHaveProperty("cooldownConfig");
    expect(res.body).toHaveProperty("tokenMap");
    expect(res.body).toHaveProperty("paymentRiskConfig");
    expect(res.body).toHaveProperty("selectedOrderRiskLevel");
    // [TR] Politika event'i henüz görülmediyse null döner; frontend kontrat varsayılanına düşer.
    expect(res.body.reputationPolicy).toBeNull();
    expect(res.body.feeConfig.currentTakerFeeBps).toBe(10);
    expect(res.body.tokenMap.usdt.decimals).toBe(6);
    expect(res.body.paymentRiskConfig.TR.TR_IBAN.riskLevel).toBe("MEDIUM");
    expect(res.body.tokenMap.usdt.tierMaxAmountsBaseUnit).toEqual([
      "150000000",
      "1500000000",
      "7500000000",
      "30000000000",
    ]);
  });

  it("orders_config_exposes_deployment_alignment_fields", async () => {
    const prev = { a: process.env.ARAF_ESCROW_ADDRESS, c: process.env.EXPECTED_CHAIN_ID };
    process.env.ARAF_ESCROW_ADDRESS = "0xABCDEFabcdefABCDEFabcdefABCDEFabcdefABCD";
    process.env.EXPECTED_CHAIN_ID = "8453";
    try {
      const router = require("../../backend/scripts/routes/orders");
      const app = express();
      app.use("/api/orders", router);
      const res = await request(app).get("/api/orders/config").expect(200);
      expect(res.body.deployment).toEqual({ escrowAddress: "0xabcdefabcdefabcdefabcdefabcdefabcdefabcd", chainId: 8453 });
    } finally {
      process.env.ARAF_ESCROW_ADDRESS = prev.a;
      process.env.EXPECTED_CHAIN_ID = prev.c;
      if (prev.a === undefined) delete process.env.ARAF_ESCROW_ADDRESS;
      if (prev.c === undefined) delete process.env.EXPECTED_CHAIN_ID;
    }
  });

  it("orders_payment_risk_config_endpoint_returns_privacy_safe_config_only", async () => {
    const router = require("../../backend/scripts/routes/orders");
    const app = express();
    app.use("/api/orders", router);

    const res = await request(app).get("/api/orders/payment-risk-config").expect(200);
    expect(res.body).toStrictEqual({
      paymentRiskConfig: {
        TR: {
          TR_IBAN: {
            riskLevel: "MEDIUM",
            minBondSurchargeBps: 0,
            feeSurchargeBps: 0,
            warningKey: "BANK_TRANSFER_CONFIRMATION_REQUIRED",
            enabled: true,
            description: { TR: "x", EN: "y" },
          },
        },
      },
      enabledPaymentRails: ["TR_IBAN", "US_ACH", "SEPA_IBAN"],
      selectedOrderRiskLevel: {
        source: "onchain_order_snapshot",
        nonAuthoritative: true,
      },
    });
  });
});
