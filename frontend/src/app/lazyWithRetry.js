// [TR] React.lazy için yeniden denemeli içe aktarma: geçici ağ kesintisinde 2 kez daha dener (500 ms, 1500 ms).
//      Hâlâ başarısızsa hata fırlatır; ErrorBoundary "Yenile" düğmesiyle yakalar.
// [EN] React.lazy with retry: transient network failures get 2 more attempts before the boundary shows "Reload".
import React from 'react';

export const importWithRetry = async (importer, delays = [500, 1500]) => {
  let lastErr;
  for (let i = 0; i <= delays.length; i += 1) {
    try {
      return await importer();
    } catch (err) {
      lastErr = err;
      if (i < delays.length) await new Promise((r) => setTimeout(r, delays[i]));
    }
  }
  throw lastErr;
};

export const lazyWithRetry = (importer, delays) => React.lazy(() => importWithRetry(importer, delays));

const CHUNK_ERROR_RE = /dynamically imported module|importing a module script failed|loading chunk|chunkloaderror/i;
export const isChunkLoadError = (err) => CHUNK_ERROR_RE.test(`${err?.name || ''} ${err?.message || ''}`);
