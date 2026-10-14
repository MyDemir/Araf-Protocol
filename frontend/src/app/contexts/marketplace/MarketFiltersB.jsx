import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { ArrowDownUp, Check, Lock, Plus, RotateCcw, SlidersHorizontal, X } from 'lucide-react';
import { MARKET_FIAT_OPTIONS, MARKET_FILTER_DEFAULTS } from './marketFilters';
import { closedRailText, marketResultText } from './marketFiltersVariant';

// [TR] Öneri B — "Kademe Konsolu". Telefonda yapışkan, kompakt bir konsol: büyük Al/Sat anahtarı ve yatay kayan
//      hızlı çipler; "Filtreler" alttan tam bir sheet açar. Masaüstünde aynı bölümler solda sabit bir panelde durur.
//      Teminat kademesi T0–T4 merdiveniyle gösterilir: seçimin hangi kademeleri kapsadığı bir bakışta görünür.
//      State ve davranış değişmez: yalnız setMarketFilter / resetMarketFilters çağrılır.
// [EN] Proposal B — "Tier console". Sticky compact console on phones (big buy/sell switch + quick chips, full
//      bottom sheet for everything); a sticky side panel on desktop. Bond tiers drawn as a T0–T4 ladder.

const TIERS = [0, 1, 2, 3, 4];
const H = 'text-[11px] font-semibold tracking-[0.14em] text-textSecondary';
const focusRing = 'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand';
const motion = 'transition duration-150 motion-reduce:transition-none';

const Ladder = ({ lit }) => (
  <span className="flex h-7 items-end gap-[3px]" aria-hidden="true">
    {TIERS.map((t) => (
      <span key={t} style={{ height: `${36 + t * 16}%` }} className={`w-[5px] rounded-[2px] ${lit(t) ? 'bg-brand' : 'bg-borderStrong'}`} />
    ))}
  </span>
);

function SideSwitch({ tr, value, onChange }) {
  const items = [
    { value: 'ALL', label: tr ? 'Tümü' : 'All', tone: 'bg-elevated border border-borderStrong', text: 'text-textPrimary' },
    { value: 'BUY', label: tr ? 'Al' : 'Buy', tone: 'bg-emerald-600', text: 'text-white' },
    { value: 'SELL', label: tr ? 'Sat' : 'Sell', tone: 'bg-danger', text: 'text-white' },
  ];
  const idx = Math.max(0, items.findIndex((i) => i.value === value));
  const onKey = (e) => {
    if (!['ArrowRight', 'ArrowLeft'].includes(e.key)) return;
    e.preventDefault();
    const next = items[(idx + (e.key === 'ArrowRight' ? 1 : -1) + items.length) % items.length];
    onChange(next.value);
    e.currentTarget.querySelector(`[data-value="${next.value}"]`)?.focus();
  };
  return (
    <div role="radiogroup" aria-label={tr ? 'İşlem yönü' : 'Trade side'} onKeyDown={onKey} className="relative grid grid-cols-3 rounded-2xl border border-borderSubtle bg-surface p-1">
      <span
        aria-hidden="true"
        style={{ transform: `translateX(${idx * 100}%)` }}
        className={`absolute bottom-1 left-1 top-1 w-[calc((100%_-_0.5rem)/3)] rounded-xl shadow-sm transition-[transform,background-color] duration-300 ease-out motion-reduce:transition-none ${items[idx].tone}`}
      />
      {items.map((it, i) => (
        <button
          key={it.value}
          type="button"
          role="radio"
          aria-checked={i === idx}
          tabIndex={i === idx ? 0 : -1}
          data-value={it.value}
          onClick={() => onChange(it.value)}
          className={`relative z-[1] h-11 rounded-xl text-sm font-bold ${motion} ${focusRing} ${i === idx ? it.text : 'text-textSecondary hover:text-textPrimary'}`}
        >{it.label}</button>
      ))}
    </div>
  );
}

