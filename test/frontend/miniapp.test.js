import { describe, it, expect, vi } from 'vitest';
import { signalMiniAppReady, isInMiniApp, mayBeMiniApp } from '../../frontend/src/app/miniapp';
import { loadConnectorsSafely } from '../../frontend/src/app/connectorsLoader';

const IFRAME = { self: {}, top: {} };
const PLAIN = {}; PLAIN.self = PLAIN; PLAIN.top = PLAIN;
const logger = () => ({ warn: vi.fn(), error: vi.fn() });
const sdkMock = (inside) => {
  const ready = vi.fn().mockResolvedValue(undefined);
  return { ready, importer: async () => ({ sdk: { isInMiniApp: async () => inside, actions: { ready } } }) };
};

describe('miniapp helper', () => {
  it('calls ready() inside a mini app', async () => {
    const { ready, importer } = sdkMock(true);
    expect(await signalMiniAppReady(importer, logger(), IFRAME)).toBe(true);
    expect(ready).toHaveBeenCalledTimes(1);
  });

  it('does nothing outside a mini app', async () => {
    const { ready, importer } = sdkMock(false);
    expect(await signalMiniAppReady(importer, logger(), IFRAME)).toBe(false);
    expect(ready).not.toHaveBeenCalled();
  });

  it('survives SDK import failure', async () => {
    const log = logger();
    expect(await signalMiniAppReady(async () => { throw new Error('chunk'); }, log, IFRAME)).toBe(false);
    expect(await isInMiniApp(async () => { throw new Error('chunk'); }, log, IFRAME)).toBe(false);
    expect(log.warn).toHaveBeenCalledTimes(2);
  });

  it('survives ready() rejection', async () => {
    const log = logger();
    const importer = async () => ({ sdk: { isInMiniApp: async () => true, actions: { ready: async () => { throw new Error('x'); } } } });
    expect(await signalMiniAppReady(importer, log, IFRAME)).toBe(false);
    expect(log.warn).toHaveBeenCalled();
  });
});

describe('mini app pre-check', () => {
  it('regular browser: SDK is never imported', async () => {
    const importer = vi.fn();
    expect(mayBeMiniApp(PLAIN)).toBe(false);
    expect(await isInMiniApp(importer, logger(), PLAIN)).toBe(false);
    expect(await signalMiniAppReady(importer, logger(), PLAIN)).toBe(false);
    expect(importer).not.toHaveBeenCalled();
  });
  it('iframe, cross-origin top access error and RN webview pass the pre-check', () => {
    expect(mayBeMiniApp(IFRAME)).toBe(true);
    expect(mayBeMiniApp({ self: {}, get top() { throw new Error('x'); } })).toBe(true);
    expect(mayBeMiniApp({ ReactNativeWebView: {}, self: PLAIN, top: PLAIN })).toBe(true);
  });
});

describe('miniapp connector in loadConnectorsSafely', () => {
  const mod = async () => ({ injected: () => 'inj', coinbaseWallet: () => 'cb' });
  it('is not added without importer (regular browser)', async () => {
    expect(await loadConnectorsSafely(mod, logger())).toEqual(['inj', 'cb']);
  });
  it('is added first inside a mini app', async () => {
    expect(await loadConnectorsSafely(mod, logger(), async () => ({ farcasterMiniApp: () => 'fc' }))).toEqual(['fc', 'inj', 'cb']);
  });
  it('failure of the mini app connector keeps the normal list', async () => {
    const log = logger();
    expect(await loadConnectorsSafely(mod, log, async () => { throw new Error('x'); })).toEqual(['inj', 'cb']);
    expect(log.error).toHaveBeenCalledTimes(1);
  });
});
