import PIIDisplay from '../components/PIIDisplay';
import { getEscrowExplorerUrl, resolveTargetChain } from './chainPolicy';
import { fmtBps, isKnownNumber, fmtNum, fmtPct, getStateLabel } from './copy';
import { fmtCompact, fmtInt, fmtNumber } from './format';
import ReferenceRateTicker from '../components/ReferenceRateTicker';
import SettlementProposalCard from '../components/SettlementProposalCard';
import { normalizeSettlementState } from './contexts/settlement/settlementActionModel';
import { buildGoToTradeRoomAction } from './actions/tradeNavigationActions';
import OperationTradeCard from './contexts/operations/OperationTradeCard';
import { SettlementQueueCard } from './contexts/operations/OperationsPanels';
import OperationsCenterPage from './contexts/operations/OperationsCenterPage';
import ProfileContextPage from './contexts/profile/ProfileContextPage';
import { countActiveMarketFilters, MARKET_FILTER_DEFAULTS } from './contexts/marketplace/marketFilters';
import MarketFilters, { MarketEmpty } from './contexts/marketplace/MarketFilters';
import MarketOrderCard from './contexts/marketplace/MarketOrderCard';
import { marketGateLabel } from './contexts/marketplace/marketGateLabel';
import { mapResolutionTypeLabel } from './useAppSessionData';
import TradeRoomPage from './contexts/trade-room/TradeRoomPage';
import ThemeToggle from './shell/ThemeToggle';
import NowBoundary from './shell/NowBoundary';
import FooterSocialLinks from './shell/FooterSocialLinks';
import { isOwnerRailDisabled, ownerRailDisabledMessage, isOwnerPayoutProfileMissing, isPayoutProfileSaved, ownerProfileMissingMessage, profileRequiredMessage } from './payoutProfileGate';
import { deriveTradeTimeline } from './contexts/trade-room/tradeTimeline';
import { isViewInNav, NAV_ORDER, VIEW_REGISTRY } from './viewRegistry';
import {
  Banknote, ChevronDown, CircleCheck, CirclePause, Clock, Droplets, Flame, Handshake, History, Hourglass, Layers, ListPlus, LoaderCircle, Lock, Menu, Paperclip, Plus, Settings, Store, Swords,
  TriangleAlert, Undo2, Unplug, Wallet, X, Maximize2, Minimize2, Download, Share, MessageSquare,
} from 'lucide-react';
import { buildTradeRoomPanelCallbacks, getBurnExpiredDeadlinePassed, getPaymentWindowExpired } from './contexts/trade-room/tradeRoomPanelActions';

// [TR] App ana görünüm/render katmanı burada tutulur.
// [EN] Main application view/render layer lives here.
// [TR] Ana sayfa istatistik değişim rozeti (yalnız burada kullanılır). [EN] Home stat delta badge.
const StatChange = ({ value, lang = 'EN' }) => {
  if (value == null) return null;
  const isPositive = value >= 0;
  return <span className={`text-[10px] ml-2 font-bold ${isPositive ? 'text-success' : 'text-danger'}`}>{isPositive ? '▲' : '▼'}{lang === 'TR' ? `%${Math.abs(value).toFixed(1).replace('.', ',')}` : `${Math.abs(value).toFixed(1)}%`}</span>;
};

// [TR] P2 — Modül düzeyi bileşenler: render içinde tanımlanınca her render'da yeni tip oluşur, alt ağaç yeniden
//      mount olur (odak/kaydırma kaybı). Burada kimlikleri sabit.
// [EN] P2 — Module-level components: defining them inside render creates a new type per render and remounts the
//      subtree (lost focus/scroll). Here their identity is stable.
// [TR] Tek satır bileşeni: ikon + etiket + sayaç. Tüm drawer aynı ritimde görünür.
// [EN] One row primitive (icon + label + count) so every drawer row shares one rhythm.
const Row = ({ icon, label, count, active, tone = 'default', onClick }) => (
  <button
    type="button"
    onClick={onClick}
    aria-pressed={active ? 'true' : undefined}
    className={`w-full h-10 flex items-center gap-3 px-3 rounded-lg text-sm font-medium transition ${active ? 'bg-elevated text-textPrimary' : 'text-textSecondary hover:text-textPrimary hover:bg-elevated/60'}`}
  >
    <span className={`shrink-0 flex items-center justify-center w-5 ${tone === 'danger' ? 'text-danger' : active ? 'text-textPrimary' : 'text-textMuted'}`}>{icon}</span>
    <span className="min-w-0 flex-1 truncate text-left">{label}</span>
    {count != null && (
      <span className={`min-w-[1.5rem] h-5 px-1.5 rounded-md text-[11px] font-semibold tabular-nums flex items-center justify-center ${typeof count === 'number' && count > 0 ? (tone === 'danger' ? 'bg-danger/15 text-danger' : 'bg-elevated text-textPrimary') : 'text-textMuted'}`}>{count}</span>
    )}
  </button>
);
const SectionLabel = ({ children }) => (
  <p className="px-3 mb-1.5 text-[11px] font-semibold tracking-wider text-textMuted">{children}</p>
);

// [TR] Ayarlanmamış sosyal linkler gösterilmez (önceden github.com / x.com ana sayfasına gidiyordu).
// [EN] Unconfigured social links are hidden (they used to point at bare github.com / x.com).
const SOCIAL_LINKS = {
  github: import.meta.env.VITE_SOCIAL_GITHUB || 'https://github.com/MyDemir/Araf-Protocol',
  twitter: import.meta.env.VITE_SOCIAL_TWITTER || '',
  farcaster: import.meta.env.VITE_SOCIAL_FARCASTER || '',
};

// [TR] SSS yanıtları kontrat sabitlerine dayanır (ArafEscrow: 48s ödeme penceresi, 48s+24s otomatik serbest,
//      itirazda 48s sonra teminat erimesi, 144s sonra ana para erimesi, 240s'te yakım). Ücret kontrattan okunur.
// [EN] FAQ answers follow contract constants; the fee comes from the contract fee config.
const buildFaqItems = (lang, protocolFeeConfig) => {
  const feeText = (() => {
    if (!isKnownNumber(protocolFeeConfig?.takerFeeBps) || !isKnownNumber(protocolFeeConfig?.makerFeeBps)) return null;
    const tb = Number(protocolFeeConfig.takerFeeBps);
    const mb = Number(protocolFeeConfig.makerFeeBps);
    return lang === 'TR' ? `alıcıdan ${fmtBps(tb, lang)}, satıcıdan ${fmtBps(mb, lang)}` : `${fmtBps(tb, lang)} from the buyer and ${fmtBps(mb, lang)} from the seller`;
  })();
  return lang === 'TR'
    ? [
        { q: 'Araf hakem kullanıyor mu?', a: 'Hayır. Uyuşmazlıkta insan hakem yoktur. Süreç zincirdeki zamanlayıcılar ve ekonomik teşviklerle ilerler; son söz kontratındır.' },
        { q: 'Platform fonlarıma erişebilir mi?', a: 'Hayır. Fonlar akıllı kontratta kilitlidir. Backend yalnız zinciri yansıtır; serbest bırakma kararı veremez.' },
        { q: 'Satıcı ödemeyi onaylamazsa ne olur?', a: 'Ödeme bildiriminden 48 saat sonra alıcı satıcıyı uyarır; 24 saat içinde yanıt gelmezse kripto otomatik olarak alıcıya geçer.' },
        { q: 'Eriyen kasa nedir?', a: 'İtiraz açıldıktan 48 saat sonra iki tarafın teminatı saat saat erimeye başlar; 144. saatten itibaren ana para da erir. 10 gün içinde uzlaşma olmazsa kalan tutar yakılır.' },
        { q: 'Neden tier ve teminat var?', a: 'Tier sistemi yeni cüzdanların emir büyüklüğünü sınırlar; teminatlar kötü niyeti pahalı hale getirir. Temiz sicil teminatı %1 düşürür, risk puanı %3 artırır.' },
        { q: 'Ücret ne kadar?', a: feeText ? `Başarılı işlemde kontrat ${feeText} ücret keser.` : 'Ücret oranı kontratta tanımlıdır ve işlem kilitlenirken sabitlenir.' },
      ]
    : [
        { q: 'Does Araf use arbitrators?', a: 'No. There are no human arbitrators. The flow runs on on-chain timers and economic incentives; the contract has the final say.' },
        { q: 'Can the platform access my funds?', a: 'No. Funds stay locked in the smart contract. The backend only mirrors the chain and cannot release funds.' },
        { q: 'What if the seller never confirms payment?', a: '48 hours after the payment report the buyer can ping the seller; with no response within 24 hours the crypto is released to the buyer automatically.' },
        { q: 'What is the bleeding escrow?', a: 'Starting 48 hours after a dispute opens, both bonds decay every hour; from hour 144 the principal decays too. Without a settlement within 10 days the rest is burned.' },
        { q: 'Why tiers and bonds?', a: 'Tiers cap order size for new wallets; bonds make bad faith expensive. A clean record lowers the bond by 1%, risk points raise it by 3%.' },
        { q: 'What are the fees?', a: feeText ? `On a successful trade the contract charges ${feeText}.` : 'The fee rate is defined in the contract and fixed when a trade locks.' },
      ];
};

