import { Info, Landmark, ShieldCheck } from 'lucide-react';
import PaymentRiskBadge from '../../../components/PaymentRiskBadge';
import { fmtNum, fmtPct } from '../../copy';
import { getOrderSideCopy } from '../../orderUiModel';
import { railLabel } from '../../railLabels';
import { useRailCatalogState } from '../../railCatalog';

// [TR] Pazar emir kartı — yalnız sunum. Doldurma kapıları (tier, profil, ban, txGate...) AppViews'te hesaplanır ve
//      hazır "cta" olarak gelir; bu bileşen hiçbir kilidi değiştirmez. Yalnız emirde gerçekten olan veri gösterilir:
//      bilinmeyen ödeme yöntemi, başarı oranı ya da işlem sayısı için rozet uydurulmaz.
// [EN] Market order card — presentation only. Fill gates are computed in AppViews and arrive as a ready "cta"; this
//      component never changes a lock. Only data the order actually carries is shown; nothing is invented.

// [TR] Token işareti (harf + marka rengi); dış görsel kaynağı yok. [EN] Token mark (letter + brand colour); no external asset.
const TOKEN_TONE = { USDC: 'from-blue-500 to-blue-700', USDT: 'from-emerald-500 to-emerald-700' };
export const TokenMark = ({ crypto, size = 'md' }) => (
  <span
    className={`flex shrink-0 items-center justify-center rounded-full bg-gradient-to-br font-bold text-white shadow-sm ring-2 ring-surface ${TOKEN_TONE[crypto] || 'from-slate-500 to-slate-700'} ${size === 'sm' ? 'h-5 w-5 text-[10px]' : 'h-10 w-10 text-sm'}`}
    aria-hidden="true"
  >
    {crypto === 'USDC' ? 'C' : crypto === 'USDT' ? 'T' : String(crypto || '?').slice(0, 1)}
  </span>
);

// [TR] Ödeme yöntemi kısa adı: "Türkiye (IBAN)" → "IBAN"; tam ad title'da. Bilinmeyen kod → rozet yok.
// [EN] Short rail name: "Turkey (IBAN)" → "IBAN"; full name in the title. Unknown code → no badge.
const railShort = (full) => (full ? (full.match(/\(([^)]+)\)/)?.[1] || full) : null);

// [TR] Başarı oranı halkası (0–100). [EN] Success-rate ring (0–100).
const RateRing = ({ value }) => {
  const r = 6.5;
  const len = 2 * Math.PI * r;
  const v = Math.max(0, Math.min(100, Number(value) || 0));
  return (
    <svg viewBox="0 0 16 16" className="h-4 w-4 shrink-0 -rotate-90" aria-hidden="true">
      <circle cx="8" cy="8" r={r} fill="none" strokeWidth="2.5" className="stroke-borderStrong" />
      <circle cx="8" cy="8" r={r} fill="none" strokeWidth="2.5" strokeLinecap="round" className="stroke-brand" strokeDasharray={`${(v / 100) * len} ${len}`} />
    </svg>
  );
};

const badgeCls = 'inline-flex h-6 shrink-0 items-center gap-1 rounded-md border border-borderSubtle bg-elevated px-1.5 text-[11px] font-semibold text-textSecondary';

