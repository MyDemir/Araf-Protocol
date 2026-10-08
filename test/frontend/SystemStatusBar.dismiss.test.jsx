import React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { SystemStatusBar } from '../../frontend/src/app/shell/SystemStatusBar';
import {
  STATUS_DISMISS_STORAGE_KEY,
  __resetStatusDismissalsForTest,
  isCriticalStatus,
  statusSignature,
} from '../../frontend/src/app/shell/statusDismissal';
import { checkDeploymentAlignment } from '../../frontend/src/app/chainPolicy';
import { ENV_ERROR_CODES, envError } from '../../frontend/src/app/envErrorCodes';

const bar = (props) => <SystemStatusBar isTestnet={false} {...props} />;

beforeEach(() => {
  window.sessionStorage.clear();
  __resetStatusDismissalsForTest();
});
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe('SystemStatusBar dismissible warnings', () => {
  it('each non-critical warning has a labelled 40px dismiss button', () => {
    render(bar({ ordersFeedError: true, envErrors: ['API policy invalid'] }));
    const buttons = screen.getAllByRole('button', { name: /^Dismiss warning:/ });
    expect(buttons).toHaveLength(2);
    buttons.forEach((b) => {
      expect(b.className).toMatch(/\bw-10\b/);
      expect(b.className).toMatch(/\bh-10\b/);
    });
    expect(screen.getByRole('button', { name: 'Dismiss warning: Market data unavailable' })).toBeInTheDocument();
  });

  it('uses the Turkish label in TR', () => {
    render(bar({ lang: 'TR', ordersFeedError: true }));
    expect(screen.getByRole('button', { name: 'Uyarıyı kapat: Pazar verisi alınamıyor' })).toBeInTheDocument();
  });

  it('hides a dismissed warning, leaves a restore indicator and moves focus to it', async () => {
    const user = userEvent.setup();
    render(bar({ ordersFeedError: true }));
    await user.click(screen.getByRole('button', { name: /Dismiss warning: Market data unavailable/ }));

    expect(screen.queryByText('Market data unavailable')).toBeNull();
    expect(screen.getByTestId('status-hidden-indicator')).toHaveTextContent('1 warning hidden');
    const show = screen.getByRole('button', { name: 'Show' });
    expect(document.activeElement).toBe(show);

    await user.click(show);
    expect(screen.getByText('Market data unavailable')).toBeInTheDocument();
    expect(screen.queryByTestId('status-hidden-indicator')).toBeNull();
    expect(document.activeElement).toHaveAccessibleName(/Dismiss warning: Market data unavailable/);
  });

  it('remembers dismissals for the session (sessionStorage) across remounts and language switches', async () => {
    const user = userEvent.setup();
    const { unmount } = render(bar({ ordersFeedError: true }));
    await user.click(screen.getByRole('button', { name: /Dismiss warning/ }));
    expect(window.sessionStorage.getItem(STATUS_DISMISS_STORAGE_KEY)).toContain('orders_feed_unavailable');
    unmount();

    render(bar({ ordersFeedError: true, lang: 'TR' }));
    expect(screen.queryByText('Pazar verisi alınamıyor')).toBeNull();
    expect(screen.getByTestId('status-hidden-indicator')).toHaveTextContent('1 uyarı gizlendi');
    expect(window.localStorage.getItem(STATUS_DISMISS_STORAGE_KEY)).toBeNull();
  });

  it('shows the warning again when its content changes (a different error)', async () => {
    const user = userEvent.setup();
    const { rerender } = render(bar({ envErrors: ['API policy invalid'] }));
    await user.click(screen.getByRole('button', { name: /Dismiss warning: System Configuration Warning/ }));
    expect(screen.queryByText('System Configuration Warning')).toBeNull();

    rerender(bar({ envErrors: ['API policy invalid'] }));
    expect(screen.queryByText('System Configuration Warning')).toBeNull();

    rerender(bar({ envErrors: ['VITE_ESCROW_ADDRESS missing'] }));
    expect(screen.getByText('System Configuration Warning')).toBeInTheDocument();
    expect(screen.queryByTestId('status-hidden-indicator')).toBeNull();
  });

  it('a pending-sync warning for another trade shows again', async () => {
    const user = userEvent.setup();
    const { rerender } = render(bar({ activeTrade: { _pendingBackendSync: true, onchainId: 7 } }));
    await user.click(screen.getByRole('button', { name: /Dismiss warning: Trade Sync Pending/ }));
    expect(screen.queryByText('Trade Sync Pending')).toBeNull();
    rerender(bar({ activeTrade: { _pendingBackendSync: true, onchainId: 8 } }));
    expect(screen.getByText('Trade Sync Pending')).toBeInTheDocument();
  });

  it('falls back to in-memory storage when sessionStorage throws', async () => {
    const user = userEvent.setup();
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => { throw new Error('blocked'); });
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => { throw new Error('blocked'); });

    const { unmount } = render(bar({ ordersFeedError: true }));
    await user.click(screen.getByRole('button', { name: /Dismiss warning/ }));
    expect(screen.queryByText('Market data unavailable')).toBeNull();
    unmount();

    render(bar({ ordersFeedError: true }));
    expect(screen.queryByText('Market data unavailable')).toBeNull();
    expect(screen.getByTestId('status-hidden-indicator')).toBeInTheDocument();
  });
});

