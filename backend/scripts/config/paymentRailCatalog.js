"use strict";

/**
 * Küresel ödeme rail kataloğu (tek kaynak).
 *
 * [TR] Kontrat rail bilmez; bu katalog yalnız UI/API düzeyindedir. Admin yalnız aç/kapa yapar.
 *      - Yeni rail'ler varsayılan KAPALI (defaultEnabled:false); yalnız TR_IBAN, US_ACH, SEPA_IBAN açık.
 *      - Eklenen rail kodu SİLİNMEZ (kullanıcı profilleri ve audit kayıtları kodlara bağlıdır).
 *      - Ulusal kimlik no (CPF, NRIC, Thai ID, MyKad, Aadhaar, RUT) alan olarak YOKTUR.
 *      - IBAN uzunlukları SWIFT IBAN Registry'den doğrulanmıştır (SK, SM, VA doğrulanamadığı için YOK).
 *      - "gevşek" işaretli desenler kaynakla doğrulanmadı; bilinçli olarak geniş tutuldu.
 *
 * Alias alanı kuralı: kind:"alias" alanı `<key>`, aynı rail'de `<key>_type` adlı bir enum kardeş alanla
 * birlikte gelir (options = alias türleri). Seçilen türün deseni aliasPatterns[tür]'dür.
 *
 * Alan türüne göre doğrulama payoutFieldValidators.js içindedir.
 */

const REGIONS = Object.freeze(["EUROPE", "MIDDLE_EAST_AFRICA", "AMERICAS", "ASIA_PACIFIC", "INTERNATIONAL"]);

// [TR] Yaptırımlı / değerlendirilmemiş ülkeler (şef kararı 8): hiçbir rail'in `countries` listesinde olamaz;
//      SWIFT_INTL'de profil ülkesi ya da bank_country bu listede ise reddedilir.
const EXCLUDED_COUNTRIES = Object.freeze([
  "RU", "BY", "IR", "KP", "SY", "CU", "CN", "LB", "IQ", "LY", "PS", "SD", "YE", "SO", "DJ", "BI", "MR", "LC", "SC", "MU", "MN", "FK",
]);

const L = (TR, EN) => ({ TR, EN });

// ─── Ortak desenler ──────────────────────────────────────────────────────────
const IBAN_PATTERN = "^[A-Z]{2}\\d{2}[A-Z0-9]{10,30}$";
const BIC_PATTERN = "^[A-Z]{4}[A-Z]{2}[A-Z0-9]{2}([A-Z0-9]{3})?$";
const EMAIL_PATTERN = "^[^\\s@]+@[^\\s@]+\\.[^\\s@]+$";
// gevşek E.164: + ve 7-15 hane (ülke-içi biçim kaynakla doğrulanmadı)
const PHONE_PATTERN = "^\\+[1-9]\\d{6,14}$";
const EVP_PATTERN = "^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$";

// ─── Alan kurucuları ─────────────────────────────────────────────────────────
function ibanField(lengths, { required = true, pattern = IBAN_PATTERN } = {}) {
  return {
    key: "iban",
    label: L("IBAN", "IBAN"),
    kind: "iban",
    required,
    pattern,
    checksum: "mod97",
    ibanCountryLengths: { ...lengths },
    normalize: "strip_spaces_upper",
    copyable: true,
  };
}

function bicField(required = false) {
  return {
    key: "bic",
    label: L("BIC / SWIFT", "BIC / SWIFT"),
    kind: "bic",
    required,
    pattern: BIC_PATTERN,
    checksum: null,
    normalize: "strip_spaces_upper",
    copyable: true,
  };
}

function digitsField(key, label, pattern, required = true) {
  return { key, label, kind: "digits", required, pattern, checksum: null, normalize: "strip_spaces", copyable: true };
}

function alnumField(key, label, pattern, required = true, normalize = "strip_spaces_upper") {
  return { key, label, kind: "alnum", required, pattern, checksum: null, normalize, copyable: true };
}

