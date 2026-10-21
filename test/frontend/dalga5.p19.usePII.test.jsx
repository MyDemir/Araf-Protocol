import { describe, it, expect, vi } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { usePII } from '../../frontend/src/hooks/usePII';

describe('P19 usePII', () => {
  it('F2-11: clearPII uçuştaki isteği iptal edince loading sıfırlanır', async () => {
    const af = vi.fn().mockImplementation(() => new Promise(() => {}));
    const { result } = renderHook(() => usePII('t1', af));
    act(() => { result.current.fetchPII(); });
    expect(result.current.loading).toBe(true);
    act(() => { result.current.clearPII(); });
    expect(result.current.loading).toBe(false);
  });

  it.each([
    ['TR', 'Zincir şu an okunamıyor, ödeme bilgisi geçici olarak gizli.'],
    ['EN', 'The chain cannot be read right now, payout info is temporarily hidden.'],
  ])('503 ONCHAIN_STATE_UNAVAILABLE açık mesaj (%s)', async (lang, expected) => {
    window.localStorage.setItem('araf_lang', lang);
    const af = vi.fn().mockResolvedValue({ ok: false, status: 503, json: async () => ({ code: 'ONCHAIN_STATE_UNAVAILABLE', error: 'x' }) });
    const { result } = renderHook(() => usePII('t1', af));
    await act(async () => { await result.current.fetchPII(); });
    expect(result.current.error).toBe(expected);
    window.localStorage.removeItem('araf_lang');
  });
});
