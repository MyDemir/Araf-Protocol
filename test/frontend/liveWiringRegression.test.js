import { describe, expect, it, vi } from 'vitest';
import { buildTradeRoomActions } from '../../frontend/src/app/actions/contractLifecycleActions';
import { buildCreateOrderAction, resolveTierMaxAmounts } from '../../frontend/src/app/actions/orderCreationActions';
import { mapApiOrderToUi } from '../../frontend/src/app/orderUiModel';
import { assertReceiptSucceeded, normalizeCurrentAmounts } from '../../frontend/src/hooks/useArafContract';
import { decorateContractError, describeContractErrorName } from '../../frontend/src/app/contractErrors';
import { getPaymentWindowExpired } from '../../frontend/src/app/contexts/trade-room/tradeRoomPanelActions';

const baseRoomDeps = (overrides = {}) => ({
  lang: 'EN',
  activeTrade: { id: 'db-1', onchainId: '7' },
  activeEscrows: [],
  paymentIpfsHash: '',
  resolvedTradeState: 'LOCKED',
  chargebackAccepted: false,
  isContractLoading: false,
  canMakerStartChallengeFlow: false,
  canMakerChallenge: false,
  reportPayment: vi.fn(),
  proposeOrApproveCancel: vi.fn().mockResolvedValue(undefined),
  releaseFunds: vi.fn(),
  pingTakerForChallenge: vi.fn(),
  challengeTrade: vi.fn(),
  pingMaker: vi.fn(),
  autoRelease: vi.fn(),
  burnExpired: vi.fn(),
  authenticatedFetch: vi.fn().mockResolvedValue({ ok: true, json: async () => ({ bothSigned: false }) }),
  showToast: vi.fn(),
  fetchMyTrades: vi.fn(),
  setIsContractLoading: vi.fn(),
  setActiveTrade: vi.fn(),
  setTradeState: vi.fn(),
  setPaymentIpfsHash: vi.fn(),
  setCancelStatus: vi.fn(),
  setChargebackAccepted: vi.fn(),
  setCurrentView: vi.fn(),
  setLoadingText: vi.fn(),
  ...overrides,
});

