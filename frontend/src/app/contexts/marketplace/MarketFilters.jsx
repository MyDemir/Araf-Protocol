import { useEffect, useId, useRef, useState } from 'react';
import { ArrowDownUp, Check, ChevronDown, Lock, Pencil, Plus, RotateCcw, X } from 'lucide-react';
import BottomSheet from '../../../components/BottomSheet';
import { MARKET_FIAT_OPTIONS, MARKET_FILTER_DEFAULTS } from './marketFilters';

// [TR] Pazar filtreleri — "Şart Cümlesi". Filtreler bir sözleşme maddesi gibi okunur: "TRY ile 500 USDT almak
//      istiyorum; teminatsız emirler." Her vurgulu kelime bir şarttır; kesik çizgili şart açık (varsayılan), dolu
//      şart bağlıdır. Masaüstünde (≥768px) cümle yerinde düzenlenir, şartlar çapalı açılır pencerede seçilir.
//      Telefonda cümle kompakt bir özet kartına dönüşür; "Düzenle" aynı cümleyi alttan açılan sheet'te açar.
//      State ve davranış değişmez: yalnız setMarketFilter / resetMarketFilters çağrılır.
// [EN] Market filters — "Clause line". Filters read like a contract clause; dashed slots are open (default), solid
//      slots are bound. Desktop edits the sentence in place with anchored popovers; phones show a compact summary
//      card whose "Edit" opens the same sentence in a bottom sheet. State and behaviour are unchanged.

const DESKTOP_QUERY = '(min-width: 768px)';
const hasMatchMedia = () => typeof window !== 'undefined' && typeof window.matchMedia === 'function';

// [TR] matchMedia yoksa (test/SSR) masaüstü varsayılır. [EN] Desktop is assumed without matchMedia (tests/SSR).
const useIsDesktop = () => {
  const [desktop, setDesktop] = useState(() => (hasMatchMedia() ? window.matchMedia(DESKTOP_QUERY).matches : true));
  useEffect(() => {
    if (!hasMatchMedia()) return undefined;
    const media = window.matchMedia(DESKTOP_QUERY);
    const sync = () => setDesktop(media.matches);
    sync();
    media.addEventListener?.('change', sync);
    return () => media.removeEventListener?.('change', sync);
  }, []);
  return desktop;
};

// [TR] Sonuç satırı metni; mevcut sayaç kuralı aynen. [EN] Result line text; keeps the current counter rule.
export const marketResultText = ({ tr, loading, error, shown, total, loaded }) => {
  if (loading || error) return ' ';
  if (total > loaded) return tr ? `${shown} emir · toplam ${total}` : `${shown} ${shown === 1 ? 'order' : 'orders'} · ${total} total`;
  return tr ? `${shown} emir` : `${shown} ${shown === 1 ? 'order' : 'orders'}`;
};

export const closedRailText = (tr, n) => (tr
  ? `${n} emirde ödeme yöntemi şu an kapalı`
  : `${n} ${n === 1 ? 'order has' : 'orders have'} a closed payment method`);

// [TR] Tutar birimi: token seçili değilse okunaklı "USDT/USDC". [EN] Amount unit: readable "USDT/USDC" when no token is set.
export const amountUnit = (token) => (token === 'USDT' || token === 'USDC' ? token : 'USDT/USDC');

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

const currentOption = (clause) => clause.options.find((o) => o.value === clause.value) || clause.options[0];
const optionShort = (clause) => { const o = currentOption(clause); return o.short || o.label; };
const isBound = (clause) => !clause.neutral && clause.value !== clause.options[0].value;

// [TR] Şart görsel olarak 40px, dokunma alanı ::after ile 44px. Açık (varsayılan) şart kesik çizgili, bağlı şart dolu.
// [EN] 40px visual slot with a 44px hit area via ::after. Dashed = open (default), solid = bound.
const slotCls = (bound, neutral = false) => `relative inline-flex h-10 max-w-full items-center gap-1.5 rounded-xl border px-3 text-sm font-semibold transition duration-150 after:absolute after:-inset-y-0.5 after:inset-x-0 after:content-[''] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand motion-reduce:transition-none md:text-[15px] ${
  neutral
    ? 'border-borderSubtle bg-elevated text-textPrimary hover:border-borderStrong'
    : bound
      ? 'border-brand/60 bg-brand/[0.12] text-textPrimary hover:bg-brand/[0.18]'
      : 'border-dashed border-textMuted/60 text-textPrimary hover:border-brand/60 hover:bg-brand/[0.05]'
}`;

