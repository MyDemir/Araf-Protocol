import { afterEach, describe, expect, it, vi } from 'vitest';
import { act, renderHook, waitFor } from '@testing-library/react';
import { useTermsGate } from '../../frontend/src/app/legal/useTermsGate';
import { isTermsAcceptedLocally, markTermsAcceptedLocally } from '../../frontend/src/app/legal/terms';

const W = '0x' + 'A'.repeat(40);

afterEach(() => localStorage.clear());

describe('useTermsGate: terms are asked once per wallet', () => {
  it('does not ask the server when this browser already has the acceptance', () => {
    markTermsAcceptedLocally(W);
    const fetchStatus = vi.fn();
    const { result } = renderHook(() => useTermsGate({ address: W, isConnected: true, fetchStatus }));
    expect(result.current.accepted).toBe(true);
    expect(fetchStatus).not.toHaveBeenCalled();
  });

  it('on a new device, a server-side acceptance skips the modal and is cached locally', async () => {
    const fetchStatus = vi.fn(async () => true);
    const { result } = renderHook(() => useTermsGate({ address: W, isConnected: true, fetchStatus }));
    // While checking, the caller hides the modal (no flash).
    expect(result.current.checking).toBe(true);
    await waitFor(() => expect(result.current.accepted).toBe(true));
    expect(fetchStatus).toHaveBeenCalledWith(W.toLowerCase());
    expect(isTermsAcceptedLocally(W)).toBe(true);
  });

  it('requires acceptance when the wallet has no record, and when the check fails', async () => {
    const { result } = renderHook(() => useTermsGate({ address: W, isConnected: true, fetchStatus: async () => false }));
    await waitFor(() => expect(result.current.checking).toBe(false));
    expect(result.current.accepted).toBe(false);
    const failing = renderHook(() => useTermsGate({ address: '0x' + 'b'.repeat(40), isConnected: true, fetchStatus: async () => { throw new Error('down'); } }));
    await waitFor(() => expect(failing.result.current.checking).toBe(false));
    expect(failing.result.current.accepted).toBe(false);
  });

  it('markAccepted records the acceptance for this wallet', async () => {
    const { result } = renderHook(() => useTermsGate({ address: W, isConnected: true, fetchStatus: async () => false }));
    await waitFor(() => expect(result.current.checking).toBe(false));
    act(() => result.current.markAccepted());
    expect(result.current.accepted).toBe(true);
  });
});