describe('live wiring regressions', () => {
  it('cancel consent is a single on-chain tx with no signature or backend relay', async () => {
    const deps = baseRoomDeps();
    await buildTradeRoomActions(deps).handleProposeCancel();

    expect(deps.proposeOrApproveCancel).toHaveBeenCalledWith('7');
    expect(deps.authenticatedFetch).not.toHaveBeenCalled();
    expect(deps.setCancelStatus).toHaveBeenCalledWith('proposed_by_me');
    expect(deps.setTradeState).not.toHaveBeenCalledWith('CANCELED');
  });

  it('approving a counterparty cancel finishes the trade after the on-chain tx', async () => {
    const deps = baseRoomDeps({ cancelStatus: 'proposed_by_other' });
    await buildTradeRoomActions(deps).handleProposeCancel();

    expect(deps.proposeOrApproveCancel).toHaveBeenCalledWith('7');
    expect(deps.setTradeState).toHaveBeenCalledWith('CANCELED');
  });

  it('unpaid LOCKED trade can be unwound after the 48h payment window', async () => {
    const deps = baseRoomDeps({ expirePaymentWindow: vi.fn().mockResolvedValue(undefined) });
    await buildTradeRoomActions(deps).handleExpirePaymentWindow();

    expect(deps.expirePaymentWindow).toHaveBeenCalledWith('7');
    expect(deps.setTradeState).toHaveBeenCalledWith('CANCELED');
  });

  it('payment window expiry is offered only for LOCKED trades past 48h', () => {
    const lockedAt = new Date('2026-01-01T00:00:00Z');
    const trade = { onchainId: '7', lockedAt };
    expect(getPaymentWindowExpired({ activeTrade: trade, roomState: 'LOCKED', now: new Date(lockedAt.getTime() + 47 * 3600e3) })).toBe(false);
    expect(getPaymentWindowExpired({ activeTrade: trade, roomState: 'LOCKED', now: new Date(lockedAt.getTime() + 49 * 3600e3) })).toBe(true);
    expect(getPaymentWindowExpired({ activeTrade: trade, roomState: 'PAID', now: new Date(lockedAt.getTime() + 49 * 3600e3) })).toBe(false);
  });

  it('receipt upload goes through authenticatedFetch so x-wallet-address is attached', async () => {
    const authenticatedFetch = vi.fn().mockResolvedValue({ ok: true, json: async () => ({ hash: 'abc123' }) });
    const fetchFn = vi.fn();
    const deps = baseRoomDeps({ authenticatedFetch, fetchFn });
    const file = new File(['x'], 'r.png', { type: 'image/png' });

    await buildTradeRoomActions(deps).handleFileUpload({ target: { files: [file], value: 'r.png' } });

    expect(authenticatedFetch).toHaveBeenCalledWith(expect.stringContaining('receipts/upload'), expect.objectContaining({ method: 'POST', body: expect.any(FormData) }));
    expect(fetchFn).not.toHaveBeenCalled();
    expect(deps.setPaymentIpfsHash).toHaveBeenCalledWith('abc123');
  });

  it('order creation publishes the maker rate/fiat to the backend after the contract tx', async () => {
    const authenticatedFetch = vi.fn().mockResolvedValue({ ok: true });
    const state = { makerTier: 1, makerAmount: '100', makerRate: '34', makerMinLimit: '', makerMaxLimit: '', makerFiat: 'TRY', makerToken: 'USDT', makerSide: 'SELL_CRYPTO' };
    await buildCreateOrderAction({
      getFormState: () => state,
      resetForm: vi.fn(),
      requireSignedSessionForActiveWallet: () => true,
      supportedTokens: { USDT: { address: '0x0000000000000000000000000000000000000001', decimalsRequired: true } },
      address: '0xabc0000000000000000000000000000000000000',
      lang: 'EN',
      isContractLoading: () => false,
      setIsContractLoading: vi.fn(),
      setLoadingText: vi.fn(),
      setShowMakerModal: vi.fn(),
      showToast: vi.fn(),
      getTokenDecimals: async () => 6,
      getAllowance: async () => 10n ** 18n,
      approveToken: vi.fn(),
      createSellOrder: vi.fn().mockResolvedValue(undefined),
      createBuyOrder: vi.fn(),
      canonicalizePayoutProfileDraft: (v) => v,
      payoutProfileDraft: { rail: 'TR_IBAN', country: 'TR' },
      paymentRiskConfig: {},
      authenticatedFetch,
    })();

    const [url, init] = authenticatedFetch.mock.calls[0];
    expect(url).toContain('orders/market-meta');
    const body = JSON.parse(init.body);
    expect(body).toEqual(expect.objectContaining({ fiatCurrency: 'TRY', exchangeRate: 34 }));
    expect(body.orderRef).toMatch(/^0x[0-9a-f]{64}$/);
  });

  it('marketplace scales raw base-unit amounts by token decimals', () => {
    const ui = mapApiOrderToUi({
      order: {
        _id: 'o1',
        side: 'SELL_CRYPTO',
        status: 'OPEN',
        tier: 1,
        token_address: '0xAAAA000000000000000000000000000000000000',
        market: { crypto_asset: 'USDT', fiat_currency: 'TRY', exchange_rate: 34 },
        amounts: { min_fill_amount: '10000000', min_fill_amount_num: 10000000, remaining_amount: '250000000', remaining_amount_num: 250000000 },
      },
      lang: 'EN',
      tokenMap: { '0xaaaa000000000000000000000000000000000000': { decimals: 6 } },
    });
    expect(ui.minFillAmount).toBe(10);
    expect(ui.remainingAmount).toBe(250);
    expect(ui.hasPrice).toBe(true);
    expect(ui.successRate).toBeNull();
  });

  it('tier limits come from on-chain token config when available', () => {
    const limits = resolveTierMaxAmounts({ decimals: 6, tierMaxAmountsBaseUnit: ['200000000', '2000000000', '9000000000', '40000000000'] });
    expect(limits).toEqual({ 0: 200, 1: 2000, 2: 9000, 3: 40000 });
  });

  it('getCurrentAmounts array output is normalized to named bleeding fields', () => {
    const amounts = normalizeCurrentAmounts([100n, 8n, 10n, 3n]);
    expect(amounts).toEqual(expect.objectContaining({ currentCrypto: 100n, makerBondRemaining: 8n, takerBondRemaining: 10n, totalDecayed: 3n }));
  });

  it('reverted receipts are not reported as success', () => {
    expect(() => assertReceiptSucceeded({ status: 'reverted' }, 'releaseFunds')).toThrow(/reverted/);
    expect(assertReceiptSucceeded({ status: 'success' })).toEqual({ status: 'success' });
  });

  it('custom contract errors are decoded into short, actionable messages', () => {
    const err = { shortMessage: 'execution reverted', walk: (fn) => [{ data: { errorName: 'WalletTooYoung' } }].find(fn) };
    decorateContractError(err, 'TR');
    expect(err.arafErrorName).toBe('WalletTooYoung');
    expect(err.shortMessage).toBe(describeContractErrorName('WalletTooYoung', 'TR'));
  });
});
