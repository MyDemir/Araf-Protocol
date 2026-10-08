import React from 'react';
import { CRITICAL_ENV_ERROR_CODES, envErrorCode, envErrorMessage } from '../envErrorCodes';

// [TR] Üst bant uyarılarının "kapat" hafızası. Kalıcı değil: yalnız bu sekme oturumu (sessionStorage).
//      Depolama erişilemezse (gizli mod, engelli site verisi) modül içi bellek kullanılır.
//      Her uyarı, anahtarı + dilden bağımsız içerik imzasıyla hatırlanır; içerik değişirse (farklı hata) yeniden görünür.
// [EN] Dismiss memory for top-bar warnings. Not persistent: this tab session only (sessionStorage), with an
//      in-memory fallback when storage throws. Remembered by key + a language-independent content signature, so a
//      different error under the same key shows up again.
export const STATUS_DISMISS_STORAGE_KEY = 'araf_dismissed_statuses_v1';

// [TR] Kullanıcı güvenliği: bu durumlar kapatılamaz.
//      - unsupported_chain: yanlış ağda imza atmak fon kaybına yol açabilir.
//      - paused: protokol bakımda / acil durdurmada; yeni işlem açılamaz, kullanıcı bunu her an görmeli.
//      - env_error içinde kritik kodlu bir hata (CRITICAL_ENV_ERROR_CODES): escrow adresi/zincir uyuşmazlığı,
//        eksik escrow adresi, API taban URL politikası ihlali.
// [EN] User safety: never dismissible — wrong network, protocol paused, and env errors carrying a critical code.
export const NON_DISMISSABLE_STATUS_KEYS = ['unsupported_chain', 'paused'];

// [TR] Yalnız geriye dönük yedek: kodsuz (düz metin) eski girdiler için. Asıl karar koddan verilir.
// [EN] Legacy fallback only, for code-less plain-string entries. The code is the primary signal.
export const LEGACY_CRITICAL_DETAIL_PATTERNS = [
  /escrow adresi uyuşmuyor/i,
  /backend zinciri/i,
  /VITE_ESCROW_ADDRESS tanımlı değil/i,
];

const isCriticalEnvEntry = (entry) => {
  const code = envErrorCode(entry);
  if (code) return CRITICAL_ENV_ERROR_CODES.includes(code);
  const text = envErrorMessage(entry);
  return LEGACY_CRITICAL_DETAIL_PATTERNS.some((re) => re.test(text));
};

export const isCriticalStatus = (status) => {
  if (!status) return false;
  if (NON_DISMISSABLE_STATUS_KEYS.includes(status.key)) return true;
  if (status.key === 'env_error' && Array.isArray(status.details)) {
    return status.details.some(isCriticalEnvEntry);
  }
  return false;
};

// [TR] djb2 — kısa, deterministik, kriptografik değil (yalnız eşitlik kontrolü).
const hash = (input) => {
  let h = 5381;
  for (let i = 0; i < input.length; i += 1) h = ((h << 5) + h + input.charCodeAt(i)) >>> 0;
  return h.toString(36);
};

// [TR] İmza dilden bağımsızdır (başlık/mesaj çevirisi dahil edilmez): dil değişince kapatılan uyarı geri gelmez.
// [EN] The signature ignores translated copy, so switching language does not resurrect a dismissed warning.
export const statusSignature = (status) => {
  const details = Array.isArray(status?.details)
    ? status.details.map((d) => `${envErrorCode(d) || ''}:${envErrorMessage(d)}`).join('\n')
    : '';
  const extra = status?.signature == null ? '' : String(status.signature);
  return hash(`${status?.key}|${details}|${extra}`);
};

let memoryStore = {};

const readStore = () => {
  try {
    const raw = window.sessionStorage.getItem(STATUS_DISMISS_STORAGE_KEY);
    const parsed = raw ? JSON.parse(raw) : {};
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : {};
  } catch {
    return { ...memoryStore };
  }
};

const writeStore = (next) => {
  memoryStore = { ...next };
  try {
    window.sessionStorage.setItem(STATUS_DISMISS_STORAGE_KEY, JSON.stringify(next));
  } catch {
    // [TR] Depolama yoksa bellek içi kopya yeterli. [EN] In-memory copy is enough without storage.
  }
};

export const __resetStatusDismissalsForTest = () => { memoryStore = {}; };

export const useStatusDismissals = () => {
  const [store, setStore] = React.useState(readStore);

  const isDismissed = React.useCallback(
    (status) => !isCriticalStatus(status) && store[status.key] === statusSignature(status),
    [store],
  );

  const dismiss = React.useCallback((status) => {
    if (isCriticalStatus(status)) return;
    setStore((prev) => {
      const next = { ...prev, [status.key]: statusSignature(status) };
      writeStore(next);
      return next;
    });
  }, []);

  // [TR] Kayıtları anahtar listesine göre siler (geri getirme ve listeden çıkan uyarılar için).
  // [EN] Drops records by key (used for restore and for warnings that left the list).
  const forget = React.useCallback((keys) => {
    setStore((prev) => {
      if (!keys.some((k) => k in prev)) return prev;
      const next = { ...prev };
      keys.forEach((k) => { delete next[k]; });
      writeStore(next);
      return next;
    });
  }, []);

  const restore = React.useCallback((statuses) => forget(statuses.map((s) => s.key)), [forget]);

  return { isDismissed, dismiss, restore, forget };
};
