import fs from 'fs';
import os from 'os';
import path from 'path';
import { execFileSync } from 'child_process';
import { describe, expect, it } from 'vitest';

// [TR] Vercel /api rewrite'ı x-araf-origin-secret başlığını Vercel env'inden ekler (clientIp.js bunu bekler).
// [EN] The Vercel /api route sets x-araf-origin-secret from the Vercel env (clientIp.js depends on it).
const root = path.resolve(process.cwd(), '..');
const vercelPath = path.join(root, 'frontend', 'vercel.json');
const raw = fs.readFileSync(vercelPath, 'utf8');
const cfg = JSON.parse(raw);
const apiRoute = (cfg.routes || []).find((r) => r.src === '/api/(.*)');

describe('dalga8: origin secret header on /api route', () => {
  it('/api route goes to the Fly backend', () => {
    expect(apiRoute).toBeTruthy();
    expect(apiRoute.dest).toMatch(/^https:\/\/[a-z0-9-]+\.fly\.dev\/api\/\$1$/);
  });

  it('transform sets x-araf-origin-secret to $ORIGIN_SHARED_SECRET with env whitelist', () => {
    const t = apiRoute.transforms.filter((x) => x.type === 'request.headers' && x.target?.key === 'x-araf-origin-secret');
    expect(t).toHaveLength(1);
    expect(t[0].op).toBe('set');
    expect(t[0].args).toBe('$ORIGIN_SHARED_SECRET');
    expect(t[0].env).toContain('ORIGIN_SHARED_SECRET');
  });

  it('no secret value in repo config (only the $VAR reference)', () => {
    const stripped = raw.replace('"$ORIGIN_SHARED_SECRET"', '').replace('["ORIGIN_SHARED_SECRET"]', '');
    expect(stripped).not.toContain('ORIGIN_SHARED_SECRET');
    expect(JSON.stringify(cfg.routes)).not.toMatch(/[0-9a-f]{32,}/i);
  });

  it('all security headers remain', () => {
    const all = cfg.headers.find((h) => h.source === '/(.*)').headers.map((h) => h.key);
    for (const k of ['Content-Security-Policy', 'Strict-Transport-Security', 'X-Frame-Options', 'X-Content-Type-Options', 'Referrer-Policy', 'Permissions-Policy']) {
      expect(all).toContain(k);
    }
    const fc = cfg.headers.find((h) => h.source === '/.well-known/farcaster.json').headers;
    expect(fc.find((h) => h.key === 'Content-Type').value).toBe('application/json; charset=utf-8');
    expect(fc.find((h) => h.key === 'Cache-Control').value).toBe('public, max-age=300');
  });

  it('SPA fallback remains and excludes farcaster.json', () => {
    const spa = cfg.rewrites.find((r) => r.destination === '/index.html');
    expect(spa).toBeTruthy();
    const re = new RegExp(`^${spa.source}$`);
    expect(re.test('/.well-known/farcaster.json')).toBe(false);
    expect(re.test('/market')).toBe(true);
  });
});

describe('dalga8: deploy workflow step patches the routes entry', () => {
  for (const wf of ['deploy-base-sepolia.yml', 'deploy-runtime-base-sepolia.yml']) {
    it(`${wf}: rewrites dest to FLY_APP_NAME and keeps the transform`, () => {
      const yml = fs.readFileSync(path.join(root, '.github', 'workflows', wf), 'utf8');
      const m = yml.match(/- name: Point vercel\.json \/api rewrite at Fly app[\s\S]*?node -e '\n([\s\S]*?)\n\s*'\n/);
      expect(m).toBeTruthy();
      const script = m[1];
      const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'vercel-wf-'));
      fs.mkdirSync(path.join(dir, 'frontend'));
      fs.writeFileSync(path.join(dir, 'frontend', 'vercel.json'), raw);
      execFileSync('node', ['-e', script], { cwd: dir, env: { ...process.env, FLY_APP_NAME: 'my-test-app' } });
      const out = JSON.parse(fs.readFileSync(path.join(dir, 'frontend', 'vercel.json'), 'utf8'));
      const r = out.routes.find((x) => x.src === '/api/(.*)');
      expect(r.dest).toBe('https://my-test-app.fly.dev/api/$1');
      expect(r.transforms).toEqual(apiRoute.transforms);
      expect(out.headers).toEqual(cfg.headers);
      expect(out.rewrites).toEqual(cfg.rewrites);
    });

    it(`${wf}: fails closed when the route or transform is missing`, () => {
      const yml = fs.readFileSync(path.join(root, '.github', 'workflows', wf), 'utf8');
      const script = yml.match(/- name: Point vercel\.json \/api rewrite at Fly app[\s\S]*?node -e '\n([\s\S]*?)\n\s*'\n/)[1];
      for (const mutate of [
        (c) => { c.routes = []; },
        (c) => { c.routes[0].transforms = []; },
      ]) {
        const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'vercel-wf-'));
        fs.mkdirSync(path.join(dir, 'frontend'));
        const c = JSON.parse(raw);
        mutate(c);
        fs.writeFileSync(path.join(dir, 'frontend', 'vercel.json'), JSON.stringify(c));
        expect(() => execFileSync('node', ['-e', script], { cwd: dir, env: { ...process.env, FLY_APP_NAME: 'x' }, stdio: 'pipe' })).toThrow();
      }
    });
  }
});
