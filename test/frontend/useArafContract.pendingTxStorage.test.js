import { renderHook } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

const ESCROW = '0x00000000000000000000000000000000000000aa';
const WALLET = '0x00000000000000000000000000000000000000bb';
const CHAIN = 84532;
const HASH = `0x${'ab'.repeat(32)}`;

const publicClient = {
  readContract: vi.fn().mockResolvedValue(0n),
  waitForTransactionReceipt: vi.fn(async () => ({ status: 'success', logs: [] })),
};
const writeContract = vi.fn().mockResolvedValue(HASH);

vi.mock('wagmi', () => ({
  usePublicClient: () => publicClient,
  useWalletClient: () => ({ data: { writeContract, account: { address: WALLET } } }),
  useChainId: () => CHAIN,
  useAccount: () => ({ chainId: CHAIN, address: WALLET }),
}));

const load = async () => {
  vi.resetModules();
  vi.stubEnv('VITE_ESCROW_ADDRESS', ESCROW);
  const hook = await import('../../frontend/src/hooks/useArafContract');
  return renderHook(() => hook.useArafContract()).result.current;
};

afterEach(() => {
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
  writeContract.mockClear();
  publicClient.waitForTransactionReceipt.mockClear();
});

describe('P10 useArafContract araf_pending_tx depolama hatası (F2-01)', () => {
  it('setItem/getItem/removeItem fırlatsa da gönderilmiş tx başarılı sayılır ve receipt beklenir', async () => {
    const boom = () => { throw new DOMException('blocked', 'SecurityError'); };
    const c = await load();
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(boom);
    vi.spyOn(Storage.prototype, 'removeItem').mockImplementation(boom);
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(boom);
    await expect(c.cancelSellOrder(1n)).resolves.toBeDefined();
    expect(writeContract).toHaveBeenCalledTimes(1);
    expect(publicClient.waitForTransactionReceipt).toHaveBeenCalledWith({ hash: HASH });
  });

  it('receipt başarısızsa depolama hatası asıl hatanın yerine geçmez', async () => {
    const boom = () => { throw new DOMException('blocked', 'SecurityError'); };
    const c = await load();
    publicClient.waitForTransactionReceipt.mockResolvedValueOnce({ status: 'reverted', logs: [] });
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(boom);
    vi.spyOn(Storage.prototype, 'removeItem').mockImplementation(boom);
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(boom);
    const err = await c.cancelSellOrder(1n).then(() => null, (e) => e);
    expect(err).toBeTruthy();
    expect(err.name).not.toBe('SecurityError');
  });
});
