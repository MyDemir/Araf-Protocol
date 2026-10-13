"use strict";

/**
 * [TR] Kısıtlı (degraded) modda VARSAYILAN KAPALI kapı. /api altına tek noktadan bağlanır.
 *      Degraded değilse hiçbir şey yapmaz. Degraded iken yalnız aşağıdaki izin listesindeki (method + yol)
 *      uçlar geçer; listede olmayan HER uç (yeni eklenenler dahil) 503 SERVICE_DEGRADED döner.
 *      İzin listesine yalnız: KMS/PII gerektirmeyen, zincir durumuna göre karar vermeyen, yazma etkisi
 *      zinciri/kişisel veriyi riske atmayan uçlar konur.
 * [EN] Default-deny gate while degraded, mounted once under /api. Only allowlisted (method + path) endpoints
 *      pass; everything else (including future routes) answers 503 SERVICE_DEGRADED.
 */

const serviceMode = require("../services/serviceMode");

// Yollar /api mount'una göre göreli (req.path). Eşleşme tam yol (^...$) olmak zorundadır.
const DEGRADED_ALLOWLIST = Object.freeze([
  // Herkese açık okuma (yalnız DB / önbellek)
  { method: "GET", path: /^\/orders\/?$/ },
  { method: "GET", path: /^\/orders\/config\/?$/, configStale: true },
  { method: "GET", path: /^\/orders\/payment-risk-config\/?$/, configStale: true },
  { method: "GET", path: /^\/orders\/\d+\/?$/ },
  { method: "GET", path: /^\/stats\/?$/ },
  { method: "GET", path: /^\/reference-rates\/ticker\/?$/ },
  { method: "GET", path: /^\/rewards\/.+$/ },
  // İstemci hata günlüğü (yalnız log)
  { method: "POST", path: /^\/logs\/client-error\/?$/ },
  // Auth (SIWE doğrulaması çevrimdışı imza kontrolüdür; RPC/KMS gerektirmez)
  { method: "GET", path: /^\/auth\/nonce\/?$/ },
  { method: "POST", path: /^\/auth\/verify\/?$/ },
  { method: "POST", path: /^\/auth\/refresh\/?$/ },
  { method: "POST", path: /^\/auth\/logout\/?$/ },
  { method: "GET", path: /^\/auth\/me\/?$/ },
]);

function _findAllowEntry(allowlist, method, path) {
  const m = method === "HEAD" ? "GET" : method;
  return allowlist.find((e) => e.method === m && e.path.test(path)) || null;
}

function createRequireFullService({
  allowlist = DEGRADED_ALLOWLIST,
  isDegraded = serviceMode.isDegraded,
  getReasons = serviceMode.getDegradedReasons,
  isConfigStale = serviceMode.isConfigStale,
} = {}) {
  return function requireFullService(req, res, next) {
    if (!isDegraded()) return next();

    const entry = _findAllowEntry(allowlist, req.method, req.path);
    if (entry) {
      res.set("X-Araf-Degraded", "true");
      if (entry.configStale && isConfigStale()) res.set("X-Araf-Config-Stale", "true");
      return next();
    }

    res.set("Retry-After", "30");
    return res.status(503).json({
      error: "Servis geçici olarak kısıtlı modda; bu işlem şu an kullanılamıyor. / Service is temporarily in restricted mode.",
      code: "SERVICE_DEGRADED",
      degradedReasons: getReasons(),
    });
  };
}

module.exports = {
  requireFullService: createRequireFullService(),
  createRequireFullService,
  DEGRADED_ALLOWLIST,
  _findAllowEntry,
};
