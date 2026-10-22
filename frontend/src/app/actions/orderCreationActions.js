import { keccak256, stringToHex } from 'viem';
import { normalizeOrderSide, resolveOrderActionFns, resolvePaymentRiskEntry } from '../orderUiModel';
import { buildApiUrl } from '../apiConfig';
import { fmtNum } from '../copy';
import { getOrderRiskGateMessage } from '../copy/paymentRisk';
import { computeCreateAllowance } from './allowanceMath';
import { checkTokenBalance } from './balanceGuard';
import { computeMinFillRaw, parseDecimalToUnits } from './decimalUnits';
import { isPayoutProfileSaved, profileRequiredMessage } from '../payoutProfileGate';
import { enforceTxGate } from '../txGate';
import { showTxError } from './contractLifecycleActions';

export const MAKER_ORDER_DEFAULTS = {
  makerTier: 0,
  makerAmount: '',
  makerRate: '',
  makerMinLimit: '',
  makerFiat: 'TRY',
  makerToken: 'USDT',
  makerSide: 'SELL_CRYPTO',
};

export const MAKER_TIER_MAX_AMOUNTS = {
  0: 150,
  1: 1500,
  2: 7500,
  3: 30000,
};

/**
 * [TR] Kontrattaki token-bazlı tier limitlerini (base-unit) UI birimine çevirir.
 *      Config yoksa MAKER_TIER_MAX_AMOUNTS fallback'i kullanılır.
 * [EN] Converts on-chain per-token tier limits (base units) to UI units; falls back to defaults.
 */
export const resolveTierMaxAmounts = (tokenPolicy) => {
  const decimals = Number(tokenPolicy?.decimals);
  const limits = Array.isArray(tokenPolicy?.tierMaxAmountsBaseUnit) ? tokenPolicy.tierMaxAmountsBaseUnit : [];
  if (!Number.isInteger(decimals) || decimals <= 0 || decimals > 18 || limits.length < 4) return MAKER_TIER_MAX_AMOUNTS;
  const out = {};
  for (let tier = 0; tier < 4; tier += 1) {
    const value = Number(limits[tier]) / 10 ** decimals;
    // [TR] Kontrat: tierMax == 0 → limit yok (_createOrder yalnız tierMax > 0 iken kontrol eder).
    //      Eskiden 0 varsayılan küçük limite düşüyor ve geçerli emirleri engelliyordu.
    // [EN] On-chain 0 means "no cap"; it used to fall back to the small default and block valid orders.
    out[tier] = Number.isFinite(value) && value > 0 ? value : (Number(limits[tier]) === 0 ? Infinity : MAKER_TIER_MAX_AMOUNTS[tier]);
  }
  return out;
};

