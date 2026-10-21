import { describe, it, expect, vi, beforeEach } from 'vitest';
import { base } from 'wagmi/chains';
import { http } from 'viem';
import { walletConnect } from 'wagmi/connectors';
import {
  isValidWalletConnectProjectId,
  buildWalletConnectMetadata,
  resolveWalletConnectOptions,
  makeLazyConnector,
} from '../../frontend/src/app/walletConnectConfig';
import { loadConnectorsSafely } from '../../frontend/src/app/connectorsLoader';

const ID = 'ab12cd34ef56ab12cd34ef56ab12cd34';
const fakeProvider = vi.hoisted(() => ({
  disconnect: vi.fn(async () => {}),
  on: vi.fn(),
  removeListener: vi.fn(),
  events: { setMaxListeners: vi.fn() },
}));

const logger = () => ({ error: vi.fn() });
const mod = (wc = vi.fn(() => () => ({ id: 'walletConnect' }))) => ({ injected: vi.fn(() => 'inj'), coinbaseWallet: vi.fn(() => 'cb'), walletConnect: wc });

beforeEach(() => {
  fakeProvider.disconnect.mockClear();
});

describe('WalletConnect project id validation', () => {
  it('accepts only 32 hex chars', () => {
    expect(isValidWalletConnectProjectId(ID)).toBe(true);
    expect(isValidWalletConnectProjectId(` ${ID.toUpperCase()} `)).toBe(true);
    for (const bad of [undefined, null, '', '   ', 'PROJE_ID_BURAYA', ID.slice(1), `${ID}0`, `${ID.slice(1)}g`, 123]) {
      expect(isValidWalletConnectProjectId(bad)).toBe(false);
    }
  });

  it('resolveWalletConnectOptions returns null for missing/empty/invalid ids', () => {
    for (const v of [undefined, '', '  ', 'PROJE_ID_BURAYA', 'zzzz']) {
      expect(resolveWalletConnectOptions({ VITE_WALLETCONNECT_PROJECT_ID: v }, { location: { origin: 'https://a.app' } })).toBeNull();
    }
    expect(resolveWalletConnectOptions({}, null)).toBeNull();
  });

  it('metadata: name, origin url and absolute https icon; VITE_PUBLIC_URL wins', () => {
    const o = resolveWalletConnectOptions({ VITE_WALLETCONNECT_PROJECT_ID: ID }, { location: { origin: 'https://araf.example.app' } });
    expect(o).toEqual({
      projectId: ID,
      showQrModal: true,
      metadata: { name: 'Araf Protocol', description: 'Araf Protocol', url: 'https://araf.example.app', icons: ['https://araf.example.app/icon-192.png'], redirect: { universal: 'https://araf.example.app' } },
    });
    const p = resolveWalletConnectOptions({ VITE_WALLETCONNECT_PROJECT_ID: ID, VITE_PUBLIC_URL: 'https://pub.example.app/' }, { location: { origin: 'https://other.app' } });
    expect(p.metadata.url).toBe('https://pub.example.app');
    expect(p.metadata.icons).toEqual(['https://pub.example.app/icon-192.png']);
    expect(buildWalletConnectMetadata({ origin: '' }).icons).toEqual([]);
  });

  it('metadata.redirect.universal equals url when base exists; no redirect (and no native) otherwise', () => {
    const m = buildWalletConnectMetadata({ publicUrl: 'https://pub.example.app/', origin: 'https://o.app' });
    expect(m.redirect).toEqual({ universal: 'https://pub.example.app' });
    expect(m.redirect.universal).toBe(m.url);
    expect(m.redirect).not.toHaveProperty('native');
    expect('redirect' in buildWalletConnectMetadata({ origin: '' })).toBe(false);
    expect('redirect' in buildWalletConnectMetadata()).toBe(false);
  });
});

describe('connectorsLoader with WalletConnect', () => {
  it('does not load walletConnect without options or with an invalid id', async () => {
    const wc = vi.fn(() => () => ({}));
    expect(await loadConnectorsSafely(async () => mod(wc), logger())).toEqual(['inj', 'cb']);
    expect(await loadConnectorsSafely(async () => mod(wc), logger(), null, { projectId: 'PROJE_ID_BURAYA' })).toEqual(['inj', 'cb']);
    expect(await loadConnectorsSafely(async () => mod(wc), logger(), null, { projectId: '' })).toEqual(['inj', 'cb']);
    expect(wc).not.toHaveBeenCalled();
  });

  it('creates the connector with projectId, metadata (origin url) and showQrModal', async () => {
    const wc = vi.fn(() => () => ({ id: 'walletConnect' }));
    const opts = resolveWalletConnectOptions({ VITE_WALLETCONNECT_PROJECT_ID: ID }, { location: { origin: 'https://araf.example.app' } });
    const list = await loadConnectorsSafely(async () => mod(wc), logger(), null, opts);
    expect(list).toHaveLength(3);
    expect(typeof list[2]).toBe('function');
    expect(wc).toHaveBeenCalledWith({
      projectId: ID,
      showQrModal: true,
      metadata: expect.objectContaining({ name: 'Araf Protocol', url: 'https://araf.example.app' }),
    });
  });

  it('a failing walletConnect factory does not drop the other connectors', async () => {
    const log = logger();
    const wc = vi.fn(() => { throw new Error('boom'); });
    const opts = resolveWalletConnectOptions({ VITE_WALLETCONNECT_PROJECT_ID: ID }, { location: { origin: 'https://a.app' } });
    expect(await loadConnectorsSafely(async () => mod(wc), log, null, opts)).toEqual(['inj', 'cb']);
    expect(log.error).toHaveBeenCalledTimes(1);
  });

  it('chunk load failure still falls back to injected only', async () => {
    const opts = resolveWalletConnectOptions({ VITE_WALLETCONNECT_PROJECT_ID: ID }, { location: { origin: 'https://a.app' } });
    const importer = vi.fn().mockRejectedValueOnce(new Error('chunk 404')).mockResolvedValueOnce(mod());
    expect(await loadConnectorsSafely(importer, logger(), null, opts)).toEqual(['inj']);
  });
});

describe('real wagmi walletConnect connector (provider stubbed)', () => {
  const cfg = () => ({ chains: [base], emitter: { emit: vi.fn() }, transports: { [base.id]: http('https://rpc.invalid') } });
  const opts = () => resolveWalletConnectOptions({ VITE_WALLETCONNECT_PROJECT_ID: ID }, { location: { origin: 'https://araf.example.app' } });

  it('is lazy: wagmi setup() (eager Reown init on page load) is dropped', () => {
    const raw = walletConnect(opts())(cfg());
    expect(typeof raw.setup).toBe('function');
    const lazy = makeLazyConnector(walletConnect(opts()))(cfg());
    expect(lazy.setup).toBeUndefined();
    expect(lazy.id).toBe('walletConnect');
  });

  it('logout path: connector.disconnect() ends the WalletConnect session (wagmi disconnect -> provider.disconnect)', async () => {
    const lazy = makeLazyConnector(walletConnect(opts()))(cfg());
    const c = { ...lazy, getProvider: async () => fakeProvider };
    await c.disconnect();
    expect(fakeProvider.disconnect).toHaveBeenCalledTimes(1);
  });
});
