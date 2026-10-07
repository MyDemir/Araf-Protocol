// [TR] Env okumaları için tek yardımcı. Revenue vault adresi için tek ad: VITE_REVENUE_VAULT_ADDRESS.
//      Eski VITE_REWARDS_VAULT_ADDRESS yalnız yeni ad boşsa okunur ve bir kez console.warn basar.
// [EN] Single helper for env reads. The one name for the revenue vault is VITE_REVENUE_VAULT_ADDRESS.
//      The legacy VITE_REWARDS_VAULT_ADDRESS is read only when the new name is empty, with a one-time console.warn.

let warnedLegacyVault = false;

export const resolveRevenueVaultAddress = (env = import.meta.env) => {
  const current = env?.VITE_REVENUE_VAULT_ADDRESS;
  if (current) return current;
  const legacy = env?.VITE_REWARDS_VAULT_ADDRESS;
  if (legacy) {
    if (!warnedLegacyVault) {
      warnedLegacyVault = true;
      console.warn('[env] VITE_REWARDS_VAULT_ADDRESS is deprecated — use VITE_REVENUE_VAULT_ADDRESS.');
    }
    return legacy;
  }
  return current;
};

export const __resetEnvConfigWarningsForTest = () => { warnedLegacyVault = false; };
