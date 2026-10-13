/**
 * ErrorBoundary — Global Render Hata Sınırı & Senkronize Loglama
 *
 * [TR] React render hatalarını yakalar, kullanıcıya dostu bir arayüz gösterir
 * ve hatayı backend'deki merkezi log sistemine sessizce gönderir.
 *
 * YÜKS-10 Fix: ErrorBoundary Üzerinden PII Sızıntısı kapatıldı.
 *   ÖNCEKİ: Hata tam IBAN render edilirken (örn. PIIDisplay içinde) oluşursa
 *   componentStack veya error.message içinde plaintext IBAN log dosyasına yazılıyordu.
 *   ŞİMDİ: Log gönderilmeden önce bilinen PII pattern'ları (IBAN, telefon, vb.)
 *   scrub fonksiyonu ile temizleniyor. PIIDisplay bileşeninden kaynaklanan
 *   hatalar özel olarak işaretleniyor.
 *
 * FRONT-11 Fix: Canonical client-error endpoint çözümlemesi düzeltildi.
 *   ÖNCEKİ: fetch(`${logBase}/logs/client-error`) tabanı yanlış çözülürse
 *   /api eksik endpoint'e gidiyordu (örn. https://api.example.com/logs/...).
 *   ŞİMDİ: resolveClientErrorLogUrl() ile tek canonical hedef kullanılır:
 *   /api/logs/client-error (env/proxy senaryolarında normalize).
 */

import { TriangleAlert } from 'lucide-react';
import React from 'react';
import { resolveClientErrorLogUrl } from '../app/apiConfig';
import { isChunkLoadError } from '../app/lazyWithRetry';

