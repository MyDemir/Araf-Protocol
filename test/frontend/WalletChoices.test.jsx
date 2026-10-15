import React from 'react';
import { afterEach, describe, it, expect, vi } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { buildAppModals } from '../../frontend/src/app/AppModals';
import { groupWalletConnectors } from '../../frontend/src/app/walletOptions';

const IPHONE = 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 Mobile/15E148 Safari/604.1';
const DESKTOP = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/120.0 Safari/537.36';
const setUa = (ua) => Object.defineProperty(window.navigator, 'userAgent', { value: ua, configurable: true });

afterEach(() => {
  cleanup();
  delete window.ethereum;
  setUa(DESKTOP);
});

const generic = { uid: 'g', id: 'injected', name: 'Injected', type: 'injected' };
const mm = { uid: 'mm', id: 'io.metamask', name: 'MetaMask', type: 'injected', icon: 'data:image/svg+xml,a' };
const mmDup = { uid: 'mm2', id: 'io.metamask', name: 'MetaMask', type: 'injected' };
const okx = { uid: 'okx', id: 'com.okex.wallet', name: 'OKX Wallet', type: 'injected' };
const cb = { uid: 'cb', id: 'coinbaseWalletSDK', name: 'Coinbase Wallet', type: 'coinbaseWallet' };
const cbExt = { uid: 'cbx', id: 'com.coinbase.wallet', name: 'Coinbase Wallet', type: 'injected' };
const wc = { uid: 'wc', id: 'walletConnect', name: 'WalletConnect', type: 'walletConnect' };

const renderModal = (connectors, over = {}) => {
  const ctx = {
    lang: 'EN', showWalletModal: true, setShowWalletModal: vi.fn(), connectors,
    connect: vi.fn(), showToast: vi.fn(), getWalletIcon: () => null, ...over,
  };
  render(<div>{buildAppModals(ctx).renderWalletModal()}</div>);
  return ctx;
};

describe('groupWalletConnectors', () => {
  it('dedupes EIP-6963 copies and hides generic Injected when named wallets exist', () => {
    const g = groupWalletConnectors([generic, mm, mmDup, okx, cb, cbExt, wc], { ethereum: {} });
    expect(g.browser.map((c) => c.id)).toEqual(['io.metamask', 'com.okex.wallet']);
    expect(g.walletConnect).toBe(wc);
    expect(g.coinbase).toBe(cb);
  });

  it('keeps generic Injected only when window.ethereum exists and nothing else was discovered', () => {
    expect(groupWalletConnectors([generic, cb], { ethereum: {} }).browser).toEqual([generic]);
    expect(groupWalletConnectors([generic, cb], {}).browser).toEqual([]);
  });

  it('no walletConnect connector -> none', () => {
    expect(groupWalletConnectors([generic, cb], {}).walletConnect).toBeNull();
  });
});

