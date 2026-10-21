"use strict";
// [TR] Hata çıktısı redaksiyonu (K4-10): RPC URL'leri (API anahtarı taşıyabilir), özel anahtarlar ve
//      ortamdaki gizli değerler çıktıya girmez. Ham hata nesnesi yerine yalnızca ad + kod + maskelenmiş ilk satır basılır.
// [EN] Error-output redaction: no RPC URLs (may embed API keys), private keys or secret env values reach logs.
//      Print name + code + masked first line instead of the raw error object.

const SECRET_ENV_NAMES = [
  "DEPLOYER_PRIVATE_KEY", "PRIVATE_KEY", "BASE_SEPOLIA_RPC_URL", "BASE_MAINNET_RPC_URL", "BASESCAN_API_KEY", "ETHERSCAN_API_KEY",
];

function redactText(input, env = process.env) {
  let s = String(input == null ? "" : input);
  for (const name of SECRET_ENV_NAMES) {
    const v = env[name];
    if (v && v.length >= 8) s = s.split(v).join("[redacted]");
  }
  return s
    .replace(/\b[a-z][a-z0-9+.-]*:\/\/[^\s"'<>)]+/gi, "[redacted-url]")
    .replace(/\b(?:0x)?[0-9a-fA-F]{64}\b/g, "[redacted-hex64]")
    .replace(/\b[A-Za-z0-9_-]{32,}\b/g, "[redacted-token]");
}

// [TR] "Ad [kod]: maskelenmiş ilk satır". Stack ve ham nesne (info/request alanları URL taşıyabilir) basılmaz.
function formatError(err, env = process.env) {
  const name = (err && err.name) || "Error";
  const code = err && err.code != null ? ` [${redactText(err.code, env)}]` : "";
  const first = String(err && err.message != null ? err.message : err).split("\n")[0];
  return `${redactText(name, env)}${code}: ${redactText(first, env)}`;
}

module.exports = { redactText, formatError };
