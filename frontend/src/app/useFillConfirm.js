import React from 'react';

// [TR] Emre girme onay penceresinin durumu: confirmFill(özet) bir Promise<boolean> döner; kullanıcı onaylayınca true,
//      vazgeçince (Esc, arka plan, X, "Vazgeç") ya da bileşen kalkınca false. window.confirm ile aynı semantik:
//      false ise çağıran hiçbir işlem göndermez. Aynı anda tek pencere olur; yenisi eskisini vazgeçmiş sayar.
// [EN] State for the order-entry confirmation sheet: confirmFill(summary) resolves true on confirm and false on any
//      dismissal or unmount. Same semantics as window.confirm: on false the caller sends no transaction.
export function useFillConfirm() {
  const [summary, setSummary] = React.useState(null);
  const resolverRef = React.useRef(null);

  const settle = React.useCallback((accepted) => {
    const resolve = resolverRef.current;
    resolverRef.current = null;
    setSummary(null);
    if (resolve) resolve(accepted === true);
  }, []);

  const confirmFill = React.useCallback((nextSummary) => new Promise((resolve) => {
    if (resolverRef.current) resolverRef.current(false);
    resolverRef.current = resolve;
    setSummary(nextSummary);
  }), []);

  React.useEffect(() => () => {
    if (resolverRef.current) resolverRef.current(false);
    resolverRef.current = null;
  }, []);

  return { confirmFill, fillConfirmSummary: summary, settleFillConfirm: settle };
}

export default useFillConfirm;
