"use strict";

const crypto = require("crypto");
const { RAIL_CATALOG, getRailByCode } = require("../../backend/scripts/config/paymentRailCatalog");
const V = require("../../backend/scripts/services/payoutFieldValidators");

/** Verilen ülke ve toplam uzunluk için mod-97 geçerli IBAN üretir (test yardımcısı). */
function makeIban(cc, len) {
  const bbanLen = len - 4;
  let bban = "";
  for (let i = 0; bban.length < bbanLen; i += 1) bban += String((i * 7 + 3) % 10);
  const numeric = (bban + cc + "00").replace(/[A-Z]/g, (ch) => String(ch.charCodeAt(0) - 55));
  let rem = 0;
  for (const d of numeric) rem = (rem * 10 + Number(d)) % 97;
  return `${cc}${String(98 - rem).padStart(2, "0")}${bban}`;
}

const NAME = "Test User";
const ok = (rail, country, fields) => V.validatePayoutFields(rail, country, { account_holder_name: NAME, ...fields });

describe("checksum helpers", () => {
  it("mod97 accepts known-good IBANs and rejects a single-digit typo", () => {
    expect(V.isValidIbanChecksum("DE89370400440532013000")).toBe(true);
    expect(V.isValidIbanChecksum("GB82WEST12345698765432")).toBe(true);
    expect(V.isValidIbanChecksum("DE89370400440532013001")).toBe(false);
    expect(V.isValidIbanChecksum("not-an-iban")).toBe(false);
  });

  it("clabe checksum 3-7-1", () => {
    // 002010077777777771 (Banxico örnek CLABE)
    expect(V.isValidClabe("002010077777777771")).toBe(true);
    expect(V.isValidClabe("002010077777777772")).toBe(false);
    expect(V.isValidClabe("12345")).toBe(false);
  });
});

describe("generated valid IBANs pass for every catalog IBAN rail", () => {
  const ibanRails = RAIL_CATALOG.filter((r) => !r.legacyCanonical && r.fields[0].kind === "iban");
  it("covers many rails", () => expect(ibanRails.length).toBeGreaterThanOrEqual(30));
  for (const r of ibanRails) {
    it(`${r.code} accepts valid IBAN, rejects bad checksum, wrong length and foreign prefix`, () => {
      const f = r.fields[0];
      for (const [cc, len] of Object.entries(f.ibanCountryLengths)) {
        const iban = makeIban(cc, len);
        expect(ok(r.code, cc, { iban })).toBeNull();
        const flipped = iban.slice(0, -1) + ((Number(iban.slice(-1)) + 1) % 10);
        expect(ok(r.code, cc, { iban: flipped })).toMatch(/kontrol basamağı/);
        expect(ok(r.code, cc, { iban: `${iban}0` })).toMatch(/uzunluğu|biçim/);
      }
      const [cc0, len0] = Object.entries(f.ibanCountryLengths)[0];
      // ülke-rail eşleşmesi: IBAN öneki seçilen ülkeyle uyuşmalı
      expect(ok(r.code, "DE", { iban: makeIban(cc0, len0) })).toBeTruthy();
      expect(V.validateRailCountry(r.code, "DE")).toMatch(/desteklenmiyor/);
      expect(ok(r.code, cc0, {})).toMatch(/zorunlu/);
    });
  }
});

describe("rail-country matching", () => {
  it("uses catalog countries, wildcard for SWIFT_INTL", () => {
    expect(V.validateRailCountry("GB_FPS", "GB")).toBeNull();
    expect(V.validateRailCountry("GB_FPS", "US")).toMatch(/desteklenmiyor/);
    expect(V.validateRailCountry("DK_IBAN", "GL")).toBeNull();
    expect(V.validateRailCountry("SEPA_IBAN", "BG")).toBeNull();
    expect(V.validateRailCountry("SEPA_IBAN", "TR")).toBe("SEPA_IBAN için country allowlist dışı.");
    expect(V.validateRailCountry("TR_IBAN", "US")).toBe("TR_IBAN yalnız TR country ile kullanılabilir.");
    expect(V.validateRailCountry("US_ACH", "TR")).toBe("US_ACH yalnız US country ile kullanılabilir.");
    expect(V.validateRailCountry("SWIFT_INTL", "JP")).toBeNull();
    expect(V.validateRailCountry("SWIFT_INTL", "")).toBeTruthy();
    expect(V.validateRailCountry("NOPE", "TR")).toBeTruthy();
  });
});

