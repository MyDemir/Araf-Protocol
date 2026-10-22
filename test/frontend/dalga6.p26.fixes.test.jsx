import { describe, it, expect, vi } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { isWalletProviderDisconnectedError } from '../../frontend/src/app/walletDisconnect';
import { estimateTxParams, assertNativeBalance, MAX_FEE_BASE_COMPONENT_NUMERATOR, MAX_FEE_BASE_COMPONENT_DENOMINATOR } from '../../frontend/src/app/txGasFee';
import { usePII } from '../../frontend/src/hooks/usePII';

describe('F2-17: bağlantı kopma deseni cüzdan/WalletConnect kaynağına daralır', () => {
  it('gerçek WalletConnect hatası hâlâ yakalanır (WS abnormal close)', () => {
    expect(isWalletProviderDisconnectedError(new Error('WebSocket connection closed abnormally with code: 3000 (Unauthorized: invalid key)'))).toBe(true);
    expect(isWalletProviderDisconnectedError(new Error('x', { cause: new Error('WebSocket connection closed abnormally with code: 3000') }))).toBe(true);
  });
  it('ilgisiz düz "connection closed" hataları toast tetiklemez', () => {
    expect(isWalletProviderDisconnectedError(new Error('Connection closed'))).toBe(false);
    expect(isWalletProviderDisconnectedError(new Error('RPC connection closed by server'))).toBe(false);
    expect(isWalletProviderDisconnectedError('fetch failed: connection closed')).toBe(false);
  });
});

describe('F2-19: maxFeePerGas baz ücret bileşeninde tampon taşır', () => {
  const ctx = (pc) => ({ publicClient: pc, account: '0x1', address: '0x2', abi: [], functionName: 'f', args: [] });
  it('baseFee*2 + priority (viem 1.2x -> 2x)', async () => {
    const base = 1_000_000_000n; const prio = 1_000_000n;
    const viemMax = (base * 12n) / 10n + prio; // viem varsayılanı: baseFee*1.2 + priority
    const pc = {
      estimateContractGas: vi.fn().mockResolvedValue(100_000n),
      estimateFeesPerGas: vi.fn().mockResolvedValue({ maxFeePerGas: viemMax, maxPriorityFeePerGas: prio }),
    };
    const out = await estimateTxParams(ctx(pc));
    expect(MAX_FEE_BASE_COMPONENT_NUMERATOR).toBe(5n);
    expect(MAX_FEE_BASE_COMPONENT_DENOMINATOR).toBe(3n);
    expect(out.maxFeePerGas).toBe(2n * base + prio);
    expect(out.maxPriorityFeePerGas).toBe(prio);
  });
  it('bakiye ön kontrolü yeni üst sınırla tutarlı', async () => {
    const pc = {
      estimateContractGas: vi.fn().mockResolvedValue(100_000n),
      estimateFeesPerGas: vi.fn().mockResolvedValue({ maxFeePerGas: 1_200_000_001n, maxPriorityFeePerGas: 1n }),
    };
    const params = await estimateTxParams(ctx(pc));
    const cost = params.gas * params.maxFeePerGas;
    expect(() => assertNativeBalance({ balance: cost, params })).not.toThrow();
    expect(() => assertNativeBalance({ balance: cost - 1n, params })).toThrow('yetmiyor');
  });
});

describe('F2-20: usePII authenticatedFetch olmadan istek atmaz', () => {
  it('düz fetch yedeği yok: istek atılmaz, açık hata durumu', async () => {
    const spy = vi.fn();
    globalThis.fetch = spy;
    const { result } = renderHook(() => usePII('t1', undefined));
    let out;
    await act(async () => { out = await result.current.fetchPII(); });
    expect(spy).not.toHaveBeenCalled();
    expect(out).toBeNull();
    expect(result.current.pii).toBeNull();
    expect(result.current.error).toMatch(/oturum|session/i);
    expect(result.current.loading).toBe(false);
  });
  it('gizleme payoutProfile durumunu temizler', async () => {
    const af = vi.fn()
      .mockResolvedValueOnce({ ok: true, json: async () => ({ piiToken: 't' }) })
      .mockResolvedValueOnce({ ok: true, json: async () => ({ payoutProfile: { fields: { iban: 'TR00' } } }) });
    const { result } = renderHook(() => usePII('t1', af));
    await act(async () => { await result.current.fetchPII(); });
    expect(result.current.pii?.payoutProfile?.fields?.iban).toBe('TR00');
    act(() => { result.current.clearPII(); });
    expect(result.current.pii).toBeNull();
  });
});
