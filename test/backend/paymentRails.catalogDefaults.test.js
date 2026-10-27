"use strict";

// paymentRails servisi: katalogdan türeyen varsayılan durumlar, DB kaydının korunması, bilinmeyen kod = kapalı.

function load({ doc = null, failRead = false } = {}) {
  jest.resetModules();
  const findOne = jest.fn(() => ({
    lean: failRead ? jest.fn().mockRejectedValue(new Error("db down")) : jest.fn().mockResolvedValue(doc),
  }));
  jest.doMock("../../backend/scripts/models/PaymentRailSetting", () => ({ findOne }));
  jest.doMock("../../backend/scripts/models/PaymentRailAudit", () => ({}));
  jest.doMock("../../backend/scripts/utils/logger", () => ({ info: jest.fn(), warn: jest.fn(), error: jest.fn() }));
  return require("../../backend/scripts/services/paymentRails");
}

describe("paymentRails defaults come from the catalog", () => {
  it("without a DB record: legacy 3 open, new rails closed", async () => {
    const rails = load();
    const states = await rails.getRailStates();
    for (const c of ["TR_IBAN", "US_ACH", "SEPA_IBAN"]) expect(states[c].enabled).toBe(true);
    for (const c of ["GB_FPS", "BR_PIX", "SWIFT_INTL", "MX_SPEI"]) expect(states[c].enabled).toBe(false);
    expect((await rails.getEnabledRailCodes()).sort()).toEqual(["SEPA_IBAN", "TR_IBAN", "US_ACH"]);
  });

  it("a DB record keeps its stored state (open new rail, closed legacy rail)", async () => {
    const rails = load({
      doc: { rails: { GB_FPS: { enabled: true }, US_ACH: { enabled: false } }, version: 3 },
    });
    expect(await rails.isRailEnabled("GB_FPS")).toBe(true);
    expect(await rails.isRailEnabled("US_ACH")).toBe(false);
    expect(await rails.isRailEnabled("TR_IBAN")).toBe(true);
    expect(await rails.isRailEnabled("BR_PIX")).toBe(false);
  });

  it("unknown code is closed for both isRailEnabled and isRailEnabledStrict", async () => {
    const rails = load();
    expect(await rails.isRailEnabled("NOPE_X")).toBe(false);
    expect(await rails.isRailEnabledStrict("NOPE_X")).toBe(false);
    expect(await rails.isRailEnabledStrict("")).toBe(false);
    expect(await rails.isRailEnabledStrict("tr_iban")).toBe(true);
  });

  it("cold start + DB error still uses catalog defaults (legacy open, new closed); strict gate fails closed", async () => {
    const rails = load({ failRead: true });
    const states = await rails.getRailStates();
    expect(states.TR_IBAN.enabled).toBe(true);
    expect(states.GB_FPS.enabled).toBe(false);
    await expect(rails.isRailEnabledStrict("GB_FPS")).rejects.toMatchObject({ code: "RAIL_STATE_UNAVAILABLE" });
  });

  it("listRails rows carry region, currencies, countries and defaultEnabled", async () => {
    const rails = load();
    const rows = await rails.listRails();
    const gb = rows.find((r) => r.code === "GB_FPS");
    expect(gb).toEqual(expect.objectContaining({
      region: "EUROPE", currencies: ["GBP"], countries: ["GB"], defaultEnabled: false, enabled: false, riskLevel: "HIGH",
    }));
    expect(gb.name.EN).toBeTruthy();
    const sepa = rows.find((r) => r.code === "SEPA_IBAN");
    expect(sepa.defaultEnabled).toBe(true);
    expect(sepa.countries).toEqual(expect.arrayContaining(["DE", "BG", "SI"]));
  });

  it("applyRailStatesToRiskConfig closes catalog rails by default and unknown codes", async () => {
    const rails = load();
    const out = await rails.applyRailStatesToRiskConfig({
      TR: { TR_IBAN: { enabled: true } },
      GB: { GB_FPS: { enabled: true } },
      ZZ: { NOPE_X: { enabled: true } },
    });
    expect(out.TR.TR_IBAN.enabled).toBe(true);
    expect(out.GB.GB_FPS.enabled).toBe(false);
    expect(out.ZZ.NOPE_X.enabled).toBe(false);
  });

  it("isKnownRail recognises new catalog codes", () => {
    const rails = load();
    expect(rails.isKnownRail("pl_iban")).toBe(true);
    expect(rails.isKnownRail("NOPE_X")).toBe(false);
  });
});
