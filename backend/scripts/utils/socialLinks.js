"use strict";

/*
 * Sosyal link doğrulayıcı — TEK KAYNAK (sunucu). Frontend aynı kuralı savunma derinliği için tekrar uygular
 * (frontend/src/app/socialLinks.js); iki dosya birlikte güncellenmelidir.
 * Allowlist admin panelinden DEĞİŞTİRİLEMEZ: koddaki varsayılan, opsiyonel SOCIAL_LINK_ALLOWED_HOSTS env'i (deploy) ile değişir.
 */

const DEFAULT_ALLOWED_HOSTS = Object.freeze([
  "x.com", "twitter.com", "github.com", "warpcast.com", "farcaster.xyz", "t.me", "telegram.me", "discord.gg",
  "discord.com", "youtube.com", "medium.com", "mirror.xyz", "paragraph.xyz", "linkedin.com", "instagram.com",
  "reddit.com", "base.org", "basescan.org",
]);

const MAX_LINKS = 8;
const MAX_URL_LENGTH = 300;
const MAX_LABEL_LENGTH = 24;
const ID_RE = /^[a-z0-9][a-z0-9-]{0,39}$/;
// eslint-disable-next-line no-control-regex
const CONTROL_RE = /[\u0000-\u001f\u007f-\u009f\u{2028}\u{2029}\u{200b}-\u{200f}\u{202a}-\u{202e}\u{2066}-\u{2069}\u{feff}]/u;
const ALLOWED_LINK_KEYS = new Set(["id", "label", "url", "order", "enabled"]);

function getAllowedHosts(env = process.env) {
  const raw = env.SOCIAL_LINK_ALLOWED_HOSTS;
  if (typeof raw === "string" && raw.trim()) {
    // Env verilmişse liste onu temsil eder (geçerli giriş yoksa boş = hiçbir link kabul edilmez, fail-closed).
    return raw
      .split(",")
      .map((h) => h.trim().toLowerCase())
      .filter((h) => /^[a-z0-9]([a-z0-9.-]*[a-z0-9])?$/.test(h) && !h.includes("xn--"));
  }
  return [...DEFAULT_ALLOWED_HOSTS];
}

function isHostAllowed(hostname, allowed) {
  return allowed.some((h) => hostname === h || hostname.endsWith(`.${h}`));
}

/** @returns {{ok:true,url:string,hostname:string}|{ok:false,error:string}} */
function validateSocialUrl(input, allowed = getAllowedHosts()) {
  if (typeof input !== "string") return { ok: false, error: "URL metin olmalı." };
  if (input.length === 0 || input.length > MAX_URL_LENGTH) return { ok: false, error: `URL 1-${MAX_URL_LENGTH} karakter olmalı.` };
  // Boşluk, kontrol ve ASCII dışı karakterlerin hepsi reddedilir (IDN homograf dahil).
  if (/[^!-~]/.test(input)) return { ok: false, error: "URL yalnız ASCII, boşluksuz karakter içerebilir." };
  let u;
  try { u = new URL(input); } catch { return { ok: false, error: "Geçersiz URL." }; }
  if (u.protocol !== "https:") return { ok: false, error: "Yalnız https:// kabul edilir." };
  if (u.username || u.password) return { ok: false, error: "Kullanıcı bilgisi içeren URL kabul edilmez." };
  if (u.port) return { ok: false, error: "Port belirtilemez." };
  const host = u.hostname.toLowerCase();
  if (!host || host.endsWith(".") || /[^a-z0-9.-]/.test(host) || host.includes("xn--")) {
    return { ok: false, error: "Hostname geçersiz (IDN/punycode kabul edilmez)." };
  }
  if (!isHostAllowed(host, allowed)) return { ok: false, error: "Bu alan adı izinli değil." };
  const href = u.href;
  if (href.length > MAX_URL_LENGTH) return { ok: false, error: `URL ${MAX_URL_LENGTH} karakteri aşıyor.` };
  return { ok: true, url: href, hostname: host };
}

function validateSocialLabel(input) {
  if (typeof input !== "string") return { ok: false, error: "Etiket metin olmalı." };
  const label = input.trim();
  if (label.length < 1 || label.length > MAX_LABEL_LENGTH) return { ok: false, error: `Etiket 1-${MAX_LABEL_LENGTH} karakter olmalı.` };
  if (CONTROL_RE.test(label) || /[<>]/.test(label)) return { ok: false, error: "Etiket düz metin olmalı." };
  return { ok: true, label };
}

/**
 * Tam listeyi doğrular ve normalize eder (order = dizi sırası).
 * @returns {{ok:true,links:Array<{id:string,label:string,url:string,order:number,enabled:boolean}>}|{ok:false,error:string}}
 */
function validateSocialLinks(list, { allowed = getAllowedHosts(), makeId } = {}) {
  if (!Array.isArray(list)) return { ok: false, error: "links dizi olmalı." };
  if (list.length > MAX_LINKS) return { ok: false, error: `En fazla ${MAX_LINKS} link.` };
  const seenUrls = new Set();
  const seenIds = new Set();
  const out = [];
  for (let i = 0; i < list.length; i += 1) {
    const l = list[i];
    if (!l || typeof l !== "object" || Array.isArray(l)) return { ok: false, error: `Link ${i + 1}: nesne olmalı.` };
    const unknown = Object.keys(l).find((k) => !ALLOWED_LINK_KEYS.has(k));
    if (unknown) return { ok: false, error: `Link ${i + 1}: bilinmeyen alan (${unknown.slice(0, 30)}).` };
    if (typeof l.enabled !== "boolean") return { ok: false, error: `Link ${i + 1}: enabled boolean olmalı.` };
    if (l.order !== undefined && !Number.isInteger(l.order)) return { ok: false, error: `Link ${i + 1}: order tam sayı olmalı.` };
    const lab = validateSocialLabel(l.label);
    if (!lab.ok) return { ok: false, error: `Link ${i + 1}: ${lab.error}` };
    const url = validateSocialUrl(l.url, allowed);
    if (!url.ok) return { ok: false, error: `Link ${i + 1}: ${url.error}` };
    if (seenUrls.has(url.url)) return { ok: false, error: `Link ${i + 1}: aynı URL iki kez eklenemez.` };
    seenUrls.add(url.url);
    let id = l.id;
    if (id !== undefined) {
      if (typeof id !== "string" || !ID_RE.test(id)) return { ok: false, error: `Link ${i + 1}: geçersiz id.` };
    } else {
      id = typeof makeId === "function" ? makeId() : `l${i + 1}-${Math.random().toString(36).slice(2, 8)}`;
    }
    if (seenIds.has(id)) return { ok: false, error: `Link ${i + 1}: yinelenen id.` };
    seenIds.add(id);
    out.push({ id, label: lab.label, url: url.url, order: i, enabled: l.enabled });
  }
  return { ok: true, links: out };
}

module.exports = {
  DEFAULT_ALLOWED_HOSTS, MAX_LINKS, MAX_URL_LENGTH, MAX_LABEL_LENGTH,
  getAllowedHosts, isHostAllowed, validateSocialUrl, validateSocialLabel, validateSocialLinks,
};
