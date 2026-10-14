// [TR] YENİ pozisyon açan işlemlerin (emir oluştur, emre gir) tek kapısı. Fail-closed: kontrat duraklatılmışsa,
//      ilk zincir okuması henüz gelmediyse ("kontrol ediliyor") ya da backend/RPC erişilemiyorsa kapalıdır.
//      Mevcut işlemden ÇIKIŞ eylemleri (ödeme bildir, release, itiraz, ping, auto-release...) bu kapıya BAĞLI DEĞİLDİR:
//      kontrat zaman kurallarını zincirde kendisi uygular; kullanıcıyı engellemek süre kaçırtıp fon kaybettirebilir.
// [EN] Single gate for txs that open a NEW position. Exit actions on an existing trade are deliberately not gated.
export const TX_GATE_REASONS = Object.freeze({
  OPEN: null,
  PAUSED: 'paused',
  CHECKING: 'checking',
  INFRA: 'infra',
  CONFIG_STALE: 'config_stale',
});

export const resolveNewTxGate = ({ isPaused = false, rpcChecked = true, backendUnreachable = false, rpcUnreachable = false, configStale = false, lang = 'EN' } = {}) => {
  const tr = lang === 'TR';
  if (isPaused) {
    return { blocked: true, reason: TX_GATE_REASONS.PAUSED, message: tr ? 'Sistem şu an bakım modundadır. Yeni işlem açılamaz.' : 'System is paused. New trades cannot be opened.' };
  }
  if (backendUnreachable || rpcUnreachable) {
    return { blocked: true, reason: TX_GATE_REASONS.INFRA, message: tr ? 'Zincir/sunucu durumu doğrulanamıyor; yeni işlem şu an başlatılamaz.' : 'Chain/server status cannot be verified; new trades cannot be started right now.' };
  }
  // [TR] Bayat ücret/bond değeriyle yanlış allowance verilmesin: yeni emir/emre giriş kapalı. Çıkış eylemleri etkilenmez.
  if (configStale) {
    return { blocked: true, reason: TX_GATE_REASONS.CONFIG_STALE, message: tr ? 'Protokol ayarları güncel olmayabilir; yeni işlem şu an başlatılamaz.' : 'Protocol settings may be out of date; new trades cannot be started right now.' };
  }
  if (!rpcChecked) {
    return { blocked: true, reason: TX_GATE_REASONS.CHECKING, message: tr ? 'Zincir durumu kontrol ediliyor, lütfen birkaç saniye bekleyin.' : 'Checking chain status, please wait a few seconds.' };
  }
  return { blocked: false, reason: TX_GATE_REASONS.OPEN, message: '' };
};

// [TR] Çağrı anında kapıyı değerlendirir (getter ya da nesne kabul eder); engelliyse kullanıcıya mesaj gösterir.
export const enforceTxGate = (gate, showToast) => {
  const g = typeof gate === 'function' ? gate() : gate;
  if (g?.blocked) {
    if (typeof showToast === 'function') showToast(g.message, 'error');
    return false;
  }
  return true;
};
