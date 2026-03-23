"use strict";

/**
 * Reputation Decay Job — Periyodik İtibar Temizleme Görevi
 *
 * KRİT-13 Fix: Null Timestamp Körlüğü Düzeltildi — Temiz Sayfa Artık Çalışıyor.
 *   ÖNCEKİ: Sorguda `"banned_until": { $lt: oneHundredEightyDaysAgo }` kullanılıyordu.
 *   Sorun: User.js'teki checkBanExpiry() çağrıldığında banned_until = null yapılıyordu.
 *   MongoDB'nin $lt operatörü null değerlerle eşleşmez — hiçbir kullanıcı bulunamıyordu.
 *   180 günlük "temiz sayfa" kuralı teknik olarak HİÇBİR ZAMAN tetiklenmiyordu.
 *   ŞİMDİ: İki farklı durum ayrı olarak sorgulanıyor:
 *     1. banned_until geçerli bir tarih ve 180+ gün önce dolmuş (normal durum)
 *     2. banned_until null AMA consecutive_bans > 0 (checkBanExpiry çağrılmış durum)
 *
 * Bu görev:
 * 1. Her 24 saatte bir çalışır (app.js tarafından tetiklenir)
 * 2. Uygun kullanıcıları bulur
 * 3. Relayer cüzdanı üzerinden on-chain decayReputation() fonksiyonunu çağırır
 * 4. ReputationUpdated eventi eventListener tarafından yakalanır → MongoDB senkronize
 */

const { ethers } = require("ethers");
const User       = require("../models/User");
const logger     = require("../utils/logger");

// [TR] Sadece decayReputation fonksiyonunu çağırmak için minimal ABI
const DECAY_ABI = [
  "function decayReputation(address _wallet)",
];

let relayerWallet = null;
let decayContract = null;

function getRelayer() {
  if (relayerWallet) return relayerWallet;

  const rpcUrl     = process.env.BASE_RPC_URL;
  const privateKey = process.env.RELAYER_PRIVATE_KEY;

  if (!rpcUrl || !privateKey) {
    logger.error("[DecayJob] RELAYER_PRIVATE_KEY veya RPC URL tanımsız. Görev çalıştırılamıyor.");
    return null;
  }

  const provider = new ethers.JsonRpcProvider(rpcUrl);
  relayerWallet  = new ethers.Wallet(privateKey, provider);
  logger.info(`[DecayJob] Relayer cüzdanı yüklendi: ${relayerWallet.address}`);
  return relayerWallet;
}

function getDecayContract() {
  if (decayContract) return decayContract;

  const contractAddress = process.env.ARAF_ESCROW_ADDRESS;
  const relayer         = getRelayer();
  if (!contractAddress || !relayer) return null;

  decayContract = new ethers.Contract(contractAddress, DECAY_ABI, relayer);
  return decayContract;
}

async function runReputationDecay() {
  logger.info("[DecayJob] İtibar temizleme görevi başlatıldı...");

  const contract = getDecayContract();
  if (!contract) return;

  const oneHundredEightyDaysAgo = new Date(Date.now() - 180 * 24 * 3600 * 1000);

  // KRİT-13 Fix: İki durum ayrı ayrı sorgulanıyor
  //
  // Durum 1: banned_until geçerli bir tarih, 180+ gün önce dolmuş
  //   → checkBanExpiry() henüz çağrılmamış kullanıcılar
  //
  // Durum 2: banned_until null AMA consecutive_bans > 0
  //   → checkBanExpiry() çağrılmış, DB'de null yapılmış ama on-chain temizlenmemiş
  //   ÖNCEKİ: Bu grup $lt null eşleşmediği için HİÇ bulunmuyordu!
  const usersToClean = await User.find({
    $or: [
      // Durum 1: banned_until geçerli tarih ve 180 gün dolmuş
      {
        banned_until:    { $lt: oneHundredEightyDaysAgo, $ne: null },
        consecutive_bans: { $gt: 0 },
      },
      // Durum 2: banned_until null (checkBanExpiry temizlemiş) ama consecutive_bans hâlâ > 0
      // KRİT-13 Fix: Bu durumu da yakalıyoruz
      {
        banned_until:    null,
        consecutive_bans: { $gt: 0 },
        // [TR] is_banned false olmak zorunda — aktif banlı değil, temizlenmiş
        is_banned:       false,
      },
    ],
  }).limit(50); // [TR] Gas maliyetlerini kontrol altında tutmak için bir seferde max 50

  if (usersToClean.length === 0) {
    logger.info("[DecayJob] Temizlenecek itibara sahip kullanıcı bulunamadı.");
    return;
  }

  logger.info(`[DecayJob] ${usersToClean.length} kullanıcının itibarı on-chain'de temizlenecek...`);

  for (const user of usersToClean) {
    try {
      const tx = await contract.decayReputation(user.wallet_address);
      logger.info(
        `[DecayJob] ${user.wallet_address} için on-chain temizleme işlemi gönderildi. Tx: ${tx.hash}`
      );
    } catch (err) {
      // [TR] "180-day clean period not elapsed" gibi kontrat revert mesajlarını logla
      logger.error(
        `[DecayJob] ${user.wallet_address} için itibar temizleme başarısız: ${err.reason || err.message}`
      );
    }
  }
}

module.exports = { runReputationDecay };
