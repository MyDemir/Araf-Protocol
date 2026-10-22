"use strict";

// B4-18: audit değişmezliği query hook'larıyla sınırlı kalmamalı: bulkWrite ve doc.deleteOne()/doc.updateOne() de reddedilmeli.

const mongoose = require("mongoose");

const MODELS = [
  ["PaymentRailAudit", () => require("../../backend/scripts/models/PaymentRailAudit"), { rail: "US_ACH", previous_enabled: true, new_enabled: false, admin_wallet: "0xabc" }],
  ["RuntimeSettingAudit", () => require("../../backend/scripts/models/RuntimeSettingAudit"), { setting: "WORKER_MAX_LAG_BLOCKS", previous_value: null, new_value: 30, admin_wallet: "0xabc" }],
  ["SocialLinkAudit", () => require("../../backend/scripts/models/SocialLinkAudit"), { previous_links: [], new_links: [], version: 1, admin_wallet: "0xabc" }],
];

describe.each(MODELS)("%s değişmezlik", (_name, load, sample) => {
  const Model = load();

  it("Model.bulkWrite (update/delete) reddedilir", async () => {
    await expect(Model.bulkWrite([{ deleteOne: { filter: {} } }])).rejects.toThrow(/değiştirilemez/);
    await expect(Model.bulkWrite([{ updateOne: { filter: {}, update: { $set: { reason: "x" } } } }])).rejects.toThrow(/değiştirilemez/);
  });

  it("yüklenmiş belgede doc.deleteOne() reddedilir", async () => {
    const doc = new Model(sample);
    doc.isNew = false; // veritabanından yüklenmiş belge gibi
    await expect(doc.deleteOne()).rejects.toThrow(/değiştirilemez/);
  });

  it("yüklenmiş belgede doc.updateOne() reddedilir", async () => {
    const doc = new Model(sample);
    doc.isNew = false;
    await expect(doc.updateOne({ $set: { reason: "x" } })).rejects.toThrow(/değiştirilemez/);
  });

  it("mevcut query hook'ları sürer (Model.deleteMany reddedilir)", async () => {
    await expect(Model.deleteMany({})).rejects.toThrow(/değiştirilemez/);
  });
});

afterAll(() => mongoose.disconnect());