export const buildAppViews = (ctx) => {
  const {
    lang,
    setLang,
    isConnected,
    isAuthenticated,
    isLoggingIn,
    isContractLoading,
    loadingText,
    isPaused,
    // [TR] txGate: YENİ pozisyon açan işlemlerin kapısı (paused / kontrol ediliyor / altyapı arızası). Trade room'a
    //      yalnız gerçek isPaused gider; altyapı arızası çıkış eylemlerini kapatmaz, yalnız uyarı gösterir.
    txGate = null,
    infraDegraded = false,
    authChecked,
    currentView,
    setCurrentView,
    toggleSidebar,
    handleAuthAction,
    formatAddress,
    address,
    chainId,
    sidebarOpen,
    setSidebarOpen,
    setExpandedStatus,
    expandedStatus,
    marketFilters = MARKET_FILTER_DEFAULTS,
    setMarketFilter,
    resetMarketFilters,
    marketOrdersTotal = null,
    filteredOrders,
    orders,
    ordersFeedError,
    fullscreen = { isStandalone: true },
    activeEscrows,
    loading,
    SUPPORTED_TOKEN_ADDRESSES,
    handleStartTrade,
    hasPayoutProfile = null,
    handleMint,
    isFaucetEnabled,
    isSupportedChainId,
    handleOpenMakerModal,
    activeEscrowCounts,
    setShowProfileModal,
    openProfilePage,
    setShowFeedbackModal,
    protocolStats,
    statsLoading,
    statsError,
    fetchStats,
    userReputation,
    sybilStatus,
    walletAgeRemainingDays,
    takerFeeBps,
    protocolFeeConfig,
    activeTrade,
    setActiveTrade,
    userRole,
    setUserRole,
    setTradeState,
    resolvedTradeState,
    setCancelStatus,
    setChargebackAccepted,
    paymentIpfsHash,
    handleFileUpload,
    handleReportPayment,
    handleProposeCancel,
    handleRevokeCancel,
    cancelStatus,
    chargebackAccepted,
    handleChargebackAck,
    handleRelease,
    handleChallenge,
    handlePingMaker,
    handleAutoRelease,
    canMakerStartChallengeFlow,
    canMakerChallenge,
    // [TR] tradeTimers artık yalnız GEÇERSİZ KILMA (lab/test) içindir; gerçek sayaçlar saat sınırında türetilir (P1).
    tradeTimers: tradeTimerOverrides = {},
    chainNowMs,
    chainOffsetMs = 0,
    bleedingAmounts,
    takerName,
    tokenDecimalsMap,
    formatTokenAmountFromRaw,
    rawTokenToDisplayNumber,
    fetchMyTrades,
    setIsContractLoading,
    authenticatedFetch,
    showToast,
    settlementContractFns,
  } = ctx;
  const newTxBlocked = Boolean(isPaused || txGate?.blocked);

  // [TR] Admin menü görünürlüğü yalnız UX katmanıdır; nihai yetki backend ADMIN_WALLETS + auth zincirindedir.
  //      Tek doğru kaynak sunucudur: /api/auth/me yanıtındaki `isAdmin` (boolean) → ctx.isAdmin. Yanıt yoksa (null)
  //      ya da false ise giriş gizlenir (fail-closed). Admin cüzdan listesi istemci paketine GİRMEZ: eski
  //      VITE_ADMIN_WALLETS env yedeği kaldırıldı (her VITE_* değeri herkese açık bundle'a gömülür).
  // [EN] Admin menu visibility is UX-only; the server decides. `isAdmin` from /api/auth/me → ctx.isAdmin. A missing
  //      (null) or false answer hides the entry (fail-closed). The admin wallet list never ships in the client bundle:
  //      the VITE_ADMIN_WALLETS fallback was removed (every VITE_* value is embedded in the public bundle).
  const connectedWalletLower = typeof address === "string" ? address.toLowerCase() : null;
  const isLikelyAdminWallet = ctx.isAdmin === true;
  const canSeeAdminEntry = Boolean(isConnected && isAuthenticated && connectedWalletLower && isLikelyAdminWallet);
  // [TR] Yalnız UX ipucu (görünür metin, mobilde de): hangi cüzdanların admin olduğu ASLA gösterilmez.
  //      Bağlı ama imzasız → herkese "oturum aç". Oturum açık + isAdmin=false → ayar adı içeren ipucu YALNIZ geliştirmede.
  // [EN] Visible UX hint only; never reveals admin wallets. The setting-name hint is shown in development only.
  const renderAdminHint = () => {
    let text = null;
    if (isConnected && !isAuthenticated && authChecked) {
      text = lang === 'TR'
        ? 'Cüzdan bağlı ama oturum açılmadı. Yönetim paneli için imzalayarak oturum açın.'
        : 'Wallet connected but not signed in. Sign in to access the admin panel.';
    } else if (isConnected && isAuthenticated && ctx.isAdmin === false && import.meta.env.DEV) {
      text = lang === 'TR'
        ? 'Geliştirme ipucu: bu cüzdan yönetici değil. Olması gerekiyorsa sunucudaki ADMIN_WALLETS ayarını kontrol edin.'
        : 'Dev hint: this wallet is not an admin. If it should be, check the server ADMIN_WALLETS setting.';
    }
    if (!text) return null;
    return <p role="status" aria-live="polite" data-testid="admin-hint" className="w-full max-w-5xl px-4 pb-2 text-xs text-textMuted">{text}</p>;
  };
  // [TR] İşlem Odası, Takip, Profil ve Geçmiş yalnız imzalı oturumla anlamlıdır; oturum yokken gezinmede
  //      gösterilmez (App.jsx de bu görünümlerden ana sayfaya yönlendirir). UI Lab senaryoları istisnadır.
  // [EN] Trade room, tracking, profile and history need a signed session; hidden from navigation otherwise.
  const navUnlocked = Boolean((isConnected && isAuthenticated) || ctx.devScenarioCategory);
  // [TR] Oturum yokken "Emir oluştur" hata bildirimi yerine cüzdan bağlama/imza akışını başlatır.
  const openCreateOrder = () => ((isConnected && isAuthenticated) || ctx.devScenarioCategory ? handleOpenMakerModal() : handleAuthAction());

  const renderSlimRail = () => (
    <div className="hidden md:flex w-16 bg-shell border-r border-borderSubtle flex-col items-center py-6 justify-between z-50 shrink-0 shadow-2xl">
      <div className="space-y-6 flex flex-col items-center w-full">
        <button type="button" aria-label="Araf" onClick={() => setCurrentView('home')} className="w-8 h-8 mb-4 flex items-center justify-center cursor-pointer">
          <img src="/logo-64.png" alt="" width="32" height="32" className="w-8 h-8" />
        </button>
        <button onClick={toggleSidebar} title={lang === 'TR' ? 'Filtreler' : 'Filters'} className={`w-10 h-10 flex items-center justify-center rounded-xl transition ${sidebarOpen ? 'bg-elevated text-textPrimary border border-borderStrong' : 'text-textMuted hover:text-textPrimary hover:bg-elevated'}`}><Menu className="w-5 h-5" strokeWidth={1.8} aria-hidden="true" /></button>
        {/* [TR] Aktif görünümün solunda bal rengi işaret (logo paleti). [EN] Honey marker left of the active view (logo palette). */}
        {NAV_ORDER.rail.filter((key) => isViewInNav(key, { navUnlocked, canSeeAdminEntry })).map((key) => {
          const view = VIEW_REGISTRY[key];
          const Icon = view.icon;
          // [TR] Admin başlığı yetki ipucunu taşır; backend yine nihai otoritedir. [EN] Admin title carries the access hint.
          const title = key === 'admin'
            ? (isLikelyAdminWallet
              ? (lang === 'TR' ? 'Yönetim Paneli (uzlaşma analitiği: salt okunur)' : 'Admin Panel (Settlement analytics: read-only)')
              : (lang === 'TR' ? 'Admin Gözlem (sunucu yetkisine bağlı, read-only)' : 'Admin Observability (server-authorized, read-only)'))
            : view.label[lang === 'TR' ? 'TR' : 'EN'];
          return (
            <button key={key} onClick={() => setCurrentView(key)} title={title} className={`w-10 h-10 flex items-center justify-center rounded-xl transition relative ${currentView === key ? `bg-elevated ${view.tone} border border-borderStrong before:absolute before:-left-[13px] before:top-1/2 before:-translate-y-1/2 before:w-1 before:h-5 before:rounded-r before:bg-honey` : 'text-textMuted hover:text-textPrimary hover:bg-elevated'}`}>
              <Icon className="w-5 h-5" strokeWidth={1.8} aria-hidden="true" />
              {key === 'tradeRoom' && activeEscrows.length > 0 && <span className="absolute top-2 right-2 w-2 h-2 bg-orange-500 rounded-full animate-pulse"></span>}
            </button>
          );
        })}
        {navUnlocked && (
          <button onClick={() => { if (!isConnected || !isAuthenticated) { handleAuthAction(); return; } openProfilePage?.('history'); }} title={lang === 'TR' ? 'İşlem Geçmişi' : 'Trade History'} className="w-10 h-10 flex items-center justify-center rounded-xl text-textMuted hover:text-textPrimary hover:bg-elevated transition"><History className="w-5 h-5" strokeWidth={1.8} aria-hidden="true" /></button>
        )}
      </div>
      <div className="space-y-3 flex flex-col items-center w-full px-2">
        <div className="w-full flex justify-center">
          <ThemeToggle lang={lang} />
        </div>
        <button onClick={() => setLang(lang === 'TR' ? 'EN' : 'TR')} title={lang === 'TR' ? 'Dili Değiştir' : 'Change Language'} className="w-11 h-11 -my-1 flex items-center justify-center rounded-xl text-xs font-bold text-textMuted hover:text-textPrimary hover:bg-elevated transition">{lang}</button>
        <button onClick={handleAuthAction} title={isConnected && isAuthenticated ? (lang === 'TR' ? 'Profil Merkezi' : 'Profile Center') : (lang === 'TR' ? 'Cüzdan Bağla' : 'Connect Wallet')} className={`w-10 h-10 rounded-full border-2 flex items-center justify-center transition-all shadow-lg mx-auto ${isConnected && isAuthenticated ? 'border-emerald-500 bg-emerald-900/20 text-emerald-400 hover:bg-emerald-900/40 shadow-[0_0_10px_rgba(16,185,129,0.2)]' : 'border-borderStrong bg-surface text-textMuted hover:text-textPrimary hover:border-brand/50 hover:bg-elevated'}`}>
          {isLoggingIn || !authChecked ? <LoaderCircle className="w-4 h-4 animate-spin" strokeWidth={1.8} aria-hidden="true" /> : <Wallet className="w-5 h-5" strokeWidth={1.8} aria-hidden="true" />}
        </button>
      </div>
    </div>
  );

  // [TR] Bağlamsal yan panel — açık/kapalı durumu explicit butonlar ve overlay ile yönetilir.
  //      Filtreler, durum akordiyonu ve yeni order oluşturma butonu içerir.
  // [EN] Context sidebar — open/close state is controlled by explicit buttons and overlay.
  //      Contains filters, status accordion and create-order button.
  const renderContextSidebar = () => {
    const tr = lang === 'TR';
    const settlementCounts = activeEscrowCounts?.settlement || {};
    // [TR] Akış alınamadıysa sayaç "—": "0 emir" yanıltıcı olur.
    const orderCount = (list, total = null) => (ordersFeedError ? '—' : Number.isFinite(total) ? total : list.length);
    const proposedEscrows = activeEscrows.filter((escrow) => normalizeSettlementState(escrow?.rawTrade?.settlementProposal?.state) === 'PROPOSED');
    const goToRoom = (escrow) => buildGoToTradeRoomAction({
      escrow, setActiveTrade, setUserRole, setTradeState, setChargebackAccepted, setCurrentView, setSidebarOpen,
    });
    const tokenMark = (letter, cls) => (
      <span className={`w-4 h-4 rounded-full text-[9px] font-bold text-white flex items-center justify-center ${cls}`} aria-hidden="true">{letter}</span>
    );
    const ico = (Icon) => <Icon className="w-4 h-4" strokeWidth={1.8} aria-hidden="true" />;

    return (
      <>
        {sidebarOpen && <div className="md:hidden fixed inset-0 max-w-full overflow-x-hidden bg-black/60 z-[55] backdrop-blur-sm transition-opacity" onClick={() => setSidebarOpen(false)} />}
        <aside
          aria-label={tr ? 'Filtreler ve işlemler' : 'Filters and trades'}
          className={`fixed md:relative inset-y-0 left-0 box-border h-dvh md:h-full max-w-full bg-shell border-r border-borderSubtle flex flex-col z-[60] md:z-40 shrink-0 overflow-x-hidden overflow-y-auto overscroll-contain transition-all duration-300 ease-in-out ${sidebarOpen ? 'w-[280px] max-w-[calc(100vw_-_3rem)] pl-[calc(0.75rem_+_env(safe-area-inset-left))] pr-3 pt-[calc(1rem_+_env(safe-area-inset-top))] pb-[calc(1rem_+_env(safe-area-inset-bottom))] opacity-100' : 'w-0 p-0 opacity-0'}`}
        >
          <div className="md:hidden flex items-center justify-between px-3 mb-4">
            <span className="flex items-center gap-2 text-base font-bold tracking-tight text-textPrimary"><img src="/logo-64.png" alt="" width="28" height="28" className="w-7 h-7 shrink-0" />Araf</span>
            <button type="button" onClick={() => setSidebarOpen(false)} aria-label={tr ? 'Menüyü kapat' : 'Close menu'} className="w-9 h-9 -mr-2 flex items-center justify-center rounded-lg text-textMuted hover:text-textPrimary hover:bg-elevated">
              <X className="w-5 h-5" strokeWidth={1.8} aria-hidden="true" />
            </button>
          </div>

          <nav className="mb-5">
            <SectionLabel>{tr ? 'PAZAR' : 'MARKET'}</SectionLabel>
            {/* [TR] Sayaç yalnız seçili varlıkta gösterilir: sunucu yalnız o varlığın emirlerini döndürür. */}
            {[
              { value: 'ALL', icon: ico(Layers), label: tr ? 'Tüm emirler' : 'All orders' },
              { value: 'USDT', icon: tokenMark('T', 'bg-emerald-600'), label: 'USDT' },
              { value: 'USDC', icon: tokenMark('C', 'bg-blue-600'), label: 'USDC' },
            ].map((row) => (
              <Row
                key={row.value}
                icon={row.icon}
                label={row.label}
                count={marketFilters.token === row.value ? orderCount(orders, marketOrdersTotal) : undefined}
                active={marketFilters.token === row.value && currentView === 'market'}
                onClick={() => { setMarketFilter('token', row.value); setCurrentView('market'); }}
              />
            ))}
          </nav>

          {navUnlocked ? (
            <>
          <nav className="mb-5">
            <SectionLabel>{tr ? 'İŞLEMLERİM' : 'MY TRADES'}</SectionLabel>
            {['LOCKED', 'PAID', 'CHALLENGED'].map(status => {
              const isExpanded = expandedStatus === status;
              const statusTrades = activeEscrows.filter(e => e.state === status);
              const icon = status === 'LOCKED' ? Lock : status === 'PAID' ? Banknote : Swords;
              return (
                <div key={status}>
                  <Row
                    icon={ico(icon)}
                    label={getStateLabel(status, lang)}
                    count={Number(activeEscrowCounts?.[status] || 0)}
                    tone={status === 'CHALLENGED' ? 'danger' : 'default'}
                    active={isExpanded}
                    onClick={() => setExpandedStatus(isExpanded ? null : status)}
                  />
                  {isExpanded && (
                    <div className="ml-5 pl-3 my-1 border-l border-borderSubtle space-y-2">
                      {statusTrades.length > 0 ? statusTrades.map(escrow => (
                        <OperationTradeCard key={escrow.id} escrow={escrow} lang={lang} onGoToRoom={goToRoom(escrow)} />
                      )) : (
                        <p className="py-2 text-xs text-textMuted">{tr ? 'Bu durumda işlem yok.' : 'No trades in this state.'}</p>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </nav>

          <nav className="mb-5">
            <SectionLabel>{tr ? 'UZLAŞMA' : 'SETTLEMENT'}</SectionLabel>
            <Row icon={ico(Handshake)} label={tr ? 'Açık teklifler' : 'Open proposals'} count={Number(settlementCounts.PROPOSED || 0)} onClick={() => setCurrentView('operations')} />
            {Number(settlementCounts.ACTION_REQUIRED || 0) > 0 && (
              <Row icon={ico(Hourglass)} label={tr ? 'Yanıtını bekliyor' : 'Needs your reply'} count={Number(settlementCounts.ACTION_REQUIRED)} tone="danger" onClick={() => setCurrentView('operations')} />
            )}
            {Number(settlementCounts.WAITING || 0) > 0 && (
              <Row icon={ico(Clock)} label={tr ? 'Karşı taraf yanıtlıyor' : 'Awaiting counterparty'} count={Number(settlementCounts.WAITING)} onClick={() => setCurrentView('operations')} />
            )}
            {proposedEscrows.length > 0 && (
              <div className="mt-2 space-y-2 px-1">
                {proposedEscrows.map((escrow) => (
                  <SettlementQueueCard key={`settle-${escrow.onchainId}`} escrow={{ ...escrow, viewerAddress: address }} lang={lang} onGoToRoom={goToRoom(escrow)} />
                ))}
              </div>
            )}
          </nav>

            </>
          ) : (
            <div className="mb-5 mx-1 rounded-xl border border-borderSubtle bg-surface p-4" data-testid="drawer-signin-card">
              <p className="text-sm font-semibold text-textPrimary">{tr ? 'İşlemlerin burada görünür' : 'Your trades show up here'}</p>
              <p className="text-xs text-textMuted mt-1">{tr ? 'Aktif işlemler, uzlaşma teklifleri ve profil için cüzdanını bağlayıp imzala.' : 'Connect and sign in with your wallet to see active trades, settlement offers and your profile.'}</p>
              <button type="button" onClick={() => { setSidebarOpen(false); handleAuthAction(); }} className="mt-3 w-full h-9 rounded-lg bg-brand text-black text-sm font-semibold hover:opacity-90 inline-flex items-center justify-center gap-2">
                <Wallet className="w-4 h-4" strokeWidth={1.8} aria-hidden="true" />{isConnected ? (tr ? 'İmzala ve giriş yap' : 'Sign in') : (tr ? 'Cüzdan bağla' : 'Connect wallet')}
              </button>
            </div>
          )}

          <div className="mt-auto pt-4 border-t border-borderSubtle px-1 space-y-3">
            {/* [TR] Mobilde tarayıcı çubuklarını gizleme: Fullscreen API varsa tam ekran düğmesi her zaman görünür;
                kurulum teklifi (PWA) varsa ek satır olarak gelir, tam ekranın yerini almaz. iOS'ta yönerge. */}
            {!fullscreen.isStandalone && (
              <div className="md:hidden -mx-1" data-testid="drawer-fullscreen">
                {fullscreen.supported && (
                  <Row icon={ico(fullscreen.isFullscreen ? Minimize2 : Maximize2)} label={fullscreen.isFullscreen ? (tr ? 'Tam ekrandan çık' : 'Exit full screen') : (tr ? 'Tam ekran' : 'Full screen')} onClick={fullscreen.toggle} />
                )}
                {fullscreen.canInstall && (
                  <Row icon={ico(Download)} label={tr ? 'Uygulamayı yükle' : 'Install app'} onClick={fullscreen.install} />
                )}
                {!fullscreen.supported && !fullscreen.canInstall && (
                  <p className="flex items-start gap-2 px-3 py-2 text-xs text-textMuted">
                    <Share className="w-4 h-4 shrink-0" strokeWidth={1.8} aria-hidden="true" />
                    {tr ? 'Tam ekran için: Paylaş → Ana Ekrana Ekle' : 'For full screen: Share → Add to Home Screen'}
                  </p>
                )}
              </div>
            )}
            {/* [TR] Mobilde sabit geri bildirim düğmesi gizlidir (içeriğin üstüne biniyordu); giriş burada. */}
            <div className="md:hidden -mx-1" data-testid="drawer-feedback">
              <Row icon={ico(MessageSquare)} label={tr ? 'Geri bildirim' : 'Feedback'} onClick={() => { setSidebarOpen(false); setShowFeedbackModal(true); }} />
            </div>
            <div className="flex items-center gap-2">
              <div className="flex flex-1 bg-surface rounded-lg p-1 border border-borderSubtle" role="group" aria-label={tr ? 'Dil' : 'Language'}>
                {['TR', 'EN'].map((code) => (
                  <button key={code} type="button" onClick={() => setLang(code)} aria-pressed={lang === code} className={`flex-1 h-8 rounded-md text-xs font-semibold transition ${lang === code ? 'bg-elevated text-textPrimary shadow-sm' : 'text-textMuted hover:text-textPrimary'}`}>{code}</button>
                ))}
              </div>
              <ThemeToggle lang={lang} />
            </div>
            {/* [TR] Oturum yokken emir oluşturma düğmesi işlevsizdir; yerine üstteki "Cüzdan bağla" kartı var. */}
            {navUnlocked && (
              <button onClick={handleOpenMakerModal} disabled={newTxBlocked} className={`w-full h-11 rounded-lg text-sm font-semibold transition flex items-center justify-center gap-2 ${newTxBlocked ? 'bg-elevated text-textMuted cursor-not-allowed' : 'bg-brand hover:opacity-90 text-black shadow-sm'}`}>
                <Plus className="w-4 h-4" strokeWidth={2} aria-hidden="true" /> {tr ? 'Yeni emir oluştur' : 'Create order'}
              </button>
            )}
          </div>
        </aside>
      </>
    );
  };

  // ═══════════════════════════════════════════
  // 12. SAYFA RENDER FONKSİYONLARI
  //     Home, Marketplace, Trade Room views
  // ═══════════════════════════════════════════

  // [TR] Ana sayfa — protokol açıklaması ve istatistik kartları
  // [EN] Home page — protocol description and stats cards
  // [TR] İstatistik gelmediyse "$0" yanıltıcıdır; veri yokken tire gösterilir.
  // [EN] "$0" is misleading when stats failed to load; show a dash when there is no data.
  const statValue = (value, format) => (protocolStats == null || value == null ? '—' : format(value));

  const renderHome = () => (
    <div className="w-full max-w-[1200px] min-w-0 p-4 md:p-8">
      <div className="mb-10">
        <h1 className="text-3xl sm:text-4xl md:text-5xl font-extrabold text-transparent bg-clip-text bg-gradient-to-r from-textPrimary via-textSecondary to-textMuted tracking-tight mb-3">
          {lang === 'TR' ? <>Sistem yargılamaz. <br/>Dürüstsüzlüğü pahalıya mal eder.</> : <>The system does not judge. <br/>It makes dishonesty expensive.</>}
        </h1>
        <p className="text-textMuted text-sm max-w-lg">{lang === 'TR' ? 'Emanet tutmayan, hakemsiz eşten eşe USDT/USDC takası. Kurallar kontratta.' : 'Non-custodial, arbitrator-free P2P USDT/USDC trading. The rules live in the contract.'}</p>
        <div className="mt-5 flex flex-col sm:flex-row gap-3">
          <button onClick={() => setCurrentView('market')} className="inline-flex items-center justify-center gap-2 px-6 py-3 rounded-xl bg-brand text-black text-sm font-bold hover:opacity-90 transition">
            <Store className="w-4 h-4" strokeWidth={1.8} aria-hidden="true" />{lang === 'TR' ? 'Pazara git' : 'Open market'}
          </button>
          <button onClick={openCreateOrder} disabled={newTxBlocked} className="px-6 py-3 rounded-xl bg-surface border border-borderStrong text-textPrimary text-sm font-bold hover:bg-elevated transition disabled:opacity-50 disabled:cursor-not-allowed">
            {lang === 'TR' ? '+ Emir oluştur' : '+ Create order'}
          </button>
        </div>
      </div>

      {(() => {
        const tr = lang === 'TR';
        const usd = (v) => `$${fmtCompact(v, lang, 1)}`;
        const openOrders = protocolStats && (protocolStats.open_sell_orders != null || protocolStats.open_buy_orders != null)
          ? Number(protocolStats.open_sell_orders || 0) + Number(protocolStats.open_buy_orders || 0)
          : null;
        const hours = protocolStats?.avg_trade_hours;
        const tiles = [
          { k: 'vol', label: tr ? 'Tamamlanan hacim' : 'Settled volume', value: statValue(protocolStats?.total_volume_usdt, usd), change: protocolStats?.changes_30d?.total_volume_usdt_pct },
          { k: 'trades', label: tr ? 'Başarılı işlem' : 'Successful trades', value: statValue(protocolStats?.completed_trades, (v) => fmtInt(v, lang)), change: protocolStats?.changes_30d?.completed_trades_pct },
          { k: 'open', label: tr ? 'Açık emir' : 'Open orders', value: openOrders == null ? '—' : fmtInt(openOrders, lang), sub: openOrders == null ? null : (tr ? `${protocolStats.open_sell_orders || 0} satış · ${protocolStats.open_buy_orders || 0} alış` : `${protocolStats.open_sell_orders || 0} sell · ${protocolStats.open_buy_orders || 0} buy`) },
          { k: 'time', label: tr ? 'Ort. işlem süresi' : 'Avg. trade time', value: hours != null ? (hours < 1 ? `${Math.max(1, Math.round(hours * 60))} ${tr ? 'dk' : 'min'}` : `${fmtNumber(hours, lang, { maxFractionDigits: 1 })} ${tr ? 'sa' : 'h'}`) : '—' },
          { k: 'burn', label: tr ? 'Eriyen ve yakılan' : 'Decayed & burned', value: statValue(protocolStats?.burned_bonds_usdt, (v) => `$${fmtInt(v, lang)}`), danger: true, sub: tr ? 'Uzlaşmayanların kaybı' : 'Lost by those who would not settle' },
        ];
        return (
          <div className="mb-10">
            <div className="grid min-w-0 grid-cols-2 md:grid-cols-5 gap-3" aria-busy={statsLoading ? 'true' : 'false'} data-testid="home-stats">
              {tiles.map((tile) => (
                <div key={tile.k} className={`min-w-0 overflow-hidden bg-surface border p-4 rounded-2xl relative ${tile.danger ? 'border-danger/30 col-span-2 md:col-span-1' : 'border-borderSubtle'}`}>
                  {tile.danger && <Flame className="absolute -right-2 -bottom-2 w-14 h-14 text-danger/10" strokeWidth={1.8} aria-hidden="true" />}
                  <p className={`text-[10px] font-bold tracking-widest uppercase mb-2 ${tile.danger ? 'text-danger' : 'text-textMuted'}`}>{tile.label}</p>
                  {statsLoading && protocolStats == null ? (
                    <div className="h-7 w-20 rounded-md bg-elevated animate-pulse" />
                  ) : (
                    <div className="flex min-w-0 flex-wrap items-baseline relative">
                      <span className={`max-w-full truncate text-2xl font-bold tabular-nums ${tile.danger ? 'text-danger' : 'text-textPrimary'}`}>{tile.value}</span>
                      {tile.change != null && <StatChange value={tile.change} lang={lang} />}
                    </div>
                  )}
                  {tile.sub && <p className="text-[11px] text-textMuted mt-1 truncate relative">{tile.sub}</p>}
                </div>
              ))}
            </div>
            {statsError && (
              <p className="text-center pt-3 text-textMuted text-xs">
                {tr ? 'İstatistik verisi alınamadı.' : 'Failed to load stats.'}
                <button type="button" onClick={fetchStats} className="ml-2 text-brand font-semibold hover:underline">{tr ? 'Tekrar dene' : 'Retry'}</button>
              </p>
            )}
          </div>
        );
      })()}

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 md:gap-6">
        <section className="bg-surface border border-borderSubtle rounded-2xl p-5 md:p-6" data-testid="home-how-it-works">
          <p className="text-[11px] tracking-[0.2em] uppercase text-brand mb-2">{lang === 'TR' ? 'Nasıl çalışır' : 'How it works'}</p>
          <h3 className="text-xl font-bold text-textPrimary mb-4">{lang === 'TR' ? 'Kararı kontrat verir, backend değil.' : 'The contract decides, not the backend.'}</h3>
          <ol className="space-y-3">
            {(lang === 'TR' ? [
              { icon: ListPlus, title: 'Emir', text: 'Satıcı kriptoyu ve teminatını kilitler; alıcı kendi teminatıyla işleme girer.' },
              { icon: Banknote, title: 'Ödeme', text: 'Alıcı 48 saat içinde banka ödemesini yapıp bildirir; yapmazsa teminatından kesinti olur.' },
              { icon: CircleCheck, title: 'Onay', text: 'Satıcı onaylar. Sessiz kalırsa alıcı 48 saat sonra uyarır, 24 saat sonra kripto otomatik serbest kalır.' },
              { icon: Flame, title: 'İtiraz', text: 'Hakem yok: teminatlar ve sonra ana para erir. Hızlı uzlaşmak her iki taraf için en ucuz yoldur.' },
            ] : [
              { icon: ListPlus, title: 'Order', text: 'The seller locks crypto plus a bond; the buyer joins with a bond of their own.' },
              { icon: Banknote, title: 'Payment', text: 'The buyer pays by bank within 48 hours and reports it; otherwise part of their bond is lost.' },
              { icon: CircleCheck, title: 'Release', text: 'The seller confirms. If silent, the buyer pings after 48 hours and funds auto-release 24 hours later.' },
              { icon: Flame, title: 'Dispute', text: 'No arbitrator: bonds, then principal, decay. Settling fast is the cheapest path for both sides.' },
            ]).map((step, i) => (
              <li key={step.title} className="flex gap-3">
                <span className="shrink-0 w-8 h-8 rounded-lg bg-elevated border border-borderSubtle flex items-center justify-center text-textSecondary">
                  <step.icon className="w-4 h-4" strokeWidth={1.8} aria-hidden="true" />
                </span>
                <div className="min-w-0">
                  <p className="text-sm font-semibold text-textPrimary"><span className="text-textMuted tabular-nums mr-1">{i + 1}.</span>{step.title}</p>
                  <p className="text-xs md:text-sm text-textSecondary leading-relaxed">{step.text}</p>
                </div>
              </li>
            ))}
          </ol>
        </section>

        <section className="bg-surface border border-borderSubtle rounded-2xl p-5 md:p-6" data-testid="home-faq">
          <p className="text-[11px] tracking-[0.2em] uppercase text-textMuted mb-3">{lang === 'TR' ? 'Sık sorulanlar' : 'FAQ'}</p>
          <div className="min-w-0 divide-y divide-borderSubtle">
            {buildFaqItems(lang, protocolFeeConfig).map((item) => (
              <details key={item.q} className="group py-3 first:pt-0">
                <summary className="cursor-pointer list-none text-sm font-semibold text-textPrimary flex items-center justify-between gap-3">
                  {item.q}
                  <ChevronDown className="w-4 h-4 shrink-0 text-textMuted group-open:rotate-180 transition" strokeWidth={1.8} aria-hidden="true" />
                </summary>
                <p className="text-xs md:text-sm text-textSecondary mt-2 leading-relaxed">{item.a}</p>
              </details>
            ))}
          </div>
        </section>
      </div>
    </div>
  );

  // [TR] Pazar — modern, az metinli P2P ekranı: başlık + kapalıysa neden rozeti, referans kur şeridi, tek satır chip
  //      filtreleri, emir kartları (büyük kur ve miktar, token işareti, yöntem/kademe rozetleri, itibar halkası, net
  //      Al/Sat aksiyonu). "Al" sekmesi kripto satan emirleri (SELL_CRYPTO), "Sat" sekmesi kripto alan emirleri
  //      (BUY_CRYPTO) listeler. Kilit mantığı (txGate, tier, profil, ban, sybil) burada aynen hesaplanır; kart yalnız gösterir.
  // [EN] Market — modern, low-text P2P screen. Lock logic (txGate, tier, profile, ban, sybil) is computed here unchanged;
  //      the card only renders it.
  const renderMarket = () => {
    const tr = lang === 'TR';
    const filters = { ...MARKET_FILTER_DEFAULTS, ...marketFilters };
    const side = filters.side;
    const setFilter = (key, value) => setMarketFilter?.(key, value);
    const visibleOrders = filteredOrders || [];
    const activeFilterCount = countActiveMarketFilters(filters);
    const isNarrowed = activeFilterCount > 0 || side !== 'ALL';
    const viewerTier = isAuthenticated && Number.isInteger(userReputation?.effectiveTier) ? userReputation.effectiveTier : null;
    // [TR] Taraf seçili değilken "en iyi kur" anlamsızdır (alış/satış kurları ters yönlü); varsayılan en yüksek miktardır.
    // [EN] Without a side "best rate" is ambiguous (buy/sell rates point opposite ways); the default is largest amount.
    const sortOptions = side !== 'ALL'
      ? [{ value: 'AUTO', label: tr ? 'En iyi kur' : 'Best rate' }, { value: 'AMOUNT', label: tr ? 'En yüksek miktar' : 'Largest amount', short: tr ? 'Miktar' : 'Amount' }, { value: 'NEWEST', label: tr ? 'En yeni' : 'Newest' }]
      : [{ value: 'AUTO', label: tr ? 'En yüksek miktar' : 'Largest amount', short: tr ? 'Miktar' : 'Amount' }, { value: 'NEWEST', label: tr ? 'En yeni' : 'Newest' }];
    const sortValue = side === 'ALL' && filters.sort === 'AMOUNT' ? 'AUTO' : filters.sort;
    const shownCount = visibleOrders.length;
    // [TR] İlk sayfa 50 emirle sınırlı; sunucu toplamı daha büyükse ayrıca gösterilir. [EN] Show the server total when it exceeds the first page.
    const loadedCount = (orders || []).length;
    const totalCount = Number.isFinite(marketOrdersTotal) ? marketOrdersTotal : loadedCount;
    // [TR] Kapalı "Emir oluştur" butonunun yanında kısa neden rozeti; tam açıklama title'da. Kilit davranışı değişmez.
    // [EN] Short reason badge next to the disabled "Create order" button; full text in the title. Lock behaviour unchanged.
    const gateLabel = newTxBlocked ? marketGateLabel({ isPaused, txGate, lang }) : null;
    const gateMessage = txGate?.message || (isPaused ? (tr ? 'Sistem şu an bakım modundadır. Yeni işlem açılamaz.' : 'System is paused. New trades cannot be opened.') : '');
    const marketHeader = (
        <div className="mb-3 flex items-center justify-between gap-3">
          <h2 className="text-xl font-bold text-textPrimary">{tr ? 'Pazar' : 'Market'}</h2>
          <div className="flex min-w-0 items-center gap-2">
            {newTxBlocked && (
              <span id="market-create-gate" data-testid="market-create-gate" role="note" title={gateMessage} className="inline-flex h-7 min-w-0 items-center gap-1 rounded-full border border-borderSubtle bg-elevated px-2.5 text-[11px] font-semibold text-textSecondary">
                {txGate?.reason === 'checking'
                  ? <LoaderCircle className="h-3.5 w-3.5 shrink-0 animate-spin" strokeWidth={2} aria-hidden="true" />
                  : <Lock className="h-3.5 w-3.5 shrink-0 text-warning" strokeWidth={2.2} aria-hidden="true" />}
                <span className="truncate">{gateLabel}</span>
              </span>
            )}
            <button onClick={openCreateOrder} disabled={newTxBlocked} aria-describedby={newTxBlocked ? 'market-create-gate' : undefined} className="inline-flex h-10 shrink-0 items-center gap-1.5 rounded-full bg-brand px-4 text-sm font-bold text-black transition hover:opacity-90 disabled:cursor-not-allowed disabled:border disabled:border-borderSubtle disabled:bg-elevated disabled:text-textMuted disabled:hover:opacity-100">
              <Plus className="w-4 h-4" strokeWidth={2.4} aria-hidden="true" />{tr ? 'Emir oluştur' : 'Create order'}
            </button>
          </div>
        </div>
    );
    const referenceTicker = <ReferenceRateTicker lang={lang} />;
    // [TR] Test token: yalnız testnet (isFaucetEnabled kuralı aynen). Damla ikonlu küçük chip grubu.
    // [EN] Test tokens: testnet only (same isFaucetEnabled rule). Small drop-icon chip group.
    const faucetRow = isFaucetEnabled && (
          <div role="group" aria-label={tr ? 'Test token al' : 'Get test tokens'} title={tr ? 'Test token al' : 'Get test tokens'} className="inline-flex h-8 items-center gap-0.5 rounded-full border border-dashed border-borderStrong bg-surface pl-2 pr-0.5">
            <Droplets className="h-3.5 w-3.5 text-info" strokeWidth={2} aria-hidden="true" />
            {['USDT', 'USDC'].map((sym) => (
              <button key={sym} type="button" onClick={() => handleMint(sym)} disabled={isContractLoading} aria-label={tr ? `Test ${sym} al` : `Get test ${sym}`} className="relative inline-flex h-7 items-center gap-1 rounded-full px-2 text-[11px] font-bold text-textSecondary transition hover:bg-elevated hover:text-textPrimary disabled:opacity-50 after:absolute after:-inset-y-2 after:inset-x-0 after:content-['']">
                {isContractLoading && loadingText.includes(sym) ? <LoaderCircle className="h-3 w-3 animate-spin" strokeWidth={2} aria-hidden="true" /> : null}
                {sym}
              </button>
            ))}
          </div>
        );
    const emptyState = (
      <MarketEmpty
        lang={lang}
        filters={filters}
        setFilter={setFilter}
        onReset={resetMarketFilters}
        activeFilterCount={activeFilterCount}
        isNarrowed={isNarrowed}
        viewerTier={viewerTier}
        feedError={ordersFeedError}
        canCreate={!newTxBlocked}
        onCreate={openCreateOrder}
      />
    );
    const noteCls = 'mt-2 text-[11px] leading-tight';
    const orderList = loading ? (
        <div className="grid gap-2 md:gap-3 xl:grid-cols-2" aria-busy="true" data-testid="market-order-list">
          {[0, 1, 2].map((i) => <div key={i} className="h-40 rounded-2xl bg-surface border border-borderSubtle animate-pulse" />)}
        </div>
      ) : visibleOrders.length > 0 ? (
        <div className="grid gap-2 md:gap-3 xl:grid-cols-2" data-testid="market-order-list">
          {visibleOrders.map((order) => {
              const effectiveUserTier = userReputation?.effectiveTier ?? 0;
              const isMyOwnAd    = address && order.makerFull?.toLowerCase() === address.toLowerCase();
              const isTierLocked = isConnected && isAuthenticated && order.tier > effectiveUserTier;
              const canTakeOrder = isConnected && isAuthenticated && !isMyOwnAd && !isTierLocked && !newTxBlocked;
              const tokenAddr    = SUPPORTED_TOKEN_ADDRESSES[order.crypto || 'USDT'];
              const isTokenConfigured = Boolean(tokenAddr);
              const isCorrectChain    = isSupportedChainId(chainId);
              const isSellSide = order.side === 'SELL_CRYPTO';
              // [TR] F13 — Taker giriş kapıları (yaş / dust / cooldown) yalnız SATIŞ emrini dolduran kişiye uygulanır:
              //      alış emrini dolduran kontratta maker'dır (_enforceTakerEntry emir sahibine bakar). Tier kilidi iki yönde de geçerli.
              //      Cooldown yalnız Tier 0/1 emirlerinde zorlanır (_getCooldownForTier).
              // [EN] F13 — Taker entry gates (age / dust / cooldown) apply only when filling a SELL order; the filler of a
              //      BUY order is the maker on-chain. The tier lock stays in both directions. Cooldown is enforced for tier 0/1 only.
              const isFunded          = !isSellSide || (sybilStatus ? sybilStatus.funded !== false : true);
              const isAged            = !isSellSide || (sybilStatus ? sybilStatus.aged !== false : true);
              const isCooldownOk      = !isSellSide || Number(order.tier) >= 2 || (sybilStatus ? sybilStatus.cooldownOk !== false : true);
              // [TR] K6: SELL emrinde emir sahibi (maker) kısıtlıysa kontrat fill'i MakerBanActive ile reddeder. Bilgi varsa
              //      buton kapanır; bilinmiyorsa (null) tx denenir ve revert mesajı çevrilir.
              const ownerBanKnown = isSellSide && Number.isFinite(order.ownerBannedUntil);
              const isOwnerBanned = ownerBanKnown && order.ownerBannedUntil > Math.floor((Number.isFinite(chainNowMs) ? chainNowMs : Date.now() + chainOffsetMs) / 1000);
              // [TR] Ödeme profili kapısı: kayıtlı profilin yoksa (ya da durum bilinmiyorsa) ve emir sahibinin profili yoksa doldurma kapalı.
              const needsOwnProfile = isConnected && isAuthenticated && !isPayoutProfileSaved(hasPayoutProfile);
              const ownerProfileMissing = isOwnerPayoutProfileMissing(order);
              // [TR] Emir sahibinin profil rail'i admin tarafından kapatıldıysa yeni doldurma kapalı (aktif işlemler etkilenmez).
              const ownerRailDisabled = isOwnerRailDisabled(order);
              const finalCanTakeOrder = canTakeOrder && !needsOwnProfile && !ownerProfileMissing && !ownerRailDisabled && !isOwnerBanned && isCooldownOk && isFunded && isAged && !newTxBlocked && isTokenConfigured && isCorrectChain;
              // [TR] Oturum yoksa buton pasif "Kilitli" yerine giriş akışını başlatır.
              const needsSignIn = !isConnected || !isAuthenticated;
              const isDisabled = needsSignIn ? false : (!finalCanTakeOrder || isContractLoading);
              const icon = (I, spin) => <I className={`w-4 h-4${spin ? ' animate-spin' : ''}`} strokeWidth={1.8} aria-hidden="true" />;
              const ctaContent =
                // Signed out: keep the action label and colour; the click starts sign-in.
                needsSignIn         ? <>{order.ctaLabel || (tr ? 'İşlem yap' : 'Trade')}</> :
                isPaused            ? <>{icon(CirclePause)} {tr ? 'Bakımda' : 'Paused'}</> :
                newTxBlocked        ? <>{icon(txGate?.reason === 'checking' ? LoaderCircle : Lock, txGate?.reason === 'checking')} {marketGateLabel({ txGate, lang })}</> :
                !isCorrectChain     ? <>{icon(Unplug)} {tr ? 'Yanlış ağ' : 'Wrong network'}</> :
                !isTokenConfigured  ? <>{icon(Settings)} {tr ? 'Token ayarlanmadı' : 'Token not set'}</> :
                isMyOwnAd           ? <>{tr ? 'Sizin emriniz' : 'Your order'}</> :
                isTierLocked        ? <>{icon(Lock)} {tr ? `Tier ${order.tier} gerekli` : `Tier ${order.tier} required`}</> :
                needsOwnProfile     ? <>{icon(Lock)} {tr ? 'Profil gerekli' : 'Profile needed'}</> :
                ownerProfileMissing ? <>{icon(Lock)} {tr ? 'Profil yok' : 'No profile'}</> :
                ownerRailDisabled   ? <>{icon(Lock)} {tr ? 'Yöntem şu an kapalı' : 'Method currently closed'}</> :
                isOwnerBanned       ? <>{icon(Lock)} {tr ? 'Satıcı kısıtlı' : 'Seller restricted'}</> :
                !canTakeOrder       ? <>{icon(Lock)} {tr ? 'Kilitli' : 'Locked'}</> :
                !isAged             ? <>{icon(Hourglass)} {tr ? 'Cüzdan çok yeni' : 'Wallet too new'}</> :
                !isFunded           ? <>{icon(TriangleAlert)} {tr ? 'Bakiye yetersiz' : 'Low balance'}</> :
                !isCooldownOk       ? <>{icon(Hourglass)} {sybilStatus?.cooldownUnknown ? (tr ? 'Bekleme bilinmiyor' : 'Cooldown unknown') : (tr ? `${Math.ceil((sybilStatus?.cooldownRemaining || 0) / 60)} dk` : `${Math.ceil((sybilStatus?.cooldownRemaining || 0) / 60)} min`)}</> :
                isContractLoading   ? <>{icon(LoaderCircle, true)}{loadingText || (tr ? 'İşleniyor…' : 'Processing…')}</> :
                (order.ctaLabel || (tr ? 'İşlem yap' : 'Trade'));
              // [TR] Renk kullanıcının yapacağı işi anlatır: "Satın Al" yeşil, "Sat" kırmızı.
              // [EN] Colour follows the viewer's action (buy green, sell red).
              const ctaTone = isDisabled
                ? 'bg-elevated text-textMuted border border-borderSubtle cursor-not-allowed'
                : isSellSide ? 'bg-brand text-black hover:opacity-90' : 'bg-danger text-[color:var(--color-on-danger)] hover:opacity-90';
              const notes = (
                <>
                  {needsOwnProfile && (
                    <button type="button" data-testid="fill-needs-profile" onClick={() => openProfilePage?.('account')} className={`${noteCls} block text-brand underline`}>
                      {profileRequiredMessage(lang)}
                    </button>
                  )}
                  {!needsOwnProfile && !ownerProfileMissing && ownerRailDisabled && (
                    <p data-testid="fill-owner-rail-closed" className={`${noteCls} text-danger`}>{ownerRailDisabledMessage(lang)}</p>
                  )}
                  {!needsOwnProfile && ownerProfileMissing && (
                    <p data-testid="fill-owner-no-profile" className={`${noteCls} text-danger`}>{ownerProfileMissingMessage(lang)}</p>
                  )}
                </>
              );
              return (
                <MarketOrderCard
                  key={order.id}
                  order={order}
                  lang={lang}
                  cta={{
                    content: ctaContent,
                    disabled: isDisabled,
                    toneClass: ctaTone,
                    onClick: () => (needsSignIn ? handleAuthAction() : handleStartTrade(order)),
                    title: needsSignIn ? (tr ? 'Önce cüzdanınızı bağlayıp giriş yapın' : 'Connect your wallet and sign in first') : undefined,
                  }}
                  notes={notes}
                  footnote={!isFunded && isConnected && canTakeOrder && !newTxBlocked
                    ? <p className={`${noteCls} text-danger`}>{tr ? 'En az 0.001 ETH gerekli.' : 'Needs at least 0.001 ETH.'}</p>
                    : null}
                />
              );
            })}
        </div>
      ) : (
        emptyState
      );
    return (
      <div className="w-full max-w-[1200px] min-w-0 p-4 md:p-8">
        {marketHeader}
        {referenceTicker}
        <MarketFilters
          lang={lang}
          filters={filters}
          setFilter={setFilter}
          onReset={resetMarketFilters}
          activeFilterCount={activeFilterCount}
          sortOptions={sortOptions}
          sortValue={sortValue}
          viewerTier={viewerTier}
          canHideOwn={Boolean(address)}
          result={{ loading, error: ordersFeedError, shown: shownCount, total: totalCount, loaded: loadedCount }}
          closedRailCount={visibleOrders.filter(isOwnerRailDisabled).length}
          trailing={faucetRow || null}
        >
          {orderList}
        </MarketFilters>
      </div>
    );
  };

  // [TR] İşlem odası — LOCKED/PAID/CHALLENGED durumlarına göre taker/maker aksiyonlarını gösterir.
  //      Bleeding Escrow görsel barı, zamanlayıcılar, iptal/serbest bırakma ve PII bölümü içerir.
  // [EN] Trade room — shows taker/maker actions based on LOCKED/PAID/CHALLENGED state.
  //      Contains Bleeding Escrow visual bar, timers, cancel/release and PII section.
  const renderTradeRoomAt = (clockNowMs) => {
    // [TR] Session invalidation sonrası activeTrade temizlenmiş olabilir.
    //      Bu durumda fallback "0.00/undefined" ile kırık oda render etmek yerine
    //      kullanıcıya deterministik empty-state gösterip güvenli aksiyon sunuyoruz.
    // [EN] activeTrade can be cleared after session invalidation.
    //      Instead of rendering a broken room with fallback values, show a
    //      deterministic empty-state with safe navigation actions.
    if (!activeTrade) {
      return (
        <div className="p-4 md:p-8 max-w-[900px] w-full mx-auto mt-6 md:mt-0">
          <div className="bg-surface border border-borderSubtle rounded-2xl p-6 md:p-8 text-center">
            <div className="w-14 h-14 bg-elevated border border-borderStrong rounded-full flex items-center justify-center mx-auto mb-4 text-warning"><TriangleAlert className="w-6 h-6" strokeWidth={1.8} aria-hidden="true" /></div>
            <h2 className="text-xl font-bold text-textPrimary mb-2">
              {lang === 'TR' ? 'Aktif işlem bulunamadı' : 'No active trade found'}
            </h2>
            <p className="text-sm text-textSecondary mb-5">
              {lang === 'TR'
                ? 'Oturumunuz sona ermiş veya işlem durumu güncellenmiş olabilir. Güvenli şekilde pazar yerine dönebilirsiniz.'
                : 'Your session may have expired or trade state was refreshed. You can safely return to the marketplace.'}
            </p>
            <div className="flex flex-col sm:flex-row items-center justify-center gap-3">
              <button
                onClick={() => { fetchMyTrades(); }}
                className="w-full sm:w-auto px-5 py-2.5 bg-elevated border border-borderStrong hover:bg-surface text-textPrimary rounded-xl text-sm font-bold transition"
              >
                {lang === 'TR' ? 'İşlemleri Yenile' : 'Refresh Trades'}
              </button>
              <button
                onClick={() => setCurrentView('market')}
                className="w-full sm:w-auto px-5 py-2.5 bg-brand hover:opacity-90 text-black rounded-xl text-sm font-bold transition"
              >
                {lang === 'TR' ? 'Pazar Yerine Dön' : 'Go to Marketplace'}
              </button>
            </div>
          </div>
        </div>
      );
    }

    if (activeTrade?._pendingBackendSync && !activeTrade?.id) {
      return (
        <div className="p-8 text-center">
          <div className="w-12 h-12 border-4 border-emerald-500 border-t-transparent rounded-full animate-spin mx-auto mb-4" />
          <p className="text-textPrimary font-bold text-lg mb-2">
            {lang === 'TR' ? 'İşlem Zincire Yazıldı' : 'Trade Written On-Chain'}
          </p>
          <p className="text-textSecondary text-sm">
            {lang === 'TR'
              ? 'Backend kaydı senkronize ediliyor... Bu birkaç saniye sürebilir.'
              : 'Syncing backend record... This may take a few seconds.'}
          </p>
          <button
            onClick={fetchMyTrades}
            className="mt-4 px-6 py-2 bg-brand text-black rounded-xl text-sm font-bold"
          >
            {lang === 'TR' ? 'Yenile' : 'Refresh'}
          </button>
        </div>
      );
    }
    const roomState = resolvedTradeState;
    const isChallenged = roomState === 'CHALLENGED';
    const isTaker = userRole === 'taker';
    const isMaker = userRole === 'maker';

    const tradeTokenDecimals = activeTrade?.tokenDecimals ?? (tokenDecimalsMap[activeTrade?.crypto || 'USDT'] ?? null);
    const rawCryptoAmt = activeTrade?.cryptoAmountRaw
      ? rawTokenToDisplayNumber(activeTrade.cryptoAmountRaw, tradeTokenDecimals)
      : (Number(activeTrade?.max) > 0 && Number(activeTrade?.rate) > 0 ? Number(activeTrade.max) / Number(activeTrade.rate) : 0);
    // [TR] Ücret, global config değil trade'in kilitlendiği andaki fee snapshot'ından hesaplanır.
    // [EN] Fee uses the trade's lock-time fee snapshot, not the current global config.
    // [TR] Ne snapshot ne kontrat ücreti okunabildiyse ücret "bilinmiyor" gösterilir (0 sanılmaz).
    const effectiveTakerFeeBps = isKnownNumber(activeTrade?.takerFeeBps)
      ? Number(activeTrade.takerFeeBps)
      : (isKnownNumber(takerFeeBps) ? Number(takerFeeBps) : null);
    const feeUnknown = effectiveTakerFeeBps === null;
    const protocolFee  = feeUnknown ? 0 : rawCryptoAmt * (effectiveTakerFeeBps / 10000);
    const netAmount    = rawCryptoAmt - protocolFee;
    const asset        = activeTrade?.crypto || 'USDT';
    const fmt = (value, digits = 2) => fmtNum(value, lang, digits);
    const feeBreakdownText = feeUnknown
      ? (lang === 'TR' ? `Kilitli ${fmt(rawCryptoAmt)} ${asset} · Ücret bilinmiyor` : `Locked ${fmt(rawCryptoAmt)} ${asset} · Fee unknown`)
      : lang === 'TR'
      ? `Kilitli ${fmt(rawCryptoAmt)} ${asset} · Ücret ${fmt(protocolFee, 4)} · Alıcıya net ${fmt(netAmount)} ${asset}`
      : `Locked ${fmt(rawCryptoAmt)} ${asset} · Fee ${fmt(protocolFee, 4)} · Net to taker ${fmt(netAmount)} ${asset}`;
    // [TR] Karşı taraf adresi her zaman kısaltılır; ham 42 karakterlik adres mobilde taşıyordu.
    // [EN] Counterparty address is always shortened; the raw 42-char address overflowed on mobile.
    const counterpartyRaw = isMaker ? activeTrade?.takerFull : (activeTrade?.makerFull || activeTrade?.maker);
    const counterpartyDisplay = counterpartyRaw && String(counterpartyRaw).length > 14 ? formatAddress(counterpartyRaw) : (counterpartyRaw || '—');
    const fiatTotal = Number(activeTrade?.max) > 0 && activeTrade?.fiat ? `${fmt(activeTrade.max)} ${activeTrade.fiat}` : null;
    const hasOnchainTradeId = activeTrade?.onchainId !== null && activeTrade?.onchainId !== undefined && activeTrade?.onchainId !== '';
    const missingOnchainIdReason = lang === 'TR' ? 'On-chain trade ID bulunamadı.' : 'Missing on-chain trade ID.';
    // [TR] Zincir saati (yoksa cihaz saati). [EN] Chain time, falling back to the device clock.
    const nowMs = clockNowMs;
    // [TR] Sayaçlar bu render'ın saatinden türetilir (App kökünde saniyelik state yok).
    const tradeTimers = { ...deriveTradeTimeline(activeTrade, { state: roomState, now: nowMs }).timers, ...tradeTimerOverrides };
    const burnExpiredDeadlinePassed = getBurnExpiredDeadlinePassed({ activeTrade, roomState, now: new Date(nowMs) });
    const handleBurnExpired = ctx.handleBurnExpired || ctx.tradeRoomActions?.handleBurnExpired;
    const paymentWindowExpired = getPaymentWindowExpired({ activeTrade, roomState, now: new Date(nowMs) });
    const handleExpirePaymentWindow = ctx.handleExpirePaymentWindow || ctx.tradeRoomActions?.handleExpirePaymentWindow;
    // [TR] Lab'da handler'lar günlüğe yazar; aktif/pasif kuralları her iki durumda da aynıdır.
    const labHandlers = ctx.devTradeHandlers || null;
    const tradeActionCallbacks = buildTradeRoomPanelCallbacks({
      lang,
      activeTrade,
      roomState,
      isMaker,
      isContractLoading,
      chargebackAccepted,
      hasOnchainTradeId,
      missingOnchainIdReason,
      canMakerChallenge,
      canMakerStartChallengeFlow,
      burnExpiredDeadlinePassed,
      handleReportPayment: labHandlers?.handleReportPayment || handleReportPayment,
      handleRelease: labHandlers?.handleRelease || handleRelease,
      handleChallenge: labHandlers?.handleChallenge || handleChallenge,
      handlePingMaker: labHandlers?.handlePingMaker || handlePingMaker,
      handleAutoRelease: labHandlers?.handleAutoRelease || handleAutoRelease,
      handleProposeCancel: labHandlers?.handleProposeCancel || handleProposeCancel,
      handleRevokeCancel: labHandlers?.handleRevokeCancel || handleRevokeCancel,
      handleBurnExpired: labHandlers?.handleBurnExpired || handleBurnExpired,
      handleExpirePaymentWindow: labHandlers?.handleExpirePaymentWindow || handleExpirePaymentWindow,
      paymentWindowExpired,
      nowMs,
      showToast,
      confirmFn: labHandlers ? () => true : undefined,
    });
    const defaultTradeDecisionInput = {
      trade: activeTrade,
      tradeState: roomState,
      userRole,
      chargebackAccepted,
      paymentIpfsHash,
      timers: tradeTimers,
      nowMs,
      isConnected,
      isAuthenticated,
      isSupportedChain: isSupportedChainId(chainId),
      isPaused,
      lang,
      canBurnExpired: burnExpiredDeadlinePassed,
      paymentWindowExpired,
      cancelStatus,
    };
    const tradeDecisionInput = ctx.devTradeDecisionInput
      ? { ...ctx.devTradeDecisionInput, lang, cancelStatus, timers: { ...ctx.devTradeDecisionInput.timers } }
      : defaultTradeDecisionInput;

    return (
      <div className="p-4 md:p-8 max-w-[900px] w-full mx-auto relative mt-6 md:mt-0">
        <button onClick={() => setCurrentView('market')} className="absolute -top-2 md:-top-4 left-4 md:left-8 text-textMuted hover:text-textPrimary text-sm transition">← {lang === 'TR' ? 'Pazar Yerine Dön' : 'Go Back'}</button>

        {/* [TR] Aktif işlem odasında da yalnız bilgilendirme amaçlı referans kur görünürlüğü sağlanır.
            [EN] Active trade room also shows the same informational-only reference widget. */}
        <ReferenceRateTicker lang={lang} />

        <div className={`border rounded-2xl p-4 md:p-6 shadow-xl transition-colors duration-700 ${isChallenged ? 'bg-surface border-danger/40' : 'bg-surface border-borderSubtle'}`}>
          <div className="flex items-start justify-between gap-3 mb-4 border-b border-borderSubtle pb-4" data-testid="trade-room-header">
            <div className="min-w-0">
              <p className="text-textMuted text-[11px] tracking-widest mb-1">{lang === 'TR' ? 'İŞLEM' : 'TRADE'} #{activeTrade?.onchainId ?? '—'}</p>
              <h2 className="text-2xl font-bold text-textPrimary leading-tight">{fmt(rawCryptoAmt)} {asset}</h2>
              {fiatTotal && <p className="text-sm font-medium text-textMuted">≈ {fiatTotal}</p>}
            </div>
            <div className="shrink-0 text-right">
              <span className={`inline-block text-xs px-3 py-1 rounded-full border ${isChallenged || roomState === 'BURNED' ? 'bg-danger/10 text-danger border-danger/40' : roomState === 'CANCELED' ? 'bg-elevated text-textMuted border-borderSubtle' : 'bg-brand/10 text-brand border-brand/40'}`}>{getStateLabel(roomState, lang)}</span>
              <p className="mt-1.5 text-[11px] text-textMuted">{lang === 'TR' ? 'Karşı taraf' : 'Counterparty'}</p>
              <p className="text-xs text-textPrimary font-mono">{counterpartyDisplay}</p>
            </div>
          </div>

          {/* [TR] Eriyen emanet: her kalem (satıcı teminatı, alıcı teminatı, ana para) kendi çubuğunda, kontrattaki
              orijinal tutara oranla gösterilir. Veri yoksa "hesaplanıyor" yazar; yanıltıcı %100/0 gösterilmez.
              [EN] Bleeding escrow: one meter per bucket vs. its lock-time amount; no fake 100%/0 while loading. */}
          {isChallenged && (() => {
            const toNum = (v) => { try { return Number(BigInt(v ?? 0)); } catch { return 0; } };
            const pctOf = (remaining, original) => (original > 0 ? Math.max(0, Math.min(100, Math.round((remaining / original) * 100))) : null);
            const rows = [
              { key: 'maker', label: lang === 'TR' ? 'Satıcı teminatı' : 'Maker bond', mine: isMaker, pct: bleedingAmounts ? pctOf(toNum(bleedingAmounts.makerBondRemaining), toNum(activeTrade?.makerBondRaw)) : null },
              { key: 'taker', label: lang === 'TR' ? 'Alıcı teminatı' : 'Taker bond', mine: isTaker, pct: bleedingAmounts ? pctOf(toNum(bleedingAmounts.takerBondRemaining), toNum(activeTrade?.takerBondRaw)) : null },
              { key: 'crypto', label: lang === 'TR' ? 'Ana para' : 'Principal', mine: false, pct: bleedingAmounts && bleedingAmounts.currentCrypto !== undefined ? pctOf(toNum(bleedingAmounts.currentCrypto), toNum(activeTrade?.cryptoAmountRaw)) : null },
            ].filter((row) => row.pct !== null || !bleedingAmounts);
            const barTone = (pct) => (pct === null ? 'bg-borderStrong' : pct > 66 ? 'bg-emerald-500' : pct > 33 ? 'bg-warning' : 'bg-danger');
            return (
              <div className="mb-4 rounded-xl border border-danger/30 bg-danger/5 p-4" data-testid="bleeding-meter">
                <div className="mb-3">
                  <p className="flex items-center gap-1.5 text-sm font-bold text-danger"><Flame className="w-4 h-4" strokeWidth={1.8} aria-hidden="true" />{lang === 'TR' ? 'Eriyen emanet' : 'Bleeding escrow'}</p>
                  <p className="mt-0.5 text-xs text-textSecondary">{lang === 'TR' ? 'Eriyen toplam' : 'Total burned'}: <span className="font-semibold text-danger tabular-nums">{bleedingAmounts ? `${formatTokenAmountFromRaw(bleedingAmounts.totalDecayed ?? 0n, tradeTokenDecimals, 4, lang)} ${asset}` : (lang === 'TR' ? 'hesaplanıyor…' : 'calculating…')}</span></p>
                </div>
                <div className="space-y-2.5">
                  {rows.map((row) => (
                    <div key={row.key} className="text-xs">
                      <div className="flex items-center justify-between gap-2 mb-1">
                        <span className={row.mine ? 'font-semibold text-textPrimary' : 'text-textSecondary'}>{row.label}{row.mine ? (lang === 'TR' ? ' (siz)' : ' (you)') : ''}</span>
                        <span className="tabular-nums text-textPrimary">{row.pct === null ? '—' : fmtPct(row.pct, lang)}</span>
                      </div>
                      <div className="h-1.5 rounded-full bg-elevated overflow-hidden" aria-hidden="true">
                        <div className={`h-full rounded-full transition-all duration-500 ${barTone(row.pct)}`} style={{ width: `${row.pct ?? 100}%` }} />
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            );
          })()}

          {(() => {
            // [TR] Önce görülmesi gereken: alıcı için satıcının ödeme bilgileri (nereye ödeyeceği).
            // [EN] Must-see-first: for the taker, the maker's payment details (where to pay).
            const showTakerPii = isTaker && ['LOCKED', 'PAID'].includes(roomState);
            // [TR] Uzlaşma kartı yalnız itiraz aşamasında anlamlıdır ve itiraz özetinin hemen altında durur
            //      (eskiden sayaçların altındaydı; "aşağıdaki karta bakın" yönlendirmesi gereksizleşti).
            const beforeActions = showTakerPii ? (
              <div className="mb-4">
                <PIIDisplay key={activeTrade?.id} tradeId={activeTrade?.id} lang={lang} authenticatedFetch={authenticatedFetch} />
              </div>
            ) : (roomState === 'CHALLENGED' ? (
              <div className="mb-4">
                  <SettlementProposalCard
                    activeTrade={activeTrade}
                    userRole={userRole}
                    address={address}
                    lang={lang}
                    authenticatedFetch={authenticatedFetch}
                    settlementContractFns={settlementContractFns}
                    fetchMyTrades={fetchMyTrades}
                    showToast={showToast}
                    isContractLoading={isContractLoading}
                    setIsContractLoading={setIsContractLoading}
                    nowOffsetMs={chainOffsetMs}
                  />
              </div>
            ) : null);

            // [TR] Birincil aksiyonun girdileri: yalnız o adımda gereken alanlar, butonun hemen üstünde.
            // [EN] Primary action inputs: only what this step needs, right above the button.
            let primaryInput = null;
            if (roomState === 'LOCKED' && isTaker) {
              primaryInput = (
                <div>
                  <input type="file" onChange={handleFileUpload} accept="image/*,.pdf" className="hidden" id="receipt-upload" />
                  <label htmlFor="receipt-upload" className={`w-full px-4 py-3 rounded-lg border text-sm flex items-center justify-center gap-2 cursor-pointer transition ${paymentIpfsHash ? 'border-success/40 bg-success/10 text-success' : 'border-dashed border-borderStrong bg-elevated text-textPrimary hover:border-brand'}`}>
                    {paymentIpfsHash ? <><CircleCheck className="w-4 h-4" strokeWidth={1.8} aria-hidden="true" />{lang === 'TR' ? 'Dekont yüklendi' : 'Receipt uploaded'}</> : <><Paperclip className="w-4 h-4" strokeWidth={1.8} aria-hidden="true" />{lang === 'TR' ? 'Dekont yükle' : 'Upload receipt'}</>}
                  </label>
                  <p className="mt-1 text-[11px] text-textMuted text-center">{lang === 'TR' ? 'Şifrelenir, işlem bitince silinir.' : 'Encrypted, deleted after the trade.'}</p>
                </div>
              );
            }
            if (isMaker && ['LOCKED', 'PAID'].includes(roomState)) {
              primaryInput = (
                <>
                  <div className="rounded-lg border border-warning/40 bg-warning/10 p-3">
                    <p className="text-xs text-textMuted">{lang === 'TR' ? 'Gönderen adı bu olmalı' : 'Sender name must be'}</p>
                    <p className="font-bold text-textPrimary">{takerName || (lang === 'TR' ? 'Yükleniyor…' : 'Loading…')}</p>
                    <p className="mt-1 text-[11px] text-textMuted">{lang === 'TR' ? 'Eşleşmiyorsa onaylamayın; parayı iade edip iptal edin.' : 'If it does not match, do not release; refund and cancel.'}</p>
                  </div>
                  {roomState === 'PAID' && (
                    <>
                      <p className="text-[11px] font-mono text-textMuted text-center">{feeBreakdownText}</p>
                      <label className="flex items-start gap-2 p-3 bg-elevated border border-borderSubtle rounded-lg cursor-pointer text-left">
                        <input type="checkbox" checked={chargebackAccepted} onChange={(e) => handleChargebackAck(e.target.checked)} className="mt-0.5 w-4 h-4 accent-emerald-500" />
                        <span className="text-xs text-textSecondary">{lang === 'TR' ? 'Parayı hesabımda gördüm, gönderen adı eşleşiyor. Ters ibraz riskini anlıyorum.' : 'I see the funds in my account and the sender name matches. I understand the chargeback risk.'}</span>
                      </label>
                    </>
                  )}
                </>
              );
            }

            // [TR] Kapanmış işlemde odada yapılacak iş yok: kullanıcıyı sonraki mantıklı yere yönlendir.
            if (['RESOLVED', 'CANCELED', 'BURNED'].includes(roomState)) {
              primaryInput = (
                <div className="grid grid-cols-2 gap-2">
                  <button type="button" onClick={() => setCurrentView('market')} className="h-10 rounded-lg bg-brand hover:opacity-90 text-black text-sm font-semibold">{lang === 'TR' ? 'Pazara dön' : 'Back to market'}</button>
                  <button type="button" onClick={() => { if (!isConnected || !isAuthenticated) { handleAuthAction(); return; } openProfilePage?.('history'); }} className="h-10 rounded-lg border border-borderStrong bg-surface text-textPrimary text-sm font-semibold hover:bg-elevated">{lang === 'TR' ? 'İşlem geçmişi' : 'Trade history'}</button>
                </div>
              );
            }

            return (
              <TradeRoomPage decisionInput={tradeDecisionInput} actionCallbacks={tradeActionCallbacks} beforeActions={beforeActions} primaryInput={primaryInput}>
                {/* [TR] İptal teklifi durumu: bekleyen teklif veya karşı tarafın teklifine yanıt. Teklif butonu "Diğer seçenekler"de. */}
                {['LOCKED', 'PAID', 'CHALLENGED'].includes(roomState) && cancelStatus === 'proposed_by_me' && (
                  <div className="mb-4 py-3 px-4 bg-warning/10 border border-warning/30 rounded-xl flex items-center gap-3">
                    <div className="w-4 h-4 border-2 border-warning border-t-transparent rounded-full animate-spin shrink-0"></div>
                    <span className="text-sm font-semibold text-textPrimary flex-1">{lang === 'TR' ? 'İptal teklifiniz gönderildi; karşı taraf bekleniyor.' : 'Cancel proposed; waiting for the counterparty.'}</span>
                    {handleRevokeCancel && (
                      <button
                        onClick={tradeActionCallbacks.revoke_cancel.onClick}
                        disabled={tradeActionCallbacks.revoke_cancel.disabled}
                        data-testid="revoke-cancel-button"
                        className="shrink-0 px-3 py-1.5 rounded-lg border border-warning/60 text-warning text-xs font-bold hover:bg-warning hover:text-white transition disabled:opacity-50"
                      >
                        {lang === 'TR' ? 'İptal onayımı geri çek' : 'Withdraw my cancel consent'}
                      </button>
                    )}
                  </div>
                )}
                {['LOCKED', 'PAID', 'CHALLENGED'].includes(roomState) && cancelStatus === 'proposed_by_other' && (
                  <div className="mb-4 p-4 bg-warning/10 border border-warning/30 rounded-xl">
                    <p className="flex items-center gap-1.5 text-sm font-bold text-textPrimary"><Undo2 className="w-4 h-4" strokeWidth={1.8} aria-hidden="true" />{lang === 'TR' ? 'Karşı taraf iptal teklif etti' : 'Counterparty proposed a cancel'}</p>
                    <p className="text-xs text-textMuted mt-1">
                      {roomState === 'LOCKED'
                        ? (lang === 'TR' ? 'Ödeme bildirilmediği için kesinti yok.' : 'No fees before payment is reported.')
                        : (lang === 'TR' ? 'Protokol ücreti kesilir, kalan iade edilir.' : 'Protocol fee applies; the rest is refunded.')}
                    </p>
                    <div className="grid grid-cols-2 gap-2 mt-3">
                      <button onClick={handleProposeCancel} disabled={isContractLoading} className="w-full bg-warning text-white py-2.5 rounded-lg font-bold text-sm hover:opacity-90 transition disabled:opacity-50">
                        {isContractLoading ? '…' : (lang === 'TR' ? 'Onayla' : 'Approve')}
                      </button>
                      <button onClick={() => setCancelStatus(null)} className="w-full bg-elevated border border-borderStrong text-textPrimary py-2.5 rounded-lg font-bold text-sm hover:bg-surface transition">
                        {lang === 'TR' ? 'Yok say' : 'Dismiss'}
                      </button>
                    </div>
                  </div>
                )}
              </TradeRoomPage>
            );
          })()}
        </div>
      </div>
    );
  };

  // [TR] Mobil alt navigasyon çubuğu — yalnızca mobil cihazlarda görünür
  // [EN] Mobile bottom navigation bar — visible only on mobile devices

  // [TR] P1: işlem odası saat sınırı içinde render edilir; yalnız bu alt ağaç saniyede bir güncellenir.
  // [EN] P1: the trade room renders inside a clock boundary; only this subtree updates each second.
  const renderTradeRoom = () => (
    <>
      {infraDegraded && (
        <p data-testid="trade-room-infra-notice" role="status" className="w-full max-w-[900px] mx-4 mb-3 px-4 py-2 rounded-lg border border-borderSubtle bg-elevated text-xs md:text-sm text-textSecondary">
          {lang === 'TR'
            ? 'Zincir/sunucu durumu şu an doğrulanamıyor; gösterilen süreler yaklaşık olabilir. İşlemleriniz kontrat kurallarına göre zincirde doğrulanır.'
            : 'Chain/server status cannot be verified right now; displayed timers may be approximate. Your transactions are verified on-chain by the contract rules.'}
        </p>
      )}
      <NowBoundary fixedNowMs={chainNowMs} render={renderTradeRoomAt} />
    </>
  );

  const renderMobileNav = () => {
    // [TR] Her ikonun altında kısa etiket: yalnız emoji ile menü tahmin oyununa dönüyordu. Giriş yapınca
    //      cüzdan düğmesi profil ikonuyla aynı görünüyordu; artık cüzdan ikonu + yeşil nokta.
    // [EN] Short label under each icon (emoji-only nav was guesswork). The wallet button no longer
    //      turns into a second profile icon when signed in; it keeps the wallet icon with a green dot.
    const item = ({ key, icon: Icon, label, active, onClick, activeClass = 'text-textPrimary', dot = null }) => (
      <button
        key={key}
        onClick={onClick}
        aria-label={label}
        className={`min-h-[48px] min-w-0 flex-1 basis-0 rounded-xl transition-all relative flex flex-col items-center justify-center gap-0.5 ${active ? `bg-elevated ${activeClass}` : 'text-textMuted'}`}
      >
        <Icon className="w-5 h-5" strokeWidth={1.8} aria-hidden="true" />
        <span className="text-[11px] leading-tight py-px font-semibold truncate max-w-full">{label}</span>
        {dot && <span className={`absolute top-0.5 right-2 w-2 h-2 border border-shell rounded-full ${dot}`}></span>}
      </button>
    );
    const tr = lang === 'TR';
    const signedIn = isConnected && isAuthenticated;
    return (
      <div className="md:hidden fixed inset-x-0 bottom-0 box-border h-[calc(4rem_+_env(safe-area-inset-bottom))] max-w-full bg-shell border-t border-borderSubtle z-[45] flex items-center justify-around gap-0 overflow-hidden px-[calc(0.25rem_+_env(safe-area-inset-left))] pr-[calc(0.25rem_+_env(safe-area-inset-right))] pb-[env(safe-area-inset-bottom)] shadow-[0_-10px_30px_rgba(0,0,0,0.12)]">
        {NAV_ORDER.mobile.filter((key) => isViewInNav(key, { navUnlocked, canSeeAdminEntry })).map((key) => {
          const view = VIEW_REGISTRY[key];
          return item({
            key,
            icon: view.icon,
            label: view.shortLabel[tr ? 'TR' : 'EN'],
            active: currentView === key,
            activeClass: view.tone,
            onClick: () => setCurrentView(key),
            dot: key === 'tradeRoom' && activeEscrows.length > 0 ? 'bg-orange-500 animate-pulse' : null,
          });
        })}
        {item({ key: 'menu', icon: Menu, label: tr ? 'Menü' : 'Menu', active: sidebarOpen, onClick: toggleSidebar })}
        {item({ key: 'wallet', icon: Wallet, label: signedIn ? (tr ? 'Bağlı' : 'Linked') : (tr ? 'Bağlan' : 'Connect'), active: false, onClick: handleAuthAction, dot: signedIn ? 'bg-success' : null })}
      </div>
    );
  };


  const renderProfileContext = () => {
    // [TR] Lab "Profil Merkezi" senaryosu itibar/kayıt verisini sağlar; gerçek oturum verisinin yerine geçer.
    const lp = ctx.labProfile || null;
    const labSession = ctx.devScenarioCategory === 'activeTrades' || Boolean(lp);
    return (
      <ProfileContextPage
        lang={lang}
        onConnect={handleAuthAction}
        address={address}
        formatAddress={formatAddress}
        isConnected={isConnected || labSession}
        isAuthenticated={isAuthenticated || labSession}
        authenticatedWallet={lp ? address : ctx.authenticatedWallet}
        payoutProfileDraft={lp?.payoutProfileDraft || ctx.payoutProfileDraft}
        paymentRiskConfig={ctx.paymentRiskConfig}
        setPayoutProfileDraft={ctx.setPayoutProfileDraft}
        handleUpdatePII={ctx.handleUpdatePII}
        userReputation={lp ? lp.userReputation : userReputation}
        reputationPolicy={lp ? lp.reputationPolicy : ctx.reputationPolicy}
        sybilStatus={lp ? lp.sybilStatus : sybilStatus}
        walletAgeRemainingDays={lp ? lp.walletAgeRemainingDays : walletAgeRemainingDays}
        isWalletRegistered={lp ? (lp.isWalletRegistered ?? true) : ctx.isWalletRegistered}
        onRetryWalletRegistration={lp ? undefined : ctx.refreshWalletRegistration}
        isBanned={lp ? lp.isBanned : Boolean(ctx.isBanned)}
        decayReputation={ctx.decayReputation}
        myOrders={lp ? lp.myOrders : (ctx.myOrders || [])}
        setConfirmDeleteId={ctx.setConfirmDeleteId || (() => {})}
        confirmDeleteId={ctx.confirmDeleteId ?? null}
        handleDeleteOrder={ctx.orderActions?.handleDeleteOrder}
        initialActiveTab={ctx.profileContextTab}
        setInitialActiveTab={ctx.setProfileContextTab}
        activeTradesFilter={ctx.activeTradesFilter}
        setActiveTradesFilter={ctx.setActiveTradesFilter}
        activeEscrows={activeEscrows}
        setActiveTrade={setActiveTrade}
        setUserRole={setUserRole}
        setTradeState={setTradeState}
        setChargebackAccepted={setChargebackAccepted}
        setCurrentView={setCurrentView}
        setShowProfileModal={setShowProfileModal}
        tradeHistory={lp ? lp.tradeHistory : (ctx.tradeHistory || [])}
        historyLoading={lp ? false : Boolean(ctx.historyLoading)}
        tradeHistoryPage={lp ? 1 : ctx.tradeHistoryPage}
        setTradeHistoryPage={ctx.setTradeHistoryPage}
        tradeHistoryTotal={lp ? (lp.tradeHistoryTotal ?? lp.tradeHistory.length) : ctx.tradeHistoryTotal}
        tradeHistoryLimit={lp ? 6 : ctx.tradeHistoryLimit}
        mapResolutionTypeLabel={mapResolutionTypeLabel}
        handleLogoutAndDisconnect={ctx.handleLogoutAndDisconnect}
        canonicalizePayoutProfileDraft={ctx.canonicalizePayoutProfileDraft}
        isContractLoading={isContractLoading}
        setIsContractLoading={setIsContractLoading}
        tokenDecimalsMap={tokenDecimalsMap}
        showToast={showToast}
        rewardsReader={lp?.labRewards?.reader || null}
        fetchClaimHistory={lp?.labRewards?.fetchClaimHistory || null}
        now={lp?.labRewards?.now ?? null}
      />
    );
  };

  const renderFooter = () => {
    // [TR] Admin yönetimli linkler FooterSocialLinks içinde public uçtan gelir; env listesi yedektir.
    const envLinks = [
      { label: 'GitHub', url: SOCIAL_LINKS.github },
      { label: 'X', url: SOCIAL_LINKS.twitter },
      { label: 'Farcaster', url: SOCIAL_LINKS.farcaster },
    ].filter((l) => l.url);
    // [TR] Adres yalnız build-time VITE_ESCROW_ADDRESS'ten; admin/backend/runtime kaynağı bilinçli olarak yok.
    // [EN] Address comes only from build-time VITE_ESCROW_ADDRESS; no admin/backend/runtime source by design.
    const escrowAddr = String(import.meta.env.VITE_ESCROW_ADDRESS || '').trim();
    const escrowUrl = getEscrowExplorerUrl({ address: escrowAddr, targetChain: resolveTargetChain() });
    const escrowShort = escrowUrl ? `${escrowAddr.slice(0, 6)}…${escrowAddr.slice(-4)}` : '';
    return (
      <footer className="w-full max-w-[1200px] px-4 md:px-8 pb-6 md:pb-8 mt-2" data-testid="app-footer">
        <div className="border-t border-borderSubtle pt-5 flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
          <div>
            <p className="flex items-center gap-2 text-sm font-semibold text-textPrimary"><img src="/logo-64.png" alt="" width="24" height="24" className="w-6 h-6 shrink-0" />Araf</p>
            <p className="text-xs text-textMuted">{lang === 'TR' ? 'Hakem değil, oyun teorisi. Karar mercii kontrat.' : 'No arbitrator, only game theory. The contract is the final authority.'}</p>
            <p className="text-[11px] text-textMuted mt-1">{lang === 'TR' ? 'Deneysel yazılım; kendi sorumluluğunuzda kullanın.' : 'Experimental software; use at your own risk.'}</p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <button type="button" onClick={() => setShowFeedbackModal(true)} className="px-3 py-2 rounded-lg border border-borderSubtle text-xs font-semibold text-textSecondary hover:text-textPrimary hover:bg-elevated transition">
              {lang === 'TR' ? 'Geri bildirim' : 'Feedback'}
            </button>
            <FooterSocialLinks envLinks={envLinks} />
            {escrowUrl && (
              <a href={escrowUrl} target="_blank" rel="noreferrer noopener" title={escrowShort} aria-label={`${lang === 'TR' ? 'Kontrat' : 'Contract'} ${escrowShort}`} data-testid="footer-contract-link" className="px-3 py-2 rounded-lg border border-borderSubtle text-xs font-semibold text-textSecondary hover:text-textPrimary hover:bg-elevated transition">{lang === 'TR' ? 'Kontrat' : 'Contract'}</a>
            )}
          </div>
        </div>
      </footer>
    );
  };

  const renderOperations = () => {
    const operationSetters = ctx.operationsActionSetters || {};
    return (
      <OperationsCenterPage
        activeEscrows={activeEscrows}
        activeEscrowCounts={activeEscrowCounts}
        activeTrade={activeTrade}
        address={address}
        lang={lang}
        setActiveTrade={operationSetters.setActiveTrade || setActiveTrade}
        setUserRole={operationSetters.setUserRole || setUserRole}
        setTradeState={operationSetters.setTradeState || setTradeState}
        setChargebackAccepted={operationSetters.setChargebackAccepted || setChargebackAccepted}
        setCurrentView={operationSetters.setCurrentView || setCurrentView}
        setSidebarOpen={operationSetters.setSidebarOpen || setSidebarOpen}
        setShowProfileModal={operationSetters.setShowProfileModal || setShowProfileModal}
      />
    );
  };

  return {
    renderHome,
    renderMarket,
    renderOperations,
    renderProfileContext,
    renderTradeRoom,
    renderSlimRail,
    renderAdminHint,
    renderContextSidebar,
    renderMobileNav,
    renderFooter,
  };
};
