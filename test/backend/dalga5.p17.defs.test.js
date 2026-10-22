"use strict";

// B4-19: güvenlik komşusu admin ayarlarının üst sınırları daraltıldı.

const { SETTING_DEFS } = require("../../backend/scripts/config/runtimeSettingDefs");

describe("B4-19: daraltılmış üst sınırlar", () => {
  it("WORKER_MAX_LAG_BLOCKS en çok 100 (geride kalan worker'ı gizlemek zorlaşır), varsayılan sınır içinde", () => {
    const d = SETTING_DEFS.WORKER_MAX_LAG_BLOCKS;
    expect(d.max).toBeLessThanOrEqual(100);
    expect(d.default).toBeLessThanOrEqual(d.max);
  });

  it("REPUTATION_DECAY_TX_LIMIT en çok 50 (relayer gas harcaması), varsayılan sınır içinde", () => {
    const d = SETTING_DEFS.REPUTATION_DECAY_TX_LIMIT;
    expect(d.max).toBeLessThanOrEqual(50);
    expect(d.default).toBeLessThanOrEqual(d.max);
  });
});
