"use strict";

// [TR] ADMIN_WALLETS tek kaynağı: requireAdminWallet ve /api/auth/me aynı mantığı kullanır.
// [EN] Single source for ADMIN_WALLETS: requireAdminWallet and /api/auth/me share this logic.
function getAdminWallets() {
  return String(process.env.ADMIN_WALLETS || "")
    .split(",")
    .map((w) => w.trim().toLowerCase())
    .filter(Boolean);
}

function isAdminWallet(wallet) {
  if (!wallet) return false;
  const allowed = getAdminWallets();
  return allowed.length > 0 && allowed.includes(String(wallet).toLowerCase());
}

module.exports = { getAdminWallets, isAdminWallet };
