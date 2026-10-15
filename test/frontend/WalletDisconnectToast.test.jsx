import React from 'react';
import { describe, it, expect, vi } from 'vitest';
import userEvent from '@testing-library/user-event';
import { render, screen, act } from '@testing-library/react';

vi.mock('wagmi', () => ({
  useAccount: () => ({ address: undefined, isConnected: false, connector: null }),
  useConnect: () => ({ connect: vi.fn(), connectors: [] }),
  useDisconnect: () => ({ disconnect: vi.fn() }),
  useSignMessage: () => ({ signMessageAsync: vi.fn() }),
  useSwitchChain: () => ({ switchChainAsync: vi.fn(), isPending: false }),
  useChainId: () => 31337,
  usePublicClient: () => ({}),
}));

vi.mock('../../frontend/src/hooks/useArafContract', () => ({
  useArafContract: () => ({
    releaseFunds: vi.fn(),
    challengeTrade: vi.fn(),
    autoRelease: vi.fn(),
    pingMaker: vi.fn(),
    pingTakerForChallenge: vi.fn(),
    fillSellOrder: vi.fn(),
    fillBuyOrder: vi.fn(),
    cancelSellOrder: vi.fn(),
    cancelBuyOrder: vi.fn(),
    expirePaymentWindow: vi.fn(),
    proposeOrApproveCancel: vi.fn(),
    getReputation: vi.fn(),
    getCurrentAmounts: vi.fn(),
    createSellOrder: vi.fn(),
    createBuyOrder: vi.fn(),
    registerWallet: vi.fn(),
    reportPayment: vi.fn(),
    burnExpired: vi.fn(),
    approveToken: vi.fn(),
    getAllowance: vi.fn(),
    getTokenDecimals: vi.fn(),
    getOrder: vi.fn(),
    getPaused: vi.fn(),
    decayReputation: vi.fn(),
    antiSybilCheck: vi.fn(),
    getCooldownRemaining: vi.fn(),
    getWalletRegisteredAt: vi.fn(),
    getTakerFeeBps: vi.fn(),
    mintToken: vi.fn(),
    getFirstSuccessfulTradeAt: vi.fn(),
  }),
}));

vi.mock('../../frontend/src/app/useAppSessionData', () => ({
  useAppSessionData: () => ({
    isAuthenticated: false,
    setIsAuthenticated: vi.fn(),
    authChecked: true,
    authenticatedWallet: null,
    setAuthenticatedWallet: vi.fn(),
    isWalletRegistered: true,
    setIsWalletRegistered: vi.fn(),
    isRegisteringWallet: false,
    setIsRegisteringWallet: vi.fn(),
    isLoggingIn: false,
    setIsLoggingIn: vi.fn(),
    userReputation: null,
    payoutProfileDraft: {
      rail: 'TR_IBAN',
      country: 'TR',
      contact: { channel: null, value: null },
      fields: { account_holder_name: '', iban: null, routing_number: null, account_number: null, account_type: null, bic: null, bank_name: null },
    },
    setPayoutProfileDraft: vi.fn(),
    tradeHistory: [],
    historyLoading: false,
    tradeHistoryPage: 1,
    setTradeHistoryPage: vi.fn(),
    tradeHistoryTotal: 0,
    tradeHistoryLimit: 10,
    activeTrade: null,
    setActiveTrade: vi.fn(),
    resolvedTradeState: 'LOCKED',
    paymentIpfsHash: '',
    setPaymentIpfsHash: vi.fn(),
    sybilStatus: null,
    walletAgeRemainingDays: null,
    takerName: '',
    isPaused: false,
    protocolStats: null,
    statsLoading: false,
    statsError: false,
    onchainBondMap: null,
    onchainTokenMap: {},
    takerFeeBps: 10,
    tokenDecimalsMap: { USDT: 6, USDC: 6 },
    bleedingAmounts: null,
    orders: [],
    myOrders: [],
    setMyOrders: vi.fn(),
    setOrders: vi.fn(),
    activeEscrows: [],
    loading: false,
    setLoading: vi.fn(),
    clearLocalSessionState: vi.fn(),
    bestEffortBackendLogout: vi.fn(),
    authenticatedFetch: vi.fn(),
    fetchStats: vi.fn(),
    fetchMyTrades: vi.fn(),
    tradeState: 'LOCKED',
    setTradeState: vi.fn(),
    userRole: 'taker',
    setUserRole: vi.fn(),
    isBanned: false,
    setIsBanned: vi.fn(),
    cancelStatus: null,
    setCancelStatus: vi.fn(),
    chargebackAccepted: false,
    setChargebackAccepted: vi.fn(),
    formatAddress: (v) => v || '—',
    filteredOrders: [],
    activeEscrowCounts: { LOCKED: 0, PAID: 0, CHALLENGED: 0 },
    tradeTimers: {},
    canMakerPing: false,
    canMakerStartChallengeFlow: false,
    canMakerChallenge: false,
  }),
}));

vi.mock('../../frontend/src/app/AppViews', () => ({
  buildAppViews: () => ({
    renderHome: () => <div data-testid="home-view">home-view</div>,
    renderMarket: () => null,
    renderTradeRoom: () => null,
    renderSlimRail: () => null,
    renderAdminHint: () => null,
    renderContextSidebar: () => null,
    renderMobileNav: () => null,
    renderFooter: () => null,
  }),
}));

vi.mock('../../frontend/src/app/AppModals', () => ({
  buildAppModals: () => ({
    renderWalletModal: () => <div data-testid="wallet-modal-slot">wallet-modal-slot</div>,
    renderFeedbackModal: () => null,
    renderMakerModal: () => null,
    renderProfileModal: () => null,
    renderTermsModal: () => null,
    renderFillConfirm: () => null,
  }),
}));

import AppProviders from '../../frontend/src/app/providers/AppProviders.jsx';
import App from '../../frontend/src/App.jsx';

const OKX = 'Disconnected from OKX Wallet background. Page reload required.';
const fire = (reason) => {
  const ev = new Event('unhandledrejection', { cancelable: true });
  ev.reason = reason;
  act(() => { window.dispatchEvent(ev); });
  return ev;
};

describe('wallet extension disconnected notice (App)', () => {
  it('shows one dismissible message with a reload button for a matching unhandled rejection', async () => {
    const reload = vi.fn();
    const original = window.location;
    Object.defineProperty(window, 'location', { configurable: true, value: { ...original, reload } });
    render(<AppProviders><App /></AppProviders>);
    const ev = fire(new Error(OKX));
    expect(ev.defaultPrevented).toBe(true);
    fire(new Error(OKX));
    expect(screen.getAllByRole('alert')).toHaveLength(1);
    expect(screen.getByText(/lost its connection|bağlantısı koptu/)).toBeInTheDocument();
    expect(reload).not.toHaveBeenCalled();
    await userEvent.click(screen.getByRole('button', { name: /Reload page|Sayfayı yenile/ }));
    expect(reload).toHaveBeenCalledTimes(1);
    await userEvent.click(screen.getByRole('button', { name: /Close|Kapat/ }));
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    Object.defineProperty(window, 'location', { configurable: true, value: original });
  });

  it('does not touch unrelated rejections', () => {
    render(<AppProviders><App /></AppProviders>);
    const ev = fire(new Error('boom'));
    expect(ev.defaultPrevented).toBe(false);
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });
});

