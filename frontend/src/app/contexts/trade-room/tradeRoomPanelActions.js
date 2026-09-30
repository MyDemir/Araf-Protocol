import { deriveTradeTimeline } from './tradeTimeline';

const panelActionConfig = (onClick, { disabled = false, disabledReasons = [], hasOnchainTradeId, missingOnchainIdReason } = {}) => ({
  onClick,
  disabled: disabled || !hasOnchainTradeId,
  disabledReasons: [
    ...(!hasOnchainTradeId ? [missingOnchainIdReason] : []),
    ...disabledReasons,
  ],
});

// [TR] Kontrat MAX_BLEEDING = 240 saat: CHALLENGED trade bu süre sonunda herkes tarafından yakılabilir.
export const getBurnExpiredDeadlinePassed = ({ activeTrade, roomState, now = new Date() }) => Boolean(
  activeTrade?.onchainId && deriveTradeTimeline(activeTrade, { state: roomState, now: now.getTime() }).flags.canBurn
);

// [TR] Kontrat PAYMENT_WINDOW = 48 saat: LOCKED trade'de taker bu sürede ödeme bildirmezse kilit çözülebilir.
// [EN] Contract PAYMENT_WINDOW = 48h: a LOCKED trade can be unwound if the taker has not reported payment by then.
export const getPaymentWindowExpired = ({ activeTrade, roomState, now = new Date() }) => Boolean(
  activeTrade?.onchainId && deriveTradeTimeline(activeTrade, { state: roomState, now: now.getTime() }).flags.paymentWindowExpired
);

