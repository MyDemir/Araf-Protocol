import React from 'react';
import { act, cleanup, render, renderHook, screen, fireEvent } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useAppSessionData } from '../../frontend/src/app/useAppSessionData';
import { AccountPanel } from '../../frontend/src/app/contexts/profile/ProfilePanels';
import { WALLET_AGE_MIN_SEC } from '../../frontend/src/app/walletAge';

const baseProps = {
  address: '0xabc0000000000000000000000000000000000000', isConnected: true, connector: null, chainId: 84532,
  publicClient: null, currentView: 'home', showProfileModal: false, profileTab: 'ayarlar', lang: 'EN',
  isContractLoading: false, setShowMakerModal: vi.fn(), setShowProfileModal: vi.fn(), setCurrentView: vi.fn(),
  setActiveTrade: vi.fn(), showToast: vi.fn(),
  SUPPORTED_TOKEN_ADDRESSES: { USDT: '', USDC: '' }, connectedWallet: '0xabc0000000000000000000000000000000000000',
};

const flush = async (ms = 0) => { await act(async () => { await vi.advanceTimersByTimeAsync(ms); }); };
const setHidden = (v) => Object.defineProperty(document, 'hidden', { configurable: true, get: () => v });

beforeEach(() => {
  vi.useFakeTimers();
  vi.spyOn(Math, 'random').mockReturnValue(0.5);
  vi.spyOn(console, 'error').mockImplementation(() => {});
  global.fetch = vi.fn(async () => ({ ok: true, status: 200, json: async () => ({}), clone() { return this; } }));
});
afterEach(() => { cleanup(); setHidden(false); vi.useRealTimers(); vi.restoreAllMocks(); });

const mount = (getWalletRegisteredAt) => renderHook(() => useAppSessionData({ ...baseProps, getWalletRegisteredAt }));
const nowSec = () => Math.floor(Date.now() / 1000);

describe('wallet registration read', () => {
  it('retries after an RPC failure; unknown stays null (never false), then resolves false', async () => {
    const read = vi.fn().mockRejectedValueOnce(new Error('rpc')).mockResolvedValue(0n);
    const { result } = mount(read);
    await flush(0);
    expect(read).toHaveBeenCalledTimes(1);
    expect(result.current.isWalletRegistered).toBeNull();
    await flush(5000);
    expect(read).toHaveBeenCalledTimes(2);
    expect(result.current.isWalletRegistered).toBe(false);
  });

  it('backs off 5,10,20,40,60s while failing', async () => {
    const read = vi.fn().mockRejectedValue(new Error('rpc'));
    const { result } = mount(read);
    await flush(0);
    await flush(5000); expect(read).toHaveBeenCalledTimes(2);
    await flush(9999); expect(read).toHaveBeenCalledTimes(2);
    await flush(1); expect(read).toHaveBeenCalledTimes(3);
    await flush(20000); expect(read).toHaveBeenCalledTimes(4);
    await flush(40000); expect(read).toHaveBeenCalledTimes(5);
    await flush(60000); expect(read).toHaveBeenCalledTimes(6);
    expect(result.current.isWalletRegistered).toBeNull();
  });

  it('makes no reads while the tab is hidden', async () => {
    const read = vi.fn().mockRejectedValue(new Error('rpc'));
    mount(read);
    await flush(0);
    setHidden(true);
    const before = read.mock.calls.length;
    await flush(120000);
    expect(read.mock.calls.length).toBe(before);
    setHidden(false);
    await flush(60000);
    expect(read.mock.calls.length).toBeGreaterThan(before);
  });

  it('refreshes every 60s once read, and stops after the wallet has aged', async () => {
    const read = vi.fn().mockResolvedValue(0n);
    mount(read);
    await flush(0);
    await flush(60000);
    expect(read).toHaveBeenCalledTimes(2);
    const aged = vi.fn().mockResolvedValue(BigInt(nowSec() - WALLET_AGE_MIN_SEC - 10));
    mount(aged);
    await flush(0);
    await flush(300000);
    expect(aged).toHaveBeenCalledTimes(1);
  });

  it('refreshWalletRegistration triggers an immediate read', async () => {
    const read = vi.fn().mockRejectedValueOnce(new Error('rpc')).mockResolvedValue(0n);
    const { result } = mount(read);
    await flush(0);
    await act(async () => { result.current.refreshWalletRegistration(); });
    await flush(0);
    expect(read).toHaveBeenCalledTimes(2);
    expect(result.current.isWalletRegistered).toBe(false);
  });

  it('after registration (set true), a read fills walletAgeRemainingDays', async () => {
    const read = vi.fn().mockResolvedValueOnce(0n).mockResolvedValue(BigInt(nowSec()));
    const { result } = mount(read);
    await flush(0);
    expect(result.current.walletAgeRemainingDays).toBeNull();
    await act(async () => { result.current.setIsWalletRegistered(true); });
    await flush(0);
    expect(result.current.isWalletRegistered).toBe(true);
    expect(result.current.walletAgeRemainingDays).toBeGreaterThan(0);
  });
});

describe('registered lock', () => {
  it('stays true when a post-registration read returns 0n, then fills days on a later read', async () => {
    const read = vi.fn().mockResolvedValueOnce(0n).mockResolvedValueOnce(0n).mockResolvedValue(BigInt(nowSec()));
    const { result } = mount(read);
    await flush(0);
    expect(result.current.isWalletRegistered).toBe(false);
    await act(async () => { result.current.setIsWalletRegistered(true); });
    await flush(0);
    expect(read).toHaveBeenCalledTimes(2);
    expect(result.current.isWalletRegistered).toBe(true);
    expect(result.current.walletAgeRemainingDays).toBeNull();
    await flush(5000);
    expect(result.current.isWalletRegistered).toBe(true);
    expect(result.current.walletAgeRemainingDays).toBeGreaterThan(0);
  });

  it('resets the lock when the address changes', async () => {
    const read = vi.fn().mockResolvedValue(0n);
    const { result, rerender } = renderHook((p) => useAppSessionData({ ...baseProps, ...p, getWalletRegisteredAt: read }), { initialProps: {} });
    await flush(0);
    await act(async () => { result.current.setIsWalletRegistered(true); });
    await flush(0);
    expect(result.current.isWalletRegistered).toBe(true);
    rerender({ address: '0xdef0000000000000000000000000000000000000', connectedWallet: '0xdef0000000000000000000000000000000000000' });
    await flush(0);
    expect(result.current.isWalletRegistered).toBe(false);
  });
});

describe('AccountPanel retry button', () => {
  const sybil = { aged: false, funded: true, cooldownOk: true, cooldownRemaining: 0 };
  it('shows Retry only when unknown, fires callback, and never a register button', () => {
    const onRetry = vi.fn();
    render(<AccountPanel lang="EN" sybilStatus={sybil} isWalletRegistered={null} onRetryWalletRegistration={onRetry} />);
    fireEvent.click(screen.getByTestId('wallet-age-retry'));
    expect(onRetry).toHaveBeenCalledTimes(1);
    expect(screen.queryByText(/register/i)).toBeNull();
  });
  it('hides Retry when status is known', () => {
    render(<AccountPanel lang="EN" sybilStatus={sybil} isWalletRegistered={false} onRetryWalletRegistration={vi.fn()} />);
    expect(screen.queryByTestId('wallet-age-retry')).toBeNull();
  });
});