describe("digits / alnum / phone / enum kinds", () => {
  it("GB_FPS sort code and account", () => {
    expect(ok("GB_FPS", "GB", { sort_code: "123456", account_number: "12345678" })).toBeNull();
    expect(ok("GB_FPS", "GB", { sort_code: "12345", account_number: "12345678" })).toMatch(/sort_code/);
    expect(ok("GB_FPS", "GB", { sort_code: "123456", account_number: "1234567" })).toMatch(/account_number/);
    expect(ok("GB_FPS", "GB", { sort_code: "123456" })).toMatch(/zorunlu/);
  });

  it("ZA / CA / AU / NZ / JP / KR / IN_IMPS / NG / PE patterns", () => {
    expect(ok("ZA_EFT", "ZA", { branch_code: "632005", account_number: "123456789" })).toBeNull();
    expect(ok("CA_EFT", "CA", { institution_number: "003", transit_number: "12345", account_number: "1234567" })).toBeNull();
    expect(ok("CA_EFT", "CA", { institution_number: "03", transit_number: "12345", account_number: "1234567" })).toBeTruthy();
    expect(ok("AU_BSB", "AU", { bsb: "062000", account_number: "12345678" })).toBeNull();
    expect(ok("AU_BSB", "AU", { bsb: "06200", account_number: "12345678" })).toBeTruthy();
    expect(ok("NZ_BANK", "NZ", { account_number: "123456789012345" })).toBeNull();
    expect(ok("NZ_BANK", "NZ", { account_number: "12345678901234" })).toBeTruthy();
    expect(ok("JP_ZENGIN", "JP", { bank_code: "0001", branch_code: "001", deposit_type: "ordinary", account_number: "1234567" })).toBeNull();
    expect(ok("JP_ZENGIN", "JP", { bank_code: "0001", branch_code: "001", deposit_type: "weird", account_number: "1234567" })).toMatch(/geçersiz/);
    expect(ok("KR_BANK", "KR", { bank_code: "004", account_number: "1234567890" })).toBeNull();
    expect(ok("IN_IMPS", "IN", { ifsc: "HDFC0001234", account_number: "123456789" })).toBeNull();
    expect(ok("IN_IMPS", "IN", { ifsc: "HDFC1001234", account_number: "123456789" })).toBeTruthy();
    expect(ok("NG_NIP", "NG", { bank_code: "058", account_number: "0123456789" })).toBeNull();
    expect(ok("NG_NIP", "NG", { bank_code: "058", account_number: "012345678" })).toBeTruthy();
    expect(ok("PE_CCI", "PE", { cci: "12345678901234567890" })).toBeNull();
    expect(ok("PE_CCI", "PE", { cci: "1234567890123456789" })).toBeTruthy();
  });

  it("IN_UPI vpa and KE_MPESA phone", () => {
    expect(ok("IN_UPI", "IN", { vpa: "name.surname@okhdfcbank" })).toBeNull();
    expect(ok("IN_UPI", "IN", { vpa: "no-at-sign" })).toBeTruthy();
    expect(ok("KE_MPESA", "KE", { phone_number: "+254712345678" })).toBeNull();
    expect(ok("KE_MPESA", "KE", { phone_number: "+255712345678" })).toBeTruthy();
    expect(ok("KE_MPESA", "KE", { phone_number: "0712345678" })).toBeTruthy();
  });

  it("MX_SPEI requires a CLABE with a valid check digit", () => {
    expect(ok("MX_SPEI", "MX", { clabe: "002010077777777771" })).toBeNull();
    expect(ok("MX_SPEI", "MX", { clabe: "002010077777777772" })).toMatch(/kontrol basamağı/);
    expect(ok("MX_SPEI", "MX", { clabe: "00201007777777777" })).toMatch(/biçimi/);
  });
});

