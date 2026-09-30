import React from 'react';
import { afterEach, describe, it, expect, vi } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { buildAppModals } from '../../frontend/src/app/AppModals';

afterEach(() => {
  cleanup();
});

const makeCtx = (overrides = {}) => ({
  lang: 'EN',
  showWalletModal: false,
  setShowWalletModal: vi.fn(),
  connectors: [],
  connect: vi.fn(),
  getWalletIcon: () => '👛',
  showFeedbackModal: false,
  setShowFeedbackModal: vi.fn(),
  feedbackRating: 0,
  setFeedbackRating: vi.fn(),
  feedbackCategory: '',
  setFeedbackCategory: vi.fn(),
  setFeedbackError: vi.fn(),
  feedbackText: '',
  setFeedbackText: vi.fn(),
  feedbackError: '',
  FEEDBACK_MIN_LENGTH: 10,
  submitFeedback: vi.fn(),
  isSubmittingFeedback: false,
  showMakerModal: true,
  setShowMakerModal: vi.fn(),
  makerTier: 1,
  setMakerTier: vi.fn(),
  makerToken: 'USDT',
  setMakerToken: vi.fn(),
  makerSide: 'SELL_CRYPTO',
  setMakerSide: vi.fn(),
  makerAmount: '100',
  setMakerAmount: vi.fn(),
  makerRate: '34',
  setMakerRate: vi.fn(),
  makerMinLimit: '100',
  setMakerMinLimit: vi.fn(),
  makerFiat: 'TRY',
  setMakerFiat: vi.fn(),
  onchainBondMap: { 1: { maker: 8, taker: 10 } },
  paymentRiskConfig: {
    TR: {
      TR_IBAN: {
        riskLevel: 'MEDIUM',
        minBondSurchargeBps: 0,
        feeSurchargeBps: 0,
        warningKey: 'BANK_TRANSFER_CONFIRMATION_REQUIRED',
        enabled: true,
        description: { TR: 'x', EN: 'y' },
      },
    },
  },
  userReputation: { effectiveTier: 3 },
  SUPPORTED_TOKEN_ADDRESSES: { USDT: '0x1' },
  onchainTokenMap: {},
  handleCreateOrder: vi.fn(),
  makerValidationError: null,
  makerPayoutRiskEntry: { riskLevel: 'MEDIUM', enabled: true, minBondSurchargeBps: 0, feeSurchargeBps: 0, warningKey: 'BANK_TRANSFER_CONFIRMATION_REQUIRED', description: { TR: 'x', EN: 'y' } },
  isCreateTemporarilyDisabledByRisk: false,
  isContractLoading: false,
  setIsContractLoading: vi.fn(),
  loadingText: '',
  showProfileModal: true,
  setShowProfileModal: vi.fn(),
  profileTab: 'ilanlarim',
  setProfileTab: vi.fn(),
  isBanned: false,
  tradeHistory: [],
  historyLoading: false,
  tradeHistoryPage: 1,
  setTradeHistoryPage: vi.fn(),
  tradeHistoryTotal: 0,
  tradeHistoryLimit: 10,
  orders: [],
  myOrders: [{ id: 'o1', side: 'BUY_CRYPTO', status: 'OPEN', crypto: 'USDT', fiat: 'TRY', rate: 34, remainingAmount: 50, minFillAmount: 10, tier: 1 }],
  address: '0xabc',
  confirmDeleteId: null,
  setConfirmDeleteId: vi.fn(),
  handleDeleteOrder: vi.fn(),
  activeTradesFilter: 'ALL',
  setActiveTradesFilter: vi.fn(),
  activeEscrows: [],
  setActiveTrade: vi.fn(),
  setUserRole: vi.fn(),
  setTradeState: vi.fn(),
  setChargebackAccepted: vi.fn(),
  setCurrentView: vi.fn(),
  handleUpdatePII: vi.fn(),
  payoutProfileDraft: {
    rail: 'TR_IBAN',
    country: 'TR',
    contact: { channel: null, value: null },
    fields: { account_holder_name: '', iban: null, routing_number: null, account_number: null, account_type: null, bic: null, bank_name: null },
  },
  setPayoutProfileDraft: vi.fn(),
  canonicalizePayoutProfileDraft: (v) => v,
  SEPA_COUNTRIES: ['DE', 'FR'],
  handleLogoutAndDisconnect: vi.fn(),
  isConnected: true,
  isAuthenticated: true,
  termsAccepted: true,
  setTermsAccepted: vi.fn(),
  connector: null,
  isRegisteringWallet: false,
  handleRegisterWallet: vi.fn(),
  isWalletRegistered: true,
  sybilStatus: null,
  walletAgeRemainingDays: null,
  decayReputation: vi.fn(),
  tokenDecimalsMap: { USDT: 6 },
  formatTokenAmountFromRaw: () => '0',
  showToast: vi.fn(),
  ...overrides,
});

