import { getTradeTerm } from '../../copy/tradeTerms';

const labels = {
  state: {
    LOCKED: { TR: 'Kilitli', EN: 'Locked' },
    PAID: { TR: 'Ödeme Bildirildi', EN: 'Payment Reported' },
    CHALLENGED: { TR: 'İtiraz Süreci', EN: 'Challenge Phase' },
    RESOLVED: { TR: 'Tamamlandı', EN: 'Completed' },
    CANCELED: { TR: 'İptal Edildi', EN: 'Canceled' },
    BURNED: { TR: 'Yakıldı', EN: 'Burned' },
  },
  role: {
    taker: { TR: 'Alıcı', EN: 'Taker' },
    maker: { TR: 'Satıcı', EN: 'Maker' },
  },
};

const timerLabels = {
  paymentWindow: { TR: 'Ödeme süresi', EN: 'Payment window' },
  gracePeriod: { TR: getTradeTerm('gracePeriod', 'TR'), EN: getTradeTerm('gracePeriod', 'EN') },
  makerPing: { TR: 'Satıcı uyarı penceresi', EN: 'Maker ping window' },
  makerChallengePing: { TR: 'Alıcı uyarı penceresi', EN: 'Buyer ping window' },
  makerChallenge: { TR: 'İtiraz penceresi', EN: 'Challenge window' },
  bleeding: { TR: getTradeTerm('bleedingEscrow', 'TR'), EN: getTradeTerm('bleedingEscrow', 'EN') },
  principalProtection: { TR: 'Ana para koruması', EN: 'Principal protection' },
};

const t = (lang, tr, en) => (lang === 'TR' ? tr : en);
const pickLocale = (lang) => (lang === 'TR' ? 'TR' : 'EN');

const formatTimerValue = (timer, lang) => {
  if (!timer || typeof timer !== 'object') return null;
  if (timer.isFinished) return t(lang, 'Süre doldu', 'Elapsed');

  const parts = [];
  if (Number.isFinite(Number(timer.days)) && Number(timer.days) > 0) parts.push(`${Number(timer.days)}d`);
  if (Number.isFinite(Number(timer.hours))) parts.push(`${String(Number(timer.hours)).padStart(2, '0')}h`);
  if (Number.isFinite(Number(timer.minutes))) parts.push(`${String(Number(timer.minutes)).padStart(2, '0')}m`);
  if (Number.isFinite(Number(timer.seconds))) parts.push(`${String(Number(timer.seconds)).padStart(2, '0')}s`);

  return parts.length ? parts.join(' ') : null;
};

// [TR] Her durumda yalnız o anda karar etkileyen sayaçlar gösterilir; diğerleri gürültüdür.
// [EN] Only timers that affect a decision in the current state/role are shown; the rest is noise.
const RELEVANT_TIMERS = {
  LOCKED: { taker: ['paymentWindow'], maker: ['paymentWindow'] },
  PAID: { taker: ['gracePeriod', 'makerPing'], maker: ['gracePeriod', 'makerChallengePing', 'makerChallenge'] },
  CHALLENGED: { taker: ['bleeding', 'principalProtection'], maker: ['bleeding', 'principalProtection'] },
};

const buildTimerCards = (timers = {}, lang = 'EN', state = null, role = 'taker') => {
  if (!timers || typeof timers !== 'object') return [];
  const allowed = RELEVANT_TIMERS[state]?.[role] || null;
  return Object.entries(timers)
    .filter(([key]) => !allowed || allowed.includes(key))
    .map(([key, timer]) => {
      const summary = formatTimerValue(timer, lang);
      if (!summary) return null;
      return {
        key,
        label: timerLabels[key]?.[pickLocale(lang)] || key,
        summary,
        finished: Boolean(timer.isFinished),
      };
    })
    .filter(Boolean);
};

const action = (type, key, label, description, extra = {}) => ({ type, key, label, description, ...extra });

