// [TR] Ödeme yöntemi kodu → okunur ad (profil formu ve emre girme onayı aynı etiketleri kullanır).
// [EN] Payment rail code → readable name (shared by the profile form and the order-entry confirmation).
export const RAIL_LABELS = {
  TR_IBAN: { TR: 'Türkiye (IBAN)', EN: 'Turkey (IBAN)' },
  SEPA_IBAN: { TR: 'Avrupa (SEPA)', EN: 'Europe (SEPA)' },
  US_ACH: { TR: 'ABD (ACH)', EN: 'USA (ACH)' },
};

// [TR] Bilinmeyen kod için ad uydurulmaz: null döner ve satır gizlenir.
// [EN] An unknown code returns null (no invented name) and the row is hidden.
export const railLabel = (code, lang) => {
  const row = RAIL_LABELS[String(code || '').toUpperCase()];
  return row ? row[lang === 'TR' ? 'TR' : 'EN'] : null;
};
