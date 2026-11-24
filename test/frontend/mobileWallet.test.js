import fs from 'fs';
import path from 'path';
import { describe, it, expect } from 'vitest';
import {
  isMobileUserAgent, isMobileEnvironment, shouldShowMobileWalletPicker,
  buildCurrentSiteUrl, buildWalletDeepLinks, isAndroidUserAgent, describeConnectError,
} from '../../frontend/src/app/mobileWallet';

const IPHONE = 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 Version/17.0 Mobile/15E148 Safari/604.1';
const PIXEL = 'Mozilla/5.0 (Linux; Android 13; Pixel 7) AppleWebKit/537.36 Chrome/120.0 Mobile Safari/537.36';
const DESKTOP = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/120.0 Safari/537.36';
const loc = { origin: 'https://araf.example', pathname: '/market', search: '?redirect=https://evil.com', hash: '#x' };

describe('mobile detection', () => {
  it('detects iPhone and Android, not desktop', () => {
    expect(isMobileUserAgent(IPHONE)).toBe(true);
    expect(isMobileUserAgent(PIXEL)).toBe(true);
    expect(isMobileUserAgent(DESKTOP)).toBe(false);
  });
  it('detects iPadOS desktop-UA via touch points', () => {
    expect(isMobileEnvironment({ userAgent: DESKTOP, platform: 'MacIntel', maxTouchPoints: 5 })).toBe(true);
    expect(isMobileEnvironment({ userAgent: DESKTOP, platform: 'MacIntel', maxTouchPoints: 0 })).toBe(false);
  });
  it('picker only on mobile without window.ethereum', () => {
    expect(shouldShowMobileWalletPicker({ userAgent: IPHONE }, {})).toBe(true);
    expect(shouldShowMobileWalletPicker({ userAgent: IPHONE }, { ethereum: {} })).toBe(false);
    expect(shouldShowMobileWalletPicker({ userAgent: DESKTOP }, {})).toBe(false);
  });
});

describe('deeplinks', () => {
  const links = Object.fromEntries(buildWalletDeepLinks(loc).map((l) => [l.id, l.href]));
  const site = 'https://araf.example/market';
  it('builds the expected encoded URLs', () => {
    expect(links.metamask).toBe('https://metamask.app.link/dapp/araf.example/market');
    expect(links.trust).toBe(`https://link.trustwallet.com/open_url?coin_id=60&url=${encodeURIComponent(site)}`);
    expect(links.coinbase).toBe(`https://go.cb-w.com/dapp?cb_url=${encodeURIComponent(site)}`);
    const inner = `okx://wallet/dapp/url?dappUrl=${encodeURIComponent(site)}`;
    expect(links.okx).toBe(`https://www.okx.com/download?deeplink=${encodeURIComponent(inner)}`);
  });
  it('never leaks query, hash or foreign origin (no open redirect)', () => {
    for (const href of Object.values(links)) {
      expect(href).not.toContain('evil');
      expect(decodeURIComponent(href)).not.toContain('redirect=');
      expect(href).not.toContain('#x');
    }
    expect(buildCurrentSiteUrl(loc)).toBe(site);
  });
  it('rejects non-http origins and malformed locations', () => {
    expect(buildWalletDeepLinks({ origin: 'javascript:alert(1)', pathname: '/' })).toEqual([]);
    expect(buildWalletDeepLinks({ origin: 'https://a.com/evil', pathname: '/' })).toEqual([]);
    expect(buildWalletDeepLinks(null)).toEqual([]);
  });
});