const decisionCopy = {
  LOCKED: {
    taker: {
      headline: { TR: 'Ödeme kanıtı bekleniyor', EN: 'Payment proof is needed' },
      subheadline: { TR: 'Ödemeyi yapın, dekontu yükleyin ve bildirin.', EN: 'Pay, upload the receipt and report it.' },
      nowLabel: { TR: 'Şimdi', EN: 'Now' },
      nowDescription: { TR: 'Dekontu yükleyin ve ödeme bildirimi aksiyonunu kullanın. Frontend sizi yönlendirir; kontrat durumu belirler.', EN: 'Upload payment proof and use the report payment action. The frontend guides you; the contract state remains authoritative.' },
      nextLabel: { TR: 'Süre devam ederse', EN: 'If time continues' },
      nextDescription: { TR: 'Ödeme bildirilmezse işlem kilitli kalır ve mevcut süreler sonraki kontrat seçeneklerini belirler.', EN: 'If payment is not reported, the trade remains locked and the existing timers determine the next contract options.' },
    },
    maker: {
      headline: { TR: 'Alıcının ödeme bildirimi bekleniyor', EN: 'Waiting for the buyer to report payment' },
      subheadline: { TR: 'Fonlar kilitli; alıcının ödemesini bekleyin.', EN: 'Funds are locked; wait for the buyer to pay.' },
      nowLabel: { TR: 'Şimdi', EN: 'Now' },
      nowDescription: { TR: 'Ödeme bildirimi gelene kadar kontrat aksiyonu bekleme durumundadır.', EN: 'Contract actions remain in a waiting state until payment is reported.' },
      nextLabel: { TR: 'Süre devam ederse', EN: 'If time continues' },
      nextDescription: { TR: 'Ödeme bildirimi yapılırsa ödeme kontrolü aşamasına geçersiniz; yapılmazsa mevcut süreler sonraki seçenekleri belirler.', EN: 'If payment is reported, you move to payment review; otherwise existing timers determine the next options.' },
    },
  },
  PAID: {
    maker: {
      headline: { TR: 'Ödeme bildirildi; kontrol sizde', EN: 'Payment was reported; review it now' },
      subheadline: { TR: 'Hesabınızda tutarı ve gönderen adını kontrol edin.', EN: 'Check the amount and sender name in your account.' },
      nowLabel: { TR: 'Şimdi', EN: 'Now' },
      nowDescription: { TR: 'Ödemeyi doğruladıysanız fonları serbest bırakın. Ödeme yoksa mevcut itiraz akışını başlatabilirsiniz.', EN: 'If payment checks out, release the funds. If it did not arrive, you can start the existing challenge flow.' },
      nextLabel: { TR: 'Risk sürerse', EN: 'If risk continues' },
      nextDescription: { TR: 'Yanıt verilmezse zamanlayıcılar alıcının uyarı ve otomatik serbest bırakma yollarını etkileyebilir. Araf hakem değildir.', EN: 'If there is no response, timers may affect the buyer ping and auto-release paths. Araf is not an arbitrator.' },
    },
    taker: {
      headline: { TR: 'Ödeme bildirildi; satıcı onayı bekleniyor', EN: 'Payment reported; waiting for maker review' },
      subheadline: { TR: 'Satıcı ödemeyi doğrulayıp fonları gönderecek.', EN: 'The maker will verify and release the funds.' },
      nowLabel: { TR: 'Şimdi', EN: 'Now' },
      nowDescription: { TR: 'Kanıt ve işlem detaylarını hazır tutun. Gerekli süreler dolunca mevcut uyarı veya otomatik serbest bırakma seçenekleri kullanılabilir.', EN: 'Keep proof and trade details ready. When required timers expire, existing ping or auto-release options may become available.' },
      nextLabel: { TR: 'Süre devam ederse', EN: 'If time continues' },
      nextDescription: { TR: 'Satıcı pasif kalırsa zamanlayıcılar uyarı ve otomatik serbest bırakma yollarını belirler; frontend sadece bu yolları gösterir.', EN: 'If the maker remains inactive, timers determine the ping and auto-release paths; the frontend only presents those paths.' },
    },
  },
  CHALLENGED: {
    maker: {
      headline: { TR: 'İtiraz süreci başladı', EN: 'Challenge phase is active' },
      subheadline: { TR: 'Araf karar vermez; süre uzadıkça teminatlar erir. Uzlaşın veya onaylayın.', EN: 'Araf does not decide; bonds bleed over time. Settle or release.' },
      nowLabel: { TR: 'Şimdi', EN: 'Now' },
      nowDescription: { TR: 'Mevcut settlement kartındaki taraf aksiyonlarını takip edin. Kontrat ve taraf imzaları otoritedir.', EN: 'Follow party actions in the existing settlement card. The contract and party signatures remain authoritative.' },
      nextLabel: { TR: 'Süre / risk devam ederse', EN: 'If time or risk continues' },
      nextDescription: { TR: 'Uzlaşma olmazsa süre dolumu ve yakım bilgileri mevcut panellerde kalır; Araf hakemlik yapmaz.', EN: 'If settlement does not happen, expiry and burn information remains in the existing panels; Araf does not arbitrate.' },
    },
    taker: {
      headline: { TR: 'İtiraz süreci başladı', EN: 'Challenge phase is active' },
      subheadline: { TR: 'Araf karar vermez; süre uzadıkça teminatlar erir. Uzlaşın veya onaylayın.', EN: 'Araf does not decide; bonds bleed over time. Settle or release.' },
      nowLabel: { TR: 'Şimdi', EN: 'Now' },
      nowDescription: { TR: 'Mevcut settlement kartındaki taraf aksiyonlarını takip edin. Kontrat ve taraf imzaları otoritedir.', EN: 'Follow party actions in the existing settlement card. The contract and party signatures remain authoritative.' },
      nextLabel: { TR: 'Süre / risk devam ederse', EN: 'If time or risk continues' },
      nextDescription: { TR: 'Uzlaşma olmazsa süre dolumu ve yakım bilgileri mevcut panellerde kalır; Araf hakemlik yapmaz.', EN: 'If settlement does not happen, expiry and burn information remains in the existing panels; Araf does not arbitrate.' },
    },
  },
};

