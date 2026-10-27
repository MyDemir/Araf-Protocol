"use strict";

const {
  EXCLUDED_COUNTRIES,
  RAIL_CATALOG,
  REGIONS,
  getRailCodes,
  getRailByCode,
  getPublicRailCatalog,
  getCatalogCurrencies,
} = require("../../backend/scripts/config/paymentRailCatalog");
const {
  PAYMENT_RAIL_RISK_CONFIG,
  PROFILE_SUPPORTED_RAILS,
  SEPA_COUNTRY_ALLOWLIST,
  getPaymentRailRiskConfig,
  resolvePaymentRailRiskEntry,
} = require("../../backend/scripts/config/paymentRailRiskConfig");

const LEGACY = ["TR_IBAN", "US_ACH", "SEPA_IBAN"];
const SANCTIONED_OR_EXCLUDED = ["RU", "BY", "IR", "KP", "SY", "CU", "CN", "LB", "IQ", "LY", "PS", "SD", "YE", "SO", "DJ", "BI", "MR", "LC", "SC", "MU", "MN", "FK"];
const NATIONAL_ID_KEYS = ["cpf", "nric", "thai_id", "mykad", "aadhaar", "rut", "national_id"];

describe("payment rail catalog integrity", () => {
  it("has unique codes, valid regions and ISO-shaped countries/currencies", () => {
    const codes = getRailCodes();
    expect(new Set(codes).size).toBe(codes.length);
    for (const r of RAIL_CATALOG) {
      expect(r.code).toMatch(/^[A-Z]{2,5}_[A-Z0-9]+$/);
      expect(REGIONS).toContain(r.region);
      expect(r.name.TR).toBeTruthy();
      expect(r.name.EN).toBeTruthy();
      expect(r.countries.length).toBeGreaterThan(0);
      for (const c of r.countries) expect(c === "*" || /^[A-Z]{2}$/.test(c)).toBe(true);
      expect(r.currencies.length).toBeGreaterThan(0);
      for (const cur of r.currencies) expect(cur).toMatch(/^[A-Z]{3}$/);
      expect(typeof r.defaultEnabled).toBe("boolean");
      expect(typeof r.legacyCanonical).toBe("boolean");
    }
    expect(RAIL_CATALOG.length).toBeGreaterThanOrEqual(64);
  });

  it("has compilable regexes and at least one required field per rail", () => {
    for (const r of RAIL_CATALOG) {
      expect(r.fields.some((f) => f.required)).toBe(true);
      const keys = r.fields.map((f) => f.key);
      expect(new Set(keys).size).toBe(keys.length);
      for (const f of r.fields) {
        expect(f.key).toMatch(/^[a-z][a-z0-9_]*$/);
        expect(["account_holder_name", "bank_name"]).not.toContain(f.key);
        expect(NATIONAL_ID_KEYS).not.toContain(f.key);
        expect(typeof f.copyable).toBe("boolean");
        expect(["strip_spaces_upper", "strip_spaces", "trim", "trim_lower"]).toContain(f.normalize);
        if (f.pattern) expect(() => new RegExp(f.pattern)).not.toThrow();
        for (const p of Object.values(f.aliasPatterns || {})) expect(() => new RegExp(p)).not.toThrow();
        if (f.kind === "alias") {
          // alias alanı, aynı rail'de `<key>_type` enum kardeşiyle gelir
          const sibling = r.fields.find((x) => x.key === `${f.key}_type`);
          expect(sibling).toBeTruthy();
          expect(sibling.kind).toBe("enum");
          expect(sibling.options).toEqual(f.options);
          expect(Object.keys(f.aliasPatterns).sort()).toEqual([...f.options].sort());
        }
        if (f.kind === "enum") expect(f.options.length).toBeGreaterThan(0);
        if (f.checksum === "mod97") expect(f.ibanCountryLengths).toBeTruthy();
      }
    }
  });

  it("contains no sanctioned/excluded countries and no excluded rail families", () => {
    for (const r of RAIL_CATALOG) {
      for (const c of r.countries) expect(SANCTIONED_OR_EXCLUDED).not.toContain(c);
      expect(r.code).not.toMatch(/ZELLE|FEDWIRE|RTP|FEDNOW|PAYPAL|VENMO|CASHAPP|REVOLUT|WISE|CARD/);
    }
    const sepa = getRailByCode("SEPA_IBAN");
    // IBAN uzunluğu kaynakla doğrulanamayan SK, SM, VA katalogda yok
    for (const c of ["SK", "SM", "VA"]) expect(sepa.countries).not.toContain(c);
    for (const c of ["DE", "FR", "NL", "BE", "ES", "IT", "AT", "PT", "IE", "LU", "FI", "GR"]) expect(sepa.countries).toContain(c);
  });

  it("EXCLUDED_COUNTRIES is the single list and no rail lists those countries", () => {
    expect([...EXCLUDED_COUNTRIES].sort()).toEqual([...SANCTIONED_OR_EXCLUDED].sort());
    for (const r of RAIL_CATALOG) for (const c of r.countries) expect(EXCLUDED_COUNTRIES).not.toContain(c);
  });

  it("only the three legacy rails are defaultEnabled and legacyCanonical", () => {
    expect(RAIL_CATALOG.filter((r) => r.defaultEnabled).map((r) => r.code).sort()).toEqual([...LEGACY].sort());
    expect(RAIL_CATALOG.filter((r) => r.legacyCanonical).map((r) => r.code).sort()).toEqual([...LEGACY].sort());
  });

  it("new rails carry zero surcharge; US_ACH keeps its 50 bps", () => {
    for (const r of RAIL_CATALOG) {
      if (r.code === "US_ACH") expect(r.risk.minBondSurchargeBps).toBe(50);
      else expect(r.risk.minBondSurchargeBps).toBe(0);
      expect(r.risk.feeSurchargeBps).toBe(0);
      expect(["MEDIUM", "HIGH"]).toContain(r.risk.riskLevel);
    }
    for (const c of ["GB_FPS", "KE_MPESA", "CA_INTERAC", "BR_PIX", "IN_UPI", "IN_IMPS", "SWIFT_INTL", "US_ACH"]) {
      expect(getRailByCode(c).risk.riskLevel).toBe("HIGH");
    }
  });

  it("catalog is deeply frozen", () => {
    expect(Object.isFrozen(RAIL_CATALOG)).toBe(true);
    expect(Object.isFrozen(RAIL_CATALOG[0].fields[0])).toBe(true);
  });
});

