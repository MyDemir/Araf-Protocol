import { describe, it, expect, vi } from 'vitest';
import { loadConnectorsSafely } from '../../frontend/src/app/connectorsLoader';

describe('coinbaseWallet connector telemetry', () => {
  it('is created with preference.telemetry=false (no inline telemetry script under CSP script-src self)', async () => {
    const coinbaseWallet = vi.fn(() => 'cb');
    await loadConnectorsSafely(async () => ({ injected: vi.fn(() => 'inj'), coinbaseWallet }), { error: vi.fn() });
    expect(coinbaseWallet).toHaveBeenCalledTimes(1);
    const arg = coinbaseWallet.mock.calls[0][0];
    expect(arg.appName).toBe('Araf Protocol');
    expect(arg.preference).toEqual({ telemetry: false });
    expect(arg.preference.options).toBeUndefined();
  });
});
