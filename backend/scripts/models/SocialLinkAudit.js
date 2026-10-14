"use strict";

/*
 * SocialLinkAudit — değiştirilemez (append-only) denetim kaydı. PII yok: IP yalnız HMAC hash'i.
 */

const mongoose = require("mongoose");

const snapshotLink = new mongoose.Schema(
  { id: String, label: String, url: String, order: Number, enabled: Boolean },
  { _id: false }
);

const socialLinkAuditSchema = new mongoose.Schema(
  {
    previous_links: { type: [snapshotLink], default: [] },
    new_links: { type: [snapshotLink], default: [] },
    version: { type: Number, required: true },
    admin_wallet: { type: String, required: true, lowercase: true },
    reason: { type: String, default: "", maxlength: 300 },
    ip_hash: { type: String, default: null },
    created_at: { type: Date, default: Date.now },
  },
  { versionKey: false }
);

socialLinkAuditSchema.index({ created_at: -1 });

const IMMUTABLE_MSG = "SocialLinkAudit kayıtları değiştirilemez ve silinemez.";
const blocked = function () {
  throw new Error(IMMUTABLE_MSG);
};
[
  "updateOne", "updateMany", "findOneAndUpdate", "findOneAndReplace", "replaceOne",
  "deleteOne", "deleteMany", "findOneAndDelete", "findOneAndRemove",
].forEach((op) => socialLinkAuditSchema.pre(op, blocked));
socialLinkAuditSchema.pre("save", function (next) {
  if (!this.isNew) return next(new Error(IMMUTABLE_MSG));
  return next();
});

module.exports = mongoose.model("SocialLinkAudit", socialLinkAuditSchema);
