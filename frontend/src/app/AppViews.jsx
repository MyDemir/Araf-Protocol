import React from 'react';
import PIIDisplay from '../components/PIIDisplay';
import { getPiiCopy, getStateLabel, getTradeTerm } from './copy';
import ReferenceRateTicker from '../components/ReferenceRateTicker';
import SettlementProposalCard, { normalizeSettlementState } from '../components/SettlementProposalCard';
import PaymentRiskBadge from '../components/PaymentRiskBadge';
import { buildGoToTradeRoomAction } from './actions/tradeNavigationActions';
import OperationTradeCard from './contexts/operations/OperationTradeCard';
import { SettlementQueueCard } from './contexts/operations/OperationsPanels';
import OperationsCenterPage from './contexts/operations/OperationsCenterPage';
import ProfileContextPage from './contexts/profile/ProfileContextPage';
import { getOrderSideCopy } from './orderUiModel';
import { mapResolutionTypeLabel } from './useAppSessionData';
import TradeRoomPage from './contexts/trade-room/TradeRoomPage';
import ThemeToggle from './shell/ThemeToggle';
import {
  Banknote, Briefcase, CircleCheck, CirclePause, Clock, Compass, Droplets, Flame, Handshake, History, Hourglass, House,
  Layers, LoaderCircle, Lock, Menu, Paperclip, Plus, Radar, Search, Settings, ShieldCheck, ShieldOff, Store, Swords,
  TriangleAlert, Undo2, Unplug, UserRound, Wallet, X,
} from 'lucide-react';
import { buildTradeRoomPanelCallbacks, getBurnExpiredDeadlinePassed, getPaymentWindowExpired, PAYMENT_WINDOW_MS } from './contexts/trade-room/tradeRoomPanelActions';

