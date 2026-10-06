import { describe, expect, it, vi } from 'vitest';
import { deriveTradeTimeline } from '../../frontend/src/app/contexts/trade-room/tradeTimeline';
import { buildTradeRoomPanelCallbacks } from '../../frontend/src/app/contexts/trade-room/tradeRoomPanelActions';
import { buildTradeDecisionModel } from '../../frontend/src/app/contexts/trade-room/tradeDecisionModel';
import { ARAF_CONTRACT_ERROR_ABI, describeContractErrorName } from '../../frontend/src/app/contractErrors';

// K2(B): T = challengePingedAt. Challenge only in [T+24h, T+48h); ping lapses at T+48h.
const NOW = Date.UTC(2026, 8, 29, 12, 0, 0);
const ago = (h) => new Date(NOW - h * 3600 * 1000).toISOString();
const flagsAt = (trade, state = 'PAID') => deriveTradeTimeline(trade, { state, now: NOW }).flags;
const paid = { paidAt: ago(100) };

describe('K2(B) timeline flags', () => {
  it('maker challenge window is [T+24h, T+48h)', () => {
    expect(flagsAt({ ...paid, challengePingedAt: ago(23.9) }).canMakerChallenge).toBe(false);
    expect(flagsAt({ ...paid, challengePingedAt: ago(24) }).canMakerChallenge).toBe(true);
    expect(flagsAt({ ...paid, challengePingedAt: ago(47.9) }).canMakerChallenge).toBe(true);
    expect(flagsAt({ ...paid, challengePingedAt: ago(48) }).canMakerChallenge).toBe(false);
    expect(flagsAt({ ...paid, challengePingedAt: ago(48) }).makerChallengeWindowClosed).toBe(true);
  });

  it('taker ping stays closed while the maker ping is valid and opens when it lapses', () => {
    expect(flagsAt({ ...paid, challengePingedAt: ago(47.9) }).canTakerPing).toBe(false);
    const lapsed = flagsAt({ ...paid, challengePingedAt: ago(48) });
    expect(lapsed.pingLapsed).toBe(true);
    expect(lapsed.canTakerPing).toBe(true);
  });

  it('lapsed ping still requires paidAt + GRACE_PERIOD for the taker ping', () => {
    expect(flagsAt({ paidAt: ago(60), challengePingedAt: ago(48) }).canTakerPing).toBe(true);
    expect(flagsAt({ paidAt: ago(10), challengePingedAt: ago(48) }).canTakerPing).toBe(false);
  });

  it('lapse does not apply once the taker pinged, and not outside PAID', () => {
    expect(flagsAt({ ...paid, challengePingedAt: ago(60), pingedAt: ago(1) }).pingLapsed).toBe(false);
    expect(flagsAt({ ...paid, challengePingedAt: ago(60) }, 'CHALLENGED').pingLapsed).toBe(false);
  });

  it('exposes a challenge deadline countdown at T+48h', () => {
    const { timers } = deriveTradeTimeline({ ...paid, challengePingedAt: ago(30) }, { state: 'PAID', now: NOW });
    expect(timers.makerChallenge.isFinished).toBe(true);
    expect(timers.makerChallengeDeadline).toMatchObject({ isFinished: false, hours: 18 });
  });
});

