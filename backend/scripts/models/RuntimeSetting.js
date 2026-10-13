"use strict";

/*
 * RuntimeSetting — admin panelinden değiştirilebilen çalışma (performans/operasyon) ayarları, tek belge
 * (key = "runtime_settings"). Anahtar yoksa env, o da yoksa koddaki varsayılan geçerlidir
 * (services/runtimeSettings.js). `version` optimistic concurrency içindir.
 * RPC URL'leri, gizli anahtarlar ve finality ayarları BİLEREK burada yoktur (yalnız env).
 */

const mongoose = require("mongoose");

const valueSchema = new mongoose.Schema(
  {
    value: { type: Number, required: true },
    changed_at: { type: Date, default: null },
    changed_by: { type: String, default: null, lowercase: true },
  },
  { _id: false }
);

const runtimeSettingSchema = new mongoose.Schema({
  key: { type: String, required: true, unique: true, default: "runtime_settings" },
  values: { type: Map, of: valueSchema, default: {} },
  version: { type: Number, default: 0 },
  updated_at: { type: Date, default: Date.now },
});

module.exports = mongoose.model("RuntimeSetting", runtimeSettingSchema);
