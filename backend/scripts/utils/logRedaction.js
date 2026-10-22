"use strict";

const REDACTED = "[REDACTED]";
const WALLET_REDACTED = "[WALLET]";

const SAFE_ID_KEYS = new Set(["tradeId", "orderId", "txHash", "blockNumber", "logIndex"]);

const SENSITIVE_KEY_RX = /authorization|cookie|set-cookie|x-api-key|refresh.?token|private.?key|secret|password|master_encryption_key|aws_encrypted_data_key|aws_access_key|aws_secret_access_key|vault_token|iban|account|routing|payout|telegram|receipt|ipfsreceipt|contact|name|email|phone/i;
const JWT_RX = /\beyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9._-]{10,}\.[A-Za-z0-9._-]{10,}\b/g;
const ETH_PK_RX = /0x[a-fA-F0-9]{64}\b/g;
const WALLET_RX = /\b0x[a-fA-F0-9]{40}\b/g;
const URL_QUERY_RX = /(https?:\/\/[^\s?]+)\?[^\s]*/gi;
const ASSIGNMENT_SECRET_RX = /\b(MASTER_ENCRYPTION_KEY|AWS_ENCRYPTED_DATA_KEY|VAULT_TOKEN|KMS_PLAINTEXT_KEY)\s*=\s*[^\s]+/gi;

// [TR] RPC sağlayıcı URL'lerinde API anahtarı yolda (/v2/<key>, /v3/<key>, QuickNode /<token>/) ya da sorguda
//      (?apikey=) bulunur. Anahtar maskelenir; host korunur (teşhis için).
// [EN] RPC provider URLs carry the API key in the path or the query. The key is masked; the host is kept.
const RPC_URL_RX = /\b(?:https?|wss?):\/\/[^\s"'<>`\\)\]}]+/gi;
const RPC_KEY_SEGMENT_RX = /^[A-Za-z0-9_-]{16,}$/;
const RPC_VERSION_SEGMENT_RX = /^v\d+$/i;

function redactRpcUrl(rawUrl) {
  const input = String(rawUrl ?? "");
  let parsed;
  try {
    parsed = new URL(input);
  } catch {
    return "[invalid-rpc-url]";
  }
  const segments = parsed.pathname.split("/");
  const maskedSegments = segments.map((seg, i) => {
    if (!seg) return seg;
    const afterVersion = i > 0 && RPC_VERSION_SEGMENT_RX.test(segments[i - 1]);
    return afterVersion || RPC_KEY_SEGMENT_RX.test(seg) ? "[REDACTED]" : seg;
  });
  const query = parsed.search ? "?[REDACTED_QUERY]" : "";
  return `${parsed.protocol}//${parsed.host}${maskedSegments.join("/")}${query}`;
}

// [TR] Serbest metin (ethers hata mesajı, requestUrl alanı dahil) içindeki tüm URL'leri maskeler.
// [EN] Masks every URL inside free text (ethers error messages incl. the requestUrl field).
function redactRpcSecrets(text) {
  return String(text ?? "").replace(RPC_URL_RX, (match) => {
    const trailing = match.match(/[.,;:]+$/)?.[0] || "";
    const url = trailing ? match.slice(0, -trailing.length) : match;
    const redacted = redactRpcUrl(url);
    return (redacted === "[invalid-rpc-url]" ? url : redacted) + trailing;
  });
}

function redactString(value) {
  let v = String(value);
  v = redactRpcSecrets(v);
  v = v.replace(URL_QUERY_RX, "$1?[REDACTED_QUERY]");
  v = v.replace(JWT_RX, REDACTED);
  v = v.replace(ETH_PK_RX, REDACTED);
  v = v.replace(WALLET_RX, WALLET_REDACTED);
  v = v.replace(ASSIGNMENT_SECRET_RX, "$1=[REDACTED]");
  return v;
}

function redactValue(value, keyHint = "") {
  if (value == null) return value;

  // [TR] Gelişmiş Error ve Hata Benzeri Nesne Yakalayıcı
  // B2-15: yalnız gerçek Error (ya da message+stack taşıyan duck-typed hata) özetlenir; {name, iban, code...}
  //        gibi sıradan nesneler anahtar bazlı maskeleme döngüsüne girer (PII sızıntısı ve bağlam kaybı olmaz).
  const isErrorLike =
    value instanceof Error ||
    (typeof value === "object" && typeof value.stack === "string" && typeof value.message === "string");
  if (isErrorLike) {
    return {
      name: redactString(value.name || "Error"),
      message: redactString(value.message || String(value)),
      stack: value.stack ? redactString(value.stack) : undefined,
      code: value.code,
      errno: value.errno,
      syscall: value.syscall,
    };
  }

  if (typeof value === "string") {
    if (SENSITIVE_KEY_RX.test(keyHint)) return REDACTED;
    return redactString(value);
  }

  if (typeof value !== "object") return value;

  if (Array.isArray(value)) return value.map((item) => redactValue(item, keyHint));

  const out = {};
  for (const [key, val] of Object.entries(value)) {
    if (SAFE_ID_KEYS.has(key)) {
      out[key] = val;
      continue;
    }
    if (SENSITIVE_KEY_RX.test(key)) {
      out[key] = REDACTED;
      continue;
    }
    out[key] = redactValue(val, key);
  }

  // [TR] Eğer obje boş kaldıysa ({}) ve key 'reason' veya hata bağlamındaysa boş bırakma.
  if (Object.keys(out).length === 0 && /reason|error|err/i.test(keyHint)) {
    return "[Empty Error / Rejection Object - Check Promise Catch Blocks]";
  }

  return out;
}

module.exports = {
  redactLogMeta: redactValue,
  redactLogString: redactString,
  redactRpcUrl,
  redactRpcSecrets,
};
