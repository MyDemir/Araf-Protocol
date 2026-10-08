import React from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { act, render, renderHook, screen, cleanup } from '@testing-library/react';
import { buildTradeRoomPanelCallbacks } from '../../frontend/src/app/contexts/trade-room/tradeRoomPanelActions';
import { buildTradeDecisionModel } from '../../frontend/src/app/contexts/trade-room/tradeDecisionModel';
import { deriveTradeTimeline, setMakerChallengeWindowMs, getMakerChallengeWindowMs } from '../../frontend/src/app/contexts/trade-room/tradeTimeline';
import { StateGuidancePanel } from '../../frontend/src/app/contexts/trade-room/TradeRoomPanels';
import { tradeRoomScenarios } from '../ui-lab/fixtures/tradeRoomFixtures';
import { scenarioRegistry } from '../ui-lab/controller/scenarioRegistry';
import { useSettlementActions } from '../../frontend/src/app/contexts/settlement/useSettlementActions';
import { setClockOffset } from '../../frontend/src/app/clock';

const H = 3600 * 1000;
const NOW = Date.now();
const ago = (h) => new Date(NOW - h * H).toISOString();

afterEach(() => {
  cleanup();
  setMakerChallengeWindowMs(24 * H);
  setClockOffset(0);
});

describe('madde 1: window.confirm yoksa kullanici bilgilendirilir', () => {
  const mk = (extra) => buildTradeRoomPanelCallbacks({
    lang: 'EN', activeTrade: { onchainId: 1, paidAt: ago(30) }, roomState: 'PAID', hasOnchainTradeId: true,
    isMaker: true, nowMs: NOW, handleChallenge: vi.fn(), handleProposeCancel: vi.fn(), ...extra,
  });

  it('start_challenge: confirm yok -> toast, aksiyon calismaz', () => {
    const showToast = vi.fn(); const handleChallenge = vi.fn();
    mk({ confirmFn: null, showToast, handleChallenge }).start_challenge.onClick();
    expect(showToast).toHaveBeenCalledWith(expect.stringContaining('unavailable'), 'error');
    expect(handleChallenge).not.toHaveBeenCalled();
  });

  it('propose_cancel: confirm yok -> TR toast, aksiyon calismaz', () => {
    const showToast = vi.fn(); const handleProposeCancel = vi.fn();
    mk({ lang: 'TR', confirmFn: null, showToast, handleProposeCancel }).propose_cancel.onClick();
    expect(showToast).toHaveBeenCalledWith(expect.stringContaining('onay penceresi'), 'error');
    expect(handleProposeCancel).not.toHaveBeenCalled();
  });
});

describe('madde 2: challenge penceresi acikken rehber', () => {
  const trade = { onchainId: 1, paidAt: ago(60), challengePingedAt: ago(30) };
  const model = (lang, t = trade) => buildTradeDecisionModel({ trade: t, tradeState: 'PAID', userRole: 'maker', lang, nowMs: NOW, timers: deriveTradeTimeline(t, { state: 'PAID', now: NOW }).timers });

  it('EN/TR vurgu ve geri sayim; acilis karti gizli', () => {
    const en = model('EN');
    expect(en.guidance[0]).toMatch(/You can open a challenge right now — deadline: 18h/);
    expect(en.guidance.join(' ')).not.toMatch(/A ping is a claim/);
    expect(en.timerCards.map((c) => c.key)).not.toContain('makerChallenge');
    expect(en.timerCards.map((c) => c.key)).toContain('makerChallengeDeadline');
    expect(model('TR').guidance[0]).toMatch(/Şu an itiraz açabilirsin — son süre: 18h/);
  });

  it('vurgu panelde isaretlenir', () => {
    render(<StateGuidancePanel guidance={model('EN').guidance} highlightFirst />);
    expect(screen.getByText(/right now/).getAttribute('data-highlight')).toBe('true');
  });

  it('pencere henuz acilmadiysa genel kural + acilis karti kalir', () => {
    const t = { ...trade, challengePingedAt: ago(5) };
    const m = model('EN', t);
    expect(m.guidance[0]).toMatch(/A ping is a claim/);
    expect(m.timerCards.map((c) => c.key)).toContain('makerChallenge');
  });
});

