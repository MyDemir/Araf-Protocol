import React from 'react';
import { createPortal } from 'react-dom';
import { Check, Monitor, Moon, Sun } from 'lucide-react';
import { useThemeMode } from '../providers/ThemeProvider';
import { APP_LANG_STORAGE_KEY } from '../bootstrapState';
import { tx as t } from '../copy';

// [TR] Tema seçici: ikon düğmesi + küçük açılır menü (WAI-ARIA "menu button" kalıbı, menuitemradio).
//      Yerel <select> mobilde uygulamayla uyumsuz büyük sistem diyaloğu açıyordu; menü uygulamanın token'larıyla
//      çizilir ve body'ye portal edilir (fixed), böylece dar rayın ya da çekmecenin overflow'u onu kesmez.
// [EN] Theme picker: icon button + small popover menu (WAI-ARIA menu button pattern, menuitemradio).
//      The native <select> opened a large, off-brand OS dialog on mobile; this menu uses the app tokens and is
//      portalled to body (fixed) so the narrow rail's or drawer's overflow never clips it.
export const THEME_OPTIONS = [
  { value: 'system', Icon: Monitor, label: { TR: 'Sistem', EN: 'System' } },
  { value: 'day', Icon: Sun, label: { TR: 'Gündüz', EN: 'Day' } },
  { value: 'night', Icon: Moon, label: { TR: 'Gece', EN: 'Night' } },
];

const GAP = 8;
const MARGIN = 8;

// [TR] Saf konum hesabı: önce tetikleyicinin sağı (masaüstü sol ray), sığmazsa üstü (mobil çekmece altı),
//      o da sığmazsa altı; sonuç her durumda görünür alanın içine kıstırılır.
// [EN] Pure placement: prefer the trigger's right side (desktop rail), else above (mobile drawer footer),
//      else below; the result is always clamped inside the viewport.
export const computeMenuPosition = (trigger, menu, viewport) => {
  const { width: mw, height: mh } = menu;
  const { width: vw, height: vh } = viewport;
  let left;
  let top;
  if (trigger.right + GAP + mw + MARGIN <= vw) {
    left = trigger.right + GAP;
    // [TR] Ray altındaki düğmede menünün altı düğmenin altıyla hizalanır, yukarı doğru açılır.
    top = trigger.top + mh > vh - MARGIN ? trigger.bottom - mh : trigger.top;
  } else {
    left = trigger.right - mw;
    top = trigger.top - GAP - mh;
    if (top < MARGIN) top = trigger.bottom + GAP;
  }
  left = Math.min(Math.max(left, MARGIN), Math.max(MARGIN, vw - mw - MARGIN));
  top = Math.min(Math.max(top, MARGIN), Math.max(MARGIN, vh - mh - MARGIN));
  return { left: Math.round(left), top: Math.round(top) };
};

const readStoredLang = () => {
  try {
    return typeof window !== 'undefined' && window.localStorage.getItem(APP_LANG_STORAGE_KEY) === 'TR' ? 'TR' : 'EN';
  } catch {
    return 'EN';
  }
};

let idSeq = 0;

