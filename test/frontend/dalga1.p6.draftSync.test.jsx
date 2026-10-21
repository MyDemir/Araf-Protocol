import { act, cleanup, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useAppSessionData } from '../../frontend/src/app/useAppSessionData';

const WALLET = '0xabc0000000000000000000000000000000000000';
const baseProps = {
  address: WALLET, isConnected: true, connector: null, chainId: 84532,
  publicClient: null, currentView: 'market', showProfileModal: false, profileTab: 'ayarlar', lang: 'EN',
  isContractLoading: false, setShowMakerModal: vi.fn(), setShowProfileModal: vi.fn(), setCurrentView: vi.fn(),
  setActiveTrade: vi.fn(), showToast: vi.fn(),
  SUPPORTED_TOKEN_ADDRESSES: { USDT: '', USDC: '' }, connectedWallet: WALLET,
  getWalletRegisteredAt: vi.fn().mockResolvedValue(0n),
};
const res = (body) => ({ ok: true, status: 200, json: async () => body, clone() { return this; } });
const flush = async () => { await act(async () => { await vi.advanceTimersByTimeAsync(0); }); };

let piiCalls;
beforeEach(() => {
  vi.useFakeTimers();
  vi.spyOn(console, 'error').mockImplementation(() => {});
  piiCalls = 0;
  global.fetch = vi.fn(async (url) => {
    const u = String(url);
    if (u.includes('auth/me')) return res({ wallet: WALLET, hasPayoutProfile: true });
    if (u.includes('pii/my')) { piiCalls += 1; return res({ pii: { rail: 'US_ACH', country: 'US', fields: {} } }); }
    return res({});
  });
});
afterEach(() => { cleanup(); vi.useRealTimers(); vi.restoreAllMocks(); });

describe('F2-02: taslak oturum başında kayıtlı profilden bir kez dolar', () => {
  it('profil sayfası açılmasa da taslak kayıtlı rail/country olur', async () => {
    const { result } = renderHook(() => useAppSessionData(baseProps));
    await flush(); await flush();
    expect(result.current.payoutProfileDraft.rail).toBe('US_ACH');
    expect(result.current.payoutProfileDraft.country).toBe('US');
    expect(piiCalls).toBe(1);
  });

  it('kullanıcı taslağı elle değiştirdiyse ilk eşzamanlama ezmez', async () => {
    let resolvePii;
    global.fetch = vi.fn(async (url) => {
      const u = String(url);
      if (u.includes('auth/me')) return res({ wallet: WALLET, hasPayoutProfile: true });
      if (u.includes('pii/my')) return new Promise((r) => { resolvePii = () => r(res({ pii: { rail: 'US_ACH', country: 'US', fields: {} } })); });
      return res({});
    });
    const { result } = renderHook(() => useAppSessionData(baseProps));
    await flush();
    await act(async () => { result.current.setPayoutProfileDraft({ rail: 'SEPA_IBAN', country: 'DE' }); });
    await act(async () => { resolvePii(); await vi.advanceTimersByTimeAsync(0); });
    expect(result.current.payoutProfileDraft.rail).toBe('SEPA_IBAN');
  });

  const WALLET_B = '0xdef0000000000000000000000000000000000000';

  it('cüzdan değişimi yarışı: A yanıtı geç gelirse B taslağı A verisini almaz', async () => {
    let meWallet = WALLET;
    let resolveA;
    global.fetch = vi.fn(async (url) => {
      const u = String(url);
      if (u.includes('auth/me')) return res({ wallet: meWallet, hasPayoutProfile: true });
      if (u.includes('pii/my')) {
        if (meWallet === WALLET) return new Promise((r) => { resolveA = () => r(res({ pii: { rail: 'US_ACH', country: 'US', fields: { iban: 'A-SECRET' } } })); });
        return res({ pii: { rail: 'SEPA_IBAN', country: 'DE', fields: {} } });
      }
      return res({});
    });
    const { result, rerender } = renderHook((p) => useAppSessionData(p), { initialProps: baseProps });
    await flush();
    meWallet = WALLET_B;
    rerender({ ...baseProps, address: WALLET_B, connectedWallet: WALLET_B });
    await flush(); await flush();
    expect(result.current.payoutProfileDraft.rail).toBe('SEPA_IBAN');
    await act(async () => { resolveA(); await vi.advanceTimersByTimeAsync(0); });
    expect(result.current.payoutProfileDraft.rail).toBe('SEPA_IBAN');
    expect(result.current.payoutProfileDraft.fields.iban).toBeNull();
  });

  it('çıkışta ödeme taslağı boş varsayılana sıfırlanır', async () => {
    const { result, rerender } = renderHook((p) => useAppSessionData(p), { initialProps: baseProps });
    await flush(); await flush();
    expect(result.current.payoutProfileDraft.rail).toBe('US_ACH');
    rerender({ ...baseProps, isConnected: false });
    await flush();
    expect(result.current.payoutProfileDraft.rail).toBe('TR_IBAN');
    expect(result.current.payoutProfileDraft.fields.iban).toBeNull();
  });
});