export default function MarketOrderCard({ order, lang = 'TR', cta, notes = null, footnote = null }) {
  const tr = lang === 'TR';
  const fmt = (n, digits = 2) => fmtNum(n, lang, digits);
  const sideLabel = order.sideLabel || getOrderSideCopy(order.side, 'order', lang) || order.side;
  const { catalog: railCatalog } = useRailCatalogState();
  const railFull = railLabel(order.paymentRail, lang, railCatalog);
  const rail = railShort(railFull);
  const tier = Number(order.tier);
  const bondKnown = order.bondLabel && order.bondLabel !== '—';
  const bondShort = tier === 0 ? (tr ? 'teminatsız' : 'no bond') : (bondKnown ? order.bondLabel : null);
  const bondText = tier === 0 ? (tr ? 'teminatsız' : 'no bond') : (bondKnown ? `${order.bondLabel} ${tr ? 'teminat' : 'bond'}` : null);
  const trades = order.totalTrades ?? order.txCount;
  const hasTrades = Number.isFinite(Number(trades)) && trades !== null && trades !== '';
  const hasRate = order.successRate != null;
  const remaining = Number(order.remainingAmount);
  const minFill = Number(order.minFillAmount);

  // [TR] Satır düzeni (P2P borsalarındaki gibi): 1) emir sahibi + itibar, 2) büyük kur, 3) miktar/limit,
  //      4) yöntem/kademe rozetleri + aksiyon. Uzun kilit etiketi kuru kesmez; kur her zaman tam görünür.
  // [EN] Row layout: 1) owner + reputation, 2) big rate, 3) amount/limit, 4) rail/tier badges + action.
  return (
    <article aria-label={`${sideLabel} · ${order.crypto || ''}`} className="min-w-0 rounded-2xl border border-borderSubtle bg-surface p-3.5 transition-colors hover:border-borderStrong md:p-4">
      <div className="flex min-w-0 items-center gap-2">
        <div className="flex min-w-0 flex-1 flex-wrap items-center gap-x-2.5 gap-y-1 text-xs">
          <span className="min-w-0 truncate font-mono text-textSecondary">{order.maker}</span>
          {hasRate && (
            <span className="inline-flex shrink-0 items-center gap-1 font-semibold tabular-nums text-textPrimary" title={tr ? 'Başarı oranı' : 'Success rate'}>
              <RateRing value={order.successRate} />{fmtPct(order.successRate, lang)}
            </span>
          )}
          {hasTrades && <span className="shrink-0 tabular-nums text-textMuted">{tr ? `${trades} işlem` : `${trades} ${Number(trades) === 1 ? 'trade' : 'trades'}`}</span>}
        </div>
        {/* [TR] Dokunmatik uyumlu açılır özet (hover yok). [EN] Touch-friendly disclosure (no hover). */}
        <details className="group relative shrink-0 text-xs">
          <summary className="relative flex h-8 w-8 cursor-pointer list-none items-center justify-center rounded-full text-textMuted transition hover:bg-elevated hover:text-textPrimary after:absolute after:-inset-1.5 after:content-[''] group-open:bg-elevated group-open:text-textPrimary [&::-webkit-details-marker]:hidden">
            <Info className="h-4 w-4" strokeWidth={2} aria-hidden="true" />
            <span className="sr-only">{tr ? 'Özet' : 'Summary'}</span>
          </summary>
          <div className="absolute right-0 top-full z-30 mt-2 w-[min(18rem,calc(100vw_-_3rem))] rounded-xl border border-borderSubtle bg-surface p-3 text-left shadow-xl">
            <p className="mb-1 text-[10px] tracking-widest text-textMuted">{tr ? 'İŞLEM SAHİBİ ÖZETİ' : 'ORDER OWNER SUMMARY'}</p>
            <p className="mb-2 text-[11px] text-textMuted">{order.ownerSideHint || (tr ? 'Emir sahibi taraf bilgisi' : 'Order owner side context')}</p>
            <div className="mb-2 flex flex-wrap gap-1.5">
              <span className={badgeCls}>{sideLabel}</span>
              <span className={badgeCls}>{order.statusLabel || order.status}</span>
              {bondText && <span className={badgeCls}>{tr ? 'Teminat' : 'Bond'}: {tier === 0 ? bondText : order.bondLabel}</span>}
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div><p className="text-[10px] text-textMuted">{tr ? 'Başarı' : 'Success'}</p><p className="font-semibold text-textPrimary">{hasRate ? fmtPct(order.successRate, lang) : '—'}</p></div>
              <div><p className="text-[10px] text-textMuted">{tr ? 'Toplam işlem' : 'Total trades'}</p><p className="font-mono text-textPrimary">{hasTrades ? trades : '—'}</p></div>
            </div>
            <div className="mt-2 flex items-center justify-between gap-2">
              <p className="text-[10px] text-textMuted">{tr ? 'Güven Görünürlüğü' : 'Trust Visibility'}</p>
              <span className={`rounded border px-2 py-0.5 text-[10px] ${order?.trustSummary?.chipClass || 'border-borderSubtle bg-elevated text-textMuted'}`}>
                {order?.trustSummary?.band ? `${order.trustSummary.band} · ${order.trustSummary.label}` : (order?.trustSummary?.label || (tr ? 'Sinyal yok' : 'Signal unavailable'))}
              </span>
            </div>
            <p className="mt-1 text-[10px] text-textMuted">{tr ? 'Bilgilendirme amaçlıdır.' : 'Informational only.'}</p>
          </div>
        </details>
      </div>

      <div className="mt-2 flex min-w-0 items-center gap-2.5">
        <TokenMark crypto={order.crypto} />
        <p className="flex min-w-0 items-baseline gap-1.5 leading-none">
          {order.hasPrice === false
            ? <span className="text-sm font-medium text-textMuted">{tr ? 'Kur belirtilmedi' : 'No rate set'}</span>
            : (
              <>
                <span className="shrink-0 text-[26px] font-bold tabular-nums tracking-tight text-textPrimary">{fmt(order.rate, 4)}</span>
                <span className="min-w-0 truncate text-xs font-semibold text-textMuted">{order.fiat}<span className="font-normal">/{order.crypto}</span></span>
              </>
            )}
        </p>
      </div>

      <dl className="mt-3 grid grid-cols-2 gap-3 rounded-xl bg-elevated/70 px-3 py-2">
        <div className="min-w-0">
          <dt className="text-[10px] font-semibold uppercase tracking-wider text-textMuted">{tr ? 'Miktar' : 'Available'}</dt>
          <dd className="truncate text-[15px] font-bold tabular-nums text-textPrimary">{fmt(remaining)} <span className="text-xs font-semibold text-textSecondary">{order.crypto}</span></dd>
        </div>
        <div className="min-w-0">
          <dt className="text-[10px] font-semibold uppercase tracking-wider text-textMuted">Limit</dt>
          <dd className="truncate text-[13px] font-semibold tabular-nums leading-[22px] text-textSecondary">
            {Number.isFinite(remaining) && remaining > 0 && minFill !== remaining ? `${fmt(minFill)} – ${fmt(remaining)}` : fmt(minFill)} {order.crypto}
          </dd>
        </div>
      </dl>

      <div className="mt-3 flex min-w-0 items-end gap-2">
        <div className="flex min-w-0 flex-1 flex-wrap items-center gap-1.5">
          {rail && (
            <span className={badgeCls} title={railFull}>
              <Landmark className="h-3 w-3" strokeWidth={2.2} aria-hidden="true" />{rail}
            </span>
          )}
          <span className={badgeCls} title={`Tier ${order.tier}${bondText ? ` · ${bondText}` : ''}`}>
            <ShieldCheck className="h-3 w-3" strokeWidth={2.2} aria-hidden="true" />T{order.tier}{bondShort ? <span className="font-medium text-textMuted">· {bondShort}</span> : null}
          </span>
          {order.paymentRiskSignal && <PaymentRiskBadge lang={lang} riskEntry={order.paymentRiskSignal} compact />}
        </div>
        <button
          type="button"
          onClick={cta.onClick}
          disabled={cta.disabled}
          title={cta.title}
          className={`inline-flex min-h-10 min-w-[6rem] max-w-[11rem] shrink-0 items-center justify-center gap-1.5 rounded-xl px-4 py-1.5 text-center text-sm font-bold leading-tight transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand focus-visible:ring-offset-2 focus-visible:ring-offset-surface ${cta.toneClass}`}
        >
          {cta.content}
        </button>
      </div>
      {notes}
      {footnote}
    </article>
  );
}
