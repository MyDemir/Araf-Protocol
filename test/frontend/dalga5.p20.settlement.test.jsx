import { describe, expect, it, vi } from 'vitest';
import { act, renderHook } from '@testing-library/react';
import { useSettlementActions } from '../../frontend/src/app/contexts/settlement/useSettlementActions';
import { validateSettlementProposalInput } from '../../frontend/src/app/contexts/settlement/settlementActionModel';

const maker = '0x1111111111111111111111111111111111111111';
const taker = '0x2222222222222222222222222222222222222222';
const now = Math.floor(Date.now() / 1000);

describe('P20 F3-11: kontrat sure araligi (10 dk .. 7 gun, ikisi dahil)', () => {
  const ok = (expiresAt) => validateSettlementProposalInput({ tradeId: 7, makerShareBps: 5000, expiresAt, nowTs: now });
  it('alt sinir: now+600 gecerli, now+599 gecersiz', () => {
    expect(ok(now + 600)).toBeNull();
    expect(ok(now + 599)).not.toBeNull();
  });
  it('ust sinir: now+7gun gecerli, +1 sn gecersiz', () => {
    expect(ok(now + 7 * 86400)).toBeNull();
    expect(ok(now + 7 * 86400 + 1)).not.toBeNull();
  });
  it('gecmis zaman eski mesajla reddedilir', () => {
    expect(ok(now - 1)).toMatch(/valid settlement expiry/);
  });
});

describe('P20 F3-05: tx basarili, liste yenileme hatasi', () => {
  const setup = (fetchMyTrades) => {
    const deps = {
      activeTrade: { id: 'db', onchainId: '7', state: 'CHALLENGED', makerFull: maker, takerFull: taker, settlementProposal: null },
      userRole: 'maker', address: maker, lang: 'EN',
      contractFns: { proposeSettlement: vi.fn().mockResolvedValue(undefined) },
      fetchMyTrades, showToast: vi.fn(), isContractLoading: false, setIsContractLoading: vi.fn(),
    };
    return { deps, ...renderHook(() => useSettlementActions(deps)) };
  };
  it('yenileme firlatirsa hata toast i gosterilmez, sonuc true kalir', async () => {
    const { deps, result } = setup(vi.fn().mockRejectedValue(new Error('network')));
    let res;
    await act(async () => { res = await result.current.propose({ makerShareBps: 5000, expiresAt: now + 3600 }); });
    expect(deps.contractFns.proposeSettlement).toHaveBeenCalled();
    expect(res).toBe(true);
    expect(deps.showToast).not.toHaveBeenCalledWith(expect.anything(), 'error');
    expect(deps.showToast).toHaveBeenCalledWith(expect.stringMatching(/could not be refreshed/), 'info');
    expect(deps.setIsContractLoading).toHaveBeenLastCalledWith(false);
  });
  it('tx firlatirsa hata toast i ve false', async () => {
    const { deps, result } = setup(vi.fn());
    deps.contractFns.proposeSettlement.mockRejectedValue(new Error('boom'));
    let res;
    await act(async () => { res = await result.current.propose({ makerShareBps: 5000, expiresAt: now + 3600 }); });
    expect(res).toBe(false);
    expect(deps.showToast).toHaveBeenCalledWith(expect.any(String), 'error');
    expect(deps.setIsContractLoading).toHaveBeenLastCalledWith(false);
  });
});
