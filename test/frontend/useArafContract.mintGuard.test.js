import { renderHook } from '@testing-library/react';
import { describe, it, expect, vi, afterEach } from 'vitest';

const ESCROW = '0x00000000000000000000000000000000000000AA';
const TEST_TOKEN = '0x1111111111111111111111111111111111111111';
const REAL_USDC = '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913';
let walletChain = 84532;
const writeContract = vi.fn().mockResolvedValue('0xhash');
const waitForTransactionReceipt = vi.fn().mockResolvedValue({ status: 'success' });

vi.mock('wagmi', () => ({
  usePublicClient: () => ({ readContract: vi.fn().mockResolvedValue(0n), waitForTransactionReceipt }),
  useWalletClient: () => ({ data: { writeContract, account: { address: '0x00000000000000000000000000000000000000BB' } } }),
  useChainId: () => walletChain,
  useAccount: () => ({ chainId: walletChain }),
}));

const load = async () => {
  vi.resetModules();
  vi.stubEnv('VITE_ESCROW_ADDRESS', ESCROW);
  vi.stubEnv('VITE_USDT_ADDRESS', TEST_TOKEN);
  vi.stubEnv('VITE_USDC_ADDRESS', REAL_USDC);
  const hook = await import('../../frontend/src/hooks/useArafContract');
  return renderHook(() => hook.useArafContract()).result.current;
};

afterEach(() => { vi.unstubAllEnvs(); writeContract.mockClear(); walletChain = 84532; });

describe('mintToken savunmalari', () => {
  it('testnet + yapilandirilmis test token: mint cagrilir', async () => {
    const c = await load();
    await c.mintToken(TEST_TOKEN);
    expect(writeContract).toHaveBeenCalledWith(expect.objectContaining({ functionName: 'mint' }));
  });
  it('yanlis zincirde (8453) mint denenmez', async () => {
    walletChain = 8453;
    const c = await load();
    await expect(c.mintToken(TEST_TOKEN)).rejects.toThrow(/84532/);
    expect(writeContract).not.toHaveBeenCalled();
  });
  it('gercek token veya yapilandirilmamis adreste mint denenmez', async () => {
    const c = await load();
    await expect(c.mintToken(REAL_USDC)).rejects.toThrow(/test token/);
    await expect(c.mintToken('0x2222222222222222222222222222222222222222')).rejects.toThrow(/test token/);
    expect(writeContract).not.toHaveBeenCalled();
  });
});
