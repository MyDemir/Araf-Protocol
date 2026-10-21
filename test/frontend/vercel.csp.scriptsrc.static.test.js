import fs from 'fs';
import path from 'path';
import { describe, it, expect } from 'vitest';

const cfg = JSON.parse(fs.readFileSync(path.resolve(process.cwd(), 'vercel.json'), 'utf8'));
const csp = cfg.headers.flatMap((h) => h.headers).find((i) => i.key === 'Content-Security-Policy').value;
const scriptSrc = (csp.split(';').map((s) => s.trim()).find((s) => s.startsWith('script-src ')) || '').split(/\s+/).slice(1);

describe('vercel.json CSP script-src', () => {
  it("is exactly 'self'", () => {
    expect(scriptSrc).toEqual(["'self'"]);
  });
  it("has no 'unsafe-inline' or 'unsafe-eval'", () => {
    expect(scriptSrc).not.toContain("'unsafe-inline'");
    expect(scriptSrc).not.toContain("'unsafe-eval'");
  });
});
