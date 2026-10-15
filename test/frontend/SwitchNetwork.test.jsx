import React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { SystemStatusBar } from '../../frontend/src/app/shell/SystemStatusBar';
import { __resetStatusDismissalsForTest } from '../../frontend/src/app/shell/statusDismissal';
import { switchToExpectedChain } from '../../frontend/src/app/switchNetwork';
import { createSessionActions } from '../../frontend/src/app/providers/SessionProvider';
import { markTermsAcceptedLocally } from '../../frontend/src/app/legal/terms';

const WALLET = '0xabc0000000000000000000000000000000000000';

beforeEach(() => {
  window.sessionStorage.clear();
  __resetStatusDismissalsForTest();
});
afterEach(() => { cleanup(); vi.restoreAllMocks(); });

const wrongNetworkBar = (props = {}) => (
  <SystemStatusBar
    isTestnet={false}
    isConnected
    isSupportedChain={false}
    supportedChains={{ 84532: 'Base Sepolia' }}
    {...props}
  />
);

describe('unsupported network banner action', () => {
  it('shows a switch button that triggers onSwitchChain', async () => {
    const onSwitchChain = vi.fn();
    render(wrongNetworkBar({ onSwitchChain }));
    await userEvent.click(screen.getByRole('button', { name: 'Switch to Base Sepolia' }));
    expect(onSwitchChain).toHaveBeenCalledTimes(1);
  });

  it('TR label', () => {
    render(wrongNetworkBar({ lang: 'TR' }));
    expect(screen.getByRole('button', { name: "Base Sepolia'ya geç" })).toBeInTheDocument();
  });

  it('disabled while switching', () => {
    render(wrongNetworkBar({ isSwitchingChain: true }));
    expect(screen.getByTestId('status-switch-chain')).toBeDisabled();
  });

  it('banner stays non-dismissible (no X, critical mark present)', () => {
    render(wrongNetworkBar());
    expect(screen.queryByRole('button', { name: /Dismiss warning/ })).toBeNull();
    expect(screen.getByTestId('status-critical-mark')).toBeInTheDocument();
  });
});

describe('switchToExpectedChain', () => {
  it('calls switchChainAsync with the expected chain id and add-chain params', async () => {
    const switchChainAsync = vi.fn().mockResolvedValue({});
    const showToast = vi.fn();
    await switchToExpectedChain({ switchChainAsync, lang: 'EN', showToast });
    const arg = switchChainAsync.mock.calls[0][0];
    expect(arg.chainId).toBe(84532);
    expect(arg.addEthereumChainParameter.rpcUrls).toEqual(['https://sepolia.base.org']);
    expect(showToast).not.toHaveBeenCalled();
  });

  it('user rejection -> cancelled info toast', async () => {
    const showToast = vi.fn();
    const switchChainAsync = vi.fn().mockRejectedValue(Object.assign(new Error('User rejected the request.'), { code: 4001 }));
    await switchToExpectedChain({ switchChainAsync, lang: 'EN', showToast });
    expect(showToast).toHaveBeenCalledWith('Network switch cancelled.', 'info');
    showToast.mockClear();
    await switchToExpectedChain({ switchChainAsync, lang: 'TR', showToast });
    expect(showToast).toHaveBeenCalledWith('Ağ değiştirme iptal edildi.', 'info');
  });

  it('unsupported method -> manual switch toast', async () => {
    const showToast = vi.fn();
    const err = Object.assign(new Error('Method not supported'), { name: 'SwitchChainNotSupportedError' });
    await switchToExpectedChain({ switchChainAsync: vi.fn().mockRejectedValue(err), lang: 'TR', showToast });
    expect(showToast).toHaveBeenCalledWith(
      'Cüzdanınız ağ değiştirmeyi desteklemiyor. Cüzdanın ağ seçicisinden bu site için Base Sepolia ağını seçin.',
      'info',
    );
  });
});

const makeDeps = (overrides = {}) => ({
  address: WALLET,
  connectedWallet: WALLET,
  chainId: 84532,
  isSupportedChain: true,
  isConnected: true,
  isAuthenticated: false,
  authenticatedWallet: null,
  authChecked: true,
  lang: 'EN',
  signMessageAsync: vi.fn().mockResolvedValue('0xsig'),
  disconnect: vi.fn(),
  showToast: vi.fn(),
  setIsLoggingIn: vi.fn(),
  setIsAuthenticated: vi.fn(),
  setAuthenticatedWallet: vi.fn(),
  bestEffortBackendLogout: vi.fn().mockResolvedValue(undefined),
  clearLocalSessionState: vi.fn(),
  setShowWalletModal: vi.fn(),
  openProfilePage: vi.fn(),
  onTermsRequired: vi.fn(),
  ...overrides,
});
const json = (body, ok = true) => ({ ok, status: ok ? 200 : 400, json: async () => body });

describe('loginWithSIWE network guard', () => {
  beforeEach(() => {
    global.fetch = vi.fn();
    localStorage.clear();
    markTermsAcceptedLocally(WALLET);
  });

  it('wrong network: no nonce fetch, no signature, correct toast', async () => {
    const deps = makeDeps({ chainId: 1, isSupportedChain: false });
    await createSessionActions(deps).loginWithSIWE();
    expect(global.fetch).not.toHaveBeenCalled();
    expect(deps.signMessageAsync).not.toHaveBeenCalled();
    expect(deps.showToast).toHaveBeenCalledWith('Switch to Base Sepolia first, then sign in.', 'info');
    const tr = makeDeps({ chainId: 1, isSupportedChain: false, lang: 'TR' });
    await createSessionActions(tr).loginWithSIWE();
    expect(tr.showToast).toHaveBeenCalledWith('Önce Base Sepolia ağına geçin, sonra giriş yapın.', 'info');
  });

  it('supported or unknown network: flow unchanged', async () => {
    for (const isSupportedChain of [true, undefined, null]) {
      const deps = makeDeps({ isSupportedChain });
      global.fetch = vi.fn()
        .mockResolvedValueOnce(json({ nonce: 'abc12345', siweDomain: 'b.example', siweUri: 'https://b.example/app' }))
        .mockResolvedValueOnce(json({ wallet: WALLET }));
      await createSessionActions(deps).loginWithSIWE();
      expect(deps.signMessageAsync).toHaveBeenCalledTimes(1);
      await waitFor(() => expect(deps.setIsAuthenticated).toHaveBeenCalledWith(true));
    }
  });
});
