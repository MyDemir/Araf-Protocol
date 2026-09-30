"use strict";

// [TR] Zincir kimlikleri için ortak doğrulayıcılar (route'lar, worker ve job'lar aynı kuralı kullanır).
// [EN] Shared validators for on-chain identifiers (routes, worker and jobs use one rule).

const POSITIVE_NUMERIC_ID_RE = /^[1-9]\d*$/;
const ZERO_ADDRESS = "0x0000000000000000000000000000000000000000";

// [TR] Pozitif on-chain id'yi string olarak döndürür; geçersizse null. [EN] Positive on-chain id as string, else null.
function parsePositiveOnchainId(rawId) {
  const normalized = String(rawId ?? "").trim();
  return POSITIVE_NUMERIC_ID_RE.test(normalized) ? normalized : null;
}

// [TR] Env'den gelen adres tanımlı ve sıfır adres değil mi? [EN] Is an env address set and non-zero?
function isConfiguredAddress(addr) {
  return typeof addr === "string" && /^0x[a-fA-F0-9]{40}$/.test(addr) && addr.toLowerCase() !== ZERO_ADDRESS;
}

module.exports = { POSITIVE_NUMERIC_ID_RE, parsePositiveOnchainId, isConfiguredAddress };
