"use strict";

const express = require("express");
const RewardEpoch = require("../models/RewardEpoch");
const RewardClaim = require("../models/RewardClaim");
const RewardFunding = require("../models/RewardFunding");
const { marketReadLimiter } = require("../middleware/rateLimiter");

const router = express.Router();

const EPOCH_RE = /^\d{1,12}$/;
const WALLET_RE = /^0x[a-fA-F0-9]{40}$/;
const PRODUCT_ID_RE = /^0x[a-fA-F0-9]{64}$/;

// [TR] Tüm rewards yüzeyi public read-only mirror'dır; toplu tarama/DoS'a karşı rate-limit uygulanır.
//      Gelir kayıtları (revenue) yalnız auth + ADMIN_WALLETS korumalı /api/admin/revenue altındadır.
// [EN] The rewards surface is a public read-only mirror, rate-limited against scraping/DoS.
//      Revenue rows live only under the auth + ADMIN_WALLETS gated /api/admin/revenue.
router.use(marketReadLimiter);

// [TR] ArafRewards.epochDuration varsayılanı (30 gün). Bu uç nokta duvar saati tahminidir; otorite kontrattır.
// [EN] ArafRewards.epochDuration default (30 days). Wall-clock estimate only; the contract is authoritative.
const REWARDS_EPOCH_SECONDS = 30 * 24 * 3600;

router.get("/epochs/current", async (_req, res, next) => {
  try {
    const nowEpoch = Math.floor(Date.now() / 1000 / REWARDS_EPOCH_SECONDS);
    const rows = await RewardEpoch.find({ epoch: String(nowEpoch) }).lean();
    return res.json({ epoch: String(nowEpoch), rows, source: "WALL_CLOCK_ESTIMATE_NOT_AUTHORITY" });
  } catch (err) { return next(err); }
});

router.get("/epochs/:epoch", async (req, res, next) => {
  try {
    const epoch = String(req.params.epoch || "");
    if (!EPOCH_RE.test(epoch)) return res.status(400).json({ error: "Geçersiz epoch." });
    const rows = await RewardEpoch.find({ epoch }).lean();
    return res.json({ epoch, rows });
  } catch (err) { return next(err); }
});

router.get("/health", async (_req, res, next) => {
  try {
    const [epochs, claims, funding] = await Promise.all([
      RewardEpoch.countDocuments(),
      RewardClaim.countDocuments(),
      RewardFunding.countDocuments(),
    ]);
    return res.json({ mirror_only: true, counts: { epochs, claims, funding } });
  } catch (err) { return next(err); }
});

router.get("/funding/global", async (_req, res, next) => {
  try {
    const rows = await RewardFunding.find({ type: "GLOBAL" }).sort({ block_number: -1, log_index: -1 }).limit(200).lean();
    return res.json({ rows });
  } catch (err) { return next(err); }
});

router.get("/funding/product/:productId", async (req, res, next) => {
  try {
    const productId = String(req.params.productId || "").toLowerCase();
    if (!PRODUCT_ID_RE.test(productId)) return res.status(400).json({ error: "Geçersiz productId." });
    const rows = await RewardFunding.find({ type: "PRODUCT", product_id: productId })
      .sort({ block_number: -1, log_index: -1 })
      .limit(200)
      .lean();
    return res.json({ productId, rows });
  } catch (err) { return next(err); }
});

router.get("/:wallet/claimable", async (req, res) => {
  const wallet = String(req.params.wallet || "");
  if (!WALLET_RE.test(wallet)) return res.status(400).json({ error: "Geçersiz cüzdan adresi." });
  // [TR] Backend ağırlıkları kalıcı tutmaz (TradeOutcomeRecorded yalnız zaman damgası bırakır) ve claim edilebilir
  //      tutar userWeight/totalWeight/epochRewardPool'a bağlıdır; mirror'dan güvenilir hesaplanamaz. Sessiz boş liste
  //      "ödül yok" diye okunabileceğinden açıkça "kaynak zincir" döndürülür.
  // [EN] The backend does not persist weights, and claimable depends on on-chain userWeight/totalWeight/pool, so it
  //      cannot be computed reliably from the mirror. An empty list would read as "no rewards"; be explicit instead.
  return res.json({
    wallet: wallet.toLowerCase(),
    available: false,
    claimable: null,
    authority: "chain",
    source: "ESTIMATE_UNAVAILABLE_USE_ONCHAIN_GETTER",
    note: "Kaynak: zincir. Frontend ArafRewards.claimable(epoch, user, token) on-chain getter'ını kullanmalı. / Source: chain; use the on-chain claimable(epoch, user, token) getter.",
  });
});

router.get("/:wallet/history", async (req, res, next) => {
  try {
    const wallet = String(req.params.wallet || "");
    if (!WALLET_RE.test(wallet)) return res.status(400).json({ error: "Geçersiz cüzdan adresi." });
    const normalized = wallet.toLowerCase();
    const claims = await RewardClaim.find({ user: normalized }).sort({ block_number: -1, log_index: -1 }).limit(200).lean();
    return res.json({ wallet: normalized, claims });
  } catch (err) { return next(err); }
});

module.exports = router;
