import fs from 'fs';
import path from 'path';
import { describe, expect, it } from 'vitest';

const cfg = JSON.parse(fs.readFileSync(path.resolve(process.cwd(), 'vercel.json'), 'utf8'));

// [TR] F4-15: VITE_PUBLIC_URL yokken manifest üretilmez; SPA catch-all /.well-known/farcaster.json'u yakalayıp
//      HTML'i JSON başlığıyla dönmemeli (statik dosya varsa Vercel zaten onu önce sunar).
describe('F4-15: farcaster.json yolu SPA rewrite dışında', () => {
  const catchAll = cfg.rewrites.find((r) => r.destination === '/index.html');
  const matches = (p) => new RegExp(`^${catchAll.source}$`).test(p);

  it('catch-all rewrite /.well-known/farcaster.json yolunu yakalamaz', () => {
    expect(matches('/.well-known/farcaster.json')).toBe(false);
  });

  it('diğer SPA yolları hâlâ index.html a gider', () => {
    for (const p of ['/', '/market', '/trade/123', '/.well-known/other.json']) expect(matches(p)).toBe(true);
  });

  it('CSP ve çerçeve başlıkları değişmedi', () => {
    const all = cfg.headers.find((h) => h.source === '/(.*)').headers;
    expect(all.find((i) => i.key === 'X-Frame-Options').value).toBe('DENY');
    expect(all.find((i) => i.key === 'Content-Security-Policy').value).toContain("frame-ancestors 'none'");
  });
});
