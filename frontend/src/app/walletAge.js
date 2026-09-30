// [TR] ArafEscrow.WALLET_AGE_MIN aynası: registerWallet sonrası taker olarak işlem açmadan önce beklenen süre.
// [EN] Mirror of ArafEscrow.WALLET_AGE_MIN: wait after registerWallet before entering trades as a taker.
export const WALLET_AGE_MIN_DAYS = 2;
export const WALLET_AGE_MIN_SEC = WALLET_AGE_MIN_DAYS * 24 * 3600;