describe('critical safety warnings cannot be dismissed', () => {
  it('wrong network and protocol pause have no dismiss button but a safety mark', () => {
    render(bar({ isConnected: true, isSupportedChain: false, supportedChains: { 8453: 'Base' }, isPaused: true }));
    expect(screen.queryByRole('button', { name: /Dismiss warning/ })).toBeNull();
    expect(screen.getAllByTestId('status-critical-mark')).toHaveLength(2);
    expect(screen.getAllByText('Safety warning — cannot be dismissed')).toHaveLength(2);
    expect(document.querySelector('[data-status-key="unsupported_chain"]')).toHaveAttribute('data-critical', 'true');
  });

  it('an escrow address mismatch from chainPolicy makes the configuration warning non-dismissible', () => {
    const issues = checkDeploymentAlignment({
      frontendEscrowAddress: '0x1111111111111111111111111111111111111111',
      backendDeployment: { escrowAddress: '0x2222222222222222222222222222222222222222', chainId: 8453 },
      isProd: true,
      targetChain: 'base',
    });
    expect(issues.length).toBeGreaterThan(0);
    render(bar({ envErrors: issues, ordersFeedError: true }));
    expect(document.querySelector('[data-status-key="env_error"]')).toHaveAttribute('data-critical', 'true');
    expect(screen.queryByRole('button', { name: /Dismiss warning: System Configuration Warning/ })).toBeNull();
    // [TR] Diğer uyarı yine kapatılabilir. [EN] The other warning stays dismissible.
    expect(screen.getByRole('button', { name: /Dismiss warning: Market data unavailable/ })).toBeInTheDocument();
  });

  it('a backend chain mismatch is critical too', () => {
    const issues = checkDeploymentAlignment({
      frontendEscrowAddress: '0x1111111111111111111111111111111111111111',
      backendDeployment: { escrowAddress: '0x1111111111111111111111111111111111111111', chainId: 999999 },
      isProd: true,
      targetChain: 'base',
    });
    expect(isCriticalStatus({ key: 'env_error', details: issues })).toBe(true);
  });

  it('a stored dismissal can never hide a critical warning', () => {
    window.sessionStorage.setItem(STATUS_DISMISS_STORAGE_KEY, JSON.stringify({
      unsupported_chain: statusSignature({ key: 'unsupported_chain' }),
      paused: statusSignature({ key: 'paused' }),
    }));
    render(bar({ isConnected: true, isSupportedChain: false, isPaused: true }));
    expect(screen.getByText('Unsupported Network')).toBeInTheDocument();
    expect(screen.getByText('Protocol in Maintenance')).toBeInTheDocument();
    expect(screen.queryByTestId('status-hidden-indicator')).toBeNull();
  });

  it('API base URL policy violations (coded) are critical and render their message', () => {
    render(bar({ envErrors: [envError(ENV_ERROR_CODES.API_POLICY_VIOLATION, 'Absolute VITE_API_URL is not allowed in production')] }));
    expect(document.querySelector('[data-status-key="env_error"]')).toHaveAttribute('data-critical', 'true');
    expect(screen.queryByRole('button', { name: /Dismiss warning/ })).toBeNull();
    expect(screen.getByText('Absolute VITE_API_URL is not allowed in production')).toBeInTheDocument();
  });

  it('a missing/zero escrow address (coded) is critical', () => {
    render(bar({ envErrors: [envError(ENV_ERROR_CODES.ESCROW_ADDRESS_MISSING, 'any wording')] }));
    expect(screen.queryByRole('button', { name: /Dismiss warning/ })).toBeNull();
    expect(screen.getByTestId('status-critical-mark')).toBeInTheDocument();
  });

  it('criticality comes from the code, not the text', () => {
    expect(isCriticalStatus({ key: 'env_error', details: [envError(ENV_ERROR_CODES.ESCROW_MISMATCH, 'reworded text')] })).toBe(true);
    expect(isCriticalStatus({ key: 'env_error', details: [envError(ENV_ERROR_CODES.BACKEND_CHAIN_UNSUPPORTED, '')] })).toBe(true);
    // [TR] Kritik olmayan bir kod, metni "escrow adresi uyuşmuyor" dese bile kapatılabilir kalır.
    expect(isCriticalStatus({ key: 'env_error', details: [envError('SOME_NOTICE', 'Escrow adresi uyuşmuyor')] })).toBe(false);
    // [TR] Kodsuz eski düz metin girdiler için geriye dönük yedek. [EN] Legacy fallback for code-less strings.
    expect(isCriticalStatus({ key: 'env_error', details: ['VITE_ESCROW_ADDRESS tanımlı değil veya sıfır adres'] })).toBe(true);
    expect(isCriticalStatus({ key: 'env_error', details: ['API policy invalid'] })).toBe(false);
    expect(isCriticalStatus({ key: 'orders_feed_unavailable' })).toBe(false);
  });

  it('a stored dismissal of an env_error cannot hide it once a critical code appears', async () => {
    const user = userEvent.setup();
    const { rerender } = render(bar({ envErrors: ['API policy invalid'] }));
    await user.click(screen.getByRole('button', { name: /Dismiss warning: System Configuration Warning/ }));
    rerender(bar({ envErrors: ['API policy invalid', envError(ENV_ERROR_CODES.ESCROW_MISMATCH, 'mismatch')] }));
    expect(screen.getByText('System Configuration Warning')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Dismiss warning: System Configuration Warning/ })).toBeNull();
  });
});

