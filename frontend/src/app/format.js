// [TR] Dile duyarlı tarih ve sayı biçimleyiciler (tr-TR / en-US). Yalnız GÖSTERİM katmanıdır:
//      hassasiyet ve yuvarlama kararı çağıran koddadır; burada yalnız hangi ayırıcıların kullanılacağı seçilir.
// [EN] Language-aware date/number formatters (tr-TR / en-US). Display only: precision and rounding
//      decisions stay with the caller; this module only picks separators and field order.
import { localeOf } from './copy';

const EMPTY = '—';

// [TR] Intl nesneleri pahalıdır; (dil + seçenekler) başına bir kez üretilir.
// [EN] Intl objects are costly; one instance per (language + options).
const cache = new Map();
const cached = (kind, locale, options, build) => {
  const key = `${kind}|${locale}|${JSON.stringify(options)}`;
  let hit = cache.get(key);
  if (!hit) {
    hit = build();
    cache.set(key, hit);
  }
  return hit;
};

const isBlank = (value) => value === null || value === undefined || value === '';

// [TR] Sayı: number, bigint ve sayısal string kabul eder. Okunamayan değer 0 DEĞİL, "—" olur.
// [EN] Number: accepts number, bigint and numeric strings. An unreadable value renders "—", never 0.
export const fmtNumber = (value, lang, { minFractionDigits = 0, maxFractionDigits = 2, compact = false } = {}) => {
  if (isBlank(value)) return EMPTY;
  const isBig = typeof value === 'bigint';
  const num = isBig ? value : Number(value);
  if (!isBig && !Number.isFinite(num)) return EMPTY;
  const options = compact
    ? { notation: 'compact', maximumFractionDigits: maxFractionDigits }
    : { minimumFractionDigits: minFractionDigits, maximumFractionDigits: maxFractionDigits };
  const locale = localeOf(lang);
  return cached('n', locale, options, () => new Intl.NumberFormat(locale, options)).format(num);
};

// [TR] Tamsayı sayaçları (binlik ayırıcılı). [EN] Integer counters with grouping.
export const fmtInt = (value, lang) => fmtNumber(value, lang, { maxFractionDigits: 0 });

// [TR] Para birimi öneki olmadan kompakt (1,2 Mn / 1.2M). [EN] Compact without currency prefix.
export const fmtCompact = (value, lang, maxFractionDigits = 1) => fmtNumber(value, lang, { compact: true, maxFractionDigits });

// [TR] Tarih girdisi: Date, ms (number) ya da ISO string. Geçersiz → null.
// [EN] Date input: Date, ms (number) or ISO string. Invalid → null.
const toDate = (value) => {
  if (isBlank(value)) return null;
  const d = value instanceof Date ? value : new Date(value);
  return Number.isNaN(d.getTime()) ? null : d;
};

// [TR] Tarih + saat. Saniye yalnız istenirse (admin kayıtları). `timeZone` testler içindir.
// [EN] Date + time. Seconds only on request (admin logs). `timeZone` exists for tests.
export const fmtDateTime = (value, lang, { seconds = false, timeZone } = {}) => {
  const d = toDate(value);
  if (!d) return EMPTY;
  const options = {
    day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit',
    ...(seconds ? { second: '2-digit' } : {}),
    ...(timeZone ? { timeZone } : {}),
  };
  const locale = localeOf(lang);
  return cached('dt', locale, options, () => new Intl.DateTimeFormat(locale, options)).format(d);
};

// [TR] Yalnız tarih. [EN] Date only.
export const fmtDate = (value, lang, { timeZone } = {}) => {
  const d = toDate(value);
  if (!d) return EMPTY;
  const options = { day: 'numeric', month: 'short', year: 'numeric', ...(timeZone ? { timeZone } : {}) };
  const locale = localeOf(lang);
  return cached('d', locale, options, () => new Intl.DateTimeFormat(locale, options)).format(d);
};
