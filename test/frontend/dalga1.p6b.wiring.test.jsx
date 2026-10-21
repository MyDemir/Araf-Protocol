import React from 'react';
import { afterEach, describe, it, expect, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { buildAppViews } from '../../frontend/src/app/AppViews';

afterEach(() => { cleanup(); });

const baseCtx = {
  lang: 'EN',
  setLang: vi.fn(),
  isConnected: true,
  isAuthenticated: true,
  hasPayoutProfile: true,
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

describe('AppViews pazar sayfalama baglantisi (P6b)', () => {
  it('hasMore true iken "Load more" gorunur ve tiklaninca loadMoreMarketOrders cagrilir', () => {
    const loadMoreMarketOrders = vi.fn();
    const views = buildAppViews({ ...baseCtx, marketHasMore: true, marketLoadingMore: false, marketLoadMoreError: null, loadMoreMarketOrders });
    render(<div>{views.renderMarket()}</div>);
    fireEvent.click(screen.getByRole('button', { name: 'Load more' }));
    expect(loadMoreMarketOrders).toHaveBeenCalledTimes(1);
  });

  it('TR dilinde "Daha fazla yükle" gorunur', () => {
    const views = buildAppViews({ ...baseCtx, lang: 'TR', marketHasMore: true, loadMoreMarketOrders: vi.fn() });
    render(<div>{views.renderMarket()}</div>);
    expect(screen.getByRole('button', { name: 'Daha fazla yükle' })).toBeTruthy();
  });

  it('hasMore false iken dugme yok', () => {
    const views = buildAppViews({ ...baseCtx, marketHasMore: false, loadMoreMarketOrders: vi.fn() });
    render(<div>{views.renderMarket()}</div>);
    expect(screen.queryByRole('button', { name: 'Load more' })).toBeNull();
  });
});
