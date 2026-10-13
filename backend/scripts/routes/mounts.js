"use strict";

/**
 * [TR] /api altındaki TÜM router'ların tek kaynağı. app.js bunları sırayla bağlar; degraded-kapı testi de aynı
 *      listeyi kullanır (yeni router eklenince test otomatik görür). Log rotası bilinçli olarak en üsttedir.
 * [EN] Single source of truth for every router mounted under /api (used by app.js and the degraded gate test).
 */
const ROUTE_MOUNTS = Object.freeze([
  Object.freeze({ path: "/api/logs", file: "logs" }),
  Object.freeze({ path: "/api/auth", file: "auth" }),
  Object.freeze({ path: "/api/orders", file: "orders" }),
  Object.freeze({ path: "/api/trades", file: "trades" }),
  Object.freeze({ path: "/api/pii", file: "pii" }),
  Object.freeze({ path: "/api/feedback", file: "feedback" }),
  Object.freeze({ path: "/api/stats", file: "stats" }),
  Object.freeze({ path: "/api/receipts", file: "receipts" }),
  Object.freeze({ path: "/api/admin", file: "admin" }),
  Object.freeze({ path: "/api/reference-rates", file: "referenceRates" }),
  Object.freeze({ path: "/api/rewards", file: "rewards" }),
]);

module.exports = { ROUTE_MOUNTS };
