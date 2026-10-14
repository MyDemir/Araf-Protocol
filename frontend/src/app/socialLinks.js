// [TR] Sosyal link doğrulaması — backend/scripts/utils/socialLinks.js ile AYNI kurallar (savunma derinliği; sunucu tek
//      kaynaktır). İki dosya birlikte güncellenmelidir. Allowlist kodda sabittir; panelden değişmez.
// [EN] Mirror of the server-side social link rules (defense in depth). Keep both files in sync.

export const SOCIAL_ALLOWED_HOSTS = Object.freeze([
  'x.com', 'twitter.com', 'github.com', 'warpcast.com', 'farcaster.xyz', 't.me', 'telegram.me', 'discord.gg',
  'discord.com', 'youtube.com', 'medium.com', 'mirror.xyz', 'paragraph.xyz', 'linkedin.com', 'instagram.com',
  'reddit.com', 'base.org', 'basescan.org',
]);

export const SOCIAL_MAX_LINKS = 8;
export const SOCIAL_MAX_URL = 300;
export const SOCIAL_MAX_LABEL = 24;

// eslint-disable-next-line no-control-regex
const CONTROL_RE = /[\u0000-\u001f\u007f-\u009f\u{2028}\u{2029}\u{200b}-\u{200f}\u{202a}-\u{202e}\u{2066}-\u{2069}\u{feff}]/u;

const isHostAllowed = (host, allowed) => allowed.some((h) => host === h || host.endsWith(`.${h}`));

// Hata kodları UI'da dile çevrilir: https | ascii | invalid | userinfo | port | host | length | type
export const validateSocialUrl = (input, allowed = SOCIAL_ALLOWED_HOSTS) => {
  if (typeof input !== 'string') return { ok: false, code: 'type' };
  if (input.length === 0 || input.length > SOCIAL_MAX_URL) return { ok: false, code: 'length' };
  if (/[^!-~]/.test(input)) return { ok: false, code: 'ascii' };
  let u;
  try { u = new URL(input); } catch { return { ok: false, code: 'invalid' }; }
  if (u.protocol !== 'https:') return { ok: false, code: 'https' };
  if (u.username || u.password) return { ok: false, code: 'userinfo' };
  if (u.port) return { ok: false, code: 'port' };
  const host = u.hostname.toLowerCase();
  if (!host || host.endsWith('.') || /[^a-z0-9.-]/.test(host) || host.includes('xn--')) return { ok: false, code: 'host' };
  if (!isHostAllowed(host, allowed)) return { ok: false, code: 'host' };
  if (u.href.length > SOCIAL_MAX_URL) return { ok: false, code: 'length' };
  return { ok: true, url: u.href, hostname: host };
};

export const validateSocialLabel = (input) => {
  if (typeof input !== 'string') return { ok: false, code: 'label' };
  const label = input.trim();
  if (label.length < 1 || label.length > SOCIAL_MAX_LABEL || CONTROL_RE.test(label) || /[<>]/.test(label)) return { ok: false, code: 'label' };
  return { ok: true, label };
};

const MESSAGES = {
  https: ['Yalnız https:// kabul edilir.', 'Only https:// is accepted.'],
  ascii: ['URL yalnız ASCII, boşluksuz karakter içerebilir.', 'URL may only contain ASCII characters without spaces.'],
  invalid: ['Geçersiz URL.', 'Invalid URL.'],
  userinfo: ['Kullanıcı bilgisi içeren URL kabul edilmez.', 'URLs with credentials are not accepted.'],
  port: ['Port belirtilemez.', 'Ports are not allowed.'],
  host: ['Bu alan adı izinli değil.', 'This domain is not allowed.'],
  length: [`URL 1–${SOCIAL_MAX_URL} karakter olmalı.`, `URL must be 1–${SOCIAL_MAX_URL} characters.`],
  type: ['Geçersiz değer.', 'Invalid value.'],
  label: [`Etiket 1–${SOCIAL_MAX_LABEL} karakter, düz metin olmalı.`, `Label must be 1–${SOCIAL_MAX_LABEL} plain-text characters.`],
  dup: ['Aynı URL iki kez eklenemez.', 'The same URL cannot be added twice.'],
  max: [`En fazla ${SOCIAL_MAX_LINKS} link.`, `At most ${SOCIAL_MAX_LINKS} links.`],
};
export const socialErrorMessage = (code, lang = 'EN') => (MESSAGES[code] || MESSAGES.type)[lang === 'TR' ? 0 : 1];

/** Tüm listeyi doğrular. @returns {{ok:boolean, errors:Array<{index:number|null, field:string, code:string}>}} */
export const validateSocialDraft = (rows) => {
  const errors = [];
  if (rows.length > SOCIAL_MAX_LINKS) errors.push({ index: null, field: 'list', code: 'max' });
  const seen = new Set();
  rows.forEach((r, index) => {
    const lab = validateSocialLabel(r.label);
    if (!lab.ok) errors.push({ index, field: 'label', code: lab.code });
    const url = validateSocialUrl(r.url);
    if (!url.ok) errors.push({ index, field: 'url', code: url.code });
    else if (seen.has(url.url)) errors.push({ index, field: 'url', code: 'dup' });
    else seen.add(url.url);
  });
  return { ok: errors.length === 0, errors };
};

/** Render öncesi süzgeç: geçmeyen link düşer. Çıktı yalnız {label,url,host}. */
export const sanitizeSocialLinks = (list) => {
  if (!Array.isArray(list)) return [];
  const out = [];
  const seen = new Set();
  for (const l of list.slice(0, SOCIAL_MAX_LINKS)) {
    if (!l || typeof l !== 'object') continue;
    const lab = validateSocialLabel(l.label);
    const url = validateSocialUrl(l.url);
    if (!lab.ok || !url.ok || seen.has(url.url)) continue;
    seen.add(url.url);
    out.push({ label: lab.label, url: url.url, host: url.hostname });
  }
  return out;
};
