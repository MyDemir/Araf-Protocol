import { renderHook } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach } from 'vitest';

const readContract = vi.fn();
const writeContract = vi.fn();
const waitForTransactionReceipt = vi.fn();
const useChainIdMock = vi.fn();
const useAccountMock = vi.fn();

vi.mock('wagmi', () => ({
  usePublicClient: () => ({ readContract, waitForTransactionReceipt }),
  useWalletClient: () => ({ data: { writeContract } }),
  useChainId: () => useChainIdMock(),
  useAccount: () => useAccountMock(),
}));

vi.mock('../../frontend/src/app/chainPolicy', () => ({
  getSupportedChainsMap: () => ({ 8453: { name: 'Base' } }),
}));

describe('useRewardsContract wrong-chain guards', () => {
  beforeEach(() => {
    vi.resetModules();
    readContract.mockReset();
    writeContract.mockReset();
    waitForTransactionReceipt.mockReset();
    useChainIdMock.mockReset();
    useChainIdMock.mockReturnValue(8453); // config chain is supported; only the WALLET chain matters
    useAccountMock.mockReset();
    useAccountMock.mockReturnValue({ chainId: 1 });
  });

  it('claim wrong-chain blocked', async () => {
    const { useRewardsContract } = await import('../../frontend/src/hooks/useRewardsContract');
    const { result } = renderHook(() => useRewardsContract());
    const c = result.current;
    await expect(c.claim(1, '0x1111111111111111111111111111111111111111')).rejects.toThrow('Wrong chain: rewards unavailable');
  });

  it('rewards read wrong-chain blocked', async () => {
    const { useRewardsContract } = await import('../../frontend/src/hooks/useRewardsContract');
    const { result } = renderHook(() => useRewardsContract());
    const c = result.current;
    await expect(c.epochDuration()).rejects.toThrow('Wrong chain: rewards unavailable');
    const state = await c.getClaimableState(1, '0x1111111111111111111111111111111111111111', '0x2222222222222222222222222222222222222222');
    expect(state.status).toBe('blocked');
    expect(state.error).toBe('wrong_chain');
  });

  it('vault write wrong-chain blocked', async () => {
    const { useRewardsContract } = await import('../../frontend/src/hooks/useRewardsContract');
    const { result } = renderHook(() => useRewardsContract());
    const c = result.current;
    await expect(c.fundGlobalRewards('0x1111111111111111111111111111111111111111', 1n, 1n, '0x' + '11'.repeat(32))).rejects.toThrow('Wrong chain: vault unavailable');
  });

  it('uses the wallet chain, not the config chain (item 8)', async () => {
    const { useRewardsContract } = await import('../../frontend/src/hooks/useRewardsContract');
    // wallet on an unsupported chain while the config chain is supported -> blocked
    const wrong = renderHook(() => useRewardsContract()).result.current;
    expect(wrong.isSupportedChain).toBe(false);
    await expect(wrong.epochDuration()).rejects.toThrow('Wrong chain: rewards unavailable');
    // wallet on the supported chain -> allowed
    useAccountMock.mockReturnValue({ chainId: 8453 });
    readContract.mockResolvedValue(7n);
    const ok = renderHook(() => useRewardsContract()).result.current;
    expect(ok.isSupportedChain).toBe(true);
  });

  it('no connected wallet (chainId undefined) is blocked', async () => {
    useAccountMock.mockReturnValue({});
    const { useRewardsContract } = await import('../../frontend/src/hooks/useRewardsContract');
    expect(renderHook(() => useRewardsContract()).result.current.isSupportedChain).toBe(false);
  });
});