describe("public catalog and currencies", () => {
  it("getPublicRailCatalog drops legacyCanonical and is a detached copy", () => {
    const pub = getPublicRailCatalog();
    expect(pub).toHaveLength(RAIL_CATALOG.length);
    expect(JSON.stringify(pub)).not.toContain("legacyCanonical");
    expect(pub[0].code).toBe(RAIL_CATALOG[0].code);
    pub[0].fields[0].key = "mutated";
    expect(RAIL_CATALOG[0].fields[0].key).not.toBe("mutated");
  });

  it("public catalog holds only schema (no PII-like values) and keeps defaultEnabled", () => {
    const pub = getPublicRailCatalog();
    expect(pub.find((r) => r.code === "GB_FPS").defaultEnabled).toBe(false);
    expect(pub.find((r) => r.code === "TR_IBAN").defaultEnabled).toBe(true);
    for (const r of pub) {
      expect(Object.keys(r).sort()).toEqual(["code", "countries", "currencies", "defaultEnabled", "fields", "name", "region", "risk"]);
    }
  });

  it("getCatalogCurrencies is a sorted union that includes TRY/USD/EUR", () => {
    const cur = getCatalogCurrencies();
    expect(cur).toEqual([...cur].sort());
    expect(new Set(cur).size).toBe(cur.length);
    expect(cur).toEqual(expect.arrayContaining(["TRY", "USD", "EUR", "GBP", "BRL", "INR", "JPY"]));
  });
});

describe("risk config derived from the catalog", () => {
  it("keeps legacy export names and bucket shape", () => {
    const cfg = getPaymentRailRiskConfig();
    expect(cfg.TR.TR_IBAN.riskLevel).toBe("MEDIUM");
    expect(cfg.TR.TR_IBAN.warningKey).toBe("BANK_TRANSFER_CONFIRMATION_REQUIRED");
    expect(cfg.US.US_ACH.minBondSurchargeBps).toBe(50);
    expect(cfg.EU.SEPA_IBAN.warningKey).toBe("SEPA_CONFIRMATION_REQUIRED");
    expect(cfg.GB.GB_FPS.riskLevel).toBe("HIGH");
    expect(cfg.INTL.SWIFT_INTL.riskLevel).toBe("HIGH");
    expect(PROFILE_SUPPORTED_RAILS.size).toBe(RAIL_CATALOG.length);
    expect(PAYMENT_RAIL_RISK_CONFIG).toBe(cfg);
    expect(SEPA_COUNTRY_ALLOWLIST.has("BG")).toBe(true);
  });

  it("resolves multi-country rails through the catalog countries", () => {
    expect(resolvePaymentRailRiskEntry("BG", "SEPA_IBAN").riskLevel).toBe("MEDIUM");
    expect(resolvePaymentRailRiskEntry("FO", "DK_IBAN")).toBeTruthy();
    expect(resolvePaymentRailRiskEntry("DE", "DK_IBAN")).toBeNull();
    expect(resolvePaymentRailRiskEntry("TR", "SEPA_IBAN")).toBeNull();
  });
});
