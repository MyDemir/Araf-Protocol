// [TR] ArafEscrow süre kurallarının saf (pure) aynası. Tüm eşikler kontrattaki sabitlerle birebir aynıdır;
//      butonların aktif/pasif kararı buradan türetilir ki UI kontratın revert edeceği bir çağrıyı önermesin.
// [EN] Pure mirror of ArafEscrow timing rules. Thresholds match the contract constants exactly so the UI
//      never offers a call the contract would revert.
//
//   PAYMENT_WINDOW   48h  LOCKED  → expirePaymentWindow (either party)          lockedAt + 48h
//   GRACE_PERIOD     48h  PAID    → pingMaker (taker)                           paidAt + 48h
//   maker ping       24h  PAID    → pingTakerForChallenge (maker)               paidAt + 24h
//   response window  24h  PAID    → autoRelease / challengeTrade                pingedAt|challengePingedAt + 24h
//   challenge window 24h  PAID    → challengeTrade only in [T+24h, T+48h), T = challengePingedAt
//                                    (T+48h and later: ChallengeWindowExpired; the maker ping lapses)
//   ping paths are exclusive while a ping is valid: ConflictingPingPath. A lapsed maker ping (t >= T+48h)
//   re-opens the taker's pingMaker (still needs paidAt + GRACE_PERIOD), then +24h autoRelease.
//   bleeding starts  48h  CHALLENGED bonds decay after challengedAt + GRACE_PERIOD
//   USDT_DECAY_START 96h  principal decays after challengedAt + 48h + 96h
//   MAX_BLEEDING    240h  CHALLENGED → burnExpired (anyone)                     challengedAt + 240h

const H = 3600 * 1000;
export const TRADE_TIMING = Object.freeze({
  PAYMENT_WINDOW_MS: 48 * H,
  GRACE_PERIOD_MS: 48 * H,
  MAKER_CHALLENGE_PING_MS: 24 * H,
  MAKER_CHALLENGE_WINDOW_MS: 24 * H, // contract MAKER_CHALLENGE_WINDOW()
  PING_RESPONSE_MS: 24 * H,
  PRINCIPAL_PROTECTION_MS: (48 + 96) * H,
  MAX_BLEEDING_MS: 240 * H,
});

const toMs = (value) => {
  if (value === null || value === undefined || value === '' || value === 0 || value === '0') return null;
  if (typeof value === 'number') return value < 1e12 ? value * 1000 : value; // unix seconds or ms
  const ms = new Date(value).getTime();
  return Number.isFinite(ms) ? ms : null;
};

export const countdownTo = (endMs, nowMs = Date.now()) => {
  if (endMs === null || endMs === undefined) return null;
  const left = endMs - nowMs;
  if (left <= 0) return { isFinished: true, days: 0, hours: 0, minutes: 0, seconds: 0 };
  const sec = Math.floor(left / 1000);
  return {
    isFinished: false,
    days: Math.floor(sec / 86400),
    hours: Math.floor((sec % 86400) / 3600),
    minutes: Math.floor((sec % 3600) / 60),
    seconds: sec % 60,
  };
};