describe('AppModals side-aware behaviors', () => {
  it('shows side selector and side-specific submit label', async () => {
    const user = userEvent.setup();
    const setMakerSide = vi.fn();
    const modals = buildAppModals(makeCtx({ profileTab: 'ayarlar', showProfileModal: false, setMakerSide, makerSide: 'BUY_CRYPTO' }));

    render(<div>{modals.renderMakerModal()}</div>);

    expect(screen.getByRole('button', { name: 'Selling Crypto' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Buying Crypto' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'SELL_CRYPTO' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'BUY_CRYPTO' })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Open Buy Order/i })).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Selling Crypto' }));
    expect(setMakerSide).toHaveBeenCalledWith('SELL_CRYPTO');
  });


  it('renders maker modal as a compact form without raw TR order-side wording', () => {
    const modals = buildAppModals(makeCtx({ lang: 'TR', profileTab: 'ayarlar', showProfileModal: false }));

    render(<div>{modals.renderMakerModal()}</div>);

    ['Miktar', 'Kur (1 USDT)', 'Tier', 'Ödeme yöntemi karmaşıklığı'].forEach((label) => {
      expect(screen.getAllByText(label).length).toBeGreaterThan(0);
    });
    expect(screen.getByLabelText(/Min\. işlem/)).toBeInTheDocument();
    expect(screen.queryByText('Maksimum limit')).not.toBeInTheDocument();
    expect(screen.queryByText('Order Side')).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Kripto Satıyor' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Kripto Alıyor' })).toBeInTheDocument();
  });

  it('keeps submit disabled and readable when maker validation error exists', () => {
    const modals = buildAppModals(makeCtx({
      profileTab: 'ayarlar',
      showProfileModal: false,
      makerValidationError: 'Amount is required',
    }));

    render(<div>{modals.renderMakerModal()}</div>);

    const createButton = screen.getByRole('button', { name: /Open Sell Order/i });
    expect(createButton).toBeDisabled();
    expect(screen.getByText('Amount is required')).toBeInTheDocument();
  });

  it('buy preview accounting differs from sell preview accounting', () => {
    const buyModals = buildAppModals(makeCtx({ profileTab: 'ayarlar', showProfileModal: false, makerSide: 'BUY_CRYPTO', makerAmount: '100' }));
    const { rerender } = render(<div>{buyModals.renderMakerModal()}</div>);

    expect(screen.getAllByText(/Total Reserve:/i).length).toBeGreaterThan(0);
    expect(screen.getAllByText(/10 USDT/).length).toBeGreaterThan(0);

    const sellModals = buildAppModals(makeCtx({ profileTab: 'ayarlar', showProfileModal: false, makerSide: 'SELL_CRYPTO', makerAmount: '100' }));
    rerender(<div>{sellModals.renderMakerModal()}</div>);

    expect(screen.getAllByText(/Total Locked:/i).length).toBeGreaterThan(0);
    expect(screen.getAllByText(/108 USDT/).length).toBeGreaterThan(0);
  });

  it('disables create order button when payout rail risk is restricted by config (non-authoritative)', () => {
    const modals = buildAppModals(makeCtx({
      profileTab: 'ayarlar',
      showProfileModal: false,
      makerPayoutRiskEntry: {
        riskLevel: 'RESTRICTED',
        minBondSurchargeBps: 0,
        feeSurchargeBps: 0,
        warningKey: 'RESTRICTED',
        enabled: false,
        description: { TR: 'x', EN: 'Restricted in UI config only.' },
      },
      isCreateTemporarilyDisabledByRisk: true,
      payoutProfileDraft: {
        rail: 'US_ACH',
        country: 'US',
        contact: { channel: null, value: null },
        fields: { account_holder_name: '', iban: null, routing_number: null, account_number: null, account_type: null, bic: null, bank_name: null },
      },
    }));
    render(<div>{modals.renderMakerModal()}</div>);
    const createButton = screen
      .getAllByRole('button', { name: /Open Sell Order|Open Buy Order|Order Aç/i })
      .find((btn) => btn.hasAttribute('disabled'));
    expect(createButton).toBeTruthy();
    expect(createButton).toBeDisabled();
    expect(screen.getByText(/not a contract authority rule|kontrat hükmü değildir/i)).toBeInTheDocument();
  });


  it('lets maker modal reveal payment-risk technical disclosure on demand', async () => {
    const user = userEvent.setup();
    const modals = buildAppModals(makeCtx({ profileTab: 'ayarlar', showProfileModal: false }));

    render(<div>{modals.renderMakerModal()}</div>);

    expect(screen.getAllByText(/Payment method complexity/i).length).toBeGreaterThan(0);
    expect(screen.getAllByText('Medium').length).toBeGreaterThan(0);
    expect(screen.getAllByText(/not a user trust score/i).length).toBeGreaterThan(0);
    expect(screen.queryByText(/minBondSurchargeBps/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/warningKey/i)).not.toBeInTheDocument();

    await user.click(screen.getAllByRole('button', { name: /Show technical disclosure/i })[0]);

    expect(screen.getAllByText(/minBondSurchargeBps/i).length).toBeGreaterThan(0);
    expect(screen.getAllByText(/feeSurchargeBps/i).length).toBeGreaterThan(0);
    expect(screen.getAllByText(/warningKey/i).length).toBeGreaterThan(0);
    expect(screen.getAllByText(/BANK_TRANSFER_CONFIRMATION_REQUIRED/i).length).toBeGreaterThan(0);
  });

  it('no longer ships a duplicate profile modal (Profile Center page is the only profile surface)', () => {
    const modals = buildAppModals(makeCtx({ showMakerModal: false }));
    expect(modals.renderProfileModal).toBeUndefined();
  });
});