function enumField(key, label, options, required = true) {
  return { key, label, kind: "enum", required, checksum: null, options: [...options], normalize: "trim_lower", copyable: false };
}

const ALIAS_PATTERNS = {
  email: EMAIL_PATTERN,
  phone: PHONE_PATTERN,
  evp: EVP_PATTERN,
  cnpj: "^\\d{14}$",
  uen: "^[0-9A-Za-z]{9,10}$", // gevşek: kaynakla doğrulanmadı
  abn: "^\\d{11}$",
  business_reg: "^[0-9A-Za-z-]{6,20}$", // gevşek: kaynakla doğrulanmadı
  fps_id: "^\\d{7,9}$",
  ewallet: "^\\d{15}$", // gevşek: kaynakla doğrulanmadı
  cbu: "^\\d{22}$",
  alias: "^[A-Za-z0-9.\\-]{6,20}$",
};

/** İki alan döner: `<key>_type` (enum) ve `<key>` (alias). */
function aliasFields(key, label, types, required = true) {
  const aliasPatterns = {};
  for (const t of types) aliasPatterns[t] = ALIAS_PATTERNS[t];
  return [
    {
      ...enumField(`${key}_type`, L(`${label.TR} türü`, `${label.EN} type`), types, required),
    },
    {
      key,
      label,
      kind: "alias",
      required,
      checksum: null,
      options: [...types],
      aliasPatterns,
      normalize: "strip_spaces",
      copyable: true,
    },
  ];
}

// ─── Risk kurucuları ─────────────────────────────────────────────────────────
function medium(code) {
  return {
    riskLevel: "MEDIUM",
    minBondSurchargeBps: 0,
    feeSurchargeBps: 0,
    warningKey: `${code}_CONFIRMATION_REQUIRED`,
    description: L(
      "Banka transferi onayı kullanıcı sorumluluğundadır. Araf bu yöntemi doğrulamaz.",
      "Bank transfer confirmation is the user's responsibility. Araf does not verify this method."
    ),
  };
}

function high(warningKey, trText, enText) {
  return { riskLevel: "HIGH", minBondSurchargeBps: 0, feeSurchargeBps: 0, warningKey, description: L(trText, enText) };
}

// ─── Spec tablosu ────────────────────────────────────────────────────────────
const SEPA_IBAN_LENGTHS = Object.freeze({
  AT: 20, BE: 16, BG: 22, HR: 21, CY: 28, EE: 20, FI: 18, FR: 27, DE: 22, GR: 27, IE: 22, IT: 27,
  LV: 21, LT: 20, LU: 20, MT: 31, NL: 18, PT: 25, SI: 19, ES: 24, MC: 27, AD: 24,
});

const specs = [];
function add(spec) {
  specs.push(spec);
}

function ibanRail(code, region, trName, enName, lengths, currency, { bic = false } = {}) {
  add({
    code, region,
    name: L(trName, enName),
    countries: Object.keys(lengths),
    currencies: [currency],
    defaultEnabled: false,
    legacyCanonical: false,
    risk: medium(code),
    fields: [ibanField(lengths), ...(bic ? [bicField(false)] : [])],
  });
}

function rail(code, region, trName, enName, countries, currencies, fields, risk) {
  add({
    code, region,
    name: L(trName, enName),
    countries: [...countries],
    currencies: [...currencies],
    defaultEnabled: false,
    legacyCanonical: false,
    risk: risk || medium(code),
    fields,
  });
}

