import React from 'react';
import { EyeOff, LoaderCircle, ShieldAlert, X } from 'lucide-react';
import { WALLET_AGE_MIN_DAYS } from '../walletAge';
import { tx as t } from '../copy';
import { isTestnetBuild } from '../chainPolicy';
import { isCriticalStatus, useStatusDismissals } from './statusDismissal';


const supportedChainNames = (supportedChains) => Object.values(supportedChains || {})
  .filter(Boolean)
  .join(' / ');

export const resolveSystemStatuses = ({
  envErrors = [],
  isPaused = false,
  isConnected = false,
  isAuthenticated = false,
  authChecked = false,
  isSupportedChain = true,
  supportedChains = {},
  isWalletRegistered = null,
  isRegisteringWallet = false,
  sybilStatus = null,
  walletAgeRemainingDays = null,
  activeTrade = null,
  ordersFeedError = false,
  lang = 'EN',
}) => {
  const statuses = [];

  if (Array.isArray(envErrors) && envErrors.length > 0) {
    statuses.push({
      key: 'env_error',
      tone: 'danger',
      title: t(lang, 'Sistem Yapılandırma Uyarısı', 'System Configuration Warning'),
      message: t(
        lang,
        'Bazı sistem ayarları doğrulanamadı. İşlem öncesi teknik durumu kontrol edin.',
        'Some system settings could not be validated. Review technical status before proceeding.',
      ),
      details: envErrors,
    });
  }

  if (isConnected && isSupportedChain === false) {
    const names = supportedChainNames(supportedChains);
    statuses.push({
      key: 'unsupported_chain',
      tone: 'danger',
      title: t(lang, 'Desteklenmeyen Ağ', 'Unsupported Network'),
      message: names
        ? t(lang, `Yanlış Ağ! Lütfen ${names} ağına geçin.`, `Wrong Network! Please switch to ${names}.`)
        : t(lang, 'Lütfen desteklenen ağa geçin.', 'Please switch to a supported network.'),
    });
  }

  if (isPaused) {
    statuses.push({
      key: 'paused',
      tone: 'danger',
      title: t(lang, 'Protokol Bakım Modunda', 'Protocol in Maintenance'),
      message: t(lang, 'Sistem şu an bakım modundadır. Yeni işlem açılamaz.', 'System is currently in maintenance mode. New trades cannot be opened.'),
    });
  }

  if (isConnected && isWalletRegistered === false) {
    statuses.push({
      key: 'wallet_unregistered',
      tone: 'warning',
      title: t(lang, 'Cüzdan On-Chain Kayıtlı Değil', 'Wallet Not Registered'),
      message: t(lang, `Anti-Sybil ${WALLET_AGE_MIN_DAYS} gün kontrolü için cüzdanınızı kaydedin.`, `Register your wallet for the ${WALLET_AGE_MIN_DAYS}-day Anti-Sybil check.`),
      action: 'register_wallet',
      isActionLoading: isRegisteringWallet,
    });
  }

  if (isConnected && isWalletRegistered === true && sybilStatus?.aged === false) {
    statuses.push({
      key: 'wallet_age_pending',
      tone: 'warning',
      title: t(lang, 'Cüzdan Yaşı Bekleniyor', 'Wallet Age Pending'),
      message: t(
        lang,
        `Cüzdan kayıtlı ancak ${WALLET_AGE_MIN_DAYS} günlük yaş şartı henüz dolmadı. Kalan süre: ~${walletAgeRemainingDays ?? '?'} gün.`,
        `Wallet is registered but the ${WALLET_AGE_MIN_DAYS}-day age requirement is not met yet. Remaining: ~${walletAgeRemainingDays ?? '?'} day(s).`,
      ),
    });
  }

  if (authChecked && isConnected && !isAuthenticated) {
    statuses.push({
      key: 'auth_required',
      tone: 'warning',
      title: t(lang, 'Oturum Doğrulaması Gerekli', 'Session Verification Required'),
      message: t(lang, 'Korunan bölümler için yeniden giriş yapın.', 'Sign in again to access protected areas.'),
    });
  }

  if (activeTrade?._pendingBackendSync) {
    statuses.push({
      key: 'pending_backend_sync',
      tone: 'info',
      title: t(lang, 'İşlem Senkronizasyonu Bekleniyor', 'Trade Sync Pending'),
      message: t(lang, 'İşlem zincire yazıldı; backend kaydı hazırlanıyor.', 'Trade is on-chain; backend record is being prepared.'),
      // [TR] Kapatma imzası: başka bir işlemin senkron uyarısı yeniden görünür. [EN] Dismiss signature: per trade.
      signature: activeTrade.onchainId ?? activeTrade.id ?? null,
    });
  }

  if (ordersFeedError) {
    statuses.push({
      key: 'orders_feed_unavailable',
      tone: 'warning',
      title: t(lang, 'Pazar verisi alınamıyor', 'Market data unavailable'),
      message: t(lang, 'Sunucuya ulaşılamadı; emir listesi güncel olmayabilir. Otomatik olarak yeniden denenecek.', 'The server could not be reached; the order list may be stale. Retrying automatically.'),
    });
  }

  return statuses;
};

