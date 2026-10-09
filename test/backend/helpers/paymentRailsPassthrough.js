"use strict";

// Test yardımcısı: paymentRails servisinin "tüm rail'ler etkin" davranışı (Mongo gerektirmez).
const CODES = ["TR_IBAN", "US_ACH", "SEPA_IBAN"];
const states = Object.fromEntries(CODES.map((c) => [c, { enabled: true, changed_at: null, changed_by: null }]));

module.exports = {
  getRailStates: async () => states,
  isRailEnabled: async () => true,
  isRailEnabledStrict: async () => true,
  getRailStatesDetailed: async () => ({ states, degraded: false, source: "db" }),
  getEnabledRailCodes: async () => [...CODES],
  applyRailStatesToRiskConfig: async (cfg) => cfg,
  isKnownRail: (c) => CODES.includes(String(c).toUpperCase()),
  listRails: async () => [],
  listAudit: async () => ({ items: [], total: 0, page: 1, limit: 20 }),
  setRailEnabled: async () => ({ changed: false }),
  invalidateRailCache: () => {},
};
