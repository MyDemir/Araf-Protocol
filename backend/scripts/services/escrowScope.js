"use strict";

/**
 * escrowScope — aktif escrow kapsamı (ARAF_ESCROW_ADDRESS + EXPECTED_CHAIN_ID).
 *
 * [TR] Kontrat yeniden dağıtıldığında Mongo'daki eski kontratın aynalarının (aynı onchain_order_id /
 *      onchain_escrow_id numaralı) yeni kontratın belgeleriyle karışmasını önler. Karar mercii kontrattır;
 *      bu modül yalnız "hangi kontratın aynasını okuyorum/yazıyorum" sınırını çizer.
 *      NODE_ENV=production'da env eksikse FAIL-CLOSED (ESCROW_SCOPE_UNAVAILABLE). Production dışında env
 *      boşsa filtre `{}` (eski davranış; geliştirme/test kolaylığı).
 * [EN] Scopes every mirror read/write to the active escrow. Fail-closed only when NODE_ENV=production.
 */

function _normalizeScope() {
  const address = String(process.env.ARAF_ESCROW_ADDRESS || "").trim().toLowerCase();
  const rawChain = String(process.env.EXPECTED_CHAIN_ID || "").trim();
  const chainId = rawChain === "" ? NaN : Number(rawChain);
  return {
    address: /^0x[0-9a-f]{40}$/.test(address) ? address : "",
    chainId: Number.isInteger(chainId) && chainId > 0 ? chainId : null,
  };
}

/**
 * @returns {{escrow_address: string, chain_id: number}|null} null yalnız production dışında env boşken.
 * @throws {Error} code=ESCROW_SCOPE_UNAVAILABLE (production + env eksik/geçersiz)
 */
function getActiveEscrowScope() {
  const { address, chainId } = _normalizeScope();
  if (address && chainId !== null) return { escrow_address: address, chain_id: chainId };
  if (process.env.NODE_ENV === "production") {
    const err = new Error("ESCROW_SCOPE_UNAVAILABLE: ARAF_ESCROW_ADDRESS ve EXPECTED_CHAIN_ID gerekli");
    err.code = "ESCROW_SCOPE_UNAVAILABLE";
    throw err;
  }
  return null;
}

/** Sorgu filtresi: aktif escrow eşitliği (dev/test'te env boşsa `{}`). */
function escrowScopeFilter() {
  const scope = getActiveEscrowScope();
  return scope ? { escrow_address: scope.escrow_address } : {};
}

/** Yazma yükü: upsert/insert belgelerine eklenecek alanlar (env boşsa `{}`). */
function escrowScopeFields() {
  return getActiveEscrowScope() || {};
}

/** findById sonrası kontrol: belge aktif escrow'a ait mi? */
function matchesActiveEscrow(doc) {
  if (!doc) return false;
  const scope = getActiveEscrowScope();
  if (!scope) return true;
  return String(doc.escrow_address || "").toLowerCase() === scope.escrow_address;
}

module.exports = { getActiveEscrowScope, escrowScopeFilter, escrowScopeFields, matchesActiveEscrow };
