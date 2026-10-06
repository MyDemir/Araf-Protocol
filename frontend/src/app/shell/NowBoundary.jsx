import { useNow } from '../clock';

/**
 * [TR] Saat sınırı: yalnız bu bileşen (ve render-prop'unun ürettiği alt ağaç) saniyede bir render olur. App kökü
 *      render olmaz. `fixedNowMs` verilirse (test / UI Lab) saat kullanılmaz, sabit değer esas alınır.
 * [EN] Clock boundary: only this component (and the subtree its render prop returns) re-renders each second; the App
 *      root does not. A finite `fixedNowMs` (tests / UI Lab) overrides the clock.
 */
export default function NowBoundary({ render, fixedNowMs = null }) {
  const clockNow = useNow();
  const nowMs = Number.isFinite(fixedNowMs) ? fixedNowMs : clockNow;
  return render(nowMs);
}
