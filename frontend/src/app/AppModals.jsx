import { ChevronRight, Lock, ScrollText, ShieldCheck, Star, TriangleAlert, X } from 'lucide-react';
import React from 'react';
import { buildMakerPreview, getMakerModalCopy, getOrderSideCopy, resolveEffectiveBondBps } from './orderUiModel';
import { resolveTierMaxAmounts } from './actions/orderCreationActions';
import { TERMS_ACKNOWLEDGEMENTS, TERMS_SECTIONS, TERMS_VERSION } from './legal/terms';
import PaymentRiskBadge from '../components/PaymentRiskBadge';
import { fmtBps, isKnownNumber, fmtNum } from './copy';
import { profileRequiredMessage } from './payoutProfileGate';

function TermsModal({ lang = 'EN', onAcceptTerms, onDeclineTerms }) {
  const isTR = lang === 'TR';
  const acks = TERMS_ACKNOWLEDGEMENTS[isTR ? 'TR' : 'EN'];
  const sections = TERMS_SECTIONS[isTR ? 'TR' : 'EN'];
  const [checked, setChecked] = React.useState({});
  const allChecked = acks.every((a) => checked[a.key]);
  return (
    <div className="fixed inset-0 bg-black/70 backdrop-blur-sm flex items-end sm:items-center justify-center sm:p-4 z-[200]" role="dialog" aria-modal="true" aria-labelledby="terms-modal-title" data-testid="terms-modal">
      <div className="bg-surface border border-borderSubtle rounded-t-2xl sm:rounded-2xl w-full sm:max-w-2xl shadow-2xl flex flex-col max-h-[calc(100dvh_-_1rem)] sm:max-h-[calc(100dvh_-_2rem)]">
        <div className="px-5 sm:px-6 pt-5 pb-3 border-b border-borderSubtle">
          <h2 id="terms-modal-title" className="text-lg font-bold text-textPrimary flex items-center gap-2"><ScrollText className="w-5 h-5 text-brand" strokeWidth={1.8} aria-hidden="true" />{isTR ? 'Araf Kullanım Koşulları' : 'Araf Terms of Use'}</h2>
          <p className="text-xs text-textMuted mt-0.5">{isTR ? `Sürüm ${TERMS_VERSION} · Devam etmek için okuyup kabul edin.` : `Version ${TERMS_VERSION} · Read and accept to continue.`}</p>
        </div>

        <div className="flex-1 min-h-0 overflow-y-auto overscroll-contain px-5 sm:px-6 py-4 space-y-4">
          <div className="rounded-xl border border-warning/40 bg-warning/10 p-3 text-xs text-textPrimary flex items-start gap-2">
            <TriangleAlert className="w-4 h-4 text-warning shrink-0 mt-0.5" strokeWidth={1.8} aria-hidden="true" />
            <span>{isTR
              ? 'Araf emanet tutmayan bir yazılımdır. Fonlarınız akıllı kontratta kilitlenir; sonuçları yalnız kontrat belirler ve kimse geri alamaz.'
              : 'Araf is non-custodial software. Your funds lock in the smart contract; only the contract decides outcomes and no one can reverse them.'}</span>
          </div>
          <div className="divide-y divide-borderSubtle border border-borderSubtle rounded-xl">
            {sections.map((sec, i) => (
              <details key={sec.title} className="group px-3" open={i < 2}>
                <summary className="cursor-pointer list-none py-2.5 text-sm font-semibold text-textPrimary flex items-center justify-between gap-3">
                  {sec.title}
                  <ChevronRight className="w-4 h-4 text-textMuted shrink-0 transition group-open:rotate-90" strokeWidth={1.8} aria-hidden="true" />
                </summary>
                <div className="pb-3 space-y-2 text-xs text-textSecondary leading-relaxed">
                  {sec.body.map((p) => <p key={p}>{p}</p>)}
                </div>
              </details>
            ))}
          </div>
            <fieldset className="space-y-2.5 rounded-xl border border-borderStrong bg-elevated p-3" data-testid="terms-acknowledgements">
              <legend className="px-1 text-xs font-bold text-textPrimary">{isTR ? 'Zorunlu beyanlar' : 'Required acknowledgements'}</legend>
              {acks.map((a) => (
                <label key={a.key} className="flex items-start gap-2.5 text-xs text-textPrimary cursor-pointer">
                  <input type="checkbox" className="mt-0.5 h-4 w-4 shrink-0 accent-[var(--color-brand)]" checked={Boolean(checked[a.key])} onChange={(e) => setChecked((c) => ({ ...c, [a.key]: e.target.checked }))} />
                  <span>{a.text}</span>
                </label>
              ))}
            </fieldset>
        </div>

        <div className="px-5 sm:px-6 pt-3 pb-[calc(1rem_+_env(safe-area-inset-bottom))] sm:pb-5 border-t border-borderSubtle space-y-2">
          {!allChecked && <p className="text-[11px] text-textMuted text-center">{isTR ? 'Kabul için metnin sonundaki 4 beyanı işaretleyin.' : 'Tick the 4 statements at the end of the text to accept.'}</p>}
          <div className="flex flex-col-reverse sm:flex-row gap-2">
            <button type="button" onClick={() => onDeclineTerms?.()} className="w-full sm:w-auto px-4 py-2.5 rounded-xl border border-borderStrong text-sm font-semibold text-textSecondary hover:bg-elevated">
              {isTR ? 'Reddet ve bağlantıyı kes' : 'Decline and disconnect'}
            </button>
            <button
              type="button"
              disabled={!allChecked}
              onClick={() => onAcceptTerms?.()}
              className="w-full sm:flex-1 py-2.5 bg-brand text-black font-bold rounded-xl hover:opacity-90 transition disabled:opacity-40 disabled:cursor-not-allowed"
            >
              {isTR ? 'Kabul ediyorum, imzayla onayla' : 'I accept, confirm with signature'}
            </button>
          </div>
          <p className="text-[11px] text-textMuted text-center">{isTR ? 'Kabulünüz cüzdanınızla imzalanır ve cüzdan adresinizle eşleştirilerek kalıcı olarak kayıt altına alınır.' : 'Your acceptance is signed with your wallet and permanently recorded against your wallet address.'}</p>
        </div>
      </div>
    </div>
  );
}

