"use strict";

/*
 * PaymentRailSetting — ödeme yöntemi (rail) etkinlik ayarı, tek belge (key = "payment_rails").
 * Kayıt yoksa kodda tanımlı tüm rail'ler etkin kabul edilir (services/paymentRails.js).
 * `version` optimistic concurrency içindir (son-rail kuralının yarış durumunda delinmemesi).
 */

const mongoose = require("mongoose");

const railStateSchema = new mongoose.Schema(
  {
    enabled: { type: Boolean, required: true },
    changed_at: { type: Date, default: null },
    changed_by: { type: String, default: null, lowercase: true },
  },
  { _id: false }
);

const paymentRailSettingSchema = new mongoose.Schema({
  key: { type: String, required: true, unique: true, default: "payment_rails" },
  // rail kodu -> durum; kodlar serviste kodda tanımlı listeye karşı doğrulanır.
  rails: { type: Map, of: railStateSchema, default: {} },
  version: { type: Number, default: 0 },
  updated_at: { type: Date, default: Date.now },
});

module.exports = mongoose.model("PaymentRailSetting", paymentRailSettingSchema);
