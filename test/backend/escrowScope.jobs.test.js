"use strict";

// Escrow kapsamı: statsSnapshot, rewardOutcomeRecorder, auth (aktif trade kilidi), terminalStats yazımı.

const express = require("express");
const request = require("supertest");
const { createMemoryModel } = require("./helpers/memoryModel");

const ACTIVE = "0xa042e919978e929e4d8f9bef73f9a2bcffefee8d";
const LEGACY = "legacy:0x1111111111111111111111111111111111111111";
const ORIGINAL_ENV = { ...process.env };

beforeEach(() => {
  process.env.ARAF_ESCROW_ADDRESS = ACTIVE;
  process.env.EXPECTED_CHAIN_ID = "84532";
});
afterEach(() => {
  process.env = { ...ORIGINAL_ENV };
  jest.resetModules();
  jest.clearAllMocks();
});

const logger = () => ({ info: jest.fn(), warn: jest.fn(), error: jest.fn() });

describe("statsSnapshot: every query is escrow scoped", () => {
  it("passes escrow_address to all Trade/Order/TerminalTradeStat queries", async () => {
    const seen = [];
    const record = (name) => (arg) => {
      const stages = Array.isArray(arg) ? arg : null;
      seen.push({ name, filter: stages ? (stages.find((s) => s.$match) || {}).$match : arg });
    };
    const Trade = {
      countDocuments: jest.fn(async (f) => { record("Trade.count")(f); return 0; }),
      aggregate: jest.fn(async (p) => { record("Trade.agg")(p); return []; }),
    };
    const Counter = {
      countDocuments: jest.fn(async (f) => { record("Stat.count")(f); return 0; }),
      aggregate: jest.fn(async (p) => { record("Stat.agg")(p); return []; }),
    };
    const Order = { countDocuments: jest.fn(async (f) => { record("Order.count")(f); return 0; }) };
    let mod;
    jest.isolateModules(() => {
      jest.doMock("../../backend/scripts/models/Trade", () => Trade);
      jest.doMock("../../backend/scripts/models/TerminalTradeStat", () => Counter);
      jest.doMock("../../backend/scripts/models/Order", () => Order);
      jest.doMock("../../backend/scripts/models/HistoricalStat", () => ({}));
      jest.doMock("../../backend/scripts/utils/logger", logger);
      jest.doMock("../../backend/scripts/services/protocolConfig", () => ({ getConfig: () => ({ tokenMap: {} }) }));
      mod = require("../../backend/scripts/jobs/statsSnapshot");
    });
    await mod.computeCurrentStats();
    expect(seen.length).toBeGreaterThanOrEqual(15);
    const unscoped = seen.filter((s) => !s.filter || s.filter.escrow_address !== ACTIVE);
    expect(unscoped).toEqual([]);
  });
});

describe("rewardOutcomeRecorder: only the active escrow's trades", () => {
  it("with the same id in legacy and active, only the active trade is sent and marked", async () => {
    const resolvedAt = new Date();
    const mk = (escrow, marker) => ({
      resolution_type: "MANUAL_RELEASE", tier: 1, onchain_escrow_id: "2", escrow_address: escrow, marker,
      timers: { resolved_at: resolvedAt, reward_recorded_at: null },
    });
    const Trade = createMemoryModel([mk(LEGACY, "old"), mk(ACTIVE, "new")]);
    jest.doMock("../../backend/scripts/models/Trade", () => Trade);
    jest.doMock("../../backend/scripts/utils/logger", logger);
    const { runRewardOutcomeRecorder, REWARDABLE_RESOLUTION_TYPES } = require("../../backend/scripts/jobs/rewardOutcomeRecorder");
    expect(REWARDABLE_RESOLUTION_TYPES).toContain("MANUAL_RELEASE");
    const contract = {
      epochDuration: jest.fn().mockResolvedValue(7n * 24n * 3600n),
      claimDelay: jest.fn().mockResolvedValue(24n * 3600n),
      recordTradeOutcomes: jest.fn().mockResolvedValue({ hash: "0xtx", wait: jest.fn().mockResolvedValue({ blockNumber: 1 }) }),
    };
    const res = await runRewardOutcomeRecorder({ contract });
    expect(res).toEqual(expect.objectContaining({ success: true, recorded: 1 }));
    expect(contract.recordTradeOutcomes).toHaveBeenCalledWith([2n]);
    expect(Trade.find.mock.calls[0][0]).toMatchObject({ escrow_address: ACTIVE });
    expect(Trade.updateMany.mock.calls[0][0]).toMatchObject({ escrow_address: ACTIVE });
    const legacy = Trade.docs.find((d) => d.escrow_address === LEGACY);
    const fresh = Trade.docs.find((d) => d.escrow_address === ACTIVE);
    expect(legacy.timers.reward_recorded_at).toBeNull();
    expect(fresh.timers.reward_recorded_at).toBeInstanceOf(Date);
  });
});

