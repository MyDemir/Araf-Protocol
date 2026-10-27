// [TR] Ödeme rail kataloğunun istemci tarafı tek kaynağı. Sunucu (/orders/config) `paymentRailCatalog`,
//      `supportedFiat` ve `enabledPaymentRails` verirse burada tutulur; yoksa eski 3 rail'lik statik yedek
//      (railLabels.js) ve ['TRY','USD','EUR'] kullanılır. Karar mercii kontrattır; katalog yalnız UI düzeyindedir
//      ve asıl doğrulama backend'dedir.
// [EN] Client-side single source for the payment rail catalog. Held here when the server sends it, otherwise the
//      3-rail static fallback (railLabels.js) and ['TRY','USD','EUR'] apply. Backend validation stays authoritative.
import { useSyncExternalStore } from 'react';

export const FALLBACK_SUPPORTED_FIAT = Object.freeze(['TRY', 'USD', 'EUR']);
// [TR] Eski kanonik rail'ler: gönderim şekli (anahtarlar) değişmez, form sabit çizilir (fingerprint kuralı).
export const LEGACY_RAIL_CODES = Object.freeze(['TR_IBAN', 'SEPA_IBAN', 'US_ACH']);
export const isLegacyRail = (code) => LEGACY_RAIL_CODES.includes(String(code || '').toUpperCase());

// [TR] Referans kur servisi (referenceTicker) değişmedi: yalnız bu fiat'larda kur şeridi/kıyas vardır.
// [EN] [kanıt: backend/scripts/services/referenceTicker.js:38-42] pairs vs TRY: USD, EUR, GBP.
export const REFERENCE_RATE_FIATS = Object.freeze(['TRY', 'USD', 'EUR', 'GBP']);
export const hasReferenceRate = (fiat) => REFERENCE_RATE_FIATS.includes(String(fiat || '').toUpperCase());

export const REGION_ORDER = ['EUROPE', 'MIDDLE_EAST_AFRICA', 'AMERICAS', 'ASIA_PACIFIC', 'INTERNATIONAL', 'OTHER'];
const REGION_LABELS = {
  EUROPE: { TR: 'Avrupa', EN: 'Europe' },
  MIDDLE_EAST_AFRICA: { TR: 'Orta Doğu ve Afrika', EN: 'Middle East & Africa' },
  AMERICAS: { TR: 'Amerika', EN: 'Americas' },
  ASIA_PACIFIC: { TR: 'Asya-Pasifik', EN: 'Asia-Pacific' },
  INTERNATIONAL: { TR: 'Uluslararası', EN: 'International' },
  OTHER: { TR: 'Diğer', EN: 'Other' },
};
export const regionLabel = (region, lang) => (REGION_LABELS[region] || REGION_LABELS.OTHER)[lang === 'TR' ? 'TR' : 'EN'];
export const normalizeRegion = (region) => (REGION_ORDER.includes(region) && region !== 'OTHER' ? region : 'OTHER');

// [TR] Geçersiz yük yedeğe düşer (null): kod metni olan en az bir satır yoksa katalog yok sayılır.
export const normalizeCatalog = (raw) => {
  if (!Array.isArray(raw)) return null;
  const rows = raw.filter((r) => r && typeof r.code === 'string' && r.code);
  return rows.length ? rows : null;
};
const normalizeFiat = (raw) => {
  if (!Array.isArray(raw)) return null;
  const list = [...new Set(raw.filter((c) => typeof c === 'string' && /^[A-Za-z]{3}$/.test(c)).map((c) => c.toUpperCase()))];
  return list.length ? list : null;
};

let state = { catalog: null, supportedFiat: null, enabledRails: null };
const listeners = new Set();
const emit = () => listeners.forEach((l) => l());

export const getRailCatalogState = () => state;
export const setRailCatalogState = ({ paymentRailCatalog, supportedFiat, enabledPaymentRails } = {}) => {
  const next = {
    catalog: normalizeCatalog(paymentRailCatalog),
    supportedFiat: normalizeFiat(supportedFiat),
    enabledRails: Array.isArray(enabledPaymentRails) ? enabledPaymentRails.map((c) => String(c).toUpperCase()) : null,
  };
  if (JSON.stringify(next) === JSON.stringify(state)) return;
  state = next;
  emit();
};
export const resetRailCatalogState = () => setRailCatalogState({});
const subscribe = (l) => { listeners.add(l); return () => listeners.delete(l); };
export const useRailCatalogState = () => useSyncExternalStore(subscribe, getRailCatalogState, getRailCatalogState);