// [TR] App ana görünüm/render katmanı burada tutulur.
// [EN] Main application view/render layer lives here.
export const buildAppViews = (ctx) => {
  const {
    lang,
    t,
    setLang,
    isConnected,
    isAuthenticated,
    isLoggingIn,
    isContractLoading,
    loadingText,
    isPaused,
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
    filterTier1,
    setFilterTier1,
    filterToken,
    setFilterToken,
    searchAmount,
    setSearchAmount,
    filteredOrders,
    orders,
    ordersFeedError,
    activeEscrows,
    loading,
    SUPPORTED_TOKEN_ADDRESSES,
    handleStartTrade,
    handleMint,
    isFaucetEnabled,
    isSupportedChainId,
    handleOpenMakerModal,
    activeEscrowCounts,
    setShowProfileModal,
    setProfileTab,
    setShowFeedbackModal,
    protocolStats,
    statsLoading,
    statsError,
    fetchStats,
    StatChange,
    userReputation,
    sybilStatus,
    walletAgeRemainingDays,
    takerFeeBps,
    socialLinks,
    faqItems,
    activeTrade,
    setActiveTrade,
    userRole,
    setUserRole,
    tradeState,
    setTradeState,
    resolvedTradeState,
    setCancelStatus,
    setChargebackAccepted,
    paymentIpfsHash,
    setPaymentIpfsHash,
    handleFileUpload,
    handleReportPayment,
    handleProposeCancel,
    cancelStatus,
    chargebackAccepted,
    handleChargebackAck,
    handleRelease,
    handleChallenge,
    handlePingMaker,
    handleAutoRelease,
    canMakerPing,
    makerPingTimer,
    canMakerStartChallengeFlow,
    makerChallengePingTimer,
    canMakerChallenge,
    makerChallengeTimer,
    gracePeriodTimer,
    bleedingTimer,
    principalProtectionTimer,
    bleedingAmounts,
    takerName,
    tokenDecimalsMap,
    DEFAULT_TOKEN_DECIMALS,
    formatTokenAmountFromRaw,
    rawTokenToDisplayNumber,
    fetchMyTrades,
    setIsContractLoading,
    setLoadingText,
    getSafeTelegramUrl,
    authenticatedFetch,
    showToast,
    settlementContractFns,
  } = ctx;

  // [TR] Frontend admin menü görünürlüğü yalnız UX katmanıdır.
  //      Nihai yetki doğrulaması backend ADMIN_WALLETS + auth chain tarafındadır.
  // [EN] Frontend admin menu visibility is UX-only; backend remains authority.
  const adminWalletAllowlist = String(import.meta.env.VITE_ADMIN_WALLETS || "")
    .split(",")
    .map((w) => w.trim().toLowerCase())
    .filter(Boolean);
  const connectedWalletLower = typeof address === "string" ? address.toLowerCase() : null;
  const isLikelyAdminWallet =
    Boolean(connectedWalletLower) && adminWalletAllowlist.includes(connectedWalletLower);
  const canSeeAdminEntry = Boolean(isConnected && isAuthenticated && connectedWalletLower);

  const renderSlimRail = () => (
    <div className="hidden md:flex w-16 bg-shell border-r border-borderSubtle flex-col items-center py-6 justify-between z-50 shrink-0 shadow-2xl">
      <div className="space-y-6 flex flex-col items-center w-full">
        <div className="w-8 h-8 rounded bg-gradient-to-br from-white to-slate-400 flex items-center justify-center font-bold text-black mb-4 cursor-pointer" onClick={() => setCurrentView('home')}>
          <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="square" strokeLinejoin="miter" strokeWidth="3" d="M4 4h4v4H4zm12 0h4v4h-4zM4 16h4v4H4zm12 0h4v4h-4zM10 10h4v4h-4z" /></svg>
        </div>
        <button onClick={toggleSidebar} title={lang === 'TR' ? 'Filtreler' : 'Filters'} className={`w-10 h-10 flex items-center justify-center rounded-xl transition ${sidebarOpen ? 'bg-elevated text-textPrimary border border-borderStrong' : 'text-textMuted hover:text-textPrimary hover:bg-elevated'}`}><Menu className="w-5 h-5" strokeWidth={1.8} aria-hidden="true" /></button>
        <button onClick={() => setCurrentView('home')} title={lang === 'TR' ? 'Ana Sayfa' : 'Home'} className={`w-10 h-10 flex items-center justify-center rounded-xl transition ${currentView === 'home' ? 'bg-elevated text-textPrimary border border-borderStrong' : 'text-textMuted hover:text-textPrimary hover:bg-elevated'}`}><House className="w-5 h-5" strokeWidth={1.8} aria-hidden="true" /></button>
        <button onClick={() => setCurrentView('market')} title={lang === 'TR' ? 'Pazar Yeri' : 'Marketplace'} className={`w-10 h-10 flex items-center justify-center rounded-xl transition ${currentView === 'market' ? 'bg-elevated text-textPrimary border border-borderStrong' : 'text-textMuted hover:text-textPrimary hover:bg-elevated'}`}><Store className="w-5 h-5" strokeWidth={1.8} aria-hidden="true" /></button>
        <button onClick={() => setCurrentView('operations')} title={lang === 'TR' ? 'İşlem Takip Merkezi' : 'Operations Center'} className={`w-10 h-10 flex items-center justify-center rounded-xl transition ${currentView === 'operations' ? 'bg-elevated text-info border border-borderStrong' : 'text-textMuted hover:text-textPrimary hover:bg-elevated'}`}><Radar className="w-5 h-5" strokeWidth={1.8} aria-hidden="true" /></button>
        {/* [TR] Admin girişi authenticated kullanıcıya her zaman görünür;
            VITE_ADMIN_WALLETS yalnızca UX ipucu amaçlıdır.
            [EN] Admin entry is always visible for authenticated users;
            VITE_ADMIN_WALLETS is only a UX hint. */}
        {canSeeAdminEntry && (
          <button
            onClick={() => setCurrentView('admin')}
            title={isLikelyAdminWallet
              ? (lang === 'TR' ? 'Yönetim Paneli (uzlaşma analitiği: salt okunur)' : 'Admin Panel (Settlement analytics: read-only)')
              : (lang === 'TR' ? 'Admin Gözlem (sunucu yetkisine bağlı, read-only)' : 'Admin Observability (server-authorized, read-only)')}
            className={`w-10 h-10 flex items-center justify-center rounded-xl transition ${currentView === 'admin' ? 'bg-elevated text-success border border-borderStrong' : 'text-textMuted hover:text-textPrimary hover:bg-elevated'}`}
          >
            <Compass className="w-5 h-5" strokeWidth={1.8} aria-hidden="true" />
          </button>
        )}
        <button onClick={() => setCurrentView('tradeRoom')} title={lang === 'TR' ? 'İşlem Odası' : 'Trade Room'} className={`w-10 h-10 flex items-center justify-center rounded-xl transition relative ${currentView === 'tradeRoom' ? 'bg-elevated text-warning border border-borderStrong' : 'text-textMuted hover:text-textPrimary hover:bg-elevated'}`}>
          <Briefcase className="w-5 h-5" strokeWidth={1.8} aria-hidden="true" /> {activeEscrows.length > 0 && <span className="absolute top-2 right-2 w-2 h-2 bg-orange-500 rounded-full animate-pulse"></span>}
        </button>
        <button onClick={() => setCurrentView('profile')} title={lang === 'TR' ? 'Profil Merkezi' : 'Profile Center'} className={`w-10 h-10 flex items-center justify-center rounded-xl transition ${currentView === 'profile' ? 'bg-elevated text-success border border-borderStrong' : 'text-textMuted hover:text-textPrimary hover:bg-elevated'}`}><UserRound className="w-5 h-5" strokeWidth={1.8} aria-hidden="true" /></button>
        <button onClick={() => { if (!isConnected || !isAuthenticated) { handleAuthAction(); return; } setProfileTab('gecmis'); setShowProfileModal(true); }} title={lang === 'TR' ? 'İşlem Geçmişi' : 'Trade History'} className="w-10 h-10 flex items-center justify-center rounded-xl text-textMuted hover:text-textPrimary hover:bg-elevated transition"><History className="w-5 h-5" strokeWidth={1.8} aria-hidden="true" /></button>
      </div>
      <div className="space-y-3 flex flex-col items-center w-full px-2">
        <div className="w-full flex justify-center">
          <ThemeToggle />
        </div>
        <button onClick={() => setLang(lang === 'TR' ? 'EN' : 'TR')} title={lang === 'TR' ? 'Dili Değiştir' : 'Change Language'} className="text-xs font-bold text-textMuted hover:text-textPrimary mb-1">{lang}</button>
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
    const orderCount = (list) => (ordersFeedError ? '—' : list.length);
    const proposedEscrows = activeEscrows.filter((escrow) => normalizeSettlementState(escrow?.rawTrade?.settlementProposal?.state) === 'PROPOSED');
    const goToRoom = (escrow) => buildGoToTradeRoomAction({
      escrow, setActiveTrade, setUserRole, setTradeState, setChargebackAccepted, setCurrentView, setSidebarOpen,
    });
    // [TR] Tek satır bileşeni: ikon + etiket + sayaç. Tüm drawer aynı ritimde görünür.
    // [EN] One row primitive (icon + label + count) so every drawer row shares one rhythm.
    const Row = ({ icon, label, count, active, tone = 'default', onClick, trailing }) => (
      <button
        type="button"
        onClick={onClick}
        aria-pressed={active ? 'true' : undefined}
        className={`w-full h-10 flex items-center gap-3 px-3 rounded-lg text-sm font-medium transition ${active ? 'bg-elevated text-textPrimary' : 'text-textSecondary hover:text-textPrimary hover:bg-elevated/60'}`}
      >
        <span className={`shrink-0 flex items-center justify-center w-5 ${tone === 'danger' ? 'text-danger' : active ? 'text-textPrimary' : 'text-textMuted'}`}>{icon}</span>
        <span className="min-w-0 flex-1 truncate text-left">{label}</span>
        {trailing}
        {count != null && (
          <span className={`min-w-[1.5rem] h-5 px-1.5 rounded-md text-[11px] font-semibold tabular-nums flex items-center justify-center ${typeof count === 'number' && count > 0 ? (tone === 'danger' ? 'bg-danger/15 text-danger' : 'bg-elevated text-textPrimary') : 'text-textMuted'}`}>{count}</span>
        )}
      </button>
    );
    const SectionLabel = ({ children }) => (
      <p className="px-3 mb-1.5 text-[11px] font-semibold tracking-wider text-textMuted">{children}</p>
    );
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
            <span className="text-base font-bold tracking-tight text-textPrimary">Araf</span>
            <button type="button" onClick={() => setSidebarOpen(false)} aria-label={tr ? 'Menüyü kapat' : 'Close menu'} className="w-9 h-9 -mr-2 flex items-center justify-center rounded-lg text-textMuted hover:text-textPrimary hover:bg-elevated">
              <X className="w-5 h-5" strokeWidth={1.8} aria-hidden="true" />
            </button>
          </div>

          <div className="relative mb-5 px-1">
            <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-textMuted" strokeWidth={1.8} aria-hidden="true" />
            <input type="number" inputMode="decimal" value={searchAmount} onChange={e => setSearchAmount(e.target.value)} placeholder={tr ? 'Tutara göre ara' : 'Search by amount'} aria-label={tr ? 'Tutara göre ara' : 'Search by amount'} className="w-full h-10 bg-surface text-textPrimary pl-9 pr-3 rounded-lg border border-borderSubtle outline-none focus:border-brand/50 text-sm transition" />
          </div>

          <nav className="mb-5">
            <SectionLabel>{tr ? 'PAZAR' : 'MARKET'}</SectionLabel>
            <Row icon={ico(Layers)} label={tr ? 'Tüm emirler' : 'All orders'} count={orderCount(orders)} active={filterToken === 'ALL' && currentView === 'market'} onClick={() => { setFilterToken('ALL'); setCurrentView('market'); }} />
            <Row icon={tokenMark('T', 'bg-emerald-600')} label="USDT" count={orderCount(orders.filter(o => o.crypto === 'USDT'))} active={filterToken === 'USDT' && currentView === 'market'} onClick={() => { setFilterToken('USDT'); setCurrentView('market'); }} />
            <Row icon={tokenMark('C', 'bg-blue-600')} label="USDC" count={orderCount(orders.filter(o => o.crypto === 'USDC'))} active={filterToken === 'USDC' && currentView === 'market'} onClick={() => { setFilterToken('USDC'); setCurrentView('market'); }} />
            {/* [TR] Filtre yalnız Tier 0 (teminatsız) emirleri gösterir; anahtar görünümü açık/kapalı durumu söyler. */}
            <Row
              icon={ico(ShieldOff)}
              label={tr ? 'Teminatsız (Tier 0)' : 'No bond (Tier 0)'}
              active={filterTier1}
              onClick={() => setFilterTier1(!filterTier1)}
              trailing={<span className={`shrink-0 w-8 h-[18px] rounded-full p-0.5 transition ${filterTier1 ? 'bg-brand' : 'bg-borderStrong'}`} aria-hidden="true"><span className={`block w-3.5 h-3.5 rounded-full bg-white transition ${filterTier1 ? 'translate-x-3.5' : ''}`} /></span>}
            />
          </nav>

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

          <div className="mt-auto pt-4 border-t border-borderSubtle px-1 space-y-3">
            <div className="flex items-center gap-2">
              <div className="flex flex-1 bg-surface rounded-lg p-1 border border-borderSubtle" role="group" aria-label={tr ? 'Dil' : 'Language'}>
                {['TR', 'EN'].map((code) => (
                  <button key={code} type="button" onClick={() => setLang(code)} aria-pressed={lang === code} className={`flex-1 h-8 rounded-md text-xs font-semibold transition ${lang === code ? 'bg-elevated text-textPrimary shadow-sm' : 'text-textMuted hover:text-textPrimary'}`}>{code}</button>
                ))}
              </div>
              <ThemeToggle />
            </div>
            <button onClick={handleOpenMakerModal} disabled={isPaused} className={`w-full h-11 rounded-lg text-sm font-semibold transition flex items-center justify-center gap-2 ${isPaused ? 'bg-elevated text-textMuted cursor-not-allowed' : 'bg-emerald-600 hover:bg-emerald-500 text-white shadow-sm'}`}>
              <Plus className="w-4 h-4" strokeWidth={2} aria-hidden="true" /> {tr ? 'Yeni emir oluştur' : 'Create order'}
            </button>
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
        <h1 className="text-4xl md:text-5xl font-extrabold text-transparent bg-clip-text bg-gradient-to-r from-textPrimary via-textSecondary to-textMuted tracking-tight mb-3">
          {lang === 'TR' ? <>Sistem yargılamaz. <br/>Dürüstsüzlüğü pahalıya mal eder.</> : <>The system does not judge. <br/>It makes dishonesty expensive.</>}
        </h1>
        <p className="text-textMuted text-sm max-w-lg">{lang === 'TR' ? 'Emanet tutmayan, hakemsiz eşten eşe USDT/USDC takası. Kurallar kontratta.' : 'Non-custodial, arbitrator-free P2P USDT/USDC trading. The rules live in the contract.'}</p>
        <div className="mt-5 flex flex-col sm:flex-row gap-3">
          <button onClick={() => setCurrentView('market')} className="inline-flex items-center justify-center gap-2 px-6 py-3 rounded-xl bg-brand text-black text-sm font-bold hover:opacity-90 transition">
            <Store className="w-4 h-4" strokeWidth={1.8} aria-hidden="true" />{lang === 'TR' ? 'Pazara git' : 'Open market'}
          </button>
          <button onClick={handleOpenMakerModal} disabled={isPaused} className="px-6 py-3 rounded-xl bg-surface border border-borderStrong text-textPrimary text-sm font-bold hover:bg-elevated transition disabled:opacity-50 disabled:cursor-not-allowed">
            {lang === 'TR' ? '+ Emir oluştur' : '+ Create order'}
          </button>
        </div>
      </div>

      <div className="grid min-w-0 grid-cols-2 md:grid-cols-5 gap-3 md:gap-4 mb-10">
        <div className="min-w-0 overflow-hidden bg-surface border border-borderSubtle p-4 md:p-5 rounded-2xl">
          <p className="text-textMuted text-[10px] font-bold tracking-widest uppercase mb-2">{lang === 'TR' ? 'TOPLAM HACİM' : 'TOTAL VOL'}</p>
          <div className="flex min-w-0 flex-wrap items-baseline">
            <span className="max-w-full truncate text-2xl font-bold text-textPrimary">{statValue(protocolStats?.total_volume_usdt, (v) => `$${Number(v).toLocaleString('en-US', { notation: 'compact', maximumFractionDigits: 1 })}`)}</span>
            <StatChange value={protocolStats?.changes_30d?.total_volume_usdt_pct} />
          </div>
        </div>
        <div className="min-w-0 overflow-hidden bg-surface border border-borderSubtle p-4 md:p-5 rounded-2xl">
          <p className="text-textMuted text-[10px] font-bold tracking-widest uppercase mb-2">{lang === 'TR' ? 'BAŞARILI İŞLEM' : 'SUCCESS TRADES'}</p>
          <div className="flex min-w-0 flex-wrap items-baseline">
            <span className="max-w-full truncate text-2xl font-bold text-textPrimary">{statValue(protocolStats?.completed_trades, (v) => Number(v).toLocaleString())}</span>
            <StatChange value={protocolStats?.changes_30d?.completed_trades_pct} />
          </div>
        </div>
        <div className="min-w-0 overflow-hidden bg-surface border border-borderSubtle p-4 md:p-5 rounded-2xl">
          <p className="text-textMuted text-[10px] font-bold tracking-widest uppercase mb-2">{lang === 'TR' ? 'AÇIK SATIŞ EMİRLERİ' : 'OPEN SELL ORDERS'}</p>
          <span className="max-w-full truncate text-2xl font-bold text-textPrimary">{statValue(protocolStats?.open_sell_orders, (v) => Number(v).toLocaleString())}</span>
        </div>
        <div className="min-w-0 overflow-hidden bg-surface border border-borderSubtle p-4 md:p-5 rounded-2xl">
          <p className="text-textMuted text-[10px] font-bold tracking-widest uppercase mb-2">{lang === 'TR' ? 'ORT. SÜRE' : 'AVG TIME'}</p>
          <span className="max-w-full truncate text-2xl font-bold text-yellow-500">{protocolStats?.avg_trade_hours != null ? `${protocolStats.avg_trade_hours}h` : '—'}</span>
        </div>
        <div className="col-span-2 md:col-span-1 min-w-0 bg-surface border border-danger/30 p-4 md:p-5 rounded-2xl relative overflow-hidden group">
          <div className="absolute -right-3 -bottom-3 text-danger/10 group-hover:scale-110 transition-transform" aria-hidden="true"><Flame className="w-16 h-16" strokeWidth={1.8} aria-hidden="true" /></div>
          <p className="text-danger text-[10px] font-bold tracking-widest uppercase mb-2">{lang === 'TR' ? 'ERİYEN HAZİNE' : 'BURNED BONDS'}</p>
          <div className="flex min-w-0 flex-wrap items-baseline relative z-10">
            <span className="max-w-full truncate text-2xl font-bold text-danger">{statValue(protocolStats?.burned_bonds_usdt, (v) => `$${Number(v).toLocaleString('en-US', { maximumFractionDigits: 0 })}`)}</span>
          </div>
        </div>
      </div>

      {statsError && (
        <div className="col-span-2 md:col-span-5 text-center py-4 text-textMuted text-xs">
          {lang === 'TR' ? 'İstatistik verisi alınamadı.' : 'Failed to load stats.'}
          <button onClick={fetchStats} className="ml-2 text-emerald-400 hover:underline">
            {lang === 'TR' ? 'Tekrar dene' : 'Retry'}
          </button>
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 md:gap-6">
        <section className="bg-surface border border-borderSubtle rounded-2xl p-5 md:p-6">
          <p className="text-[11px] tracking-[0.2em] uppercase text-emerald-400 mb-2">
            {lang === 'TR' ? 'P2P Nasıl Çalışır?' : 'How P2P Works'}
          </p>
          <h3 className="text-xl font-bold text-textPrimary mb-3">
            {lang === 'TR' ? 'Kararı backend değil, kontrat verir.' : 'The contract decides, not the backend.'}
          </h3>
          <ul className="space-y-2 text-sm text-textSecondary leading-relaxed">
            <li>• {lang === 'TR' ? 'Satıcı USDT/USDC ve teminatını kilitler; alıcı şartları kabul edip işleme girer.' : 'Maker locks USDT/USDC + bond, Taker joins under clear on-chain rules.'}</li>
            <li>• {lang === 'TR' ? 'Uyuşmazlıkta insan hakem yok; süre uzadıkça her iki taraf için de maliyet artar.' : 'No human arbitrator in disputes; delay becomes progressively expensive for both sides.'}</li>
            <li>• {lang === 'TR' ? 'Bu yapı gereksiz tartışmayı değil, hızlı uzlaşıyı ekonomik olarak teşvik eder.' : 'This structure rewards fast settlement rather than endless argument.'}</li>
          </ul>
        </section>

        <section className="bg-surface border border-borderSubtle rounded-2xl p-5 md:p-6">
          <p className="text-[11px] tracking-[0.2em] uppercase text-textMuted mb-3">FAQ</p>
          <div className="min-w-0 space-y-3">
            {faqItems.map((item) => (
              <details key={item.q} className="group border border-borderSubtle rounded-xl p-3 bg-elevated">
                <summary className="cursor-pointer list-none text-sm font-semibold text-textPrimary flex items-center justify-between gap-3">
                  {item.q}
                  <span className="text-textMuted group-open:rotate-45 transition">+</span>
                </summary>
                <p className="text-xs md:text-sm text-textSecondary mt-2 leading-relaxed">{item.a}</p>
              </details>
            ))}
          </div>
        </section>
      </div>
    </div>
  );

  // [TR] Pazar yeri — side-aware order listesi, filtreler, test faucet butonları
  // [EN] Marketplace — side-aware order list, filters, test faucet buttons
  const renderMarket = () => (
    <div className="w-full max-w-[1200px] min-w-0 p-4 md:p-8">
      <div className="mb-6 flex min-w-0 flex-col md:flex-row items-start md:items-center justify-between gap-4">
        <div className="flex w-full md:w-auto items-center justify-between gap-3">
          <h2 className="text-xl font-bold text-textPrimary">{lang === 'TR' ? 'Pazar Yeri' : 'Marketplace'}</h2>
          {(filteredOrders || []).length > 0 && (
            <button onClick={handleOpenMakerModal} disabled={isPaused} className="md:hidden px-3 py-2 rounded-xl bg-brand text-black text-xs font-bold hover:opacity-90 disabled:opacity-50">
              {lang === 'TR' ? '+ Emir' : '+ Order'}
            </button>
          )}
        </div>
        <div className="flex min-w-0 flex-wrap items-center gap-3 w-full md:w-auto">
          {(filteredOrders || []).length > 0 && (
            <button onClick={handleOpenMakerModal} disabled={isPaused} className="hidden md:inline-flex px-4 py-2 rounded-xl bg-brand text-black text-sm font-bold hover:opacity-90 disabled:opacity-50">
              {lang === 'TR' ? '+ Emir oluştur' : '+ Create order'}
            </button>
          )}
        {isFaucetEnabled && (
          <div className="flex min-w-0 flex-wrap gap-3 w-full md:w-auto">
            <button onClick={() => handleMint('USDT')} disabled={isContractLoading} className="flex-1 md:flex-none px-4 py-2 bg-surface border border-borderSubtle hover:bg-elevated rounded-xl text-xs sm:text-sm font-bold text-emerald-400 transition shadow-lg flex items-center justify-center gap-2">
              {isContractLoading && loadingText.includes('USDT') ? <LoaderCircle className="w-4 h-4 animate-spin" strokeWidth={1.8} aria-hidden="true" /> : <Droplets className="w-4 h-4" strokeWidth={1.8} aria-hidden="true" />} {lang === 'TR' ? 'Test USDT Al' : 'Get Test USDT'}
            </button>
            <button onClick={() => handleMint('USDC')} disabled={isContractLoading} className="flex-1 md:flex-none px-4 py-2 bg-surface border border-borderSubtle hover:bg-elevated rounded-xl text-xs sm:text-sm font-bold text-blue-400 transition shadow-lg flex items-center justify-center gap-2">
              {isContractLoading && loadingText.includes('USDC') ? <LoaderCircle className="w-4 h-4 animate-spin" strokeWidth={1.8} aria-hidden="true" /> : <Droplets className="w-4 h-4" strokeWidth={1.8} aria-hidden="true" />} {lang === 'TR' ? 'Test USDC Al' : 'Get Test USDC'}
            </button>
          </div>
        )}
        </div>
      </div>

      <ReferenceRateTicker lang={lang} />

      <div className="space-y-3">
        {loading ? (
          <div className="p-8 text-center text-textMuted animate-pulse">{lang === 'TR' ? 'Yükleniyor...' : 'Loading...'}</div>
        ) : filteredOrders.length > 0 ? (
          filteredOrders.map((order) => {
            const effectiveUserTier = userReputation?.effectiveTier ?? 0;
            const isMyOwnAd    = address && order.makerFull?.toLowerCase() === address.toLowerCase();
            const isTierLocked = isConnected && isAuthenticated && order.tier > effectiveUserTier;
            const canTakeOrder = isConnected && isAuthenticated && !isMyOwnAd && !isTierLocked && !isPaused;
            const tokenAddr    = SUPPORTED_TOKEN_ADDRESSES[order.crypto || 'USDT'];
            const isTokenConfigured = Boolean(tokenAddr);
            const isCorrectChain    = isSupportedChainId(chainId);
            const isFunded          = sybilStatus ? sybilStatus.funded : true;
            const isCooldownOk      = sybilStatus ? sybilStatus.cooldownOk : true;
            const finalCanTakeOrder = canTakeOrder && isCooldownOk && isFunded && !isPaused && isTokenConfigured && isCorrectChain;
            const isSellSide = order.side === 'SELL_CRYPTO';
            const sideBadgeClass = isSellSide ? 'bg-emerald-900/20 text-emerald-400 border-emerald-800/40' : 'bg-blue-900/20 text-blue-400 border-blue-800/40';

            return (
              <div key={order.id} className="min-w-0 overflow-visible bg-surface hover:bg-elevated border border-borderSubtle p-4 rounded-xl flex flex-col md:flex-row items-start md:items-center justify-between transition-colors group relative gap-4 md:gap-0">
                <div className="flex min-w-0 items-center gap-4 w-full md:w-1/3">
                  <div className={`w-10 h-10 rounded-full border flex items-center justify-center shrink-0 font-bold ${order.crypto === 'USDC' ? 'bg-blue-500/10 border-blue-500/30 text-blue-500' : 'bg-emerald-500/10 border-emerald-500/30 text-emerald-500'}`}>{order.crypto === 'USDC' ? '$' : '₮'}</div>
                  <div className="relative min-w-0 max-w-full group/tooltip">
                    <p className="max-w-full truncate text-textPrimary font-medium text-sm cursor-help">{order.maker}</p>
                    <p className="text-sm font-semibold text-textPrimary">
                      {order.hasPrice
                        ? `${Number(order.rate).toLocaleString(lang === 'TR' ? 'tr-TR' : 'en-US', { maximumFractionDigits: 4 })} ${order.fiat}`
                        : <span className="text-textMuted font-normal">{lang === 'TR' ? 'Kur belirtilmedi' : 'No rate set'}</span>}
                      <span className="text-xs font-normal text-textMuted"> / 1 {order.crypto}</span>
                    </p>
                    <div className="flex flex-wrap items-center gap-1 mt-1">
                      <span className={`inline-flex text-[10px] px-2 py-0.5 rounded border ${sideBadgeClass}`}>{order.sideLabel || getOrderSideCopy(order.side, 'order', lang) || order.side}</span>
                      <span className="inline-flex text-[10px] px-2 py-0.5 rounded border border-borderSubtle text-textMuted">{order.statusLabel || order.status}</span>
                    </div>
                    <div className="absolute left-0 sm:-left-4 md:left-1/2 md:-translate-x-1/2 bottom-full mb-2 hidden group-hover/tooltip:block z-50">
                      {/* [TR] V3 compact hover özeti: taraf-bağımlı ama seller-only terminoloji içermez.
                          [EN] V3 compact hover summary: side-aware, without seller-only terminology. */}
                      <div className="bg-surface border border-borderStrong p-4 rounded-2xl shadow-2xl w-72 backdrop-blur-xl">
                        <p className="text-[10px] text-textMuted mb-2 tracking-widest uppercase">
                          {lang === 'TR' ? 'İŞLEM SAHİBİ ÖZETİ' : 'ORDER OWNER SUMMARY'}
                        </p>
                        <p className="text-[10px] text-textMuted mb-3">
                          {order.ownerSideHint || (lang === 'TR' ? 'Emir sahibi taraf bilgisi' : 'Order owner side context')}
                        </p>
                        <div className="grid grid-cols-2 gap-2 text-xs">
                          <div className="rounded-lg border border-borderSubtle bg-elevated px-2.5 py-2">
                            <p className="text-[10px] text-textMuted uppercase">{lang === 'TR' ? 'Başarı' : 'Success'}</p>
                            <p className="text-emerald-400 font-bold">{order.successRate != null ? `${order.successRate}%` : '—'}</p>
                          </div>
                          <div className="rounded-lg border border-borderSubtle bg-elevated px-2.5 py-2">
                            <p className="text-[10px] text-textMuted uppercase">{lang === 'TR' ? 'Toplam İşlem' : 'Total Trades'}</p>
                            <p className="text-textPrimary font-mono">{order.totalTrades ?? order.txCount} Tx</p>
                          </div>
                          <div className="rounded-lg border border-borderSubtle bg-elevated px-2.5 py-2">
                            <p className="text-[10px] text-textMuted uppercase">{lang === 'TR' ? 'Taraf' : 'Side'}</p>
                            <p className="text-textSecondary">{order.sideLabel || getOrderSideCopy(order.side, 'order', lang) || order.side}</p>
                          </div>
                          <div className="rounded-lg border border-borderSubtle bg-elevated px-2.5 py-2">
                            <p className="text-[10px] text-textMuted uppercase">Tier</p>
                            <p className="text-yellow-500 font-bold inline-flex items-center gap-1">T{order.tier} <ShieldCheck className="w-3.5 h-3.5" strokeWidth={1.8} aria-hidden="true" /></p>
                          </div>
                        </div>
                        <div className="mt-3 rounded-lg border border-borderSubtle bg-elevated px-2.5 py-2">
                          {/* [TR] Hover özeti taker-facing kısa görünürlük katmanıdır; detaylar Profil Merkezi'ndedir.
                              [EN] Hover summary is a taker-facing compact visibility layer; details remain in Profile Center. */}
                          <div className="flex items-center justify-between gap-2">
                            <p className="text-[10px] text-textMuted uppercase">{lang === 'TR' ? 'Güven Görünürlüğü' : 'Trust Visibility'}</p>
                            <span className={`text-[10px] px-2 py-0.5 rounded border ${order?.trustSummary?.chipClass || 'text-textMuted border-borderSubtle bg-elevated'}`}>
                              {order?.trustSummary?.band ? `${order.trustSummary.band} · ${order.trustSummary.label}` : (order?.trustSummary?.label || (lang === 'TR' ? 'Sinyal yok' : 'Signal unavailable'))}
                            </span>
                          </div>
                          <p className="text-[10px] text-textMuted mt-1">
                            {lang === 'TR' ? 'Bilgilendirme amaçlıdır.' : 'Informational only.'}
                          </p>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>

                <div className="w-full md:w-1/3 text-left md:text-center border-t border-borderSubtle md:border-none pt-3 md:pt-0">
                  <p className="text-sm font-bold text-textPrimary">
                    {Number(order.remainingAmount || 0).toLocaleString(lang === 'TR' ? 'tr-TR' : 'en-US', { maximumFractionDigits: 2 })} {order.crypto}
                  </p>
                  <p className="text-[11px] text-textMuted mt-0.5">
                    {lang === 'TR' ? 'Min' : 'Min'} {Number(order.minFillAmount || 0).toLocaleString(lang === 'TR' ? 'tr-TR' : 'en-US', { maximumFractionDigits: 2 })} · T{order.tier}{Number(order.tier) === 0 ? ` · ${lang === 'TR' ? 'teminatsız' : 'no bond'}` : (order.bondLabel !== '—' ? ` · ${order.bondLabel} ${lang === 'TR' ? 'teminat' : 'bond'}` : '')}
                  </p>
                  {order.paymentRiskSignal && <PaymentRiskBadge lang={lang} riskEntry={order.paymentRiskSignal} compact />}
                </div>

                <div className="w-full md:w-1/3 flex flex-col items-start md:items-end justify-center relative">
                  {(() => {
                    // [TR] Oturum yoksa buton pasif "Kilitli" yerine giriş akışını başlatır.
                    // [EN] Without a session the CTA starts sign-in instead of a dead "Locked" state.
                    const needsSignIn = !isConnected || !isAuthenticated;
                    const isDisabled = needsSignIn ? false : (!finalCanTakeOrder || isContractLoading);
                    return (
                  <button onClick={() => (needsSignIn ? handleAuthAction() : handleStartTrade(order))} disabled={isDisabled} className={`w-full md:w-auto px-6 py-2.5 rounded-xl font-bold text-sm transition flex items-center justify-center gap-2 ${isDisabled ? 'bg-elevated text-textMuted border border-borderStrong cursor-not-allowed' : 'bg-brand text-black hover:opacity-90'}`}>
                    {needsSignIn         ? <><Wallet className="w-4 h-4" strokeWidth={1.8} aria-hidden="true" /> {lang === 'TR' ? 'Giriş yap' : 'Sign in'}</> :
                     isPaused            ? <><CirclePause className="w-4 h-4" strokeWidth={1.8} aria-hidden="true" /> {lang === 'TR' ? 'Bakımda' : 'Paused'}</> :
                     !isCorrectChain     ? <><Unplug className="w-4 h-4" strokeWidth={1.8} aria-hidden="true" /> {lang === 'TR' ? 'Yanlış Ağ' : 'Wrong Network'}</> :
                     !isTokenConfigured  ? <><Settings className="w-4 h-4" strokeWidth={1.8} aria-hidden="true" /> {lang === 'TR' ? 'Token Ayarlanmadı' : 'Token Not Set'}</> :
                     isMyOwnAd           ? <>{lang === 'TR' ? 'Sizin emriniz' : 'Your order'}</> :
                     isTierLocked        ? <><Lock className="w-4 h-4" strokeWidth={1.8} aria-hidden="true" /> {lang === 'TR' ? `Tier ${order.tier} gerekli` : `Tier ${order.tier} required`}</> :
                     !canTakeOrder       ? <><Lock className="w-4 h-4" strokeWidth={1.8} aria-hidden="true" /> {lang === 'TR' ? 'Kilitli' : 'Locked'}</> :
                     !isFunded           ? <><TriangleAlert className="w-4 h-4" strokeWidth={1.8} aria-hidden="true" /> {lang === 'TR' ? 'Bakiye Yetersiz' : 'Low Balance'}</> :
                     !isCooldownOk       ? <><Hourglass className="w-4 h-4" strokeWidth={1.8} aria-hidden="true" /> {lang === 'TR' ? `Cooldown: ${Math.ceil((sybilStatus?.cooldownRemaining || 0) / 60)} dk` : `Cooldown: ${Math.ceil((sybilStatus?.cooldownRemaining || 0) / 60)} min`}</> :
                     (isContractLoading  ? <><LoaderCircle className="w-4 h-4 animate-spin" strokeWidth={1.8} aria-hidden="true" />{loadingText || (lang === 'TR' ? 'İşleniyor...' : 'Processing...')}</> : (order.ctaLabel || (lang === 'TR' ? 'İşlem Yap' : 'Trade')))}
                  </button>
                    );
                  })()}
                  {!isFunded && isConnected && canTakeOrder && !isPaused && (
                    <p className="text-xs text-danger mt-2 text-center md:text-right w-full leading-snug">
                      {lang === 'TR' ? 'En az 0.001 ETH gerekli.' : 'Needs at least 0.001 ETH.'}
                    </p>
                  )}
                </div>
              </div>
            );
          })
        ) : (
          <div className="p-8 text-center border border-dashed border-borderSubtle rounded-2xl">
            <p className="text-textMuted mb-4">{lang === 'TR' ? 'Emir bulunamadı.' : 'No orders found.'}</p>
            {!isPaused && (
              <button onClick={handleOpenMakerModal} className="px-5 py-2.5 rounded-xl bg-brand text-black text-sm font-bold hover:opacity-90">
                + {lang === 'TR' ? 'İlk emri oluştur' : 'Create the first order'}
              </button>
            )}
          </div>
        )}
      </div>
    </div>
  );

  // [TR] İşlem odası — LOCKED/PAID/CHALLENGED durumlarına göre taker/maker aksiyonlarını gösterir.
  //      Bleeding Escrow görsel barı, zamanlayıcılar, iptal/serbest bırakma ve PII bölümü içerir.
  // [EN] Trade room — shows taker/maker actions based on LOCKED/PAID/CHALLENGED state.
  //      Contains Bleeding Escrow visual bar, timers, cancel/release and PII section.
  const renderTradeRoom = () => {
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
                className="w-full sm:w-auto px-5 py-2.5 bg-emerald-600 hover:bg-emerald-500 text-white rounded-xl text-sm font-bold transition"
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
            className="mt-4 px-6 py-2 bg-emerald-600 text-white rounded-xl text-sm font-bold"
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

    const tradeTokenDecimals = activeTrade?.tokenDecimals ?? (tokenDecimalsMap[activeTrade?.crypto || 'USDT'] ?? DEFAULT_TOKEN_DECIMALS);
    const rawCryptoAmt = activeTrade?.cryptoAmountRaw
      ? rawTokenToDisplayNumber(activeTrade.cryptoAmountRaw, tradeTokenDecimals)
      : (Number(activeTrade?.max) > 0 && Number(activeTrade?.rate) > 0 ? Number(activeTrade.max) / Number(activeTrade.rate) : 0);
    // [TR] Ücret, global config değil trade'in kilitlendiği andaki fee snapshot'ından hesaplanır.
    // [EN] Fee uses the trade's lock-time fee snapshot, not the current global config.
    const effectiveTakerFeeBps = Number.isFinite(Number(activeTrade?.takerFeeBps)) && activeTrade?.takerFeeBps !== null
      ? Number(activeTrade.takerFeeBps)
      : Number(takerFeeBps || 0);
    const protocolFee  = rawCryptoAmt * (effectiveTakerFeeBps / 10000);
    const netAmount    = rawCryptoAmt - protocolFee;
    const asset        = activeTrade?.crypto || 'USDT';
    const fmt = (value, digits = 2) => Number(value || 0).toLocaleString(lang === 'TR' ? 'tr-TR' : 'en-US', { maximumFractionDigits: digits });
    const feeBreakdownText = lang === 'TR'
      ? `Kilitli ${fmt(rawCryptoAmt)} ${asset} · Ücret ${fmt(protocolFee, 4)} · Alıcıya net ${fmt(netAmount)} ${asset}`
      : `Locked ${fmt(rawCryptoAmt)} ${asset} · Fee ${fmt(protocolFee, 4)} · Net to taker ${fmt(netAmount)} ${asset}`;
    // [TR] Karşı taraf adresi her zaman kısaltılır; ham 42 karakterlik adres mobilde taşıyordu.
    // [EN] Counterparty address is always shortened; the raw 42-char address overflowed on mobile.
    const counterpartyRaw = isMaker ? activeTrade?.takerFull : (activeTrade?.makerFull || activeTrade?.maker);
    const counterpartyDisplay = counterpartyRaw && String(counterpartyRaw).length > 14 ? formatAddress(counterpartyRaw) : (counterpartyRaw || '—');
    const fiatTotal = Number(activeTrade?.max) > 0 && activeTrade?.fiat ? `${fmt(activeTrade.max)} ${activeTrade.fiat}` : null;
    const hasOnchainTradeId = activeTrade?.onchainId !== null && activeTrade?.onchainId !== undefined && activeTrade?.onchainId !== '';
    const missingOnchainIdReason = lang === 'TR' ? 'On-chain trade ID bulunamadı.' : 'Missing on-chain trade ID.';
    const burnExpiredDeadlinePassed = getBurnExpiredDeadlinePassed({ activeTrade, roomState });
    const handleBurnExpired = ctx.handleBurnExpired || ctx.tradeRoomActions?.handleBurnExpired;
    const paymentWindowExpired = getPaymentWindowExpired({ activeTrade, roomState });
    const handleExpirePaymentWindow = ctx.handleExpirePaymentWindow || ctx.tradeRoomActions?.handleExpirePaymentWindow;
    const paymentWindowTimer = (() => {
      if (!activeTrade?.lockedAt) return null;
      const left = new Date(activeTrade.lockedAt).getTime() + PAYMENT_WINDOW_MS - Date.now();
      if (!Number.isFinite(left)) return null;
      if (left <= 0) return { isFinished: true };
      const sec = Math.floor(left / 1000);
      return { days: Math.floor(sec / 86400), hours: Math.floor((sec % 86400) / 3600), minutes: Math.floor((sec % 3600) / 60), seconds: sec % 60, isFinished: false };
    })();
    const tradeActionCallbacks = ctx.devTradeActionCallbacks || buildTradeRoomPanelCallbacks({
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
      handleReportPayment,
      handleRelease,
      handleChallenge,
      handlePingMaker,
      handleAutoRelease,
      handleProposeCancel,
      handleBurnExpired,
      handleExpirePaymentWindow,
      paymentWindowExpired,
    });
    const challengedDetails = isChallenged ? (() => {
      const riskLines = bleedingAmounts
        ? [
            `${lang === 'TR' ? 'Yakılan toplam' : 'Total burned'}: ${formatTokenAmountFromRaw(bleedingAmounts.totalDecayed ?? 0n, tradeTokenDecimals)} ${asset}`,
            `${lang === 'TR' ? 'Kalan teminatlar' : 'Remaining bonds'}: ${formatTokenAmountFromRaw(bleedingAmounts.makerBondRemaining ?? 0n, tradeTokenDecimals)} ${asset} / ${formatTokenAmountFromRaw(bleedingAmounts.takerBondRemaining ?? 0n, tradeTokenDecimals)} ${asset}`,
          ]
        : [lang === 'TR' ? 'Riskteki değer şu anda yükleniyor veya hesaplanamıyor.' : 'Value at risk is loading or unavailable.'];
      const timerLines = [
        `${getTradeTerm('bleedingEscrow', lang)}: ${bleedingTimer?.isFinished ? (lang === 'TR' ? 'Tamamlandı' : 'Finished') : `${String(bleedingTimer?.hours ?? 0).padStart(2, '0')}:${String(bleedingTimer?.minutes ?? 0).padStart(2, '0')}:${String(bleedingTimer?.seconds ?? 0).padStart(2, '0')}`}`,
        `${lang === 'TR' ? 'Ana para koruması' : 'Principal protection'}: ${principalProtectionTimer?.isFinished ? (lang === 'TR' ? 'Tamamlandı' : 'Finished') : `${principalProtectionTimer?.days ?? 0}d ${principalProtectionTimer?.hours ?? 0}h`}`,
      ];
      return {
        whatHappening: lang === 'TR'
          ? 'İşlem itiraz sürecinde. Araf karar vermez; tarafların uzlaşma veya mevcut kontrat aksiyonlarıyla ilerlemesi gerekir.'
          : 'The trade is in a challenge phase. Araf does not decide the outcome; parties proceed through settlement or available contract actions.',
        riskLines,
        timerLines,
        nextActionLabel: lang === 'TR' ? 'Uzlaşma adımlarını değerlendir' : 'Review settlement steps',
        nextActionDescription: lang === 'TR' ? 'Önce uzlaşma kartındaki taraf aksiyonlarını kontrol edin.' : 'Check party actions in the settlement card first.',
      };
    })() : null;

    const defaultTradeDecisionInput = {
      trade: activeTrade,
      tradeState: roomState,
      userRole,
      chargebackAccepted,
      paymentIpfsHash,
      timers: {
        paymentWindow: paymentWindowTimer,
        gracePeriod: gracePeriodTimer,
        makerPing: makerPingTimer,
        makerChallengePing: makerChallengePingTimer,
        makerChallenge: makerChallengeTimer,
        bleeding: bleedingTimer,
        principalProtection: principalProtectionTimer,
      },
      isConnected,
      isAuthenticated,
      isSupportedChain: isSupportedChainId(chainId),
      isPaused,
      lang,
      canBurnExpired: burnExpiredDeadlinePassed,
      paymentWindowExpired,
      challengedDetails,
    };
    const tradeDecisionInput = ctx.devTradeDecisionInput
      ? { ...ctx.devTradeDecisionInput, lang, challengedDetails: ctx.devTradeDecisionInput.challengedDetails || challengedDetails }
      : defaultTradeDecisionInput;

    return (
      <div className="p-4 md:p-8 max-w-[900px] w-full mx-auto relative mt-6 md:mt-0">
        <button onClick={() => setCurrentView('market')} className="absolute -top-2 md:-top-4 left-4 md:left-8 text-textMuted hover:text-textPrimary text-sm transition">← {lang === 'TR' ? 'Pazar Yerine Dön' : 'Go Back'}</button>

        {/* [TR] Aktif işlem odasında da yalnız bilgilendirme amaçlı referans kur görünürlüğü sağlanır.
            [EN] Active trade room also shows the same informational-only reference widget. */}
        <ReferenceRateTicker lang={lang} />

        <div className={`border rounded-2xl p-4 md:p-6 shadow-xl transition-colors duration-700 ${isChallenged ? 'bg-surface border-danger/40' : 'bg-surface border-borderSubtle'}`}>
          <div className="flex items-start justify-between gap-3 mb-4 border-b border-borderSubtle pb-4">
            <div className="min-w-0">
              <p className="text-textMuted text-[11px] tracking-widest mb-1">{lang === 'TR' ? 'İŞLEM' : 'TRADE'} #{activeTrade?.onchainId ?? '—'}</p>
              <h2 className="text-2xl font-bold text-textPrimary leading-tight">{fmt(rawCryptoAmt)} {asset}</h2>
              {fiatTotal && <p className="text-sm font-medium text-textMuted">≈ {fiatTotal}</p>}
            </div>
            <div className="shrink-0 text-right">
              <span className={`inline-block text-xs px-3 py-1 rounded-full border ${isChallenged ? 'bg-danger/10 text-danger border-danger/40' : 'bg-brand/10 text-brand border-brand/40'}`}>{getStateLabel(roomState, lang)}</span>
              <p className="mt-1.5 text-[11px] text-textMuted">{lang === 'TR' ? 'Karşı taraf' : 'Counterparty'}</p>
              <p className="text-xs text-textPrimary font-mono">{counterpartyDisplay}</p>
            </div>
          </div>

          {/* Eriyen emanet görsel barı — yalnızca CHALLENGED state'inde gösterilir */}
          {isChallenged && (
            <div className="mb-4 p-4 bg-surface border border-danger/40 rounded-xl relative overflow-hidden">
              <div className="flex justify-between text-xs font-bold mb-3">
                <span className="text-red-500">{lang === 'TR' ? 'İLAN SAHİBİ TEMİNATI' : 'MAKER BOND'}</span>
                <span className="text-orange-500">{lang === 'TR' ? 'ALICI TEMİNATI' : 'TAKER BOND'}</span>
              </div>
              {(() => {
                // [TR] Kalan teminat, lock anındaki orijinal teminata oranlanır (önceki hesap her zaman %100'dü).
                // [EN] Remaining bond is compared with the original lock-time bond (old math was always 100%).
                const toNum = (v) => { try { return Number(BigInt(v ?? 0)); } catch { return 0; } };
                const makerOrig = toNum(activeTrade?.makerBondRaw);
                const takerOrig = toNum(activeTrade?.takerBondRaw);
                const pctOf = (remaining, original) => (original > 0 ? Math.max(0, Math.min(100, Math.round((remaining / original) * 100))) : 0);
                const makerPct = bleedingAmounts ? pctOf(toNum(bleedingAmounts.makerBondRemaining), makerOrig) : 100;
                const takerPct = bleedingAmounts ? pctOf(toNum(bleedingAmounts.takerBondRemaining), takerOrig) : 100;
                const myPct = isTaker ? takerPct : makerPct;
                const opponentPct = isTaker ? makerPct : takerPct;
                const decayedTotal = bleedingAmounts ? (bleedingAmounts.totalDecayed ?? 0n) : 0n;
                return (
                  <>
                    <div className="w-full h-3 bg-elevated rounded-full flex relative border border-borderSubtle">
                      <div className="h-full bg-gradient-to-r from-red-700 to-red-500 rounded-l-full relative transition-all duration-500" style={{width: `${isMaker ? myPct : opponentPct}%`}}>
                        <div className="absolute right-0 top-1/2 -translate-y-1/2 w-4 h-4 bg-red-500 rounded-full blur-sm"></div>
                      </div>
                      <div className="flex-1 bg-transparent border-y border-red-900/30 flex items-center justify-center overflow-hidden">
                        <div className="w-full h-px bg-red-500/20 shadow-[0_0_10px_red] animate-pulse"></div>
                      </div>
                      <div className="h-full bg-gradient-to-l from-orange-700 to-orange-500 rounded-r-full relative transition-all duration-500" style={{width: `${isTaker ? myPct : opponentPct}%`}}>
                        <div className="absolute left-0 top-1/2 -translate-y-1/2 w-4 h-4 bg-orange-500 rounded-full blur-sm"></div>
                      </div>
                    </div>
                    {/* [TR] Süreler aşağıdaki "Süreler" kartında; burada yalnız eriyen toplam gösterilir. */}
                    <p className="mt-3 flex items-center justify-center gap-1.5 text-sm font-bold text-danger"><Flame className="w-4 h-4" strokeWidth={1.8} aria-hidden="true" />{lang === 'TR' ? 'Eriyen toplam' : 'Total burned'}: {formatTokenAmountFromRaw(decayedTotal, tradeTokenDecimals)} {asset}</p>
                  </>
                );
              })()}
            </div>
          )}

          {(() => {
            // [TR] Önce görülmesi gereken: alıcı için satıcının ödeme bilgileri (nereye ödeyeceği).
            // [EN] Must-see-first: for the taker, the maker's payment details (where to pay).
            const showTakerPii = isTaker && ['LOCKED', 'PAID'].includes(roomState);
            const beforeActions = showTakerPii ? (
              <div className="mb-3 border border-borderSubtle rounded-xl overflow-hidden bg-surface p-1">
                <PIIDisplay tradeId={activeTrade?.id} lang={lang} getSafeTelegramUrl={getSafeTelegramUrl} authenticatedFetch={authenticatedFetch} />
              </div>
            ) : null;

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

            return (
              <TradeRoomPage decisionInput={tradeDecisionInput} actionCallbacks={tradeActionCallbacks} beforeActions={beforeActions} primaryInput={primaryInput}>
                {/* [TR] Uzlaşma kartı yalnız itiraz aşamasında anlamlı; diğer durumlarda "kullanılamaz" kutusu gürültüydü. */}
                {roomState === 'CHALLENGED' && (
                  <div className="mb-3">
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
                    />
                  </div>
                )}

                {/* [TR] İptal teklifi durumu: bekleyen teklif veya karşı tarafın teklifine yanıt. Teklif butonu "Diğer seçenekler"de. */}
                {['LOCKED', 'PAID', 'CHALLENGED'].includes(roomState) && cancelStatus === 'proposed_by_me' && (
                  <div className="mb-3 py-3 px-4 bg-warning/10 border border-warning/30 rounded-xl flex items-center gap-3">
                    <div className="w-4 h-4 border-2 border-warning border-t-transparent rounded-full animate-spin shrink-0"></div>
                    <span className="text-sm font-semibold text-textPrimary">{lang === 'TR' ? 'İptal teklifiniz gönderildi; karşı taraf bekleniyor.' : 'Cancel proposed; waiting for the counterparty.'}</span>
                  </div>
                )}
                {['LOCKED', 'PAID', 'CHALLENGED'].includes(roomState) && cancelStatus === 'proposed_by_other' && (
                  <div className="mb-3 p-4 bg-warning/10 border border-warning/30 rounded-xl">
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
        className={`h-10 min-w-0 flex-1 basis-0 rounded-xl transition-all relative flex flex-col items-center justify-center gap-0.5 leading-none ${active ? `bg-elevated ${activeClass}` : 'text-textMuted'}`}
      >
        <Icon className="w-5 h-5" strokeWidth={1.8} aria-hidden="true" />
        <span className="text-[9px] font-semibold truncate max-w-full">{label}</span>
        {dot && <span className={`absolute top-0.5 right-2 w-2 h-2 border border-shell rounded-full ${dot}`}></span>}
      </button>
    );
    const tr = lang === 'TR';
    const signedIn = isConnected && isAuthenticated;
    return (
      <div className="md:hidden fixed inset-x-0 bottom-0 box-border h-[calc(4rem_+_env(safe-area-inset-bottom))] max-w-full bg-shell border-t border-borderSubtle z-[45] flex items-center justify-around gap-0 overflow-hidden px-[calc(0.25rem_+_env(safe-area-inset-left))] pr-[calc(0.25rem_+_env(safe-area-inset-right))] pb-[env(safe-area-inset-bottom)] shadow-[0_-10px_30px_rgba(0,0,0,0.12)]">
        {item({ key: 'home', icon: House, label: tr ? 'Ana' : 'Home', active: currentView === 'home', onClick: () => setCurrentView('home') })}
        {item({ key: 'market', icon: Store, label: tr ? 'Pazar' : 'Market', active: currentView === 'market', onClick: () => setCurrentView('market') })}
        {item({ key: 'trade', icon: Briefcase, label: tr ? 'İşlem' : 'Trade', active: currentView === 'tradeRoom', activeClass: 'text-warning', onClick: () => setCurrentView('tradeRoom'), dot: activeEscrows.length > 0 ? 'bg-orange-500 animate-pulse' : null })}
        {item({ key: 'ops', icon: Radar, label: tr ? 'Takip' : 'Track', active: currentView === 'operations', activeClass: 'text-info', onClick: () => setCurrentView('operations') })}
        {/* [TR] Mobil admin girişi authenticated kullanıcıya açık kalır; backend nihai otoritedir.
            [EN] Mobile admin entry remains reachable for authenticated users; backend is authoritative. */}
        {canSeeAdminEntry && item({ key: 'admin', icon: Compass, label: 'Admin', active: currentView === 'admin', activeClass: 'text-success', onClick: () => setCurrentView('admin') })}
        {item({ key: 'profile', icon: UserRound, label: tr ? 'Profil' : 'Profile', active: currentView === 'profile', activeClass: 'text-success', onClick: () => setCurrentView('profile') })}
        {item({ key: 'menu', icon: Menu, label: tr ? 'Menü' : 'Menu', active: sidebarOpen, onClick: toggleSidebar })}
        {item({ key: 'wallet', icon: Wallet, label: signedIn ? (tr ? 'Bağlı' : 'Linked') : (tr ? 'Bağlan' : 'Connect'), active: false, onClick: handleAuthAction, dot: signedIn ? 'bg-success' : null })}
      </div>
    );
  };


  const renderProfileContext = () => (
    <ProfileContextPage
      lang={lang}
      onConnect={handleAuthAction}
      address={address}
      formatAddress={formatAddress}
      isConnected={isConnected}
      isAuthenticated={isAuthenticated}
      payoutProfileDraft={ctx.payoutProfileDraft}
      setPayoutProfileDraft={ctx.setPayoutProfileDraft}
      handleUpdatePII={ctx.handleUpdatePII}
      userReputation={userReputation}
      myOrders={ctx.myOrders || []}
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
      tradeHistory={ctx.tradeHistory || []}
      mapResolutionTypeLabel={mapResolutionTypeLabel}
      handleLogoutAndDisconnect={ctx.handleLogoutAndDisconnect}
      canonicalizePayoutProfileDraft={ctx.canonicalizePayoutProfileDraft}
      SEPA_COUNTRIES={ctx.SEPA_COUNTRIES}
      isContractLoading={isContractLoading}
      tokenDecimalsMap={tokenDecimalsMap}
      showToast={showToast}
    />
  );

  const renderFooter = () => (
    <footer className="w-full max-w-[1200px] px-4 md:px-8 pb-6 md:pb-8 mt-2">
      <div className="border border-borderSubtle bg-surface rounded-2xl px-4 py-4 md:px-6 md:py-5 flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
        <div>
          <p className="text-sm font-semibold text-textPrimary">Araf © 2026</p>
          <p className="text-xs text-textMuted">
            {lang === 'TR' ? 'Hakem değil, oyun teorisi. Karar mercii kontrat.' : 'No arbitrator, only game theory. Final authority is the contract.'}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <a href={socialLinks.github} target="_blank" rel="noreferrer" className="px-3 py-2 rounded-xl bg-elevated border border-borderStrong text-xs font-semibold text-textSecondary hover:text-textPrimary hover:border-borderStrong transition">GitHub</a>
          <a href={socialLinks.twitter} target="_blank" rel="noreferrer" className="px-3 py-2 rounded-xl bg-elevated border border-borderStrong text-xs font-semibold text-textSecondary hover:text-textPrimary hover:border-borderStrong transition">Twitter</a>
          <a href={socialLinks.farcaster} target="_blank" rel="noreferrer" className="px-3 py-2 rounded-xl bg-elevated border border-borderStrong text-xs font-semibold text-textSecondary hover:text-textPrimary hover:border-borderStrong transition">Farcaster</a>
        </div>
      </div>
    </footer>
  );


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
    renderContextSidebar,
    renderMobileNav,
    renderFooter,
  };
};