// [TR] Ok tuşlarıyla seçenekler arasında gezinme (radiogroup). [EN] Arrow-key roving within the radiogroup.
const onRadioKey = (e) => {
  if (!['ArrowDown', 'ArrowUp'].includes(e.key)) return;
  e.preventDefault();
  const items = [...(e.currentTarget.querySelectorAll('button:not([disabled])') || [])];
  const i = items.indexOf(document.activeElement);
  items[(i + (e.key === 'ArrowDown' ? 1 : -1) + items.length) % items.length]?.focus();
};
const focusSelected = (list) => (list?.querySelector('[aria-checked="true"]:not([disabled])') || list?.querySelector('button:not([disabled])'))?.focus({ preventScroll: true });

// [TR] Seçenek listesi: "compact" masaüstü açılır penceresi, değilse dokunmaya uygun 56px satırlar (sheet).
// [EN] Option list: "compact" for the desktop popover, otherwise touch-sized 56px rows (sheet).
function ClauseOptions({ clause, filterKey, onPick, listRef, compact }) {
  return (
    <div ref={listRef} role="radiogroup" aria-label={clause.title} onKeyDown={onRadioKey} className={compact ? 'space-y-1' : 'space-y-2'}>
      {clause.options.map((o) => {
        const on = o.value === clause.value;
        return (
          <button
            key={o.value}
            type="button"
            role="radio"
            aria-checked={on}
            disabled={o.disabled}
            data-filter={filterKey}
            data-value={o.value}
            onClick={() => onPick(o.value)}
            className={`flex w-full items-center gap-3 border text-left transition duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-brand disabled:cursor-not-allowed disabled:opacity-60 motion-reduce:transition-none ${
              compact
                ? `min-h-[44px] rounded-xl border-transparent px-2.5 py-2 ${on ? 'bg-brand/[0.1]' : 'hover:bg-brand/[0.06]'}`
                : `min-h-[56px] rounded-2xl px-3.5 py-2.5 ${on ? 'border-brand/50 bg-brand/[0.08]' : 'border-borderSubtle bg-elevated hover:bg-brand/[0.06]'}`
            }`}
          >
            {o.dot && <span className={`h-2.5 w-2.5 shrink-0 rounded-full ${o.dot}`} aria-hidden="true" />}
            <span className="min-w-0 flex-1">
              <span className={`block truncate font-semibold text-textPrimary ${compact ? 'text-sm' : 'text-[15px]'}`}>{o.label}</span>
              {o.hint && <span className="mt-0.5 block text-xs text-textSecondary">{o.hint}</span>}
            </span>
            <span className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-full ${on ? 'bg-brand text-black' : 'border border-borderStrong'}`} aria-hidden="true">
              {on && <Check className="h-3.5 w-3.5" strokeWidth={3} />}
            </span>
          </button>
        );
      })}
    </div>
  );
}

const SlotFace = ({ clause, open }) => {
  const current = currentOption(clause);
  return (
    <>
      {clause.icon}
      {current.dot && <span className={`h-2 w-2 shrink-0 rounded-full ${current.dot}`} aria-hidden="true" />}
      <span className="truncate">{optionShort(clause)}</span>
      <ChevronDown className={`h-4 w-4 shrink-0 text-textSecondary transition-transform duration-200 motion-reduce:transition-none ${open ? 'rotate-180' : ''}`} strokeWidth={2} aria-hidden="true" />
    </>
  );
};

// [TR] Bağımsız şart: masaüstünde çapalı açılır pencere, telefonda ortak BottomSheet (ör. sıralama).
// [EN] Standalone clause: anchored popover on desktop, shared BottomSheet on phones (e.g. sort).
function ClauseSlot({ clause, filterKey, onPick, tr, testId }) {
  const desktop = useIsDesktop();
  const [open, setOpen] = useState(false);
  const [shown, setShown] = useState(false);
  const [alignRight, setAlignRight] = useState(false);
  const wrapRef = useRef(null);
  const btnRef = useRef(null);
  const listRef = useRef(null);
  const titleId = useId();
  const current = currentOption(clause);

  const close = (refocus = true) => {
    setShown(false);
    setOpen(false);
    if (refocus) btnRef.current?.focus({ preventScroll: true });
  };
  const closeRef = useRef(close);
  useEffect(() => { closeRef.current = close; });

  useEffect(() => {
    if (!open) return undefined;
    focusSelected(listRef.current);
    if (!desktop) return undefined;
    const id = requestAnimationFrame(() => setShown(true));
    const onKey = (e) => { if (e.key === 'Escape') { e.preventDefault(); closeRef.current(); } };
    const onDown = (e) => { if (wrapRef.current && !wrapRef.current.contains(e.target)) closeRef.current(false); };
    window.addEventListener('keydown', onKey, true);
    document.addEventListener('pointerdown', onDown);
    return () => { cancelAnimationFrame(id); window.removeEventListener('keydown', onKey, true); document.removeEventListener('pointerdown', onDown); };
  }, [open, desktop]);

  const toggle = () => {
    if (open) { close(); return; }
    const r = btnRef.current?.getBoundingClientRect();
    setAlignRight(Boolean(r && r.left + 300 > window.innerWidth - 16));
    setOpen(true);
  };
  const pick = (v) => { onPick(v); close(); };

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
        className={slotCls(isBound(clause), clause.neutral)}
      >
        <SlotFace clause={clause} open={open} />
      </button>
      {open && desktop && (
        <div
          role="dialog"
          aria-label={clause.title}
          className={`absolute top-full z-[101] mt-2 w-[300px] rounded-2xl border border-borderSubtle bg-surface p-2 shadow-xl transition duration-150 ease-out motion-reduce:transition-none ${
            alignRight ? 'right-0' : 'left-0'
          } ${shown ? 'scale-100 opacity-100' : 'scale-95 opacity-0'}`}
        >
          <p className="px-2.5 pb-1.5 pt-1 text-[11px] font-semibold tracking-wider text-textSecondary">{clause.title}</p>
          <ClauseOptions clause={clause} filterKey={filterKey} onPick={pick} listRef={listRef} compact />
        </div>
      )}
      {open && !desktop && (
        <BottomSheet title={clause.title} titleId={titleId} closeLabel={tr ? 'Kapat' : 'Close'} onClose={() => close()} testId={`${testId}-sheet`}>
          <ClauseOptions clause={clause} filterKey={filterKey} onPick={pick} listRef={listRef} />
        </BottomSheet>
      )}
    </span>
  );
}

const Word = ({ children }) => <span className="text-sm text-textSecondary md:text-[15px]">{children}</span>;
// [TR] Kelimeler komşu şartla birlikte sarılır; satır başında yetim kelime kalmaz. [EN] Words wrap with their slot.
const Group = ({ children }) => <span className="inline-flex max-w-full items-center gap-x-1.5">{children}</span>;

// [TR] Şart cümlesi. "popover": masaüstü, her şart kendi penceresini açar. "inline": sheet içinde, dokunulan şartın
//      seçenekleri cümlenin altında açılır (iç içe sheet yok).
// [EN] Clause sentence. "popover": desktop, each slot opens its own popover. "inline": inside the sheet, the tapped
//      slot's options open below the sentence (no nested sheets).
function ClauseSentence({ tr, c, filters, setFilter, canHideOwn, inline = false, idPrefix = 'market-clause' }) {
  const [activeKey, setActiveKey] = useState(null);
  const panelId = useId();
  const slotRefs = useRef({});
  const listRef = useRef(null);
  const panelRef = useRef(null);
  const amountSet = String(filters.amount || '').trim() !== '';

  useEffect(() => {
    if (!activeKey) return;
    focusSelected(listRef.current);
    panelRef.current?.scrollIntoView?.({ block: 'nearest' });
  }, [activeKey]);

  const collapse = () => {
    const key = activeKey;
    setActiveKey(null);
    if (key) slotRefs.current[key]?.focus({ preventScroll: true });
  };

  const slot = (key) => {
    if (!inline) return <ClauseSlot key={key} clause={c[key]} filterKey={key} tr={tr} testId={`${idPrefix}-${key}`} onPick={(v) => setFilter(key, v)} />;
    const open = activeKey === key;
    return (
      <button
        key={key}
        ref={(el) => { slotRefs.current[key] = el; }}
        type="button"
        data-testid={`${idPrefix}-${key}`}
        aria-expanded={open}
        aria-controls={open ? panelId : undefined}
        aria-label={`${c[key].title}: ${currentOption(c[key]).label}`}
        onClick={() => setActiveKey(open ? null : key)}
        className={`${slotCls(isBound(c[key]))} ${open ? 'ring-2 ring-brand' : ''}`}
      >
        <SlotFace clause={c[key]} open={open} />
      </button>
    );
  };

  const amount = (
    <label key="amount" className={`${slotCls(amountSet)} cursor-text gap-1 pr-2.5 focus-within:ring-2 focus-within:ring-brand`}>
      <input
        type="number"
        inputMode="decimal"
        min="0"
        value={filters.amount}
        onChange={(e) => setFilter('amount', e.target.value)}
        onFocus={() => inline && setActiveKey(null)}
        placeholder={tr ? 'tutar' : 'amount'}
        aria-label={tr ? 'İşlem tutarı' : 'Trade amount'}
        style={{ width: `${Math.max(4, String(filters.amount || '').length + 1)}ch` }}
        className="min-w-0 max-w-[9ch] bg-transparent text-sm font-semibold md:text-[15px] tabular-nums text-textPrimary outline-none placeholder:font-semibold placeholder:text-textSecondary [-moz-appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none"
      />
      <span className="whitespace-nowrap text-[11px] font-semibold text-textSecondary">{amountUnit(filters.token)}</span>
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
    ? [
      <Group key="g1">{slot('fiat')}<Word>ile</Word></Group>, amount, slot('token'),
      <Group key="g2">{slot('side')}<Word>istiyorum;</Word></Group>,
      <Group key="g3">{slot('tier')}<Word>emirler.</Word></Group>, hideOwn,
    ]
    : [
      <Group key="g1"><Word>I want to</Word>{slot('side')}</Group>, amount, slot('token'),
      <Group key="g2"><Word>for</Word>{slot('fiat')}<Word>·</Word></Group>,
      <Group key="g3">{slot('tier')}<Word>orders.</Word></Group>, hideOwn,
    ];

  const active = activeKey ? c[activeKey] : null;
  return (
    <div onKeyDown={inline ? (e) => { if (e.key === 'Escape' && activeKey) { e.preventDefault(); collapse(); } } : undefined}>
      <div className={`flex flex-wrap items-center gap-x-1.5 leading-none ${inline ? 'gap-y-3' : 'gap-y-2'}`}>{sentence}</div>
      {inline && active && (
        <div ref={panelRef} id={panelId} className="mt-4 rounded-2xl border border-borderSubtle bg-elevated/50 p-3">
          <p className="mb-2 px-1 text-xs font-semibold tracking-wider text-textSecondary">{active.title}</p>
          <ClauseOptions clause={active} filterKey={activeKey} listRef={listRef} onPick={(v) => { setFilter(activeKey, v); collapse(); }} />
        </div>
      )}
    </div>
  );
}

// [TR] Telefon özeti: varsayılan şartlar soluk, bağlı şartlar vurgulu. [EN] Phone summary: open terms muted, bound terms emphasised.
const summaryParts = ({ tr, filters, viewerTier }) => {
  const amountSet = String(filters.amount || '').trim() !== '';
  const parts = [
    { key: 'fiat', bound: filters.fiat !== 'ALL', text: filters.fiat !== 'ALL' ? filters.fiat : (tr ? 'Her döviz' : 'Any currency') },
    amountSet
      ? { key: 'amount', bound: true, text: `${filters.amount} ${amountUnit(filters.token)}` }
      : { key: 'token', bound: filters.token !== 'ALL', text: amountUnit(filters.token) },
    { key: 'side', bound: filters.side !== 'ALL', text: { BUY: tr ? 'Al' : 'Buy', SELL: tr ? 'Sat' : 'Sell' }[filters.side] || (tr ? 'Al/Sat' : 'Buy/Sell') },
    {
      key: 'tier',
      bound: filters.tier !== 'ALL',
      text: filters.tier === 'NO_BOND' ? (tr ? 'Teminatsız' : 'No bond')
        : filters.tier === 'ELIGIBLE' ? (viewerTier != null ? `≤ T${viewerTier}` : (tr ? 'Girebildiklerim' : 'I can take'))
          : (tr ? 'Tüm kademeler' : 'All tiers'),
    },
  ];
  if (filters.hideOwn) parts.push({ key: 'hideOwn', bound: true, text: tr ? 'Kendi emirlerim hariç' : 'Excluding mine' });
  return parts;
};

const boundBadge = (tr, n) => (tr ? `${n} bağlı` : `${n} set`);
const SectionMark = () => (
  <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-lg border border-borderSubtle bg-elevated font-serif text-sm font-bold leading-none text-textPrimary" aria-hidden="true">§</span>
);
const resetBtnCls = 'inline-flex h-11 items-center gap-1.5 rounded-xl px-3 text-sm font-semibold text-textSecondary transition hover:bg-elevated hover:text-textPrimary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand motion-reduce:transition-none';

export default function MarketFilters({
  lang = 'TR', filters: rawFilters, setFilter, onReset, activeFilterCount = 0, sortOptions = [], sortValue,
  viewerTier = null, canHideOwn = false, result = {}, closedRailCount = 0, children,
}) {
  const tr = lang === 'TR';
  const filters = { ...MARKET_FILTER_DEFAULTS, ...rawFilters };
  const c = buildClauses({ tr, filters, sortOptions, sortValue, viewerTier });
  const [sheetOpen, setSheetOpen] = useState(false);
  const sheetTitleId = useId();
  const resultText = marketResultText({ tr, ...result });
  const parts = summaryParts({ tr, filters, viewerTier });
  const summaryLabel = parts.map((p) => p.text).join(' · ');

  // [TR] Sheet açıkken ekran masaüstü genişliğine çıkarsa sheet kapanır; cümle yerinde görünür.
  // [EN] If the viewport grows to desktop while the sheet is open, close it; the sentence is inline there.
  useEffect(() => {
    if (!sheetOpen || !hasMatchMedia()) return undefined;
    const media = window.matchMedia(DESKTOP_QUERY);
    const onChange = () => { if (media.matches) setSheetOpen(false); };
    media.addEventListener?.('change', onChange);
    return () => media.removeEventListener?.('change', onChange);
  }, [sheetOpen]);

  const editProps = { tr, c, filters, setFilter, canHideOwn };
  const showLabel = result.loading || result.error
    ? (tr ? 'Emirleri göster' : 'Show orders')
    : (tr ? `${result.shown ?? 0} emri göster` : `Show ${result.shown ?? 0} ${result.shown === 1 ? 'order' : 'orders'}`);

  return (
    <>
      <section role="search" aria-label={tr ? 'Pazar filtreleri' : 'Market filters'} data-testid="market-filters" className="relative mb-4 overflow-visible rounded-[1.25rem] border border-borderSubtle bg-surface p-3 md:p-5">
        <span className="pointer-events-none absolute inset-x-6 top-0 h-px bg-gradient-to-r from-transparent via-brand/50 to-transparent" aria-hidden="true" />

        {/* [TR] Telefon: kompakt özet kartı. Üst satır: başlık, bağlı şart rozeti, Sıfırla; alt satır: özet + Düzenle.
             [EN] Phone: compact summary. Top row: label, bound-count badge, Reset; next row: summary + Edit. */}
        <div className="md:hidden" data-testid="market-filters-summary">
          <div className="flex h-6 items-center justify-between gap-2">
            <div className="flex min-w-0 items-center gap-2">
              <SectionMark />
              <p className="truncate text-[11px] font-semibold tracking-[0.14em] text-textSecondary">{tr ? 'ŞARTLARIN' : 'YOUR TERMS'}</p>
              {activeFilterCount > 0 && (
                <span className="shrink-0 rounded-full bg-brand/15 px-2 py-0.5 text-[11px] font-bold tabular-nums text-textPrimary">{boundBadge(tr, activeFilterCount)}</span>
              )}
            </div>
            {activeFilterCount > 0 && (
              <button type="button" onClick={() => onReset?.()} className={`-my-2.5 -mr-1.5 shrink-0 px-2.5 ${resetBtnCls}`}>
                <RotateCcw className="h-4 w-4" strokeWidth={2} aria-hidden="true" />{tr ? 'Sıfırla' : 'Reset'}
              </button>
            )}
          </div>
          <div className="mt-2 flex items-center gap-3">
            <p className="min-w-0 flex-1 line-clamp-2 text-sm leading-5" aria-hidden="true">
              {parts.map((p, i) => (
                <span key={p.key}>
                  {i > 0 && <span className="text-textMuted"> · </span>}
                  <span className={`whitespace-nowrap ${p.bound ? 'font-semibold text-textPrimary' : 'text-textSecondary'}`}>{p.text}</span>
                </span>
              ))}
            </p>
            <button
              type="button"
              data-testid="market-filters-edit"
              aria-haspopup="dialog"
              aria-expanded={sheetOpen}
              aria-label={tr ? `Şartları düzenle: ${summaryLabel}` : `Edit terms: ${summaryLabel}`}
              onClick={() => setSheetOpen(true)}
              className="inline-flex h-11 shrink-0 items-center gap-1.5 rounded-xl border border-borderSubtle bg-elevated px-3 text-sm font-semibold text-textPrimary transition hover:border-borderStrong focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand motion-reduce:transition-none"
            >
              <Pencil className="h-4 w-4" strokeWidth={2} aria-hidden="true" />{tr ? 'Düzenle' : 'Edit'}
            </button>
          </div>
        </div>

        {/* [TR] Masaüstü: cümle yerinde düzenlenir. [EN] Desktop: the sentence is edited in place. */}
        <div className="hidden md:block">
          <div className={`flex items-center justify-between gap-3 ${activeFilterCount > 0 ? '-mt-1.5 mb-1.5' : 'mb-3'}`}>
            <div className="flex items-center gap-2">
              <SectionMark />
              <p className="text-[11px] font-semibold tracking-[0.14em] text-textSecondary">{tr ? 'ŞARTLARIN' : 'YOUR TERMS'}</p>
              {activeFilterCount > 0 && (
                <span className="rounded-full bg-brand/15 px-2 py-0.5 text-[11px] font-bold tabular-nums text-textPrimary">{boundBadge(tr, activeFilterCount)}</span>
              )}
            </div>
            {activeFilterCount > 0 && (
              <button type="button" onClick={() => onReset?.()} className={`-mr-2 ${resetBtnCls}`}>
                <RotateCcw className="h-4 w-4" strokeWidth={2} aria-hidden="true" />{tr ? 'Sıfırla' : 'Reset'}
              </button>
            )}
          </div>
          <ClauseSentence {...editProps} />
        </div>

        {/* [TR] Sıralama filtre sayılmaz; sonuç satırında durur. [EN] Sort is not a filter; it lives on the result line. */}
        <div className="mt-2 border-t border-borderSubtle pt-2 md:mt-4 md:pt-3">
          <div className="flex items-center justify-between gap-3">
            <p aria-live="polite" className="min-w-0 truncate text-sm font-semibold tabular-nums text-textPrimary">{resultText}</p>
            <span className="min-w-0 shrink-0"><ClauseSlot clause={c.sort} filterKey="sort" tr={tr} testId="market-clause-sort" onPick={(v) => setFilter('sort', v)} /></span>
          </div>
          {closedRailCount > 0 && (
            <p className="mt-1.5 flex items-start gap-1.5 text-xs text-textSecondary md:mt-2">
              <Lock className="mt-px h-3.5 w-3.5 shrink-0" strokeWidth={2} aria-hidden="true" />
              <span>{closedRailText(tr, closedRailCount)}</span>
            </p>
          )}
        </div>
      </section>

      {sheetOpen && (
        <BottomSheet
          title={tr ? 'Şartların' : 'Your terms'}
          titleId={sheetTitleId}
          closeLabel={tr ? 'Kapat' : 'Close'}
          onClose={() => setSheetOpen(false)}
          testId="market-filters-sheet"
        >
          <p className="-mt-2 mb-4 text-sm text-textSecondary">
            {tr ? 'Kesik çizgili şartlar açık; dokunup bağlayın.' : 'Dashed terms are open; tap one to set it.'}
          </p>
          <ClauseSentence {...editProps} inline idPrefix="market-sheet-clause" />
          <div className="mt-6 flex items-center gap-2">
            {activeFilterCount > 0 && (
              <button
                type="button"
                onClick={() => onReset?.()}
                className="inline-flex h-12 shrink-0 items-center gap-1.5 rounded-2xl border border-borderSubtle bg-elevated px-4 text-sm font-semibold text-textPrimary transition hover:border-borderStrong focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand motion-reduce:transition-none"
              >
                <RotateCcw className="h-4 w-4" strokeWidth={2} aria-hidden="true" />{tr ? `Sıfırla (${activeFilterCount})` : `Reset (${activeFilterCount})`}
              </button>
            )}
            <button
              type="button"
              data-testid="market-filters-apply"
              onClick={() => setSheetOpen(false)}
              className="inline-flex h-12 min-w-0 flex-1 items-center justify-center rounded-2xl bg-brand px-4 text-[15px] font-bold text-black transition hover:opacity-90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand focus-visible:ring-offset-2 focus-visible:ring-offset-surface motion-reduce:transition-none"
            >
              <span className="truncate">{showLabel}</span>
            </button>
          </div>
        </BottomSheet>
      )}
      {children}
    </>
  );
}

// [TR] Boş sonuç: hangi şartın listeyi daralttığını gösterir; her şart tek dokunuşla gevşetilir.
// [EN] Empty result: lists the binding clauses; each one can be loosened with a single tap.
export function MarketEmpty({ lang = 'TR', filters: rawFilters, setFilter, onReset, activeFilterCount = 0, isNarrowed, feedError, canCreate, onCreate, viewerTier = null }) {
  const tr = lang === 'TR';
  const f = { ...MARKET_FILTER_DEFAULTS, ...rawFilters };
  const chips = [
    f.side !== 'ALL' && { key: 'side', label: f.side === 'BUY' ? (tr ? 'yalnız al' : 'buy only') : (tr ? 'yalnız sat' : 'sell only') },
    f.token !== 'ALL' && { key: 'token', label: f.token },
    f.fiat !== 'ALL' && { key: 'fiat', label: f.fiat },
    String(f.amount || '').trim() !== '' && Number(f.amount) > 0 && { key: 'amount', label: `${f.amount} ${amountUnit(f.token)}` },
    f.tier !== 'ALL' && { key: 'tier', label: f.tier === 'NO_BOND' ? (tr ? 'teminatsız' : 'no bond') : (viewerTier != null ? `≤ T${viewerTier}` : (tr ? 'girebildiğim' : 'enterable')) },
    f.hideOwn && { key: 'hideOwn', label: tr ? 'kendi emirlerim hariç' : 'excluding mine' },
  ].filter(Boolean);
  const title = feedError
    ? (tr ? 'Pazar verisi alınamadı. Bağlantı düzelince liste otomatik yenilenecek.' : 'Market data unavailable. The list refreshes automatically.')
    : isNarrowed
      ? (tr ? 'Bu şartlarla eşleşen emir yok.' : 'No orders match these terms.')
      : (tr ? 'Henüz açık emir yok.' : 'No open orders yet.');
  return (
    <div data-testid="market-empty" className="rounded-[1.25rem] border border-dashed border-borderStrong bg-surface/60 p-6 text-center md:p-8">
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
