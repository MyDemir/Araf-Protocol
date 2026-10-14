import { useEffect, useId, useRef, useState } from 'react';
import {
  ArrowDownUp, Banknote, Check, ChevronDown, CloudOff, Coins, EyeOff, Lock, Plus, RotateCcw, SearchX, ShieldCheck, Store, X,
} from 'lucide-react';
import BottomSheet from '../../../components/BottomSheet';
import { MARKET_FIAT_OPTIONS, MARKET_FILTER_DEFAULTS } from './marketFilters';

// [TR] Pazar filtreleri — tek satır chip çubuğu. Al/Sat segmenti + döviz, token, tutar, kademe, "emirlerimi gizle"
//      ve sıralama chip'leri. Telefonda satır yatay kayar (sağ kenar soluklaşır), masaüstünde sarar. Varsayılan chip
//      boyut adını ("Döviz"), seçili chip değeri ("TRY") gösterir ve marka rengiyle dolar. Seçenekler masaüstünde
//      çapalı açılır pencerede, telefonda ortak BottomSheet'te açılır. Filtre mantığı (marketFilters.js) aynıdır:
//      yalnız setFilter / onReset çağrılır.
// [EN] Market filters — a single chip bar. Buy/Sell segment + currency, token, amount, tier, "hide mine" and sort
//      chips. Scrolls horizontally on phones (right edge fades), wraps on desktop. Idle chips show the dimension name,
//      bound chips show the value in the brand tint. Options open in an anchored popover (desktop) or the shared
//      BottomSheet (phone). Filter logic (marketFilters.js) is unchanged: only setFilter / onReset are called.

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
  if (loading || error) return ' ';
  if (total > loaded) return tr ? `${shown} emir · toplam ${total}` : `${shown} ${shown === 1 ? 'order' : 'orders'} · ${total} total`;
  return tr ? `${shown} emir` : `${shown} ${shown === 1 ? 'order' : 'orders'}`;
};

export const closedRailText = (tr, n) => (tr
  ? `${n} emirde ödeme yöntemi şu an kapalı`
  : `${n} ${n === 1 ? 'order has' : 'orders have'} a closed payment method`);

// [TR] Tutar birimi: token seçili değilse okunaklı "USDT/USDC". [EN] Amount unit: readable "USDT/USDC" when no token is set.
export const amountUnit = (token) => (token === 'USDT' || token === 'USDC' ? token : 'USDT/USDC');

const iconCls = 'h-4 w-4 shrink-0';

const buildClauses = ({ tr, filters, sortOptions, sortValue, viewerTier }) => ({
  token: {
    title: tr ? 'Varlık' : 'Asset',
    idle: 'Token',
    icon: <Coins className={iconCls} strokeWidth={2} aria-hidden="true" />,
    options: [
      { value: 'ALL', label: tr ? 'USDT ya da USDC' : 'USDT or USDC' },
      { value: 'USDT', label: 'USDT' },
      { value: 'USDC', label: 'USDC' },
    ],
    value: filters.token,
  },
  fiat: {
    title: tr ? 'Para birimi' : 'Currency',
    idle: tr ? 'Döviz' : 'Currency',
    icon: <Banknote className={iconCls} strokeWidth={2} aria-hidden="true" />,
    options: [
      { value: 'ALL', label: tr ? 'Her döviz' : 'Any currency' },
      ...MARKET_FIAT_OPTIONS.map((c) => ({ value: c, label: c })),
    ],
    value: filters.fiat,
  },
  tier: {
    title: tr ? 'Teminat kademesi' : 'Bond tier',
    idle: tr ? 'Kademe' : 'Tier',
    icon: <ShieldCheck className={iconCls} strokeWidth={2} aria-hidden="true" />,
    options: [
      { value: 'ALL', label: tr ? 'Tüm kademeler' : 'All tiers' },
      { value: 'NO_BOND', label: tr ? 'Teminatsız (Tier 0)' : 'No bond (Tier 0)', short: tr ? 'Teminatsız' : 'No bond' },
      {
        value: 'ELIGIBLE',
        label: viewerTier != null ? (tr ? `Girebildiklerim (≤ T${viewerTier})` : `I can take (≤ T${viewerTier})`) : (tr ? 'Girebildiklerim' : 'I can take'),
        short: viewerTier != null ? `≤ T${viewerTier}` : (tr ? 'Girebildiğim' : 'Enterable'),
        hint: viewerTier == null ? (tr ? 'Giriş yapınca açılır' : 'Available after sign-in') : undefined,
        disabled: viewerTier == null,
      },
    ],
    value: filters.tier,
  },
  sort: {
    title: tr ? 'Sıralama' : 'Sort',
    icon: <ArrowDownUp className={iconCls} strokeWidth={2} aria-hidden="true" />,
    options: sortOptions,
    value: sortValue,
    neutral: true,
  },
});

