import { ChevronRight, Hourglass, Lock, ScrollText, ShieldCheck, Star, TriangleAlert, X } from 'lucide-react';
import React from 'react';
import { buildMakerPreview, getMakerModalCopy, getOrderSideCopy, resolveEffectiveBondBps } from './orderUiModel';
import { resolveTierMaxAmounts } from './actions/orderCreationActions';
import { TERMS_ACCEPTED_STORAGE_KEY } from './bootstrapState';
import PaymentRiskBadge from '../components/PaymentRiskBadge';

// [TR] Eksik env değişkenleri için kapatılabilir uyarı şeridi.
// [EN] Dismissible warning strip for missing env variables.
export const EnvWarningBanner = ({ envErrors }) => {
  const [visible, setVisible] = React.useState(true);
  if (!envErrors?.length || !visible) return null;
  return (
    <div className="fixed top-0 left-0 right-0 z-50 bg-red-950/95 border-b border-red-800/60 backdrop-blur-sm flex items-center justify-between px-4 py-1.5 shadow-lg">
      <span className="text-red-400 text-xs font-mono flex items-center gap-2">
        <span className="text-red-500"><TriangleAlert className="w-3.5 h-3.5" strokeWidth={1.8} aria-hidden="true" /></span>
        {envErrors.join(' · ')}
      </span>
      <button
        onClick={() => setVisible(false)}
        className="ml-4 text-red-500 hover:text-textPrimary transition text-sm leading-none shrink-0"
        aria-label="Kapat"
      ><X className="w-4 h-4" strokeWidth={1.8} aria-hidden="true" /></button>
    </div>
  );
};

