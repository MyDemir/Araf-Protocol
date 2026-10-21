import React from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import RewardsPanel from '../../frontend/src/app/contexts/profile/RewardsPanel';
import { buildLabRewards } from '../ui-lab/fixtures/profileFixtures';

vi.mock('../../frontend/src/hooks/useRewardsContract', () => ({ useRewardsContract: () => ({ isConfigured: false, isSupportedChain: true }) }));

afterEach(cleanup);

const ADDR = `0x${'1'.repeat(40)}`;

const summaryText = async (fetchClaimHistory) => {
  const lab = buildLabRewards({ hoursIntoEpoch: 72 });
  render(<RewardsPanel lang="EN" address={ADDR} rewardsReader={lab.reader} fetchClaimHistory={fetchClaimHistory(lab)} now={lab.now} />);
  const el = await screen.findByTestId('rewards-summary');
  await waitFor(() => expect(el.textContent).toMatch(/USDT/));
  // Geçmiş isteğinin çözülmesi için bir mikro-görev bekle.
  await new Promise((r) => setTimeout(r, 20));
  const text = screen.getByTestId('rewards-summary').textContent;
  cleanup();
  return text;
};

// [TR] F4-12: ayna eksik/geride ise (yeni claim henüz indekslenmedi) "toplam alınan" zincirdeki CLAIMED satırlarının altına düşmez.
describe('F4-12: toplam alınan = max(zincir CLAIMED, ayna)', () => {
  it('geride kalan ayna toplamı düşürmez', async () => {
    const chainOnly = await summaryText(() => async () => []);
    const staleMirror = await summaryText((lab) => async () => [{ token: lab.reader.tokens.USDT, amount: '1', symbol: 'USDT' }]);
    expect(staleMirror).toBe(chainOnly);
  });
});