// [TR] Kapanmış işlemler: kontrat son sözü söyledi; odada yapılacak aksiyon yoktur.
// [EN] Closed trades: the contract has settled it; there is nothing left to do in the room.
const terminalCopy = {
  RESOLVED: { headline: { TR: 'İşlem tamamlandı', EN: 'Trade completed' }, subheadline: { TR: 'Fonlar kontrat tarafından dağıtıldı.', EN: 'Funds were distributed by the contract.' } },
  CANCELED: { headline: { TR: 'İşlem iptal edildi', EN: 'Trade canceled' }, subheadline: { TR: 'Kilit çözüldü; fonlar kontrat kurallarına göre iade edildi.', EN: 'The lock was released; funds were returned under contract rules.' } },
  BURNED: { headline: { TR: 'İşlem yakıldı', EN: 'Trade burned' }, subheadline: { TR: '240 saatlik süre dolduğu için kalan değer yakıldı.', EN: 'The 240h window ran out, so the remaining value was burned.' } },
};
export const TERMINAL_TRADE_STATES = Object.freeze(['RESOLVED', 'CANCELED', 'BURNED']);

const localizeDecisionCopy = (copy, lang) => ({
  headline: copy?.headline?.[pickLocale(lang)] || t(lang, 'İşlem durumu güncellendi', 'Trade status updated'),
  subheadline: copy?.subheadline?.[pickLocale(lang)] || t(lang, 'Mevcut işlem durumuna göre bir sonraki adımı izleyin.', 'Follow the next step for the current trade state.'),
  nowLabel: copy?.nowLabel?.[pickLocale(lang)] || t(lang, 'Şimdi', 'Now'),
  nowDescription: copy?.nowDescription?.[pickLocale(lang)] || t(lang, 'Frontend rehberlik eder; kontrat otoritedir.', 'The frontend guides you; the contract remains authoritative.'),
  nextLabel: copy?.nextLabel?.[pickLocale(lang)] || t(lang, 'Sonraki adım', 'Next'),
  nextDescription: copy?.nextDescription?.[pickLocale(lang)] || t(lang, 'Mevcut süreler ve kontrat kuralları sonraki seçenekleri belirler.', 'Existing timers and contract rules determine the next options.'),
});

const buildDecisionSummary = (state, role, lang) => localizeDecisionCopy(terminalCopy[state] || decisionCopy[state]?.[role] || decisionCopy[state]?.taker, lang);

