// [TR] Yapılandırma (env) hatalarının makine okunur kodları. Üst bant hangi hatanın kritik (kapatılamaz) olduğunu
//      metinden değil bu koddan anlar; mesaj metni değişse de güvenlik kuralı bozulmaz.
// [EN] Machine-readable codes for configuration (env) errors. The status bar decides criticality from the code,
//      never from the message text, so rewording a message cannot weaken the safety rule.
export const ENV_ERROR_CODES = Object.freeze({
  // [TR] Frontend escrow adresi backend'in bildirdiğinden farklı: işlemler yanlış kontrata gidebilir.
  ESCROW_MISMATCH: 'ESCROW_MISMATCH',
  // [TR] Backend'in zinciri frontend politikasında yok.
  BACKEND_CHAIN_UNSUPPORTED: 'BACKEND_CHAIN_UNSUPPORTED',
  // [TR] VITE_ESCROW_ADDRESS boş ya da sıfır adres: kontrat işlemleri çalışmaz.
  ESCROW_ADDRESS_MISSING: 'ESCROW_ADDRESS_MISSING',
  // [TR] API taban URL politikası ihlali (ör. production'da mutlak VITE_API_URL).
  API_POLICY_VIOLATION: 'API_POLICY_VIOLATION',
  // [TR] Altyapı erişilemiyor (kapatılabilir, güvenlik uyarısı DEĞİL): kritik listeye bilerek girmez.
  // [EN] Infrastructure unreachable (dismissible, not a safety alert): deliberately NOT in the critical list.
  BACKEND_UNREACHABLE: 'BACKEND_UNREACHABLE',
  RPC_UNREACHABLE: 'RPC_UNREACHABLE',
});

// [TR] Güvenlik kodları kritiktir. BACKEND_UNREACHABLE / RPC_UNREACHABLE bilgi amaçlıdır, kritik değildir.
export const CRITICAL_ENV_ERROR_CODES = Object.freeze([
  ENV_ERROR_CODES.ESCROW_MISMATCH,
  ENV_ERROR_CODES.BACKEND_CHAIN_UNSUPPORTED,
  ENV_ERROR_CODES.ESCROW_ADDRESS_MISSING,
  ENV_ERROR_CODES.API_POLICY_VIOLATION,
]);

export const envError = (code, message) => ({ code, message });

// [TR] Eski düz metin girdiler de desteklenir. [EN] Legacy plain-string entries remain supported.
export const envErrorMessage = (entry) => (entry && typeof entry === 'object' ? String(entry.message ?? '') : String(entry ?? ''));
export const envErrorCode = (entry) => (entry && typeof entry === 'object' && entry.code ? String(entry.code) : null);