describe('K2(B) panel actions', () => {
  const mk = (trade, extra = {}) => buildTradeRoomPanelCallbacks({
    lang: 'EN', activeTrade: { onchainId: 1, ...trade }, roomState: 'PAID', hasOnchainTradeId: true,
    nowMs: NOW, handleChallenge: vi.fn(), handlePingMaker: vi.fn(), confirmFn: () => true, ...extra,
  });

  it('closes the challenge button with an explanation after T+48h', () => {
    const cb = mk({ ...paid, challengePingedAt: ago(49) }, { isMaker: true });
    expect(cb.start_challenge.disabled).toBe(true);
    expect(cb.start_challenge.disabledReasons.join(' ')).toMatch(/Challenge window closed/);
    expect(mk({ ...paid, challengePingedAt: ago(30) }, { isMaker: true }).start_challenge.disabled).toBe(false);
  });

  it('taker ping_maker is disabled with a reason while the ping is valid, enabled after lapse', () => {
    const valid = mk({ ...paid, challengePingedAt: ago(30) });
    expect(valid.ping_maker.disabled).toBe(true);
    expect(valid.ping_maker.disabledReasons.join(' ')).toMatch(/still valid/);
    expect(mk({ ...paid, challengePingedAt: ago(48) }).ping_maker.disabled).toBe(false);
  });

  it('maker must confirm the rule before the first ping, and declining sends nothing', () => {
    const handleChallenge = vi.fn();
    const confirmFn = vi.fn(() => false);
    mk({ paidAt: ago(30) }, { isMaker: true, handleChallenge, confirmFn }).start_challenge.onClick();
    expect(confirmFn.mock.calls[0][0]).toMatch(/lapses/);
    expect(handleChallenge).not.toHaveBeenCalled();
    mk({ paidAt: ago(30) }, { isMaker: true, handleChallenge, confirmFn: () => true }).start_challenge.onClick();
    expect(handleChallenge).toHaveBeenCalledTimes(1);
  });

  it('opening the challenge after pinging needs no confirmation', () => {
    const handleChallenge = vi.fn();
    const confirmFn = vi.fn(() => false);
    mk({ ...paid, challengePingedAt: ago(30) }, { isMaker: true, handleChallenge, confirmFn }).start_challenge.onClick();
    expect(confirmFn).not.toHaveBeenCalled();
    expect(handleChallenge).toHaveBeenCalledTimes(1);
  });
});

describe('K2(B) decision model copy', () => {
  const build = (trade, userRole, lang = 'EN', timers = {}) => buildTradeDecisionModel({
    trade: { id: 't', onchainId: 1, ...trade }, tradeState: 'PAID', userRole, timers, nowMs: NOW,
    isConnected: true, isAuthenticated: true, isSupportedChain: true, isPaused: false, lang,
  });

  it('taker: lapsed ping shows the "you can ping now" message and ping_maker action', () => {
    const model = build({ ...paid, challengePingedAt: ago(49) }, 'taker');
    expect(model.guidance.join(' ')).toMatch(/can now ping the maker/);
    expect(model.secondaryActions[0]).toMatchObject({ key: 'ping_maker' });
    expect(build({ ...paid, challengePingedAt: ago(49) }, 'taker', 'TR').guidance.join(' ')).toMatch(/artık satıcıyı uyarabilirsin/);
  });

  it('taker: valid ping shows the path-closed message, not the lapse message', () => {
    const model = build({ ...paid, challengePingedAt: ago(30) }, 'taker');
    expect(model.guidance.join(' ')).toMatch(/path is closed/);
    expect(model.guidance.join(' ')).not.toMatch(/can now ping/);
  });

  it('taker never gets a challenge action', () => {
    for (const trade of [paid, { ...paid, challengePingedAt: ago(30) }, { ...paid, challengePingedAt: ago(49) }]) {
      expect(build(trade, 'taker').secondaryActions.map((a) => a.key)).not.toContain('start_challenge');
    }
  });

  it('maker: ping rule warning is shown before and after pinging (TR/EN)', () => {
    expect(build(paid, 'maker').guidance.join(' ')).toMatch(/A ping is a claim/);
    expect(build({ ...paid, challengePingedAt: ago(30) }, 'maker', 'TR').guidance.join(' ')).toMatch(/Ping bir iddiadır/);
    expect(build({ ...paid, challengePingedAt: ago(49) }, 'maker').guidance.join(' ')).toMatch(/ping lapsed/);
  });

  it('maker timer cards include both the opening and the deadline countdowns', () => {
    const trade = { ...paid, challengePingedAt: ago(10) };
    const timers = deriveTradeTimeline(trade, { state: 'PAID', now: NOW }).timers;
    const labels = build(trade, 'maker', 'EN', timers).timerCards.map((c) => c.label);
    expect(labels).toContain('Challenge window opens');
    expect(labels).toContain('Challenge deadline');
  });
});

describe('K2(B) errors and ABI', () => {
  it('ChallengeWindowExpired is decodable and translated', () => {
    expect(ARAF_CONTRACT_ERROR_ABI).toContain('error ChallengeWindowExpired()');
    expect(describeContractErrorName('ChallengeWindowExpired', 'TR')).toMatch(/İtiraz süresi doldu/);
    expect(describeContractErrorName('ChallengeWindowExpired', 'EN')).toMatch(/challenge window has closed/);
  });

  it('OnlyMaker tells the taker what to do instead', () => {
    expect(describeContractErrorName('OnlyMaker', 'EN')).toMatch(/taker/i);
    expect(describeContractErrorName('OnlyMaker', 'TR')).toMatch(/alıcı/i);
  });
});