const currentOption = (clause) => clause.options.find((o) => o.value === clause.value) || clause.options[0] || { label: '' };
const isBound = (clause) => !clause.neutral && clause.value !== clause.options[0]?.value;
// [TR] Boşta chip boyut adını, bağlı chip seçilen değeri gösterir. [EN] Idle chip shows the dimension, bound chip the value.
const chipText = (clause) => {
  if (!clause.neutral && !isBound(clause)) return clause.idle;
  const o = currentOption(clause);
  return o.short || o.label;
};

// [TR] Chip 36px; dokunma alanı ::after ile 44px. Bağlı chip marka tonunda dolu. [EN] 36px chip, 44px hit area; bound = brand tint.
export const chipCls = (bound) => `relative inline-flex h-9 shrink-0 items-center gap-1.5 whitespace-nowrap rounded-full border px-3 text-[13px] font-semibold transition duration-150 after:absolute after:-inset-y-1 after:inset-x-0 after:content-[''] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand motion-reduce:transition-none ${
  bound
    ? 'border-brand/50 bg-brand/[0.12] text-textPrimary hover:bg-brand/[0.18]'
    : 'border-borderSubtle bg-surface text-textSecondary hover:border-borderStrong hover:text-textPrimary'
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

// [TR] Seçenek chip'i: masaüstünde çapalı açılır pencere, telefonda ortak BottomSheet.
// [EN] Option chip: anchored popover on desktop, shared BottomSheet on phones.
function ClauseChip({ clause, filterKey, onPick, tr, testId }) {
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
    setAlignRight(Boolean(r && r.left + 280 > window.innerWidth - 16));
    setOpen(true);
  };
  const pick = (v) => { onPick(v); close(); };

  return (
    <span ref={wrapRef} className="relative inline-flex shrink-0">
      <button
        ref={btnRef}
        type="button"
        data-testid={testId}
        aria-haspopup="dialog"
        aria-expanded={open}
        aria-label={`${clause.title}: ${current.label}`}
        onClick={toggle}
        className={`${chipCls(isBound(clause))} ${open ? 'ring-2 ring-brand' : ''}`}
      >
        {clause.icon}
        <span>{chipText(clause)}</span>
        <ChevronDown className={`h-3.5 w-3.5 shrink-0 opacity-70 transition-transform duration-200 motion-reduce:transition-none ${open ? 'rotate-180' : ''}`} strokeWidth={2.2} aria-hidden="true" />
      </button>
      {open && desktop && (
        <div
          role="dialog"
          aria-label={clause.title}
          className={`absolute top-full z-[101] mt-2 w-[280px] rounded-2xl border border-borderSubtle bg-surface p-2 shadow-xl transition duration-150 ease-out motion-reduce:transition-none ${
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

// [TR] Al/Sat segmenti: renk kullanıcının yapacağı işi anlatır (Al yeşil, Sat kırmızı). Ok tuşları seçimi kaydırır.
// [EN] Buy/Sell segment: colour follows the viewer's action (buy green, sell red). Arrow keys move the selection.
const SIDE_ACTIVE = {
  ALL: 'bg-textPrimary text-app shadow-sm',
  BUY: 'bg-brand text-black shadow-sm',
  SELL: 'bg-danger text-[color:var(--color-on-danger)] shadow-sm',
};
function SideSegment({ tr, value, onPick }) {
  const opts = [
    { value: 'ALL', label: tr ? 'Tümü' : 'All', title: tr ? 'Al ya da sat' : 'Buy or sell' },
    { value: 'BUY', label: tr ? 'Al' : 'Buy', title: tr ? 'Al: kripto satan emirler' : 'Buy: orders selling crypto' },
    { value: 'SELL', label: tr ? 'Sat' : 'Sell', title: tr ? 'Sat: kripto alan emirler' : 'Sell: orders buying crypto' },
  ];
  const onKey = (e) => {
    if (!['ArrowLeft', 'ArrowRight'].includes(e.key)) return;
    e.preventDefault();
    const i = opts.findIndex((o) => o.value === value);
    const next = opts[(i + (e.key === 'ArrowRight' ? 1 : -1) + opts.length) % opts.length];
    onPick(next.value);
    e.currentTarget.querySelector(`[data-value="${next.value}"]`)?.focus();
  };
  return (
    <div role="radiogroup" aria-label={tr ? 'İşlem yönü' : 'Trade side'} onKeyDown={onKey} className="inline-flex h-9 shrink-0 items-center rounded-full border border-borderSubtle bg-elevated p-0.5">
      {opts.map((o) => {
        const on = o.value === value;
        return (
          <button
            key={o.value}
            type="button"
            role="radio"
            aria-checked={on}
            tabIndex={on ? 0 : -1}
            title={o.title}
            data-testid={`market-side-${o.value}`}
            data-value={o.value}
            onClick={() => onPick(o.value)}
            className={`relative inline-flex h-8 min-w-[3rem] items-center justify-center rounded-full px-3 text-[13px] font-bold transition duration-150 after:absolute after:-inset-y-1.5 after:inset-x-0 after:content-[''] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand motion-reduce:transition-none ${
              on ? SIDE_ACTIVE[o.value] : 'text-textSecondary hover:text-textPrimary'
            }`}
          >
            {o.label}
          </button>
        );
      })}
    </div>
  );
}

export default function MarketFilters({
  lang = 'TR', filters: rawFilters, setFilter, onReset, activeFilterCount = 0, sortOptions = [], sortValue,
  viewerTier = null, canHideOwn = false, result = {}, closedRailCount = 0, trailing = null, children,
}) {
  const tr = lang === 'TR';
  const filters = { ...MARKET_FILTER_DEFAULTS, ...rawFilters };
  const c = buildClauses({ tr, filters, sortOptions, sortValue, viewerTier });
  const resultText = marketResultText({ tr, ...result });
  const amountSet = String(filters.amount || '').trim() !== '';
  const chip = (key) => <ClauseChip clause={c[key]} filterKey={key} tr={tr} testId={`market-clause-${key}`} onPick={(v) => setFilter(key, v)} />;

  return (
    <>
      <section role="search" aria-label={tr ? 'Pazar filtreleri' : 'Market filters'} data-testid="market-filters" className="mb-3">
        {/* [TR] Telefonda kenardan kenara kayan şerit; sağ kenar maske ile soluklaşır. Masaüstünde sarar (açılır pencere kırpılmaz).
             [EN] Edge-to-edge scrolling strip on phones with a right-edge fade; wraps on desktop so popovers are not clipped. */}
        <div
          data-testid="market-filter-row"
          className="no-scrollbar -mx-4 flex items-center gap-2 overflow-x-auto py-1 pl-4 pr-10 [-webkit-mask-image:linear-gradient(to_right,#000_calc(100%_-_2.5rem),transparent)] [mask-image:linear-gradient(to_right,#000_calc(100%_-_2.5rem),transparent)] md:mx-0 md:flex-wrap md:overflow-visible md:px-0 md:[-webkit-mask-image:none] md:[mask-image:none]"
        >
          <SideSegment tr={tr} value={filters.side} onPick={(v) => setFilter('side', v)} />
          <span className="mx-0.5 h-5 w-px shrink-0 bg-borderSubtle" aria-hidden="true" />
          {activeFilterCount > 0 && (
            <button
              type="button"
              data-testid="market-filters-reset"
              onClick={() => onReset?.()}
              aria-label={tr ? `Filtreleri sıfırla (${activeFilterCount})` : `Reset filters (${activeFilterCount})`}
              title={tr ? 'Filtreleri sıfırla' : 'Reset filters'}
              className={`${chipCls(false)} px-2.5`}
            >
              <RotateCcw className="h-4 w-4" strokeWidth={2} aria-hidden="true" />
              <span className="flex h-5 min-w-[1.25rem] items-center justify-center rounded-full bg-brand px-1 text-[11px] font-bold tabular-nums text-black">{activeFilterCount}</span>
            </button>
          )}
          {chip('fiat')}
          {chip('token')}
          <label className={`${chipCls(amountSet)} cursor-text gap-1 focus-within:ring-2 focus-within:ring-brand`}>
            <input
              type="number"
              inputMode="decimal"
              min="0"
              value={filters.amount}
              onChange={(e) => setFilter('amount', e.target.value)}
              placeholder={tr ? 'Tutar' : 'Amount'}
              aria-label={tr ? 'İşlem tutarı' : 'Trade amount'}
              style={{ width: `${Math.max(5, String(filters.amount || '').length + 1)}ch` }}
              className="min-w-0 max-w-[9ch] bg-transparent text-[13px] font-semibold tabular-nums text-textPrimary outline-none placeholder:font-semibold placeholder:text-textSecondary [-moz-appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none"
            />
            {amountSet && <span className="text-[11px] font-semibold text-textSecondary">{amountUnit(filters.token)}</span>}
          </label>
          {chip('tier')}
          {canHideOwn && (
            <button type="button" aria-pressed={filters.hideOwn} onClick={() => setFilter('hideOwn', !filters.hideOwn)} className={chipCls(filters.hideOwn)}>
              <EyeOff className={iconCls} strokeWidth={2} aria-hidden="true" />{tr ? 'Emirlerimi gizle' : 'Hide mine'}
            </button>
          )}
          <span className="inline-flex shrink-0 md:ml-auto">{chip('sort')}</span>
        </div>

        <div className="mt-2 flex min-h-[1.75rem] flex-wrap items-center gap-x-3 gap-y-1.5">
          <p aria-live="polite" className="min-w-0 truncate text-xs font-semibold tabular-nums text-textSecondary">{resultText}</p>
          {closedRailCount > 0 && (
            <span title={closedRailText(tr, closedRailCount)} className="inline-flex items-center gap-1 text-xs text-textSecondary">
              <Lock className="h-3.5 w-3.5 shrink-0" strokeWidth={2} aria-hidden="true" />
              <span>{closedRailText(tr, closedRailCount)}</span>
            </span>
          )}
          {trailing && <div className="ml-auto flex shrink-0 items-center">{trailing}</div>}
        </div>
      </section>
      {children}
    </>
  );
}

// [TR] Boş durum: ortada küçük illüstrasyon, tek satır mesaj ve tek aksiyon. Daraltılmış listede her filtre tek
//      dokunuşla gevşetilir. Yeni emir kapısı kapalıysa CTA yerine sakin bir "geçici olarak kapalı" chip'i görünür.
// [EN] Empty state: small centred illustration, one-line message, one action. A narrowed list offers one-tap
//      loosening per filter. When the new-order gate is closed a calm "temporarily closed" chip replaces the CTA.
export function MarketEmpty({ lang = 'TR', filters: rawFilters, setFilter, onReset, activeFilterCount = 0, isNarrowed, feedError, canCreate, onCreate, viewerTier = null }) {
  const tr = lang === 'TR';
  const f = { ...MARKET_FILTER_DEFAULTS, ...rawFilters };
  const chips = [
    f.side !== 'ALL' && { key: 'side', label: f.side === 'BUY' ? (tr ? 'yalnız al' : 'buy only') : (tr ? 'yalnız sat' : 'sell only') },
    f.token !== 'ALL' && { key: 'token', label: f.token },
    f.fiat !== 'ALL' && { key: 'fiat', label: f.fiat },
    String(f.amount || '').trim() !== '' && Number(f.amount) > 0 && { key: 'amount', label: `${f.amount} ${amountUnit(f.token)}` },
    f.tier !== 'ALL' && { key: 'tier', label: f.tier === 'NO_BOND' ? (tr ? 'teminatsız' : 'no bond') : (viewerTier != null ? `≤ T${viewerTier}` : (tr ? 'girebildiğim' : 'enterable')) },
    f.hideOwn && { key: 'hideOwn', label: tr ? 'emirlerimi gizle' : 'hide mine' },
  ].filter(Boolean);
  const title = feedError
    ? (tr ? 'Pazar verisi alınamadı' : 'Market data unavailable')
    : isNarrowed
      ? (tr ? 'Bu filtrelerle emir yok' : 'No orders match these filters')
      : (tr ? 'Henüz açık emir yok' : 'No open orders yet');
  const Icon = feedError ? CloudOff : isNarrowed ? SearchX : Store;
  const showCreate = !feedError && canCreate;
  const showClosed = !feedError && !canCreate;
  return (
    <div data-testid="market-empty" className="flex flex-col items-center px-4 py-10 text-center md:py-16">
      <div className="relative mb-4" aria-hidden="true">
        <span className="absolute inset-0 -m-3 rounded-full bg-brand/[0.08] blur-xl" />
        <span className={`relative flex h-16 w-16 items-center justify-center rounded-2xl border bg-surface shadow-sm ${feedError ? 'border-borderStrong text-textSecondary' : 'border-brand/30 text-brand'}`}>
          <Icon className="h-7 w-7" strokeWidth={1.8} />
        </span>
        {(showCreate || showClosed) && !isNarrowed && (
          <span className={`absolute -bottom-1.5 -right-1.5 flex h-6 w-6 items-center justify-center rounded-full border-2 border-app ${showClosed ? 'bg-elevated text-textSecondary' : 'bg-brand text-black'}`}>
            {showClosed ? <Lock className="h-3 w-3" strokeWidth={2.5} /> : <Plus className="h-3.5 w-3.5" strokeWidth={3} />}
          </span>
        )}
      </div>
      <p className="text-[15px] font-semibold text-textPrimary">{title}</p>
      {feedError && <p className="mt-1 text-xs text-textMuted">{tr ? 'Bağlantı gelince liste kendiliğinden yenilenir.' : 'The list refreshes automatically.'}</p>}
      {!feedError && chips.length > 0 && (
        <ul className="mt-3 flex flex-wrap justify-center gap-2" aria-label={tr ? 'Etkin filtreler' : 'Active filters'}>
          {chips.map((ch) => (
            <li key={ch.key}>
              <button
                type="button"
                onClick={() => setFilter(ch.key, MARKET_FILTER_DEFAULTS[ch.key])}
                aria-label={tr ? `${ch.label} filtresini kaldır` : `Remove ${ch.label}`}
                className={chipCls(true)}
              >
                {ch.label}<X className="h-3.5 w-3.5 text-textSecondary" strokeWidth={2.4} aria-hidden="true" />
              </button>
            </li>
          ))}
        </ul>
      )}
      <div className="mt-5 flex flex-wrap justify-center gap-2">
        {!feedError && activeFilterCount > 0 && (
          <button type="button" onClick={() => onReset?.()} className="inline-flex h-10 items-center gap-1.5 rounded-full border border-borderSubtle bg-surface px-4 text-sm font-semibold text-textPrimary transition hover:border-borderStrong focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand motion-reduce:transition-none">
            <RotateCcw className="h-4 w-4" strokeWidth={2} aria-hidden="true" />{tr ? 'Tümünü sıfırla' : 'Reset all'}
          </button>
        )}
        {showCreate && (
          <button type="button" onClick={onCreate} className="inline-flex h-10 items-center gap-1.5 rounded-full bg-brand px-5 text-sm font-bold text-black transition hover:opacity-90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand focus-visible:ring-offset-2 focus-visible:ring-offset-app motion-reduce:transition-none">
            <Plus className="h-4 w-4" strokeWidth={2.4} aria-hidden="true" />{isNarrowed ? (tr ? 'Emir oluştur' : 'Create order') : (tr ? 'İlk emri sen aç' : 'Post the first order')}
          </button>
        )}
        {showClosed && (
          <span data-testid="market-empty-closed" className="inline-flex h-9 items-center gap-1.5 rounded-full border border-borderSubtle bg-elevated px-3.5 text-xs font-semibold text-textSecondary">
            <Lock className="h-3.5 w-3.5" strokeWidth={2} aria-hidden="true" />{tr ? 'Yeni emirler geçici olarak kapalı' : 'New orders are temporarily closed'}
          </span>
        )}
      </div>
    </div>
  );
}
