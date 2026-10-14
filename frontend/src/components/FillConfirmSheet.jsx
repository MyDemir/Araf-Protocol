import React from 'react';
import { formatUnits } from 'viem';
import { Lock, TriangleAlert } from 'lucide-react';
import BottomSheet from './BottomSheet';
import { fmtNumber } from '../app/format';
import { fmtBps } from '../app/copy';
import { railLabel } from '../app/railLabels';

// [TR] Emre girme onayı: fon hareketinden önceki son ekran. Mobilde alt sheet, masaüstünde aynı kabuğun kart hali
//      (BottomSheet; cüzdan modalıyla aynı dil). Esc, arka plan, X ve "Vazgeç" vazgeçer. Altyapı kapısı (txGate)
//      pencere açıkken kapanırsa onay düğmesi pasifleşir. Kaynağı olmayan alan "Bilinmiyor" yazar, uydurulmaz.
//      Üst bileşen pencere kapalıyken bunu hiç render etmemelidir (her açılış yeni örnek).
// [EN] Order-entry confirmation: the last screen before funds move. Bottom sheet on phones, card on desktop (shared
//      BottomSheet shell, same language as the wallet modal). Esc, backdrop, X and "Cancel" all dismiss. If the tx
//      gate closes while it is open the confirm button is disabled. Fields without a source read "Unknown".
//      The parent must not render this while closed (each opening is a fresh instance).

const T = {
  TR: {
    titleBuy: 'Alım işlemini onayla',
    titleSell: 'Satış işlemini onayla',
    close: 'Kapat',
    youBuy: 'Alıyorsun',
    youSell: 'Satıyorsun',
    rate: 'Kur',
    counterparty: 'Karşı taraf',
    rail: 'Ödeme yöntemi',
    fee: 'Protokol ücreti',
    feeReceived: 'Kapanışta alacağından kesilir',
    feeBond: 'Kapanışta teminatından kesilir',
    feeNote: 'Kısmi uzlaşmada ücret payına düşen brüt tutardan, karşılıklı iptalde (ödeme bildirildikten sonra) teminattan kesilir; ödeme bildirilmeden iptalde ücret yoktur.',
    changed: 'Koşullar değişti. Yeni değerleri kontrol edip tekrar onaylayın.',
    window: 'Ödeme süresi',
    bond: 'Kilitleyeceğin teminat',
    bondUpper: 'En fazla',
    total: 'Cüzdanından çıkacak toplam',
    totalHintBuy: 'Yalnız teminat kilitlenir; ödemeyi karşı tarafa kendin yaparsın.',
    totalHintSell: 'Satacağın tutar ve teminat kilitlenir.',
    unknown: 'Bilinmiyor',
    noRate: 'Kur belirtilmedi',
    tier: 'Tier',
    hours: 'saat',
    warnBuy: 'Ödemeyi süre içinde bildirmezsen kilit çözülür ve teminatından ceza kesilir.',
    warnSell: 'Alıcı süre içinde ödeme bildirmezse kilidi çözebilirsin; fonların ve teminatın iade edilir.',
    confirm: 'Onayla ve devam et',
    cancel: 'Vazgeç',
    walletNote: 'Cüzdanın önce token onayını (approve), ardından işlemi isteyebilir.',
  },
  EN: {
    titleBuy: 'Confirm purchase',
    titleSell: 'Confirm sale',
    close: 'Close',
    youBuy: 'You buy',
    youSell: 'You sell',
    rate: 'Rate',
    counterparty: 'Counterparty',
    rail: 'Payment method',
    fee: 'Protocol fee',
    feeReceived: 'Taken from what you receive at settlement',
    feeBond: 'Taken from your bond at settlement',
    feeNote: 'In a partial settlement the fee comes from your gross share; on a mutual cancel after payment is reported it comes from your bond; no fee if cancelled before payment is reported.',
    changed: 'Conditions changed. Review the new values and confirm again.',
    window: 'Payment window',
    bond: 'Bond you will lock',
    bondUpper: 'Up to',
    total: 'Total leaving your wallet',
    totalHintBuy: 'Only the bond is locked; you pay the counterparty yourself.',
    totalHintSell: 'The amount you sell and the bond are locked.',
    unknown: 'Unknown',
    noRate: 'No rate set',
    tier: 'Tier',
    hours: 'hours',
    warnBuy: 'If you do not report payment in time, the lock unwinds and a penalty is taken from your bond.',
    warnSell: 'If the buyer does not report payment in time you can unlock; your funds and bond are returned.',
    confirm: 'Confirm and continue',
    cancel: 'Cancel',
    walletNote: 'Your wallet may ask for a token approval first, then the transaction.',
  },
};