// [TR] App modal/render katmanı burada tutulur.
// [EN] App modal/render layer lives here.
export const buildAppModals = (ctx) => {
  const {
    lang,
    t,
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
    paymentRiskConfig,
    userReputation,
    SUPPORTED_TOKEN_ADDRESSES,
    onchainTokenMap,
    protocolFeeConfig,
    handleCreateOrder,
    makerValidationError,
    makerPayoutRiskEntry,
    isCreateTemporarilyDisabledByRisk,
    isContractLoading,
    loadingText,
    isConnected,
    isAuthenticated,
    termsAccepted,
    setTermsAccepted,
    connector,
    isRegisteringWallet,
    handleRegisterWallet,
  
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
    const locale = tr ? 'tr-TR' : 'en-US';
    const fmt = (n, d = 2) => Number(n || 0).toLocaleString(locale, { maximumFractionDigits: d });

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
    const isSubmitDisabled = isContractLoading || validationError !== null || isCreateTemporarilyDisabledByRisk;
    const seg = (active) => `flex-1 h-9 rounded-lg text-sm font-semibold transition ${active ? 'bg-surface text-textPrimary shadow-sm' : 'text-textMuted hover:text-textPrimary'} disabled:opacity-40 disabled:cursor-not-allowed`;

    return (
      <div className="fixed inset-0 max-w-full overflow-x-hidden bg-black/60 backdrop-blur-sm flex items-end sm:items-center justify-center sm:p-4 safe-area-x z-[100]">
        <div className="bg-surface border border-borderSubtle rounded-t-3xl sm:rounded-2xl p-5 sm:p-6 w-full max-w-md shadow-2xl max-h-[calc(100dvh_-_1rem_-_env(safe-area-inset-top))] overflow-x-hidden overflow-y-auto overscroll-contain" data-testid="maker-modal">
          <div className="flex justify-between items-center mb-4">
            <h2 className="text-lg font-bold text-textPrimary">{t.createAd}</h2>
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
                      <span className="block text-[10px] text-textMuted">{b.bps === 0 ? (tr ? 'teminatsız' : 'no bond') : `%${(b.bps / 100).toLocaleString(locale)}`}</span>
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
                <span>{modalCopy.bondRoleLabel}{bond.bps > 0 ? ` (%${(bond.bps / 100).toLocaleString(locale)})` : ''}</span>
                <span className="font-mono">{preview.reserveAmount > 0 ? `${fmt(preview.reserveAmount, decimals)} ${makerToken}` : '—'}</span>
              </div>
              <div className="flex justify-between gap-3 font-bold text-textPrimary border-t border-borderSubtle pt-1.5">
                <span>{modalCopy.totalLabel}:</span>
                <span className="font-mono">{preview.totalAmount > 0 ? `${fmt(preview.totalAmount, decimals)} ${makerToken}` : '—'}</span>
              </div>
              {Number.isFinite(Number(feeBps)) && (
                <p className="text-[11px] text-textMuted pt-0.5">{tr ? `Protokol ücreti işlem kapanışında kesilir: %${(Number(feeBps) / 100).toLocaleString(locale)} (${feeBps} bps).` : `Protocol fee is taken at settlement: ${(Number(feeBps) / 100).toLocaleString(locale)}% (${feeBps} bps).`}</p>
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

  // [TR] Kullanım koşulları modalı — ilk bağlantıda bir kez gösterilir, localStorage'a kaydedilir
  // [EN] Terms of use modal — shown once on first connect, persisted to localStorage
  const renderTermsModal = () => {
    if (termsAccepted || (!isConnected && !isAuthenticated)) return null;
    const points = lang === 'TR' ? [
      { icon: ShieldCheck, tone: 'text-success', text: 'Araf merkeziyetsiz bir akıllı kontrattır. Aracı kurum veya hakem yoktur; son söz kontratındır.' },
      { icon: Hourglass, tone: 'text-warning', text: 'İtiraz edilen işlemlerde "Eriyen Kasa" devreye girer: teminatlar ve süre uzarsa ana para zamanla erir, 10 günde yakılır.' },
      { icon: TriangleAlert, tone: 'text-danger', text: 'Ters ibraz (chargeback) riski tamamen satıcıya aittir. Gelen ödemenin kaynağını doğrulamak sizin sorumluluğunuzdadır.' },
      { icon: Lock, tone: 'text-textSecondary', text: 'Tüm işlemler kendi sorumluluğunuzdadır. Özel anahtarınızı kimseyle paylaşmayın.' },
    ] : [
      { icon: ShieldCheck, tone: 'text-success', text: 'Araf is a decentralized smart contract. There are no intermediaries or arbitrators; the contract has the final say.' },
      { icon: Hourglass, tone: 'text-warning', text: 'Disputed trades enter the "Bleeding Escrow": bonds and, if it drags on, principal decay over time and burn after 10 days.' },
      { icon: TriangleAlert, tone: 'text-danger', text: 'Chargeback risk belongs entirely to the seller. Verifying the source of incoming funds is your responsibility.' },
      { icon: Lock, tone: 'text-textSecondary', text: 'All transactions are at your own risk. Never share your private key.' },
    ];
    return (
      <div className="fixed inset-0 bg-black/70 backdrop-blur-sm flex items-end sm:items-center justify-center sm:p-4 z-[200]" role="dialog" aria-modal="true" aria-labelledby="terms-modal-title">
        <div className="bg-surface border border-borderSubtle rounded-t-2xl sm:rounded-2xl p-5 sm:p-6 w-full sm:max-w-lg shadow-2xl flex flex-col max-h-[calc(100dvh_-_2rem)] pb-[calc(1.25rem_+_env(safe-area-inset-bottom))] sm:pb-6">
          <h2 id="terms-modal-title" className="text-lg font-bold text-textPrimary mb-1 flex items-center gap-2"><ScrollText className="w-5 h-5 text-brand" strokeWidth={1.8} aria-hidden="true" />{lang === 'TR' ? 'Kullanım koşulları' : 'Terms of use'}</h2>
          <p className="text-xs text-textMuted mb-4">{lang === 'TR' ? 'Devam etmeden önce lütfen okuyun.' : 'Please read before continuing.'}</p>
          <ul className="space-y-3 text-sm text-textSecondary mb-5 overflow-y-auto">
            {points.map((p) => (
              <li key={p.text} className="flex items-start gap-3 bg-elevated border border-borderSubtle rounded-xl p-3">
                <p.icon className={`w-4 h-4 shrink-0 mt-0.5 ${p.tone}`} strokeWidth={1.8} aria-hidden="true" />
                <span>{p.text}</span>
              </li>
            ))}
          </ul>
          <button
            type="button"
            onClick={() => {
              // [TR] Kullanım koşulları kabulü kalıcı tutulur; modal refresh sonrası tekrar açılmaz.
              // [EN] Persist terms acceptance so modal does not re-open after refresh.
              if (typeof window !== 'undefined') {
                window.localStorage.setItem(TERMS_ACCEPTED_STORAGE_KEY, 'true');
              }
              setTermsAccepted(true);
            }}
            className="w-full py-3 bg-brand text-black font-bold rounded-xl hover:opacity-90 transition"
          >
            {lang === 'TR' ? 'Okudum, kabul ediyorum' : 'I have read and accept'}
          </button>
        </div>
      </div>
    );
  };

  return {
    renderWalletModal,
    renderFeedbackModal,
    renderMakerModal,
    renderTermsModal,
  };
};
