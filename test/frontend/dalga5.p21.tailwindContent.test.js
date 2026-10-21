// @vitest-environment node
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { afterEach, describe, expect, it, vi } from 'vitest';

// [TR] E1-09: ui-lab içeriği yalnız dev ya da VITE_ENABLE_UI_LAB=true build'de Tailwind content'ine girer.
const load = async (nodeEnv, lab) => {
  vi.resetModules();
  const prevEnv = process.env.NODE_ENV;
  const prevLab = process.env.VITE_ENABLE_UI_LAB;
  process.env.NODE_ENV = nodeEnv;
  if (lab === undefined) delete process.env.VITE_ENABLE_UI_LAB; else process.env.VITE_ENABLE_UI_LAB = lab;
  try {
    const url = pathToFileURL(path.resolve(process.cwd(), 'tailwind.config.js')).href + `?t=${Math.random()}`;
    return (await import(/* @vite-ignore */ url)).default.content;
  } finally {
    process.env.NODE_ENV = prevEnv;
    if (prevLab === undefined) delete process.env.VITE_ENABLE_UI_LAB; else process.env.VITE_ENABLE_UI_LAB = prevLab;
  }
};
const hasLab = (content) => content.some((c) => c.includes('ui-lab'));

describe('E1-09: tailwind content ui-lab koşullu', () => {
  afterEach(() => vi.resetModules());
  it('production build ui-lab içermez', async () => { expect(hasLab(await load('production', undefined))).toBe(false); });
  it('production + VITE_ENABLE_UI_LAB=true ui-lab içerir', async () => { expect(hasLab(await load('production', 'true'))).toBe(true); });
  it('development ui-lab içerir', async () => { expect(hasLab(await load('development', undefined))).toBe(true); });
});
