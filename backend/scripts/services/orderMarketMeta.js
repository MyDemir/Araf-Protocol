"use strict";

/**
 * Order Market Meta — maker'ın off-chain kur / fiat bilgisi
 *
 * Kontrat parent order'da yalnız token miktarlarını tutar; maker'ın girdiği kur (exchange_rate)
 * ve fiat para birimi zincire yazılmaz. Bu bilgi olmadan pazar yerinde fiyat gösterilemez.
 *
 * Akış:
 *   1. Frontend createSellOrder/createBuyOrder tx'i onaylandıktan sonra
 *      POST /api/orders/market-meta { orderRef, fiatCurrency, exchangeRate } gönderir.
 *   2. Order mirror zaten varsa ve sahibi oturum cüzdanıysa doğrudan yazılır.
 *   3. Mirror henüz yoksa (finality gecikmesi) Redis'e kısa ömürlü niyet olarak yazılır;
 *      event worker OrderCreated işlerken sahibi eşleşirse uygular.
 *
 * Güvenlik:
 *   - Set-once: kur bir kez yazıldıktan sonra değiştirilemez (fill sırasında fiyat
 *     değiştirme / front-running yüzeyi kapatılır).
 *   - Yalnız order sahibi yazabilir (mirror'daki owner_address veya worker tarafında kontrol).
 *   - Bu değer protokol otoritesi değildir; yalnız UI enrichment'tır.
 */

const { getRedisClient } = require("../config/redis");

const ORDER_MARKET_META_PREFIX = "order_meta:";
const ORDER_MARKET_META_TTL_SECS = 24 * 60 * 60;
const ALLOWED_FIAT = ["TRY", "USD", "EUR"];
const MAX_EXCHANGE_RATE = 1_000_000;

function normalizeMarketMeta({ fiatCurrency, exchangeRate } = {}) {
  const fiat = String(fiatCurrency || "").trim().toUpperCase();
  const rate = Number(exchangeRate);
  if (!ALLOWED_FIAT.includes(fiat)) return null;
  if (!Number.isFinite(rate) || rate <= 0 || rate > MAX_EXCHANGE_RATE) return null;
  return { fiat_currency: fiat, exchange_rate: Number(rate.toFixed(6)) };
}

// [TR] Anahtar orderRef + sahip adresidir. Yalnız orderRef kullanılsaydı mempool'daki tx'ten
//      ref'i gören üçüncü kişi önce yazıp gerçek maker'ın kaydını NX ile kilitleyebilirdi.
// [EN] Keyed by orderRef + owner. Keying by orderRef alone would let anyone who saw the ref in
//      the mempool claim the NX slot first and lock the real maker out.
function _metaKey(orderRef, owner) {
  return `${ORDER_MARKET_META_PREFIX}${String(orderRef).toLowerCase()}:${String(owner).toLowerCase()}`;
}

async function storePendingMarketMeta(orderRef, owner, meta) {
  const redis = getRedisClient();
  // [TR] NX: aynı (orderRef, owner) için ilk niyet kazanır (set-once).
  // [EN] NX: first intent wins for the same (orderRef, owner) pair (set-once).
  const result = await redis.set(
    _metaKey(orderRef, owner),
    JSON.stringify({ owner: String(owner).toLowerCase(), ...meta }),
    { NX: true, EX: ORDER_MARKET_META_TTL_SECS }
  );
  return result !== null;
}

async function readPendingMarketMeta(orderRef, owner) {
  if (!orderRef || !owner) return null;
  const raw = await getRedisClient().get(_metaKey(orderRef, owner));
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw);
    const meta = normalizeMarketMeta({ fiatCurrency: parsed?.fiat_currency, exchangeRate: parsed?.exchange_rate });
    if (!meta || typeof parsed?.owner !== "string") return null;
    return { owner: parsed.owner.toLowerCase(), ...meta };
  } catch {
    return null;
  }
}

module.exports = {
  ALLOWED_FIAT,
  ORDER_MARKET_META_PREFIX,
  normalizeMarketMeta,
  storePendingMarketMeta,
  readPendingMarketMeta,
};