export const getMakerOrderValidationError = ({
  makerAmount,
  makerTier,
  makerRate,
  makerMinLimit,
  makerFiat,
  makerSide = 'SELL_CRYPTO',
  makerToken = 'USDT',
  tokenPolicy = null,
  tierMaxAmounts = MAKER_TIER_MAX_AMOUNTS,
  // [TR] Cüzdanın kontrattaki efektif tier'ı (_getEffectiveTier). null = kontrol yok (yalnız saf yardımcı çağrıları).
  effectiveTier = null,
  lang = 'EN',
}) => {
  const cryptoAmtNum = parseFloat(makerAmount) || 0;
  const rateNum = parseFloat(makerRate) || 0;
  const minLimNum = parseFloat(makerMinLimit) || 0;
  const totalFiatValue = cryptoAmtNum * rateNum;
  const tierMax = tierMaxAmounts?.[makerTier];

  // [TR] Kontrat token yön politikası (getTokenConfig): kapalı yön TokenDirectionNotAllowed ile revert eder.
  // [EN] Contract token direction policy; a closed direction reverts with TokenDirectionNotAllowed.
  if (tokenPolicy && tokenPolicy.supported === false) return lang === 'TR' ? `${makerToken} şu an kontratta desteklenmiyor.` : `${makerToken} is not supported by the contract right now.`;
  if (tokenPolicy && makerSide === 'SELL_CRYPTO' && tokenPolicy.allowSellOrders === false) return lang === 'TR' ? `${makerToken} için satış emri şu an kapalı.` : `Sell orders are closed for ${makerToken}.`;
  if (tokenPolicy && makerSide === 'BUY_CRYPTO' && tokenPolicy.allowBuyOrders === false) return lang === 'TR' ? `${makerToken} için alış emri şu an kapalı.` : `Buy orders are closed for ${makerToken}.`;
  // [TR] createBuyOrder cüzdan yaşı istemez (ArafEscrow.sol:626-633; yaş fillBuyOrder'da emir sahibi için uygulanır): UI engellemez.
  // [TR] Kontrat: _tier > _getEffectiveTier(msg.sender) → TierNotAllowed. Approve'dan önce ön kontrol (kontrat son söz sahibi).
  if (effectiveTier !== null && effectiveTier !== undefined && makerTier > effectiveTier) {
    return lang === 'TR'
      ? `Tier ${makerTier} için itibarınız yetmiyor. Açabileceğiniz en yüksek seviye: Tier ${effectiveTier}.`
      : `Your reputation does not unlock Tier ${makerTier}. Highest tier you can open: Tier ${effectiveTier}.`;
  }
  if (!makerAmount || cryptoAmtNum <= 0) return lang === 'TR' ? 'Order miktarını giriniz.' : 'Enter order amount.';
  if (makerTier < 4 && Number.isFinite(tierMax) && cryptoAmtNum > tierMax) {
    const formatted = fmtNum(tierMax, lang);
    return lang === 'TR'
      ? `Tier ${makerTier} maksimum emir limiti ${formatted} ${makerToken}.`
      : `Tier ${makerTier} max order limit is ${formatted} ${makerToken}.`;
  }
  if (!makerRate || rateNum <= 0) return lang === 'TR' ? 'Kur fiyatını giriniz.' : 'Enter exchange rate.';
  // [TR] Min limit opsiyoneldir (boşsa emir tek seferde dolar). Max limit kontratta karşılığı olmayan
  //      eski bir alandır; yalnız girilmişse tutarlılık kontrol edilir.
  // [EN] Min limit is optional (empty = single fill). Max limit has no on-chain meaning; only
  //      validated for consistency when provided.
  if (makerMinLimit && minLimNum <= 0) return lang === 'TR' ? 'Minimum limit sıfırdan büyük olmalı.' : 'Min limit must be greater than zero.';
  if (makerMinLimit && minLimNum > totalFiatValue) return lang === 'TR' ? `Min limit toplam değeri (${totalFiatValue.toFixed(2)} ${makerFiat}) aşamaz.` : `Min limit exceeds total fiat (${totalFiatValue.toFixed(2)} ${makerFiat}).`;
  return null;
};

export const getRestrictedPaymentRiskEntry = ({ paymentRiskConfig, canonicalPayoutProfile }) => {
  const selectedRiskEntry = resolvePaymentRiskEntry({
    paymentRiskConfig: paymentRiskConfig || {},
    rail: canonicalPayoutProfile?.rail,
    country: canonicalPayoutProfile?.country,
  });
  const isRestricted = selectedRiskEntry
    && (String(selectedRiskEntry.riskLevel || '').toUpperCase() === 'RESTRICTED' || selectedRiskEntry.enabled === false);
  return { selectedRiskEntry, isRestricted };
};

