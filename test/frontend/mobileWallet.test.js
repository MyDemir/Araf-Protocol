import fs from 'fs';
import path from 'path';
import { describe, it, expect } from 'vitest';
import {
  isMobileUserAgent, isMobileEnvironment, shouldShowMobileWalletPicker,
  buildCurrentSiteUrl, buildWalletDeepLinks, describeConnectError,
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
    expect(dir('frame-src')).toEqual([]);
    expect(dir('frame-ancestors')).toEqual(["'none'"]);
    expect(dir('connect-src')).not.toContain('wss:');
  });
});
