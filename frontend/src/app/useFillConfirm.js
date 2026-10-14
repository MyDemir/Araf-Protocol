import React from 'react';

// [TR] Pencere açık kalabilecek en uzun süre. Dolunca pencere kapanır ve çağıran 'timeout' alır (tx gönderilmez).
// [EN] Longest time the sheet may stay open. On expiry it closes and the caller receives 'timeout' (no tx).
export const FILL_CONFIRM_TIMEOUT_MS = 2 * 60 * 1000;
export const FILL_CONFIRM_TIMEOUT = 'timeout';

// [TR] Emre girme onay penceresinin durumu: confirmFill(özet) bir Promise döner: onayda true, vazgeçişte (Esc, arka plan,
//      X, "Vazgeç") ya da bileşen kalkınca false, süre dolunca 'timeout'. Yalnızca === true onaydır. window.confirm ile aynı
//      semantik: onay yoksa çağıran hiçbir işlem göndermez. Aynı anda tek pencere olur; yenisi eskisini vazgeçmiş sayar.
//      Her açılışa artan bir `seq` verilir; üst bileşen bunu key yapar, böylece ardışık açılışlar yeni örnek olur.
// [EN] State for the order-entry confirmation sheet: confirmFill(summary) resolves true on confirm, false on dismissal or
//      unmount and 'timeout' on expiry; only === true means confirmed. Each opening gets an increasing `seq` (used as a key).
export function useFillConfirm({ timeoutMs = FILL_CONFIRM_TIMEOUT_MS } = {}) {
  const [summary, setSummary] = React.useState(null);
  const resolverRef = React.useRef(null);
  const timerRef = React.useRef(null);
  const seqRef = React.useRef(0);

  const clearTimer = () => {
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = null;
  };

  const settle = React.useCallback((result) => {
    const resolve = resolverRef.current;
    resolverRef.current = null;
    clearTimer();
    setSummary(null);
    if (resolve) resolve(result === FILL_CONFIRM_TIMEOUT ? FILL_CONFIRM_TIMEOUT : result === true);
  }, []);

  const confirmFill = React.useCallback((nextSummary) => new Promise((resolve) => {
    if (resolverRef.current) resolverRef.current(false);
    clearTimer();
    resolverRef.current = resolve;
    seqRef.current += 1;
    setSummary({ ...nextSummary, seq: seqRef.current });
    timerRef.current = setTimeout(() => settle(FILL_CONFIRM_TIMEOUT), timeoutMs);
  }), [settle, timeoutMs]);

  React.useEffect(() => () => {
    clearTimer();
    if (resolverRef.current) resolverRef.current(false);
    resolverRef.current = null;
  }, []);

  return { confirmFill, fillConfirmSummary: summary, settleFillConfirm: settle };
}

export default useFillConfirm;
