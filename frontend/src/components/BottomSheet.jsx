import React from 'react';
import { X } from 'lucide-react';

// [TR] Ortak alt sheet kabuğu (cüzdan modalı ve pazar şartları kullanır): mobilde alttan açılan sheet (tutamak,
//      yuvarlak üst köşe, safe-area payı), sm ve üstünde ortalanmış kart. Esc ve arka plana tıklama kapatır; açılışta
//      odak panele gider, Tab panel içinde döner, kapanınca odak açan öğeye geri döner. Giriş geçişi
//      prefers-reduced-motion'da kapalı.
// [EN] Shared bottom sheet shell (wallet modal and market terms): bottom sheet on phones (grab handle, rounded top,
//      safe-area padding), centred card from sm up. Esc and backdrop click close it; focus moves into the panel, Tab
//      stays inside it and focus returns to the opener on close. Entrance transition is off under reduced motion.
const FOCUSABLE = 'a[href],button:not([disabled]),input:not([disabled]),select:not([disabled]),textarea:not([disabled]),[tabindex]:not([tabindex="-1"])';

export default function BottomSheet({
  title, titleId, closeLabel, onClose, children, testId, panelClassName = 'sm:max-w-[400px]',
}) {
  const [shown, setShown] = React.useState(false);
  const panelRef = React.useRef(null);
  const onCloseRef = React.useRef(onClose);
  React.useEffect(() => { onCloseRef.current = onClose; }, [onClose]);
  // [TR] Yalnız açılışta: giriş geçişi, odak ve Esc dinleyicisi (üst bileşen her çizimde yeni onClose verir).
  //      Alt bileşen Esc'i kendisi tükettiyse (preventDefault) sheet kapanmaz.
  // [EN] Mount-only: entrance, focus and Esc listener (the parent passes a fresh onClose on every render).
  //      A child that consumed Esc (preventDefault) keeps the sheet open.
  React.useEffect(() => {
    const opener = typeof document !== 'undefined' ? document.activeElement : null;
    const id = requestAnimationFrame(() => setShown(true));
    panelRef.current?.focus({ preventScroll: true });
    const onKey = (e) => { if (e.key === 'Escape' && !e.defaultPrevented) onCloseRef.current(); };
    window.addEventListener('keydown', onKey);
    return () => {
      cancelAnimationFrame(id);
      window.removeEventListener('keydown', onKey);
      if (opener && opener !== document.body && opener.isConnected) opener.focus?.({ preventScroll: true });
    };
  }, []);
  // [TR] Odak tuzağı: Tab son öğeden ilke, Shift+Tab ilkten sona döner. [EN] Focus trap within the panel.
  const onTrapKey = (e) => {
    if (e.key !== 'Tab' || !panelRef.current) return;
    const items = [...panelRef.current.querySelectorAll(FOCUSABLE)].filter((el) => !el.closest('[aria-hidden="true"]'));
    if (!items.length) { e.preventDefault(); return; }
    const first = items[0];
    const last = items[items.length - 1];
    const active = document.activeElement;
    if (e.shiftKey && (active === first || active === panelRef.current)) { e.preventDefault(); last.focus(); }
    else if (!e.shiftKey && active === last) { e.preventDefault(); first.focus(); }
  };
  return (
    <div
      className={`fixed inset-0 z-[100] flex max-w-full items-end justify-center overflow-x-hidden bg-black/60 backdrop-blur-sm transition-opacity duration-200 motion-reduce:transition-none sm:items-center sm:p-4 ${shown ? 'opacity-100' : 'opacity-0'}`}
      role="dialog"
      aria-modal="true"
      aria-labelledby={titleId}
      onKeyDown={onTrapKey}
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div
        ref={panelRef}
        tabIndex={-1}
        data-testid={testId}
        className={`w-full overflow-y-auto overflow-x-hidden overscroll-contain rounded-t-[1.75rem] border border-b-0 border-borderSubtle bg-surface pb-[calc(1.25rem_+_env(safe-area-inset-bottom))] pl-[max(1.25rem,env(safe-area-inset-left))] pr-[max(1.25rem,env(safe-area-inset-right))] shadow-2xl outline-none transition duration-300 ease-out max-h-[calc(100dvh_-_0.75rem_-_env(safe-area-inset-top))] motion-reduce:transition-none sm:max-h-[calc(100dvh_-_2rem)] sm:rounded-3xl sm:border-b sm:p-6 ${panelClassName} ${
          shown ? 'translate-y-0 sm:scale-100 sm:opacity-100' : 'translate-y-full sm:translate-y-0 sm:scale-95 sm:opacity-0'
        }`}
      >
        <div className="mx-auto mt-2.5 h-1.5 w-10 rounded-full bg-textMuted/40 sm:hidden" aria-hidden="true" />
        <div className="flex items-center justify-between gap-3 pb-4 pt-2 sm:pt-0">
          <h2 id={titleId} className="text-lg font-bold tracking-tight text-textPrimary">{title}</h2>
          <button
            type="button"
            onClick={onClose}
            aria-label={closeLabel}
            className="-mr-2.5 flex h-11 w-11 shrink-0 items-center justify-center rounded-full text-textSecondary transition hover:bg-elevated hover:text-textPrimary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand motion-reduce:transition-none"
          >
            <X className="h-5 w-5" strokeWidth={2} aria-hidden="true" />
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}
