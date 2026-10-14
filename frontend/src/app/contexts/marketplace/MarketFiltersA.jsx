import { useEffect, useRef, useState } from 'react';
import { ArrowDownUp, Check, ChevronDown, Lock, Plus, RotateCcw, X } from 'lucide-react';
import { MARKET_FIAT_OPTIONS, MARKET_FILTER_DEFAULTS } from './marketFilters';
import { closedRailText, marketResultText } from './marketFiltersVariant';

// [TR] Öneri A — "Şart Cümlesi". Filtreler bir sözleşme maddesi gibi okunur: "TRY ile 500 USDT almak
//      istiyorum; teminatsız emirler." Her vurgulu kelime bir şarttır; kesik çizgili şart açık
//      (varsayılan), dolu şart bağlıdır. Dokununca telefonda alttan sheet, masaüstünde yerinde açılır pencere.
//      State ve davranış değişmez: yalnız setMarketFilter / resetMarketFilters çağrılır.
// [EN] Proposal A — "Clause line". Filters read like a contract clause; dashed slots are open (default), solid
//      slots are bound. Tap opens a bottom sheet on phones and an anchored popover on desktop. State untouched.

const SIDE_TONE = { BUY: 'bg-emerald-500', SELL: 'bg-danger' };

const buildClauses = ({ tr, filters, sortOptions, sortValue, viewerTier }) => {
  const tierEligible = viewerTier != null
    ? (tr ? `girebildiğim (≤ T${viewerTier})` : `enterable (≤ T${viewerTier})`)
    : (tr ? 'girebildiğim' : 'enterable');
  return {
    side: {
      title: tr ? 'İşlem yönü' : 'Trade side',
      options: [
        { value: 'ALL', label: tr ? 'Al ya da sat' : 'Buy or sell', short: tr ? 'alıp satmak' : 'buy or sell' },
        { value: 'BUY', label: tr ? 'Al' : 'Buy', short: tr ? 'almak' : 'buy', hint: tr ? 'Kripto satan emirler' : 'Orders selling crypto', dot: SIDE_TONE.BUY },
        { value: 'SELL', label: tr ? 'Sat' : 'Sell', short: tr ? 'satmak' : 'sell', hint: tr ? 'Kripto alan emirler' : 'Orders buying crypto', dot: SIDE_TONE.SELL },
      ],
      value: filters.side,
    },
    token: {
      title: tr ? 'Varlık' : 'Asset',
      options: [
        { value: 'ALL', label: tr ? 'USDT ya da USDC' : 'USDT or USDC', short: 'USDT/USDC' },
        { value: 'USDT', label: 'USDT' },
        { value: 'USDC', label: 'USDC' },
      ],
      value: filters.token,
    },
    fiat: {
      title: tr ? 'Para birimi' : 'Currency',
      options: [
        { value: 'ALL', label: tr ? 'Her döviz' : 'Any currency', short: tr ? 'her döviz' : 'any currency' },
        ...MARKET_FIAT_OPTIONS.map((c) => ({ value: c, label: c })),
      ],
      value: filters.fiat,
    },
    tier: {
      title: tr ? 'Teminat kademesi' : 'Bond tier',
      options: [
        { value: 'ALL', label: tr ? 'Tüm kademeler' : 'All tiers', short: tr ? 'her kademeden' : 'all-tier' },
        { value: 'NO_BOND', label: tr ? 'Teminatsız (Tier 0)' : 'No bond (Tier 0)', short: tr ? 'teminatsız' : 'no-bond' },
        {
          value: 'ELIGIBLE',
          label: viewerTier != null ? (tr ? `Girebildiklerim (≤ T${viewerTier})` : `I can take (≤ T${viewerTier})`) : (tr ? 'Girebildiklerim' : 'I can take'),
          short: tierEligible,
          hint: viewerTier == null ? (tr ? 'Giriş yapınca açılır' : 'Available after sign-in') : undefined,
          disabled: viewerTier == null,
        },
      ],
      value: filters.tier,
    },
    sort: {
      title: tr ? 'Sıralama' : 'Sort',
      options: sortOptions,
      value: sortValue,
      neutral: true,
      icon: <ArrowDownUp className="h-3.5 w-3.5 shrink-0 text-textSecondary" strokeWidth={2} aria-hidden="true" />,
    },
  };
};

const optionShort = (clause) => {
  const o = clause.options.find((x) => x.value === clause.value) || clause.options[0];
  return o.short || o.label;
};

