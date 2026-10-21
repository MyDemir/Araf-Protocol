"use strict";

// B4-08: audit yazılamayınca geri alma da exception atarsa hata "uygulanmadı" DEMEMELİ, ayrı kodla alarm.
// B4-09: önbellek TTL env değeri sayı değilse önbellek sessizce devre dışı kalmamalı.

const MODELS = "../../backend/scripts/models/";
const SVC = "../../backend/scripts/services/";

function mockCommon() {
  jest.doMock("mongoose", () => ({ connection: { readyState: 1 } }));
  jest.doMock("../../backend/scripts/utils/logger", () => ({ info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() }));
}

const lean = (v) => ({ lean: async () => v, maxTimeMS() { return this; } });

describe("B4-08: geri alma exception'ı -> *_AUDIT_FAILED_APPLIED + UNAUDITED CHANGE alarmı", () => {
  beforeEach(() => { jest.resetModules(); mockCommon(); });
  afterEach(() => { jest.dontMock("mongoose"); });

  it("paymentRails", async () => {
    const updateOne = jest.fn()
      .mockResolvedValueOnce({ matchedCount: 1 })
      .mockRejectedValueOnce(new Error("net down"));
    jest.doMock(MODELS + "PaymentRailSetting", () => ({ findOne: () => lean({ key: "payment_rails", rails: {}, version: 1 }), updateOne }));
    jest.doMock(MODELS + "PaymentRailAudit", () => ({ create: jest.fn().mockRejectedValue(new Error("audit down")) }));
    const logger = require("../../backend/scripts/utils/logger");
    const svc = require(SVC + "paymentRails");
    await expect(svc.setRailEnabled("US_ACH", false, { wallet: "0xabc" })).rejects.toMatchObject({ code: "RAIL_AUDIT_FAILED_APPLIED" });
    expect(logger.error).toHaveBeenCalledWith(expect.stringContaining("UNAUDITED CHANGE"));
  });

  it("paymentRails: geri alma başarılıysa eski davranış (RAIL_AUDIT_FAILED)", async () => {
    const updateOne = jest.fn().mockResolvedValue({ matchedCount: 1 });
    jest.doMock(MODELS + "PaymentRailSetting", () => ({ findOne: () => lean({ key: "payment_rails", rails: {}, version: 1 }), updateOne }));
    jest.doMock(MODELS + "PaymentRailAudit", () => ({ create: jest.fn().mockRejectedValue(new Error("audit down")) }));
    const svc = require(SVC + "paymentRails");
    await expect(svc.setRailEnabled("US_ACH", false, { wallet: "0xabc" })).rejects.toMatchObject({ code: "RAIL_AUDIT_FAILED" });
  });

  it("runtimeSettings", async () => {
    const updateOne = jest.fn()
      .mockResolvedValueOnce({ matchedCount: 1 })
      .mockRejectedValueOnce(new Error("net down"));
    jest.doMock(MODELS + "RuntimeSetting", () => ({ findOne: () => lean({ key: "runtime_settings", values: {}, version: 1 }), updateOne }));
    jest.doMock(MODELS + "RuntimeSettingAudit", () => ({ create: jest.fn().mockRejectedValue(new Error("audit down")) }));
    const logger = require("../../backend/scripts/utils/logger");
    const svc = require(SVC + "runtimeSettings");
    await expect(svc.setSetting("WORKER_MAX_LAG_BLOCKS", 30, { wallet: "0xabc" })).rejects.toMatchObject({ code: "SETTING_AUDIT_FAILED_APPLIED" });
    expect(logger.error).toHaveBeenCalledWith(expect.stringContaining("UNAUDITED CHANGE"));
    // uygulanmış değer süreç içinde de uygulanmış görünür (geri alınmış varsayılmaz)
    expect(svc.getCachedValue("WORKER_MAX_LAG_BLOCKS")).toBe(30);
  });

  it("socialLinks", async () => {
    const updateOne = jest.fn()
      .mockResolvedValueOnce({ matchedCount: 1 })
      .mockRejectedValueOnce(new Error("net down"));
    jest.doMock(MODELS + "SocialLinkSetting", () => ({ findOne: () => lean({ key: "social_links", links: [], version: 1 }), updateOne }));
    jest.doMock(MODELS + "SocialLinkAudit", () => ({ create: jest.fn().mockRejectedValue(new Error("audit down")) }));
    const logger = require("../../backend/scripts/utils/logger");
    const svc = require(SVC + "socialLinks");
    await expect(svc.replaceLinks([], { wallet: "0xabc", expectedVersion: 1 })).rejects.toMatchObject({ code: "SOCIAL_LINKS_AUDIT_FAILED_APPLIED" });
    expect(logger.error).toHaveBeenCalledWith(expect.stringContaining("UNAUDITED CHANGE"));
  });
});

describe("B4-09: geçersiz TTL env değeri 15 sn varsayılana döner", () => {
  const saved = { ...process.env };
  beforeEach(() => { jest.resetModules(); mockCommon(); });
  afterEach(() => { process.env = { ...saved }; jest.dontMock("mongoose"); });

  it.each(["abc", "15s", "-5", ""])("paymentRails %j", async (raw) => {
    process.env.PAYMENT_RAILS_CACHE_TTL_MS = raw;
    const findOne = jest.fn(() => lean(null));
    jest.doMock(MODELS + "PaymentRailSetting", () => ({ findOne }));
    jest.doMock(MODELS + "PaymentRailAudit", () => ({}));
    const svc = require(SVC + "paymentRails");
    await svc.getRailStatesDetailed();
    await svc.getRailStatesDetailed();
    expect(findOne).toHaveBeenCalledTimes(1);
  });

  it.each(["abc", "15s", "-5", ""])("runtimeSettings %j", async (raw) => {
    process.env.RUNTIME_SETTINGS_CACHE_TTL_MS = raw;
    const findOne = jest.fn(() => lean(null));
    jest.doMock(MODELS + "RuntimeSetting", () => ({ findOne }));
    jest.doMock(MODELS + "RuntimeSettingAudit", () => ({}));
    const svc = require(SVC + "runtimeSettings");
    await svc.getEffectiveSettings();
    await svc.getEffectiveSettings();
    expect(findOne).toHaveBeenCalledTimes(1);
  });

  it("geçerli değer korunur (üst sınır 30 sn)", async () => {
    process.env.PAYMENT_RAILS_CACHE_TTL_MS = "0"; // 0 = önbellek kapalı (bilinçli)
    const findOne = jest.fn(() => lean(null));
    jest.doMock(MODELS + "PaymentRailSetting", () => ({ findOne }));
    jest.doMock(MODELS + "PaymentRailAudit", () => ({}));
    const svc = require(SVC + "paymentRails");
    await svc.getRailStatesDetailed();
    await svc.getRailStatesDetailed();
    expect(findOne).toHaveBeenCalledTimes(2);
  });
});
