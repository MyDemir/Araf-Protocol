"use strict";

/*
 * SocialLinkSetting — footer sosyal linkleri, tek belge (key = "social_links"). `version` optimistic lock içindir.
 * Doğrulama utils/socialLinks.js'tedir; allowlist DB'de DEĞİL, kodda/env'dedir.
 */

const mongoose = require("mongoose");

const linkSchema = new mongoose.Schema(
  {
    id: { type: String, required: true },
    label: { type: String, required: true, maxlength: 24 },
    url: { type: String, required: true, maxlength: 300 },
    order: { type: Number, required: true },
    enabled: { type: Boolean, required: true },
  },
  { _id: false }
);

const socialLinkSettingSchema = new mongoose.Schema({
  key: { type: String, required: true, unique: true, default: "social_links" },
  links: { type: [linkSchema], default: [] },
  version: { type: Number, default: 0 },
  updated_at: { type: Date, default: Date.now },
  updated_by: { type: String, default: null, lowercase: true },
});

module.exports = mongoose.model("SocialLinkSetting", socialLinkSettingSchema);
