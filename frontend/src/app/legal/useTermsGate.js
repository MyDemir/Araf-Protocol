import React from 'react';
import { buildApiUrl } from '../apiConfig';
import { isTermsAcceptedLocally, markTermsAcceptedLocally } from './terms';

// [TR] Koşul kabulü cüzdana bağlıdır ve backend'de (TermsAcceptance) imzalı kanıtla saklanır. Modal cüzdan
//      başına bir kez görünür: yerel işaret yoksa backend'e sorulur; kabul kaydı varsa yerel işaret konur ve
//      modal hiç açılmaz (yeni cihaz/tarayıcı dahil). Sorgu sürerken modal gösterilmez; sorgu başarısızsa
//      güvenli taraf seçilir ve modal gösterilir.
// [EN] Terms acceptance is bound to the wallet and stored with signed evidence on the backend. The modal
//      shows once per wallet: without a local mark we ask the backend; if it has a record, no modal.
export const fetchTermsAccepted = async (wallet) => {
  const res = await fetch(buildApiUrl(`auth/terms-status?wallet=${wallet}`), { credentials: 'include' });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const data = await res.json();
  return data?.accepted === true;
};

export function useTermsGate({ address, isConnected, fetchStatus = fetchTermsAccepted }) {
  const wallet = String(address || '').toLowerCase();
  const [tick, setTick] = React.useState(0);
  const [server, setServer] = React.useState({ wallet: null, status: 'idle' });
  // Keep the latest fetcher without making it an effect dependency (inline fetchers would re-run the check forever).
  const fetchRef = React.useRef(fetchStatus);
  fetchRef.current = fetchStatus;
  const accepted = React.useMemo(() => Boolean(wallet) && isTermsAcceptedLocally(wallet), [wallet, tick]); // eslint-disable-line react-hooks/exhaustive-deps

  React.useEffect(() => {
    if (!isConnected || !wallet || accepted) return undefined;
    let cancelled = false;
    setServer({ wallet, status: 'checking' });
    fetchRef.current(wallet)
      .then((ok) => {
        if (cancelled) return;
        if (ok) {
          markTermsAcceptedLocally(wallet);
          setTick((t) => t + 1);
        }
        setServer({ wallet, status: ok ? 'accepted' : 'required' });
      })
      .catch(() => { if (!cancelled) setServer({ wallet, status: 'required' }); });
    return () => { cancelled = true; };
  }, [isConnected, wallet, accepted]);

  const checking = !accepted && Boolean(wallet) && (server.wallet !== wallet || server.status === 'checking');

  const markAccepted = React.useCallback(() => {
    markTermsAcceptedLocally(wallet);
    setTick((t) => t + 1);
  }, [wallet]);

  return { accepted, checking, markAccepted };
}

export default useTermsGate;
