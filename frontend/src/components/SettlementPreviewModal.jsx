
function normalizeRawBigInt(value) {
  if (value === null || value === undefined || value === '') return null;
  if (typeof value === 'bigint') return value;
  if (typeof value === 'number') {
    if (!Number.isFinite(value) || !Number.isInteger(value)) return null;
    return BigInt(value);
  }
  if (typeof value === 'string') {
    if (!/^-?\d+$/.test(value.trim())) return null;
    try {
      return BigInt(value.trim());
    } catch {
      return null;
    }
  }
  return null;
}

export function shortNum(value) {
  const asBigInt = normalizeRawBigInt(value);
  if (asBigInt === null) {
    const num = Number(value ?? 0);
    if (!Number.isFinite(num)) return String(value ?? '0');
    return num.toLocaleString('en-US', { maximumFractionDigits: 6 });
  }
  const abs = asBigInt < 0n ? -asBigInt : asBigInt;
  const raw = abs.toString();
  const grouped = raw.length > 3 ? raw.replace(/\B(?=(\d{3})+(?!\d))/g, ',') : raw;
  return `${asBigInt < 0n ? '-' : ''}${grouped}`;
}

export function getPreviewTotalPool(previewData) {
  // [TR] Backend canonical alanı `pool`; legacy aliaslar geri uyumluluk için korunur.
  // [EN] Backend canonical field is `pool`; legacy aliases are fallback-only for compatibility.
  return previewData?.pool ?? previewData?.totalPool ?? previewData?.total_pool ?? 0;
}

// [TR] Backend ham taban birim (ör. USDT 6 ondalık) döndürür; kullanıcıya token birimiyle gösterilir.
// [EN] Backend returns raw base units; show them in token units.
export function formatTokenUnits(value, decimals = 6) {
  const raw = normalizeRawBigInt(value);
  if (raw === null) return String(value ?? '0');
  const d = Number.isInteger(Number(decimals)) && Number(decimals) >= 0 ? Number(decimals) : 6;
  const base = 10n ** BigInt(d);
  const neg = raw < 0n;
  const abs = neg ? -raw : raw;
  const whole = shortNum(abs / base);
  const frac = d > 0 ? (abs % base).toString().padStart(d, '0').slice(0, 2) : '';
  return `${neg ? '-' : ''}${whole}${frac && frac !== '00' ? `.${frac}` : ''}`;
}

const pct = (bps) => (Number.isFinite(Number(bps)) ? `%${(Number(bps) / 100).toLocaleString('tr-TR', { maximumFractionDigits: 2 })}` : '—');
const pctEn = (bps) => (Number.isFinite(Number(bps)) ? `${(Number(bps) / 100).toLocaleString('en-US', { maximumFractionDigits: 2 })}%` : '—');