// ── Eski 3 rail (varsayılan AÇIK; kanonik nesne bayt bayt korunur) ──
add({
  code: "TR_IBAN", region: "EUROPE",
  name: L("Türkiye Banka Havalesi (IBAN)", "Turkey Bank Transfer (IBAN)"),
  countries: ["TR"], currencies: ["TRY"], defaultEnabled: true, legacyCanonical: true,
  risk: {
    riskLevel: "MEDIUM", minBondSurchargeBps: 0, feeSurchargeBps: 0,
    warningKey: "BANK_TRANSFER_CONFIRMATION_REQUIRED",
    description: L(
      "Banka transferi onayı kullanıcı sorumluluğundadır. Araf bu yöntemi doğrulamaz.",
      "Bank transfer confirmation is the user's responsibility. Araf does not verify this method."
    ),
  },
  fields: [ibanField({ TR: 26 }, { pattern: "^TR\\d{24}$" })],
});
add({
  code: "US_ACH", region: "AMERICAS",
  name: L("ABD ACH", "US ACH"),
  countries: ["US"], currencies: ["USD"], defaultEnabled: true, legacyCanonical: true,
  risk: {
    riskLevel: "HIGH", minBondSurchargeBps: 50, feeSurchargeBps: 0,
    warningKey: "ACH_REVERSAL_AND_SETTLEMENT_DELAY_RISK",
    description: L(
      "ACH işlemleri gecikme veya geri dönüş karmaşıklığı taşıyabilir.",
      "ACH transfers may involve delay or reversal complexity."
    ),
  },
  fields: [
    digitsField("routing_number", L("Routing numarası", "Routing number"), "^\\d{9}$"),
    digitsField("account_number", L("Hesap numarası", "Account number"), "^\\d{4,17}$"),
    enumField("account_type", L("Hesap türü", "Account type"), ["checking", "savings"]),
  ],
});
add({
  code: "SEPA_IBAN", region: "EUROPE",
  name: L("SEPA (IBAN)", "SEPA (IBAN)"),
  // EPC v8.0 EUR ülkeleri; SK, SM, VA IBAN uzunluğu kaynakla doğrulanamadığı için YOK.
  countries: ["DE", "FR", "NL", "BE", "ES", "IT", "AT", "PT", "IE", "LU", "FI", "GR",
    "BG", "HR", "CY", "EE", "LV", "LT", "MT", "SI", "MC", "AD"],
  currencies: ["EUR"], defaultEnabled: true, legacyCanonical: true,
  risk: {
    riskLevel: "MEDIUM", minBondSurchargeBps: 0, feeSurchargeBps: 0,
    warningKey: "SEPA_CONFIRMATION_REQUIRED",
    description: L(
      "SEPA transferlerinde ödeme detaylarını dikkatle kontrol et.",
      "Carefully check payment details for SEPA transfers."
    ),
  },
  fields: [ibanField(SEPA_IBAN_LENGTHS), bicField(false)],
});

