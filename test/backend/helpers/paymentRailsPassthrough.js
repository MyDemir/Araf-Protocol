"use strict";

// Test yardımcısı: paymentRails servisinin "tüm katalog rail'leri etkin" davranışı (Mongo gerektirmez).
const { RAIL_CATALOG } = require("../../../backend/scripts/config/paymentRailCatalog");
const CODES = RAIL_CATALOG.map((r) => r.code);
const DEFAULT_ENABLED = RAIL_CATALOG.filter((r) => r.defaultEnabled).map((r) => r.code);
const states = Object.fromEntries(CODES.map((c) => [c, { enabled: true, changed_at: null, changed_by: null }]));

module.exports = {
  getRailStates: async () => states,
  isRailEnabled: async () => true,
  isRailEnabledStrict: async () => true,
  getRailStatesDetailed: async () => ({ states, degraded: false, source: "db" }),
  getEnabledRailCodes: async () => [...DEFAULT_ENABLED],
  applyRailStatesToRiskConfig: async (cfg) => cfg,
  isKnownRail: (c) => CODES.includes(String(c).toUpperCase()),
  listRails: async () => [],
  listAudit: async () => ({ items: [], total: 0, page: 1, limit: 20 }),
  setRailEnabled: async () => ({ changed: false }),
  invalidateRailCache: () => {},
};