const chipCls = (on) => `inline-flex h-11 shrink-0 snap-start items-center gap-1.5 rounded-full border px-3.5 text-sm font-semibold ${motion} ${focusRing} ${
  on ? 'border-brand/50 bg-brand/[0.12] text-textPrimary' : 'border-borderSubtle bg-surface text-textSecondary hover:text-textPrimary hover:border-borderStrong'
}`;

const TokenDot = ({ sym }) => (
  <span className={`flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-[10px] font-bold text-white ${sym === 'USDC' ? 'bg-blue-600' : 'bg-emerald-600'}`} aria-hidden="true">{sym === 'USDC' ? 'C' : 'T'}</span>
);

// [TR] Sheet ve masaüstü panelinin ortak bölümleri. [EN] Sections shared by the sheet and the desktop panel.
function FilterSections({ tr, f, setFilter, sortOptions, sortValue, viewerTier, canHideOwn, dense = false }) {
  const unit = f.token === 'ALL' ? 'USD₮/C' : f.token;
  const gap = dense ? 'space-y-5' : 'space-y-6';
  const tierOpts = [
    { value: 'ALL', label: tr ? 'Tümü' : 'All', lit: () => true },
    { value: 'NO_BOND', label: tr ? 'Teminatsız' : 'No bond', lit: (t) => t === 0 },
    {
      value: 'ELIGIBLE',
      label: viewerTier != null ? `≤ T${viewerTier}` : (tr ? 'Kademem' : 'My tier'),
      sub: viewerTier != null ? (tr ? 'kademem' : 'my tier') : (tr ? 'giriş gerekli' : 'sign in'),
      lit: (t) => viewerTier != null && t <= viewerTier,
      disabled: viewerTier == null,
    },
  ];
  return (
    <div className={gap}>
      <fieldset>
        <legend className={`${H} mb-2.5`}>{tr ? 'VARLIK' : 'ASSET'}</legend>
        <div className="grid grid-cols-3 gap-2">
          {['ALL', 'USDT', 'USDC'].map((v) => {
            const on = f.token === v;
            return (
              <button key={v} type="button" aria-pressed={on} data-filter="token" data-value={v} onClick={() => setFilter('token', v)}
                className={`flex h-12 items-center justify-center gap-1.5 rounded-xl border text-sm font-semibold ${motion} ${focusRing} ${on ? 'border-brand/50 bg-brand/[0.1] text-textPrimary' : 'border-borderSubtle bg-elevated text-textSecondary hover:text-textPrimary'}`}>
                {v !== 'ALL' && <TokenDot sym={v} />}{v === 'ALL' ? (tr ? 'Hepsi' : 'Any') : v}
              </button>
            );
          })}
        </div>
      </fieldset>
      <fieldset>
        <legend className={`${H} mb-2.5`}>{tr ? 'PARA BİRİMİ' : 'CURRENCY'}</legend>
        <div className="grid grid-cols-4 gap-2">
          {['ALL', ...MARKET_FIAT_OPTIONS].map((v) => {
            const on = f.fiat === v;
            return (
              <button key={v} type="button" aria-pressed={on} data-filter="fiat" data-value={v} onClick={() => setFilter('fiat', v)}
                className={`h-11 rounded-xl border text-sm font-semibold ${motion} ${focusRing} ${on ? 'border-brand/50 bg-brand/[0.1] text-textPrimary' : 'border-borderSubtle bg-elevated text-textSecondary hover:text-textPrimary'}`}>
                {v === 'ALL' ? (tr ? 'Tümü' : 'All') : v}
              </button>
            );
          })}
        </div>
      </fieldset>
      <div>
        <label htmlFor={dense ? 'mfb-amount-d' : 'mfb-amount'} className={`${H} mb-2.5 block`}>{tr ? 'TUTAR' : 'AMOUNT'}</label>
        <div className="relative">
          <input
            id={dense ? 'mfb-amount-d' : 'mfb-amount'}
            type="number"
            inputMode="decimal"
            min="0"
            value={f.amount}
            onChange={(e) => setFilter('amount', e.target.value)}
            placeholder={tr ? 'Örn. 250' : 'e.g. 250'}
            aria-label={tr ? 'İşlem tutarı' : 'Trade amount'}
            aria-describedby={dense ? 'mfb-amount-hint-d' : 'mfb-amount-hint'}
            className={`h-12 w-full rounded-xl border border-borderSubtle bg-elevated pl-3.5 pr-20 text-base font-semibold tabular-nums text-textPrimary outline-none placeholder:font-normal placeholder:text-textSecondary focus:border-brand/60 ${motion} [-moz-appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none`}
          />
          <span className="pointer-events-none absolute right-3.5 top-1/2 -translate-y-1/2 text-xs font-semibold text-textSecondary">{unit}</span>
        </div>
        <p id={dense ? 'mfb-amount-hint-d' : 'mfb-amount-hint'} className="mt-1.5 text-xs text-textSecondary">{tr ? 'Bu tutarı tek işlemde karşılayabilen emirler.' : 'Orders that can fill this amount in one trade.'}</p>
      </div>
      <fieldset>
        <legend className={`${H} mb-2.5`}>{tr ? 'TEMİNAT KADEMESİ' : 'BOND TIER'}</legend>
        <div className="grid grid-cols-3 gap-2">
          {tierOpts.map((o) => {
            const on = f.tier === o.value;
            return (
              <button key={o.value} type="button" aria-pressed={on} disabled={o.disabled} data-filter="tier" data-value={o.value} onClick={() => setFilter('tier', o.value)}
                className={`flex min-h-[76px] flex-col items-center justify-center gap-1.5 rounded-xl border px-1.5 py-2 ${motion} ${focusRing} disabled:cursor-not-allowed disabled:opacity-70 ${on ? 'border-brand/50 bg-brand/[0.1]' : 'border-borderSubtle bg-elevated hover:border-borderStrong'}`}>
                <Ladder lit={o.lit} />
                <span className="text-center text-xs font-semibold leading-tight text-textPrimary">
                  {o.label}{o.sub && <span className="block text-[11px] font-medium text-textSecondary">{o.sub}</span>}
                </span>
              </button>
            );
          })}
        </div>
      </fieldset>
      <fieldset>
        <legend className={`${H} mb-2`}>{tr ? 'SIRALAMA' : 'SORT'}</legend>
        <div role="radiogroup" aria-label={tr ? 'Sıralama' : 'Sort'} className="space-y-1">
          {sortOptions.map((o) => {
            const on = sortValue === o.value;
            return (
              <button key={o.value} type="button" role="radio" aria-checked={on} onClick={() => setFilter('sort', o.value)}
                className={`flex h-11 w-full items-center justify-between gap-3 rounded-xl px-3 text-left text-sm font-semibold ${motion} ${focusRing} ${on ? 'bg-brand/[0.1] text-textPrimary' : 'text-textSecondary hover:bg-elevated hover:text-textPrimary'}`}>
                {o.label}
                <span className={`flex h-5 w-5 items-center justify-center rounded-full ${on ? 'bg-brand text-black' : 'border border-borderStrong'}`} aria-hidden="true">{on && <Check className="h-3 w-3" strokeWidth={3} />}</span>
              </button>
            );
          })}
        </div>
      </fieldset>
      {canHideOwn && (
        <button type="button" role="switch" aria-checked={f.hideOwn} onClick={() => setFilter('hideOwn', !f.hideOwn)}
          className={`flex h-12 w-full items-center justify-between gap-3 rounded-xl border border-borderSubtle bg-elevated px-3.5 text-sm font-semibold text-textPrimary ${motion} ${focusRing}`}>
          {tr ? 'Emirlerimi gizle' : 'Hide my orders'}
          <span className={`relative h-6 w-10 shrink-0 rounded-full ${motion} ${f.hideOwn ? 'bg-brand' : 'bg-borderStrong'}`} aria-hidden="true">
            <span className={`absolute top-0.5 h-5 w-5 rounded-full bg-white shadow ${motion} ${f.hideOwn ? 'left-[1.125rem]' : 'left-0.5'}`} />
          </span>
        </button>
      )}
    </div>
  );
}

