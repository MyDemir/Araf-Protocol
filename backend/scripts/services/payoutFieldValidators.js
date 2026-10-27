"use strict";

/**
 * Ödeme profili alan normalizasyonu, doğrulaması ve kanonik nesne kurucusu.
 *
 * [TR] Doğrulama katalog (config/paymentRailCatalog.js) tarafından yönetilir. Eski 3 rail (legacyCanonical:
 *      TR_IBAN, US_ACH, SEPA_IBAN) için doğrulama ve kanonik nesne bugünkü davranışla birebir aynıdır
 *      (fingerprint sürekliliği); yeni rail'ler katalog alan şemasına göre doğrulanır.
 *      Karar mercii kontrattır; burası yalnız girdi biçimi denetler.
 */

const { getRailByCode, EXCLUDED_COUNTRIES } = require("../config/paymentRailCatalog");

/** PUT /profile gövdesinde her zaman bulunan 7 anahtar. */
const LEGACY_FIELD_KEYS = Object.freeze([
  "account_holder_name", "iban", "routing_number", "account_number", "account_type", "bic", "bank_name",
]);

function applyNormalize(mode, value) {
  const s = String(value);
  switch (mode) {
    case "strip_spaces_upper": return s.replace(/\s+/g, "").toUpperCase();
    case "strip_spaces": return s.replace(/\s+/g, "");
    case "trim_lower": return s.trim().toLowerCase();
    case "trim":
    default: return s.trim();
  }
}

/** ISO 13616 IBAN mod-97 (genel biçim + kalan 1). */
function isValidIbanChecksum(iban) {
  const normalized = String(iban || "").toUpperCase();
  if (!/^[A-Z]{2}\d{2}[A-Z0-9]{10,30}$/.test(normalized)) return false;
  const rearranged = normalized.slice(4) + normalized.slice(0, 4);
  let remainder = 0;
  for (const ch of rearranged) {
    const digits = /[A-Z]/.test(ch) ? String(ch.charCodeAt(0) - 55) : ch;
    for (const d of digits) {
      remainder = (remainder * 10 + Number(d)) % 97;
    }
  }
  return remainder === 1;
}

/** Meksika CLABE: 18 hane, ağırlıklar 3-7-1, son hane kontrol basamağı. */
function isValidClabe(clabe) {
  const s = String(clabe || "");
  if (!/^\d{18}$/.test(s)) return false;
  const weights = [3, 7, 1];
  let sum = 0;
  for (let i = 0; i < 17; i += 1) sum += (Number(s[i]) * weights[i % 3]) % 10;
  return (10 - (sum % 10)) % 10 === Number(s[17]);
}

function _isEmpty(v) {
  return v == null || v === "";
}

/** Katalogda yeni (legacy olmayan) rail'ler için alan anahtarı → tanım. */
function _fieldMap(def) {
  return new Map(def.fields.map((f) => [f.key, f]));
}

/**
 * Katalog anahtarlarından 7 eski anahtar dışındakilerin birleşimi (Joi şemasında izinli ek anahtarlar).
 */
function getExtraFieldKeys(catalog) {
  const keys = new Set();
  for (const r of catalog) for (const f of r.fields) if (!LEGACY_FIELD_KEYS.includes(f.key)) keys.add(f.key);
  return [...keys];
}

/**
 * Ham alanları rail'e göre normalleştirir. Eski anahtarlar çağıranın eski normalizasyonuyla gelir;
 * yeni (legacy olmayan) rail'lerde katalog kuralı üstüne yazılır, ek anahtarlar katalogdaki moduyla işlenir.
 * Bilinmeyen anahtarlar olduğu gibi bırakılır (Joi reddeder).
 */
function normalizeCatalogFields(rail, rawFields, legacyNormalized) {
  const out = { ...legacyNormalized };
  const def = getRailByCode(rail);
  if (!def || def.legacyCanonical) return out;
  const map = _fieldMap(def);
  for (const [key, raw] of Object.entries(rawFields || {})) {
    const f = map.get(key);
    if (!f) {
      if (!LEGACY_FIELD_KEYS.includes(key)) out[key] = raw === "" ? null : raw;
      continue;
    }
    if (raw == null) out[key] = null;
    else {
      const v = typeof raw === "string" ? applyNormalize(f.normalize, raw) : "";
      // Boş string null gibi kabul edilir (zorunlu alanda null yine "zorunludur" hatası verir).
      out[key] = v === "" ? null : v;
    }
  }
  return out;
}