// ── Avrupa ──
rail("GB_FPS", "EUROPE", "Birleşik Krallık Faster Payments", "UK Faster Payments", ["GB"], ["GBP"], [
  digitsField("sort_code", L("Sort code", "Sort code"), "^\\d{6}$"),
  digitsField("account_number", L("Hesap numarası", "Account number"), "^\\d{8}$"),
], high(
  "GB_FPS_APP_REIMBURSEMENT_RISK",
  "Faster Payments transferleri yetkili itme ödemesi (APP) dolandırıcılığı iade talebine konu olabilir.",
  "Faster Payments transfers may be subject to authorised push payment (APP) reimbursement claims."
));
ibanRail("CH_IBAN", "EUROPE", "İsviçre Banka Havalesi (IBAN)", "Switzerland Bank Transfer (IBAN)", { CH: 21 }, "CHF");
ibanRail("LI_IBAN", "EUROPE", "Lihtenştayn Banka Havalesi (IBAN)", "Liechtenstein Bank Transfer (IBAN)", { LI: 21 }, "CHF");
ibanRail("NO_IBAN", "EUROPE", "Norveç Banka Havalesi (IBAN)", "Norway Bank Transfer (IBAN)", { NO: 15 }, "NOK");
ibanRail("SE_IBAN", "EUROPE", "İsveç Banka Havalesi (IBAN)", "Sweden Bank Transfer (IBAN)", { SE: 24 }, "SEK");
ibanRail("DK_IBAN", "EUROPE", "Danimarka, Faroe ve Grönland Banka Havalesi (IBAN)", "Denmark, Faroe Islands and Greenland Bank Transfer (IBAN)", { DK: 18, FO: 18, GL: 18 }, "DKK");
ibanRail("IS_IBAN", "EUROPE", "İzlanda Banka Havalesi (IBAN)", "Iceland Bank Transfer (IBAN)", { IS: 26 }, "ISK");
ibanRail("PL_IBAN", "EUROPE", "Polonya Banka Havalesi (IBAN)", "Poland Bank Transfer (IBAN)", { PL: 28 }, "PLN");
ibanRail("CZ_IBAN", "EUROPE", "Çekya Banka Havalesi (IBAN)", "Czechia Bank Transfer (IBAN)", { CZ: 24 }, "CZK");
ibanRail("HU_IBAN", "EUROPE", "Macaristan Banka Havalesi (IBAN)", "Hungary Bank Transfer (IBAN)", { HU: 28 }, "HUF");
ibanRail("RO_IBAN", "EUROPE", "Romanya Banka Havalesi (IBAN)", "Romania Bank Transfer (IBAN)", { RO: 24 }, "RON");
ibanRail("GI_IBAN", "EUROPE", "Cebelitarık Banka Havalesi (IBAN)", "Gibraltar Bank Transfer (IBAN)", { GI: 23 }, "GIP");
ibanRail("AL_IBAN", "EUROPE", "Arnavutluk Banka Havalesi (IBAN)", "Albania Bank Transfer (IBAN)", { AL: 28 }, "ALL");
ibanRail("RS_IBAN", "EUROPE", "Sırbistan Banka Havalesi (IBAN)", "Serbia Bank Transfer (IBAN)", { RS: 22 }, "RSD");
ibanRail("MK_IBAN", "EUROPE", "Kuzey Makedonya Banka Havalesi (IBAN)", "North Macedonia Bank Transfer (IBAN)", { MK: 19 }, "MKD");
ibanRail("MD_IBAN", "EUROPE", "Moldova Banka Havalesi (IBAN)", "Moldova Bank Transfer (IBAN)", { MD: 24 }, "MDL");
ibanRail("BA_IBAN", "EUROPE", "Bosna-Hersek Banka Havalesi (IBAN)", "Bosnia and Herzegovina Bank Transfer (IBAN)", { BA: 20 }, "BAM");
ibanRail("GE_IBAN", "EUROPE", "Gürcistan Banka Havalesi (IBAN)", "Georgia Bank Transfer (IBAN)", { GE: 22 }, "GEL");
ibanRail("AZ_IBAN", "EUROPE", "Azerbaycan Banka Havalesi (IBAN)", "Azerbaijan Bank Transfer (IBAN)", { AZ: 28 }, "AZN");
ibanRail("KZ_IBAN", "EUROPE", "Kazakistan Banka Havalesi (IBAN)", "Kazakhstan Bank Transfer (IBAN)", { KZ: 20 }, "KZT");

