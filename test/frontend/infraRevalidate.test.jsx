import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  __resetInfraForTest, getInfraHealth, installInfraRevalidation, markInfraFailure, markInfraOk,
} from '../../frontend/src/app/infraHealth';

let hidden = false;
let cleanup;
const show = () => { hidden = false; document.dispatchEvent(new Event('visibilitychange')); };
const focus = () => window.dispatchEvent(new Event('focus'));

// [TR] Hook'taki kontrolün aynası: degraded başlığı -> bayrak, temiz -> kapat.
const makeCheck = (degraded) => vi.fn(async () => {
  if (degraded) markInfraFailure('degraded'); else markInfraOk('degraded');
});

beforeEach(() => {
  vi.useFakeTimers();
  vi.spyOn(Math, 'random').mockReturnValue(0.5);
  hidden = false;
  Object.defineProperty(document, 'hidden', { configurable: true, get: () => hidden });
  Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => (hidden ? 'hidden' : 'visible') });
  __resetInfraForTest();
});
afterEach(() => { cleanup?.(); vi.useRealTimers(); vi.restoreAllMocks(); __resetInfraForTest(); });

describe('infra revalidation on visibility/focus', () => {
  it('does not fire on install (no extra boot request)', () => {
    const check = makeCheck(false);
    cleanup = installInfraRevalidation(check);
    expect(check).not.toHaveBeenCalled();
  });

  it('opens the degraded flag when a visible tab gets the degraded header', async () => {
    cleanup = installInfraRevalidation(makeCheck(true));
    show();
    await vi.advanceTimersByTimeAsync(0);
    expect(getInfraHealth().degraded).toBe(true);
  });

  it('clears an open flag on a clean response', async () => {
    markInfraFailure('degraded');
    cleanup = installInfraRevalidation(makeCheck(false));
    focus();
    await vi.advanceTimersByTimeAsync(0);
    expect(getInfraHealth().degraded).toBe(false);
  });

  it('throttles a second event within 15s, allows after', async () => {
    const check = makeCheck(false);
    cleanup = installInfraRevalidation(check);
    show();
    await vi.advanceTimersByTimeAsync(0);
    focus();
    await vi.advanceTimersByTimeAsync(14000);
    focus();
    await vi.advanceTimersByTimeAsync(0);
    expect(check).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(1500);
    focus();
    await vi.advanceTimersByTimeAsync(0);
    expect(check).toHaveBeenCalledTimes(2);
  });

  it('does not start a second request while one is in flight', async () => {
    let release;
    const check = vi.fn(() => new Promise((res) => { release = res; }));
    cleanup = installInfraRevalidation(check, { throttleMs: 0 });
    show();
    focus();
    await vi.advanceTimersByTimeAsync(0);
    expect(check).toHaveBeenCalledTimes(1);
    release();
    await vi.advanceTimersByTimeAsync(0);
    focus();
    await vi.advanceTimersByTimeAsync(0);
    expect(check).toHaveBeenCalledTimes(2);
  });

  it('does not fire while the tab is hidden', async () => {
    const check = makeCheck(false);
    cleanup = installInfraRevalidation(check);
    hidden = true;
    document.dispatchEvent(new Event('visibilitychange'));
    focus();
    await vi.advanceTimersByTimeAsync(0);
    expect(check).not.toHaveBeenCalled();
  });
});
