"use strict";

// Dalga 5 P15: B2-06 (scrub regex'i doğrusal), B2-15 (hata-benzeri dal), B2-16 (log enjeksiyonu),
// B2-20 (onchain id uzunluğu), B2-21 (runtimeValue yükleme hatasından kurtulur).

describe("errorHandler scrub (B2-06)", () => {
  test("uzun '@'sız nokta-ayrımlı string hızlı scrub edilir", () => {
    const __test = require("../../backend/scripts/middleware/errorHandler");
    const big = "a.".repeat(25_000);
    const t0 = Date.now();
    __test.scrubSensitiveText(big);
    expect(Date.now() - t0).toBeLessThan(150);
  });

  test("e-posta yine maskelenir", () => {
    const __test = require("../../backend/scripts/middleware/errorHandler");
    expect(__test.scrubSensitiveText("mail me: user.name@example.com ok")).not.toContain("example.com");
  });
});

describe("errorHandler JWT mesajı (B2-09)", () => {
  function run(mw, req) {
    return new Promise((resolve) => {
      const res = {
        status(c) { this.code = c; return this; },
        json(b) { resolve({ status: this.code, body: b }); return this; },
      };
      mw(req, res, () => resolve({ status: 200 }));
    });
  }

  function load(verifyErr) {
    let mw;
    jest.isolateModules(() => {
      jest.doMock("../../backend/scripts/utils/logger", () => ({ info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() }));
      jest.doMock("../../backend/scripts/services/siwe", () => ({
        verifyJWT: () => { throw verifyErr; },
        isJWTBlacklisted: async () => false,
        revokeRefreshToken: jest.fn(),
        blacklistJWT: jest.fn(),
      }));
      mw = require("../../backend/scripts/middleware/auth");
    });
    return mw;
  }

  test("süresi dolmuş token: sabit mesaj + TOKEN_EXPIRED, ham jsonwebtoken mesajı yok", async () => {
    const jwt = require("jsonwebtoken");
    const err = new jwt.TokenExpiredError("jwt expired", new Date());
    const { requireAuth } = load(err);
    const r = await run(requireAuth, { cookies: { araf_jwt: "x" }, headers: {} });
    expect(r.status).toBe(401);
    expect(r.body.code).toBe("TOKEN_EXPIRED");
    expect(JSON.stringify(r.body)).not.toMatch(/jwt expired/i);
  });

  test("imza hatası: sabit mesaj + TOKEN_INVALID", async () => {
    const jwt = require("jsonwebtoken");
    const { requireAuth } = load(new jwt.JsonWebTokenError("invalid signature"));
    const r = await run(requireAuth, { cookies: { araf_jwt: "x" }, headers: {} });
    expect(r.status).toBe(401);
    expect(r.body.code).toBe("TOKEN_INVALID");
    expect(JSON.stringify(r.body)).not.toMatch(/invalid signature/i);
  });

  test("PII token imza hatası da ham mesaj sızdırmaz", async () => {
    const jwt = require("jsonwebtoken");
    const { requirePIIToken } = load(new jwt.JsonWebTokenError("jwt malformed"));
    const r = await run(requirePIIToken, { params: { tradeId: "a".repeat(24) }, headers: { authorization: "Bearer abc" } });
    expect(r.status).toBe(401);
    expect(r.body.code).toBe("TOKEN_INVALID");
    expect(JSON.stringify(r.body)).not.toMatch(/malformed/i);
  });

  test("mevcut Türkçe sabit mesajlar korunur (cookie yok)", async () => {
    const { requireAuth } = load(new Error("x"));
    const r = await run(requireAuth, { cookies: {}, headers: {} });
    expect(r.status).toBe(401);
    expect(r.body.error).toBe("Oturum bulunamadı. Lütfen giriş yapın.");
  });
});

describe("logRedaction hata-benzeri dal (B2-15)", () => {
  const { redactLogMeta } = require("../../backend/scripts/utils/logRedaction");

  test("Error olmayan nesne anahtar bazlı maskelemeden geçer (name/iban maskelenir, bağlam korunur)", () => {
    const out = redactLogMeta({ user: { name: "Ad Soyad", iban: "TR120006200011001000000001", code: "X1", tradeId: 5 } });
    expect(out.user.name).toBe("[REDACTED]");
    expect(out.user.iban).toBe("[REDACTED]");
    expect(out.user.code).toBe("X1");
    expect(out.user.tradeId).toBe(5);
  });

  test("gerçek Error özetlenmeye devam eder", () => {
    const e = new Error("boom 0x" + "1".repeat(40));
    const out = redactLogMeta({ err: e });
    expect(out.err.message).toContain("[WALLET]");
    expect(out.err.name).toBe("Error");
  });
});

describe("logger tek-satır (B2-16)", () => {
  test("mesajdaki CR/LF sahte log satırı üretmez", () => {
    const logger = jest.requireActual("../../backend/scripts/utils/logger");
    const info = { level: "warn", message: "[GÜVENLİK] key: $x\n2026-01-01 00:00:00 [INFO]: Giris basarili\r\nX" };
    const out = logger.redactInfo().transform({ ...info });
    expect(out.message).not.toMatch(/[\r\n]/);
    expect(out.message).toContain("Giris basarili");
  });
});

describe("app onSanitize anahtarı (B2-16)", () => {
  test("app.js sanitize logu anahtarı JSON.stringify ile kaçırır", () => {
    const src = require("fs").readFileSync(require.resolve("../../backend/scripts/app"), "utf8");
    expect(src).toMatch(/onSanitize:[^\n]*JSON\.stringify\(String\(key\)/);
  });
});

describe("parsePositiveOnchainId (B2-20)", () => {
  const { parsePositiveOnchainId } = require("../../backend/scripts/utils/onchain");
  test("uint256 sınırı (78 hane) aşılırsa null", () => {
    expect(parsePositiveOnchainId("1".repeat(78))).toBe("1".repeat(78));
    expect(parsePositiveOnchainId("1".repeat(79))).toBeNull();
    expect(parsePositiveOnchainId("7")).toBe("7");
  });
});

describe("runtimeValue (B2-21)", () => {
  afterEach(() => jest.resetModules());
  test("ilk yükleme hatası kalıcı önbelleklenmez; sonraki çağrı yeniden dener", () => {
    let attempts = 0;
    let rv;
    jest.isolateModules(() => {
      jest.doMock("../../backend/scripts/services/runtimeSettings", () => {
        attempts += 1;
        if (attempts === 1) throw new Error("erken yükleme");
        return { getCachedValue: () => 77, getEffectiveValue: async () => 77 };
      });
      jest.doMock("../../backend/scripts/config/runtimeSettingDefs", () => ({
        resolveValues: () => ({ values: { K: 5 } }),
        isInBounds: () => true,
      }));
      rv = require("../../backend/scripts/utils/runtimeValue");
    });
    expect(rv.runtimeValueSync("K")).toBe(5); // fallback
    expect(rv.runtimeValueSync("K")).toBe(77); // yeniden denendi
  });
});