// ── Orta Doğu ve Afrika ──
ibanRail("AE_IBAN", "MIDDLE_EAST_AFRICA", "BAE Banka Havalesi (IBAN)", "UAE Bank Transfer (IBAN)", { AE: 23 }, "AED");
ibanRail("SA_IBAN", "MIDDLE_EAST_AFRICA", "Suudi Arabistan Banka Havalesi (IBAN)", "Saudi Arabia Bank Transfer (IBAN)", { SA: 24 }, "SAR");
ibanRail("QA_IBAN", "MIDDLE_EAST_AFRICA", "Katar Banka Havalesi (IBAN)", "Qatar Bank Transfer (IBAN)", { QA: 29 }, "QAR");
ibanRail("KW_IBAN", "MIDDLE_EAST_AFRICA", "Kuveyt Banka Havalesi (IBAN)", "Kuwait Bank Transfer (IBAN)", { KW: 30 }, "KWD");
ibanRail("BH_IBAN", "MIDDLE_EAST_AFRICA", "Bahreyn Banka Havalesi (IBAN)", "Bahrain Bank Transfer (IBAN)", { BH: 22 }, "BHD");
ibanRail("OM_IBAN", "MIDDLE_EAST_AFRICA", "Umman Banka Havalesi (IBAN)", "Oman Bank Transfer (IBAN)", { OM: 23 }, "OMR");
ibanRail("JO_IBAN", "MIDDLE_EAST_AFRICA", "Ürdün Banka Havalesi (IBAN)", "Jordan Bank Transfer (IBAN)", { JO: 30 }, "JOD");
ibanRail("IL_IBAN", "MIDDLE_EAST_AFRICA", "İsrail Banka Havalesi (IBAN)", "Israel Bank Transfer (IBAN)", { IL: 23 }, "ILS");
ibanRail("EG_IBAN", "MIDDLE_EAST_AFRICA", "Mısır Banka Havalesi (IBAN)", "Egypt Bank Transfer (IBAN)", { EG: 29 }, "EGP");
rail("PK_RAAST", "MIDDLE_EAST_AFRICA", "Pakistan Raast", "Pakistan Raast", ["PK"], ["PKR"], [
  ibanField({ PK: 24 }),
  ...aliasFields("alias", L("Telefon takma adı", "Phone alias"), ["phone"], false),
]);
rail("NG_NIP", "MIDDLE_EAST_AFRICA", "Nijerya NIP", "Nigeria NIP", ["NG"], ["NGN"], [
  // gevşek: banka kodu biçimi kaynakla doğrulanmadı
  alnumField("bank_code", L("Banka kodu", "Bank code"), "^[0-9A-Z]{3,10}$"),
  digitsField("account_number", L("Hesap numarası (NUBAN)", "Account number (NUBAN)"), "^\\d{10}$"),
]);
rail("KE_MPESA", "MIDDLE_EAST_AFRICA", "Kenya M-Pesa", "Kenya M-Pesa", ["KE"], ["KES"], [
  { key: "phone_number", label: L("M-Pesa telefon numarası", "M-Pesa phone number"), kind: "phone", required: true,
    pattern: "^\\+254\\d{9}$", checksum: null, normalize: "strip_spaces", copyable: true },
], high(
  "KE_MPESA_REVERSAL_RISK",
  "Mobil para transferleri geri alma veya hesap kısıtlaması talebine konu olabilir.",
  "Mobile money transfers may be subject to reversal requests or account restrictions."
));
rail("ZA_EFT", "MIDDLE_EAST_AFRICA", "Güney Afrika EFT", "South Africa EFT", ["ZA"], ["ZAR"], [
  digitsField("branch_code", L("Şube kodu", "Branch code"), "^\\d{6}$"),
  digitsField("account_number", L("Hesap numarası", "Account number"), "^\\d{6,16}$"),
]);

// ── Amerika ──
rail("CA_EFT", "AMERICAS", "Kanada EFT", "Canada EFT", ["CA"], ["CAD"], [
  digitsField("institution_number", L("Kurum numarası", "Institution number"), "^\\d{3}$"),
  digitsField("transit_number", L("Transit numarası", "Transit number"), "^\\d{5}$"),
  digitsField("account_number", L("Hesap numarası", "Account number"), "^\\d{7,12}$"),
]);
rail("CA_INTERAC", "AMERICAS", "Kanada Interac e-Transfer", "Canada Interac e-Transfer", ["CA"], ["CAD"],
  aliasFields("alias", L("Interac takma adı", "Interac alias"), ["email", "phone"]),
  high(
    "CA_INTERAC_REVERSAL_RISK",
    "Interac e-Transfer işlemleri iptal veya geri çağırma talebine konu olabilir.",
    "Interac e-Transfer payments may be subject to cancellation or recall requests."
  ));