/** Rail-ülke eşleşmesi (katalog `countries` üzerinden). */
function isCountryAllowedForRail(rail, country) {
  const def = getRailByCode(rail);
  if (!def) return false;
  if (def.countries.includes("*")) return /^[A-Z]{2}$/.test(country || "") && !EXCLUDED_COUNTRIES.includes(country);
  return def.countries.includes(country);
}

const LEGACY_COUNTRY_MESSAGES = {
  TR_IBAN: "TR_IBAN yalnız TR country ile kullanılabilir.",
  US_ACH: "US_ACH yalnız US country ile kullanılabilir.",
  SEPA_IBAN: "SEPA_IBAN için country allowlist dışı.",
};

/** @returns {string|null} hata mesajı ya da null */
function validateRailCountry(rail, country) {
  if (isCountryAllowedForRail(rail, country)) return null;
  return LEGACY_COUNTRY_MESSAGES[rail] || `${rail} için country (${country || "-"}) desteklenmiyor.`;
}

function _checkIban(def, field, iban, country) {
  const prefix = String(iban).slice(0, 2);
  if (!new RegExp(field.pattern).test(iban)) return `${def.code} için ${field.key} biçimi geçersiz.`;
  if (prefix !== country) return "IBAN ülke kodu seçilen ülkeyle eşleşmiyor.";
  const len = field.ibanCountryLengths?.[prefix];
  if (!len || iban.length !== len) return "IBAN uzunluğu bu ülke için geçersiz.";
  if (!isValidIbanChecksum(iban)) return "IBAN kontrol basamağı geçersiz. Lütfen IBAN'ı kontrol edin.";
  return null;
}

function _validateOne(def, field, value, fields, country) {
  const label = field.key;
  switch (field.kind) {
    case "iban":
      return _checkIban(def, field, value, country);
    case "alias": {
      const typeKey = `${field.key}_type`;
      const type = fields[typeKey];
      if (_isEmpty(type)) return `${typeKey} zorunludur.`;
      const pat = field.aliasPatterns?.[type];
      if (!(field.options || []).includes(type) || !pat) return `${typeKey} geçersiz.`;
      return new RegExp(pat).test(value) ? null : `${label} (${type}) biçimi geçersiz.`;
    }
    case "enum":
      return (field.options || []).includes(value) ? null : `${label} geçersiz.`;
    case "email":
    case "phone":
    case "bic":
    case "digits":
    case "alnum":
    default: {
      if (typeof value !== "string" || value.length > 200) return `${label} geçersiz.`;
      if (def.code === "SWIFT_INTL" && label === "bank_country" && EXCLUDED_COUNTRIES.includes(value)) {
        return "bank_country desteklenmeyen bir ülke.";
      }
      if (field.pattern && !new RegExp(field.pattern).test(value)) return `${label} biçimi geçersiz.`;
      if (field.checksum === "clabe" && !isValidClabe(value)) return `${label} kontrol basamağı geçersiz.`;
      // SWIFT_INTL: banka ülkesi IBAN ülkesiyse hesap alanı IBAN kuralına tabidir.
      if (field.checksum === "mod97" && field.ibanCountryLengths) {
        const bankCountry = fields.bank_country;
        const len = field.ibanCountryLengths[bankCountry];
        if (len) {
          if (value.slice(0, 2) !== bankCountry) return "IBAN ülke kodu banka ülkesiyle eşleşmiyor.";
          if (value.length !== len) return "IBAN uzunluğu bu ülke için geçersiz.";
          if (!isValidIbanChecksum(value)) return "IBAN kontrol basamağı geçersiz. Lütfen IBAN'ı kontrol edin.";
        }
      }
      return null;
    }
  }
}

