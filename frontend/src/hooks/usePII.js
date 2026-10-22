"use strict";

/**
 * usePII — Güvenli payout profile + contact fetch hook
 *
 * Güvenlik Özellikleri:
 *   - Payout profile verisi React state'te kalıcı olarak saklanmaz
 *   - Trade room unmount olduğunda payout/contact state temizlenir
 *   - Her gösterimde yeniden fetch yapılır (cache yok)
 *   - Kısa ömürlü PII token ile 2 adımlı erişim
 *   - tüm authentication httpOnly cookie üzerinden (credentials: include)
 *
 * YÜKS-06 Fix: Refresh Token Desenkronizasyonu düzeltildi.
 *   ÖNCEKİ: Düz `fetch` kullanılıyordu. JWT süresi dolarsa 401 alınıyor ama
 *   hook kendi başına token yenileyemiyordu → "PII erişimi reddedildi" hatası
 *   → yetkili kullanıcı payout bilgisine erişemez → gereksiz uyuşmazlık tetiklenebilir.
 *   ŞİMDİ: App.jsx'teki `authenticatedFetch` referansı prop olarak alınıyor.
 *   Bu sayede JWT süresi dolduğunda otomatik yenileme yapılıyor.
 *
 * YÜKS-07 Fix: İstek Yarışı (Race Condition) düzeltildi.
 *   ÖNCEKİ: Önceki isteği iptal eden mekanizma yoktu. Butona hızlıca art arda
 *   basılırsa birden fazla request → eski yanıt yeni yanıtın üzerine yazabilirdi.
 *   ŞİMDİ: Her yeni `fetchPII` çağrısında AbortController ile önceki istek iptal
 *   ediliyor. Sadece en son istek sonucu state'e yazılıyor.
 *
 * Kullanım (App.jsx'te):
 *   const { pii, loading, error, fetchPII, clearPII } = usePII(tradeId, authenticatedFetch);
 *   <button onClick={fetchPII}>Payout bilgilerini göster</button>
 */

import { useState, useEffect, useRef, useCallback } from 'react';
import { buildApiUrl } from '../app/apiConfig';
import { APP_LANG_STORAGE_KEY } from '../app/bootstrapState';

const readLang = () => {
  try {
    return typeof window !== 'undefined' && window.localStorage.getItem(APP_LANG_STORAGE_KEY) === 'TR' ? 'TR' : 'EN';
  } catch {
    return 'EN';
  }
};

// [TR] Backend production'da zinciri okuyamazsa 503 ONCHAIN_STATE_UNAVAILABLE döner: PII fail-closed gizlenir.
export const piiErrorMessage = (status, body, lang = readLang()) => {
  if (status === 503 && body?.code === 'ONCHAIN_STATE_UNAVAILABLE') {
    return lang === 'TR'
      ? 'Zincir şu an okunamıyor, ödeme bilgisi geçici olarak gizli.'
      : 'The chain cannot be read right now, payout info is temporarily hidden.';
  }
  return null;
};

/**
 * @param {string}   tradeId           Backend trade ID (MongoDB _id)
 * @param {Function} authenticatedFetch App.jsx'ten gelen JWT yönetimli fetch wrapper'ı
 */
export function usePII(tradeId, authenticatedFetch) {
  const [pii, setPii]         = useState(null);   // { payoutProfile }
  const [loading, setLoading] = useState(false);
  const [error, setError]     = useState(null);

  const mountedRef     = useRef(true);
  // YÜKS-07 Fix: Aktif isteği iptal etmek için AbortController ref'i
  const abortCtrlRef   = useRef(null);

  // [TR] Trade ID değişince veya unmount'ta state temizle + aktif istek iptal et
  // [EN] Clear state and abort active request on tradeId change or unmount
  useEffect(() => {
    mountedRef.current = true;
    // [TR] Önceki işlemin hata/yükleniyor durumu yeni işleme taşınmasın.
    setError(null);
    setLoading(false);
    return () => {
      mountedRef.current = false;
      setPii(null); // unmount → payout profile bellekten sil
      if (abortCtrlRef.current) {
        abortCtrlRef.current.abort();
      }
    };
  }, [tradeId]);

  const fetchPII = useCallback(async () => {
    if (!tradeId) {
      setError('Trade ID eksik.');
      return;
    }

    // YÜKS-07 Fix: Önceki istek varsa iptal et, yeni AbortController oluştur
    if (abortCtrlRef.current) {
      abortCtrlRef.current.abort();
    }
    abortCtrlRef.current = new AbortController();
    const { signal } = abortCtrlRef.current;

    setLoading(true);
    setError(null);

    try {
      // ADIM 1: Kısa ömürlü PII erişim token'ı al
      // F2-20 (DURDU, onay bekliyor): düz fetch yedeği KALDI; kaldırmak mevcut PIIDisplay testlerinin kurulumunu
      //        (authenticatedFetch vermeden global fetch mock'u) bozar. Bkz. rapor.
      const doFetch = authenticatedFetch || ((url, opts) =>
        fetch(url, { ...opts, credentials: 'include' })
      );

      const tokenRes = await doFetch(
        // [TR] API base çözümlemesi tek canonical helper üzerinden yapılır.
        //      Böylece production same-origin /api politikası ihlal edilmez.
        // [EN] Resolve API base through the canonical helper to preserve
        //      production same-origin /api policy.
        buildApiUrl(`pii/request-token/${tradeId}`),
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          signal,
        }
      );

      if (!tokenRes.ok) {
        const body = await tokenRes.json().catch(() => ({}));
        throw new Error(piiErrorMessage(tokenRes.status, body) || body.error || `PII erişimi reddedildi (${tokenRes.status})`);
      }

      const { piiToken } = await tokenRes.json();

      // [TR] İptal edildiyse devam etme
      if (signal.aborted) return;

      // ADIM 2: Trade-scoped PII endpoint'i hem Bearer token
      //         hem de cookie/session-wallet guard ister.
      //         Bu nedenle authenticatedFetch kullanmak zorunludur.
      const piiRes = await doFetch(buildApiUrl(`pii/${tradeId}`), {
        headers: { 'Authorization': `Bearer ${piiToken}` },
        signal,
      });

      if (!piiRes.ok) {
        const body = await piiRes.json().catch(() => ({}));
        throw new Error(piiErrorMessage(piiRes.status, body) || body.error || `PII verisi alınamadı (${piiRes.status})`);
      }

      const data = await piiRes.json();

      // [TR] Sadece hâlâ mount ve iptal edilmemişse state güncelle
      if (mountedRef.current && !signal.aborted) {
        const payload = {
          payoutProfile: data.payoutProfile || null,
        };
        setPii(payload);
        return payload;
      }
      return null;
    } catch (err) {
      // [TR] AbortError beklenen bir iptal — state'e hata yazma
      // [EN] AbortError is an expected cancellation — don't write error to state
      if (err.name === 'AbortError') return;

      if (mountedRef.current) {
        setError(err.message);
      }
      return null;
    } finally {
      if (mountedRef.current && !signal.aborted) {
        setLoading(false);
      }
    }
  }, [tradeId, authenticatedFetch]);

  const clearPII = useCallback(() => {
    // [TR] Aktif istek varsa iptal et
    if (abortCtrlRef.current) {
      abortCtrlRef.current.abort();
      abortCtrlRef.current = null;
    }
    setPii(null);
    setError(null);
    // [TR] F2-11: iptal edilen isteğin finally'si setLoading(false) yapmaz; burada sıfırlanmazsa loading takılı kalır.
    setLoading(false);
  }, []);

  return { pii, loading, error, fetchPII, clearPII };
}
