import fs from 'fs';
import path from 'path';
import { describe, it, expect } from 'vitest';

const cfg = JSON.parse(fs.readFileSync(path.resolve(process.cwd(), 'vercel.json'), 'utf8'));
const csp = cfg.headers.flatMap((h) => h.headers).find((i) => i.key === 'Content-Security-Policy').value;
const directives = Object.fromEntries(csp.split(';').map((d) => d.trim()).filter(Boolean).map((d) => {
  const [name, ...vals] = d.split(/\s+/);
  return [name, vals];
}));

describe('vercel.json CSP for WalletConnect', () => {
  it('allows exactly the measured relay host and the existing walletlink host over wss', () => {
    const wss = directives['connect-src'].filter((v) => v.startsWith('wss'));
    expect(wss.sort()).toEqual(['wss://relay.walletconnect.org', 'wss://www.walletlink.org']);
  });

  it('has no wildcard, unsafe-eval or bare wss: scheme anywhere', () => {
    expect(csp).not.toMatch(/\*/);
    expect(csp).not.toMatch(/unsafe-eval/);
    expect(csp).not.toMatch(/(^|\s)wss?:(\s|;|$)/);
  });

  it('does not open frame-src (verify iframe is wallet-side only; measured not needed) and keeps hardening', () => {
    expect(directives['frame-src']).toBeUndefined();
    expect(directives['default-src']).toEqual(["'self'"]);
    expect(directives['frame-ancestors']).toEqual(["'none'"]);
    expect(directives['object-src']).toEqual(["'none'"]);
  });
});