// [TR] App modal/render katmanı burada tutulur.
// [EN] App modal/render layer lives here.
export const buildAppModals = (ctx) => {
  const {
    lang,
    showWalletModal,
    setShowWalletModal,
    connectors,
    connect,
    getWalletIcon,
    showFeedbackModal,
    setShowFeedbackModal,
    feedbackRating,
    setFeedbackRating,
    feedbackCategory,
    setFeedbackCategory,
    setFeedbackError,
    feedbackText,
    setFeedbackText,
    feedbackError,
    FEEDBACK_MIN_LENGTH,
    onRequestSignIn,
    submitFeedback,
    isSubmittingFeedback,
    showMakerModal,
    setShowMakerModal,
    makerTier,
    setMakerTier,
    makerToken,
    setMakerToken,
    makerSide,
    setMakerSide,
    makerAmount,
    setMakerAmount,
    makerRate,
    setMakerRate,
    makerMinLimit,
    setMakerMinLimit,
    makerFiat,
    setMakerFiat,
    onchainBondMap,
    userReputation,
    SUPPORTED_TOKEN_ADDRESSES,
    onchainTokenMap,
    protocolFeeConfig,
    handleCreateOrder,
    makerValidationError,
    makerPayoutRiskEntry,
    isCreateTemporarilyDisabledByRisk,
    isPayoutProfileGateBlocked = false,
    openProfilePage,
    isContractLoading,
    loadingText,
    isConnected,
    isAuthenticated,
    termsAccepted,
    onAcceptTerms,
    onDeclineTerms,
    address,
  
  } = ctx;

  const closeBtn = (onClick, label) => (
    <button type="button" onClick={onClick} aria-label={label} className="p-1.5 -m-1.5 rounded-lg text-textMuted hover:text-textPrimary hover:bg-elevated transition">
      <X className="w-5 h-5" strokeWidth={1.8} aria-hidden="true" />
    </button>
  );

  const renderWalletModal = () => {
    if (!showWalletModal) return null;
    return (
      <div className="fixed inset-0 max-w-full overflow-x-hidden bg-black/60 backdrop-blur-sm flex items-end sm:items-center justify-center sm:p-4 safe-area-x z-[100]" role="dialog" aria-modal="true" aria-labelledby="wallet-modal-title">
        <div className="bg-surface border border-borderSubtle rounded-t-2xl sm:rounded-2xl p-5 sm:p-6 w-full sm:max-w-sm shadow-2xl max-h-[calc(100dvh_-_2rem_-_env(safe-area-inset-top)_-_env(safe-area-inset-bottom))] overflow-x-hidden overflow-y-auto overscroll-contain pb-[calc(1.25rem_+_env(safe-area-inset-bottom))] sm:pb-6">
          <div className="flex justify-between items-center mb-1">
            <h2 id="wallet-modal-title" className="text-lg font-bold text-textPrimary">{lang === 'TR' ? 'Cüzdan bağla' : 'Connect wallet'}</h2>
            {closeBtn(() => setShowWalletModal(false), lang === 'TR' ? 'Kapat' : 'Close')}
          </div>
          <p className="text-xs text-textMuted mb-4">{lang === 'TR' ? 'Bağlandıktan sonra oturumu cüzdan imzasıyla açarsınız.' : 'After connecting, you sign in with a wallet signature.'}</p>
          <div className="space-y-2">
            {connectors.length === 0 && (
              <p className="text-sm text-textSecondary bg-elevated border border-borderSubtle rounded-xl p-4">{lang === 'TR' ? 'Tarayıcıda cüzdan bulunamadı. MetaMask, Coinbase Wallet veya Rabby kurun.' : 'No wallet found in this browser. Install MetaMask, Coinbase Wallet or Rabby.'}</p>
            )}
            {connectors.map((connector) => (
              <button
                key={connector.uid}
                type="button"
                onClick={() => { connect({ connector }); setShowWalletModal(false); }}
                className="w-full flex items-center justify-between bg-elevated hover:border-brand/50 border border-borderSubtle px-4 py-3 rounded-xl transition group"
              >
                <span className="flex items-center gap-3">
                  <span className="w-8 h-8 flex items-center justify-center">{getWalletIcon(connector)}</span>
                  <span className="font-semibold text-textPrimary">{connector.name}</span>
                </span>
                <ChevronRight className="w-4 h-4 text-textMuted group-hover:text-brand" strokeWidth={1.8} aria-hidden="true" />
              </button>
            ))}
          </div>
          <p className="mt-4 text-xs text-textMuted flex items-center justify-center gap-1.5">
            <ShieldCheck className="w-3.5 h-3.5 text-success" strokeWidth={1.8} aria-hidden="true" />
            {lang === 'TR' ? 'Araf hiçbir zaman özel anahtar veya kurtarma ifadesi istemez.' : 'Araf never asks for private keys or seed phrases.'}
          </p>
        </div>
      </div>
    );
  };

  // [TR] Geri bildirim modalı — kategori + yıldız puanı + metin girişi. Backend: rating 1-5, kategori enum, ≤1000 karakter.
  // [EN] Feedback modal; mirrors backend validation (rating 1-5, category enum, ≤1000 chars).
  const renderFeedbackModal = () => {
    if (!showFeedbackModal) return null;
    const signedIn = isConnected && isAuthenticated;
    const len = feedbackText.trim().length;
    const categories = [
      { v: 'bug', tr: 'Hata', en: 'Bug' },
      { v: 'suggestion', tr: 'Öneri', en: 'Idea' },
      { v: 'ui/ux', tr: 'Tasarım', en: 'Design' },
      { v: 'other', tr: 'Diğer', en: 'Other' },
    ];
    return (
      <div className="fixed inset-0 max-w-full overflow-x-hidden bg-black/60 backdrop-blur-sm flex items-end sm:items-start justify-center sm:justify-end sm:p-6 safe-area-x z-[100]" role="dialog" aria-modal="true" aria-labelledby="feedback-modal-title">
        <div className="bg-surface border border-borderSubtle rounded-t-2xl sm:rounded-2xl p-5 sm:p-6 w-full sm:max-w-md shadow-2xl max-h-[calc(100dvh_-_2rem_-_env(safe-area-inset-top)_-_env(safe-area-inset-bottom))] overflow-x-hidden overflow-y-auto overscroll-contain pb-[calc(1.25rem_+_env(safe-area-inset-bottom))] sm:pb-6">
          <div className="flex justify-between items-center mb-1">
            <h2 id="feedback-modal-title" className="text-lg font-bold text-textPrimary">{lang === 'TR' ? 'Geri bildirim' : 'Feedback'}</h2>
            {closeBtn(() => setShowFeedbackModal(false), lang === 'TR' ? 'Geri bildirim penceresini kapat' : 'Close feedback panel')}
          </div>
          <p className="text-sm text-textSecondary mb-4">{lang === 'TR' ? 'Nerede zorlandınız? Özellikle boşa giden işlem (revert) maliyetlerini azaltmak istiyoruz.' : 'Where did you struggle? We especially want to cut wasted transaction (revert) costs.'}</p>

          {!signedIn ? (
            <div className="bg-elevated border border-borderSubtle rounded-xl p-4 text-center" data-testid="feedback-signin-gate">
              <p className="text-sm text-textSecondary">{lang === 'TR' ? 'Geri bildirim cüzdan oturumuyla gönderilir (spam koruması).' : 'Feedback is sent with a wallet session (spam protection).'}</p>
              {typeof onRequestSignIn === 'function' && (
                <button type="button" onClick={() => { setShowFeedbackModal(false); onRequestSignIn(); }} className="mt-3 w-full py-2.5 rounded-xl bg-brand text-black font-bold text-sm hover:opacity-90">
                  {isConnected ? (lang === 'TR' ? 'İmzala ve giriş yap' : 'Sign in') : (lang === 'TR' ? 'Cüzdan bağla' : 'Connect wallet')}
                </button>
              )}
            </div>
          ) : (
            <>
              <div className="flex justify-center gap-1 mb-4">
                {[1, 2, 3, 4, 5].map((star) => (
                  <button key={star} type="button" onClick={() => { setFeedbackRating(star); setFeedbackError(''); }} aria-label={`${star}/5`} aria-pressed={feedbackRating >= star} className={`p-1 transition ${feedbackRating >= star ? 'text-warning scale-110' : 'text-textMuted hover:text-warning/60'}`}><Star className="w-8 h-8" strokeWidth={1.6} fill={feedbackRating >= star ? 'currentColor' : 'none'} aria-hidden="true" /></button>
                ))}
              </div>
              <div className="grid grid-cols-4 gap-1.5 mb-3" role="radiogroup" aria-label={lang === 'TR' ? 'Kategori' : 'Category'}>
                {categories.map((c) => (
                  <button key={c.v} type="button" role="radio" aria-checked={feedbackCategory === c.v} onClick={() => { setFeedbackCategory(c.v); setFeedbackError(''); }}
                    className={`py-2 rounded-lg text-xs font-semibold border transition ${feedbackCategory === c.v ? 'bg-brand/10 text-brand border-brand/50' : 'bg-elevated text-textSecondary border-borderSubtle hover:text-textPrimary'}`}>
                    {lang === 'TR' ? c.tr : c.en}
                  </button>
                ))}
              </div>
              <textarea
                value={feedbackText}
                maxLength={1000}
                onChange={(e) => { setFeedbackText(e.target.value); setFeedbackError(''); }}
                placeholder={lang === 'TR' ? 'Hangi ekranda, hangi adımda ne oldu?' : 'Which screen, which step, what happened?'}
                className="w-full bg-elevated text-textPrimary px-3 py-3 rounded-xl border border-borderSubtle focus:border-brand/60 outline-none h-28 text-sm mb-1.5 resize-none"
              />
              <div className="flex items-center justify-between text-xs mb-3">
                <span className="text-textMuted">{lang === 'TR' ? `En az ${FEEDBACK_MIN_LENGTH} karakter` : `At least ${FEEDBACK_MIN_LENGTH} characters`}</span>
                <span className={`tabular-nums ${len >= FEEDBACK_MIN_LENGTH ? 'text-success' : 'text-textMuted'}`}>{len}/1000</span>
              </div>
              {feedbackError && (
                <p className="text-danger text-xs mb-3 bg-danger/10 border border-danger/40 rounded-lg p-2" role="alert">{feedbackError}</p>
              )}
              <button type="button" onClick={submitFeedback} disabled={isSubmittingFeedback} className="w-full py-3 rounded-xl font-bold bg-brand text-black hover:opacity-90 disabled:opacity-50 disabled:cursor-not-allowed transition">
                {isSubmittingFeedback ? (lang === 'TR' ? 'Gönderiliyor…' : 'Submitting…') : (lang === 'TR' ? 'Gönder' : 'Submit')}
              </button>
              <p className="text-[11px] text-textMuted mt-3 flex items-start gap-1.5"><Lock className="w-3.5 h-3.5 shrink-0 mt-px" strokeWidth={1.8} aria-hidden="true" />{lang === 'TR' ? 'Özel anahtar, kurtarma ifadesi veya banka şifresi yazmayın.' : 'Never include private keys, seed phrases or bank passwords.'}</p>
            </>
          )}
        </div>
      </div>
    );
  };


  const makerFieldClass = "w-full bg-elevated text-textPrimary px-3 py-2.5 rounded-xl border border-borderStrong outline-none focus:border-brand/60 focus:ring-1 focus:ring-brand/30";
  const makerLabelClass = "block text-xs text-textMuted mb-1 font-medium";

  // [TR] Maker order oluşturma modalı — sade tek-kolon form: yön, varlık, tutar/kur, tier, özet, onay.
  //      Açıklama metinleri minimumda; teminat oranları on-chain bondMap'ten okunur.
  // [EN] Maker order modal — compact single-column form; bond ratios come from the on-chain bondMap.
  const renderMakerModal = () => {
    if (!showMakerModal) return null;
    const tr = lang === 'TR';
    const fmt = (n, d = 2) => fmtNum(n, lang, d);

    // [TR] Kontrat verisi: token politikası (yön/tier limiti), itibara göre gerçek teminat oranı, ücret yapılandırması.
    // [EN] Contract data: token policy (directions, tier caps), reputation-adjusted bond, fee config.
    const tokenAddress = String(SUPPORTED_TOKEN_ADDRESSES?.[makerToken] || '').toLowerCase();
    const tokenPolicy = onchainTokenMap?.[tokenAddress] || null;
    const decimals = Number(tokenPolicy?.decimals) > 0 ? Number(tokenPolicy.decimals) : 6;
    const tierCaps = resolveTierMaxAmounts(tokenPolicy);
    const effectiveUserTier = userReputation?.effectiveTier ?? 0;
    const sideClosed = (side) => Boolean(tokenPolicy && (tokenPolicy.supported === false || (side === 'SELL_CRYPTO' ? tokenPolicy.allowSellOrders === false : tokenPolicy.allowBuyOrders === false)));
    const bondFor = (tier) => resolveEffectiveBondBps({ side: makerSide, tier, bondMap: onchainBondMap, reputation: userReputation });
    const bond = bondFor(makerTier);

    const cryptoAmt = parseFloat(makerAmount) || 0;
    const rateNum = parseFloat(makerRate) || 0;
    const totalFiat = cryptoAmt * rateNum;
    const minFiat = parseFloat(makerMinLimit) || 0;
    const minFillToken = minFiat > 0 && rateNum > 0 ? Math.min(cryptoAmt, minFiat / rateNum) : cryptoAmt;
    const preview = buildMakerPreview({ side: makerSide, amountUi: cryptoAmt, bondBps: bond.bps, decimals });
    const tierCap = tierCaps?.[makerTier];
    const capLabel = makerTier >= 4 || !Number.isFinite(tierCap) ? (tr ? 'limitsiz' : 'no cap') : `${fmt(tierCap)} ${makerToken}`;
    const feeBps = makerSide === 'SELL_CRYPTO' ? protocolFeeConfig?.makerFeeBps : protocolFeeConfig?.takerFeeBps;

    const modalCopy = getMakerModalCopy(makerSide, lang);
    const payoutRiskEntry = makerPayoutRiskEntry;
    const validationError = makerValidationError || null;
    const isSubmitDisabled = isContractLoading || validationError !== null || isCreateTemporarilyDisabledByRisk || isPayoutProfileGateBlocked;
    const seg = (active) => `flex-1 h-9 rounded-lg text-sm font-semibold transition ${active ? 'bg-surface text-textPrimary shadow-sm' : 'text-textMuted hover:text-textPrimary'} disabled:opacity-40 disabled:cursor-not-allowed`;

    return (
      <div className="fixed inset-0 max-w-full overflow-x-hidden bg-black/60 backdrop-blur-sm flex items-end sm:items-center justify-center sm:p-4 safe-area-x z-[100]">
        <div className="bg-surface border border-borderSubtle rounded-t-3xl sm:rounded-2xl p-5 sm:p-6 w-full max-w-md shadow-2xl max-h-[calc(100dvh_-_1rem_-_env(safe-area-inset-top))] overflow-x-hidden overflow-y-auto overscroll-contain" data-testid="maker-modal">
          <div className="flex justify-between items-center mb-4">
            <h2 className="text-lg font-bold text-textPrimary">{lang === 'TR' ? 'Emir oluştur' : 'Create order'}</h2>
            <button onClick={() => setShowMakerModal(false)} aria-label={tr ? 'Kapat' : 'Close'} className="w-9 h-9 -mr-2 flex items-center justify-center rounded-lg text-textMuted hover:text-textPrimary hover:bg-elevated"><X className="w-5 h-5" strokeWidth={1.8} aria-hidden="true" /></button>
          </div>

          <div className="space-y-4">
            {/* Yön: renk, kullanıcının işini anlatır (satarım = kırmızı, alırım = yeşil). */}
            <div>
              <div className="flex gap-1 p-1 rounded-xl bg-elevated border border-borderSubtle">
                {['SELL_CRYPTO', 'BUY_CRYPTO'].map((side) => (
                  <button key={side} type="button" data-testid={`maker-side-${side}`} disabled={sideClosed(side)} onClick={() => setMakerSide(side)}
                    className={`flex-1 h-9 rounded-lg text-sm font-bold transition disabled:opacity-40 disabled:cursor-not-allowed ${makerSide === side ? (side === 'SELL_CRYPTO' ? 'bg-danger text-white shadow-sm' : 'bg-emerald-600 text-white shadow-sm') : 'text-textMuted hover:text-textPrimary'}`}>
                    {getOrderSideCopy(side, 'display', lang)}
                  </button>
                ))}
              </div>
              <p className="mt-1.5 text-xs text-textMuted">{makerSide === 'SELL_CRYPTO'
                ? (tr ? 'Kripto + satıcı teminatı şimdi kilitlenir; alıcı size fiat öder.' : 'Crypto + maker bond lock now; the buyer pays you fiat.')
                : (tr ? 'Şimdi yalnız alıcı teminatı kilitlenir; kripto satıcıdan gelir, fiatı siz ödersiniz.' : 'Only your taker bond locks now; the seller brings the crypto and you pay fiat.')}</p>
            </div>

            <div>
              <p className={makerLabelClass}>{tr ? 'Varlık' : 'Asset'}</p>
              <div className="flex gap-1 p-1 rounded-xl bg-elevated border border-borderSubtle">
                {['USDT', 'USDC'].map((sym) => {
                  const pol = onchainTokenMap?.[String(SUPPORTED_TOKEN_ADDRESSES?.[sym] || '').toLowerCase()];
                  return <button key={sym} type="button" disabled={pol?.supported === false} onClick={() => setMakerToken(sym)} className={seg(makerToken === sym)}>{sym}</button>;
                })}
              </div>
            </div>

            <div className="grid grid-cols-1 min-[420px]:grid-cols-2 gap-3">
              <div>
                <label className={makerLabelClass} htmlFor="maker-amount">{tr ? 'Miktar' : 'Amount'}</label>
                <div className="relative">
                  <input id="maker-amount" type="number" inputMode="decimal" min="0" placeholder="1000" value={makerAmount} onChange={e => setMakerAmount(e.target.value)} className={`${makerFieldClass} pr-14`} />
                  <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs font-semibold text-textMuted">{makerToken}</span>
                </div>
                <p className="mt-1 text-[11px] text-textMuted">Tier {makerTier} {tr ? 'limiti' : 'cap'}: {capLabel}</p>
              </div>
              <div>
                <label className={makerLabelClass} htmlFor="maker-rate">{tr ? `Kur (1 ${makerToken})` : `Rate (1 ${makerToken})`}</label>
                <div className="flex gap-1.5">
                  <input id="maker-rate" type="number" inputMode="decimal" min="0" placeholder="41.25" value={makerRate} onChange={e => setMakerRate(e.target.value)} className={`${makerFieldClass} min-w-0`} />
                  <select aria-label={tr ? 'İtibari para' : 'Fiat currency'} value={makerFiat} onChange={e => setMakerFiat(e.target.value)} className="bg-elevated text-textPrimary px-2 rounded-xl border border-borderStrong text-sm">
                    <option value="TRY">TRY</option>
                    <option value="USD">USD</option>
                    <option value="EUR">EUR</option>
                  </select>
                </div>
                {totalFiat > 0 && <p className="mt-1 text-[11px] text-textMuted">≈ {fmt(totalFiat)} {makerFiat}</p>}
              </div>
            </div>

            <div>
              <label className={makerLabelClass} htmlFor="maker-min">{tr ? `Min. işlem (${makerFiat})` : `Min. trade (${makerFiat})`}</label>
              <input id="maker-min" type="number" inputMode="decimal" min="0" placeholder={tr ? 'Boş = tek seferde tamamı' : 'Empty = whole amount in one fill'} value={makerMinLimit} onChange={e => setMakerMinLimit(e.target.value)} className={makerFieldClass} />
              {cryptoAmt > 0 && <p className="mt-1 text-[11px] text-textMuted">{tr ? 'Kontrata yazılacak en küçük dolum' : 'Smallest fill written on-chain'}: {fmt(minFillToken, 4)} {makerToken}</p>}
            </div>

            <div>
              <p className={makerLabelClass}>Tier</p>
              <div className="grid grid-cols-5 gap-1.5">
                {[0, 1, 2, 3, 4].map((tier) => {
                  const locked = tier > effectiveUserTier;
                  const b = bondFor(tier);
                  const active = makerTier === tier;
                  return (
                    <button key={tier} type="button" disabled={locked} onClick={() => setMakerTier(tier)} aria-pressed={active}
                      title={locked ? (tr ? `İtibarınız Tier ${tier} için yetmiyor` : `Your reputation does not unlock Tier ${tier}`) : undefined}
                      className={`h-14 rounded-xl border text-center transition ${active ? 'border-brand bg-brand/10 text-textPrimary' : 'border-borderSubtle bg-elevated text-textSecondary hover:border-borderStrong'} disabled:opacity-40 disabled:cursor-not-allowed`}>
                      <span className="block text-sm font-bold">T{tier}{locked && <Lock className="inline w-3 h-3 ml-0.5 -mt-0.5" strokeWidth={2} aria-hidden="true" />}</span>
                      <span className="block text-[10px] text-textMuted">{b.bps === 0 ? (tr ? 'teminatsız' : 'no bond') : fmtBps(b.bps, lang)}</span>
                    </button>
                  );
                })}
              </div>
              {bond.adjustment && (
                <p className={`mt-1.5 text-[11px] ${bond.adjustment === 'discount' ? 'text-success' : 'text-warning'}`}>
                  {bond.adjustment === 'discount'
                    ? (tr ? 'Temiz itibar: teminat %1 düşük uygulanır (kontrat kuralı).' : 'Clean reputation: bond is 1% lower (contract rule).')
                    : (tr ? 'Risk puanı var: teminat %3 yüksek uygulanır (kontrat kuralı).' : 'Risk points present: bond is 3% higher (contract rule).')}
                </p>
              )}
            </div>

            <div className="rounded-xl border border-borderSubtle bg-elevated p-3 space-y-1.5 text-sm" data-testid="maker-preview">
              {makerSide === 'SELL_CRYPTO' && (
                <div className="flex justify-between gap-3 text-textSecondary">
                  <span>{tr ? 'Satılacak kripto' : 'Crypto for sale'}</span>
                  <span className="font-mono text-textPrimary">{cryptoAmt > 0 ? `${fmt(cryptoAmt, decimals)} ${makerToken}` : '—'}</span>
                </div>
              )}
              <div className="flex justify-between gap-3 text-textSecondary">
                <span>{modalCopy.bondRoleLabel}{bond.bps > 0 ? ` (${fmtBps(bond.bps, lang)})` : ''}</span>
                <span className="font-mono">{preview.reserveAmount > 0 ? `${fmt(preview.reserveAmount, decimals)} ${makerToken}` : '—'}</span>
              </div>
              <div className="flex justify-between gap-3 font-bold text-textPrimary border-t border-borderSubtle pt-1.5">
                <span>{modalCopy.totalLabel}:</span>
                <span className="font-mono">{preview.totalAmount > 0 ? `${fmt(preview.totalAmount, decimals)} ${makerToken}` : '—'}</span>
              </div>
              {!isKnownNumber(feeBps) && (
                <p className="text-[11px] text-textMuted pt-0.5" data-testid="maker-fee-unknown">{tr ? 'Protokol ücreti bilinmiyor (kontrattan okunamadı).' : 'Protocol fee unknown (could not be read from the contract).'}</p>
              )}
              {isKnownNumber(feeBps) && (
                <p className="text-[11px] text-textMuted pt-0.5">{tr ? `Protokol ücreti işlem kapanışında kesilir: ${fmtBps(feeBps, lang)} (${feeBps} bps).` : `Protocol fee is taken at settlement: ${fmtBps(feeBps, lang)} (${feeBps} bps).`}</p>
              )}
            </div>

            {payoutRiskEntry && (
              <div className="space-y-2">
                <p className="text-xs text-textMuted font-medium">{tr ? 'Ödeme yöntemi karmaşıklığı' : 'Payment method complexity'}</p>
                <PaymentRiskBadge lang={lang} riskEntry={payoutRiskEntry} />
              </div>
            )}
            {isCreateTemporarilyDisabledByRisk && (
              <p className="text-sm text-danger bg-danger/10 border border-danger/30 rounded-lg p-3 leading-relaxed">
                {tr ? 'Bu ödeme yöntemi şu an kısıtlı. Bu bir kontrat hükmü değildir.' : 'This payment method is currently restricted. This is not a contract authority rule.'}
              </p>
            )}
            {isPayoutProfileGateBlocked && (
              <div data-testid="create-needs-profile" className="text-sm text-danger bg-danger/10 border border-danger/30 rounded-lg p-3 leading-relaxed">
                <p>{profileRequiredMessage(lang)}</p>
                <button type="button" onClick={() => { setShowMakerModal(false); openProfilePage?.('account'); }} className="mt-1 underline font-semibold">
                  {tr ? 'Profil sayfasını aç' : 'Open profile page'}
                </button>
              </div>
            )}
            {validationError && (
              <p className="text-danger text-sm bg-danger/10 p-3 rounded-lg border border-danger/30 leading-relaxed">{validationError}</p>
            )}
            <button
              onClick={handleCreateOrder}
              disabled={isSubmitDisabled}
              className={`w-full h-12 rounded-xl font-bold transition ${isSubmitDisabled ? 'bg-elevated text-textMuted border border-borderStrong cursor-not-allowed' : 'bg-brand hover:opacity-90 text-black'}`}>
              {isContractLoading ? (loadingText || (tr ? 'İşleniyor...' : 'Processing...')) : modalCopy.submitLabel}
            </button>
            <p className="text-[11px] text-textMuted text-center">{tr ? 'Cüzdanınız önce token onayı (approve), ardından emir işlemini ister.' : 'Your wallet will ask for a token approval, then the order transaction.'}</p>
          </div>
        </div>
      </div>
    );
  };

  // ═══════════════════════════════════════════
  // 11. NAVİGASYON BİLEŞENLERİ
  //     Slim rail, context sidebar, mobile nav
  // ═══════════════════════════════════════════

  // [TR] Sol dar navigasyon çubuğu — yalnızca masaüstünde görünür

  // [TR] Kullanım koşulları — cüzdan başına ve sürüm başına sorulur. Dört temel risk tek tek onaylanmadan
  //      kabul düğmesi açılmaz; kabul, giriş imzasının içindeki beyanla (SIWE statement) kanıtlanır ve
  //      backend kaydeder. Reddetmek cüzdan bağlantısını keser.
  // [EN] Terms per wallet and version; four key risks must be ticked; acceptance is signed in the SIWE
  //      statement and recorded by the backend. Declining disconnects the wallet.
  const renderTermsModal = () => {
    if (termsAccepted || !isConnected) return null;
    return <TermsModal key={`${address || ''}-${TERMS_VERSION}`} lang={lang} onAcceptTerms={onAcceptTerms} onDeclineTerms={onDeclineTerms} />;
  };

  return {
    renderWalletModal,
    renderFeedbackModal,
    renderMakerModal,
    renderTermsModal,
  };
};