rail("MX_SPEI", "AMERICAS", "Meksika SPEI", "Mexico SPEI", ["MX"], ["MXN"], [
  { key: "clabe", label: L("CLABE", "CLABE"), kind: "digits", required: true, pattern: "^\\d{18}$",
    checksum: "clabe", normalize: "strip_spaces", copyable: true },
]);
rail("BR_PIX", "AMERICAS", "Brezilya Pix", "Brazil Pix", ["BR"], ["BRL"],
  aliasFields("pix_key", L("Pix anahtarı", "Pix key"), ["email", "phone", "evp", "cnpj"]),
  high(
    "BR_PIX_MED_REVERSAL_RISK",
    "Pix işlemleri özel iade mekanizması (MED 2.0) kapsamında geri istenebilir.",
    "Pix payments may be recalled under the special refund mechanism (MED 2.0)."
  ));
rail("AR_CBU", "AMERICAS", "Arjantin CBU", "Argentina CBU", ["AR"], ["ARS"],
  aliasFields("account_alias", L("CBU / takma ad", "CBU / alias"), ["cbu", "alias"]));
rail("CL_TEF", "AMERICAS", "Şili Banka Transferi", "Chile Bank Transfer", ["CL"], ["CLP"], [
  // gevşek: kaynakla doğrulanmadı. Ulusal kimlik no (RUT) alan olarak YOK.
  alnumField("bank_code", L("Banka", "Bank"), "^[0-9A-Z]{2,12}$"),
  digitsField("account_number", L("Hesap numarası", "Account number"), "^\\d{6,20}$"),
]);
rail("CO_BANK", "AMERICAS", "Kolombiya Banka Transferi", "Colombia Bank Transfer", ["CO"], ["COP"], [
  // gevşek: kaynakla doğrulanmadı
  alnumField("bank_code", L("Banka", "Bank"), "^[0-9A-Z]{2,12}$"),
  digitsField("account_number", L("Hesap numarası", "Account number"), "^\\d{6,20}$"),
]);
rail("PE_CCI", "AMERICAS", "Peru CCI", "Peru CCI", ["PE"], ["PEN"], [
  digitsField("cci", L("CCI", "CCI"), "^\\d{20}$"),
]);
ibanRail("CR_IBAN", "AMERICAS", "Kosta Rika Banka Havalesi (IBAN)", "Costa Rica Bank Transfer (IBAN)", { CR: 22 }, "CRC");
ibanRail("DO_IBAN", "AMERICAS", "Dominik Cumhuriyeti Banka Havalesi (IBAN)", "Dominican Republic Bank Transfer (IBAN)", { DO: 28 }, "DOP");
ibanRail("GT_IBAN", "AMERICAS", "Guatemala Banka Havalesi (IBAN)", "Guatemala Bank Transfer (IBAN)", { GT: 28 }, "GTQ");
ibanRail("HN_IBAN", "AMERICAS", "Honduras Banka Havalesi (IBAN)", "Honduras Bank Transfer (IBAN)", { HN: 28 }, "HNL");
ibanRail("NI_IBAN", "AMERICAS", "Nikaragua Banka Havalesi (IBAN)", "Nicaragua Bank Transfer (IBAN)", { NI: 28 }, "NIO");

