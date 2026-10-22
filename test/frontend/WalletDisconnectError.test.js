import { describe, expect, it } from 'vitest';
import { isWalletProviderDisconnectedError } from '../../frontend/src/app/walletDisconnect';

describe('isWalletProviderDisconnectedError', () => {
  it('matches the OKX message', () => {
    expect(isWalletProviderDisconnectedError(new Error('Disconnected from OKX Wallet background. Page reload required.'))).toBe(true);
  });
  it('matches other extension phrasings', () => {
    expect(isWalletProviderDisconnectedError(new Error('Extension context invalidated.'))).toBe(true);
    expect(isWalletProviderDisconnectedError(new Error('WebSocket connection closed abnormally with code: 3000'))).toBe(true);
    // F2-17: duz "Connection closed" artik eslesmez (ilgisiz RPC/WS hatalari)
    expect(isWalletProviderDisconnectedError(new Error('Connection closed'))).toBe(false);
  });
  it('finds the message in cause and nested errors', () => {
    expect(isWalletProviderDisconnectedError(new Error('x', { cause: new Error('Page reload required') }))).toBe(true);
    expect(isWalletProviderDisconnectedError({ message: 'a', error: { cause: { message: 'Extension context invalidated' } } })).toBe(true);
  });
  it('is false for unrelated errors and survives cycles', () => {
    expect(isWalletProviderDisconnectedError(new Error('User rejected the request'))).toBe(false);
    expect(isWalletProviderDisconnectedError(null)).toBe(false);
    const a = { message: 'a' };
    a.cause = a;
    expect(isWalletProviderDisconnectedError(a)).toBe(false);
  });
});