// [TR] Şart görsel olarak 40px, dokunma alanı ::after ile 44px. Açık (varsayılan) şart kesik çizgili, bağlı şart dolu.
// [EN] 40px visual slot with a 44px hit area via ::after. Dashed = open (default), solid = bound.
const slotCls = (bound, neutral = false) => `relative inline-flex h-10 max-w-full items-center gap-1.5 rounded-xl border px-3 text-sm font-semibold transition duration-150 after:absolute after:-inset-y-0.5 after:inset-x-0 after:content-[''] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand motion-reduce:transition-none md:text-[15px] ${
  neutral
    ? 'border-borderSubtle bg-elevated text-textPrimary hover:border-borderStrong'
    : bound
      ? 'border-brand/60 bg-brand/[0.12] text-textPrimary hover:bg-brand/[0.18]'
      : 'border-dashed border-textMuted/60 text-textPrimary hover:border-brand/60 hover:bg-brand/[0.05]'
}`;

function ClauseSlot({ clause, onPick, tr, testId }) {
  const [open, setOpen] = useState(false);
  const [shown, setShown] = useState(false);
  const [alignRight, setAlignRight] = useState(false);
  const wrapRef = useRef(null);
  const btnRef = useRef(null);
  const listRef = useRef(null);
  const bound = !clause.neutral && clause.value !== clause.options[0].value;
  const current = clause.options.find((o) => o.value === clause.value) || clause.options[0];

  const close = (refocus = true) => {
    setShown(false);
    setOpen(false);
    if (refocus) btnRef.current?.focus({ preventScroll: true });
  };
  const closeRef = useRef(close);
  useEffect(() => { closeRef.current = close; });

  useEffect(() => {
    if (!open) return undefined;
    const id = requestAnimationFrame(() => setShown(true));
    const selected = listRef.current?.querySelector('[aria-checked="true"]') || listRef.current?.querySelector('button:not([disabled])');
    selected?.focus({ preventScroll: true });
    const onKey = (e) => { if (e.key === 'Escape') { e.stopPropagation(); closeRef.current(); } };
    const onDown = (e) => { if (wrapRef.current && !wrapRef.current.contains(e.target)) closeRef.current(false); };
    window.addEventListener('keydown', onKey);
    document.addEventListener('pointerdown', onDown);
    return () => { cancelAnimationFrame(id); window.removeEventListener('keydown', onKey); document.removeEventListener('pointerdown', onDown); };
  }, [open]);

  const toggle = () => {
    if (open) { close(); return; }
    const r = btnRef.current?.getBoundingClientRect();
    setAlignRight(Boolean(r && r.left + 300 > window.innerWidth - 16));
    setOpen(true);
  };

  // [TR] Ok tuşlarıyla seçenekler arasında gezinme (radiogroup). [EN] Arrow-key roving within the radiogroup.
  const onListKey = (e) => {
    if (!['ArrowDown', 'ArrowUp'].includes(e.key)) return;
    e.preventDefault();
    const items = [...(listRef.current?.querySelectorAll('button:not([disabled])') || [])];
    const i = items.indexOf(document.activeElement);
    const next = items[(i + (e.key === 'ArrowDown' ? 1 : -1) + items.length) % items.length];
    next?.focus();
  };

  return (
    <span ref={wrapRef} className="relative inline-flex max-w-full">
      <button
        ref={btnRef}
        type="button"
        data-testid={testId}
        aria-haspopup="dialog"
        aria-expanded={open}
        aria-label={`${clause.title}: ${current.label}`}
        onClick={toggle}
        className={slotCls(bound, clause.neutral)}
      >
        {clause.icon}
        {current.dot && <span className={`h-2 w-2 shrink-0 rounded-full ${current.dot}`} aria-hidden="true" />}
        <span className="truncate">{optionShort(clause)}</span>
        <ChevronDown className={`h-4 w-4 shrink-0 text-textSecondary transition-transform duration-200 motion-reduce:transition-none ${open ? 'rotate-180' : ''}`} strokeWidth={2} aria-hidden="true" />
      </button>
      {open && (
        <>
          <span
            aria-hidden="true"
            onClick={() => close(false)}
            className={`fixed inset-0 z-[100] bg-black/60 backdrop-blur-sm transition-opacity duration-200 motion-reduce:transition-none md:hidden ${shown ? 'opacity-100' : 'opacity-0'}`}
          />
          <div
            role="dialog"
            aria-label={clause.title}
            className={`fixed inset-x-0 bottom-0 z-[101] max-h-[calc(100dvh_-_3rem)] overflow-y-auto rounded-t-[1.75rem] border border-b-0 border-borderSubtle bg-surface px-5 pb-[calc(1.25rem_+_env(safe-area-inset-bottom))] shadow-2xl transition duration-300 ease-out motion-reduce:transition-none md:absolute md:inset-x-auto md:bottom-auto md:top-full md:mt-2 md:w-[300px] md:max-h-none md:rounded-2xl md:border-b md:p-2 md:shadow-xl md:duration-150 ${
              alignRight ? 'md:right-0' : 'md:left-0'
            } ${shown ? 'translate-y-0 md:scale-100 md:opacity-100' : 'translate-y-full md:translate-y-0 md:scale-95 md:opacity-0'}`}
          >
            <div className="mx-auto mt-2.5 h-1.5 w-10 rounded-full bg-textMuted/40 md:hidden" aria-hidden="true" />
            <div className="flex items-center justify-between gap-3 pb-3 pt-2 md:hidden">
              <p className="text-lg font-bold tracking-tight text-textPrimary">{clause.title}</p>
              <button
                type="button"
                onClick={() => close()}
                aria-label={tr ? 'Kapat' : 'Close'}
                className="-mr-2.5 flex h-11 w-11 shrink-0 items-center justify-center rounded-full text-textSecondary transition hover:bg-elevated hover:text-textPrimary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand motion-reduce:transition-none"
              >
                <X className="h-5 w-5" strokeWidth={2} aria-hidden="true" />
              </button>
            </div>
            <p className="hidden px-2.5 pb-1.5 pt-1 text-[11px] font-semibold tracking-wider text-textSecondary md:block">{clause.title}</p>
            <div ref={listRef} role="radiogroup" aria-label={clause.title} onKeyDown={onListKey} className="space-y-2 md:space-y-1">
              {clause.options.map((o) => {
                const on = o.value === clause.value;
                return (
                  <button
                    key={o.value}
                    type="button"
                    role="radio"
                    aria-checked={on}
                    disabled={o.disabled}
                    data-filter={testId?.replace('market-clause-', '')}
                    data-value={o.value}
                    onClick={() => { onPick(o.value); close(); }}
                    className={`flex min-h-[56px] w-full items-center gap-3 rounded-2xl border px-3.5 py-2.5 text-left transition duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-brand disabled:cursor-not-allowed disabled:opacity-60 motion-reduce:transition-none md:min-h-[44px] md:rounded-xl md:border-transparent md:px-2.5 md:py-2 ${
                      on ? 'border-brand/50 bg-brand/[0.08] md:bg-brand/[0.1]' : 'border-borderSubtle bg-elevated hover:bg-brand/[0.06] md:bg-transparent'
                    }`}
                  >
                    {o.dot && <span className={`h-2.5 w-2.5 shrink-0 rounded-full ${o.dot}`} aria-hidden="true" />}
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-[15px] font-semibold text-textPrimary md:text-sm">{o.label}</span>
                      {o.hint && <span className="mt-0.5 block text-xs text-textSecondary">{o.hint}</span>}
                    </span>
                    <span className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-full ${on ? 'bg-brand text-black' : 'border border-borderStrong'}`} aria-hidden="true">
                      {on && <Check className="h-3.5 w-3.5" strokeWidth={3} />}
                    </span>
                  </button>
                );
              })}
            </div>
          </div>
        </>
      )}
    </span>
  );
}

const Word = ({ children }) => <span className="text-sm text-textSecondary md:text-[15px]">{children}</span>;

export default function MarketFiltersA({
  lang = 'TR', filters: rawFilters, setFilter, onReset, activeFilterCount = 0, sortOptions = [], sortValue,
  viewerTier = null, canHideOwn = false, result = {}, closedRailCount = 0, children,
}) {
  const tr = lang === 'TR';
  const filters = { ...MARKET_FILTER_DEFAULTS, ...rawFilters };
  const c = buildClauses({ tr, filters, sortOptions, sortValue, viewerTier });
  const unit = filters.token === 'ALL' ? 'USD₮/C' : filters.token;
  const amountSet = String(filters.amount || '').trim() !== '';
  const slot = (key) => <ClauseSlot key={key} clause={c[key]} tr={tr} testId={`market-clause-${key}`} onPick={(v) => setFilter(key, v)} />;
  const amount = (
    <label key="amount" className={`${slotCls(amountSet)} cursor-text gap-1 pr-2.5 focus-within:ring-2 focus-within:ring-brand`}>
      <input
        type="number"
        inputMode="decimal"
        min="0"
        value={filters.amount}
        onChange={(e) => setFilter('amount', e.target.value)}
        placeholder={tr ? 'tutar' : 'amount'}
        aria-label={tr ? 'İşlem tutarı' : 'Trade amount'}
        style={{ width: `${Math.max(4, String(filters.amount || '').length + 1)}ch` }}
        className="min-w-0 max-w-[9ch] bg-transparent text-sm font-semibold md:text-[15px] tabular-nums text-textPrimary outline-none placeholder:font-semibold placeholder:text-textSecondary [-moz-appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none"
      />
      <span className="text-[11px] font-semibold text-textSecondary">{unit}</span>
    </label>
  );
  const hideOwn = canHideOwn ? (
    <button
      key="hideOwn"
      type="button"
      aria-pressed={filters.hideOwn}
      onClick={() => setFilter('hideOwn', !filters.hideOwn)}
      className={slotCls(filters.hideOwn)}
    >
      <span className={`flex h-5 w-5 shrink-0 items-center justify-center rounded-md ${filters.hideOwn ? 'bg-brand text-black' : 'border border-borderStrong'}`} aria-hidden="true">
        {filters.hideOwn && <Check className="h-3.5 w-3.5" strokeWidth={3} />}
      </span>
      {tr ? 'kendi emirlerim hariç' : 'excluding mine'}
    </button>
  ) : null;

  // [TR] Dil başına kelime sırası. [EN] Word order per language.
  const sentence = tr
    ? [slot('fiat'), <Word key="w1">ile</Word>, amount, slot('token'), slot('side'), <Word key="w2">istiyorum;</Word>, slot('tier'), <Word key="w3">emirler.</Word>, hideOwn]
    : [<Word key="w0">I want to</Word>, slot('side'), amount, slot('token'), <Word key="w1">for</Word>, slot('fiat'), <Word key="w2">·</Word>, slot('tier'), <Word key="w3">orders.</Word>, hideOwn];

  return (
    <>
      <section role="search" aria-label={tr ? 'Pazar filtreleri' : 'Market filters'} data-testid="market-filters-a" className="relative mb-4 overflow-visible rounded-[1.25rem] border border-borderSubtle bg-surface p-4 md:p-5">
        <span className="pointer-events-none absolute inset-x-6 top-0 h-px bg-gradient-to-r from-transparent via-brand/50 to-transparent" aria-hidden="true" />
        <div className={`flex items-center justify-between gap-3 ${activeFilterCount > 0 ? '-mt-1.5 mb-1.5' : 'mb-3'}`}>
          <div className="flex items-center gap-2">
            <span className="flex h-6 w-6 items-center justify-center rounded-lg border border-borderSubtle bg-elevated font-serif text-sm font-bold leading-none text-textPrimary" aria-hidden="true">§</span>
            <p className="text-[11px] font-semibold tracking-[0.14em] text-textSecondary">{tr ? 'ŞARTLARIN' : 'YOUR TERMS'}</p>
            {activeFilterCount > 0 && (
              <span className="rounded-full bg-brand/15 px-2 py-0.5 text-[11px] font-bold tabular-nums text-textPrimary">
                {tr ? `${activeFilterCount} bağlı` : `${activeFilterCount} set`}
              </span>
            )}
          </div>
          {activeFilterCount > 0 && (
            <button
              type="button"
              onClick={() => onReset?.()}
              className="-mr-2 inline-flex h-11 items-center gap-1.5 rounded-xl px-3 text-sm font-semibold text-textSecondary transition hover:bg-elevated hover:text-textPrimary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand motion-reduce:transition-none"
            >
              <RotateCcw className="h-4 w-4" strokeWidth={2} aria-hidden="true" />{tr ? 'Sıfırla' : 'Reset'}
            </button>
          )}
        </div>
        <div className="flex flex-wrap items-center gap-x-1.5 gap-y-2 leading-none">{sentence}</div>
        {/* [TR] Sıralama filtre sayılmaz; sonuç satırında durur. [EN] Sort is not a filter; it lives on the result line. */}
        <div className="mt-4 border-t border-borderSubtle pt-3">
          <div className="flex items-center justify-between gap-3">
            <p aria-live="polite" className="text-sm font-semibold tabular-nums text-textPrimary">{marketResultText({ tr, ...result })}</p>
            <span className="shrink-0">{slot('sort')}</span>
          </div>
          {closedRailCount > 0 && (
            <p className="mt-2 flex items-start gap-1.5 text-xs text-textSecondary">
              <Lock className="mt-px h-3.5 w-3.5 shrink-0" strokeWidth={2} aria-hidden="true" />
              <span>{closedRailText(tr, closedRailCount)}</span>
            </p>
          )}
        </div>
      </section>
      {children}
    </>
  );
}

// [TR] Boş sonuç: hangi şartın listeyi daralttığını gösterir; her şart tek dokunuşla gevşetilir.
// [EN] Empty result: lists the binding clauses; each one can be loosened with a single tap.
export function MarketEmptyA({ lang = 'TR', filters: rawFilters, setFilter, onReset, activeFilterCount = 0, isNarrowed, feedError, canCreate, onCreate, viewerTier = null }) {
  const tr = lang === 'TR';
  const f = { ...MARKET_FILTER_DEFAULTS, ...rawFilters };
  const unit = f.token === 'ALL' ? 'USD₮/C' : f.token;
  const chips = [
    f.side !== 'ALL' && { key: 'side', label: f.side === 'BUY' ? (tr ? 'yalnız al' : 'buy only') : (tr ? 'yalnız sat' : 'sell only') },
    f.token !== 'ALL' && { key: 'token', label: f.token },
    f.fiat !== 'ALL' && { key: 'fiat', label: f.fiat },
    String(f.amount || '').trim() !== '' && Number(f.amount) > 0 && { key: 'amount', label: `${f.amount} ${unit}` },
    f.tier !== 'ALL' && { key: 'tier', label: f.tier === 'NO_BOND' ? (tr ? 'teminatsız' : 'no bond') : (viewerTier != null ? `≤ T${viewerTier}` : (tr ? 'girebildiğim' : 'enterable')) },
    f.hideOwn && { key: 'hideOwn', label: tr ? 'kendi emirlerim hariç' : 'excluding mine' },
  ].filter(Boolean);
  const title = feedError
    ? (tr ? 'Pazar verisi alınamadı. Bağlantı düzelince liste otomatik yenilenecek.' : 'Market data unavailable. The list refreshes automatically.')
    : isNarrowed
      ? (tr ? 'Bu şartlarla eşleşen emir yok.' : 'No orders match these terms.')
      : (tr ? 'Henüz açık emir yok.' : 'No open orders yet.');
  return (
    <div data-testid="market-empty-a" className="rounded-[1.25rem] border border-dashed border-borderStrong bg-surface/60 p-6 text-center md:p-8">
      <span className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-2xl border border-borderSubtle bg-elevated font-serif text-xl font-bold text-textSecondary" aria-hidden="true">§</span>
      <p className="text-[15px] font-semibold text-textPrimary">{title}</p>
      {!feedError && chips.length > 0 && (
        <>
          <p className="mt-1 text-sm text-textSecondary">{tr ? 'Bir şartı gevşetin:' : 'Loosen a term:'}</p>
          <ul className="mt-3 flex flex-wrap justify-center gap-2">
            {chips.map((ch) => (
              <li key={ch.key}>
                <button
                  type="button"
                  onClick={() => setFilter(ch.key, MARKET_FILTER_DEFAULTS[ch.key])}
                  aria-label={tr ? `${ch.label} şartını kaldır` : `Remove ${ch.label}`}
                  className="inline-flex h-11 items-center gap-1.5 rounded-xl border border-brand/50 bg-brand/[0.1] px-3 text-sm font-semibold text-textPrimary transition hover:bg-brand/[0.16] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand motion-reduce:transition-none"
                >
                  <X className="h-4 w-4 text-textSecondary" strokeWidth={2} aria-hidden="true" />{ch.label}
                </button>
              </li>
            ))}
          </ul>
        </>
      )}
      <div className="mt-5 flex flex-wrap justify-center gap-2">
        {!feedError && activeFilterCount > 0 && (
          <button type="button" onClick={() => onReset?.()} className="inline-flex h-11 items-center gap-1.5 rounded-xl border border-borderSubtle bg-elevated px-4 text-sm font-semibold text-textPrimary transition hover:border-borderStrong focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand motion-reduce:transition-none">
            <RotateCcw className="h-4 w-4" strokeWidth={2} aria-hidden="true" />{tr ? 'Tüm şartları sıfırla' : 'Reset all terms'}
          </button>
        )}
        {canCreate && !feedError && (
          <button type="button" onClick={onCreate} className="inline-flex h-11 items-center gap-1.5 rounded-xl bg-brand px-4 text-sm font-semibold text-black transition hover:opacity-90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand focus-visible:ring-offset-2 motion-reduce:transition-none">
            <Plus className="h-4 w-4" strokeWidth={2} aria-hidden="true" />{isNarrowed ? (tr ? 'Emir oluştur' : 'Create order') : (tr ? 'İlk emri oluştur' : 'Create the first order')}
          </button>
        )}
      </div>
    </div>
  );
}
