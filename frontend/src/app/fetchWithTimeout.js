// [TR] Açılış isteklerinin hiçbiri sonsuza dek beklemesin: AbortController ile zaman aşımı. URL bir fonksiyon da
//      olabilir; buildApiUrl politika hatası (throw) senkron çökmek yerine reddedilen söze dönüşür.
//      Zaman aşımı hatasının adı 'TimeoutError'dur (AbortError DEĞİL): çağıranlar AbortError'u "iptal" sayıp
//      sessizce yutuyor; zaman aşımı ise gerçek bir hata olarak görünmeli.
//      options.infra = 'backend' verilirse sonuç altyapı sağlığına bildirilir (ağ hatası/zaman aşımı/5xx = arıza).
// [EN] No boot request may wait forever. The URL may be a thunk so a buildApiUrl policy throw becomes a rejection.
//      Timeouts are named 'TimeoutError', never 'AbortError' (callers swallow AbortError as a cancellation).
import { markInfraFailure, markEscrowMismatch, registerInfraProbe } from './infraHealth';
import { buildApiUrl } from './apiConfig';

export const DEFAULT_FETCH_TIMEOUT_MS = 10000;
// [TR] Yazma (POST/PUT/PATCH/DELETE) ve dosya yüklemeleri için daha uzun süre.
export const WRITE_FETCH_TIMEOUT_MS = 60000;

export const isDegradedResponse = async (res) => {
  try {
    if (res?.headers?.get?.('x-araf-degraded') === 'true') return true;
    if (res?.status === 503 && typeof res.clone === 'function') {
      const body = await res.clone().json();
      return body?.code === 'SERVICE_DEGRADED';
    }
  } catch { /* [TR] Gövde okunamazsa genel 5xx kuralı geçerli. */ }
  return false;
};

// [TR] Backend escrow bekçisi (503 ESCROW_MISMATCH): gövde okunabiliyorsa reason döner; değilse null.
export const readEscrowMismatch = async (res) => {
  try {
    if (res?.status === 503 && typeof res.clone === 'function') {
      const body = await res.clone().json();
      if (body?.code === 'ESCROW_MISMATCH') return { reason: body?.reason };
    }
  } catch { /* [TR] Gövde okunamazsa genel 5xx kuralı geçerli. */ }
  return null;
};

// [TR] Toparlanma yoklaması: /orders/config izinli listede DEĞİL; uyumsuzluk sürerken 503, düzelince 200 döner.
const probeEscrowMismatch = async () => {
  const r = await fetchWithTimeout(() => buildApiUrl('orders/config'), { credentials: 'include', timeoutMs: 8000 });
  return r.ok;
};

export const isTimeoutError = (err) => err?.name === 'TimeoutError';

export const fetchWithTimeout = async (urlOrThunk, options = {}) => {
  const { timeoutMs = DEFAULT_FETCH_TIMEOUT_MS, infra = null, signal: callerSignal, ...init } = options;
  const url = typeof urlOrThunk === 'function' ? urlOrThunk() : urlOrThunk;
  const controller = new AbortController();
  let timedOut = false;
  const timer = setTimeout(() => { timedOut = true; controller.abort(); }, timeoutMs);
  const onCallerAbort = () => controller.abort();
  if (callerSignal) {
    if (callerSignal.aborted) controller.abort();
    else callerSignal.addEventListener('abort', onCallerAbort, { once: true });
  }
  try {
    const res = await fetch(url, { ...init, signal: controller.signal });
    if (infra) {
      // [TR] Başarı bayrağı kaldırmaz (histerezis): bkz. infraHealth.js — yalnız yoklama kaldırır.
      // [TR] Kısıtlı mod (503 SERVICE_DEGRADED ya da izinli uçta X-Araf-Degraded) ulaşılamama DEĞİLDİR: ayrı, sakin bant.
      const mismatch = infra === 'backend' ? await readEscrowMismatch(res) : null;
      if (mismatch) { markEscrowMismatch(mismatch.reason); registerInfraProbe('escrowMismatch', probeEscrowMismatch); }
      else if (infra === 'backend' && await isDegradedResponse(res)) markInfraFailure('degraded');
      else if (res.status >= 500) markInfraFailure(infra);
    }
    return res;
  } catch (err) {
    if (timedOut && !callerSignal?.aborted) {
      if (infra) markInfraFailure(infra);
      const timeoutErr = new Error(`Request timed out after ${timeoutMs}ms`);
      timeoutErr.name = 'TimeoutError';
      throw timeoutErr;
    }
    if (infra && err?.name !== 'AbortError') markInfraFailure(infra);
    throw err;
  } finally {
    clearTimeout(timer);
    callerSignal?.removeEventListener?.('abort', onCallerAbort);
  }
};

export default fetchWithTimeout;