describe("alias kinds", () => {
  it("BR_PIX accepts email, phone, evp and cnpj; rejects mismatched type", () => {
    expect(ok("BR_PIX", "BR", { pix_key_type: "email", pix_key: "a@b.com" })).toBeNull();
    expect(ok("BR_PIX", "BR", { pix_key_type: "phone", pix_key: "+5511987654321" })).toBeNull();
    expect(ok("BR_PIX", "BR", { pix_key_type: "evp", pix_key: "123e4567-e89b-12d3-a456-426614174000" })).toBeNull();
    expect(ok("BR_PIX", "BR", { pix_key_type: "cnpj", pix_key: "12345678000195" })).toBeNull();
    expect(ok("BR_PIX", "BR", { pix_key_type: "cnpj", pix_key: "a@b.com" })).toMatch(/biçimi/);
    expect(ok("BR_PIX", "BR", { pix_key_type: "cpf", pix_key: "12345678901" })).toMatch(/geçersiz/);
    expect(ok("BR_PIX", "BR", { pix_key: "a@b.com" })).toMatch(/zorunlu/);
  });

  it("SG / MY / TH / HK / AU / CA / ID / AR alias types", () => {
    expect(ok("SG_PAYNOW", "SG", { alias_type: "phone", alias: "+6591234567" })).toBeNull();
    expect(ok("SG_PAYNOW", "SG", { alias_type: "uen", alias: "201912345A" })).toBeNull();
    expect(ok("SG_PAYNOW", "SG", { alias_type: "email", alias: "a@b.com" })).toMatch(/geçersiz/);
    expect(ok("MY_DUITNOW", "MY", { alias_type: "business_reg", alias: "201901012345" })).toBeNull();
    expect(ok("TH_PROMPTPAY", "TH", { alias_type: "ewallet", alias: "123456789012345" })).toBeNull();
    expect(ok("TH_PROMPTPAY", "TH", { alias_type: "ewallet", alias: "12345" })).toBeTruthy();
    expect(ok("HK_FPS", "HK", { alias_type: "fps_id", alias: "1234567" })).toBeNull();
    expect(ok("AU_PAYID", "AU", { alias_type: "abn", alias: "51824753556" })).toBeNull();
    expect(ok("AU_PAYID", "AU", { alias_type: "abn", alias: "5182475355" })).toBeTruthy();
    expect(ok("CA_INTERAC", "CA", { alias_type: "email", alias: "a@b.com" })).toBeNull();
    expect(ok("ID_BIFAST", "ID", { alias_type: "phone", alias: "+6281234567890" })).toBeNull();
    expect(ok("AR_CBU", "AR", { account_alias_type: "cbu", account_alias: "1234567890123456789012" })).toBeNull();
    expect(ok("AR_CBU", "AR", { account_alias_type: "alias", account_alias: "mi.alias.cbu" })).toBeNull();
    expect(ok("AR_CBU", "AR", { account_alias_type: "cbu", account_alias: "mi.alias.cbu" })).toBeTruthy();
  });

  it("PK_RAAST optional alias needs its type, and a type needs a value", () => {
    const iban = makeIban("PK", 24);
    expect(ok("PK_RAAST", "PK", { iban })).toBeNull();
    expect(ok("PK_RAAST", "PK", { iban, alias_type: "phone", alias: "+923001234567" })).toBeNull();
    expect(ok("PK_RAAST", "PK", { iban, alias: "+923001234567" })).toMatch(/alias_type/);
    expect(ok("PK_RAAST", "PK", { iban, alias_type: "phone" })).toMatch(/alias_type/);
  });

  it("national ID aliases do not exist anywhere in the catalog", () => {
    const all = RAIL_CATALOG.flatMap((r) => r.fields.flatMap((f) => [f.key, ...(f.options || [])]));
    for (const banned of ["cpf", "nric", "thai_id", "mykad", "aadhaar", "rut"]) expect(all).not.toContain(banned);
  });
});

describe("SWIFT_INTL", () => {
  const base = { bic: "DEUTDEFF", bank_country: "DE" };
  it("treats account as IBAN for IBAN countries (prefix, length, mod97)", () => {
    expect(ok("SWIFT_INTL", "DE", { ...base, account_number: "DE89370400440532013000" })).toBeNull();
    expect(ok("SWIFT_INTL", "DE", { ...base, account_number: "DE89370400440532013001" })).toMatch(/kontrol basamağı/);
    expect(ok("SWIFT_INTL", "DE", { ...base, account_number: "FR1420041010050500013M02606" })).toMatch(/eşleşmiyor/);
    expect(ok("SWIFT_INTL", "DE", { ...base, account_number: "DE8937040044053201300" })).toMatch(/uzunluğu/);
  });
  it("GB is an IBAN country, non-IBAN countries accept a plain account", () => {
    expect(ok("SWIFT_INTL", "GB", { bic: "NWBKGB2L", bank_country: "GB", account_number: "GB82WEST12345698765432" })).toBeNull();
    expect(ok("SWIFT_INTL", "JP", { bic: "BOTKJPJT", bank_country: "JP", account_number: "1234567" })).toBeNull();
    expect(ok("SWIFT_INTL", "JP", { bic: "BOTKJP", bank_country: "JP", account_number: "1234567" })).toBeTruthy();
    expect(ok("SWIFT_INTL", "JP", { bic: "BOTKJPJT", account_number: "1234567" })).toMatch(/zorunlu/);
  });
});

