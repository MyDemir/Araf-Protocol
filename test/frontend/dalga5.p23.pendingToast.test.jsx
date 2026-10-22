import React from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, render, waitFor } from '@testing-library/react';
import { useAppSessionData } from '../../frontend/src/app/useAppSessionData';

afterEach(() => { cleanup(); localStorage.clear(); });

const deferred = () => {
  let resolve;
  const promise = new Promise((r) => { resolve = r; });
  return { promise, resolve };
};
const res = (body, status = 200) => ({ ok: status < 400, status, headers: { get: () => null }, json: async () => body, clone() { return this; } });

const Harness = ({ props }) => { useAppSessionData(props); return null; };

// [TR] F1-08: kurtarma anında oturum doğrulanmadıysa fetchMyTrades hiçbir şey çekmez;
//      "Veriler yenilendi" toast'ı yalnız gerçekten yenileme olduğunda çıkar.
describe('F1-08: bekleyen tx kurtarma toast doğruluğu', () => {
  const PENDING = { hash: `0x${'a'.repeat(64)}`, chainId: 84532, createdAt: Date.now() };
  const mkProps = (showToast, publicClient) => ({
    address: '0xabc', isConnected: true, connector: null, chainId: 84532, publicClient,
    currentView: 'home', lang: 'EN', isContractLoading: false, connectedWallet: '0xabc',
    setShowMakerModal: vi.fn(), setCurrentView: vi.fn(), showToast,
    SUPPORTED_TOKEN_ADDRESSES: { USDT: '', USDC: '' },
  });

  it('auth/me bitmeden gelen receipt için "refreshed" demez', async () => {
    localStorage.setItem('araf_pending_tx', JSON.stringify(PENDING));
    const me = deferred();
    global.fetch = vi.fn((url) => (String(url).includes('/api/auth/me') ? me.promise : Promise.resolve(res({ orders: [], total: 0, page: 1, limit: 50 }))));
    const showToast = vi.fn();
    const publicClient = { getTransactionReceipt: vi.fn(() => Promise.resolve({ status: 'success' })) };
    render(<Harness props={mkProps(showToast, publicClient)} />);
    await waitFor(() => expect(publicClient.getTransactionReceipt).toHaveBeenCalledTimes(1));
    await waitFor(() => expect(showToast).toHaveBeenCalled());
    const msgs = showToast.mock.calls.map((c) => String(c[0]));
    expect(msgs.some((m) => /Recovered pending transaction/.test(m))).toBe(true);
    expect(msgs.some((m) => /Data refreshed/.test(m))).toBe(false);
    await act(async () => { me.resolve(res({}, 401)); });
  });

  it('oturum açıkken "refreshed" toast çıkar', async () => {
    localStorage.setItem('araf_pending_tx', JSON.stringify(PENDING));
    const receipt = deferred();
    global.fetch = vi.fn((url) => (String(url).includes('/api/auth/me') ? Promise.resolve(res({ wallet: '0xabc' })) : Promise.resolve(res({ orders: [], trades: [], total: 0, page: 1, limit: 50 }))));
    const showToast = vi.fn();
    const publicClient = { getTransactionReceipt: vi.fn(() => receipt.promise) };
    render(<Harness props={mkProps(showToast, publicClient)} />);
    await waitFor(() => expect(publicClient.getTransactionReceipt).toHaveBeenCalledTimes(1));
    await act(async () => { await new Promise((r) => setTimeout(r, 50)); });
    await act(async () => { receipt.resolve({ status: 'success' }); });
    await waitFor(() => expect(showToast.mock.calls.some((c) => /Data refreshed/.test(String(c[0])))).toBe(true));
  });
});
