/**
 * Paylaşılan saniyelik saat (P1).
 *
 * [TR] Eskiden saniyelik `clockMs` state'i App kökündeki useAppSessionData içinde tutuluyordu: işlem odası açıkken
 *      tüm App ağacı (pazar, modallar, navigasyon...) her saniye yeniden render oluyordu. Saat artık modül düzeyinde
 *      bir dış store'dur; yalnız `useNow` ile abone olan YAPRAK bileşenler saniyede bir render olur.
 *      - Abone yokken interval çalışmaz; sekme gizliyken tick atılmaz.
 *      - Zincir saati farkı (chainOffset) store'a yazılır; `useNow` zincir saatini (ms) döndürür.
 * [EN] The 1s `clockMs` state used to live at the App root, re-rendering the whole tree every second while the trade
 *      room was open. The clock is now a module-level external store; only LEAF components that subscribe through
 *      `useNow` re-render each second. No subscribers = no interval; hidden tabs do not tick.
 */
import { useSyncExternalStore } from 'react';

let offsetMs = 0;
let tick = Date.now();
let timer = null;
const listeners = new Set();

const chainNow = () => Date.now() + offsetMs;

const emit = () => {
  tick = chainNow();
  listeners.forEach((listener) => listener());
};

const isHidden = () => typeof document !== 'undefined' && document.hidden === true;

export const subscribeClock = (listener) => {
  listeners.add(listener);
  if (listeners.size === 1) {
    tick = chainNow();
    timer = setInterval(() => { if (!isHidden()) emit(); }, 1000);
  }
  return () => {
    listeners.delete(listener);
    if (listeners.size === 0 && timer !== null) {
      clearInterval(timer);
      timer = null;
    }
  };
};

export const getClockSnapshot = () => tick;

/** [TR] Zincir saati - cihaz saati farkı (ms). [EN] Chain time minus device time (ms). */
export const setClockOffset = (nextOffsetMs) => {
  const value = Number.isFinite(nextOffsetMs) ? nextOffsetMs : 0;
  if (value === offsetMs) return;
  offsetMs = value;
  if (listeners.size > 0) emit();
};

/** [TR] Tick beklemeden anlık zincir saati (olay işleyicilerinde karar anı için). [EN] Fresh chain time (for handlers). */
export const getChainNowMs = () => chainNow();

export const getClockSubscriberCount = () => listeners.size;

/**
 * [TR] Zincir saati (ms), saniyede bir güncellenir. Yalnız saate ihtiyaç duyan yaprak bileşenlerde kullanın.
 *      Yeniden girişte bayat tick ile karar verilmesin diye 1.5 sn'den eski anlık görüntü taze saatle değiştirilir.
 * [EN] Chain time in ms, ticking each second. Use it only in leaf components that need the clock. A snapshot older
 *      than 1.5s (e.g. right after re-entering) is replaced by the fresh time.
 */
export const useNow = () => {
  const snapshot = useSyncExternalStore(subscribeClock, getClockSnapshot, getChainNowMs);
  const fresh = chainNow();
  return Math.abs(snapshot - fresh) > 1500 ? fresh : snapshot;
};

export default useNow;
