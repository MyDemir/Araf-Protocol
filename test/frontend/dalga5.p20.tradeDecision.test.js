import { describe, expect, it } from 'vitest';
import { buildTradeDecisionModel } from '../../frontend/src/app/contexts/trade-room/tradeDecisionModel';

const NOW = Date.UTC(2026, 0, 10, 12, 0, 0);
const H = 3600 * 1000;
const base = {
  trade: { id: 't1', onchainId: 11 },
  tradeState: 'LOCKED',
  userRole: 'taker',
  paymentIpfsHash: '',
  timers: {},
  isConnected: true,
  isAuthenticated: true,
  isSupportedChain: true,
  isPaused: false,
  lang: 'EN',
  nowMs: NOW,
};

describe('P20 F3-06: odeme suresi dolunca dekont gerekcesi gosterilmez', () => {
  it('suresi dolmamis taker icin Dekont gerekli kalir', () => {
    const m = buildTradeDecisionModel(base);
    expect(m.disabledReasons).toContain('Payment proof is required.');
  });
  it('sure dolunca dekont ve yedek mod gerekcesi temizlenir, genel kapi nedeni korunur', () => {
    const m = buildTradeDecisionModel({ ...base, paymentWindowExpired: true });
    expect(m.primaryAction.key).toBe('payment_window_closed');
    expect(m.disabledReasons).toEqual([]);
    const fb = buildTradeDecisionModel({ ...base, paymentWindowExpired: true, chainFallback: true, isConnected: false });
    expect(fb.disabledReasons).toEqual(['Wallet not connected.']);
  });
  it('stale kaydi kilidi (F2-04) sure dolsa da korunur', () => {
    const m = buildTradeDecisionModel({ ...base, trade: { ...base.trade, stale: true }, paymentWindowExpired: true });
    expect(m.disabledReasons.join(' ')).toMatch(/could not be refreshed/);
  });
});

describe('P20 F3-07: maker rehberi taker ping ve ping sonrasi bekleme', () => {
  const paidMaker = { ...base, tradeState: 'PAID', userRole: 'maker' };
  it('taker ping attiysa maker ping kurali degil serbest birakma rehberi gosterilir', () => {
    const m = buildTradeDecisionModel({ ...paidMaker, trade: { ...base.trade, paidAt: new Date(NOW - 50 * H).toISOString(), pingedAt: new Date(NOW - 1 * H).toISOString() } });
    expect(m.guidance.join(' ')).toMatch(/buyer pinged you/);
    expect(m.guidance.join(' ')).not.toMatch(/A ping is a claim/);
  });
  it('maker ping attiktan sonra T+24s dolmadiysa bekleme suresi soylenir', () => {
    const m = buildTradeDecisionModel({
      ...paidMaker,
      trade: { ...base.trade, paidAt: new Date(NOW - 60 * H).toISOString(), challengePingedAt: new Date(NOW - 2 * H).toISOString() },
    });
    expect(m.guidance.join(' ')).toMatch(/challenge window opens 24 hours after the ping/);
  });
  it('ping hic atilmadiysa ilk-ping kurali kalir', () => {
    const m = buildTradeDecisionModel({ ...paidMaker, trade: { ...base.trade, paidAt: new Date(NOW - 30 * H).toISOString() } });
    expect(m.guidance.join(' ')).toMatch(/A ping is a claim/);
  });
});
