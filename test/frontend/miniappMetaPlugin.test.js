import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, it, expect, vi } from 'vitest';
import miniappMeta, { buildMetaTags, buildFarcasterManifest, normalizePublicUrl, DEFAULT_BASE_APP_ID } from '../../frontend/build/miniappMeta.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const find = (tags, key) => tags.find((t) => t.attrs.name === key || t.attrs.property === key);
const run = (env) => {
  const warn = vi.fn();
  const plugin = miniappMeta({ env, warn });
  plugin.configResolved({ command: 'build' });
  const emitted = [];
  plugin.generateBundle.call({ emitFile: (f) => emitted.push(f) });
  const doc = new DOMParser().parseFromString(plugin.transformIndexHtml('<html><head></head><body></body></html>'), 'text/html');
  const tags = [...doc.querySelectorAll('meta')].map((m) => ({ attrs: Object.fromEntries([...m.attributes].map((a) => [a.name, a.value])) }));
  return { warn, tags, emitted };
};

describe('miniappMeta plugin', () => {
  it('normalizes the public url', () => {
    expect(normalizePublicUrl('https://a.vercel.app/')).toBe('https://a.vercel.app');
    expect(normalizePublicUrl('ftp://x')).toBe('');
    expect(normalizePublicUrl('http://example.com')).toBe('');
    expect(normalizePublicUrl('http://localhost:5173/')).toBe('http://localhost:5173');
    expect(normalizePublicUrl('http://127.0.0.1:4173')).toBe('http://127.0.0.1:4173');
    expect(normalizePublicUrl('')).toBe('');
  });

  it('without VITE_PUBLIC_URL: relative images, no fc tags, no farcaster.json, one warning', () => {
    const { warn, tags, emitted } = run({});
    expect(find(tags, 'og:image').attrs.content).toBe('/og-image.png');
    expect(find(tags, 'fc:miniapp')).toBeUndefined();
    expect(find(tags, 'fc:frame')).toBeUndefined();
    expect(find(tags, 'base:app_id').attrs.content).toBe(DEFAULT_BASE_APP_ID);
    expect(emitted).toHaveLength(0);
    expect(warn).toHaveBeenCalledTimes(1);
  });

  it('with VITE_PUBLIC_URL: absolute meta, fc:miniapp JSON, farcaster.json without accountAssociation + warning', () => {
    const { warn, tags, emitted } = run({ VITE_PUBLIC_URL: 'https://example.vercel.app/', VITE_BASE_APP_ID: 'abc' });
    expect(find(tags, 'og:image').attrs.content).toBe('https://example.vercel.app/og-image.png');
    expect(find(tags, 'base:app_id').attrs.content).toBe('abc');
    const fc = JSON.parse(find(tags, 'fc:miniapp').attrs.content);
    expect(fc.button.action.splashImageUrl).toBe('https://example.vercel.app/splash.png');
    expect(fc.button.action.type).toBe('launch_miniapp');
    expect(fc.button.action.splashBackgroundColor).toBe('#060608');
    expect(emitted).toHaveLength(1);
    expect(emitted[0].fileName).toBe('.well-known/farcaster.json');
    const json = JSON.parse(emitted[0].source);
    expect(json.accountAssociation).toBeUndefined();
    expect(json.miniapp.homeUrl).toBe('https://example.vercel.app');
    expect(json.miniapp.heroImageUrl).toBeUndefined();
    expect(json.frame.iconUrl).toBe('https://example.vercel.app/icon.png');
    expect(warn).toHaveBeenCalledTimes(1);
  });

  it('plain http url: warns, no absolute meta, no farcaster.json', () => {
    const { warn, tags, emitted } = run({ VITE_PUBLIC_URL: 'http://example.com' });
    expect(warn).toHaveBeenCalledTimes(1);
    expect(warn.mock.calls[0][0]).toMatch(/https/);
    expect(find(tags, 'fc:miniapp')).toBeUndefined();
    expect(find(tags, 'og:image').attrs.content).toBe('/og-image.png');
    expect(emitted).toHaveLength(0);
  });

  it('includes accountAssociation only when all three FARCASTER_* are set', () => {
    const base = { VITE_PUBLIC_URL: 'https://x.app', FARCASTER_ACCOUNT_ASSOCIATION_HEADER: 'h', FARCASTER_ACCOUNT_ASSOCIATION_PAYLOAD: 'p' };
    expect(JSON.parse(run(base).emitted[0].source).accountAssociation).toBeUndefined();
    const full = run({ ...base, FARCASTER_ACCOUNT_ASSOCIATION_SIGNATURE: 's' });
    expect(JSON.parse(full.emitted[0].source).accountAssociation).toEqual({ header: 'h', payload: 'p', signature: 's' });
    expect(full.warn).not.toHaveBeenCalled();
  });

  it('pure builders return null / no fc tags without url', () => {
    expect(buildFarcasterManifest({})).toBeNull();
    expect(find(buildMetaTags({ publicUrl: '', baseAppId: 'x' }), 'fc:miniapp')).toBeUndefined();
  });

  it('does not warn in dev (serve)', () => {
    const warn = vi.fn();
    miniappMeta({ env: {}, warn }).configResolved({ command: 'serve' });
    expect(warn).not.toHaveBeenCalled();
  });
});

describe('brand assets', () => {
  it('no stale icon.svg references and the file is gone', () => {
    for (const f of ['frontend/index.html', 'frontend/public/manifest.webmanifest', 'README.md']) {
      expect(fs.readFileSync(path.join(ROOT, f), 'utf8')).not.toContain('icon.svg');
    }
    expect(fs.existsSync(path.join(ROOT, 'frontend/public/icon.svg'))).toBe(false);
  });
});
