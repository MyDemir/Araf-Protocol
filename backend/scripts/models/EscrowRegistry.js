"use strict";

/*
 * EscrowRegistry — "aktif escrow" kaydı (koleksiyon: escrow_registry, tek belge: _id = "active").
 * [TR] Backend bu modeli YALNIZ OKUR (services/escrowRegistryGuard.js). Yazma yolu yalnız deploy workflow'unun
 *      .github/scripts/escrow-registry.js betiğidir; hiçbir route/admin paneli yazmaz. autoIndex/autoCreate kapalı:
 *      backend koleksiyonu kendiliğinden oluşturmaz.
 * [EN] Backend is READ-ONLY on this model. Only the deploy workflow script writes it.
 */

const mongoose = require("mongoose");

const escrowRegistrySchema = new mongoose.Schema(
  {
    _id: { type: String },
    escrow_address: { type: String, lowercase: true },
    chain_id: { type: Number },
    deploy_block: { type: Number },
    state: { type: String, enum: ["ACTIVE", "ROTATING"] },
    since: { type: Date },
    updated_by: { type: String },
  },
  { collection: "escrow_registry", autoIndex: false, autoCreate: false, versionKey: false }
);

module.exports = mongoose.models.EscrowRegistry || mongoose.model("EscrowRegistry", escrowRegistrySchema);
