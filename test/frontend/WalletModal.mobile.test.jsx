import React from 'react';
import { afterEach, describe, it, expect, vi } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { buildAppModals } from '../../frontend/src/app/AppModals';

const IPHONE = 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 Mobile/15E148 Safari/604.1';
const DESKTOP = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/120.0 Safari/537.36';

const setUa = (ua) => Object.defineProperty(window.navigator, 'userAgent', { value: ua, configurable: true });

afterEach(() => {
  cleanup();
  delete window.ethereum;
  setUa(DESKTOP);
});

const connectors = [
  { uid: '1', id: 'injected', name: 'Injected' },
  { uid: '2', id: 'coinbaseWalletSDK', name: 'Coinbase Wallet' },
];

const renderModal = (over = {}) => {
  const ctx = {
    lang: 'EN', showWalletModal: true, setShowWalletModal: vi.fn(), connectors,
    connect: vi.fn(), showToast: vi.fn(), getWalletIcon: () => null, ...over,
  };
  const { renderWalletModal } = buildAppModals(ctx);
  render(<div>{renderWalletModal()}</div>);
  return ctx;
};

describe('wallet modal on mobile', () => {
  it('shows two buttons, hidden deeplinks, toggles four links', async () => {
    setUa(IPHONE);
    const ctx = renderModal();
    expect(screen.getByTestId('mobile-wallet-picker')).toBeTruthy();
    expect(screen.queryByText('Injected')).toBeNull();
    const toggle = screen.getByTestId('browser-wallet-toggle');
    expect(screen.getByText('Coinbase Wallet')).toBeTruthy();
    expect(toggle.getAttribute('aria-expanded')).toBe('false');
    expect(document.querySelectorAll('a[data-wallet-link]').length).toBe(0);
    await userEvent.click(toggle);
    expect(toggle.getAttribute('aria-expanded')).toBe('true');
    expect(document.getElementById(toggle.getAttribute('aria-controls'))).toBeTruthy();
    for (const id of ['metamask', 'okx', 'trust', 'coinbase']) {
      const a = document.querySelector(`a[data-wallet-link="${id}"]`);
      expect(a).toBeTruthy();
      expect(a.getAttribute('rel')).toBe('noopener noreferrer');
    }
    expect(ctx.connect).not.toHaveBeenCalled();
    await userEvent.click(toggle);
    expect(document.querySelectorAll('a[data-wallet-link]').length).toBe(0);
  });

  it('coinbase button always connects', async () => {
    setUa(IPHONE);
    const ctx = renderModal();
    await userEvent.click(screen.getByText('Coinbase Wallet'));
    expect(ctx.connect).toHaveBeenCalledWith({ connector: connectors[1] }, expect.anything());
  });

  it('injected button connects when a provider exists', async () => {
    setUa(IPHONE);
    window.ethereum = {};
    const ctx = renderModal();
    await userEvent.click(screen.getByText('Injected'));
    expect(ctx.connect).toHaveBeenCalledWith({ connector: connectors[0] }, expect.anything());
  });

  it('keeps the normal list on mobile when a wallet is injected', () => {
    setUa(IPHONE);
    window.ethereum = {};
    renderModal();
    expect(screen.queryByTestId('mobile-wallet-picker')).toBeNull();
    expect(screen.getByText('Injected')).toBeTruthy();
  });

  it('keeps the normal list on desktop', () => {
    setUa(DESKTOP);
    renderModal();
    expect(screen.queryByTestId('mobile-wallet-picker')).toBeNull();
  });

  it('surfaces connect errors instead of failing silently', async () => {
    setUa(DESKTOP);
    const connect = vi.fn((_v, opts) => opts.onError({ name: 'ProviderNotFoundError' }));
    const ctx = renderModal({ connect });
    await userEvent.click(screen.getByText('Injected'));
    expect(ctx.showToast).toHaveBeenCalledWith(expect.stringMatching(/No wallet found/), 'error');
  });
});
