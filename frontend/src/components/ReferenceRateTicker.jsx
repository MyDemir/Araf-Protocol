import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { fetchWithTimeout } from '../app/fetchWithTimeout';
import { buildApiUrl } from '../app/apiConfig';
import { Activity, CloudOff, Info, RotateCw, TriangleAlert } from 'lucide-react';

const POLL_MS = 60_000;

const sourceLabel = (item, lang) => {
  if (item.sourceKind === 'FIAT_OFFICIAL_REFERENCE') {
    return lang === 'TR' ? 'harici FX ref.' : 'external FX ref.';
  }
  return lang === 'TR' ? 'bilgilendirici ref.' : 'informational ref.';
};

const formatRate = (value) => {
  if (!Number.isFinite(Number(value))) return '—';
  const num = Number(value);
  if (num >= 1000) return num.toLocaleString(undefined, { maximumFractionDigits: 2 });
  if (num >= 1) return num.toLocaleString(undefined, { maximumFractionDigits: 4 });
  return num.toLocaleString(undefined, { maximumFractionDigits: 8 });
};

export default function ReferenceRateTicker({ lang = 'TR' }) {
  const [payload, setPayload] = useState(null);
  // [TR] 'loading' | 'ready' | 'unavailable'. Önceden veri gelmeyince şerit sessizce kayboluyordu;
  //      kullanıcı özelliğin var olduğunu bile göremiyordu.
  // [EN] Previously the ticker silently disappeared when no data arrived.
  const [status, setStatus] = useState('loading');
  const intervalRef = useRef(null);

  const fetchTicker = useCallback(async () => {
    if (typeof document !== 'undefined' && document.hidden) return;
    try {
      const res = await fetchWithTimeout(() => buildApiUrl('reference-rates/ticker'), {
        method: 'GET',
        headers: { Accept: 'application/json' },
      });
      if (!res.ok) throw new Error(`reference ticker request failed: ${res.status}`);
      const nextPayload = await res.json();
      const hasItems = Array.isArray(nextPayload?.items) && nextPayload.items.length > 0;
      setPayload((prev) => (hasItems ? nextPayload : prev));
      setStatus((prev) => (hasItems ? 'ready' : (prev === 'ready' ? 'ready' : 'unavailable')));
    } catch {
      // [TR] Network/provider sorunlarında son başarılı payload tutulur.
      // [EN] Keep last successful payload on network/provider failures.
      setStatus((prev) => (prev === 'ready' ? 'ready' : 'unavailable'));
    }
  }, []);

  useEffect(() => {
    fetchTicker();

    const startPolling = () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
      intervalRef.current = setInterval(fetchTicker, POLL_MS);
    };

    const stopPolling = () => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
    };

    const onVisibilityChange = () => {
      if (document.hidden) {
        stopPolling();
      } else {
        fetchTicker();
        startPolling();
      }
    };

    startPolling();
    document.addEventListener('visibilitychange', onVisibilityChange);

    return () => {
      stopPolling();
      document.removeEventListener('visibilitychange', onVisibilityChange);
    };
  }, [fetchTicker]);

  const items = useMemo(() => payload?.items || [], [payload]);

  if (!items.length) {
    if (status === 'loading') {
      return <div className="mb-3 h-9 rounded-full border border-borderSubtle bg-surface animate-pulse" aria-hidden="true" data-testid="reference-rate-ticker-loading" />;
    }
    return (
      <div className="mb-3 flex h-9 min-w-0 items-center gap-2 rounded-full border border-borderSubtle bg-surface pl-3 pr-1 text-xs text-textMuted" data-testid="reference-rate-ticker-unavailable">
        <CloudOff className="h-3.5 w-3.5 shrink-0" strokeWidth={2} aria-hidden="true" />
        <span className="min-w-0 flex-1 truncate">{lang === 'TR' ? 'Referans kurlar şu an alınamıyor.' : 'Reference rates are unavailable right now.'}</span>
        <button type="button" onClick={() => { setStatus('loading'); fetchTicker(); }} className="inline-flex h-7 shrink-0 items-center gap-1 rounded-full px-2.5 font-semibold text-textPrimary hover:bg-elevated">
          <RotateCw className="h-3.5 w-3.5" strokeWidth={2} aria-hidden="true" />{lang === 'TR' ? 'Yeniden dene' : 'Retry'}
        </button>
      </div>
    );
  }

  // [TR] Görsel katman yalnız bilgilendirme amaçlı semantiği yansıtır;
  //      settlement/dispute/reputation/risk otoritesi değildir.
  // [EN] UI only reflects informational semantics and is never authoritative.
  const informationalOnly = payload?.informationalOnly === true;
  const tr = lang === 'TR';

  // [TR] Tek satır şerit: kayan kurlar iki kenarda maske ile soluklaşır (kesik metin görünmez). Kaynak etiketi her
  //      çipin title'ında ve ekran okuyucu metninde; açıklama cümlesi sağdaki "i" düğmesinin arkasında.
  // [EN] Single-line strip: scrolling rates fade out at both edges (no hard-cut text). Source label lives in each
  //      chip's title and screen-reader text; the disclaimer sits behind the "i" button on the right.
  return (
    <section
      className="relative mb-3 flex h-9 min-w-0 items-center gap-1 rounded-full border border-borderSubtle bg-surface pl-1 pr-0.5"
      aria-label={tr ? 'Referans kur şeridi' : 'Reference rate ticker'}
      data-testid="reference-rate-ticker"
    >
      <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-brand/[0.12] text-brand" aria-hidden="true">
        <Activity className="h-3.5 w-3.5" strokeWidth={2.4} />
      </span>
      <div className="reference-ticker-track-wrap min-w-0 flex-1 [-webkit-mask-image:linear-gradient(to_right,transparent,#000_2rem,#000_calc(100%_-_2rem),transparent)] [mask-image:linear-gradient(to_right,transparent,#000_2rem,#000_calc(100%_-_2rem),transparent)] focus-within:[&_.reference-ticker-track]:[animation-play-state:paused] hover:[&_.reference-ticker-track]:[animation-play-state:paused]">
        <div className="reference-ticker-track">
          {[...items, ...items].map((item, idx) => (
            <div
              key={`${item.symbol}-${idx}`}
              title={sourceLabel(item, lang)}
              aria-hidden={idx >= items.length ? 'true' : undefined}
              className="inline-flex h-7 shrink-0 items-center gap-1.5 whitespace-nowrap rounded-full px-2.5 text-xs"
            >
              <span className="font-semibold text-textSecondary">{item.symbol}</span>
              <span className="font-mono font-semibold tabular-nums text-textPrimary">{formatRate(item.rate)}</span>
              <span className="sr-only">{sourceLabel(item, lang)}</span>
              {item.stale && (
                <span className="inline-flex items-center gap-1 text-[10px] font-semibold text-warning">
                  <span className="h-1.5 w-1.5 rounded-full bg-warning" aria-hidden="true" />{tr ? 'gecikmiş' : 'stale'}
                </span>
              )}
              <span className="ml-1 h-3 w-px bg-borderSubtle" aria-hidden="true" />
            </div>
          ))}
        </div>
      </div>
      {!informationalOnly && (
        <span className="flex h-7 w-7 shrink-0 items-center justify-center text-warning" title={tr ? 'Bilgilendirme bayrağı doğrulanamadı.' : 'Informational flag could not be verified.'}>
          <TriangleAlert className="h-3.5 w-3.5" strokeWidth={2.2} aria-hidden="true" />
          <span className="sr-only">{tr ? 'Bilgilendirme bayrağı doğrulanamadı.' : 'Informational flag could not be verified.'}</span>
        </span>
      )}
      <details className="group relative shrink-0">
        <summary className="relative flex h-8 w-8 cursor-pointer list-none items-center justify-center rounded-full text-textMuted transition hover:bg-elevated hover:text-textPrimary after:absolute after:-inset-1.5 after:content-[''] group-open:bg-elevated group-open:text-textPrimary [&::-webkit-details-marker]:hidden">
          <Info className="h-4 w-4" strokeWidth={2} aria-hidden="true" />
          <span className="sr-only">{tr ? 'Referans kurlar hakkında' : 'About reference rates'}</span>
        </summary>
        <div className="absolute right-0 top-full z-30 mt-2 w-[min(17rem,calc(100vw_-_2.5rem))] rounded-xl border border-borderSubtle bg-surface p-3 text-[11px] leading-snug text-textSecondary shadow-xl">
          <p>
            {tr
              ? 'Referans kurlar bilgilendirme amaçlıdır; escrow sonucunu etkilemez.'
              : 'Reference rates are informational only and do not affect escrow settlement.'}
          </p>
          {!informationalOnly && (
            <p className="mt-1.5 text-warning">{tr ? 'Bilgilendirme bayrağı doğrulanamadı.' : 'Informational flag could not be verified.'}</p>
          )}
        </div>
      </details>
    </section>
  );
}