const toneClass = (tone) => {
  if (tone === 'danger') return 'bg-red-950/90 border-red-800 text-red-100';
  if (tone === 'warning') return 'bg-orange-950/80 border-orange-800 text-orange-100';
  return 'bg-surface border-borderSubtle text-textPrimary';
};

// [TR] Kapat düğmesinin üzerine gelme/odak rengi bant tonuna göre. [EN] Dismiss hover/focus colour follows the tone.
const dismissToneClass = (tone) => {
  if (tone === 'danger') return 'hover:bg-red-100/15 focus-visible:ring-red-200';
  if (tone === 'warning') return 'hover:bg-orange-100/15 focus-visible:ring-orange-200';
  return 'hover:bg-elevated focus-visible:ring-brand';
};

export const SystemStatusBar = ({
  envErrors = [],
  isPaused = false,
  isConnected = false,
  isAuthenticated = false,
  authChecked = false,
  chainId = null,
  isSupportedChain = true,
  supportedChains = {},
  isWalletRegistered = null,
  isRegisteringWallet = false,
  onRegisterWallet = null,
  sybilStatus = null,
  walletAgeRemainingDays = null,
  activeTrade = null,
  ordersFeedError = false,
  lang = 'EN',
  children = null,
  isTestnet = isTestnetBuild(),
}) => {
  const statuses = resolveSystemStatuses({
    envErrors,
    isPaused,
    isConnected,
    isAuthenticated,
    authChecked,
    chainId,
    isSupportedChain,
    supportedChains,
    isWalletRegistered,
    isRegisteringWallet,
    sybilStatus,
    walletAgeRemainingDays,
    activeTrade,
    ordersFeedError,
    lang,
  });

  return (
    <SystemStatusBarView
      statuses={statuses}
      isTestnet={isTestnet}
      isRegisteringWallet={isRegisteringWallet}
      onRegisterWallet={onRegisterWallet}
      lang={lang}
    >
      {children}
    </SystemStatusBarView>
  );
};