// ── Asya-Pasifik ──
rail("IN_UPI", "ASIA_PACIFIC", "Hindistan UPI", "India UPI", ["IN"], ["INR"], [
  // gevşek: VPA biçimi kaynakla doğrulanmadı
  { key: "vpa", label: L("UPI kimliği (VPA)", "UPI ID (VPA)"), kind: "alnum", required: true,
    pattern: "^[A-Za-z0-9._-]{2,256}@[A-Za-z][A-Za-z0-9]{1,63}$", checksum: null, normalize: "strip_spaces", copyable: true },
], high(
  "IN_UPI_REVERSAL_RISK",
  "UPI işlemleri itiraz veya geri alma sürecine konu olabilir.",
  "UPI payments may be subject to dispute or reversal processes."
));
rail("IN_IMPS", "ASIA_PACIFIC", "Hindistan IMPS", "India IMPS", ["IN"], ["INR"], [
  alnumField("ifsc", L("IFSC", "IFSC"), "^[A-Z]{4}0[A-Z0-9]{6}$"),
  digitsField("account_number", L("Hesap numarası", "Account number"), "^\\d{9,18}$"),
], high(
  "IN_IMPS_REVERSAL_RISK",
  "IMPS işlemleri itiraz veya geri alma sürecine konu olabilir.",
  "IMPS payments may be subject to dispute or reversal processes."
));
rail("SG_PAYNOW", "ASIA_PACIFIC", "Singapur PayNow", "Singapore PayNow", ["SG"], ["SGD"],
  aliasFields("alias", L("PayNow takma adı", "PayNow alias"), ["phone", "uen"]));
rail("HK_FPS", "ASIA_PACIFIC", "Hong Kong FPS", "Hong Kong FPS", ["HK"], ["HKD"],
  aliasFields("alias", L("FPS takma adı", "FPS alias"), ["fps_id", "phone", "email"]));
rail("TH_PROMPTPAY", "ASIA_PACIFIC", "Tayland PromptPay", "Thailand PromptPay", ["TH"], ["THB"],
  aliasFields("alias", L("PromptPay takma adı", "PromptPay alias"), ["phone", "ewallet"]));
rail("MY_DUITNOW", "ASIA_PACIFIC", "Malezya DuitNow", "Malaysia DuitNow", ["MY"], ["MYR"],
  aliasFields("alias", L("DuitNow takma adı", "DuitNow alias"), ["phone", "business_reg"]));
rail("ID_BIFAST", "ASIA_PACIFIC", "Endonezya BI-FAST", "Indonesia BI-FAST", ["ID"], ["IDR"],
  aliasFields("alias", L("BI-FAST takma adı", "BI-FAST alias"), ["phone", "email"]));
rail("PH_INSTAPAY", "ASIA_PACIFIC", "Filipinler InstaPay", "Philippines InstaPay", ["PH"], ["PHP"], [
  // gevşek: kaynakla doğrulanmadı
  alnumField("bank_code", L("Banka", "Bank"), "^[0-9A-Z]{2,12}$"),
  digitsField("account_number", L("Hesap numarası", "Account number"), "^\\d{6,20}$"),
]);
rail("AU_PAYID", "ASIA_PACIFIC", "Avustralya PayID", "Australia PayID", ["AU"], ["AUD"],
  aliasFields("alias", L("PayID", "PayID"), ["phone", "email", "abn"]));
rail("AU_BSB", "ASIA_PACIFIC", "Avustralya BSB", "Australia BSB", ["AU"], ["AUD"], [
  digitsField("bsb", L("BSB", "BSB"), "^\\d{6}$"),
  digitsField("account_number", L("Hesap numarası", "Account number"), "^\\d{5,9}$"),
]);
rail("NZ_BANK", "ASIA_PACIFIC", "Yeni Zelanda Banka Transferi", "New Zealand Bank Transfer", ["NZ"], ["NZD"], [
  digitsField("account_number", L("Hesap numarası", "Account number"), "^\\d{15,16}$"),
]);
rail("JP_ZENGIN", "ASIA_PACIFIC", "Japonya Zengin", "Japan Zengin", ["JP"], ["JPY"], [
  digitsField("bank_code", L("Banka kodu", "Bank code"), "^\\d{4}$"),
  digitsField("branch_code", L("Şube kodu", "Branch code"), "^\\d{3}$"),
  enumField("deposit_type", L("Hesap türü", "Deposit type"), ["ordinary", "current", "savings"]),
  digitsField("account_number", L("Hesap numarası", "Account number"), "^\\d{7}$"),
]);
rail("KR_BANK", "ASIA_PACIFIC", "Güney Kore Banka Transferi", "South Korea Bank Transfer", ["KR"], ["KRW"], [
  // gevşek: banka kodu biçimi kaynakla doğrulanmadı
  alnumField("bank_code", L("Banka kodu", "Bank code"), "^[0-9A-Z]{2,10}$"),
  digitsField("account_number", L("Hesap numarası", "Account number"), "^\\d{10,14}$"),
]);
rail("VN_NAPAS", "ASIA_PACIFIC", "Vietnam NAPAS", "Vietnam NAPAS", ["VN"], ["VND"], [
  // gevşek: kaynakla doğrulanmadı
  alnumField("bank_code", L("Banka", "Bank"), "^[0-9A-Z]{2,12}$"),
  digitsField("account_number", L("Hesap numarası", "Account number"), "^\\d{6,19}$"),
]);

