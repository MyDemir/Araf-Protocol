import React from 'react';
import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { orderSide as orderSideCopy } from '../../frontend/src/app/copy';
import { buildAppModals } from '../../frontend/src/app/AppModals';
import MyOrdersPanel from '../../frontend/src/app/contexts/profile/MyOrdersPanel';
import { getOrderSideCopy, mapApiOrderToUi } from '../../frontend/src/app/orderUiModel';
import { buildMarketOrdersQuery, countActiveMarketFilters, matchesMarketFilters, MARKET_FILTER_DEFAULTS } from '../../frontend/src/app/contexts/marketplace/marketFilters';

const makeMakerCtx = (overrides = {}) => ({
  lang: 'EN',
  t: { createAd: 'Create Order' },
  showWalletModal: false,
  connectors: [],
  showFeedbackModal: false,
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
  paymentRiskConfig: {},
  userReputation: { effectiveTier: 3 },
  SUPPORTED_TOKEN_ADDRESSES: { USDT: '0x1' },
  onchainTokenMap: {},
  handleCreateOrder: vi.fn(),
  isContractLoading: false,
  loadingText: '',
  showProfileModal: false,
  isConnected: true,
  isAuthenticated: true,
  termsAccepted: true,
  isRegisteringWallet: false,
  isWalletRegistered: true,
  sybilStatus: { funded: true },
  walletAgeRemainingDays: null,
  payoutProfileDraft: { rail: 'TR_IBAN', country: 'TR' },
  tokenDecimalsMap: { USDT: 6 },
  DEFAULT_TOKEN_DECIMALS: 6,
  formatTokenAmountFromRaw: () => '0',
  ...overrides,
});

const apiOrder = {
  _id: 'id-1',
  onchain_order_id: 7,
  owner_address: '0xabc',
  status: 'OPEN',
  tier: 1,
  token_address: '0xToken',
  market: { crypto_asset: 'USDT', fiat_currency: 'TRY', exchange_rate: '33.2' },
  amounts: { min_fill_amount_num: 12, remaining_amount_num: 55 },
};