function _validateLegacy(rail, country, fields) {
  if (rail === "TR_IBAN") {
    if (!/^TR\d{24}$/.test(fields.iban || "")) return "TR_IBAN için iban TR formatında olmalı.";
  }
  if (rail === "SEPA_IBAN") {
    if (!/^[A-Z]{2}[A-Z0-9]{13,32}$/.test(fields.iban || "")) return "SEPA_IBAN için iban formatı geçersiz.";
    if (fields.iban.slice(0, 2) !== country) return "IBAN ülke kodu seçilen ülkeyle eşleşmiyor.";
    const len = getRailByCode("SEPA_IBAN").fields[0].ibanCountryLengths[country];
    if (len && fields.iban.length !== len) return "IBAN uzunluğu bu ülke için geçersiz.";
  }
  if ((rail === "TR_IBAN" || rail === "SEPA_IBAN") && !isValidIbanChecksum(fields.iban)) {
    return "IBAN kontrol basamağı geçersiz. Lütfen IBAN'ı kontrol edin.";
  }
  if (rail === "US_ACH") {
    if (!/^\d{9}$/.test(fields.routing_number || "") || !/^\d{4,17}$/.test(fields.account_number || "")) {
      return "US_ACH için routing/account number geçersiz.";
    }
    if (!fields.account_type) return "US_ACH için account_type zorunludur.";
  }
  return null;
}

/**
 * Rail'in alan şemasına göre doğrular (ülke eşleşmesi ayrıca validateRailCountry ile).
 * @returns {string|null} hata mesajı ya da null
 */
function validatePayoutFields(rail, country, fields = {}) {
  const def = getRailByCode(rail);
  if (!def) return `Bilinmeyen rail: ${rail}`;
  if (def.legacyCanonical) return _validateLegacy(rail, country, fields);

  const map = _fieldMap(def);
  // Rail'de tanımlı olmayan eski anahtarlar boş olmalıdır (sessizce atılmaz).
  for (const key of LEGACY_FIELD_KEYS) {
    if (key === "account_holder_name" || key === "bank_name") continue;
    if (!map.has(key) && !_isEmpty(fields[key])) return `${key} bu ödeme yöntemi için geçerli değil.`;
  }
  // Rail'de tanımlı olmayan DOLU katalog anahtarı (ör. BR_PIX için sort_code) reddedilir; boş/null yok sayılır.
  for (const [key, v] of Object.entries(fields)) {
    if (!LEGACY_FIELD_KEYS.includes(key) && !map.has(key) && !_isEmpty(v)) {
      return `${key} bu ödeme yöntemi için geçerli değil.`;
    }
  }
  for (const f of def.fields) {
    const value = fields[f.key];
    if (_isEmpty(value)) {
      if (f.required) return `${def.code} için ${f.key} zorunludur.`;
      continue;
    }
    const err = _validateOne(def, f, value, fields, country);
    if (err) return err;
  }
  // Alias türü verilmiş ama alias boşsa tutarsız.
  for (const f of def.fields) {
    if (f.kind === "alias" && _isEmpty(fields[f.key]) && !_isEmpty(fields[`${f.key}_type`]) && !f.required) {
      return `${f.key} boş iken ${f.key}_type verilemez.`;
    }
  }
  return null;
}

/**
 * fingerprint için kanonik nesne.
 * Eski 3 rail (ve bilinmeyen/boş rail): bugünkü çıktı birebir. Yeni rail'ler:
 * { account_holder_name, bank_name, ...katalog alanları } (eksik alan null).
 */
function buildCanonicalDetails(rail, fields = {}) {
  const def = getRailByCode(rail);
  if (def && !def.legacyCanonical) {
    const out = {
      account_holder_name: fields.account_holder_name || "",
      bank_name: fields.bank_name || null,
    };
    for (const f of [...def.fields].sort((a, b) => a.key.localeCompare(b.key))) {
      out[f.key] = _isEmpty(fields[f.key]) ? null : fields[f.key];
    }
    return out;
  }

  const base = {
    account_holder_name: fields.account_holder_name || "",
    iban: null,
    routing_number: null,
    account_number: null,
    account_type: null,
    bic: null,
    bank_name: fields.bank_name || null,
  };
  if (rail === "TR_IBAN") return { ...base, iban: fields.iban || null };
  if (rail === "SEPA_IBAN") return { ...base, iban: fields.iban || null, bic: fields.bic || null };
  return {
    ...base,
    routing_number: fields.routing_number || null,
    account_number: fields.account_number || null,
    account_type: fields.account_type || null,
  };
}

module.exports = {
  LEGACY_FIELD_KEYS,
  applyNormalize,
  isValidIbanChecksum,
  isValidClabe,
  getExtraFieldKeys,
  normalizeCatalogFields,
  isCountryAllowedForRail,
  validateRailCountry,
  validatePayoutFields,
  buildCanonicalDetails,
};
