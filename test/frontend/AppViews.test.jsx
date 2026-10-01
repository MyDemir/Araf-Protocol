import React from 'react';
import { afterEach, describe, it, expect, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { buildAppViews } from '../../frontend/src/app/AppViews';

afterEach(() => cleanup());

const baseCtx = {
  lang: 'EN',
  setLang: vi.fn(),
  isConnected: true,
  isAuthenticated: true,
  isLoggingIn: false,
  isContractLoading: false,
  loadingText: '',
  isPaused: false,
  authChecked: true,
  currentView: 'market',
  setCurrentView: vi.fn(),
  toggleSidebar: vi.fn(),
  handleAuthAction: vi.fn(),
  formatAddress: (a) => a,
  address: '0xabc',
  chainId: 84532,
  sidebarOpen: false,
  setSidebarOpen: vi.fn(),
  setExpandedStatus: vi.fn(),
  expandedStatus: null,
  marketFilters: { side: 'ALL', token: 'ALL', amount: '', fiat: 'ALL', tier: 'ALL', sort: 'AUTO', hideOwn: false },
  setMarketFilter: vi.fn(),
  resetMarketFilters: vi.fn(),
  filteredOrders: [],
  orders: [],
  activeEscrows: [],
  loading: false,
  SUPPORTED_TOKEN_ADDRESSES: { USDT: '0x1', USDC: '0x2' },
  handleStartTrade: vi.fn(),
  handleMint: vi.fn(),
  isFaucetEnabled: true,
  isSupportedChainId: () => true,
  handleOpenMakerModal: vi.fn(),
  activeEscrowCounts: { LOCKED: 0, PAID: 0, CHALLENGED: 0 },
  setShowProfileModal: vi.fn(),
  setProfileTab: vi.fn(),
  setShowFeedbackModal: vi.fn(),
  protocolStats: {},
  statsLoading: false,
  statsError: false,
  fetchStats: vi.fn(),
  StatChange: () => null,
  userReputation: { effectiveTier: 3 },
  sybilStatus: { funded: true, cooldownOk: true, cooldownRemaining: 0 },
  walletAgeRemainingDays: null,
  takerFeeBps: 10,
  activeTrade: null,
  setActiveTrade: vi.fn(),
  userRole: 'taker',
  setUserRole: vi.fn(),
  tradeState: 'LOCKED',
  setTradeState: vi.fn(),
  resolvedTradeState: 'LOCKED',
  setCancelStatus: vi.fn(),
  setChargebackAccepted: vi.fn(),
  paymentIpfsHash: '',
  setPaymentIpfsHash: vi.fn(),
  handleFileUpload: vi.fn(),
  handleReportPayment: vi.fn(),
  handleProposeCancel: vi.fn(),
  cancelStatus: null,
  chargebackAccepted: false,
  handleChargebackAck: vi.fn(),
  handleRelease: vi.fn(),
  handleChallenge: vi.fn(),
  handlePingMaker: vi.fn(),
  handleAutoRelease: vi.fn(),
  canMakerPing: false,
  tradeTimers: {},
  canMakerStartChallengeFlow: false,
  canMakerChallenge: false,
  bleedingAmounts: null,
  takerName: '',
  tokenDecimalsMap: { USDT: 6 },
  formatTokenAmountFromRaw: () => '0',
  rawTokenToDisplayNumber: () => 0,
  fetchMyTrades: vi.fn(),
  setIsContractLoading: vi.fn(),
  authenticatedFetch: vi.fn(),
  showToast: vi.fn(),
};

describe('AppViews market side-aware rendering', () => {
  it('security_prod_mode_hides_test_faucet_buttons', () => {
    const views = buildAppViews({
      ...baseCtx,
      isFaucetEnabled: false,
    });

    render(<div>{views.renderMarket()}</div>);
    expect(screen.queryByText(/Get Test USDT|Test USDT Al/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/Get Test USDC|Test USDC Al/i)).not.toBeInTheDocument();
  });

  it('shows the admin entry for authenticated users when the server flags them as admin', () => {
    const views = buildAppViews({ ...baseCtx, isConnected: true, isAuthenticated: true, isAdmin: true });
    render(<div>{views.renderSlimRail()}</div>);
    expect(screen.getByTitle(/Admin Panel/)).toBeInTheDocument();
  });

  it('keeps UI Lab out of product navigation even when enabled', () => {
    const views = buildAppViews({
      ...baseCtx,
      uiLabEnabled: true,
    });

    const desktop = render(<div>{views.renderSlimRail()}</div>);
    expect(screen.queryByTitle('UI Lab')).not.toBeInTheDocument();
    desktop.unmount();

    render(<div>{views.renderMobileNav()}</div>);
    expect(screen.queryByLabelText('UI Lab')).not.toBeInTheDocument();
  });

  it('renders side badge and side CTA labels', () => {
    const views = buildAppViews({
      ...baseCtx,
      filteredOrders: [
        {
          id: '1',
          side: 'SELL_CRYPTO',
          sideLabel: 'Sell Order',
          ctaLabel: 'Buy',
          statusLabel: 'Open',
          bondLabel: '8%',
          maker: '0xmaker',
          makerFull: '0xmaker',
          rate: 33,
          fiat: 'TRY',
          crypto: 'USDT',
          minFillAmount: 10,
          limitLabel: 'Min Fill 10 USDT • Remaining 50 USDT',
          tier: 1,
          ownerSideHint: 'Order owner is selling crypto',
          trustSummary: {
            available: true,
            band: 'YELLOW',
            label: 'Medium Signal',
            chipClass: 'text-warning border-warning/40 bg-warning/10',
          },
          paymentRiskSignal: {
            riskLevel: 'MEDIUM',
            enabled: true,
            minBondSurchargeBps: 0,
            feeSurchargeBps: 0,
            warningKey: 'BANK_TRANSFER_CONFIRMATION_REQUIRED',
            description: { EN: 'x', TR: 'y' },
          },
          tokenPolicy: { supported: true, allowSellOrders: true, allowBuyOrders: true },
        },
        {
          id: '2',
          side: 'BUY_CRYPTO',
          sideLabel: 'Buy Order',
          ctaLabel: 'Sell',
          statusLabel: 'Open',
          bondLabel: '10%',
          maker: '0xowner',
          makerFull: '0xowner',
          rate: 34,
          fiat: 'TRY',
          crypto: 'USDT',
          minFillAmount: 5,
          limitLabel: 'Min Fill 5 USDT • Remaining 20 USDT',
          tier: 1,
          ownerSideHint: 'Order owner is buying crypto',
          trustSummary: {
            available: false,
            band: null,
            label: 'Signal unavailable',
            chipClass: 'text-textSecondary border-borderSubtle bg-elevated',
          },
          paymentRiskSignal: null,
          tokenPolicy: { supported: true, allowSellOrders: true, allowBuyOrders: true },
        },
      ],
      orders: [{ crypto: 'USDT' }],
    });

    render(<div>{views.renderMarket()}</div>);

    expect(screen.getAllByText('Sell Order').length).toBeGreaterThan(0);
    expect(screen.getAllByText('Buy Order').length).toBeGreaterThan(0);
    expect(screen.getByRole('button', { name: /Buy/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Sell/i })).toBeInTheDocument();
    expect(screen.getAllByText('ORDER OWNER SUMMARY').length).toBeGreaterThan(0);
    expect(screen.getByText('Order owner is selling crypto')).toBeInTheDocument();
    expect(screen.getByText('Order owner is buying crypto')).toBeInTheDocument();
    expect(screen.getAllByText(/Trust Visibility|Güven Görünürlüğü/i).length).toBeGreaterThan(0);
    expect(screen.getByText(/YELLOW · Medium Signal/i)).toBeInTheDocument();
    expect(screen.getByText(/Signal unavailable/i)).toBeInTheDocument();
    expect(screen.queryByText(/maker_profile_changed_after_lock/i)).not.toBeInTheDocument();
    expect(screen.queryByText('SELLER PROFILE')).not.toBeInTheDocument();
    expect(screen.getAllByText('Open').length).toBeGreaterThan(0);
    expect(screen.getAllByText(/Bond/i).length).toBeGreaterThan(0);
    expect(screen.getAllByText(/Payment complexity/i).length).toBe(1);
    expect(screen.getByText('Medium')).toBeInTheDocument();
    expect(screen.queryByText(/minBondSurchargeBps/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/feeSurchargeBps/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/warningKey/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/BANK_TRANSFER_CONFIRMATION_REQUIRED/i)).not.toBeInTheDocument();
  });


  it('renders dictionary order-side labels when market cards receive raw enums without display fields', () => {
    const views = buildAppViews({
      ...baseCtx,
      filteredOrders: [
        {
          id: 'raw-sell',
          side: 'SELL_CRYPTO',
          statusLabel: 'Open',
          bondLabel: '8%',
          maker: '0xmaker',
          makerFull: '0xmaker',
          rate: 33,
          fiat: 'TRY',
          crypto: 'USDT',
          minFillAmount: 10,
          limitLabel: 'Min Fill 10 USDT • Remaining 50 USDT',
          tier: 1,
          trustSummary: { available: false, band: null, label: 'Signal unavailable', chipClass: 'text-slate-400' },
          paymentRiskSignal: null,
          tokenPolicy: { supported: true, allowSellOrders: true, allowBuyOrders: true },
        },
        {
          id: 'raw-buy',
          side: 'BUY_CRYPTO',
          statusLabel: 'Open',
          bondLabel: '10%',
          maker: '0xbuyer',
          makerFull: '0xbuyer',
          rate: 34,
          fiat: 'TRY',
          crypto: 'USDT',
          minFillAmount: 5,
          limitLabel: 'Min Fill 5 USDT • Remaining 20 USDT',
          tier: 1,
          trustSummary: { available: false, band: null, label: 'Signal unavailable', chipClass: 'text-slate-400' },
          paymentRiskSignal: null,
          tokenPolicy: { supported: true, allowSellOrders: true, allowBuyOrders: true },
        },
      ],
      orders: [{ crypto: 'USDT' }],
    });

    render(<div>{views.renderMarket()}</div>);

    expect(screen.getAllByText('Sell Order').length).toBeGreaterThan(0);
    expect(screen.getAllByText('Buy Order').length).toBeGreaterThan(0);
    expect(screen.queryByText('SELL_CRYPTO')).not.toBeInTheDocument();
    expect(screen.queryByText('BUY_CRYPTO')).not.toBeInTheDocument();
  });


  it('shows the real challenged count in the sidebar status badge without hiding it behind Araf copy', () => {
    const views = buildAppViews({
      ...baseCtx,
      sidebarOpen: true,
      expandedStatus: 'CHALLENGED',
      activeEscrowCounts: { LOCKED: 1, PAID: 2, CHALLENGED: 3, settlement: {} },
      activeEscrows: [
        { id: '#c1', state: 'CHALLENGED', role: 'maker', counterparty: '0x1111...1111', amount: '1 USDT', rawTrade: {} },
        { id: '#c2', state: 'CHALLENGED', role: 'taker', counterparty: '0x2222...2222', amount: '2 USDT', rawTrade: {} },
        { id: '#c3', state: 'CHALLENGED', role: 'maker', counterparty: '0x3333...3333', amount: '3 USDT', rawTrade: {} },
      ],
    });

    const { container } = render(<div>{views.renderContextSidebar()}</div>);
    const challengedButton = screen.getByRole('button', { name: /Challenge Phase 3/i });
    expect(challengedButton).toBeInTheDocument();
    expect(within(challengedButton).getByText('3')).toBeInTheDocument();
    expect(container).not.toHaveTextContent(/\bAraf\b/);
  });


  it('toggles the desktop sidebar open and closed from the rail filter button', async () => {
    const user = userEvent.setup();

    const SidebarHarness = () => {
      const [sidebarOpen, setSidebarOpen] = React.useState(false);
      const views = buildAppViews({
        ...baseCtx,
        sidebarOpen,
        toggleSidebar: () => setSidebarOpen(prev => !prev),
        setSidebarOpen,
        activeEscrows: [],
      });
      return <div>{views.renderSlimRail()}{views.renderContextSidebar()}</div>;
    };

    const { container } = render(<SidebarHarness />);
    const filtersButton = within(container).getByTitle('Filters');

    expect(container.querySelector('[class*="w-0"][class*="opacity-0"]')).not.toBeNull();
    await user.click(filtersButton);
    expect(container.querySelector('[class*="w-[280px]"][class*="opacity-100"]')).not.toBeNull();
    await user.click(filtersButton);
    expect(container.querySelector('[class*="w-0"][class*="opacity-0"]')).not.toBeNull();
  });


  it('keeps an explicit sidebar close path when the contextual sidebar is open', async () => {
    const user = userEvent.setup();
    const setSidebarOpen = vi.fn();
    const views = buildAppViews({
      ...baseCtx,
      sidebarOpen: true,
      setSidebarOpen,
      activeEscrows: [],
    });

    const { container } = render(<div>{views.renderContextSidebar()}</div>);
    const mobileOverlay = container.querySelector('[class*="md:hidden"][class*="inset-0"]');

    expect(mobileOverlay).not.toBeNull();
    await user.click(mobileOverlay);
    expect(setSidebarOpen).toHaveBeenCalledWith(false);
  });


  it('keeps mobile navigation controls touch-sized and scoped to semantic shell colors', () => {
    const views = buildAppViews({
      ...baseCtx,
      currentView: 'market',
      activeEscrows: [{ id: 'active-1' }],
    });

    const { container } = render(<div>{views.renderMobileNav()}</div>);
    const mobileNav = container.querySelector('.bg-shell.border-t.border-borderSubtle');
    expect(mobileNav).not.toBeNull();
    expect(mobileNav.className).not.toContain('overflow-x-auto');
    expect(mobileNav.className).toContain('overflow-hidden');

    const buttons = within(mobileNav).getAllByRole('button');
    expect(buttons.length).toBeGreaterThan(0);
    buttons.forEach((button) => {
      expect(button.className).toContain('h-10');
      expect(button.className).toContain('min-w-0');
      expect(button.className).toContain('flex-1');
      expect(button.className).toContain('basis-0');
      expect(button.className).not.toContain('shrink-0');
    });
  });

  it('shows explicit empty-state instead of broken trade room when activeTrade is missing', async () => {
    const user = userEvent.setup();
    const setCurrentView = vi.fn();
    const fetchMyTrades = vi.fn();
    const views = buildAppViews({
      ...baseCtx,
      currentView: 'tradeRoom',
      activeTrade: null,
      setCurrentView,
      fetchMyTrades,
    });

    render(<div>{views.renderTradeRoom()}</div>);

    expect(screen.getByText(/No active trade found/i)).toBeInTheDocument();
    expect(screen.queryByText(/0.00/)).not.toBeInTheDocument();
    expect(screen.queryByText(/^COUNTERPARTY$/i)).not.toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: /Go to Marketplace/i }));
    expect(setCurrentView).toHaveBeenCalledWith('market');
  });


  it('renders passive trade decision disabled reasons with the real chain policy and a disabled panel report button', () => {
    const views = buildAppViews({
      ...baseCtx,
      currentView: 'tradeRoom',
      activeTrade: { id: 'trade-1', onchainId: 1, max: 100, fiat: 'TRY', crypto: 'USDT', rate: 10, maker: '0xmaker' },
      resolvedTradeState: 'LOCKED',
      tradeState: 'LOCKED',
      userRole: 'taker',
      paymentIpfsHash: '',
      chargebackAccepted: false,
      isSupportedChainId: () => false,
      tradeTimers: { gracePeriod: { isFinished: false, days: 0, hours: 1, minutes: 2, seconds: 3 } },
    });

    render(<div>{views.renderTradeRoom()}</div>);

    expect(screen.getAllByText('Unsupported network.').length).toBeGreaterThan(0);
    expect(screen.getAllByText(/Payment proof is required\./).length).toBeGreaterThan(0);
    expect(screen.queryByText(/Chargeback acknowledgement is required/)).not.toBeInTheDocument();
    // [TR] LOCKED'da onay (grace) sayacı karar etkilemez; gösterilmez.
    expect(screen.queryByText('01h 02m 03s')).not.toBeInTheDocument();
    const primaryGuidance = screen.getByTestId('trade-primary-guidance');
    expect(within(primaryGuidance).getByRole('button', { name: /Report Payment/i })).toBeDisabled();
    // [TR] Regresyon: aynı aksiyon yalnız bir kez gösterilir (eski panel kopya butonu kaldırıldı).
    expect(screen.getAllByRole('button', { name: /Report Payment/i })).toHaveLength(1);
  });



  it('wires executable guidance panel callbacks without using settlement functions', async () => {
    const user = userEvent.setup();
    const handleReportPayment = vi.fn();
    const proposeSettlement = vi.fn();
    const acceptSettlement = vi.fn();
    const rejectSettlement = vi.fn();
    const withdrawSettlement = vi.fn();
    const expireSettlement = vi.fn();
    const views = buildAppViews({
      ...baseCtx,
      currentView: 'tradeRoom',
      activeTrade: { id: 'trade-5', onchainId: 5, max: 100, fiat: 'TRY', crypto: 'USDT', rate: 10, maker: '0xmaker' },
      resolvedTradeState: 'LOCKED',
      tradeState: 'LOCKED',
      userRole: 'taker',
      paymentIpfsHash: 'proof-hash',
      chargebackAccepted: false,
      handleReportPayment,
      proposeSettlement,
      acceptSettlement,
      rejectSettlement,
      withdrawSettlement,
      expireSettlement,
    });

    render(<div>{views.renderTradeRoom()}</div>);
    await user.click(within(screen.getByTestId('trade-primary-guidance')).getByRole('button', { name: /Report Payment/i }));

    expect(handleReportPayment).toHaveBeenCalledTimes(1);
    expect(proposeSettlement).not.toHaveBeenCalled();
    expect(acceptSettlement).not.toHaveBeenCalled();
    expect(rejectSettlement).not.toHaveBeenCalled();
    expect(withdrawSettlement).not.toHaveBeenCalled();
    expect(expireSettlement).not.toHaveBeenCalled();
  });

  it('disables every executable guidance button on the wrong chain', () => {
    const views = buildAppViews({
      ...baseCtx,
      currentView: 'tradeRoom',
      activeTrade: { id: 'trade-3', onchainId: 3, max: 100, fiat: 'TRY', crypto: 'USDT', rate: 10, maker: '0xmaker' },
      resolvedTradeState: 'PAID',
      tradeState: 'PAID',
      userRole: 'maker',
      chargebackAccepted: true,
      canMakerStartChallengeFlow: true,
      isSupportedChainId: () => false,
    });

    render(<div>{views.renderTradeRoom()}</div>);

    const panelButtons = [
      ...within(screen.getByTestId('trade-primary-guidance')).getAllByRole('button'),
      ...within(screen.getByTestId('trade-secondary-guidance')).getAllByRole('button'),
    ];
    expect(panelButtons.length).toBeGreaterThan(0);
    panelButtons.forEach((button) => expect(button).toBeDisabled());
    expect(screen.getAllByText('Unsupported network.').length).toBeGreaterThan(0);
  });


  it('keeps maker release blocked by chargeback acknowledgement in PAID state', () => {
    const views = buildAppViews({
      ...baseCtx,
      currentView: 'tradeRoom',
      activeTrade: { id: 'trade-release', onchainId: 44, max: 100, fiat: 'TRY', crypto: 'USDT', rate: 10, maker: '0xmaker' },
      resolvedTradeState: 'PAID',
      tradeState: 'PAID',
      userRole: 'maker',
      chargebackAccepted: false,
      canMakerStartChallengeFlow: true,
      isSupportedChainId: () => true,
    });

    render(<div>{views.renderTradeRoom()}</div>);

    const primaryGuidance = screen.getByTestId('trade-primary-guidance');
    expect(within(primaryGuidance).getByRole('button', { name: /Release Funds/i })).toBeDisabled();
    expect(screen.getAllByText('Chargeback acknowledgement is required.').length).toBeGreaterThan(0);
  });

  it('disables executable guidance buttons when on-chain trade ID is missing', () => {
    const views = buildAppViews({
      ...baseCtx,
      currentView: 'tradeRoom',
      activeTrade: { id: 'trade-4', max: 100, fiat: 'TRY', crypto: 'USDT', rate: 10, maker: '0xmaker' },
      resolvedTradeState: 'LOCKED',
      tradeState: 'LOCKED',
      userRole: 'taker',
      paymentIpfsHash: 'proof-hash',
      chargebackAccepted: true,
    });

    render(<div>{views.renderTradeRoom()}</div>);

    const primaryGuidance = screen.getByTestId('trade-primary-guidance');
    expect(within(primaryGuidance).getByRole('button', { name: /Report Payment/i })).toBeDisabled();
    expect(screen.getAllByText('Missing on-chain trade ID.').length).toBeGreaterThan(0);
  });

  it('renders CHALLENGED passive settlement guidance without introducing settlement action buttons', () => {
    const proposeSettlement = vi.fn();
    const acceptSettlement = vi.fn();
    const rejectSettlement = vi.fn();
    const withdrawSettlement = vi.fn();
    const expireSettlement = vi.fn();
    const views = buildAppViews({
      ...baseCtx,
      currentView: 'tradeRoom',
      activeTrade: { id: 'trade-2', onchainId: 2, max: 100, fiat: 'TRY', crypto: 'USDT', rate: 10, maker: '0xmaker' },
      resolvedTradeState: 'CHALLENGED',
      tradeState: 'CHALLENGED',
      userRole: 'maker',
      proposeSettlement,
      acceptSettlement,
      rejectSettlement,
      withdrawSettlement,
      expireSettlement,
    });

    render(<div>{views.renderTradeRoom()}</div>);

    expect(screen.getByText(/Araf does not decide/i)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /settlement guidance/i })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /propose settlement|accept settlement|reject settlement|withdraw settlement|expire settlement/i })).not.toBeInTheDocument();
    expect(proposeSettlement).not.toHaveBeenCalled();
    expect(acceptSettlement).not.toHaveBeenCalled();
    expect(rejectSettlement).not.toHaveBeenCalled();
    expect(withdrawSettlement).not.toHaveBeenCalled();
    expect(expireSettlement).not.toHaveBeenCalled();
  });

  it('does not render payment complexity badge when all orders have null paymentRiskSignal', () => {
    const views = buildAppViews({
      ...baseCtx,
      filteredOrders: [
        {
          id: '1',
          side: 'SELL_CRYPTO',
          sideLabel: 'Sell Order',
          ctaLabel: 'Buy',
          statusLabel: 'Open',
          bondLabel: '8%',
          maker: '0xmaker',
          makerFull: '0xmaker',
          rate: 33,
          fiat: 'TRY',
          crypto: 'USDT',
          minFillAmount: 10,
          limitLabel: 'Min Fill 10 USDT • Remaining 50 USDT',
          tier: 1,
          ownerSideHint: 'Order owner is selling crypto',
          trustSummary: { available: false, band: null, label: 'Signal unavailable', chipClass: 'text-slate-400' },
          paymentRiskSignal: null,
          tokenPolicy: { supported: true, allowSellOrders: true, allowBuyOrders: true },
        },
      ],
      orders: [{ crypto: 'USDT' }],
    });

    render(<div>{views.renderMarket()}</div>);
    expect(screen.queryAllByText(/Payment complexity/i)).toHaveLength(0);
  });

  it('hides session-only navigation until the wallet is connected and signed in', () => {
    const signedOut = buildAppViews({ ...baseCtx, isConnected: false, isAuthenticated: false });
    const rail = render(<div>{signedOut.renderSlimRail()}</div>);
    expect(screen.queryByTitle('Trade Room')).not.toBeInTheDocument();
    expect(screen.queryByTitle('Operations Center')).not.toBeInTheDocument();
    expect(screen.queryByTitle('Profile Center')).not.toBeInTheDocument();
    expect(screen.queryByTitle('Trade History')).not.toBeInTheDocument();
    expect(screen.getByTitle('Marketplace')).toBeInTheDocument();
    rail.unmount();
    const mobile = render(<div>{signedOut.renderMobileNav()}</div>);
    expect(screen.queryByLabelText('Trade')).not.toBeInTheDocument();
    expect(screen.queryByLabelText('Track')).not.toBeInTheDocument();
    expect(screen.queryByLabelText('Profile')).not.toBeInTheDocument();
    expect(screen.getByLabelText('Connect')).toBeInTheDocument();
    mobile.unmount();

    const signedIn = buildAppViews({ ...baseCtx, isConnected: true, isAuthenticated: true });
    render(<div>{signedIn.renderMobileNav()}</div>);
    expect(screen.getByLabelText('Trade')).toBeInTheDocument();
    expect(screen.getByLabelText('Track')).toBeInTheDocument();
    expect(screen.getByLabelText('Profile')).toBeInTheDocument();
  });

  it('drawer shows a sign-in card instead of trade sections when signed out', () => {
    const views = buildAppViews({ ...baseCtx, isConnected: false, isAuthenticated: false, sidebarOpen: true });
    render(<div>{views.renderContextSidebar()}</div>);
    expect(screen.getByTestId('drawer-signin-card')).toBeInTheDocument();
    expect(screen.queryByText('MY TRADES')).not.toBeInTheDocument();
    // Create order does nothing without a session, so it is not offered in the drawer.
    expect(screen.queryByRole('button', { name: /Create order/ })).not.toBeInTheDocument();
  });

  it('drawer keeps the full screen toggle even when an install prompt is available', () => {
    const toggle = vi.fn();
    const views = buildAppViews({ ...baseCtx, sidebarOpen: true, fullscreen: { isStandalone: false, supported: true, isFullscreen: true, canInstall: true, toggle, install: vi.fn() } });
    render(<div>{views.renderContextSidebar()}</div>);
    fireEvent.click(screen.getByRole('button', { name: 'Exit full screen' }));
    expect(toggle).toHaveBeenCalled();
    expect(screen.getByRole('button', { name: 'Install app' })).toBeInTheDocument();
  });

  it('market filter bar wires fiat, tier, sort, amount and hide-mine to setMarketFilter', () => {
    const setMarketFilter = vi.fn();
    const views = buildAppViews({ ...baseCtx, address: '0x' + '1'.repeat(40), isAuthenticated: true, userReputation: { effectiveTier: 2 }, setMarketFilter });
    render(<div>{views.renderMarket()}</div>);
    fireEvent.change(screen.getByLabelText('Currency'), { target: { value: 'TRY' } });
    fireEvent.change(screen.getByLabelText('Bond'), { target: { value: 'ELIGIBLE' } });
    fireEvent.change(screen.getByLabelText('Sort'), { target: { value: 'NEWEST' } });
    fireEvent.change(screen.getByLabelText('Trade amount'), { target: { value: '250' } });
    fireEvent.click(screen.getByRole('button', { name: 'Hide mine' }));
    expect(setMarketFilter.mock.calls).toEqual([['fiat', 'TRY'], ['tier', 'ELIGIBLE'], ['sort', 'NEWEST'], ['amount', '250'], ['hideOwn', true]]);
    expect(screen.getByRole('option', { name: 'I can take (≤ T2)' })).not.toBeDisabled();
    // Without a side "best rate" is ambiguous, so the sort list starts at largest amount.
    expect(screen.queryByRole('option', { name: 'Best rate' })).not.toBeInTheDocument();
  });

  it('market filter bar shows the active filter count, reset and the server total', () => {
    const resetMarketFilters = vi.fn();
    const views = buildAppViews({
      ...baseCtx,
      isAuthenticated: false,
      marketFilters: { ...baseCtx.marketFilters, side: 'BUY', fiat: 'TRY', tier: 'NO_BOND' },
      resetMarketFilters,
      marketOrdersTotal: 120,
      filteredOrders: [{ id: '1', side: 'SELL_CRYPTO', crypto: 'USDT', tier: 0, fiat: 'TRY', rate: 40, remainingAmount: 10, minFillAmount: 1, maker: '0x12…34', makerFull: '0x' + '3'.repeat(40) }],
    });
    render(<div>{views.renderMarket()}</div>);
    expect(screen.getByText('1 order · 120 total')).toBeInTheDocument();
    expect(screen.getByRole('option', { name: 'Best rate' })).toBeInTheDocument();
    expect(screen.getByRole('option', { name: /sign in/ })).toBeDisabled();
    fireEvent.click(screen.getByRole('button', { name: 'Clear filters (2)' }));
    expect(resetMarketFilters).toHaveBeenCalled();
  });

  it('empty filtered market offers a reset instead of "no orders yet"', () => {
    const views = buildAppViews({ ...baseCtx, marketFilters: { ...baseCtx.marketFilters, fiat: 'EUR' }, filteredOrders: [] });
    render(<div>{views.renderMarket()}</div>);
    expect(screen.getByText('No orders match this filter.')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Clear filters' })).toBeInTheDocument();
  });
});

