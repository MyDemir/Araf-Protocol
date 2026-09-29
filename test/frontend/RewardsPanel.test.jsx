import React from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { deriveEpochReward, REWARD_STATUS, summarizeRewards } from '../../frontend/src/app/contexts/profile/rewardsModel';
import RewardsPanel from '../../frontend/src/app/contexts/profile/RewardsPanel';
import { buildLabRewards } from '../../frontend/src/dev/fixtures/profileFixtures';

vi.mock('../../frontend/src/hooks/useRewardsContract', () => ({ useRewardsContract: () => ({ isConfigured: false, isSupportedChain: true }) }));

afterEach(cleanup);

const DAY = 86400;
const timing = { epochDuration: 7 * DAY, claimDelay: DAY, claimWindow: 30 * DAY };
const base = { epoch: 10, timing, totalWeight: 1000n, userWeight: 250n, pool: 1_000_000_000n };
const end = 11 * 7 * DAY;

describe('rewardsModel mirrors ArafRewards.claim', () => {
  it('computes pool * userWeight / totalWeight and share', () => {
    const r = deriveEpochReward({ ...base, now: end + 2 * DAY, finalized: true });
    expect(r.amount).toBe(250_000_000n);
    expect(r.shareBps).toBe(2500);
    expect(r.status).toBe(REWARD_STATUS.CLAIMABLE);
    expect(r.isEstimate).toBe(false);
  });

  it('follows the contract windows', () => {
    expect(deriveEpochReward({ ...base, now: end - 1 }).status).toBe(REWARD_STATUS.ACCRUING);
    expect(deriveEpochReward({ ...base, now: end + DAY - 1 }).status).toBe(REWARD_STATUS.RECORDING);
    expect(deriveEpochReward({ ...base, now: end + DAY }).status).toBe(REWARD_STATUS.CLAIMABLE);
    expect(deriveEpochReward({ ...base, now: end + 31 * DAY }).status).toBe(REWARD_STATUS.CLAIMABLE);
    expect(deriveEpochReward({ ...base, now: end + 31 * DAY + 1 }).status).toBe(REWARD_STATUS.EXPIRED);
    expect(deriveEpochReward({ ...base, now: end + 2 * DAY, claimed: true }).status).toBe(REWARD_STATUS.CLAIMED);
    expect(deriveEpochReward({ ...base, userWeight: 0n, now: end + 2 * DAY }).status).toBe(REWARD_STATUS.NONE);
  });

  it('marks unfinalized claimable amounts as estimates that need finalize', () => {
    const r = deriveEpochReward({ ...base, now: end + 2 * DAY, finalized: false });
    expect(r.needsFinalize).toBe(true);
    expect(r.isEstimate).toBe(true);
  });

  it('summarizes claimable and received per token', () => {
    const rows = [
      { symbol: 'USDT', ...deriveEpochReward({ ...base, now: end + 2 * DAY, finalized: true }) },
      { symbol: 'USDT', ...deriveEpochReward({ ...base, epoch: 11, now: end + 2 * DAY }) },
    ];
    const s = summarizeRewards({ rows, claimHistory: [{ symbol: 'USDT', amount: '5000000' }], currentEpoch: 11 });
    expect(s.byToken.USDT.claimable).toBe(250_000_000n);
    expect(s.byToken.USDT.claimed).toBe(5_000_000n);
    expect(s.byToken.USDT.currentEstimate).toBe(250_000_000n);
    expect(s.currentShareBps).toBe(2500);
  });
});

describe('RewardsPanel', () => {
  it('shows entitled amounts per epoch, received history, and claims with finalize first', async () => {
    const lab = buildLabRewards();
    const finalize = vi.spyOn(lab.reader, 'finalizeEpochToken');
    const claim = vi.spyOn(lab.reader, 'claim');
    render(<RewardsPanel lang="EN" address={'0x' + '1'.repeat(40)} rewardsReader={lab.reader} fetchClaimHistory={lab.fetchClaimHistory} now={lab.now} />);
    expect(await screen.findByTestId('rewards-epochs')).toBeInTheDocument();
    expect(screen.getByTestId('rewards-current-epoch')).toBeInTheDocument();
    expect(screen.getByText('3%')).toBeInTheDocument();
    expect(await screen.findByTestId('rewards-history')).toBeInTheDocument();
    const claimButtons = screen.getAllByRole('button', { name: 'Claim' });
    expect(claimButtons.length).toBe(3);
    fireEvent.click(claimButtons[0]);
    await waitFor(() => expect(claim).toHaveBeenCalled());
    expect(finalize).not.toHaveBeenCalled();
    fireEvent.click(screen.getAllByRole('button', { name: 'Claim' })[1]);
    await waitFor(() => expect(finalize).toHaveBeenCalled());
  });
});