export default function SettlementPreviewModal({
  isOpen,
  onClose,
  lang,
  isLoading,
  error,
  makerShareBps,
  takerShareBps,
  previewData,
  onConfirm,
  confirmLabel,
  disableConfirm,
  userRole = null,
  tokenSymbol = 'USDT',
  decimals = 6,
}) {
  if (!isOpen) return null;
  const isTR = lang === 'TR';
  const fmt = (v) => `${formatTokenUnits(v, decimals)} ${tokenSymbol}`;
  const share = isTR ? pct : pctEn;

  const makerPayout = previewData?.makerPayout ?? previewData?.maker_payout ?? 0;
  const takerPayout = previewData?.takerPayout ?? previewData?.taker_payout ?? 0;
  const totalPool = getPreviewTotalPool(previewData);
  const makerFee = previewData?.makerFee ?? null;
  const takerFee = previewData?.takerFee ?? null;
  const decayed = previewData?.decayedAmount ?? null;
  const makerPctNum = Number(makerShareBps);
  const barMaker = Number.isFinite(makerPctNum) ? Math.max(0, Math.min(100, makerPctNum / 100)) : 50;

  const Row = ({ label, value, sub, strong, you }) => (
    <div className="flex items-start justify-between gap-3 py-2">
      <span className="text-textSecondary">
        {label}
        {you && <span className="ml-1.5 text-[10px] font-bold px-1.5 py-0.5 rounded bg-brand/15 text-brand align-middle">{isTR ? 'SİZ' : 'YOU'}</span>}
        {sub && <span className="block text-[11px] text-textMuted">{sub}</span>}
      </span>
      <span className={`text-right tabular-nums ${strong ? 'font-bold text-textPrimary' : 'text-textSecondary'}`}>{value}</span>
    </div>
  );

  return (
    <div className="fixed inset-0 z-[120] bg-black/70 backdrop-blur-sm flex items-end sm:items-center justify-center sm:p-4" role="dialog" aria-modal="true" aria-labelledby="settlement-preview-title">
      <div className="w-full sm:max-w-lg bg-surface border border-borderSubtle rounded-t-2xl sm:rounded-2xl p-5 md:p-6 shadow-2xl max-h-[calc(100dvh_-_2rem)] overflow-y-auto pb-[calc(1.25rem_+_env(safe-area-inset-bottom))] sm:pb-6">
        <h3 id="settlement-preview-title" className="text-lg font-bold text-textPrimary">
          {isTR ? 'Uzlaşma önizlemesi' : 'Settlement preview'}
        </h3>
        <p className="text-xs text-textMuted mt-1 mb-4">
          {isTR
            ? 'Şu anki zincir tutarlarıyla hesaplandı. Kesin sonucu kabul anındaki kontrat hesabı belirler.'
            : 'Calculated from current on-chain amounts. The contract computes the final result at acceptance.'}
        </p>

        <div className="mb-4">
          <div className="flex justify-between text-xs font-semibold mb-1.5">
            <span className="text-danger">{isTR ? 'Satıcı' : 'Seller'} {share(makerShareBps)}</span>
            <span className="text-success">{isTR ? 'Alıcı' : 'Buyer'} {share(takerShareBps)}</span>
          </div>
          <div className="h-2.5 rounded-full overflow-hidden flex bg-elevated" aria-hidden="true">
            <div className="bg-danger/70" style={{ width: `${barMaker}%` }} />
            <div className="bg-success/70 flex-1" />
          </div>
        </div>

        <div className="bg-elevated border border-borderSubtle rounded-xl px-4 py-1 text-sm divide-y divide-borderSubtle">
          <Row label={isTR ? 'Satıcı alır' : 'Seller receives'} value={fmt(makerPayout)} strong you={userRole === 'maker'}
            sub={makerFee != null ? `${isTR ? 'Ücret' : 'Fee'}: ${fmt(makerFee)}` : null} />
          <Row label={isTR ? 'Alıcı alır' : 'Buyer receives'} value={fmt(takerPayout)} strong you={userRole === 'taker'}
            sub={takerFee != null ? `${isTR ? 'Ücret' : 'Fee'}: ${fmt(takerFee)}` : null} />
          <Row label={isTR ? 'Bölüşülen havuz' : 'Pool being split'} value={fmt(totalPool)}
            sub={isTR ? 'Kalan ana para + iki teminat' : 'Remaining principal + both bonds'} />
          {decayed != null && normalizeRawBigInt(decayed) > 0n && (
            <Row label={isTR ? 'Şimdiye kadar eriyen' : 'Decayed so far'} value={fmt(decayed)} sub={isTR ? 'Hazineye gider, bölüşülmez' : 'Goes to treasury, not split'} />
          )}
        </div>

        {decayed != null && normalizeRawBigInt(decayed) > 0n && (
          <p className="mt-2 text-[11px] text-warning" data-testid="settlement-decay-note">
            {isTR
              ? 'Erime sürüyor: kabul işlemi onaylandığında tutarlar bu önizlemeden biraz düşük olabilir; oran aynı kalır.'
              : 'Decay is ongoing: amounts at confirmation can be slightly lower than this preview; the split stays the same.'}
          </p>
        )}

        <p className="mt-3 text-xs text-textSecondary">
          {isTR
            ? 'Araf bu oranı sizin yerinize belirlemez. Karşı taraf kabul ederse işlem bu oranla zincirde kapanır.'
            : 'Araf does not pick this split for you. If the counterparty accepts, the trade closes on-chain with it.'}
        </p>

        {error && <p className="mt-3 text-xs text-danger bg-danger/10 border border-danger/40 rounded-lg p-2" role="alert">{error}</p>}

        <div className="mt-5 flex flex-col-reverse sm:flex-row gap-2">
          <button
            type="button"
            onClick={onClose}
            className="w-full sm:w-auto px-4 py-2.5 rounded-lg border border-borderStrong text-textSecondary hover:bg-elevated transition"
          >
            {isTR ? 'Kapat' : 'Close'}
          </button>
          <button
            type="button"
            onClick={onConfirm}
            disabled={disableConfirm || isLoading}
            className="w-full sm:flex-1 px-4 py-2.5 rounded-lg font-bold transition bg-brand text-black hover:opacity-90 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {isLoading ? (isTR ? 'İşleniyor…' : 'Processing…') : confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
