import { describe, expect, it } from 'vitest';
import { deriveTradeTimeline } from '../../frontend/src/app/contexts/trade-room/tradeTimeline';
import { buildTradeRoomPanelCallbacks } from '../../frontend/src/app/contexts/trade-room/tradeRoomPanelActions';

// [TR] Eşikler ArafEscrow sabitleriyle aynı olmalı; aksi halde UI kontratın revert edeceği çağrıyı önerir.
const NOW = Date.UTC(2026, 8, 29, 12, 0, 0);
const ago = (h) => new Date(NOW - h * 3600 * 1000).toISOString();
const at = (trade, state) => deriveTradeTimeline(trade, { state, now: NOW }).flags;

describe('tradeTimeline mirrors ArafEscrow timing', () => {
  it('PAYMENT_WINDOW: 48h after lock', () => {
    expect(at({ lockedAt: ago(47.9) }, 'LOCKED').paymentWindowExpired).toBe(false);
    expect(at({ lockedAt: ago(48) }, 'LOCKED').paymentWindowExpired).toBe(true);
  });

  it('taker ping after GRACE_PERIOD (48h), auto-release 24h after ping', () => {
    expect(at({ paidAt: ago(47) }, 'PAID').canTakerPing).toBe(false);
    expect(at({ paidAt: ago(48) }, 'PAID').canTakerPing).toBe(true);
    expect(at({ paidAt: ago(60), pingedAt: ago(23) }, 'PAID').canAutoRelease).toBe(false);
    expect(at({ paidAt: ago(60), pingedAt: ago(24) }, 'PAID').canAutoRelease).toBe(true);
  });

  it('maker ping 24h after payment, challenge 24h after ping', () => {
    expect(at({ paidAt: ago(23) }, 'PAID').canMakerPingTaker).toBe(false);
    expect(at({ paidAt: ago(24) }, 'PAID').canMakerPingTaker).toBe(true);
    expect(at({ paidAt: ago(40), challengePingedAt: ago(24) }, 'PAID').canMakerChallenge).toBe(true);
  });

  it('ping paths are exclusive (ConflictingPingPath)', () => {
    expect(at({ paidAt: ago(50), pingedAt: ago(1) }, 'PAID').canMakerPingTaker).toBe(false);
    expect(at({ paidAt: ago(50), challengePingedAt: ago(1) }, 'PAID').canTakerPing).toBe(false);
  });

  it('CHALLENGED: bleeding after 48h, principal after 144h, burn at 240h', () => {
    expect(at({ challengedAt: ago(47) }, 'CHALLENGED').bleedingStarted).toBe(false);
    expect(at({ challengedAt: ago(48) }, 'CHALLENGED').bleedingStarted).toBe(true);
    expect(at({ challengedAt: ago(144) }, 'CHALLENGED').principalDecaying).toBe(true);
    expect(at({ challengedAt: ago(239) }, 'CHALLENGED').canBurn).toBe(false);
    expect(at({ challengedAt: ago(240) }, 'CHALLENGED').canBurn).toBe(true);
  });

  it('panel blocks the maker challenge once the taker has pinged', () => {
    const cb = buildTradeRoomPanelCallbacks({
      lang: 'EN',
      activeTrade: { onchainId: 1, paidAt: new Date(Date.now() - 50 * 3600e3).toISOString(), pingedAt: new Date(Date.now() - 3600e3).toISOString() },
      roomState: 'PAID',
      isMaker: true,
      hasOnchainTradeId: true,
      canMakerStartChallengeFlow: true,
      handleChallenge: () => {},
    });
    expect(cb.start_challenge.disabled).toBe(true);
    expect(cb.start_challenge.disabledReasons.join(' ')).toMatch(/challenge path is closed/);
  });
});