describe('dismissals are forgotten when a warning leaves the list', () => {
  it.each([
    ['orders_feed_unavailable', 'Market data unavailable', { ordersFeedError: true }],
    ['auth_required', 'Session Verification Required', { isConnected: true, authChecked: true, isAuthenticated: false }],
    ['wallet_unregistered', 'Wallet Not Registered', { isConnected: true, isWalletRegistered: false }],
  ])('%s shows again when the condition recurs', async (key, title, on) => {
    const user = userEvent.setup();
    const { rerender } = render(bar(on));
    await user.click(screen.getByRole('button', { name: new RegExp(`Dismiss warning: ${title}`) }));
    expect(screen.queryByText(title)).toBeNull();
    expect(window.sessionStorage.getItem(STATUS_DISMISS_STORAGE_KEY)).toContain(key);

    rerender(bar({}));
    expect(window.sessionStorage.getItem(STATUS_DISMISS_STORAGE_KEY)).not.toContain(key);
    expect(screen.queryByTestId('status-hidden-indicator')).toBeNull();

    rerender(bar(on));
    expect(screen.getByText(title)).toBeInTheDocument();
  });

  it('only the warning that left is forgotten; others stay dismissed', async () => {
    const user = userEvent.setup();
    const both = { ordersFeedError: true, envErrors: ['API policy invalid'] };
    const { rerender } = render(bar(both));
    await user.click(screen.getByRole('button', { name: /Dismiss warning: Market data unavailable/ }));
    await user.click(screen.getByRole('button', { name: /Dismiss warning: System Configuration Warning/ }));
    rerender(bar({ envErrors: ['API policy invalid'] }));
    rerender(bar(both));
    expect(screen.getByText('Market data unavailable')).toBeInTheDocument();
    expect(screen.queryByText('System Configuration Warning')).toBeNull();
  });

  it('a fresh mount (page reload) where the warning is not produced yet keeps the record', () => {
    window.sessionStorage.setItem(STATUS_DISMISS_STORAGE_KEY, JSON.stringify({
      orders_feed_unavailable: statusSignature({ key: 'orders_feed_unavailable' }),
    }));
    const { rerender } = render(bar({}));
    expect(window.sessionStorage.getItem(STATUS_DISMISS_STORAGE_KEY)).toContain('orders_feed_unavailable');
    rerender(bar({ ordersFeedError: true }));
    expect(screen.queryByText('Market data unavailable')).toBeNull();
    expect(screen.getByTestId('status-hidden-indicator')).toBeInTheDocument();
  });
});