export const buildCreateOrderAction = ({
  getFormState,
  resetForm,
  requireSignedSessionForActiveWallet,
  supportedTokens,
  address,
  lang = 'EN',
  isContractLoading,
  setIsContractLoading,
  setLoadingText,
  setShowMakerModal,
  showToast,
  getTokenDecimals,
  getAllowance,
  getTokenBalance,
  approveToken,
  createSellOrder,
  createBuyOrder,
  fillSellOrder,
  fillBuyOrder,
  cancelSellOrder,
  cancelBuyOrder,
  canonicalizePayoutProfileDraft,
  payoutProfileDraft,
  paymentRiskConfig,
  authenticatedFetch = null,
  tierMaxAmounts = MAKER_TIER_MAX_AMOUNTS,
  tokenPolicy = null,
  // [TR] Tam approve tutarı için: backend bondMap + cüzdan itibarı (yoksa muhafazakâr üst sınır kullanılır).
  bondMap = null,
  getReputation = null,
  // [TR] Backend'deki KAYITLI profil durumu (true/false/null=bilinmiyor). Yalnız true iken emir açılır (fail-closed).
  hasPayoutProfile = null,
  openProfilePage = null,
  // [TR] Fail-closed kapı (getter ya da nesne): approve/tx'ten ÖNCE değerlendirilir. Modal açıkken arıza başlarsa da reddeder.
  txGate = null,
  // [TR] Efektif tier (okunamazsa 0). Tier uygun değilse approve'a hiç gidilmez.
  effectiveTier = 0,
}) => async () => {
  if (txGate && !enforceTxGate(txGate, showToast)) return;
  if (!requireSignedSessionForActiveWallet()) return;

  // [TR] Ödeme profili kapısı: kayıtlı profili olmayan (ya da durumu bilinmeyen) kullanıcı emir oluşturamaz.
  if (!isPayoutProfileSaved(hasPayoutProfile)) {
    showToast(profileRequiredMessage(lang), 'error');
    setShowMakerModal(false);
    if (typeof openProfilePage === 'function') openProfilePage('account');
    return;
  }

  const formState = getFormState();
  const {
    makerToken,
    makerAmount,
    makerRate,
    makerMinLimit,
    makerTier,
    makerSide,
    makerFiat,
  } = formState;

  const validationError = getMakerOrderValidationError({ ...formState, tierMaxAmounts, tokenPolicy, effectiveTier, lang });
  if (validationError) {
    showToast(validationError, 'error');
    return;
  }

  const tokenMeta = supportedTokens[makerToken];
  let tokenAddress = tokenMeta?.address;
  if (!tokenMeta?.decimalsRequired) {
    showToast(
      lang === 'TR'
        ? 'Token metadata eksik: decimals bilgisi zorunludur.'
        : 'Token metadata missing: decimals is required.',
      'error'
    );
    return;
  }
  if (!tokenAddress) {
    showToast(
      lang === 'TR'
        ? `${makerToken} token adresi .env dosyasında tanımlı değil (VITE_${makerToken}_ADDRESS).`
        : `${makerToken} token address not configured in .env (VITE_${makerToken}_ADDRESS).`,
      'error'
    );
    return;
  }

  const cryptoAmt = parseFloat(makerAmount);
  if (!cryptoAmt || cryptoAmt <= 0) {
    showToast(lang === 'TR' ? 'Geçerli bir miktar girin.' : 'Enter a valid amount.', 'error');
    return;
  }

  if (!makerRate || parseFloat(makerRate) <= 0) {
    showToast(lang === 'TR' ? 'Kur fiyatı girilmeli.' : 'Enter an exchange rate.', 'error');
    return;
  }

  // [TR] Risk ve RESTRICTED kontrolü KAYITLI profilden (pii/my) türer, taslaktan değil. Taslağın rail/country'si
  //      kayıtlıdan farklıysa emir açılmaz. authenticatedFetch yoksa (yalnız eski/test bağlantısı) taslak kullanılır.
  // [EN] Risk and RESTRICTED derive from the SAVED profile (pii/my), not the draft. A differing draft is blocked.
  const canonicalDraftProfile = canonicalizePayoutProfileDraft(payoutProfileDraft || {});
  let canonicalPayoutProfile = canonicalDraftProfile;
  if (typeof authenticatedFetch === 'function') {
    let savedPii = null;
    try {
      const piiRes = await authenticatedFetch(buildApiUrl('pii/my'));
      if (piiRes?.ok) savedPii = (await piiRes.json())?.pii || null;
    } catch (_) { savedPii = null; }
    if (!savedPii) {
      showToast(getOrderRiskGateMessage('savedProfileUnavailable', lang), 'error');
      return;
    }
    canonicalPayoutProfile = canonicalizePayoutProfileDraft(savedPii);
    const norm = (v) => String(v || '').toUpperCase();
    if (norm(canonicalDraftProfile?.rail) !== norm(canonicalPayoutProfile?.rail)
      || norm(canonicalDraftProfile?.country) !== norm(canonicalPayoutProfile?.country)) {
      showToast(getOrderRiskGateMessage('saveProfileFirst', lang), 'error');
      return;
    }
  }
  const { selectedRiskEntry, isRestricted } = getRestrictedPaymentRiskEntry({
    paymentRiskConfig,
    canonicalPayoutProfile,
  });
  if (isRestricted) {
    showToast(
      lang === 'TR'
        ? 'Bu rail/country kombinasyonu availability config nedeniyle kısıtlı. Order oluşturulamadı.'
        : 'This rail/country pair is restricted by availability config. Order creation blocked.',
      'error'
    );
    return;
  }
  // [TR] Risk config'i yoksa "MEDIUM" varsayılmaz: kapalı davranılır.
  const selectedPaymentRiskLevel = String(selectedRiskEntry?.riskLevel || '').toUpperCase();
  if (!['LOW', 'MEDIUM', 'HIGH'].includes(selectedPaymentRiskLevel)) {
    showToast(getOrderRiskGateMessage('riskConfigMissing', lang), 'error');
    return;
  }

  if (isContractLoading()) return;

  try {
    setIsContractLoading(true);

    const tokenDecimals = await getTokenDecimals(tokenAddress);
    // [TR] Dize tabanlı ayrıştırma: parseFloat/parseUnits(String(x)) üstel gösterimde ("1e-7") hatalıydı.
    const cryptoAmountRaw = parseDecimalToUnits(makerAmount, tokenDecimals);
    if (cryptoAmountRaw === null || cryptoAmountRaw <= 0n) {
      throw new Error(
        lang === 'TR'
          ? `Geçerli bir miktar girin (en fazla ${tokenDecimals} ondalık, üstel gösterim yok).`
          : `Enter a valid amount (up to ${tokenDecimals} decimals, no exponent notation).`
      );
    }
    const rateNum = parseFloat(makerRate);
    const minFillAmountRaw = computeMinFillRaw({
      minFiat: makerMinLimit,
      rate: makerRate,
      totalAmountRaw: cryptoAmountRaw,
      tokenDecimals,
    });
    if (minFillAmountRaw === null) {
      throw new Error(lang === 'TR' ? 'Kur veya minimum limit geçerli bir ondalık sayı değil.' : 'Rate or min limit is not a valid decimal number.');
    }
    const boundedMinFill = minFillAmountRaw > cryptoAmountRaw ? cryptoAmountRaw : minFillAmountRaw;
    const orderRefSeed = `order:${address}:${makerToken}:${makerTier}:${cryptoAmountRaw.toString()}:${Date.now()}`;
    const orderRef = keccak256(stringToHex(orderRefSeed));

    const normalizedSide = normalizeOrderSide(makerSide);
    if (normalizedSide === 'UNKNOWN') {
      throw new Error(lang === 'TR' ? 'Geçersiz order side. Order oluşturulamadı.' : 'Invalid order side. Order creation blocked.');
    }

    // [TR] Kontrat: sell → tutar + maker teminatı; buy → yalnız taker teminatı (tier + itibara göre, aşağı yuvarlı).
    //      Tam tutar onaylanır; başarısızlıkta otomatik approve(0) istenmez (kullanıcıya ikinci cüzdan onayı yükü).
    // [EN] Approve the exact contract requirement; no automatic approve(0) rollback on failure.
    let reputation = null;
    if (typeof getReputation === 'function') {
      try { reputation = await getReputation(address); } catch (_) { reputation = null; }
    }
    const requiredAllowance = computeCreateAllowance({
      side: normalizedSide,
      totalAmountRaw: cryptoAmountRaw,
      tier: makerTier,
      bondMap,
      reputation,
    });

    const balanceError = await checkTokenBalance({
      getTokenBalance,
      getTokenDecimals,
      tokenAddress,
      owner: address,
      required: requiredAllowance,
      symbol: makerToken,
      lang,
      detailTr: normalizedSide === 'BUY_CRYPTO' ? 'teminat' : 'tutar + teminat',
      detailEn: normalizedSide === 'BUY_CRYPTO' ? 'bond' : 'amount + bond',
    });
    if (balanceError) {
      showToast(balanceError, 'error');
      return;
    }

    const currentAllowance = await getAllowance(tokenAddress, address);
    if (currentAllowance < requiredAllowance) {
      setLoadingText(
        lang === 'TR'
          ? `Adım 1/2: ${makerToken} izni veriliyor...`
          : `Step 1/2: Approving ${makerToken}...`
      );
      await approveToken(tokenAddress, requiredAllowance);
    }

    const { createFn } = resolveOrderActionFns(normalizedSide, { fillBuyOrder, fillSellOrder, createBuyOrder, createSellOrder, cancelBuyOrder, cancelSellOrder });
    const createLabel = normalizedSide === 'BUY_CRYPTO' ? 'Buy' : 'Sell';

    setLoadingText(
      lang === 'TR'
        ? `Adım 2/2: ${createLabel} order oluşturuluyor...`
        : `Step 2/2: Creating ${createLabel.toLowerCase()} order...`
    );
    await createFn(tokenAddress, cryptoAmountRaw, boundedMinFill, makerTier, orderRef, selectedPaymentRiskLevel);

    // [TR] Kur ve fiat zincire yazılmaz; pazar yerinde fiyat görünmesi için backend'e bildirilir.
    //      Başarısız olursa emir yine geçerlidir, yalnız fiyat gösterimi eksik kalır.
    // [EN] Rate/fiat are not on-chain; publish them so the marketplace can show a price.
    let marketMetaSaved = true;
    if (typeof authenticatedFetch === 'function') {
      try {
        const metaRes = await authenticatedFetch(buildApiUrl('orders/market-meta'), {
          method: 'POST',
          body: JSON.stringify({ orderRef, fiatCurrency: makerFiat || 'TRY', exchangeRate: rateNum }),
        });
        marketMetaSaved = Boolean(metaRes?.ok);
      } catch (_) {
        marketMetaSaved = false;
      }
    }

    showToast(
      marketMetaSaved
        ? (lang === 'TR' ? `${createLabel} order oluşturuldu.` : `${createLabel} order created.`)
        : (lang === 'TR' ? `Order oluşturuldu, ancak kur bilgisi kaydedilemedi.` : `Order created, but the rate could not be saved.`),
      marketMetaSaved ? 'success' : 'info'
    );

    setShowMakerModal(false);
    resetForm();
  } catch (err) {
    console.error('handleCreateOrder error:', err);

    let errorMessage = err.shortMessage || err.reason || err.message || (lang === 'TR' ? 'Order oluşturulamadı.' : 'Failed to create order.');
    if (errorMessage.includes('Efektif tier') || errorMessage.includes('effective tier')) {
      errorMessage += lang === 'TR'
        ? ' Not: Tier 1+ için ilk başarılı işlemden sonra 15 gün aktif dönem şartı da aranır.'
        : ' Note: Tier 1+ also requires a 15-day active period after first successful trade.';
    }

    showTxError(showToast, err, errorMessage, lang, lang === 'TR' ? 'İşlem iptal edildi.' : 'Transaction cancelled.');
  } finally {
    setIsContractLoading(false);
    setLoadingText('');
  }
};
