import { renderHook } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

const ESCROW = '0x00000000000000000000000000000000000000AA';
const TEST_TOKEN = '0x1111111111111111111111111111111111111111';
let walletChain = 84532;
const writeContract = vi.fn();
const simulateContract = vi.fn().mockRejectedValue(new Error('sim'));

vi.mock('wagmi', () => ({
  usePublicClient: () => ({ readContract: vi.fn().mockResolvedValue(0n), waitForTransactionReceipt: vi.fn(), simulateContract }),
  useWalletClient: () => ({ data: { writeContract, account: { address: '0x00000000000000000000000000000000000000BB' } } }),
  useChainId: () => walletChain,
  useAccount: () => ({ chainId: walletChain }),
}));

const load = async () => {
  vi.resetModules();
  vi.stubEnv('VITE_ESCROW_ADDRESS', ESCROW);
  vi.stubEnv('VITE_USDT_ADDRESS', TEST_TOKEN);
  const hook = await import('../../frontend/src/hooks/useArafContract');
  return renderHook(() => hook.useArafContract()).result.current;
};

const rejection = () => Object.assign(new Error('User rejected the request.'), { code: 4001 });
const realError = () => new Error('execution reverted: boom');
const actions = {
  approve: (c) => c.approveToken(TEST_TOKEN, 1n),
  mint: (c) => c.mintToken(TEST_TOKEN),
  write: (c) => c.registerWallet(),
};

beforeEach(() => {
  globalThis.fetch = vi.fn().mockResolvedValue({ ok: true });
  vi.spyOn(console, 'error').mockImplementation(() => {});
});
afterEach(() => { vi.unstubAllEnvs(); writeContract.mockReset(); walletChain = 84532; });

describe.each(Object.keys(actions))('%s: kullanici reddi log', (name) => {
  it('ret: hata firlatilir, backend log gonderilmez', async () => {
    const err = rejection();
    writeContract.mockRejectedValue(err);
    const c = await load();
    await expect(actions[name](c)).rejects.toBe(err);
    expect(globalThis.fetch).not.toHaveBeenCalled();
  });
  it('gercek hata: ERROR olarak loglanir', async () => {
    writeContract.mockRejectedValue(realError());
    const c = await load();
    await expect(actions[name](c)).rejects.toThrow();
    expect(globalThis.fetch).toHaveBeenCalledTimes(1);
    expect(JSON.parse(globalThis.fetch.mock.calls[0][1].body).level).toBe('ERROR');
  });
});
