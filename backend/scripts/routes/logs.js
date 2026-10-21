"use strict";
const express = require("express");
const router = express.Router();
const logger = require("../utils/logger");
const { clientLogLimiter } = require("../middleware/rateLimiter");

// [TR] CR/LF ve diğer kontrol karakterleri log satırı sahteciliği için kullanılabilir; tek boşluğa çevrilir.
function stripLogControlChars(value) {
  if (typeof value !== "string") return value;
  // eslint-disable-next-line no-control-regex -- E1-06: kontrol karakterlerini temizlemek kasıtlı
  return value.replace(/[\u0000-\u001f\u007f\u0085\u2028\u2029]+/g, " ");
}

function scrubClientErrorText(value) {
  if (!value || typeof value !== "string") return value;
  return stripLogControlChars(value)
    .replace(/TR\d{24}/gi, "[REDACTED]")
    .replace(/\b[A-Z]{2}[A-Z0-9]{13,32}\b/g, "[REDACTED]")
    .replace(/\b\d{9}\b/g, "[REDACTED]")
    .replace(/\b\d{4,17}\b/g, "[REDACTED]")
    .replace(/0x[a-fA-F0-9]{40}/g, "[REDACTED]")
    .replace(/\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}\b/g, "[REDACTED]")
    .replace(/(bearer\s+)[a-zA-Z0-9\-._~+/]+=*/gi, "$1[REDACTED]")
    .replace(/\b(eyJ[^\s]+)\b/g, "[REDACTED]");
}

// [TR] Teşhis alanları scrub'sız loglanır; yalnız sıkı beyaz liste regex'lerine uyanlar geçer.
function pickDiagFields({ diag, rpcCode, selector }) {
  const out = {};
  if (typeof diag === "string" && /^[A-Za-z0-9:_-]{1,64}$/.test(diag)) out.diag = diag;
  if (Number.isInteger(rpcCode) && rpcCode >= -99999 && rpcCode <= 99999) out.rpcCode = rpcCode;
  if (typeof selector === "string" && /^0x[0-9a-fA-F]{8}$/.test(selector)) out.selector = selector;
  return out;
}

router.post("/client-error", clientLogLimiter, (req, res) => {
  const { message, stack, componentStack, url } = req.body || {};
  if (!message || typeof message !== "string") return res.status(400).json({ error: "message alanı zorunludur." });
  logger.error("[FRONTEND-CRASH]", {
    message: scrubClientErrorText(String(message).slice(0, 500)),
    url: url ? stripLogControlChars(String(url).slice(0, 200)) : undefined,
    stack: stack ? scrubClientErrorText(String(stack).slice(0, 2000)) : undefined,
    componentStack: componentStack ? scrubClientErrorText(String(componentStack).slice(0, 1000)) : undefined,
    ...pickDiagFields(req.body || {}),
    userAgent: stripLogControlChars(req.headers["user-agent"]?.slice(0, 200)),
  });
  res.status(204).end();
});
module.exports = router;
module.exports.scrubClientErrorText = scrubClientErrorText;
module.exports.stripLogControlChars = stripLogControlChars;
