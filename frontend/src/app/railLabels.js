import { getCatalogRail, getRailCatalogState } from './railCatalog';

// [TR] Ödeme yöntemi kodu → okunur ad (profil formu ve emre girme onayı aynı etiketleri kullanır).
//      Katalog adı öncelikli; katalog yoksa ya da kod katalogda yoksa eski 3 rail'lik statik yedek.
// [EN] Payment rail code → readable name. Catalog name first, static 3-rail fallback otherwise.
export const RAIL_LABELS = {
  TR_IBAN: { TR: 'Türkiye (IBAN)', EN: 'Turkey (IBAN)' },
  SEPA_IBAN: { TR: 'Avrupa (SEPA)', EN: 'Europe (SEPA)' },
  US_ACH: { TR: 'ABD (ACH)', EN: 'USA (ACH)' },
};

// [TR] Bilinmeyen kod için ad uydurulmaz: null döner ve satır gizlenir.
// [EN] An unknown code returns null (no invented name) and the row is hidden.
export const getRailLabel = (code, lang, catalog = getRailCatalogState().catalog) => {
  const key = lang === 'TR' ? 'TR' : 'EN';
  const fromCatalog = getCatalogRail(code, catalog)?.name?.[key];
  if (fromCatalog) return fromCatalog;
  const row = RAIL_LABELS[String(code || '').toUpperCase()];
  return row ? row[key] : null;
};
export const railLabel = getRailLabel;