const SystemStatusBarView = ({ statuses, isTestnet, isRegisteringWallet, onRegisterWallet, lang, children }) => {
  const { isDismissed, dismiss, restore } = useStatusDismissals();
  const sectionRef = React.useRef(null);
  const pendingFocusRef = React.useRef(null);

  const visible = statuses.filter((s) => !isDismissed(s));
  const hidden = statuses.filter((s) => isDismissed(s));

  // [TR] Kapatınca odak kaybolmasın: "Göster" düğmesine; geri getirince ilk geri gelen uyarının kapat düğmesine.
  // [EN] Keep focus after dismiss (→ "Show") and after restore (→ first restored warning's dismiss button).
  React.useEffect(() => {
    const target = pendingFocusRef.current;
    if (!target || !sectionRef.current) return;
    pendingFocusRef.current = null;
    const selector = target === 'restore'
      ? '[data-testid="status-restore"]'
      : `[data-status-key="${target}"] [data-dismiss]`;
    sectionRef.current.querySelector(selector)?.focus();
  });

  if (visible.length === 0 && hidden.length === 0 && !children && !isTestnet) return null;

  const dismissLabel = t(lang, 'Uyarıyı kapat', 'Dismiss warning');
  const criticalLabel = t(lang, 'Güvenlik uyarısı — kapatılamaz', 'Safety warning — cannot be dismissed');
  const hiddenText = t(
    lang,
    `${hidden.length} uyarı gizlendi`,
    `${hidden.length} warning${hidden.length === 1 ? '' : 's'} hidden`,
  );

  return (
    <section ref={sectionRef} aria-label={lang === 'TR' ? 'Sistem durumu' : 'System status'} className="shrink-0 border-b border-borderSubtle" data-testid="system-status-bar">
      <div className="flex flex-col">
        {isTestnet && (
          <div role="status" className={`pl-4 pr-16 md:pr-44 py-1 text-xs font-bold text-center border-b bg-info border-info text-black`} data-testid="testnet-banner">
            {t(lang, 'Base Sepolia Testnet — test tokenları, gerçek para yok', 'Base Sepolia Testnet — test tokens, no real money')}
          </div>
        )}
        {visible.map((status) => {
          const critical = isCriticalStatus(status);
          return (
            <div key={status.key} className={`pl-4 pr-16 md:pr-44 py-1.5 md:py-2 text-xs md:text-sm border-b last:border-b-0 ${toneClass(status.tone)}`} data-status-key={status.key} data-critical={critical ? 'true' : undefined}>
              <div className="max-w-[1200px] mx-auto flex items-center justify-between gap-2 md:gap-3">
                <div className="min-w-0 flex-1">
                  <p className="font-bold break-words">{status.title}</p>
                  {/* [TR] Mobilde bant ekranın üçte birini kaplamasın: açıklama masaüstünde görünür. */}
                  <p className="hidden md:block opacity-90">{status.message}</p>
                  {Array.isArray(status.details) && status.details.length > 0 && (
                    <details className="mt-1 opacity-85">
                      <summary className="cursor-pointer">{lang === 'TR' ? 'Teknik Detay' : 'Technical Details'}</summary>
                      <ul className="list-disc pl-4 mt-1 break-words">
                        {status.details.map((detail, idx) => <li key={idx}>{detail}</li>)}
                      </ul>
                    </details>
                  )}
                </div>
                <div className="flex items-center gap-1 shrink-0 self-start md:self-center">
                  {status.action === 'register_wallet' && (
                    <button
                      type="button"
                      onClick={onRegisterWallet || undefined}
                      disabled={isRegisteringWallet}
                      className="bg-orange-500 text-black px-4 py-1.5 rounded-lg text-xs font-bold hover:bg-orange-400 disabled:opacity-50 transition shrink-0"
                    >
                      {isRegisteringWallet ? <LoaderCircle className="w-4 h-4 animate-spin" strokeWidth={1.8} aria-hidden="true" /> : (lang === 'TR' ? 'Kaydet' : 'Register')}
                    </button>
                  )}
                  {critical ? (
                    // [TR] Kapatılamayan güvenlik uyarısında X yerine kalkan: neden kapatılamadığı ipucuyla anlatılır.
                    <span className="w-10 h-10 -my-1.5 md:-my-2 flex items-center justify-center opacity-80" title={criticalLabel} data-testid="status-critical-mark">
                      <ShieldAlert className="w-4 h-4" strokeWidth={1.8} aria-hidden="true" />
                      <span className="sr-only">{criticalLabel}</span>
                    </span>
                  ) : (
                    <button
                      type="button"
                      data-dismiss=""
                      onClick={() => { pendingFocusRef.current = 'restore'; dismiss(status); }}
                      aria-label={`${dismissLabel}: ${status.title}`}
                      title={dismissLabel}
                      className={`w-10 h-10 -my-1.5 md:-my-2 -mr-2 flex items-center justify-center rounded-lg opacity-80 hover:opacity-100 transition motion-reduce:transition-none outline-none focus-visible:opacity-100 focus-visible:ring-2 ${dismissToneClass(status.tone)}`}
                    >
                      <X className="w-4 h-4" strokeWidth={2} aria-hidden="true" />
                    </button>
                  )}
                </div>
              </div>
            </div>
          );
        })}
        {hidden.length > 0 && (
          <div className="pl-4 pr-16 md:pr-44 border-b last:border-b-0 bg-surface border-borderSubtle text-textMuted text-xs" data-testid="status-hidden-indicator">
            <div className="max-w-[1200px] mx-auto flex items-center gap-2">
              <EyeOff className="w-3.5 h-3.5 shrink-0" strokeWidth={1.8} aria-hidden="true" />
              <span className="min-w-0 truncate">{hiddenText}</span>
              <button
                type="button"
                data-testid="status-restore"
                onClick={() => { pendingFocusRef.current = hidden[0]?.key || null; restore(hidden); }}
                className="h-10 px-2 -mr-2 rounded-lg font-semibold text-textPrimary hover:bg-elevated outline-none focus-visible:ring-2 focus-visible:ring-brand transition-colors motion-reduce:transition-none"
              >
                {t(lang, 'Göster', 'Show')}
              </button>
            </div>
          </div>
        )}
        {children}
      </div>
    </section>
  );
};

export default SystemStatusBar;
