// [TR] Hata çıktısı maskeleme (K4-10): URL (RPC anahtarı içerebilir), uzun anahtar benzeri dizgiler ve satır sonları silinir.
//      Ham hata nesnesi basılmaz; yalnız ad + kod + maskeli ilk satır döner. Bağımlılık yok.
// [EN] Error output redaction: strips URLs, long token-like strings and newlines. Never prints the raw error object.
'use strict';

function redactText(s) {
  return String(s == null ? '' : s)
    .replace(/[a-z][a-z0-9+.-]*:\/\/\S+/gi, '[redacted-url]')
    .replace(/0x[a-fA-F0-9]{64,}/g, '[redacted-hex]')
    // 0x + tam 40 hex (adres) korunur; diğer 32+ karakterlik anahtar benzeri dizgiler maskelenir.
    .replace(/(?<![A-Za-z0-9_-])(?!0x[a-fA-F0-9]{40}(?![A-Za-z0-9_-]))[A-Za-z0-9_-]{32,}/g, '[redacted]')
    .replace(/[\r\n]+/g, ' ')
    .slice(0, 300);
}

// "Name (CODE): maskeli mesaj"
function redactError(err) {
  const name = (err && err.name) || 'Error';
  const code = err && err.code ? ` (${redactText(err.code)})` : '';
  return `${redactText(name)}${code}: ${redactText(err && err.message)}`;
}

module.exports = { redactText, redactError };