describe('item 6: SELL fill button and the order owner ban (K6)', () => {
  const sellOrder = (extra = {}) => ({
    id: 's1', onchainId: 1, side: 'SELL_CRYPTO', crypto: 'USDT', tier: 0, fiat: 'TRY', rate: 40,
    remainingAmount: 10, minFillAmount: 1, maker: '0x12…34', makerFull: '0x' + '3'.repeat(40), ...extra,
  });
  const farFuture = Math.floor(Date.now() / 1000) + 86400;

  it('disables the CTA with "Seller restricted" when the owner ban is known', () => {
    const views = buildAppViews({ ...baseCtx, filteredOrders: [sellOrder({ ownerBannedUntil: farFuture })] });
    render(<div>{views.renderMarket()}</div>);
    expect(screen.getByRole('button', { name: /Seller restricted/ })).toBeDisabled();
  });

  it('keeps the CTA enabled when the owner ban is unknown (null) or already over', () => {
    for (const ownerBannedUntil of [null, undefined, 5]) {
      cleanup();
      const views = buildAppViews({ ...baseCtx, filteredOrders: [sellOrder({ ownerBannedUntil })] });
      render(<div>{views.renderMarket()}</div>);
      expect(screen.queryByRole('button', { name: /Seller restricted/ })).not.toBeInTheDocument();
    }
  });
});

describe('item 9: trade room fee is unknown, not 0', () => {
  const trade = { id: 'trade-1', onchainId: 1, max: 100, fiat: 'TRY', crypto: 'USDT', rate: 10, maker: '0xmaker', makerFull: '0x' + '1'.repeat(40) };
  const roomCtx = (over) => ({ ...baseCtx, currentView: 'tradeRoom', resolvedTradeState: 'PAID', tradeState: 'PAID', userRole: 'maker', activeTrade: trade, ...over });

  it('shows "Fee unknown" when neither the trade snapshot nor the contract fee is readable', () => {
    render(<div>{buildAppViews(roomCtx({ takerFeeBps: null })).renderTradeRoom()}</div>);
    expect(screen.getByText(/Fee unknown/)).toBeInTheDocument();
  });

  it('shows the fee when the contract fee is known', () => {
    render(<div>{buildAppViews(roomCtx({ takerFeeBps: 10 })).renderTradeRoom()}</div>);
    expect(screen.queryByText(/Fee unknown/)).not.toBeInTheDocument();
    expect(screen.getByText(/Fee 0\.01/)).toBeInTheDocument();
  });
});