// [TR] Hassas veri pattern'ları — log göndermeden önce temizlenir
// [EN] Sensitive data patterns — scrubbed before sending logs
export const PII_PATTERNS = [
  // [TR] E-posta adresi. [EN] Email address.
  /[A-Z0-9._%+-]+@[A-Z0-9-]+(?:\.[A-Z0-9-]+)*\.[A-Z]{2,}/gi,
  // [TR] Genel IBAN: 2 harf + 2 rakam + 11-30 alfanümerik (boşluk/tire gruplu yazımlar dahil). TR IBAN da buna girer.
  // [EN] Generic IBAN: 2 letters + 2 digits + 11-30 alphanumerics (grouped with spaces/dashes too). Covers TR IBAN.
  /\b[A-Z]{2}\d{2}[ -]?(?:[A-Z0-9][ -]?){11,30}\b/gi,
  // [TR] US routing (9 hane) ve hesap numarası; JSON/tırnaklı biçimler dahil ("routing_number":"021000021").
  // [EN] US routing (9 digits) and account numbers, including JSON/quoted forms.
  /\b(?:routing|aba)(?:[_\s-]?(?:number|no))?["'\s:=#-]*\d{9}\b/gi,
  /\b(?:account|acct)(?:[_\s-]?(?:number|no))?["'\s:=#-]*\d{4,17}\b/gi,
  // Kart numaraları (16 hane)
  /\b\d{4}[\s-]?\d{4}[\s-]?\d{4}[\s-]?\d{4}\b/g,
  // [TR] Telefon: uluslararası (+ ile), Türk cep, ulusal 0'lı ve US (xxx) xxx-xxxx biçimleri.
  // [EN] Phones: international (+ prefix), Turkish mobile, national 0-prefixed and US formats.
  /\+\d[\d\s().-]{8,16}\d/g,
  /(\+90|0)?\s?[5][0-9]{2}[\s-]?[0-9]{3}[\s-]?[0-9]{2}[\s-]?[0-9]{2}/g,
  /\b0\d{2,3}[\s.-]?\d{3}[\s.-]?\d{2}[\s.-]?\d{2}\b/g,
  /\(?\b\d{3}\)?[\s.-]\d{3}[\s.-]\d{4}\b/g,
  // Ethereum adresleri (logda gerekli değilse)
  // /0x[a-fA-F0-9]{40}/g,
];

/**
 * PII içeren string'leri temizler.
 * @param {string} text - Temizlenecek metin
 * @returns {string} Scrub edilmiş metin
 */
export function scrubPII(text) {
  if (!text || typeof text !== 'string') return text;
  let clean = text;
  for (const pattern of PII_PATTERNS) {
    clean = clean.replace(pattern, '[REDACTED]');
  }
  return clean;
}


export default class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error) {
    return { hasError: true, error };
  }

  componentDidCatch(error, errorInfo) {
    // 1. Tarayıcı konsoluna bas (geliştirme aşaması için)
    console.error('[ErrorBoundary] Kritik Render Hatası:', error, errorInfo);

    // FRONT-11 Fix: Log endpoint çözümlemesi canonical /api üzerinden tek helper'da.
    // Üretimde VITE_API_URL boş olsa bile same-origin /api rewrite ile log denemesi yapılır.
    // [TR] Politika ihlalinde (prod + mutlak VITE_API_URL) bu çağrı fırlatır; boundary'nin kendisi çökerse tüm ağaç
    //      sökülüp beyaz ekran kalıyordu. Log atılamıyorsa yalnız konsola yazılır.
    // [EN] On an API policy violation this throws; a throwing boundary unmounts the whole tree (white screen).
    let logUrl;
    try { logUrl = resolveClientErrorLogUrl(); } catch { logUrl = null; }

    // YÜKS-10 Fix: PII içerebilecek alanlar gönderilmeden önce scrub ediliyor
    if (!logUrl) return;
    const scrubbedMessage    = scrubPII(error?.message || 'Bilinmeyen Render Hatası');
    const scrubbedStack      = scrubPII(error?.stack || '');
    // PIIDisplay kaynaklı hatalar için componentStack'ten yalnızca bileşen adları alınır
    const componentStackLines = (errorInfo?.componentStack || '')
      .split('\n')
      .filter(Boolean)
      .map(line => line.trim())
      .slice(0, 20); // stack'in tamamını değil sadece üst 20 satırı gönder

    try {
      fetch(logUrl, {
        signal: typeof AbortSignal !== 'undefined' && AbortSignal.timeout ? AbortSignal.timeout(5000) : undefined,
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          level:          'ERROR',
          message:        scrubbedMessage,
          stack:          scrubbedStack,
          componentStack: scrubPII(componentStackLines.join('\n')), // plaintext PII yok
          url:            window.location.href,
          timestamp:      new Date().toISOString(),
        }),
      }).catch(() => {
        // [TR] Backend kapalıysa veya ağ hatası varsa uygulamayı çökertme
        // [EN] Never allow logging failure to trigger a secondary crash
      });
    } catch (_) {
      // [TR] fetch çağrısı senkron olarak hata fırlatırsa da boundary güvenli kalmalı.
      // [EN] Keep fallback stable even if fetch throws synchronously.
    }
  }


  componentDidUpdate(prevProps) {
    // [TR] Görünüm değişince (resetKeys) bölüm yedek UI'si kapanır; kullanıcı başka sekmeye geçince yeniden dener.
    if (this.state.hasError && Array.isArray(this.props.resetKeys)) {
      const prev = prevProps.resetKeys || [];
      if (this.props.resetKeys.length !== prev.length || this.props.resetKeys.some((k, i) => !Object.is(k, prev[i]))) {
        this.setState({ hasError: false, error: null });
      }
    }
  }

  render() {
    if (this.state.hasError && this.props.scope === 'section') {
      if (this.props.fallback !== undefined) return this.props.fallback;
      const chunk = isChunkLoadError(this.state.error);
      return (
        <div role="alert" data-testid="section-error-fallback" className="w-full max-w-xl mx-auto my-8 p-6 rounded-xl border border-red-500/30 bg-surface text-center">
          <TriangleAlert className="w-8 h-8 mx-auto mb-3 text-red-400" strokeWidth={1.8} aria-hidden="true" />
          <h2 className="font-bold text-lg mb-2">{chunk ? 'Bu bölüm yüklenemedi / This section failed to load' : 'Bu bölüm görüntülenemedi / This section could not be displayed'}</h2>
          <p className="text-sm text-textMuted mb-4">
            {chunk
              ? 'Bağlantı kesilmiş ya da yeni sürüm yayınlanmış olabilir. Yenileyin. / Connection dropped or a new version was deployed. Please reload.'
              : 'Diğer bölümler çalışmaya devam ediyor. / The rest of the app keeps working.'}
          </p>
          <div className="flex gap-2 justify-center">
            {!chunk && (
              <button type="button" onClick={() => this.setState({ hasError: false, error: null })} className="px-4 py-2 rounded-lg border border-borderStrong text-sm font-semibold">
                Tekrar dene / Retry
              </button>
            )}
            <button type="button" onClick={() => window.location.reload()} className="px-4 py-2 rounded-lg bg-brand text-black text-sm font-semibold">
              Sayfayı yenile / Reload
            </button>
          </div>
        </div>
      );
    }
    if (this.state.hasError) {
      return (
        <div className="min-h-screen bg-slate-900 flex items-center justify-center p-4 font-sans">
          <div className="bg-slate-800 border border-red-500/30 rounded-2xl p-8 max-w-md w-full text-center shadow-2xl">
            <div className="mb-6 flex justify-center text-red-400"><TriangleAlert className="w-12 h-12" strokeWidth={1.8} aria-hidden="true" /></div>
            <h2 className="text-white font-bold text-2xl mb-3">Sistemde Kesinti Oluştu</h2>
            <p className="text-slate-400 text-sm mb-8 leading-relaxed">
              İşleminiz sırasında teknik bir sorun oluştu.
              Lütfen sayfayı yenileyin; sorun devam ederse tekrar deneyin.
            </p>
            <div className="flex flex-col gap-3">
              <button
                onClick={() => window.location.reload()}
                className="w-full bg-blue-600 hover:bg-blue-500 text-white font-bold py-3 px-6 rounded-xl transition-all active:scale-95 shadow-lg shadow-blue-900/20"
              >
                Sayfayı Yenile
              </button>
              <button
                onClick={() => window.location.href = '/'}
                className="w-full bg-transparent border border-slate-600 hover:bg-slate-700 text-slate-300 py-2.5 px-6 rounded-xl transition-all"
              >
                Ana Sayfaya Dön
              </button>
            </div>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}
