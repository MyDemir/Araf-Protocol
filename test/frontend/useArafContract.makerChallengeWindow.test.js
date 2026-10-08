import { renderHook, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, afterEach } from 'vitest';

const ESCROW = '0x00000000000000000000000000000000000000AA';
const readContract = vi.fn();

vi.mock('wagmi', () => ({
  usePublicClient: () => ({ readContract }),
  useWalletClient: () => ({ data: null }),
  useChainId: () => 31337,
  useAccount: () => ({ chainId: 31337 }),
}));

const load = async () => {
  vi.resetModules();
  vi.stubEnv('VITE_ESCROW_ADDRESS', ESCROW);
  const timeline = await import('../../frontend/src/app/contexts/trade-room/tradeTimeline');
  const hook = await import('../../frontend/src/hooks/useArafContract');
  return { timeline, hook };
};

afterEach(() => { vi.unstubAllEnvs(); readContract.mockReset(); });

describe('MAKER_CHALLENGE_WINDOW kontrattan okunur', () => {
  it('okunan deger timeline a gecer', async () => {
    readContract.mockResolvedValue(43200n);
    const { timeline, hook } = await load();
    renderHook(() => hook.useArafContract());
    await waitFor(() => expect(timeline.getMakerChallengeWindowMs()).toBe(43200 * 1000));
    expect(readContract).toHaveBeenCalledWith(expect.objectContaining({ functionName: 'MAKER_CHALLENGE_WINDOW' }));
  });
  it('okunamazsa 24h yedek', async () => {
    readContract.mockRejectedValue(new Error('rpc'));
    const { timeline, hook } = await load();
    renderHook(() => hook.useArafContract());
    await waitFor(() => expect(readContract).toHaveBeenCalled());
    expect(timeline.getMakerChallengeWindowMs()).toBe(24 * 3600 * 1000);
  });
});