describe('madde 3: ping dustu fixture', () => {
  const find = (id) => tradeRoomScenarios.find((s) => s.id === id);
  const panel = (s) => {
    const { trade, tradeState, userRole } = s.decisionInput;
    return buildTradeRoomPanelCallbacks({
      lang: 'EN', activeTrade: trade, roomState: tradeState, isMaker: userRole === 'maker', hasOnchainTradeId: true,
      nowMs: Date.now(), confirmFn: () => true,
    });
  };

  it('UI Lab kayit defterinde secilebilir', () => {
    const ids = scenarioRegistry.tradeRoom.scenarios.map((s) => s.id);
    expect(ids).toEqual(expect.arrayContaining(['paid-taker-ping-lapsed', 'paid-maker-ping-lapsed']));
  });
  it('taker: pingMaker acik', () => {
    const s = find('paid-taker-ping-lapsed');
    expect(s.decisionInput.trade.challengePingedAt).toBeTruthy();
    expect(panel(s).ping_maker.disabled).toBe(false);
  });
  it('maker: challenge kapali', () => {
    const cb = panel(find('paid-maker-ping-lapsed'));
    expect(cb.start_challenge.disabled).toBe(true);
    expect(cb.start_challenge.disabledReasons.join(' ')).toMatch(/Challenge window closed/);
  });
});

describe('madde 4: kabul aninda zincir saati', () => {
  const maker = '0x1111111111111111111111111111111111111111';
  const taker = '0x2222222222222222222222222222222222222222';
  const nowSec = Math.floor(Date.now() / 1000);
  const setup = () => {
    const deps = {
      activeTrade: { id: 'db', onchainId: '7', state: 'CHALLENGED', makerFull: maker, takerFull: taker,
        settlementProposal: { id: 42, state: 'PROPOSED', proposer: maker, makerShareBps: 6000, takerShareBps: 4000, expiresAt: nowSec + 3600 } },
      userRole: 'taker', address: taker, lang: 'EN',
      nowTs: nowSec, // bayat kart saati
      contractFns: {
        acceptSettlement: vi.fn().mockResolvedValue(undefined),
        getSettlementProposal: vi.fn().mockResolvedValue({ id: 42n, tradeId: 7n, proposer: maker, makerShareBps: 6000, takerShareBps: 4000, proposedAt: 1n, expiresAt: BigInt(nowSec + 60), state: 1 }),
      },
      fetchMyTrades: vi.fn(), showToast: vi.fn(), isContractLoading: false, setIsContractLoading: vi.fn(),
    };
    return { deps, ...renderHook(() => useSettlementActions(deps)) };
  };

  it('nowTs bayat olsa da zincir saati sureyi dolmus sayar', async () => {
    setClockOffset(120 * 1000);
    const { deps, result } = setup();
    await act(async () => { await result.current.accept(); });
    expect(deps.contractFns.acceptSettlement).not.toHaveBeenCalled();
    expect(result.current.acceptReview.reason).toBe('EXPIRED');
  });

  it('saat dolmadiysa kabul gider', async () => {
    const { deps, result } = setup();
    await act(async () => { await result.current.accept(); });
    expect(deps.contractFns.acceptSettlement).toHaveBeenCalledWith(7n, 42n);
  });

  it('resetAccept snapshot ve incelemeyi sifirlar', async () => {
    const { result } = setup();
    await act(async () => { await result.current.prepareAccept(); });
    expect(result.current.acceptSnapshot).toEqual({ id: 42n, makerShareBps: 6000 });
    act(() => result.current.resetAccept());
    expect(result.current.acceptSnapshot).toBeNull();
    expect(result.current.acceptReview).toBeNull();
  });
});

describe('madde 5: MAKER_CHALLENGE_WINDOW timeline icin ayarlanabilir', () => {
  const t = { paidAt: ago(60), challengePingedAt: ago(37) };
  it('varsayilan 24h; kontrat degeri deadline hesabini degistirir', () => {
    expect(getMakerChallengeWindowMs()).toBe(24 * H);
    expect(deriveTradeTimeline(t, { state: 'PAID', now: NOW }).flags.pingLapsed).toBe(false);
    setMakerChallengeWindowMs(12 * H);
    expect(deriveTradeTimeline(t, { state: 'PAID', now: NOW }).flags.pingLapsed).toBe(true);
  });
  it('gecersiz deger 24h yedege duser', () => {
    setMakerChallengeWindowMs(12 * H);
    setMakerChallengeWindowMs(0);
    expect(getMakerChallengeWindowMs()).toBe(24 * H);
    setMakerChallengeWindowMs(NaN);
    expect(getMakerChallengeWindowMs()).toBe(24 * H);
  });
});
