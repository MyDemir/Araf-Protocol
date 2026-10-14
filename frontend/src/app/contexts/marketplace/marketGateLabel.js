// [TR] Yeni işlem kapısı kapalıyken gösterilecek KISA neden etiketi (yalnız görünüm). Kapının kendisi txGate.js'tedir;
//      bu dosya hiçbir kilidi açmaz ya da kapatmaz, yalnız txGate.reason'ı okunur bir rozete çevirir.
// [EN] SHORT reason label for a closed new-tx gate (display only). The gate itself lives in txGate.js; this file never
//      opens or closes a lock, it only turns txGate.reason into a readable badge.
const LABELS = {
  paused: { TR: 'Bakımda', EN: 'Paused' },
  checking: { TR: 'Kontrol ediliyor…', EN: 'Checking…' },
  infra: { TR: 'Doğrulanamıyor', EN: 'Unverified' },
  degraded: { TR: 'Kısıtlı mod', EN: 'Restricted mode' },
  config_stale: { TR: 'Ayarlar güncel değil', EN: 'Settings outdated' },
};

export const marketGateLabel = ({ isPaused = false, txGate = null, lang = 'EN' } = {}) => {
  const key = lang === 'TR' ? 'TR' : 'EN';
  if (isPaused) return LABELS.paused[key];
  const row = LABELS[txGate?.reason];
  if (row) return row[key];
  return key === 'TR' ? 'Kapalı' : 'Closed';
};
