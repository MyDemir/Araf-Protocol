import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

// [TR] YALNIZ İPUCU: kontrat fillBuyOrder'da emir SAHİBİ için _enforceTakerEntry çağırır; sahip kayıt + WALLET_AGE_MIN (2 gün)
//      dolmadan WalletTooYoung ile revert eder. Karar mercii kontrattır. Okuma başarısız/bilinmiyorsa (ya da 0n) hiçbir şey
//      gösterilmez ve hiçbir şey kilitlenmez (fail-open).
// [EN] HINT ONLY: the contract enforces the owner's wallet age on fillBuyOrder. If the read fails or is unknown (or 0n),
//      nothing is shown or locked (fail-open). The contract remains the arbiter.
export const WALLET_AGE_MIN_SEC = 2 * 24 * 60 * 60;
export const OWNER_AGE_TTL_MS = 5 * 60 * 1000;
const MAX_TIMER_MS = 60 * 1000;

const cache = new Map(); // owner(lower) -> { value: number, at: ms }
const inflight = new Map(); // owner(lower) -> Promise
export const __resetOwnerWalletAgeCache = () => { cache.clear(); inflight.clear(); };

const key = (a) => String(a || '').toLowerCase();
const isAddr = (a) => /^0x[0-9a-fA-F]{40}$/.test(String(a || ''));

// [TR] Kalan saniyeyi "~X gün" / "~X saat" yapar (yukarı yuvarlar). [EN] Rounds up to days/hours.
export function formatOwnerAgeRemaining(sec, lang = 'TR') {
  const tr = lang === 'TR';
  const s = Math.max(0, Number(sec) || 0);
  if (s >= 86400) { const d = Math.ceil(s / 86400); return tr ? `~${d} gün` : `~${d} ${d === 1 ? 'day' : 'days'}`; }
  const h = Math.max(1, Math.ceil(s / 3600));
  return tr ? `~${h} saat` : `~${h} ${h === 1 ? 'hour' : 'hours'}`;
}

// [TR] owners: BUY emirlerinin sahip adresleri (tekrarlar tekilleştirilir). Dönen: remainingSecFor(owner) -> saniye | null.
export function useOwnerWalletAge({ owners, getWalletRegisteredAt, chainOffsetMs = 0 }) {
  const [, setVersion] = useState(0);
  const [nowMs, setNowMs] = useState(() => Date.now());
  const fnRef = useRef(getWalletRegisteredAt);
  fnRef.current = getWalletRegisteredAt;
  const hasFn = typeof getWalletRegisteredAt === 'function';

  const uniq = useMemo(() => {
    const set = new Set();
    for (const o of owners || []) if (isAddr(o)) set.add(key(o));
    return [...set].sort();
  }, [owners]);
  const uniqKey = uniq.join(',');

  useEffect(() => {
    if (!hasFn) return undefined;
    let cancelled = false;
    const bump = () => { if (!cancelled) setVersion((v) => v + 1); };
    const now = Date.now();
    for (const owner of uniq) {
      const hit = cache.get(owner);
      if (hit && now - hit.at < OWNER_AGE_TTL_MS) continue;
      if (inflight.has(owner)) { inflight.get(owner).then(bump); continue; }
      const p = Promise.resolve()
        .then(() => fnRef.current(owner))
        .then((raw) => {
          const n = Number(raw);
          // [TR] 0n = kayıtsız/bilinmiyor → ipucu yok. [EN] 0n = unknown → no hint.
          if (Number.isFinite(n) && n > 0) cache.set(owner, { value: n, at: Date.now() });
        })
        .catch(() => { /* fail-open */ })
        .finally(() => { inflight.delete(owner); });
      inflight.set(owner, p);
      p.then(bump);
    }
    return () => { cancelled = true; };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [uniqKey, hasFn]);

  const chainNowSec = (nowMs + chainOffsetMs) / 1000;
  const remainingSecFor = useCallback((owner) => {
    if (!hasFn) return null;
    const hit = cache.get(key(owner));
    if (!hit) return null;
    const rem = hit.value + WALLET_AGE_MIN_SEC - chainNowSec;
    return rem > 0 ? rem : null;
  }, [hasFn, chainNowSec]);

  // [TR] Süre dolunca etiket kendiliğinden kalkar: en yakın bitişe (en çok 60 sn) zamanlayıcı kur.
  let nextMs = null;
  for (const owner of uniq) {
    const r = remainingSecFor(owner);
    if (r != null) nextMs = nextMs == null ? r * 1000 : Math.min(nextMs, r * 1000);
  }
  useEffect(() => {
    if (nextMs == null) return undefined;
    const t = setTimeout(() => setNowMs(Date.now()), Math.min(MAX_TIMER_MS, Math.max(250, nextMs + 50)));
    return () => clearTimeout(t);
  }, [nextMs]);

  return { remainingSecFor };
}
