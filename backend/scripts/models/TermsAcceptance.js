"use strict";
const mongoose = require("mongoose");
if (typeof mongoose.Schema !== "function") {
  module.exports = {
    findOne: () => ({ lean: async () => null }),
    updateOne: async () => ({ acknowledged: true }),
  };
} else {

// [TR] Kullanım koşulları kabulünün kalıcı kanıtı: her cüzdan + sürüm için İLK kabulün imzalı SIWE
//      mesajı ve imzası birebir saklanır. Kayıt değiştirilmez ($setOnInsert) ve TTL'e tabi değildir;
//      User kaydı 2 yıl hareketsizlikte silinse bile kanıt kalır. İmza, herkes tarafından mesaj +
//      cüzdan adresiyle bağımsız olarak doğrulanabilir (EIP-191 personal_sign).
// [EN] Permanent evidence of terms acceptance: the first signed SIWE message and signature per wallet
//      and version, stored verbatim, never overwritten and not subject to TTL. Independently verifiable.
const termsAcceptanceSchema = new mongoose.Schema(
  {
    wallet_address: { type: String, required: true, lowercase: true },
    terms_version: { type: String, required: true },
    accepted_at: { type: Date, required: true },
    signed_message: { type: String, required: true },
    signature: { type: String, required: true },
    message_sha256: { type: String, required: true },
    chain_id: { type: Number, default: null },
  },
  { timestamps: { createdAt: "created_at", updatedAt: false }, versionKey: false }
);
termsAcceptanceSchema.index({ wallet_address: 1, terms_version: 1 }, { unique: true });

module.exports = mongoose.model("TermsAcceptance", termsAcceptanceSchema);

}