function FilterSheet({ tr, onClose, count, onReset, resultLabel, children }) {
  const [shown, setShown] = useState(false);
  const panelRef = useRef(null);
  const onCloseRef = useRef(onClose);
  useEffect(() => { onCloseRef.current = onClose; }, [onClose]);
  useEffect(() => {
    const id = requestAnimationFrame(() => setShown(true));
    panelRef.current?.focus({ preventScroll: true });
    const onKey = (e) => { if (e.key === 'Escape') onCloseRef.current(); };
    window.addEventListener('keydown', onKey);
    return () => { cancelAnimationFrame(id); window.removeEventListener('keydown', onKey); };
  }, []);
  return createPortal(
    <div
      className={`fixed inset-0 z-[100] flex items-end justify-center bg-black/60 backdrop-blur-sm transition-opacity duration-200 motion-reduce:transition-none ${shown ? 'opacity-100' : 'opacity-0'}`}
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div
        ref={panelRef}
        tabIndex={-1}
        role="dialog"
        aria-modal="true"
        aria-labelledby="mfb-sheet-title"
        data-testid="market-filters-sheet"
        className={`flex max-h-[calc(100dvh_-_1.5rem_-_env(safe-area-inset-top))] w-full max-w-[480px] flex-col rounded-t-[1.75rem] border border-b-0 border-borderSubtle bg-surface shadow-2xl outline-none transition duration-300 ease-out motion-reduce:transition-none ${shown ? 'translate-y-0' : 'translate-y-full'}`}
      >
        <div className="mx-auto mt-2.5 h-1.5 w-10 shrink-0 rounded-full bg-textMuted/40" aria-hidden="true" />
        <div className="flex shrink-0 items-center justify-between gap-3 px-5 pb-3 pt-2">
          <h2 id="mfb-sheet-title" className="flex items-center gap-2 text-lg font-bold tracking-tight text-textPrimary">
            {tr ? 'Filtreler' : 'Filters'}
            {count > 0 && <span className="rounded-full bg-brand px-2 py-0.5 text-xs font-bold tabular-nums text-black">{count}</span>}
          </h2>
          <button type="button" onClick={onClose} aria-label={tr ? 'Kapat' : 'Close'} className={`-mr-2.5 flex h-11 w-11 shrink-0 items-center justify-center rounded-full text-textSecondary hover:bg-elevated hover:text-textPrimary ${motion} ${focusRing}`}>
            <X className="h-5 w-5" strokeWidth={2} aria-hidden="true" />
          </button>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-5 pb-4">{children}</div>
        <div className="flex shrink-0 gap-2 border-t border-borderSubtle px-5 pb-[calc(1rem_+_env(safe-area-inset-bottom))] pt-3">
          <button type="button" disabled={count === 0} onClick={() => onReset?.()} className={`inline-flex h-12 items-center justify-center gap-1.5 rounded-xl border border-borderSubtle px-4 text-sm font-semibold text-textPrimary disabled:opacity-50 hover:bg-elevated ${motion} ${focusRing}`}>
            <RotateCcw className="h-4 w-4" strokeWidth={2} aria-hidden="true" />{tr ? 'Temizle' : 'Clear'}
          </button>
          <button type="button" onClick={onClose} className={`h-12 flex-1 rounded-xl bg-brand text-sm font-bold text-black hover:opacity-90 ${motion} ${focusRing} focus-visible:ring-offset-2`}>
            {resultLabel}
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
}

const activeChips = ({ tr, f, viewerTier, withQuick = false }) => {
  const unit = f.token === 'ALL' ? 'USD₮/C' : f.token;
  return [
    withQuick && f.token !== 'ALL' && { key: 'token', label: f.token },
    withQuick && f.fiat !== 'ALL' && { key: 'fiat', label: f.fiat },
    String(f.amount || '').trim() !== '' && Number(f.amount) > 0 && { key: 'amount', label: `≥ ${f.amount} ${unit}` },
    f.tier !== 'ALL' && { key: 'tier', label: f.tier === 'NO_BOND' ? (tr ? 'Teminatsız' : 'No bond') : (viewerTier != null ? `≤ T${viewerTier}` : (tr ? 'Girebildiğim' : 'I can take')) },
    f.hideOwn && { key: 'hideOwn', label: tr ? 'Emirlerim gizli' : 'Mine hidden' },
  ].filter(Boolean);
};

export default function MarketFiltersB({
  lang = 'TR', filters: rawFilters, setFilter, onReset, activeFilterCount = 0, sortOptions = [], sortValue,
  viewerTier = null, canHideOwn = false, result = {}, closedRailCount = 0, children,
}) {
  const tr = lang === 'TR';
  const f = { ...MARKET_FILTER_DEFAULTS, ...rawFilters };
  const [sheetOpen, setSheetOpen] = useState(false);
  const openerRef = useRef(null);
  const closeSheet = () => { setSheetOpen(false); openerRef.current?.focus({ preventScroll: true }); };
  const sortLabel = (sortOptions.find((o) => o.value === sortValue) || sortOptions[0])?.label;
  const resultText = marketResultText({ tr, ...result });
  const shown = Number(result.shown) || 0;
  const sheetCta = result.loading ? (tr ? 'Yükleniyor…' : 'Loading…') : (tr ? `${shown} emri göster` : `Show ${shown} ${shown === 1 ? 'order' : 'orders'}`);
  const chips = activeChips({ tr, f, viewerTier });
  const deskChips = activeChips({ tr, f, viewerTier, withQuick: true });
  const sectionProps = { tr, f, setFilter, sortOptions, sortValue, viewerTier, canHideOwn };

  const toChip = (ch) => (
    <button key={ch.key} type="button" onClick={() => setFilter(ch.key, MARKET_FILTER_DEFAULTS[ch.key])} aria-label={tr ? `${ch.label} filtresini kaldır` : `Remove ${ch.label}`} className={chipCls(true)}>
      {ch.label}<X className="h-4 w-4 text-textSecondary" strokeWidth={2} aria-hidden="true" />
    </button>
  );

  return (
    <div data-testid="market-filters-b" className="lg:grid lg:grid-cols-[17.5rem_minmax(0,1fr)] lg:items-start lg:gap-6">
      {/* [TR] Masaüstü: solda sabit panel. [EN] Desktop: sticky side panel. */}
      <aside role="search" aria-label={tr ? 'Pazar filtreleri' : 'Market filters'} className="hidden lg:sticky lg:top-4 lg:block">
        <div className="max-h-[calc(100dvh_-_7rem)] overflow-y-auto overscroll-contain rounded-[1.25rem] border border-borderSubtle bg-surface p-4">
          <div className="mb-4 flex min-h-[2.75rem] items-center justify-between gap-2">
            <p className="flex items-center gap-2 text-sm font-bold text-textPrimary">
              <SlidersHorizontal className="h-4 w-4 text-textSecondary" strokeWidth={2} aria-hidden="true" />
              {tr ? 'Filtreler' : 'Filters'}
              {activeFilterCount > 0 && <span className="rounded-full bg-brand px-2 py-0.5 text-[11px] font-bold tabular-nums text-black">{activeFilterCount}</span>}
            </p>
            {activeFilterCount > 0 && (
              <button type="button" onClick={() => onReset?.()} className={`-mr-1.5 inline-flex h-11 items-center gap-1.5 rounded-xl px-2.5 text-xs font-semibold text-textSecondary hover:bg-elevated hover:text-textPrimary ${motion} ${focusRing}`}>
                <RotateCcw className="h-3.5 w-3.5" strokeWidth={2} aria-hidden="true" />{tr ? 'Temizle' : 'Clear'}
              </button>
            )}
          </div>
          <div className="mb-5"><SideSwitch tr={tr} value={f.side} onChange={(v) => setFilter('side', v)} /></div>
          <FilterSections {...sectionProps} dense />
        </div>
      </aside>

      <div className="min-w-0">
        {/* [TR] Telefon: yapışkan konsol. [EN] Phone: sticky console. */}
        <div role="search" aria-label={tr ? 'Pazar filtreleri' : 'Market filters'} className="sticky top-0 z-20 -mx-4 mb-2 bg-app/90 px-4 pb-2 pt-2 backdrop-blur-md md:-mx-8 md:px-8 lg:hidden">
          <SideSwitch tr={tr} value={f.side} onChange={(v) => setFilter('side', v)} />
          <div className="relative -mx-4 mt-2 md:-mx-8">
            <div className="flex snap-x scroll-px-4 gap-2 overflow-x-auto px-4 py-0.5 md:scroll-px-8 [scrollbar-width:none] md:px-8 [&::-webkit-scrollbar]:hidden">
              <button
                ref={openerRef}
                type="button"
                data-testid="market-filters-open"
                aria-haspopup="dialog"
                aria-expanded={sheetOpen}
                onClick={() => setSheetOpen(true)}
                className={`${chipCls(activeFilterCount > 0)} pl-3`}
              >
                <SlidersHorizontal className="h-4 w-4" strokeWidth={2} aria-hidden="true" />
                {tr ? 'Filtreler' : 'Filters'}
                {activeFilterCount > 0 && <span className="rounded-full bg-brand px-1.5 text-[11px] font-bold leading-5 tabular-nums text-black">{activeFilterCount}</span>}
              </button>
              {['USDT', 'USDC'].map((sym) => (
                <button key={sym} type="button" aria-pressed={f.token === sym} onClick={() => setFilter('token', f.token === sym ? 'ALL' : sym)} className={chipCls(f.token === sym)}>
                  <TokenDot sym={sym} />{sym}
                </button>
              ))}
              {MARKET_FIAT_OPTIONS.map((c) => (
                <button key={c} type="button" aria-pressed={f.fiat === c} data-filter="fiat" data-value={c} onClick={() => setFilter('fiat', f.fiat === c ? 'ALL' : c)} className={chipCls(f.fiat === c)}>{c}</button>
              ))}
              {chips.map(toChip)}
            </div>
            <span className="pointer-events-none absolute inset-y-0 right-0 w-8 bg-gradient-to-l from-app to-transparent" aria-hidden="true" />
          </div>
        </div>

        {/* [TR] Masaüstü: liste üstünde etkin filtreler. [EN] Desktop: active chips above the list. */}
        {deskChips.length > 0 && <div className="mb-2 hidden flex-wrap gap-2 lg:flex">{deskChips.map(toChip)}</div>}

        <div className="mb-3 flex min-h-[1.75rem] flex-wrap items-center justify-between gap-x-3 gap-y-1 text-xs">
          <p aria-live="polite" className="tabular-nums text-textSecondary">
            <span className="font-semibold text-textPrimary">{resultText}</span>
            {sortLabel && !result.loading && !result.error && <span className="ml-1.5 inline-flex items-center gap-1"><span aria-hidden="true">·</span><ArrowDownUp className="h-3 w-3" strokeWidth={2} aria-hidden="true" />{sortLabel}</span>}
          </p>
          {closedRailCount > 0 && (
            <p className="inline-flex items-center gap-1.5 text-textSecondary">
              <Lock className="h-3.5 w-3.5 shrink-0" strokeWidth={2} aria-hidden="true" />{closedRailText(tr, closedRailCount)}
            </p>
          )}
        </div>

        {children}
      </div>

      {sheetOpen && (
        <FilterSheet tr={tr} onClose={closeSheet} count={activeFilterCount} onReset={onReset} resultLabel={sheetCta}>
          <div className="mb-6"><SideSwitch tr={tr} value={f.side} onChange={(v) => setFilter('side', v)} /></div>
          <FilterSections {...sectionProps} />
        </FilterSheet>
      )}
    </div>
  );
}

// [TR] Boş sonuç: konsolun dilinde; etkin filtreler tek dokunuşla kaldırılır, yön sekmesi ayrıca genişletilebilir.
// [EN] Empty result in console language: active filters removable in one tap; the side tab can be widened too.
export function MarketEmptyB({ lang = 'TR', filters: rawFilters, setFilter, onReset, activeFilterCount = 0, isNarrowed, feedError, canCreate, onCreate }) {
  const tr = lang === 'TR';
  const f = { ...MARKET_FILTER_DEFAULTS, ...rawFilters };
  const title = feedError
    ? (tr ? 'Pazar verisi alınamadı. Bağlantı düzelince liste otomatik yenilenecek.' : 'Market data unavailable. The list refreshes automatically.')
    : isNarrowed
      ? (tr ? 'Bu filtreye uyan emir yok.' : 'No orders match this filter.')
      : (tr ? 'Henüz açık emir yok.' : 'No open orders yet.');
  return (
    <div data-testid="market-empty-b" className="flex flex-col items-center gap-4 rounded-[1.25rem] border border-borderSubtle bg-surface p-6 text-center md:flex-row md:items-center md:gap-5 md:p-6 md:text-left">
      <span className="flex h-14 w-14 shrink-0 items-end justify-center gap-[3px] rounded-2xl border border-borderSubtle bg-elevated pb-3.5" aria-hidden="true">
        {TIERS.map((t) => <span key={t} style={{ height: `${8 + t * 5}px` }} className="w-[5px] rounded-[2px] bg-borderStrong" />)}
      </span>
      <div className="min-w-0 flex-1">
        <p className="text-[15px] font-semibold text-textPrimary">{title}</p>
        {!feedError && isNarrowed && (
          <p className="mt-1 text-sm text-textSecondary">{tr ? 'Filtreleri genişletin ya da bu koşullarla kendi emrinizi açın.' : 'Widen the filters or open your own order.'}</p>
        )}
      </div>
      <div className="flex shrink-0 flex-wrap justify-center gap-2">
        {!feedError && f.side !== 'ALL' && (
          <button type="button" onClick={() => setFilter('side', 'ALL')} className={`h-11 rounded-xl border border-borderSubtle bg-elevated px-4 text-sm font-semibold text-textPrimary hover:border-borderStrong ${motion} ${focusRing}`}>
            {tr ? 'Al + Sat göster' : 'Show buy + sell'}
          </button>
        )}
        {!feedError && activeFilterCount > 0 && (
          <button type="button" onClick={() => onReset?.()} className={`inline-flex h-11 items-center gap-1.5 rounded-xl border border-borderSubtle bg-elevated px-4 text-sm font-semibold text-textPrimary hover:border-borderStrong ${motion} ${focusRing}`}>
            <RotateCcw className="h-4 w-4" strokeWidth={2} aria-hidden="true" />{tr ? `Temizle (${activeFilterCount})` : `Clear (${activeFilterCount})`}
          </button>
        )}
        {canCreate && !feedError && (
          <button type="button" onClick={onCreate} className={`inline-flex h-11 items-center gap-1.5 rounded-xl bg-brand px-4 text-sm font-semibold text-black hover:opacity-90 ${motion} ${focusRing} focus-visible:ring-offset-2`}>
            <Plus className="h-4 w-4" strokeWidth={2} aria-hidden="true" />{isNarrowed ? (tr ? 'Emir oluştur' : 'Create order') : (tr ? 'İlk emri oluştur' : 'Create the first order')}
          </button>
        )}
      </div>
    </div>
  );
}
