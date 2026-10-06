export { default as states, getStateLabel } from './states';
export { default as orderSide } from './orderSide';
export { getPaymentRiskLevelLabel, getPaymentRiskSummaryCopy } from './paymentRisk';
export { default as pii, getPiiCopy } from './pii';
export { default as tradeTerms, getTradeTerm } from './tradeTerms';

// [TR] Ortak dil/biçim yardımcıları — önceden 8 dosyada ayrı `t`/`tx`, 7 yerde ayrı yüzde biçimleyici vardı.
// [EN] Shared language/format helpers — previously redefined per file (8 lang pickers, 7 percent formatters).
export const tx = (lang, tr, en) => (lang === 'TR' ? tr : en);
export const langKey = (lang) => (lang === 'TR' ? 'TR' : 'EN');
export const localeOf = (lang) => (lang === 'TR' ? 'tr-TR' : 'en-US');
export const fmtNum = (value, lang, maxDigits = 2) => Number(value || 0).toLocaleString(localeOf(lang), { maximumFractionDigits: maxDigits });
// [TR] Türkçede yüzde işareti önde (%1,5), İngilizcede sonda (1.5%). [EN] Percent sign leads in Turkish, trails in English.
// [TR] Okunamayan değer (null/undefined/boş) "0" DEĞİL, bilinmiyor demektir.
// [EN] An unreadable value (null/undefined/empty) means UNKNOWN, never 0.
export const isKnownNumber = (value) => value !== null && value !== undefined && value !== '' && Number.isFinite(Number(value));
export const fmtBps = (bps, lang, maxDigits = 2) => {
  if (!isKnownNumber(bps)) return '—';
  const n = Number(bps);
  const s = (n / 100).toLocaleString(localeOf(lang), { maximumFractionDigits: maxDigits });
  return lang === 'TR' ? `%${s}` : `${s}%`;
};
// [TR] Hazır yüzde değeri (bps değil) için aynı kural. [EN] Same rule for a plain percent value (not bps).
export const fmtPct = (value, lang) => (lang === 'TR' ? `%${value}` : `${value}%`);
export const shortAddress = (value, fallback = '—') => {
  const s = String(value || '').trim();
  if (!s) return fallback;
  return s.length > 13 ? `${s.slice(0, 6)}...${s.slice(-4)}` : s;
};
