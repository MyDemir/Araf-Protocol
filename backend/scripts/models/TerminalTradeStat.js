"use strict";

/**
 * TerminalTradeStat — kalıcı kümülatif istatistik sayacı (B23).
 *
 * Trade belgeleri terminal durumdan 1 yıl sonra TTL ile silinir; kümülatif istatistikler (toplam hacim,
 * tamamlanan işlem, yakılan bond) bu yüzden geriye gidiyordu. Her terminal trade için TEK satır
 * (trade_key unique) burada kalıcı tutulur; satır PII içermez ve TTL'i yoktur.
 * [EN] One permanent, PII-free row per terminal trade (unique trade_key); no TTL. Cumulative stats read
 *      from here so they never go backwards when Trade rows expire.
 */

const mongoose = require("mongoose");

if (typeof mongoose.Schema !== "function") {
  module.exports = {
    updateOne: async () => ({}),
    aggregate: async () => [],
    countDocuments: async () => 0,
    bulkWrite: async () => ({}),
  };
} else {
  const schema = new mongoose.Schema(
    {
      trade_key: { type: String, required: true, unique: true },
      status: { type: String, enum: ["RESOLVED", "CANCELED", "BURNED"], required: true, index: true },
      token_address: { type: String, default: null, lowercase: true },
      crypto_amount: { type: String, default: "0" },
      crypto_amount_num: { type: Number, default: 0 },
      // [TR] Eriyen + yakılan toplam (base unit), burned_bonds istatistiği için.
      burned_amount: { type: String, default: "0" },
      burned_amount_num: { type: Number, default: 0 },
      locked_at: { type: Date, default: null },
      resolved_at: { type: Date, default: null },
      duration_ms: { type: Number, default: 0 },
    },
    { timestamps: { createdAt: "recorded_at", updatedAt: false }, versionKey: false, collection: "terminal_trade_stats" }
  );

  module.exports = mongoose.model("TerminalTradeStat", schema);
}