describe('wallet modal: three options', () => {
  it('no extension: browser row disabled, WalletConnect and Coinbase available', () => {
    renderModal([generic, cb, wc]);
    expect(screen.getByTestId('wallet-option-browser').disabled).toBe(true);
    expect(screen.getByTestId('wallet-option-walletconnect')).toBeTruthy();
    expect(screen.getByTestId('wallet-option-coinbase')).toBeTruthy();
  });

  it('WalletConnect row is absent when the connector was not loaded (no/invalid project id)', () => {
    renderModal([generic, cb]);
    expect(screen.queryByTestId('wallet-option-walletconnect')).toBeNull();
    expect(screen.getByTestId('wallet-option-coinbase')).toBeTruthy();
  });

  it('single extension connects with one tap, by name', async () => {
    const ctx = renderModal([generic, mm, mmDup, cb, wc]);
    expect(screen.getAllByText('MetaMask')).toHaveLength(1);
    await userEvent.click(screen.getByTestId('wallet-option-browser'));
    expect(ctx.connect).toHaveBeenCalledWith({ connector: mm }, expect.anything());
  });

  it('several extensions open a sub-list; choosing one connects it', async () => {
    const ctx = renderModal([generic, mm, okx, cb, wc]);
    const toggle = screen.getByTestId('wallet-option-browser');
    expect(toggle.getAttribute('aria-expanded')).toBe('false');
    expect(document.querySelector('[data-wallet-connector]')).toBeNull();
    await userEvent.click(toggle);
    expect(toggle.getAttribute('aria-expanded')).toBe('true');
    expect(document.querySelectorAll('[data-wallet-connector]')).toHaveLength(2);
    expect(ctx.connect).not.toHaveBeenCalled();
    await userEvent.click(document.querySelector('[data-wallet-connector="com.okex.wallet"]'));
    expect(ctx.connect).toHaveBeenCalledWith({ connector: okx }, expect.anything());
  });

  it('WalletConnect and Coinbase rows connect their connectors', async () => {
    const ctx = renderModal([generic, cb, wc]);
    await userEvent.click(screen.getByTestId('wallet-option-walletconnect'));
    expect(ctx.connect).toHaveBeenCalledWith({ connector: wc }, expect.anything());
  });

  it('WalletConnect connect errors go through describeConnectError (toast)', async () => {
    const connect = vi.fn((_v, opts) => opts.onError({ code: 4001 }));
    const ctx = renderModal([generic, cb, wc], { connect });
    await userEvent.click(screen.getByTestId('wallet-option-walletconnect'));
    expect(ctx.showToast).toHaveBeenCalledWith(expect.stringMatching(/cancelled/), 'error');
  });
});

describe('mobile compact layout and naming', () => {
  it('TR: first row is "Cüzdan uygulamasında aç"; with injected provider it stays "Tarayıcı cüzdanı"', () => {
    setUa(IPHONE);
    renderModal([generic, cb, wc], { lang: 'TR' });
    expect(screen.getByText('Cüzdan uygulamasında aç')).toBeTruthy();
    cleanup();
    window.ethereum = {};
    renderModal([generic, cb, wc], { lang: 'TR' });
    expect(screen.getByText('Tarayıcı cüzdanı')).toBeTruthy();
  });

  it('deep links render as one compact chip row with >=44px touch targets, in focus order', async () => {
    setUa(IPHONE);
    renderModal([generic, cb, wc]);
    await userEvent.click(screen.getByTestId('browser-wallet-toggle'));
    const links = [...document.querySelectorAll('a[data-wallet-link]')];
    expect(links.map((a) => a.getAttribute('data-wallet-link'))).toEqual(['metamask', 'okx', 'trust', 'coinbase']);
    for (const a of links) expect(a.className).toMatch(/min-h-\[44px\]/);
    expect(links[0].closest('ul').className).toMatch(/flex-nowrap/);
    expect(links[0].closest('ul').className).not.toMatch(/grid/);
  });
});

describe('wallet modal on mobile without injected provider', () => {
  it('first option opens the deep-link list; WalletConnect and Coinbase follow', async () => {
    setUa(IPHONE);
    const ctx = renderModal([generic, cb, wc]);
    expect(screen.getByTestId('mobile-wallet-picker')).toBeTruthy();
    await userEvent.click(screen.getByTestId('browser-wallet-toggle'));
    expect(document.querySelector('a[data-wallet-link="metamask"]')).toBeTruthy();
    expect(ctx.connect).not.toHaveBeenCalled();
    await userEvent.click(screen.getByTestId('wallet-option-walletconnect'));
    expect(ctx.connect).toHaveBeenCalledWith({ connector: wc }, expect.anything());
  });

  it('no WalletConnect row on mobile when it is not configured', () => {
    setUa(IPHONE);
    renderModal([generic, cb]);
    expect(screen.queryByTestId('wallet-option-walletconnect')).toBeNull();
  });
});