export const buildTradeRoomPanelCallbacks = ({
  lang = 'EN',
  activeTrade,
  roomState,
  isMaker,
  isContractLoading,
  chargebackAccepted,
  hasOnchainTradeId,
  missingOnchainIdReason,
  canMakerChallenge,
  canMakerStartChallengeFlow,
  burnExpiredDeadlinePassed,
  handleReportPayment,
  handleRelease,
  handleChallenge,
  handlePingMaker,
  handleAutoRelease,
  handleProposeCancel,
  handleBurnExpired,
  handleExpirePaymentWindow,
  paymentWindowExpired = false,
  confirmFn = typeof window !== 'undefined' ? window.confirm.bind(window) : () => false,
}) => {
  const tr = lang === 'TR';
  // [TR] Aktif/pasif kararı kontratın süre kurallarının saf aynasından gelir (tradeTimeline.js).
  //      paidAt yoksa (eski/eksik veri) çağıranın verdiği bayraklara düşülür.
  // [EN] Enablement mirrors contract timing rules; falls back to caller flags when paidAt is unknown.
  const { flags } = deriveTradeTimeline(activeTrade, { state: roomState });
  const hasPaidAt = Boolean(activeTrade?.paidAt);
  const takerPinged = flags.takerPinged;
  const makerPinged = flags.makerPinged;

  let makerChallengeBlocked;
  let makerChallengeReason = null;
  if (takerPinged) {
    // Contract: ConflictingPingPath — the taker already opened the auto-release path.
    makerChallengeBlocked = true;
    makerChallengeReason = tr ? 'Alıcı sizi zaten uyardı; itiraz yolu kapandı. Ödemeyi kontrol edip onaylayın.' : 'The taker already pinged you; the challenge path is closed. Check the payment and release.';
  } else if (makerPinged || activeTrade?.challengePingedAt) {
    makerChallengeBlocked = hasPaidAt ? !flags.canMakerChallenge : !canMakerChallenge;
    if (makerChallengeBlocked) makerChallengeReason = tr ? 'İtiraz için uyarıdan sonra 24 saat bekleyin.' : 'Wait 24h after your ping to challenge.';
  } else {
    makerChallengeBlocked = hasPaidAt ? !flags.canMakerPingTaker : !canMakerStartChallengeFlow;
    if (makerChallengeBlocked) makerChallengeReason = tr ? 'Alıcıyı uyarmak için ödeme bildiriminden sonra 24 saat bekleyin.' : 'Wait 24h after the payment report to ping the taker.';
  }

  let pingReason = null;
  if (makerPinged) pingReason = tr ? 'Satıcı itiraz yolunu başlattı; uyarı yolu kapandı.' : 'The maker started the challenge path; the ping path is closed.';
  else if (takerPinged) pingReason = tr ? 'Satıcıyı zaten uyardınız.' : 'You already pinged the maker.';
  else if (!flags.canTakerPing) pingReason = tr ? 'Satıcıyı uyarmak için ödeme bildiriminden sonra 48 saat bekleyin.' : 'Wait 48h after reporting payment to ping the maker.';
  const autoReleaseReason = !takerPinged
    ? (tr ? 'Önce satıcıyı uyarın; 24 saat sonra otomatik serbest bırakma açılır.' : 'Ping the maker first; auto-release opens 24h later.')
    : (tr ? 'Otomatik serbest bırakma için uyarıdan sonra 24 saat bekleyin.' : 'Wait 24h after your ping to auto-release.');

  const withGuard = (onClick, options = {}) => panelActionConfig(onClick, { ...options, hasOnchainTradeId, missingOnchainIdReason });

  return {
    report_payment: withGuard(handleReportPayment, { disabled: isContractLoading }),
    release_funds: withGuard(handleRelease, {
      disabled: isContractLoading || (isMaker && roomState === 'PAID' && !chargebackAccepted),
      disabledReasons: isMaker && roomState === 'PAID' && !chargebackAccepted
        ? [lang === 'TR' ? 'Chargeback onayı gerekli.' : 'Chargeback acknowledgement is required.']
        : [],
    }),
    start_challenge: withGuard(handleChallenge, {
      disabled: isContractLoading || makerChallengeBlocked,
      disabledReasons: makerChallengeBlocked && makerChallengeReason ? [makerChallengeReason] : [],
    }),
    ping_maker: withGuard(() => handlePingMaker(activeTrade.onchainId), {
      disabled: isContractLoading || !flags.canTakerPing,
      disabledReasons: !flags.canTakerPing ? [pingReason] : [],
    }),
    auto_release: withGuard(() => handleAutoRelease(activeTrade.onchainId), {
      disabled: isContractLoading || !flags.canAutoRelease,
      disabledReasons: !flags.canAutoRelease ? [autoReleaseReason] : [],
    }),
    propose_cancel: withGuard(() => {
      const msg = roomState === 'LOCKED'
        ? (lang === 'TR' ? 'LOCKED aşamasında (henüz ödeme bildirilmeden) iptaller kesintisizdir. Onaylıyor musunuz?' : 'Cancel in LOCKED state has zero fees. Confirm?')
        : (lang === 'TR' ? 'Karşılıklı iptal durumunda standart protokol ücreti kesilecektir. Onaylıyor musunuz?' : 'Standard protocol fees will be deducted upon mutual cancellation. Confirm?');
      if (confirmFn(msg)) handleProposeCancel();
    }, { disabled: isContractLoading }),
    ...(typeof handleExpirePaymentWindow === 'function' ? {
      expire_payment_window: withGuard(handleExpirePaymentWindow, {
        disabled: isContractLoading || !paymentWindowExpired,
        disabledReasons: !paymentWindowExpired ? [lang === 'TR' ? '48 saatlik ödeme süresi dolmadı.' : 'The 48h payment window has not passed.'] : [],
      }),
    } : {}),
    burn_expired: withGuard(handleBurnExpired, {
      disabled: isContractLoading || !burnExpiredDeadlinePassed,
      disabledReasons: !burnExpiredDeadlinePassed ? [lang === 'TR' ? '10 günlük yakma süresi henüz dolmadı.' : '10-day burn deadline has not passed.'] : [],
    }),
  };
};