export function deriveTradeTimeline(trade, { state = trade?.state, now = Date.now() } = {}) {
  const nowMs = typeof now === 'number' ? now : new Date(now).getTime();
  const lockedAt = toMs(trade?.lockedAt);
  const paidAt = toMs(trade?.paidAt);
  const pingedAt = toMs(trade?.pingedAt);
  const challengePingedAt = toMs(trade?.challengePingedAt);
  const challengedAt = toMs(trade?.challengedAt);
  const passed = (at, span) => at !== null && nowMs >= at + span;

  const takerPinged = pingedAt !== null;
  const makerPinged = challengePingedAt !== null;

  // [TR] Ping düştü: maker ping'i attı, T+24h+MAKER_CHALLENGE_WINDOW geçti, taker uyarmadı (kontrat formülü).
  // [EN] Ping lapsed: maker pinged, T+24h+MAKER_CHALLENGE_WINDOW passed, taker has not pinged (contract formula).
  const challengeDeadlineSpan = TRADE_TIMING.PING_RESPONSE_MS + TRADE_TIMING.MAKER_CHALLENGE_WINDOW_MS;
  const pingLapsed = state === 'PAID' && makerPinged && !takerPinged && passed(challengePingedAt, challengeDeadlineSpan);
  const makerChallengeOpen = state === 'PAID' && makerPinged && passed(challengePingedAt, TRADE_TIMING.PING_RESPONSE_MS) && !passed(challengePingedAt, challengeDeadlineSpan);

  const flags = {
    takerPinged,
    makerPinged,
    pingLapsed,
    paymentWindowExpired: state === 'LOCKED' && passed(lockedAt, TRADE_TIMING.PAYMENT_WINDOW_MS),
    canTakerPing: state === 'PAID' && !takerPinged && passed(paidAt, TRADE_TIMING.GRACE_PERIOD_MS) && (!makerPinged || pingLapsed),
    canAutoRelease: state === 'PAID' && takerPinged && passed(pingedAt, TRADE_TIMING.PING_RESPONSE_MS),
    canMakerPingTaker: state === 'PAID' && !makerPinged && !takerPinged && passed(paidAt, TRADE_TIMING.MAKER_CHALLENGE_PING_MS),
    canMakerChallenge: makerChallengeOpen,
    makerChallengeWindowClosed: pingLapsed,
    canBurn: state === 'CHALLENGED' && passed(challengedAt, TRADE_TIMING.MAX_BLEEDING_MS),
    bleedingStarted: state === 'CHALLENGED' && passed(challengedAt, TRADE_TIMING.GRACE_PERIOD_MS),
    principalDecaying: state === 'CHALLENGED' && passed(challengedAt, TRADE_TIMING.PRINCIPAL_PROTECTION_MS),
  };

  const at = (base, span) => (base === null ? null : base + span);
  const timers = {
    paymentWindow: countdownTo(at(lockedAt, TRADE_TIMING.PAYMENT_WINDOW_MS), nowMs),
    gracePeriod: countdownTo(at(paidAt, TRADE_TIMING.GRACE_PERIOD_MS), nowMs),
    // [TR] Uyarı öncesi taker'ın sayacı gracePeriod'dur; makerPing yalnız uyarı sonrası yanıt penceresidir.
    makerPing: countdownTo(at(pingedAt, TRADE_TIMING.PING_RESPONSE_MS), nowMs),
    makerChallengePing: countdownTo(at(paidAt, TRADE_TIMING.MAKER_CHALLENGE_PING_MS), nowMs),
    makerChallenge: countdownTo(at(challengePingedAt, TRADE_TIMING.PING_RESPONSE_MS), nowMs),
    makerChallengeDeadline: countdownTo(at(challengePingedAt, challengeDeadlineSpan), nowMs),
    bleeding: countdownTo(at(challengedAt, TRADE_TIMING.MAX_BLEEDING_MS), nowMs),
    principalProtection: countdownTo(at(challengedAt, TRADE_TIMING.PRINCIPAL_PROTECTION_MS), nowMs),
  };

  return { flags, timers };
}

// [TR] ArafEscrow._calculateCurrentAmounts'un aynası (yalnız önizleme/lab içindir; otorite kontrattır).
// [EN] Mirror of ArafEscrow._calculateCurrentAmounts (preview/lab only; the contract is authoritative).
const BPS = 10000n;
const SEC_PER_H = 3600n;
export function estimateBleeding({ cryptoAmountRaw, makerBondRaw, takerBondRaw, challengedAt }, now = Date.now()) {
  const start = toMs(challengedAt);
  if (start === null) return null;
  const big = (v) => { try { return BigInt(v ?? 0); } catch { return 0n; } };
  const crypto = big(cryptoAmountRaw); const makerBond = big(makerBondRaw); const takerBond = big(takerBondRaw);
  let elapsed = BigInt(Math.max(0, Math.floor((now - start) / 1000)));
  const maxBleed = BigInt(TRADE_TIMING.MAX_BLEEDING_MS / 1000);
  if (elapsed > maxBleed) elapsed = maxBleed;
  const grace = BigInt(TRADE_TIMING.GRACE_PERIOD_MS / 1000);
  const bleed = elapsed > grace ? elapsed - grace : 0n;
  const min = (a, b) => (a < b ? a : b);
  const makerDecayed = min(makerBond, (makerBond * 26n * bleed) / (BPS * SEC_PER_H));
  const takerDecayed = min(takerBond, (takerBond * 42n * bleed) / (BPS * SEC_PER_H));
  const usdtStart = 96n * 3600n;
  const cryptoDecayed = bleed > usdtStart ? min(crypto, (crypto * 34n * 2n * (bleed - usdtStart)) / (BPS * SEC_PER_H)) : 0n;
  // Same keys as normalizeCurrentAmounts (useArafContract) so the UI treats both sources alike.
  return {
    currentCrypto: crypto - cryptoDecayed,
    currentMakerBond: makerBond - makerDecayed,
    currentTakerBond: takerBond - takerDecayed,
    makerBondRemaining: makerBond - makerDecayed,
    takerBondRemaining: takerBond - takerDecayed,
    totalDecayed: makerDecayed + takerDecayed + cryptoDecayed,
  };
}

export default deriveTradeTimeline;
