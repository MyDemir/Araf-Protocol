// [TR] Açılış isteklerinin hiçbiri sonsuza dek beklemesin: AbortController ile zaman aşımı. URL bir fonksiyon da
//      olabilir; buildApiUrl politika hatası (throw) senkron çökmek yerine reddedilen söze dönüşür.
//      Zaman aşımı hatasının adı 'TimeoutError'dur (AbortError DEĞİL): çağıranlar AbortError'u "iptal" sayıp
//      sessizce yutuyor; zaman aşımı ise gerçek bir hata olarak görünmeli.
//      options.infra = 'backend' verilirse sonuç altyapı sağlığına bildirilir (ağ hatası/zaman aşımı/5xx = arıza).
// [EN] No boot request may wait forever. The URL may be a thunk so a buildApiUrl policy throw becomes a rejection.
//      Timeouts are named 'TimeoutError', never 'AbortError' (callers swallow AbortError as a cancellation).
import { markInfraFailure, reportInfraSuccess } from './infraHealth';

export const DEFAULT_FETCH_TIMEOUT_MS = 10000;
// [TR] Yazma (POST/PUT/PATCH/DELETE) ve dosya yüklemeleri için daha uzun süre.
export const WRITE_FETCH_TIMEOUT_MS = 60000;

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
      if (res.status >= 500) markInfraFailure(infra);
      else reportInfraSuccess(infra);
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
