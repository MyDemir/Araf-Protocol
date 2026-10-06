import React from 'react';
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';

vi.mock('wagmi', () => ({
  useAccount: () => ({ address: undefined, isConnected: false, connector: null }),
  useConnect: () => ({ connect: vi.fn(), connectors: [] }),
  useDisconnect: () => ({ disconnect: vi.fn() }),
  useSignMessage: () => ({ signMessageAsync: vi.fn() }),
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
    authChecked: false,
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
    authenticatedFetch: vi.fn(async () => ({ ok: false, status: 500, json: async () => ({ error: 'real fetch should not power admin scenarios' }) })),
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
    renderContextSidebar: () => null,
    renderMobileNav: () => null,
    renderFooter: () => null,
  }),
}));

vi.mock('../../frontend/src/app/AppModals', () => ({
  buildAppModals: () => ({
    renderWalletModal: () => null,
    renderFeedbackModal: () => null,
    renderMakerModal: () => null,
    renderProfileModal: () => null,
    renderTermsModal: () => null,
  }),
}));

vi.mock('../../frontend/src/app/shell/AppShell', () => ({
  default: ({ outlet, modals }) => (
    <div>
      {outlet}
      {modals}
    </div>
  ),
}));

import AppProviders from '../../frontend/src/app/providers/AppProviders.jsx';
import App from '../../frontend/src/App.jsx';
import { loadUiLab } from '../../frontend/src/app/uiLab';

// [TR] KÖK NEDEN (ara sıra kırılan test): App, UI Lab modülünü `loadUiLab()` ile tembel (dynamic import) yükler ve
//      "Open dev scenario controller" düğmesi ancak o import çözülünce görünür. İlk testte bu modül ağacı vitest
//      worker'ında soğuk derlenir; paralel koşuda CPU doygunken bu >1 sn sürüp findBy zaman aşımını (varsayılan 1000 ms)
//      aşıyordu. Zaman aşımı büyütülmez: modül ağacı testlerden ÖNCE ısıtılır, böylece test yalnız App davranışını bekler.
// [EN] ROOT CAUSE (intermittent failure): App lazy-loads the UI Lab via dynamic import and the controller button only
//      exists once it resolves. On a cold vitest worker under CPU contention that first compile exceeded findBy's
//      default 1000 ms. We do not raise the timeout; the module graph is warmed before the tests run.
beforeAll(async () => { await loadUiLab(); });

const renderApp = () => render(<AppProviders><App /></AppProviders>);

const applyAdminScenario = async (label) => {
  fireEvent.click(await screen.findByRole('button', { name: /Open dev scenario controller/i }));
  fireEvent.click(screen.getByRole('button', { name: 'Admin' }));
  fireEvent.click(screen.getByRole('button', { name: label }));
  fireEvent.click(screen.getByRole('button', { name: 'Apply to real App view' }));
  await waitFor(() => expect(screen.getByText(/Active: admin/i)).toBeInTheDocument());
};

afterEach(() => {
  cleanup();
  vi.useRealTimers();
  vi.clearAllMocks();
});

describe('App-level admin dev scenarios', () => {
  it('renders overview-degraded through the real AdminPanel view with mock admin fetch and auth override', async () => {
    renderApp();

    await applyAdminScenario('Overview degraded');

    await waitFor(() => expect(screen.getAllByText('NOT_READY').length).toBeGreaterThan(0));
  });

  it('renders unauthorized-403 through the real AdminPanel view with mock admin fetch and auth override', async () => {
    renderApp();

    await applyAdminScenario('Unauthorized / 403');

    await waitFor(() => expect(screen.getByText('Unauthorized Access')).toBeInTheDocument());
  });
});