// ── Uluslararası ──
// IBAN ülkesi tablosu (SWIFT_INTL hesap alanı için): katalogdaki tüm IBAN uzunlukları + GB (Registry: 22).
const ALL_IBAN_LENGTHS = {};
for (const s of specs) {
  for (const f of s.fields) {
    if (f.ibanCountryLengths) Object.assign(ALL_IBAN_LENGTHS, f.ibanCountryLengths);
  }
}
ALL_IBAN_LENGTHS.GB = 22;

rail("SWIFT_INTL", "INTERNATIONAL", "Uluslararası SWIFT Havalesi", "International SWIFT Transfer", ["*"], ["USD", "EUR"], [
  bicField(true),
  { key: "bank_country", label: L("Banka ülkesi", "Bank country"), kind: "alnum", required: true,
    pattern: "^[A-Z]{2}$", checksum: null, normalize: "strip_spaces_upper", copyable: true },
  // bank_country IBAN ülkesiyse (ibanCountryLengths) bu alan IBAN sayılır: uzunluk + mod-97 + ülke öneki eşleşmesi.
  { key: "account_number", label: L("Hesap numarası / IBAN", "Account number / IBAN"), kind: "alnum", required: true,
    pattern: "^[A-Z0-9]{4,34}$", checksum: "mod97", ibanCountryLengths: ALL_IBAN_LENGTHS,
    normalize: "strip_spaces_upper", copyable: true },
], high(
  "SWIFT_INTL_RECALL_RISK",
  "SWIFT havaleleri aracı bankalar nedeniyle gecikebilir veya geri çağrılabilir; ücret kesintisi olabilir.",
  "SWIFT transfers may be delayed or recalled through intermediary banks, and fees may be deducted."
));

function _deepFreeze(o) {
  if (o && typeof o === "object" && !Object.isFrozen(o)) {
    Object.freeze(o);
    for (const v of Object.values(o)) _deepFreeze(v);
  }
  return o;
}

const RAIL_CATALOG = _deepFreeze(specs);

function getRailCatalog() {
  return RAIL_CATALOG;
}

function getRailCodes() {
  return RAIL_CATALOG.map((r) => r.code);
}

function getRailByCode(code) {
  const c = String(code || "").toUpperCase();
  return RAIL_CATALOG.find((r) => r.code === c) || null;
}

/** İstemciye giden katalog: legacyCanonical hariç her şey. PII içermez (yalnız şema). */
function getPublicRailCatalog() {
  return JSON.parse(
    JSON.stringify(RAIL_CATALOG, (key, value) => (key === "legacyCanonical" ? undefined : value))
  );
}

/** Katalogdaki ISO-4217 para birimlerinin sıralı birleşimi (TRY/USD/EUR dahil). */
function getCatalogCurrencies() {
  return [...new Set(RAIL_CATALOG.flatMap((r) => r.currencies))].sort();
}

module.exports = {
  REGIONS,
  EXCLUDED_COUNTRIES,
  RAIL_CATALOG,
  getRailCatalog,
  getRailCodes,
  getRailByCode,
  getPublicRailCatalog,
  getCatalogCurrencies,
};