export const getCatalogRail = (code, catalog = state.catalog) => {
  const c = String(code || '').toUpperCase();
  return (catalog || []).find((r) => String(r.code).toUpperCase() === c) || null;
};
export const getSupportedFiat = (list = state.supportedFiat) => (list && list.length ? list : [...FALLBACK_SUPPORTED_FIAT]);

// [TR] Rail ülkeleri: katalogdaki `countries`; SWIFT_INTL için ["*"] (ISO-2 listesi yok). Katalog yoksa null.
export const getRailCountries = (code, catalog = state.catalog) => {
  const row = getCatalogRail(code, catalog);
  return Array.isArray(row?.countries) ? row.countries : null;
};
// [TR] Bölgeye göre gruplama; bölgesi olmayan satır "Diğer". Sıra REGION_ORDER, grup içi sıra korunur.
export const groupRailsByRegion = (rows) => {
  const map = new Map();
  (rows || []).forEach((r) => {
    const key = normalizeRegion(r?.region);
    if (!map.has(key)) map.set(key, []);
    map.get(key).push(r);
  });
  return REGION_ORDER.filter((k) => map.has(k)).map((k) => ({ region: k, rows: map.get(k) }));
};

// ── Alan şeması yardımcıları (istemci ön kontrolü; asıl doğrulama backend) ──
export const normalizeFieldValue = (field, value) => {
  if (value == null) return '';
  const s = String(value);
  switch (field?.normalize) {
    case 'strip_spaces_upper': return s.replace(/\s+/g, '').toUpperCase();
    case 'strip_spaces': return s.replace(/\s+/g, '');
    case 'trim_lower': return s.trim().toLowerCase();
    default: return s.trim();
  }
};
const safeRegExp = (src) => { try { return new RegExp(src); } catch { return null; } };

// [TR] Alias alanının türü: seçenekleri aynı olan kardeş enum alanının değeri (ör. pix_key_type). Yoksa null.
//      [doğrulanamadı: sözleşme alias türünün nerede tutulduğunu yazmıyor; bu sezgi yalnız istemci ön kontrolüdür.]
export const resolveAliasType = (field, rail, values) => {
  const opts = [...(field.options || [])].sort().join('|');
  const sibling = (rail?.fields || []).find((f) => f !== field && f.kind === 'enum' && [...(f.options || [])].sort().join('|') === opts);
  return sibling ? (values?.[sibling.key] || null) : null;
};

// [TR] Dönen değer: null (geçerli ya da boş-opsiyonel) ya da 'required' | 'pattern' | 'option' | 'length'.
export const validateCatalogField = (field, rawValue, { rail = null, values = {} } = {}) => {
  const value = normalizeFieldValue(field, rawValue);
  if (!value) return field.required ? 'required' : null;
  if (field.kind === 'enum') return (field.options || []).includes(value) ? null : 'option';
  if (field.kind === 'alias') {
    const type = resolveAliasType(field, rail, values);
    const pats = field.aliasPatterns || {};
    if (type && pats[type]) { const re = safeRegExp(pats[type]); return re && !re.test(value) ? 'pattern' : null; }
    const all = Object.values(pats).map(safeRegExp).filter(Boolean);
    if (all.length && !all.some((re) => re.test(value))) return 'pattern';
    return null;
  }
  if (field.pattern) { const re = safeRegExp(field.pattern); if (re && !re.test(value)) return 'pattern'; }
  if (field.kind === 'iban' && field.ibanCountryLengths) {
    const want = field.ibanCountryLengths[value.slice(0, 2)];
    if (want && value.length !== want) return 'length';
  }
  return null;
};
export const validateCatalogRail = (rail, values) => {
  const errors = {};
  (rail?.fields || []).forEach((f) => {
    const e = validateCatalogField(f, values?.[f.key], { rail, values });
    if (e) errors[f.key] = e;
  });
  return errors;
};