describe("terminalStats: counter rows carry the active escrow", () => {
  it("upserts by {escrow_address, trade_key} so the old contract's row is never reused", async () => {
    const Stat = { updateOne: jest.fn().mockResolvedValue({}) };
    jest.doMock("../../backend/scripts/models/TerminalTradeStat", () => Stat);
    const { recordTerminalTradeStat } = require("../../backend/scripts/services/terminalStats");
    await recordTerminalTradeStat({ status: "RESOLVED", onchain_escrow_id: "2", financials: {}, timers: {} });
    const [filter, update] = Stat.updateOne.mock.calls[0];
    expect(filter).toEqual({ escrow_address: ACTIVE, trade_key: "2" });
    expect(update.$setOnInsert).toMatchObject({ escrow_address: ACTIVE, chain_id: 84532, trade_key: "2" });
  });
});

describe("auth: active-trade profile lock only counts the active escrow", () => {
  function buildApp(trades) {
    const Trade = createMemoryModel(trades);
    let app;
    jest.isolateModules(() => {
      const existingUser = {
        wallet_address: "0x1111111111111111111111111111111111111111",
        profileVersion: 1,
        lastBankChangeAt: null,
        bankChangeCount7d: 0,
        bankChangeCount30d: 0,
        payout_profile: { payout_details_enc: "enc", fingerprint: { version: 0 } },
        markBankProfileChanged: jest.fn(),
        recomputeBankChangeCounters: jest.fn(),
        save: jest.fn().mockResolvedValue(),
      };
      const UserMock = {
        findOne: jest.fn().mockReturnValue({ select: jest.fn().mockResolvedValue(existingUser) }),
        updateOne: jest.fn(async () => { await existingUser.save(); return { matchedCount: 1 }; }),
      };
      jest.doMock("../../backend/scripts/middleware/auth", () => ({
        requireAuth: (req, _res, next) => { req.wallet = "0x1111111111111111111111111111111111111111"; next(); },
        requireSessionWalletMatch: (_req, _res, next) => next(),
      }));
      jest.doMock("../../backend/scripts/services/paymentRails", () => require("./helpers/paymentRailsPassthrough"));
      jest.doMock("../../backend/scripts/middleware/rateLimiter", () => ({
        authLimiter: (_req, _res, next) => next(),
        nonceLimiter: (_req, _res, next) => next(),
      }));
      jest.doMock("../../backend/scripts/services/siwe", () => ({
        generateNonce: jest.fn(), verifySiweSignature: jest.fn(), getSiweConfig: jest.fn(), issueJWT: jest.fn(),
        issueRefreshToken: jest.fn(), rotateRefreshToken: jest.fn(), revokeRefreshToken: jest.fn(), blacklistJWT: jest.fn(),
      }));
      jest.doMock("../../backend/scripts/services/encryption", () => ({
        encryptPayoutProfile: jest.fn().mockResolvedValue({
          rail: "TR_IBAN", country: "TR", contact: { channel: "telegram", value_enc: "enc" },
          payout_details_enc: "enc", fingerprint: { version: 1, hash: "hash" },
        }),
        decryptPayoutProfile: jest.fn().mockResolvedValue({
          rail: "TR_IBAN", country: "TR", contact: { channel: "telegram", value: "tester1" },
          fields: { account_holder_name: "Test User", iban: "TR963456789012345678901234", bank_name: "Bank" },
        }),
        buildPayoutFingerprintHmac: jest.fn().mockImplementation(async (details) => JSON.stringify(details)),
      }));
      jest.doMock("../../backend/scripts/models/User", () => UserMock);
      jest.doMock("../../backend/scripts/models/Trade", () => Trade);
      jest.doMock("../../backend/scripts/utils/logger", logger);
      const router = require("../../backend/scripts/routes/auth");
      app = express();
      app.use(express.json());
      app.use("/api/auth", router);
      app.use((err, _req, res, _next) => res.status(500).json({ error: err.message }));
    });
    return { app, Trade };
  }

  const payload = {
    payoutProfile: {
      rail: "TR_IBAN",
      country: "TR",
      contact: { channel: "email", value: "a@b.com" },
      fields: {
        account_holder_name: "Test User", iban: "TR963456789012345678901234",
        routing_number: null, account_number: null, account_type: null, bic: null, bank_name: null,
      },
    },
  };
  const openTrade = (escrow) => ({
    escrow_address: escrow,
    status: "LOCKED",
    maker_address: "0x1111111111111111111111111111111111111111",
    taker_address: "0x2222222222222222222222222222222222222222",
  });

  it("an open trade only on the legacy escrow does not lock the profile (200)", async () => {
    const { app, Trade } = buildApp([openTrade(LEGACY)]);
    const res = await request(app).put("/api/auth/profile").send(payload);
    expect(res.status).toBe(200);
    expect(Trade.exists.mock.calls[0][0]).toMatchObject({ escrow_address: ACTIVE });
  });

  it("an open trade on the active escrow still locks the profile (409)", async () => {
    const { app } = buildApp([openTrade(LEGACY), openTrade(ACTIVE)]);
    const res = await request(app).put("/api/auth/profile").send(payload);
    expect(res.status).toBe(409);
  });
});
