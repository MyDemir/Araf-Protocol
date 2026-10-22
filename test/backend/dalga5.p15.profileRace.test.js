"use strict";

// Dalga 5 P15 (şef kararı): PUT /api/auth/profile oku-değiştir-kaydet yarışı.
// İki eşzamanlı istek aynı eski durumu okur; kayıt koşullu/atomik değilse biri diğerinin değişikliğini ezer
// (profileVersion iki gerçek değişiklikte 1'de kalır, ya da eski şifreli detay yenisinin üzerine yazılır).

const request = require("supertest");
const express = require("express");

const WALLET = "0x1111111111111111111111111111111111111111";

function body(iban) {
  return {
    payoutProfile: {
      rail: "TR_IBAN",
      country: "TR",
      contact: { channel: "telegram", value: "tester1" },
      fields: {
        account_holder_name: "Test User", iban,
        routing_number: null, account_number: null, account_type: null, bic: null, bank_name: "Bank",
      },
    },
  };
}

function build() {
  const store = {
    wallet_address: WALLET,
    profileVersion: 0,
    lastBankChangeAt: null,
    bankChangeCount7d: 0,
    bankChangeCount30d: 0,
    bank_change_history: [],
    payout_profile: { rail: "TR_IBAN", country: "TR", payout_details_enc: "enc-0", fingerprint: { version: 0 } },
  };
  let encSeq = 0;
  let readers = 0;
  let releaseReaders;
  const gate = new Promise((r) => { releaseReaders = r; });

  function snapshot() {
    const doc = JSON.parse(JSON.stringify(store));
    doc.markBankProfileChanged = function mark(now) {
      this.profileVersion += 1;
      this.bank_change_history.push(now);
      this.bankChangeCount7d = this.bank_change_history.length;
      this.bankChangeCount30d = this.bank_change_history.length;
      this.lastBankChangeAt = now;
    };
    doc.recomputeBankChangeCounters = jest.fn();
    // Mongoose save() semantiği: değişen alanları koşulsuz yazar.
    doc.save = jest.fn(async function save() {
      for (const k of ["profileVersion", "bank_change_history", "bankChangeCount7d", "bankChangeCount30d", "lastBankChangeAt", "payout_profile"]) {
        store[k] = this[k];
      }
    });
    return doc;
  }

  const User = jest.fn();
  User.findOne = jest.fn(() => ({
    select: async () => {
      const doc = snapshot();
      readers += 1;
      if (readers === 2) releaseReaders();
      await gate; // iki istek de aynı eski durumu okusun
      return doc;
    },
  }));
  User.updateOne = jest.fn(async (filter, update) => {
    const eq = (cond, actual) =>
      cond !== null && typeof cond === "object" && Array.isArray(cond.$in) ? cond.$in.includes(actual) : cond === actual;
    const match =
      filter.wallet_address === store.wallet_address &&
      eq(filter.profileVersion, store.profileVersion) &&
      eq(filter["payout_profile.payout_details_enc"], store.payout_profile.payout_details_enc);
    if (!match) return { matchedCount: 0, modifiedCount: 0 };
    Object.assign(store, update.$set);
    return { matchedCount: 1, modifiedCount: 1 };
  });

  let app;
  jest.isolateModules(() => {
    jest.doMock("../../backend/scripts/middleware/auth", () => ({
      requireAuth: (req, _res, next) => { req.wallet = WALLET; next(); },
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
      encryptPayoutProfile: jest.fn(async () => {
        encSeq += 1;
        return { rail: "TR_IBAN", country: "TR", contact: { channel: "telegram", value_enc: "c" }, payout_details_enc: `enc-new-${encSeq}`, fingerprint: { version: 1, hash: "h" } };
      }),
      decryptPayoutProfile: jest.fn().mockResolvedValue({
        rail: "TR_IBAN", country: "TR", contact: { channel: "telegram", value: "tester1" },
        fields: { account_holder_name: "Test User", iban: "TR120006200011001000000001", bank_name: "Bank" },
      }),
      buildPayoutFingerprintHmac: jest.fn(async (d) => JSON.stringify(d)),
    }));
    jest.doMock("../../backend/scripts/models/User", () => User);
    jest.doMock("../../backend/scripts/models/Trade", () => ({ exists: jest.fn().mockResolvedValue(false) }));
    jest.doMock("../../backend/scripts/utils/logger", () => ({ info: jest.fn(), warn: jest.fn(), error: jest.fn() }));
    const router = require("../../backend/scripts/routes/auth");
    app = express();
    app.use(express.json());
    app.use("/api/auth", router);
    app.use((err, _req, res, _next) => res.status(500).json({ error: err.message }));
  });
  return { app, store };
}

afterEach(() => jest.resetModules());

describe("PUT /profile updateOne doğrulayıcıları", () => {
  test("updateOne runValidators:true ile çağrılır (save() ile eşdeğer enum/min kontrolü)", async () => {
    const { app } = build();
    const User = require("../../backend/scripts/models/User");
    // iki istek okuma kapısını birlikte açar
    await Promise.all([
      request(app).put("/api/auth/profile").send(body("TR330006100519786457841326")),
      request(app).put("/api/auth/profile").send(body("TR963456789012345678901234")),
    ]);
    expect(User.updateOne).toHaveBeenCalled();
    for (const call of User.updateOne.mock.calls) {
      expect(call[2]).toMatchObject({ runValidators: true });
    }
  });

  test("gerçek User şeması geçersiz rail enum'unu $set içinde reddeder", async () => {
    const mongoose = require("mongoose");
    const UserModel = jest.requireActual("../../backend/scripts/models/User");
    const q = UserModel.updateOne({ wallet_address: WALLET }, { $set: { "payout_profile.rail": "BAD_RAIL" } }, { runValidators: true });
    await expect(q.exec()).rejects.toThrow(/BAD_RAIL|enum|validation/i);
    expect(mongoose).toBeDefined();
  });
});

describe("PUT /profile eşzamanlı yazım (kayıp güncelleme yok)", () => {
  test("iki eşzamanlı banka değişikliği: ya ikisi de uygulanır ya kaybeden 409 alır; sürüm başarı sayısına eşit", async () => {
    const { app, store } = build();
    const [a, b] = await Promise.all([
      request(app).put("/api/auth/profile").send(body("TR330006100519786457841326")),
      request(app).put("/api/auth/profile").send(body("TR963456789012345678901234")),
    ]);
    const successes = [a, b].filter((r) => r.status === 200).length;
    expect(successes).toBeGreaterThanOrEqual(1);
    expect([a.status, b.status].filter((s) => s !== 200)).toEqual(successes === 1 ? [409] : []);
    expect(store.profileVersion).toBe(successes);
    expect(store.bank_change_history).toHaveLength(successes);
  });
});
