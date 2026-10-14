import { TRADE_TIMING } from './contexts/trade-room/tradeTimeline';

// [TR] Emre girme onay penceresinin özeti. Yalnız veri toplar (biçimlendirme bileşende): gösterilen miktar, teminat
//      ve toplam, approve/fill'in KULLANDIĞI değerlerden (fillAmountRaw, requiredAllowance) türetilir; ikinci bir
//      hesap yoktur. Kaynağı olmayan alan null kalır ve arayüzde "Bilinmiyor" görünür; uydurma değer yazılmaz.
// [EN] Summary for the order-entry confirmation. Collects data only (formatting lives in the component): the amount,
//      bond and total are derived from the exact values approve/fill use. A field without a source stays null and
//      renders as "Unknown"; nothing is invented.

const BPS = 10000n;

const asBps = (value) => {
  if (value === null || value === undefined || value === '') return null;
  try {
    const n = BigInt(value);
    return n >= 0n && n <= BPS ? Number(n) : null;
  } catch {
    return null;
  }
};

/**
 * @param side             normalize edilmiş emir yönü: SELL_CRYPTO = emir sahibi satıyor, kullanıcı alıyor (taker);
 *                         BUY_CRYPTO = emir sahibi alıyor, kullanıcı satıyor (maker).
 * @param fillAmountRaw    doldurulacak ham miktar (fill'e giden değer)
 * @param requiredAllowance computeFillAllowance çıktısı (kontratın cüzdandan çekeceği toplam)
 * @param takerFeeBpsSnapshot / makerFeeBpsSnapshot  zincirdeki emir anlık görüntüsü (yoksa null)
 * @param bondIsUpperBound itibar okunamadıysa teminat muhafazakâr üst sınırdır
 */
export const buildFillConfirmSummary = ({
  order,
  side,
  tier,
  fillAmountRaw,
  requiredAllowance,
  takerFeeBpsSnapshot = null,
  makerFeeBpsSnapshot = null,
  bondIsUpperBound = false,
}) => {
  const fill = BigInt(fillAmountRaw);
  const lockTotal = BigInt(requiredAllowance);
  const buysCrypto = side === 'SELL_CRYPTO';
  // [TR] Sell emrini dolduran taker yalnız teminat öder; buy emrini dolduran maker tutar + teminat öder (allowanceMath).
  const bond = buysCrypto ? lockTotal : lockTotal - fill;
  // [TR] Kontrat: takerFee = miktar * takerBps / 10_000 (alıcı alacağından), makerFee aynı formül ama satıcının
  //      teminatından kesilir ve teminatı aşamaz.
  const feeBps = asBps(buysCrypto ? takerFeeBpsSnapshot : makerFeeBpsSnapshot);
  let feeRaw = feeBps === null ? null : (fill * BigInt(feeBps)) / BPS;
  if (feeRaw !== null && !buysCrypto && feeRaw > bond) feeRaw = bond;
  const rate = Number(order?.rate);
  const tierNumber = Number(tier);
  return {
    direction: buysCrypto ? 'buy' : 'sell',
    crypto: order?.crypto || 'USDT',
    decimals: Number.isInteger(order?.tokenDecimals) ? order.tokenDecimals : 6,
    fillAmountRaw: fill,
    bondRaw: bond,
    bondIsUpperBound: Boolean(bondIsUpperBound),
    lockTotalRaw: lockTotal,
    lockIncludesAmount: !buysCrypto,
    feeBps,
    feeRaw,
    feeFrom: buysCrypto ? 'received' : 'bond',
    fiat: order?.fiat || null,
    rate: order?.hasPrice !== false && Number.isFinite(rate) && rate > 0 && order?.fiat ? rate : null,
    counterparty: order?.maker || null,
    counterpartyTier: Number.isInteger(tierNumber) && tierNumber >= 0 ? tierNumber : null,
    // [TR] Backend emir akışı rail taşımıyor (orderUiModel yalnız paymentRiskSignal üretir); alan varsa gösterilir.
    rail: order?.paymentRail || order?.rail || null,
    paymentWindowMs: TRADE_TIMING.PAYMENT_WINDOW_MS,
  };
};
