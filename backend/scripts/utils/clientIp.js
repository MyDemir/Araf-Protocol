"use strict";

const crypto = require("crypto");
const net = require("net");

/**
 * [TR] Gerçek istemci IP'sini çözer. İstek yolu: tarayıcı -> Vercel rewrite -> Fly -> Express;
 *      bu yüzden req.ip altyapı adresidir. ORIGIN_SHARED_SECRET tanımlıysa ve istek
 *      `x-araf-origin-secret` başlığında aynı sırrı taşıyorsa (Vercel rewrite ekler),
 *      geçerli `x-real-ip` kullanılır. Aksi halde req.ip (secret yokken bugünkü davranış).
 *      Sır, başlık değeri ve IP loglanmaz; istek reddedilmez.
 * [EN] Resolves the real client IP behind the Vercel->Fly chain, trusting x-real-ip only
 *      when the shared origin secret matches (constant-time compare).
 */
function secretMatches(expected, provided) {
  if (typeof provided !== "string" || provided.length === 0) return false;
  const a = crypto.createHash("sha256").update(expected).digest();
  const b = crypto.createHash("sha256").update(provided).digest();
  return crypto.timingSafeEqual(a, b);
}

function resolveClientIp(req) {
  const secret = process.env.ORIGIN_SHARED_SECRET;
  if (!secret || !req || !req.headers) return req?.ip;

  const provided = req.headers["x-araf-origin-secret"];
  if (!secretMatches(secret, provided)) return req.ip;

  const realIp = req.headers["x-real-ip"];
  if (typeof realIp !== "string") return req.ip;
  const candidate = realIp.trim();
  return net.isIP(candidate) ? candidate : req.ip;
}

module.exports = { resolveClientIp };