describe("legacy rails keep today's validation", () => {
  it("TR_IBAN / SEPA_IBAN / US_ACH", () => {
    expect(ok("TR_IBAN", "TR", { iban: "TR963456789012345678901234" })).toBeNull();
    expect(ok("TR_IBAN", "TR", { iban: "TR963456789012345678901235" })).toMatch(/kontrol basamağı/);
    expect(ok("TR_IBAN", "TR", { iban: "DE89370400440532013000" })).toMatch(/TR formatında/);
    expect(ok("SEPA_IBAN", "DE", { iban: "DE89370400440532013000", bic: "ANYTHING" })).toBeNull();
    expect(ok("SEPA_IBAN", "FR", { iban: "DE89370400440532013000" })).toMatch(/eşleşmiyor/);
    expect(ok("SEPA_IBAN", "BG", { iban: makeIban("BG", 22) })).toBeNull();
    expect(ok("US_ACH", "US", { routing_number: "021000021", account_number: "1234567890", account_type: "checking" })).toBeNull();
    expect(ok("US_ACH", "US", { routing_number: "02100002", account_number: "1234567890", account_type: "checking" })).toMatch(/routing/);
    expect(ok("US_ACH", "US", { routing_number: "021000021", account_number: "1234567890", account_type: null })).toMatch(/account_type/);
  });

  it("every SEPA country has a registry length and a generated IBAN validates", () => {
    const sepa = getRailByCode("SEPA_IBAN");
    for (const c of sepa.countries) {
      expect(sepa.fields[0].ibanCountryLengths[c]).toBeGreaterThan(10);
      expect(ok("SEPA_IBAN", c, { iban: makeIban(c, sepa.fields[0].ibanCountryLengths[c]) })).toBeNull();
    }
  });
});

describe("unrelated legacy keys are not silently dropped on new rails", () => {
  it("rejects a non-empty routing_number on GB_FPS", () => {
    expect(ok("GB_FPS", "GB", { sort_code: "123456", account_number: "12345678", routing_number: "021000021" })).toMatch(/geçerli değil/);
    expect(ok("GB_FPS", "GB", { sort_code: "123456", account_number: "12345678", routing_number: null, iban: "" })).toBeNull();
  });
});

describe("catalog keys foreign to the rail", () => {
  it("non-empty foreign catalog key is rejected on new rails; empty/null is ignored", () => {
    const pix = { pix_key_type: "email", pix_key: "a@b.com" };
    expect(ok("BR_PIX", "BR", { ...pix, sort_code: "123456" })).toMatch(/geçerli değil/);
    expect(ok("BR_PIX", "BR", { ...pix, sort_code: null })).toBeNull();
    expect(ok("BR_PIX", "BR", { ...pix, sort_code: "" })).toBeNull();
  });
  it("legacy rails ignore extra keys and the canonical object is unaffected", () => {
    const f = { iban: "TR963456789012345678901234", sort_code: "123456" };
    expect(ok("TR_IBAN", "TR", f)).toBeNull();
    expect(V.buildCanonicalDetails("TR_IBAN", { account_holder_name: NAME, ...f })).toEqual(
      V.buildCanonicalDetails("TR_IBAN", { account_holder_name: NAME, iban: f.iban })
    );
  });
});

describe("empty string on optional fields", () => {
  it("normalizes '' to null; required '' stays an error", () => {
    const legacyNorm = { account_holder_name: NAME };
    const out = V.normalizeCatalogFields("PK_RAAST", { iban: "", alias: "", alias_type: "" }, legacyNorm);
    expect(out.alias).toBeNull();
    expect(out.alias_type).toBeNull();
    expect(out.iban).toBeNull();
    expect(ok("PK_RAAST", "PK", { iban: out.iban, alias: out.alias, alias_type: out.alias_type })).toMatch(/zorunlu/);
    const iban = makeIban("PK", 24);
    expect(ok("PK_RAAST", "PK", { iban, alias: null, alias_type: null })).toBeNull();
  });
});

describe("SWIFT_INTL excluded countries", () => {
  const acct = { bic: "DEUTDEFF", account_number: "DE89370400440532013000" };
  it("rejects an excluded profile country or bank_country", () => {
    expect(V.validateRailCountry("SWIFT_INTL", "RU")).toMatch(/desteklenmiyor/);
    expect(V.validateRailCountry("SWIFT_INTL", "DE")).toBeNull();
    expect(ok("SWIFT_INTL", "DE", { bic: "SBININBB", bank_country: "KP", account_number: "1234567" })).toMatch(/desteklenmeyen/);
    expect(ok("SWIFT_INTL", "DE", { ...acct, bank_country: "DE" })).toBeNull();
  });
});