describe('order side copy', () => {
  it.each([
    ['SELL_CRYPTO', 'Kripto Satıyor', 'Selling Crypto', 'Satın Al', 'Buy', 'Satış emri', 'Sell Order'],
    ['BUY_CRYPTO', 'Kripto Alıyor', 'Buying Crypto', 'Sat', 'Sell', 'Alış emri', 'Buy Order'],
  ])('maps %s display/action/order labels in TR and EN', (side, displayTR, displayEN, actionTR, actionEN, orderTR, orderEN) => {
    expect(orderSideCopy[side]).toEqual({ TR: displayTR, EN: displayEN });
    expect(getOrderSideCopy(side, 'display', 'TR')).toBe(displayTR);
    expect(getOrderSideCopy(side, 'display', 'EN')).toBe(displayEN);
    expect(getOrderSideCopy(side, 'action', 'TR')).toBe(actionTR);
    expect(getOrderSideCopy(side, 'action', 'EN')).toBe(actionEN);
    expect(getOrderSideCopy(side, 'order', 'TR')).toBe(orderTR);
    expect(getOrderSideCopy(side, 'order', 'EN')).toBe(orderEN);
  });

  it('maker side selector does not render raw enum labels as visible text', () => {
    const modals = buildAppModals(makeMakerCtx());
    render(<div>{modals.renderMakerModal()}</div>);

    expect(screen.getByRole('button', { name: 'Selling Crypto' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Buying Crypto' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'SELL_CRYPTO' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'BUY_CRYPTO' })).not.toBeInTheDocument();
    expect(screen.getByTestId('maker-side-SELL_CRYPTO')).toHaveTextContent('Selling Crypto');
    expect(screen.getByTestId('maker-side-BUY_CRYPTO')).toHaveTextContent('Buying Crypto');
  });


  it('profile order cards keep enum internally but render display label', () => {
    render(<MyOrdersPanel myOrders={[{ id: 'o1', side: 'BUY_CRYPTO' }]} lang="EN" setConfirmDeleteId={vi.fn()} />);

    expect(screen.getByText(/Buy Order/)).toBeInTheDocument();
    expect(screen.queryByText(/BUY_CRYPTO/)).not.toBeInTheDocument();
  });

  it('market mapping keeps internal enum but exposes display labels', () => {
    const sell = mapApiOrderToUi({ order: { ...apiOrder, side: 'SELL_CRYPTO' }, lang: 'TR', bondMap: { 1: { maker: 8, taker: 10 } }, tokenMap: {}, formatAddress: (a) => a });
    const buy = mapApiOrderToUi({ order: { ...apiOrder, side: 'BUY_CRYPTO' }, lang: 'TR', bondMap: { 1: { maker: 8, taker: 10 } }, tokenMap: {}, formatAddress: (a) => a });

    expect(sell.side).toBe('SELL_CRYPTO');
    expect(buy.side).toBe('BUY_CRYPTO');
    expect(sell.sideLabel).toBe('Satış emri');
    expect(buy.sideLabel).toBe('Alış emri');
    expect(sell.ctaLabel).toBe('Satın Al');
    expect(buy.ctaLabel).toBe('Sat');
    expect(sell.ownerSideHint).toContain('Kripto Satıyor');
    expect(buy.ownerSideHint).toContain('Kripto Alıyor');
  });
});

describe('market orders query (server-side filters)', () => {
  const tokenAddresses = { USDT: '0x' + 'a'.repeat(40), USDC: '0x' + 'c'.repeat(40) };
  const parse = (q) => Object.fromEntries(new URLSearchParams(q.split('?')[1]));
  const q = (filters, extra = {}) => parse(buildMarketOrdersQuery({ filters: { ...MARKET_FILTER_DEFAULTS, ...filters }, tokenAddresses, ...extra }));
  it('defaults to active orders without side or sort', () => {
    expect(parse(buildMarketOrdersQuery())).toEqual({ status: 'ACTIVE', limit: '50' });
  });
  it('maps the Buy tab to SELL_CRYPTO with best-rate sort, and applies tier/token/amount/fiat server-side', () => {
    expect(q({ side: 'BUY', tier: 'NO_BOND', token: 'USDC', amount: '250', fiat: 'TRY' })).toEqual({
      status: 'ACTIVE', limit: '50', side: 'SELL_CRYPTO', sort: 'best_rate', tier: '0', token_address: tokenAddresses.USDC, min_amount: '250', fiat: 'TRY',
    });
    expect(q({ side: 'SELL' }).side).toBe('BUY_CRYPTO');
  });
  it('sort: AUTO without side uses the server default, AMOUNT drops best_rate, NEWEST maps to newest', () => {
    expect(q({}).sort).toBeUndefined();
    expect(q({ side: 'BUY', sort: 'AMOUNT' }).sort).toBeUndefined();
    expect(q({ sort: 'NEWEST' }).sort).toBe('newest');
    expect(q({ side: 'SELL', sort: 'NEWEST' }).sort).toBe('newest');
  });
  it('ELIGIBLE sends max_tier only when the viewer tier is known', () => {
    expect(q({ tier: 'ELIGIBLE' }, { userTier: 2 }).max_tier).toBe('2');
    expect(q({ tier: 'ELIGIBLE' }, { userTier: null }).max_tier).toBeUndefined();
    expect(q({ tier: 'ELIGIBLE' }, { userTier: 9 }).max_tier).toBeUndefined();
  });
  it('ignores empty, zero or invalid amounts, unknown tokens and fiats', () => {
    for (const amount of ['', '0', 'abc', '-5']) {
      expect(q({ amount }).min_amount).toBeUndefined();
    }
    expect(q({ token: 'DAI' }).token_address).toBeUndefined();
    expect(q({ fiat: 'GBP' }).fiat).toBeUndefined();
  });
});

describe('market filters (client matcher mirrors the server)', () => {
  const me = '0x' + '1'.repeat(40);
  const order = { side: 'SELL_CRYPTO', crypto: 'USDT', fiat: 'TRY', tier: 2, remainingAmount: 500, minFillAmount: 100, makerFull: '0x' + '2'.repeat(40) };
  const match = (filters, o = order, ctx = {}) => matchesMarketFilters(o, { ...MARKET_FILTER_DEFAULTS, ...filters }, ctx);
  it('amount must fit a single fill (remaining >= amount and min fill <= amount, or the full remainder)', () => {
    expect(match({ amount: '250' })).toBe(true);
    expect(match({ amount: '50' })).toBe(false);
    expect(match({ amount: '600' })).toBe(false);
    expect(match({ amount: '80' }, { ...order, remainingAmount: 80, minFillAmount: 100 })).toBe(true);
  });
  it('side, token, fiat and tier narrow the list', () => {
    expect(match({ side: 'BUY' })).toBe(true);
    expect(match({ side: 'SELL' })).toBe(false);
    expect(match({ token: 'USDC' })).toBe(false);
    expect(match({ fiat: 'EUR' })).toBe(false);
    expect(match({ tier: 'NO_BOND' })).toBe(false);
    expect(match({ tier: 'ELIGIBLE' }, order, { userTier: 1 })).toBe(false);
    expect(match({ tier: 'ELIGIBLE' }, order, { userTier: 3 })).toBe(true);
  });
  it('hideOwn removes only the viewer own orders', () => {
    expect(match({ hideOwn: true }, { ...order, makerFull: me.toUpperCase().replace('0X', '0x') }, { viewerAddress: me })).toBe(false);
    expect(match({ hideOwn: true }, order, { viewerAddress: me })).toBe(true);
    expect(match({ hideOwn: true }, { ...order, makerFull: me })).toBe(true);
  });
  it('counts only result-narrowing filters (not side or sort)', () => {
    expect(countActiveMarketFilters(MARKET_FILTER_DEFAULTS)).toBe(0);
    expect(countActiveMarketFilters({ ...MARKET_FILTER_DEFAULTS, side: 'BUY', sort: 'NEWEST' })).toBe(0);
    expect(countActiveMarketFilters({ ...MARKET_FILTER_DEFAULTS, token: 'USDT', amount: '5', fiat: 'TRY', tier: 'NO_BOND', hideOwn: true })).toBe(5);
    expect(countActiveMarketFilters({ ...MARKET_FILTER_DEFAULTS, amount: '0' })).toBe(0);
  });
});
