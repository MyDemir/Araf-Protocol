"use strict";

/*
 * PaymentRailAudit — değiştirilemez (append-only) denetim kaydı.
 * Güncelleme ve silme işlemleri şema seviyesinde reddedilir. PII yok: IP yalnız HMAC hash'i olarak saklanır.
 */

const mongoose = require("mongoose");

const paymentRailAuditSchema = new mongoose.Schema(
  {
    rail: { type: String, required: true },
    previous_enabled: { type: Boolean, required: true },
    new_enabled: { type: Boolean, required: true },
    admin_wallet: { type: String, required: true, lowercase: true },
    reason: { type: String, default: "", maxlength: 300 },
    ip_hash: { type: String, default: null },
    created_at: { type: Date, default: Date.now },
  },
  { versionKey: false }
);

paymentRailAuditSchema.index({ created_at: -1 });

const IMMUTABLE_MSG = "PaymentRailAudit kayıtları değiştirilemez ve silinemez.";
const blocked = function () {
  throw new Error(IMMUTABLE_MSG);
};
[
  "updateOne", "updateMany", "findOneAndUpdate", "findOneAndReplace", "replaceOne",
  "deleteOne", "deleteMany", "findOneAndDelete", "findOneAndRemove",
].forEach((op) => paymentRailAuditSchema.pre(op, blocked));
// [TR] B4-18: Model.bulkWrite query hook'larını atlar; yalnız insertOne içeren toplu yazıma izin verilir
//      (append-only), update/delete/replace içeren her bulkWrite reddedilir.
paymentRailAuditSchema.pre("bulkWrite", function (next, ops) {
  const list = Array.isArray(ops) ? ops : [];
  if (list.some((op) => !op || !op.insertOne)) return next(new Error(IMMUTABLE_MSG));
  return next();
});
paymentRailAuditSchema.pre("save", function (next) {
  if (!this.isNew) return next(new Error(IMMUTABLE_MSG));
  return next();
});

module.exports = mongoose.model("PaymentRailAudit", paymentRailAuditSchema);