describe("normalizeCatalogFields", () => {
  it("applies catalog normalizers on new rails and leaves legacy rails untouched", () => {
    const legacyNorm = { account_holder_name: NAME, iban: null, routing_number: null, account_number: "12 34", account_type: null, bic: null, bank_name: null };
    const out = V.normalizeCatalogFields("GB_FPS", { sort_code: "12 34 56", account_number: "1234 5678", extra: "x" }, legacyNorm);
    expect(out.sort_code).toBe("123456");
    expect(out.account_number).toBe("12345678");
    expect(out.extra).toBe("x"); // bilinmeyen anahtar Joi'ye bırakılır
    const alias = V.normalizeCatalogFields("BR_PIX", { pix_key_type: " EMAIL ", pix_key: " a@b.com " }, legacyNorm);
    expect(alias.pix_key_type).toBe("email");
    expect(alias.pix_key).toBe("a@b.com");
    expect(V.normalizeCatalogFields("US_ACH", { account_number: "1" }, legacyNorm)).toEqual(legacyNorm);
  });
});

describe("canonical details / fingerprint regression for legacy rails", () => {
  // Bugünkü (birleştirme öncesi) auth.js:165-188 çıktısıyla alınmış dondurulmuş referanslar.
  const FROZEN = {
    TR_IBAN: {
      fields: { account_holder_name: "Test User", iban: "TR963456789012345678901234", bank_name: "Bank" },
      json: '{"account_holder_name":"Test User","account_number":null,"account_type":null,"bank_name":"Bank","bic":null,"iban":"TR963456789012345678901234","routing_number":null}',
      sha256: "327e9561ece50e18f9e5be15d9aad9f9e80f5b16f49d7c02e9447a93fcfe6a40",
    },
    US_ACH: {
      fields: { account_holder_name: "Jean-Luc Picard", routing_number: "021000021", account_number: "1234567890", account_type: "checking", bank_name: "Chase" },
      json: '{"account_holder_name":"Jean-Luc Picard","account_number":"1234567890","account_type":"checking","bank_name":"Chase","bic":null,"iban":null,"routing_number":"021000021"}',
      sha256: "29d503da83cf9c78c137a56555317a98643529045802ffc5fe8ce3c559a94994",
    },
    SEPA_IBAN: {
      fields: { account_holder_name: "José María", iban: "DE89370400440532013000", bic: "COBADEFFXXX", bank_name: "Commerzbank" },
      json: '{"account_holder_name":"José María","account_number":null,"account_type":null,"bank_name":"Commerzbank","bic":"COBADEFFXXX","iban":"DE89370400440532013000","routing_number":null}',
      sha256: "504490d6b9b14880d253ba0548124238488e61f99369c8a23480622af5150342",
    },
  };
  const hashLike = (details) => {
    // encryption.js _normalizeGenericDetailsForHash ile aynı kural (sıralı anahtar, string trim)
    const sorted = Object.keys(details).sort().reduce((a, k) => {
      a[k] = typeof details[k] === "string" ? details[k].trim() : details[k];
      return a;
    }, {});
    return JSON.stringify(sorted);
  };

  for (const [rail, c] of Object.entries(FROZEN)) {
    it(`${rail} canonical object is byte-identical to the frozen reference`, () => {
      const json = hashLike(V.buildCanonicalDetails(rail, c.fields));
      expect(json).toBe(c.json);
      expect(crypto.createHash("sha256").update(json).digest("hex")).toBe(c.sha256);
    });
  }

  it("empty/unknown rail keeps the legacy fallback shape (no-profile users)", () => {
    expect(V.buildCanonicalDetails("", {})).toEqual({
      account_holder_name: "", iban: null, routing_number: null, account_number: null,
      account_type: null, bic: null, bank_name: null,
    });
  });

  it("new rails use {holder, bank_name, ...catalog fields} with nulls for absent ones", () => {
    const c = V.buildCanonicalDetails("PK_RAAST", { account_holder_name: NAME, iban: "PK36SCBL0000001123456702" });
    expect(c).toEqual({ account_holder_name: NAME, bank_name: null, alias: null, alias_type: null, iban: "PK36SCBL0000001123456702" });
    expect(Object.keys(c)).not.toContain("routing_number");
  });
});
