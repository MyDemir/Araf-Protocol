"use strict";

// [TR] Kullanım koşulları sürümü. Frontend `app/legal/terms.js` ile aynı olmalı (test zorlar).
//      Kullanıcı kabulü SIWE mesajının `statement` alanında imzalanır; imza, kabulün kriptografik kanıtıdır.
//      Metin değişince sürüm artırılır; kullanıcı bir sonraki girişte yeni sürümü imzalar.
// [EN] Terms version; must match the frontend constant (enforced by a test). Acceptance is signed inside
//      the SIWE statement, so the wallet signature itself proves which version was accepted.
const CURRENT_TERMS_VERSION = "2026-10-01";

// [TR] Geçiş döneminde eski sürüm imzaları kabul edilebilir; kayıt her zaman imzalanan sürümle tutulur.
const ACCEPTED_TERMS_VERSIONS = new Set([CURRENT_TERMS_VERSION]);

const TERMS_CLAUSE_RE = /I accept the Araf Terms of Use v(\d{4}-\d{2}-\d{2})\b/;

/**
 * SIWE statement içinden kabul edilen koşul sürümünü çıkarır.
 * @returns {string|null}
 */
function parseTermsAcceptance(statement) {
  const match = TERMS_CLAUSE_RE.exec(String(statement || ""));
  return match ? match[1] : null;
}

module.exports = {
  CURRENT_TERMS_VERSION,
  ACCEPTED_TERMS_VERSIONS,
  parseTermsAcceptance,
};
