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
  handleRevokeCancel,
  handleBurnExpired,
  handleExpirePaymentWindow,
  paymentWindowExpired = false,
  nowMs = Date.now(),
  showToast,
  confirmFn = typeof window !== 'undefined' && typeof window.confirm === 'function' ? window.confirm.bind(window) : null,
}) => {
  const tr = lang === 'TR';
  // [TR] window.confirm yoksa aksiyon sessizce çıkmaz; kullanıcıya bildirilir ve işlem yapılmaz (fail-closed).
  // [EN] A missing confirm no longer exits silently: the user is told and the action does not run (fail-closed).
  const askConfirm = (message) => {
    if (typeof confirmFn !== 'function') {
      if (typeof showToast === 'function') showToast(tr
        ? 'Bu tarayıcıda onay penceresi kullanılamıyor. Lütfen işlemi standart bir tarayıcıdan yapın.'
        : 'Confirmation dialogs are unavailable in this browser. Please use a standard browser to continue.', 'error');
      return false;
    }
    return Boolean(confirmFn(message));
  };
  // [TR] Aktif/pasif kararı kontratın süre kurallarının saf aynasından gelir (tradeTimeline.js).
  //      paidAt yoksa (eski/eksik veri) çağıranın verdiği bayraklara düşülür.
  // [EN] Enablement mirrors contract timing rules; falls back to caller flags when paidAt is unknown.
  const { flags } = deriveTradeTimeline(activeTrade, { state: roomState, now: nowMs });
  const hasPaidAt = Boolean(activeTrade?.paidAt);
  const takerPinged = flags.takerPinged;
  const makerPinged = flags.makerPinged;

  let makerChallengeBlocked;
  let makerChallengeReason = null;
  if (takerPinged) {
    // Contract: ConflictingPingPath — the taker already opened the auto-release path.
    makerChallengeBlocked = true;
    makerChallengeReason = tr ? 'Alıcı sizi zaten uyardı; itiraz yolu kapandı. Ödemeyi kontrol edip onaylayın.' : 'The taker already pinged you; the challenge path is closed. Check the payment and release.';
  } else if (flags.makerChallengeWindowClosed) {
    // Contract: ChallengeWindowExpired — T+48h passed; the ping lapsed and the taker's pingMaker path is open.
    makerChallengeBlocked = true;
    makerChallengeReason = tr
      ? 'İtiraz süresi doldu: ping düştü. Artık itiraz açamazsınız; ödeme geldiyse fonları serbest bırakabilirsiniz.'
      : 'Challenge window closed: your ping lapsed. You can no longer open a challenge; you can still release the funds.';
  } else if (makerPinged || activeTrade?.challengePingedAt) {
    makerChallengeBlocked = hasPaidAt ? !flags.canMakerChallenge : !canMakerChallenge;
    if (makerChallengeBlocked) makerChallengeReason = tr ? 'İtiraz için uyarıdan sonra 24 saat bekleyin.' : 'Wait 24h after your ping to challenge.';
  } else {
    makerChallengeBlocked = hasPaidAt ? !flags.canMakerPingTaker : !canMakerStartChallengeFlow;
    if (makerChallengeBlocked) makerChallengeReason = tr ? 'Alıcıyı uyarmak için ödeme bildiriminden sonra 24 saat bekleyin.' : 'Wait 24h after the payment report to ping the taker.';
  }

  let pingReason = null;
  if (makerPinged && !flags.pingLapsed) pingReason = tr
    ? 'Satıcının ping\'i geçerli: uyarı yolu şimdilik kapalı. Satıcı 48. saate kadar itiraz açmazsa ping düşer ve bu yol açılır.'
    : 'The maker\'s ping is still valid, so the ping path is closed for now. If the maker does not challenge in time the ping lapses and this path opens.';
  else if (takerPinged) pingReason = tr ? 'Satıcıyı zaten uyardınız.' : 'You already pinged the maker.';
  else if (!flags.canTakerPing) pingReason = tr ? 'Satıcıyı uyarmak için ödeme bildiriminden sonra 48 saat bekleyin.' : 'Wait 48h after reporting payment to ping the maker.';
  const autoReleaseReason = !takerPinged
    ? (tr ? 'Önce satıcıyı uyarın; 24 saat sonra otomatik serbest bırakma açılır.' : 'Ping the maker first; auto-release opens 24h later.')
    : (tr ? 'Otomatik serbest bırakma için uyarıdan sonra 24 saat bekleyin.' : 'Wait 24h after your ping to auto-release.');

  const withGuard = (onClick, options = {}) => panelActionConfig(onClick, { ...options, hasOnchainTradeId, missingOnchainIdReason });

  return {
    // [TR] K10: kontrat lockedAt + 48s sonrası reportPayment'ı PaymentWindowClosed ile reddeder; buton kapanır.
    // [EN] K10: the contract rejects reportPayment after lockedAt + 48h (PaymentWindowClosed); the button closes.
    report_payment: withGuard(handleReportPayment, {
      disabled: isContractLoading || (roomState === 'LOCKED' && paymentWindowExpired),
      disabledReasons: roomState === 'LOCKED' && paymentWindowExpired
        ? [tr ? 'Süre doldu: 48 saatlik ödeme süresi bitti, ödeme artık bildirilemez.' : 'Time expired: the 48h payment window is over; payment can no longer be reported.']
        : [],
    }),
    release_funds: withGuard(handleRelease, {
      disabled: isContractLoading || (isMaker && roomState === 'PAID' && !chargebackAccepted),
      disabledReasons: isMaker && roomState === 'PAID' && !chargebackAccepted
        ? [lang === 'TR' ? 'Chargeback onayı gerekli.' : 'Chargeback acknowledgement is required.']
        : [],
    }),
    start_challenge: withGuard(() => {
      // [TR] Ping atmadan önce kuralı anlatan onay: ping bir iddiadır, 24 saatlik pencere kaçarsa düşer.
      // [EN] Before pinging, confirm the rule: a ping is a claim and lapses if the 24h window is missed.
      if (!makerPinged && !activeTrade?.challengePingedAt && !askConfirm(tr
        ? 'Ping bir iddiadır: ping attıktan 24 saat sonra, sonraki 24 saat içinde itiraz açmazsan ping düşer ve alıcı ödemeyi otomatik serbest bırakma yoluna geçebilir. Ödeme gelmediyse devam et. Onaylıyor musunuz?'
        : 'A ping is a claim: if you do not open a challenge in the 24h window that starts 24h after your ping, the ping lapses and the buyer may move to the auto-release path. Continue only if the payment did not arrive. Confirm?')) return undefined;
      return handleChallenge();
    }, {
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
      if (askConfirm(msg)) handleProposeCancel();
    }, { disabled: isContractLoading }),
    revoke_cancel: withGuard(() => handleRevokeCancel?.(), { disabled: isContractLoading || typeof handleRevokeCancel !== 'function' }),
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