describe('android intent deeplinks', () => {
  const site = 'https://araf.example/market';
  const android = Object.fromEntries(buildWalletDeepLinks(loc, { userAgent: PIXEL }).map((l) => [l.id, l.href]));
  const play = (pkg) => encodeURIComponent(`https://play.google.com/store/apps/details?id=${pkg}`);
  it('uses package-locked intent URIs with Play Store fallback', () => {
    expect(isAndroidUserAgent(PIXEL)).toBe(true);
    expect(android.metamask).toBe(`intent://metamask.app.link/dapp/araf.example/market#Intent;scheme=https;package=io.metamask;S.browser_fallback_url=${play('io.metamask')};end`);
    expect(android.trust).toBe(`intent://link.trustwallet.com/open_url?coin_id=60&url=${encodeURIComponent(site)}#Intent;scheme=https;package=com.wallet.crypto.trustapp;S.browser_fallback_url=${play('com.wallet.crypto.trustapp')};end`);
    expect(android.coinbase).toBe(`intent://go.cb-w.com/dapp?cb_url=${encodeURIComponent(site)}#Intent;scheme=https;package=org.toshi;S.browser_fallback_url=${play('org.toshi')};end`);
  });
  it('keeps OKX (unverified) as https on Android', () => {
    expect(android.okx).toMatch(/^https:\/\/www\.okx\.com\/download\?deeplink=/);
  });
  it('iOS, desktop and no-nav output is identical to the plain https links', () => {
    const base = buildWalletDeepLinks(loc);
    expect(buildWalletDeepLinks(loc, { userAgent: IPHONE })).toEqual(base);
    expect(buildWalletDeepLinks(loc, { userAgent: DESKTOP })).toEqual(base);
    for (const l of base) expect(l.href).toMatch(/^https:\/\//);
  });
  it('Android WebView ("; wv)") keeps plain https links', () => {
    const WV = 'Mozilla/5.0 (Linux; Android 10; K; wv) AppleWebKit/537.36 (KHTML, like Gecko) Version/4.0 Chrome/125.0.0.0 Mobile Safari/537.36';
    const WV_OLD = 'Mozilla/5.0 (Linux; Android 9; SM-G960F Build/PPR1; wv) AppleWebKit/537.36 Version/4.0 Chrome/90.0 Mobile Safari/537.36';
    const base = buildWalletDeepLinks(loc);
    expect(buildWalletDeepLinks(loc, { userAgent: WV })).toEqual(base);
    expect(buildWalletDeepLinks(loc, { userAgent: WV_OLD })).toEqual(base);
    expect(buildWalletDeepLinks(loc, { userAgent: PIXEL })[0].href).toMatch(/^intent:\/\//);
  });
  it('android hrefs keep the origin+pathname-only rule', () => {
    for (const href of Object.values(android)) {
      expect(href).not.toContain('evil');
      expect(href).not.toContain('%23x');
    }
  });
});

describe('describeConnectError', () => {
  it('gives distinct readable messages', () => {
    expect(describeConnectError({ name: 'ProviderNotFoundError' }, 'EN')).toMatch(/No wallet found/);
    expect(describeConnectError({ code: 4001 }, 'TR')).toMatch(/iptal/);
    expect(describeConnectError(new Error('boom'), 'EN')).toMatch(/Could not connect/);
  });
});

describe('vercel.json CSP', () => {
  const cfg = JSON.parse(fs.readFileSync(path.resolve(process.cwd(), 'vercel.json'), 'utf8'));
  const csp = cfg.headers.find((h) => h.source === '/(.*)').headers.find((i) => i.key === 'Content-Security-Policy').value;
  const dir = (n) => (csp.split(';').map((s) => s.trim()).find((s) => s.startsWith(`${n} `)) || '').split(/\s+/).slice(1);
  it('allows only the proven WalletLink and WalletConnect relay sockets', () => {
    expect(dir('connect-src')).toEqual(["'self'", 'https:', 'wss://www.walletlink.org', 'wss://relay.walletconnect.org']);
  });
  it('has no forbidden loosening', () => {
    expect(csp).not.toContain("'unsafe-eval'");
    expect(dir('script-src')).toEqual(["'self'"]);
    for (const d of csp.split(';').map((s) => s.trim())) expect(d.split(/\s+/).slice(1)).not.toContain('*');
    expect(dir('frame-src')).toEqual(['https://player.vimeo.com']);
    expect(dir('frame-ancestors')).toEqual(["'none'"]);
    expect(dir('connect-src')).not.toContain('wss:');
  });
});
