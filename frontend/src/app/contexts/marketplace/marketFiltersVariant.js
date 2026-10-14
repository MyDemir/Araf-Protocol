// [TR] GEÇİCİ: pazar filtre alanı için iki tasarım önerisini yan yana denemek üzere seçici.
//      `?filtersVariant=A|B` ile açılır, oturum boyunca hatırlanır; `?filtersVariant=off` mevcut görünüme döner.
//      Varsayılan (parametre yok) mevcut görünümdür. Seçim yapılınca bu dosya ve kaybeden varyant silinecek.
// [EN] TEMPORARY: switch to preview the two market filter design proposals. `?filtersVariant=A|B` enables one
//      for the session; `?filtersVariant=off` restores the current UI (also the default).
const KEY = 'araf_filters_variant';
const VALID = new Set(['A', 'B']);

export const readMarketFiltersVariant = (win = typeof window !== 'undefined' ? window : null) => {
  if (!win) return null;
  try {
    const q = new URLSearchParams(win.location?.search || '').get('filtersVariant');
    if (q != null) {
      const v = String(q).toUpperCase();
      if (VALID.has(v)) { win.sessionStorage?.setItem(KEY, v); return v; }
      win.sessionStorage?.removeItem(KEY);
      return null;
    }
    const stored = win.sessionStorage?.getItem(KEY);
    return VALID.has(stored) ? stored : null;
  } catch {
    return null;
  }
};

// [TR] Sonuç satırı metni; iki varyant da mevcut sayaç kuralını aynen kullanır.
// [EN] Result line text; both variants keep the current counter rule.
export const marketResultText = ({ tr, loading, error, shown, total, loaded }) => {
  if (loading || error) return ' ';
  if (total > loaded) return tr ? `${shown} emir · toplam ${total}` : `${shown} ${shown === 1 ? 'order' : 'orders'} · ${total} total`;
  return tr ? `${shown} emir` : `${shown} ${shown === 1 ? 'order' : 'orders'}`;
};

export const closedRailText = (tr, n) => (tr
  ? `${n} emirde ödeme yöntemi şu an kapalı`
  : `${n} ${n === 1 ? 'order has' : 'orders have'} a closed payment method`);