export const ThemeToggle = ({ lang: langProp }) => {
  const lang = langProp === 'TR' || langProp === 'EN' ? langProp : readStoredLang();
  const { themeMode, setThemeMode } = useThemeMode();
  const [open, setOpen] = React.useState(false);
  const [position, setPosition] = React.useState(null);
  const triggerRef = React.useRef(null);
  const menuRef = React.useRef(null);
  const itemRefs = React.useRef([]);
  const initialFocusRef = React.useRef('checked');
  const [menuId] = React.useState(() => { idSeq += 1; return `theme-menu-${idSeq}`; });

  const currentIndex = Math.max(0, THEME_OPTIONS.findIndex((o) => o.value === themeMode));
  const current = THEME_OPTIONS[currentIndex];
  const { Icon } = current;
  const themeWord = t(lang, 'Tema', 'Theme');
  const triggerLabel = `${themeWord}: ${current.label[lang]}`;

  const focusItem = (index) => {
    const count = THEME_OPTIONS.length;
    const i = ((index % count) + count) % count;
    itemRefs.current[i]?.focus();
  };

  const close = React.useCallback((returnFocus) => {
    setOpen(false);
    setPosition(null);
    if (returnFocus) triggerRef.current?.focus();
  }, []);

  const openMenu = (focus = 'checked') => {
    initialFocusRef.current = focus;
    setOpen(true);
  };

  const place = React.useCallback(() => {
    const trigger = triggerRef.current;
    const menu = menuRef.current;
    if (!trigger || !menu || typeof window === 'undefined') return;
    const rect = trigger.getBoundingClientRect();
    setPosition(computeMenuPosition(
      rect,
      { width: menu.offsetWidth, height: menu.offsetHeight },
      { width: window.innerWidth, height: window.innerHeight },
    ));
  }, []);

  // [TR] Açılınca önce konumla (menü ölçülene kadar visibility:hidden), görünür olunca seçili ya da istenen öğeye
  //      odaklan — gizli öğe odak alamaz.
  // [EN] Position first (menu is visibility:hidden until measured), then focus once visible — hidden nodes can't
  //      take focus.
  const isPlaced = position != null;
  React.useLayoutEffect(() => {
    if (open) place();
  }, [open, place]);
  React.useLayoutEffect(() => {
    if (!open || !isPlaced) return;
    const target = initialFocusRef.current;
    initialFocusRef.current = null;
    if (!target) return;
    const index = target === 'first' ? 0 : target === 'last' ? THEME_OPTIONS.length - 1 : currentIndex;
    focusItem(index);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, isPlaced]);

  React.useEffect(() => {
    if (!open) return undefined;
    const onPointerDown = (event) => {
      const target = event.target;
      if (menuRef.current?.contains(target) || triggerRef.current?.contains(target)) return;
      close(false);
    };
    const onViewportChange = () => place();
    document.addEventListener('pointerdown', onPointerDown, true);
    window.addEventListener('resize', onViewportChange);
    window.addEventListener('scroll', onViewportChange, true);
    return () => {
      document.removeEventListener('pointerdown', onPointerDown, true);
      window.removeEventListener('resize', onViewportChange);
      window.removeEventListener('scroll', onViewportChange, true);
    };
  }, [open, close, place]);

  const select = (value) => {
    setThemeMode(value);
    close(true);
  };

  const onTriggerKeyDown = (event) => {
    if (event.key === 'ArrowDown') {
      event.preventDefault();
      openMenu('checked');
    } else if (event.key === 'ArrowUp') {
      event.preventDefault();
      openMenu('last');
    }
  };

  const onMenuKeyDown = (event) => {
    const index = itemRefs.current.findIndex((el) => el === document.activeElement);
    switch (event.key) {
      case 'ArrowDown':
        event.preventDefault();
        focusItem(index + 1);
        break;
      case 'ArrowUp':
        event.preventDefault();
        focusItem(index - 1);
        break;
      case 'Home':
        event.preventDefault();
        focusItem(0);
        break;
      case 'End':
        event.preventDefault();
        focusItem(THEME_OPTIONS.length - 1);
        break;
      case 'Escape':
        event.preventDefault();
        close(true);
        break;
      case 'Tab':
        // [TR] Odak tetikleyiciye döner; tarayıcı Tab'ı oradan sürdürür (sayfa akışı korunur).
        close(true);
        break;
      default:
        break;
    }
  };

  const menu = open ? (
    <div
      ref={menuRef}
      id={menuId}
      role="menu"
      aria-label={themeWord}
      onKeyDown={onMenuKeyDown}
      data-testid="theme-menu"
      style={{ position: 'fixed', left: position?.left ?? 0, top: position?.top ?? 0, visibility: position ? 'visible' : 'hidden' }}
      className="z-[110] w-44 rounded-card border border-borderStrong bg-surface p-1 shadow-2xl animate-menu-pop"
    >
      <p aria-hidden="true" className="px-3 pt-1.5 pb-1 text-[11px] font-semibold uppercase tracking-wider text-textMuted">{themeWord}</p>
      {THEME_OPTIONS.map((option, i) => {
        const checked = option.value === themeMode;
        const OptionIcon = option.Icon;
        return (
          <button
            key={option.value}
            ref={(el) => { itemRefs.current[i] = el; }}
            type="button"
            role="menuitemradio"
            aria-checked={checked}
            tabIndex={-1}
            onClick={() => select(option.value)}
            className={`w-full h-10 px-3 flex items-center gap-3 rounded-control text-sm text-left outline-none transition-colors motion-reduce:transition-none focus-visible:ring-2 focus-visible:ring-brand focus-visible:ring-inset ${checked ? 'bg-elevated text-textPrimary font-semibold' : 'text-textSecondary hover:bg-elevated hover:text-textPrimary focus:bg-elevated focus:text-textPrimary'}`}
          >
            <OptionIcon className="w-4 h-4 shrink-0" strokeWidth={1.8} aria-hidden="true" />
            <span className="flex-1">{option.label[lang]}</span>
            {checked && <Check className="w-4 h-4 shrink-0 text-brand" strokeWidth={2.2} aria-hidden="true" />}
          </button>
        );
      })}
    </div>
  ) : null;

  return (
    <>
      <button
        ref={triggerRef}
        type="button"
        aria-haspopup="menu"
        aria-expanded={open}
        aria-controls={open ? menuId : undefined}
        aria-label={triggerLabel}
        title={triggerLabel}
        onClick={() => (open ? close(false) : openMenu('checked'))}
        onKeyDown={onTriggerKeyDown}
        data-testid="theme-toggle"
        className={`w-10 h-10 shrink-0 rounded-xl border flex items-center justify-center transition-colors motion-reduce:transition-none outline-none focus-visible:ring-2 focus-visible:ring-brand focus-visible:ring-offset-2 focus-visible:ring-offset-shell ${open ? 'border-borderStrong bg-elevated text-textPrimary' : 'border-borderSubtle bg-surface text-textMuted hover:text-textPrimary hover:bg-elevated'}`}
      >
        <Icon className="w-5 h-5" strokeWidth={1.8} aria-hidden="true" />
      </button>
      {menu && typeof document !== 'undefined' ? createPortal(menu, document.body) : null}
    </>
  );
};

export default ThemeToggle;
