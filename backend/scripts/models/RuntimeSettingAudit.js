"use strict";

/*
 * RuntimeSettingAudit — değiştirilemez (append-only) denetim kaydı. PII yok: IP yalnız HMAC hash'i.
 * previous_value / new_value null = "admin override yok" (env/varsayılan geçerli).
 */

const mongoose = require("mongoose");

const runtimeSettingAuditSchema = new mongoose.Schema(
  {
    setting: { type: String, required: true },
    previous_value: { type: Number, default: null },
    new_value: { type: Number, default: null },
    admin_wallet: { type: String, required: true, lowercase: true },
    reason: { type: String, default: "", maxlength: 300 },
    ip_hash: { type: String, default: null },
    created_at: { type: Date, default: Date.now },
  },
  { versionKey: false }
);

runtimeSettingAuditSchema.index({ created_at: -1 });

const IMMUTABLE_MSG = "RuntimeSettingAudit kayıtları değiştirilemez ve silinemez.";
const blocked = function () {
  throw new Error(IMMUTABLE_MSG);
};
[
  "updateOne", "updateMany", "findOneAndUpdate", "findOneAndReplace", "replaceOne",
  "deleteOne", "deleteMany", "findOneAndDelete", "findOneAndRemove",
].forEach((op) => runtimeSettingAuditSchema.pre(op, blocked));
// [TR] B4-18: Model.bulkWrite query hook'larını atlar; yalnız insertOne içeren toplu yazıma izin verilir
//      (append-only), update/delete/replace içeren her bulkWrite reddedilir.
runtimeSettingAuditSchema.pre("bulkWrite", function (next, ops) {
  const list = Array.isArray(ops) ? ops : [];
  if (list.some((op) => !op || !op.insertOne)) return next(new Error(IMMUTABLE_MSG));
  return next();
});
runtimeSettingAuditSchema.pre("save", function (next) {
  if (!this.isNew) return next(new Error(IMMUTABLE_MSG));
  return next();
});

module.exports = mongoose.model("RuntimeSettingAudit", runtimeSettingAuditSchema);
