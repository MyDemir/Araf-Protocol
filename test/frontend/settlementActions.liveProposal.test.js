import React from 'react';
import { describe, expect, it, vi } from 'vitest';
import { act, render } from '@testing-library/react';
import { useSettlementActions } from '../../frontend/src/app/contexts/settlement/useSettlementActions';
import { checkLiveProposalForAccept } from '../../frontend/src/app/contexts/settlement/settlementActionModel';

const maker = '0x1111111111111111111111111111111111111111';
const taker = '0x2222222222222222222222222222222222222222';
const now = Math.floor(Date.now() / 1000);

const live = (over = {}) => ({
  id: 42n, tradeId: 7n, proposer: maker, makerShareBps: 6000, takerShareBps: 4000,
  proposedAt: 1n, expiresAt: BigInt(now + 3600), state: 1, ...over,
});

const setup = (liveValue) => {
  const deps = {
    activeTrade: {
      id: 'db', onchainId: '7', state: 'CHALLENGED', makerFull: maker, takerFull: taker,
      settlementProposal: { id: 42, state: 'PROPOSED', proposer: maker, makerShareBps: 6000, takerShareBps: 4000, expiresAt: now + 3600 },
    },
    userRole: 'taker', address: taker, lang: 'EN',
    contractFns: {
      acceptSettlement: vi.fn().mockResolvedValue(undefined),
      getSettlementProposal: vi.fn().mockResolvedValue(liveValue),
    },
    fetchMyTrades: vi.fn(), showToast: vi.fn(), isContractLoading: false, setIsContractLoading: vi.fn(),
  };
  let latest;
  const H = () => { latest = useSettlementActions(deps); return null; };
  render(React.createElement(H));
  return { deps, get: () => latest };
};

describe('F3: acceptSettlement verifies the live on-chain proposal', () => {
  it('sends acceptSettlement(tradeId, liveProposalId) when live matches the displayed offer', async () => {
    const { deps, get } = setup(live());
    await act(async () => { await get().accept(); });
    expect(deps.contractFns.acceptSettlement).toHaveBeenCalledWith(7n, 42n);
  });

  it('does NOT send a tx when makerShareBps changed on-chain; exposes live values for re-confirmation', async () => {
    const { deps, get } = setup(live({ makerShareBps: 9000, takerShareBps: 1000 }));
    await act(async () => { await get().accept(); });
    expect(deps.contractFns.acceptSettlement).not.toHaveBeenCalled();
    expect(get().acceptReview.reason).toBe('CHANGED');
    expect(get().acceptReview.live.makerShareBps).toBe(9000);
    expect(deps.showToast).toHaveBeenCalledWith(expect.stringContaining('changed'), 'error');
  });

  it('does NOT send a tx when proposal id changed (withdraw + re-propose with same bps)', async () => {
    const { deps, get } = setup(live({ id: 43n }));
    await act(async () => { await get().accept(); });
    expect(deps.contractFns.acceptSettlement).not.toHaveBeenCalled();
    expect(get().acceptReview.reason).toBe('CHANGED');
  });

  it('re-confirmation pins the new offer, after which accept sends the new id', async () => {
    const { deps, get } = setup(live({ id: 43n, makerShareBps: 9000, takerShareBps: 1000 }));
    await act(async () => { await get().accept(); });
    await act(async () => { get().confirmAcceptReview(); });
    await act(async () => { await get().accept(); });
    expect(deps.contractFns.acceptSettlement).toHaveBeenCalledTimes(1);
    expect(deps.contractFns.acceptSettlement).toHaveBeenCalledWith(7n, 43n);
  });

  it('does NOT send a tx when the live proposal is not PROPOSED, is expired, or is unreadable', async () => {
    for (const [liveValue, reason] of [
      [live({ state: 3 }), 'NOT_PROPOSED'],
      [live({ expiresAt: BigInt(now - 5) }), 'EXPIRED'],
      [null, 'UNREADABLE'],
    ]) {
      const { deps, get } = setup(liveValue);
      await act(async () => { await get().accept(); });
      expect(deps.contractFns.acceptSettlement).not.toHaveBeenCalled();
      expect(get().acceptReview.reason).toBe(reason);
    }
  });

  it('prepareAccept pins the live offer at preview time', async () => {
    const { get } = setup(live({ makerShareBps: 7000, takerShareBps: 3000 }));
    let result;
    await act(async () => { result = await get().prepareAccept(); });
    expect(result.ok).toBe(true);
    expect(get().acceptSnapshot).toEqual({ id: 42n, makerShareBps: 7000 });
  });

  it('checkLiveProposalForAccept treats the boundary second as live (now <= expiresAt)', () => {
    const r = checkLiveProposalForAccept({ live: live({ expiresAt: BigInt(now) }), expected: { id: 42, makerShareBps: 6000 }, nowTs: now });
    expect(r.ok).toBe(true);
    const r2 = checkLiveProposalForAccept({ live: live({ expiresAt: BigInt(now) }), expected: { id: 42, makerShareBps: 6000 }, nowTs: now + 1 });
    expect(r2.reason).toBe('EXPIRED');
  });
});
