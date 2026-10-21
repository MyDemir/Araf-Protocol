import { describe, expect, it, vi } from 'vitest';
import { buildTradeDecisionModel } from '../../frontend/src/app/contexts/trade-room/tradeDecisionModel';
import { buildTradeRoomPanelCallbacks } from '../../frontend/src/app/contexts/trade-room/tradeRoomPanelActions';

const base = {
  trade: { id: 't1', onchainId: 11, paidAt: new Date(Date.now() - 3600e3).toISOString() },
  paymentIpfsHash: 'hash', timers: {}, isConnected: true, isAuthenticated: true, isSupportedChain: true, lang: 'EN',
};

describe('P5 F3-01: pause closes only whenNotPaused actions', () => {
  it.each([
    ['PAID', 'maker'], ['PAID', 'taker'], ['CHALLENGED', 'maker'], ['CHALLENGED', 'taker'], ['LOCKED', 'taker'],
  ])('%s/%s: pause adds no disabled reason, shows the info line', (tradeState, userRole) => {
    const m = buildTradeDecisionModel({ ...base, tradeState, userRole, isPaused: true });
    expect(m.disabledReasons).toEqual([]);
    expect(m.globalDisabledReasons).toEqual([]);
    expect(m.guidance.some((g) => /new trades cannot be opened/.test(g))).toBe(true);
  });
  it('TR copy; no notice when not paused or terminal', () => {
    const tr = buildTradeDecisionModel({ ...base, tradeState: 'PAID', userRole: 'maker', isPaused: true, lang: 'TR' });
    expect(tr.guidance.join(' ')).toContain('yeni işlem açılamaz, mevcut işlemler kapanabilir');
    expect(buildTradeDecisionModel({ ...base, tradeState: 'PAID', userRole: 'maker', isPaused: false }).guidance.join(' ')).not.toMatch(/paused/);
    expect(buildTradeDecisionModel({ ...base, tradeState: 'RESOLVED', userRole: 'maker', isPaused: true }).guidance).toEqual([]);
  });
  it('pause notice is not the highlighted first guidance line', () => {
    const m = buildTradeDecisionModel({ ...base, tradeState: 'PAID', userRole: 'maker', isPaused: true });
    expect(m.guidance[0]).not.toMatch(/paused/);
  });
});

describe('P5 F3-03: maker release from CHALLENGED needs an explained confirmation', () => {
  const mk = (over) => {
    const handleRelease = vi.fn();
    const confirmFn = vi.fn(() => true);
    const cb = buildTradeRoomPanelCallbacks({
      lang: 'EN', activeTrade: { onchainId: 1 }, roomState: 'CHALLENGED', isMaker: true,
      chargebackAccepted: true, hasOnchainTradeId: true, handleRelease, confirmFn, ...over,
    });
    return { cb, handleRelease, confirmFn };
  };
  it('asks first, sends only when confirmed', () => {
    const a = mk();
    a.cb.release_funds.onClick();
    expect(a.confirmFn).toHaveBeenCalledTimes(1);
    expect(a.confirmFn.mock.calls[0][0]).toMatch(/reputation/);
    expect(a.handleRelease).toHaveBeenCalledTimes(1);
    const b = mk({ confirmFn: vi.fn(() => false) });
    b.cb.release_funds.onClick();
    expect(b.handleRelease).not.toHaveBeenCalled();
  });
  it('PAID release stays one-click', () => {
    const a = mk({ roomState: 'PAID' });
    a.cb.release_funds.onClick();
    expect(a.confirmFn).not.toHaveBeenCalled();
    expect(a.handleRelease).toHaveBeenCalledTimes(1);
  });
  it('model explains the disputed release for the CHALLENGED maker', () => {
    const m = buildTradeDecisionModel({ ...base, tradeState: 'CHALLENGED', userRole: 'maker', isPaused: false });
    expect(m.primaryAction.key).toBe('release_funds');
    expect(m.primaryAction.description).toMatch(/disputed release/);
    expect(m.primaryAction.description).toMatch(/reputation/);
  });
});