// [TR] Gösterilen miktar, hesaplamada kullanılan ham değerden (bigint) üretilir; yalnız ayırıcılar dile göre seçilir.
const tokenText = (raw, decimals, crypto, lang) => {
  if (raw === null || raw === undefined) return null;
  try {
    return `${fmtNumber(formatUnits(BigInt(raw), decimals), lang, { maxFractionDigits: Math.min(decimals, 6) })} ${crypto}`;
  } catch {
    return null;
  }
};

function Row({ label, children, sub, testId }) {
  return (
    <div className="flex items-start justify-between gap-4 py-2.5" data-testid={testId}>
      <dt className="shrink-0 text-sm text-textSecondary">{label}</dt>
      <dd className="min-w-0 break-words text-right text-sm font-semibold tabular-nums text-textPrimary">
        {children}
        {sub ? <span className="mt-0.5 block text-xs font-normal text-textMuted">{sub}</span> : null}
      </dd>
    </div>
  );
}

export default function FillConfirmSheet({ summary, lang = 'EN', txGate = null, onConfirm, onCancel }) {
  const t = T[lang === 'TR' ? 'TR' : 'EN'];
  const decided = React.useRef(false);
  if (!summary) return null;
  const blocked = Boolean(txGate?.blocked);
  const buying = summary.direction === 'buy';
  const { decimals, crypto } = summary;

  const amount = tokenText(summary.fillAmountRaw, decimals, crypto, lang);
  const bond = tokenText(summary.bondRaw, decimals, crypto, lang);
  const total = tokenText(summary.lockTotalRaw, decimals, crypto, lang);
  const feeAmount = tokenText(summary.feeRaw, decimals, crypto, lang);
  // [TR] YALNIZ GÖSTERİM: fiat karşılığı miktar × kur ile tahmin edilir; hiçbir tx parametresi ya da allowance bu
  //      değerden türemez (tx yalnız fillAmountRaw ve requiredAllowance kullanır). Backend'in kaydettiği fiat tutarı
  //      kendi yuvarlamasıyla farklı olabilir.
  // [EN] DISPLAY ONLY: the fiat equivalent is an estimate (amount x rate); no tx parameter or allowance is derived
  //      from it (the tx only uses fillAmountRaw and requiredAllowance).
  const fiatText = summary.rate !== null
    ? `${fmtNumber(Number(formatUnits(BigInt(summary.fillAmountRaw), decimals)) * summary.rate, lang, { minFractionDigits: 2, maxFractionDigits: 2 })} ${summary.fiat}`
    : null;
  const rateText = summary.rate !== null
    ? `${t.rate}: ${fmtNumber(summary.rate, lang, { maxFractionDigits: 4 })} ${summary.fiat} / ${crypto}`
    : null;
  const windowHours = Math.round(summary.paymentWindowMs / 3600000);
  const tierText = summary.counterpartyTier !== null ? `${t.tier} ${summary.counterpartyTier}` : null;
  const railName = railLabel(summary.rail, lang);
  const upper = summary.bondIsUpperBound ? `${t.bondUpper} ` : '';

  const decide = (accepted) => {
    if (decided.current) return;
    if (accepted && blocked) return;
    decided.current = true;
    if (accepted) onConfirm?.(); else onCancel?.();
  };

  return (
    <BottomSheet
      title={buying ? t.titleBuy : t.titleSell}
      titleId="fill-confirm-title"
      closeLabel={t.close}
      onClose={() => decide(false)}
      testId="fill-confirm-sheet"
      panelClassName="sm:max-w-[440px]"
    >
      {summary.conditionsChanged ? (
        <p role="status" className="mb-3 flex items-start gap-2.5 rounded-2xl border border-warning/40 bg-warning/10 px-3.5 py-2.5 text-xs font-semibold leading-snug text-textPrimary" data-testid="fill-confirm-changed">
          <TriangleAlert className="mt-0.5 h-4 w-4 shrink-0 text-warning" strokeWidth={2} aria-hidden="true" />
          <span>{t.changed}</span>
        </p>
      ) : null}
      <div className="rounded-2xl border border-borderSubtle bg-elevated px-4 py-3.5">
        <p className="text-xs font-semibold uppercase tracking-wide text-textMuted">{buying ? t.youBuy : t.youSell}</p>
        <p className="mt-1 break-words text-2xl font-bold leading-tight tabular-nums text-textPrimary" data-testid="fill-confirm-amount">{amount ?? t.unknown}</p>
        <p className="mt-1 text-sm tabular-nums text-textSecondary" data-testid="fill-confirm-fiat">{fiatText ?? t.noRate}</p>
        {rateText && <p className="text-xs tabular-nums text-textMuted" data-testid="fill-confirm-rate">{rateText}</p>}
      </div>

      <dl className="mt-1 divide-y divide-borderSubtle">
        <Row label={t.counterparty} testId="fill-confirm-counterparty">
          <span className="font-mono">{summary.counterparty || t.unknown}</span>
          {tierText ? <span className="ml-2 rounded bg-elevated px-1.5 py-0.5 text-[11px] font-semibold text-textSecondary">{tierText}</span> : null}
        </Row>
        {railName ? <Row label={t.rail} testId="fill-confirm-rail">{railName}</Row> : null}
        <Row
          label={t.fee}
          testId="fill-confirm-fee"
          sub={summary.feeBps !== null ? (summary.feeFrom === 'bond' ? t.feeBond : t.feeReceived) : null}
        >
          {summary.feeBps !== null ? `${fmtBps(summary.feeBps, lang)}${feeAmount ? ` · ${feeAmount}` : ''}` : t.unknown}
        </Row>
        <Row label={t.window} testId="fill-confirm-window">{windowHours} {t.hours}</Row>
      </dl>
      {summary.feeBps !== null ? (
        <p className="mb-1 mt-1 text-xs leading-snug text-textMuted" data-testid="fill-confirm-fee-note">{t.feeNote}</p>
      ) : null}

      <div className="mt-2 rounded-2xl border border-borderStrong bg-elevated px-4 py-3" data-testid="fill-confirm-bond-box">
        <div className="flex items-start justify-between gap-4">
          <span className="flex items-center gap-1.5 text-sm font-semibold text-textPrimary">
            <Lock className="h-4 w-4 shrink-0 text-brand" strokeWidth={2} aria-hidden="true" />
            {t.bond}
          </span>
          <span className="shrink-0 whitespace-nowrap text-right text-sm font-bold tabular-nums text-textPrimary" data-testid="fill-confirm-bond">{upper}{bond ?? t.unknown}</span>
        </div>
        <div className="mt-2 flex items-start justify-between gap-4 border-t border-borderSubtle pt-2">
          <span className="text-sm text-textSecondary">{t.total}</span>
          <span className="shrink-0 whitespace-nowrap text-right text-sm font-semibold tabular-nums text-textPrimary" data-testid="fill-confirm-total">{upper}{total ?? t.unknown}</span>
        </div>
        <p className="mt-1.5 text-xs text-textMuted">{buying ? t.totalHintBuy : t.totalHintSell}</p>
      </div>

      <p className="mt-3 flex items-start gap-2.5 rounded-2xl bg-warning/10 px-3.5 py-3 text-xs leading-snug text-textPrimary" data-testid="fill-confirm-warning">
        <TriangleAlert className="mt-0.5 h-4 w-4 shrink-0 text-warning" strokeWidth={2} aria-hidden="true" />
        <span>{buying ? t.warnBuy : t.warnSell}</span>
      </p>

      {blocked && txGate?.message ? (
        <p role="alert" className="mt-3 rounded-2xl border border-danger/40 bg-danger/10 px-3.5 py-2.5 text-xs leading-snug text-textPrimary" data-testid="fill-confirm-gate">
          {txGate.message}
        </p>
      ) : null}

      <div className="mt-4 flex flex-col gap-2 sm:flex-row-reverse">
        <button
          type="button"
          onClick={() => decide(true)}
          disabled={blocked}
          data-testid="fill-confirm-accept"
          className="h-12 w-full rounded-xl bg-brand text-sm font-bold text-black transition hover:opacity-90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand focus-visible:ring-offset-2 focus-visible:ring-offset-surface disabled:cursor-not-allowed disabled:border disabled:border-borderSubtle disabled:bg-elevated disabled:text-textMuted sm:flex-1"
        >
          {t.confirm}
        </button>
        <button
          type="button"
          onClick={() => decide(false)}
          data-testid="fill-confirm-cancel"
          className="h-12 w-full rounded-xl border border-borderStrong text-sm font-semibold text-textSecondary transition hover:bg-elevated hover:text-textPrimary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand sm:w-auto sm:px-6"
        >
          {t.cancel}
        </button>
      </div>
      <p className="mt-3 text-center text-[11px] text-textMuted">{t.walletNote}</p>
    </BottomSheet>
  );
}
