import { afterEach, describe, expect, it, vi } from 'vitest';
import { isStandaloneDisplay } from '../../frontend/src/app/shell/useFullscreen';

const mockMedia = (matches) => vi.spyOn(window, 'matchMedia').mockImplementation((q) => ({ matches: Boolean(matches[q]), media: q, addListener() {}, removeListener() {} }));

afterEach(() => {
  vi.restoreAllMocks();
  Object.defineProperty(document, 'fullscreenElement', { value: null, configurable: true });
});

describe('isStandaloneDisplay', () => {
  it('does not treat Fullscreen API mode as an installed app (the toggle used to vanish)', () => {
    if (!window.matchMedia) window.matchMedia = () => ({ matches: false });
    mockMedia({ '(display-mode: fullscreen)': true });
    Object.defineProperty(document, 'fullscreenElement', { value: document.documentElement, configurable: true });
    expect(isStandaloneDisplay()).toBe(false);
  });

  it('still detects a real standalone install', () => {
    if (!window.matchMedia) window.matchMedia = () => ({ matches: false });
    mockMedia({ '(display-mode: standalone)': true });
    expect(isStandaloneDisplay()).toBe(true);
  });
});
