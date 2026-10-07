import fs from 'fs';
import path from 'path';
import { describe, it, expect } from 'vitest';

const cfg = JSON.parse(fs.readFileSync(path.resolve(process.cwd(), 'vercel.json'), 'utf8'));

describe('frontend vercel.json schema guards', () => {
  it('every headers entry has string source and headers array', () => {
    expect(Array.isArray(cfg.headers)).toBe(true);
    for (const h of cfg.headers) {
      expect(typeof h.source).toBe('string');
      expect(Array.isArray(h.headers)).toBe(true);
    }
  });

  it('inner header items contain only string key and value', () => {
    for (const h of cfg.headers) {
      for (const item of h.headers) {
        expect(Object.keys(item).sort()).toEqual(['key', 'value']);
        expect(typeof item.key).toBe('string');
        expect(typeof item.value).toBe('string');
      }
    }
  });

  it('rewrites have source and destination', () => {
    expect(Array.isArray(cfg.rewrites)).toBe(true);
    for (const r of cfg.rewrites) {
      expect(typeof r.source).toBe('string');
      expect(typeof r.destination).toBe('string');
    }
  });

  it('farcaster.json block exists exactly once with correct Content-Type', () => {
    const blocks = cfg.headers.filter((h) => h.source === '/.well-known/farcaster.json');
    expect(blocks).toHaveLength(1);
    const ct = blocks[0].headers.find((i) => i.key === 'Content-Type');
    expect(ct.value).toBe('application/json; charset=utf-8');
  });
});