export function buildTradeDecisionModel({
  trade,
  tradeState,
  userRole,
  paymentIpfsHash,
  timers,
  isConnected,
  isAuthenticated,
  isSupportedChain,
  isPaused,
  lang = 'EN',
  canBurnExpired = false,
  paymentWindowExpired = false,
  cancelStatus = null,
}) {
  const normalizedState = String(tradeState || trade?.state || 'LOCKED').toUpperCase();
  const normalizedRole = String(userRole || 'taker').toLowerCase();

  const globalDisabledReasons = [];
  if (!isConnected) globalDisabledReasons.push(t(lang, 'Cüzdan bağlı değil.', 'Wallet not connected.'));
  if (!isAuthenticated) globalDisabledReasons.push(t(lang, 'Oturum doğrulanmamış.', 'Session is not authenticated.'));
  if (!isSupportedChain) globalDisabledReasons.push(t(lang, 'Desteklenmeyen ağ.', 'Unsupported network.'));
  if (isPaused) globalDisabledReasons.push(t(lang, 'Sistem bakım modunda.', 'System is in maintenance mode.'));

  const primaryDisabledReasons = [...globalDisabledReasons];

  let primaryAction = action('waiting', 'waiting', t(lang, 'Bekle', 'Wait'), t(lang, 'Bir sonraki kontrat aksiyonu mevcut durum tarafından belirlenir.', 'Next contract action is determined by the current state.'));
  let secondaryActions = [];
  const guidance = [];

  if (normalizedState === 'LOCKED' && normalizedRole === 'taker') {
    primaryAction = action(
      'contract',
      'report_payment',
      t(lang, 'Ödemeyi Bildir', 'Report Payment'),
      null,
      {
        requiresPaymentProof: !paymentIpfsHash,
      },
    );
    if (!paymentIpfsHash) primaryDisabledReasons.push(t(lang, 'Dekont gerekli.', 'Payment proof is required.'));
  }

  if (normalizedState === 'LOCKED' && normalizedRole === 'maker') {
    primaryAction = action('waiting', 'waiting_payment_notification', t(lang, 'Ödeme bekleniyor', 'Waiting for payment'), null);
  }

  if (normalizedState === 'PAID' && normalizedRole === 'maker') {
    primaryAction = action('contract', 'release_funds', t(lang, 'Ödemeyi Onayla', 'Release Funds'), trade?.pingedAt
      ? t(lang, 'Alıcı sizi uyardı: 24 saat içinde onaylamazsanız alıcı fonları otomatik serbest bırakabilir.', 'The taker pinged you: if you do not release within 24h, the taker can auto-release.')
      : null);
    // [TR] Aynı buton iki kontrat adımıdır: önce pingTakerForChallenge, 24 saat sonra challengeTrade.
    const makerPinged = Boolean(trade?.challengePingedAt);
    secondaryActions = [action('contract', 'start_challenge', makerPinged
      ? t(lang, 'İtiraz Başlat', 'Open Challenge')
      : t(lang, 'Ödeme Gelmedi — Alıcıyı Uyar', 'Payment Not Received — Ping Taker'), null)];
  }

  if (normalizedState === 'PAID' && normalizedRole === 'taker') {
    primaryAction = action('waiting', 'waiting_for_maker', t(lang, 'Satıcı Bekleniyor', 'Waiting for Maker'), trade?.challengePingedAt
      ? t(lang, 'Satıcı ödemenin gelmediğini bildirdi; 24 saat sonra itiraz açabilir. Ödeme kanıtınızı kontrol edin veya iptal teklif edin.', 'The maker reported the payment as missing and can open a challenge after 24h. Check your proof or propose a cancel.')
      : null);
    // [TR] Uyarı öncesi yalnız "Satıcıyı Uyar", sonrası yalnız "Otomatik Serbest Bırak" anlamlıdır.
    secondaryActions = [trade?.pingedAt
      ? action('conditional', 'auto_release', t(lang, 'Otomatik Serbest Bırak', 'Auto-Release Funds'), null)
      : action('conditional', 'ping_maker', t(lang, 'Satıcıyı Uyar', 'Ping Maker'), null)];
  }

  if (normalizedState === 'CHALLENGED') {
    // [TR] Maker itiraz sonrası da her an serbest bırakabilir; taker'ın yolu uzlaşma kartıdır.
    // [EN] The maker can still release at any time; the taker's path is the settlement card.
    primaryAction = normalizedRole === 'maker'
      ? action('contract', 'release_funds', t(lang, 'Ödemeyi Onayla', 'Release Funds'), null)
      : action('settlement', 'settlement_guidance', t(lang, 'Uzlaşma teklifi', 'Settlement offer'), t(lang, 'Aşağıdaki uzlaşma kartından teklif verin veya yanıtlayın.', 'Propose or answer in the settlement card below.'));
  }

  if (normalizedState === 'LOCKED' && paymentWindowExpired) {
    // [TR] Kontrat: süre dolunca iki taraf da kilidi çözebilir; alıcı teminatından küçük ceza kesilir ve
    //      alıcıya negatif sinyal yazılır. Taker ödeme bildirimi hâlâ mümkündür ama satıcıyla yarışır.
    if (normalizedRole === 'taker') {
      primaryAction = {
        ...primaryAction,
        description: t(lang, '48 saatlik ödeme süresi doldu: satıcı işlemi her an iptal edebilir. Ödediyseniz hemen bildirin.', 'The 48h payment window has passed: the maker can unwind the trade at any time. If you paid, report it now.'),
      };
      secondaryActions.push(action('contract', 'expire_payment_window', t(lang, 'Ödemedim — kilidi çöz (teminattan ceza)', 'I did not pay — unlock (bond penalty)'), null));
    } else {
      primaryAction = action('contract', 'expire_payment_window', t(lang, 'Kilidi Çöz (48 saat doldu)', 'Unlock (48h passed)'), t(lang, 'Alıcı süresinde ödeme bildirmedi. Kilidi çözerseniz fonlarınız ve teminatınız iade edilir.', 'The taker did not report payment in time. Unlocking returns your funds and bond.'));
    }
  }


  // [TR] İptal teklifi zaten varsa tekrar teklif butonu gösterilmez; yanıt iptal kartındadır.
  if (['LOCKED', 'PAID', 'CHALLENGED'].includes(normalizedState) && !cancelStatus) {
    secondaryActions.push(action('contract', 'propose_cancel', t(lang, 'İptal Teklif Et', 'Propose Cancel'), t(lang, 'Karşılıklı iptal için mevcut iptal teklif akışını kullanın.', 'Use the existing cancel proposal flow for mutual cancellation.')));
  }

  if (normalizedState === 'CHALLENGED' && canBurnExpired) {
    secondaryActions.push(action('contract', 'burn_expired', t(lang, 'Süre Aşımı Yakımı', 'Burn Expired Trade'), t(lang, '10 günlük süre dolduysa mevcut süre aşımı yakımı akışı kullanılabilir.', 'If the 10-day deadline has passed, the existing burn flow can be used.')));
  }

  if (TERMINAL_TRADE_STATES.includes(normalizedState)) {
    // Headline already states the outcome; the panel only carries the next-step buttons.
    primaryAction = action('info', 'trade_closed', '', null);
    secondaryActions = [];
    primaryDisabledReasons.length = 0;
  }

  const decisionSummary = buildDecisionSummary(normalizedState, normalizedRole, lang);

  return {
    ...decisionSummary,
    decisionSummary,
    stateLabel: labels.state[normalizedState]?.[pickLocale(lang)] || normalizedState,
    roleLabel: labels.role[normalizedRole]?.[pickLocale(lang)] || normalizedRole,
    primaryAction,
    secondaryActions,
    disabledReasons: primaryDisabledReasons,
    globalDisabledReasons,
    timerCards: TERMINAL_TRADE_STATES.includes(normalizedState) ? [] : buildTimerCards(timers, lang, normalizedState, normalizedRole),
    guidance,
    riskCopy: {
      chargeback: t(lang, 'Chargeback riski kullanıcı sorumluluğundadır.', 'Chargeback risk remains user responsibility.'),
      settlement: t(lang, 'Settlement sonucu kontrat kurallarıyla belirlenir.', 'Settlement outcomes are governed by contract rules.'),
    },
    technicalDetails: {
      tradeId: trade?.id ?? null,
      onchainId: trade?.onchainId ?? null,
      tradeState: normalizedState,
      userRole: normalizedRole,
    },
  };
}

export default buildTradeDecisionModel;
