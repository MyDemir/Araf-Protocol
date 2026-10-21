import React from 'react';
import { afterEach, describe, it, expect, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { buildAppViews } from '../../frontend/src/app/AppViews';
import { buildAppModals } from '../../frontend/src/app/AppModals';

afterEach(() => { cleanup(); vi.unstubAllEnvs(); });

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

const sellOrder = (extra = {}) => ({
  id: 's1', onchainId: 1, side: 'SELL_CRYPTO', crypto: 'USDT', tier: 0, fiat: 'TRY', rate: 40,
  remainingAmount: 10, minFillAmount: 1, maker: '0x12…34', makerFull: '0x' + '3'.repeat(40), ...extra,
});

describe('P20 F3-13: izleyicinin kendi bani CTA da gorunur', () => {
  it('ctx.isBanned iken CTA pasif ve "You are restricted" yazar', () => {
    const views = buildAppViews({ ...baseCtx, isBanned: true, filteredOrders: [sellOrder()] });
    render(<div>{views.renderMarket()}</div>);
    expect(screen.getByRole('button', { name: /You are restricted/ })).toBeDisabled();
  });
  it('ban yoksa CTA etiketi degismez', () => {
    const views = buildAppViews({ ...baseCtx, isBanned: false, filteredOrders: [sellOrder()] });
    render(<div>{views.renderMarket()}</div>);
    expect(screen.queryByRole('button', { name: /You are restricted/ })).not.toBeInTheDocument();
  });
});

describe('P20 F3-08: bilinmeyen ondalikta miktar 0 degil "—"', () => {
  const trade = { id: 't1', onchainId: 1, max: 100, fiat: 'TRY', crypto: 'WEIRD', rate: 10, maker: '0xm', makerFull: '0x' + '1'.repeat(40), cryptoAmountRaw: '5000000', takerFeeBps: 10 };
  const roomCtx = (over) => ({ ...baseCtx, currentView: 'tradeRoom', resolvedTradeState: 'PAID', tradeState: 'PAID', userRole: 'maker', activeTrade: trade, rawTokenToDisplayNumber: () => 0, ...over });
  it('decimals yok -> Locked — WEIRD, 0.00 degil', () => {
    render(<div>{buildAppViews(roomCtx()).renderTradeRoom()}</div>);
    expect(screen.getByText(/Locked — WEIRD/)).toBeInTheDocument();
    expect(screen.queryByText(/Locked 0/)).not.toBeInTheDocument();
  });
  it('decimals bilinince normal miktar gosterilir', () => {
    render(<div>{buildAppViews(roomCtx({ tokenDecimalsMap: { WEIRD: 6 }, rawTokenToDisplayNumber: () => 5 })).renderTradeRoom()}</div>);
    expect(screen.getByText(/Locked 5 WEIRD/)).toBeInTheDocument();
  });
});

describe('P20 F3-12: EN etiket erimeyi yakilmis gibi gostermez', () => {
  it('CHALLENGED odasinda Total decayed yazar', () => {
    const trade = { id: 't1', onchainId: 1, max: 100, fiat: 'TRY', crypto: 'USDT', rate: 10, maker: '0xm', makerFull: '0x' + '1'.repeat(40) };
    render(<div>{buildAppViews({ ...baseCtx, currentView: 'tradeRoom', resolvedTradeState: 'CHALLENGED', tradeState: 'CHALLENGED', activeTrade: trade, bleedingAmounts: { totalDecayed: 1n, makerBondRemaining: 1n, takerBondRemaining: 1n } }).renderTradeRoom()}</div>);
    expect(screen.getByText(/Total decayed/)).toBeInTheDocument();
    expect(screen.queryByText(/Total burned/)).not.toBeInTheDocument();
  });
});

describe('P20 F3-10: kapali yan menu odaklanamaz', () => {
  it('kapaliyken aside invisible, aciksa degil', () => {
    const closed = render(<div>{buildAppViews({ ...baseCtx, sidebarOpen: false }).renderContextSidebar()}</div>);
    expect(closed.container.querySelector('aside').className).toMatch(/\binvisible\b/);
    closed.unmount();
    const open = render(<div>{buildAppViews({ ...baseCtx, sidebarOpen: true }).renderContextSidebar()}</div>);
    expect(open.container.querySelector('aside').className).not.toMatch(/\binvisible\b/);
  });
});

describe('P20 F3-09: emir olusturma modali dialog semantigi ve Escape', () => {
  const makerCtx = (over = {}) => ({
    lang: 'EN', showMakerModal: true, setShowMakerModal: vi.fn(), makerTier: 0, setMakerTier: vi.fn(),
    makerToken: 'USDT', setMakerToken: vi.fn(), SUPPORTED_TOKEN_ADDRESSES: { USDT: '0x1' }, onchainTokenMap: {},
    ...over,
  });
  it('role=dialog aria-modal aria-labelledby basliga baglanir', () => {
    const modals = buildAppModals(makerCtx());
    render(<div>{modals.renderMakerModal()}</div>);
    const dialog = screen.getByRole('dialog');
    expect(dialog.getAttribute('aria-modal')).toBe('true');
    const id = dialog.getAttribute('aria-labelledby');
    expect(document.getElementById(id)).toHaveTextContent('Create order');
    expect(screen.getByTestId('maker-modal')).toBeInTheDocument();
  });
  it('Escape kapatir, arka plana tiklamak kapatmaz', () => {
    const setShowMakerModal = vi.fn();
    render(<div>{buildAppModals(makerCtx({ setShowMakerModal })).renderMakerModal()}</div>);
    fireEvent.click(screen.getByRole('dialog'));
    expect(setShowMakerModal).not.toHaveBeenCalled();
    fireEvent.keyDown(window, { key: 'Escape' });
    expect(setShowMakerModal).toHaveBeenCalledWith(false);
  });
});
