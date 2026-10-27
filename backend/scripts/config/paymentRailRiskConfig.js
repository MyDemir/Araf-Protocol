"use strict";

const { RAIL_CATALOG, getRailByCode, getRailCodes } = require("./paymentRailCatalog");

const ALLOWED_RISK_LEVELS = new Set(["LOW", "MEDIUM", "HIGH", "RESTRICTED"]);
const PROFILE_SUPPORTED_RAILS = new Set(getRailCodes());
// [TR] SEPA ülke listesi katalogdan türetilir (EPC v8.0; IBAN uzunluğu doğrulanamayan SK/SM/VA hariç).
const SEPA_COUNTRY_ALLOWLIST = new Set(getRailByCode("SEPA_IBAN").countries);

// [TR] Risk girdisi "ülke kovası" altında tutulur (mevcut yanıt biçimi): eski kovalar TR / US / EU korunur;
//      diğer rail'ler tek ülkeliyse o ülke, çok ülkeliyse ilk ülke, SWIFT_INTL için "INTL".
function _bucketFor(rail) {
  if (rail.code === "SEPA_IBAN") return "EU";
  if (rail.countries.includes("*")) return "INTL";
  return rail.countries[0];
}

function _buildRiskConfig() {
  const out = {};
  for (const rail of RAIL_CATALOG) {
    const bucket = _bucketFor(rail);
    out[bucket] = out[bucket] || {};
    out[bucket][rail.code] = {
      riskLevel: rail.risk.riskLevel,
      minBondSurchargeBps: rail.risk.minBondSurchargeBps,
      feeSurchargeBps: rail.risk.feeSurchargeBps,
      warningKey: rail.risk.warningKey,
      enabled: true,
      description: { TR: rail.risk.description.TR, EN: rail.risk.description.EN },
    };
  }
  return out;
}

const PAYMENT_RAIL_RISK_CONFIG = _buildRiskConfig();

function _isPlainObject(value) {
  return value && typeof value === "object" && !Array.isArray(value);
}

function validatePaymentRailRiskConfig(config) {
  if (!_isPlainObject(config)) {
    const err = new Error("paymentRiskConfig must be an object.");
    err.code = "PAYMENT_RISK_CONFIG_INVALID";
    throw err;
  }

  for (const [countryBucket, railConfig] of Object.entries(config)) {
    if (!_isPlainObject(railConfig)) {
      const err = new Error(`paymentRiskConfig.${countryBucket} must be an object.`);
      err.code = "PAYMENT_RISK_CONFIG_INVALID";
      throw err;
    }

    for (const [rail, entry] of Object.entries(railConfig)) {
      if (!PROFILE_SUPPORTED_RAILS.has(rail)) {
        const err = new Error(`paymentRiskConfig.${countryBucket}.${rail} rail is unsupported.`);
        err.code = "PAYMENT_RISK_CONFIG_INVALID";
        throw err;
      }
      if (!_isPlainObject(entry)) {
        const err = new Error(`paymentRiskConfig.${countryBucket}.${rail} must be an object.`);
        err.code = "PAYMENT_RISK_CONFIG_INVALID";
        throw err;
      }
      if (!ALLOWED_RISK_LEVELS.has(entry.riskLevel)) {
        const err = new Error(`paymentRiskConfig.${countryBucket}.${rail}.riskLevel invalid.`);
        err.code = "PAYMENT_RISK_CONFIG_INVALID";
        throw err;
      }
      if (!Number.isInteger(entry.minBondSurchargeBps) || entry.minBondSurchargeBps < 0 || entry.minBondSurchargeBps > 10000) {
        const err = new Error(`paymentRiskConfig.${countryBucket}.${rail}.minBondSurchargeBps invalid.`);
        err.code = "PAYMENT_RISK_CONFIG_INVALID";
        throw err;
      }
      if (!Number.isInteger(entry.feeSurchargeBps) || entry.feeSurchargeBps < 0 || entry.feeSurchargeBps > 10000) {
        const err = new Error(`paymentRiskConfig.${countryBucket}.${rail}.feeSurchargeBps invalid.`);
        err.code = "PAYMENT_RISK_CONFIG_INVALID";
        throw err;
      }
      if (typeof entry.warningKey !== "string" || !entry.warningKey.trim()) {
        const err = new Error(`paymentRiskConfig.${countryBucket}.${rail}.warningKey invalid.`);
        err.code = "PAYMENT_RISK_CONFIG_INVALID";
        throw err;
      }
      if (typeof entry.enabled !== "boolean") {
        const err = new Error(`paymentRiskConfig.${countryBucket}.${rail}.enabled must be boolean.`);
        err.code = "PAYMENT_RISK_CONFIG_INVALID";
        throw err;
      }
      if (!_isPlainObject(entry.description) || typeof entry.description.TR !== "string" || typeof entry.description.EN !== "string") {
        const err = new Error(`paymentRiskConfig.${countryBucket}.${rail}.description invalid.`);
        err.code = "PAYMENT_RISK_CONFIG_INVALID";
        throw err;
      }
    }
  }

  return config;
}

function getPaymentRailRiskConfig() {
  return validatePaymentRailRiskConfig(PAYMENT_RAIL_RISK_CONFIG);
}

function resolvePaymentRailRiskEntry(country, rail, config = PAYMENT_RAIL_RISK_CONFIG) {
  const safeCountry = String(country || "").toUpperCase();
  const safeRail = String(rail || "").toUpperCase();
  const safeConfig = validatePaymentRailRiskConfig(config);
  const direct = safeConfig[safeCountry]?.[safeRail];
  if (direct) return direct;

  // Çok ülkeli rail'ler (SEPA, DK_IBAN ...): ülke rail'in countries listesindeyse ana kovadaki girdi.
  const def = getRailByCode(safeRail);
  if (def && def.countries.includes(safeCountry)) {
    return safeConfig[_bucketFor(def)]?.[safeRail] || null;
  }
  return null;
}

module.exports = {
  PAYMENT_RAIL_RISK_CONFIG,
  ALLOWED_RISK_LEVELS,
  PROFILE_SUPPORTED_RAILS,
  SEPA_COUNTRY_ALLOWLIST,
  validatePaymentRailRiskConfig,
  getPaymentRailRiskConfig,
  resolvePaymentRailRiskEntry,
};
