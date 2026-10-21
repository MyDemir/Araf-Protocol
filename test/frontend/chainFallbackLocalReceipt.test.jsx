import React from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

vi.mock('../../frontend/src/components/PIIDisplay', () => ({ default: () => <div data-testid="pii-display" /> }));
vi.mock('../../frontend/src/components/SettlementProposalCard', () => ({ default: () => <div data-testid="settlement-proposal-card" /> }));

import { buildAppViews } from '../../frontend/src/app/AppViews';
import { buildTradeRoomActions } from '../../frontend/src/app/actions/contractLifecycleActions';
import { buildTradeDecisionModel } from '../../frontend/src/app/contexts/trade-room/tradeDecisionModel';
import { hashLocalReceipt, isLocalReceiptHash, LOCAL_RECEIPT_PREFIX } from '../../frontend/src/app/localReceiptHash';
import { mapChainTradeToRoomTrade } from '../../frontend/src/app/chainFallback';
import { ME, OTHER, USDT, chainTrade } from './chainTradeFixture';

afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

const H = 3600;
const NOW_SEC = 1_800_000_000;
const ABC_SHA256 = 'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad';
const LOCAL_HASH = `${LOCAL_RECEIPT_PREFIX}${ABC_SHA256}`;

const room = (opts) => {
  const t = mapChainTradeToRoomTrade(String(opts.id ?? 7), chainTrade(opts), { viewer: ME, supportedTokens: { USDT }, tokenDecimalsMap: { USDT: 6 } });
  // eslint-disable-next-line no-unused-vars
  const { role, cancelStatus, ...rest } = t;
  return { trade: rest, role, cancelStatus };
};

const renderRoom = (opts, extra = {}) => {
  const { trade, role, cancelStatus } = room(opts);
  const h = { handleReportPayment: vi.fn(), handleLocalReceiptSelect: vi.fn(), handleFileUpload: vi.fn(), handleRelease: vi.fn(), handleProposeCancel: vi.fn(), handleExpirePaymentWindow: vi.fn(), handleChargebackAck: vi.fn() };
  const ctx = {
    lang: 'EN', setLang: vi.fn(), isConnected: true, isAuthenticated: false, isContractLoading: false, isPaused: false, currentView: 'tradeRoom',
    setCurrentView: vi.fn(), address: ME, chainId: 84532, activeEscrows: [], SUPPORTED_TOKEN_ADDRESSES: { USDT }, isSupportedChainId: () => true,
    activeEscrowCounts: {}, takerFeeBps: 10, setActiveTrade: vi.fn(), setUserRole: vi.fn(), setTradeState: vi.fn(), setCancelStatus: vi.fn(),
    setChargebackAccepted: vi.fn(), paymentIpfsHash: '', chargebackAccepted: false, tokenDecimalsMap: { USDT: 6 }, formatTokenAmountFromRaw: () => '0',
    rawTokenToDisplayNumber: (raw, d) => Number(raw) / 10 ** d, formatAddress: (a) => String(a).slice(0, 6), fetchMyTrades: vi.fn(), setIsContractLoading: vi.fn(),
    authenticatedFetch: vi.fn(), showToast: vi.fn(), chainNowMs: NOW_SEC * 1000,
    chainFallback: { active: true, trades: [], loading: false, loadedAt: 1, submitManualId: vi.fn(), openTrade: vi.fn() },
    ...h, activeTrade: trade, userRole: role, tradeState: trade.state, resolvedTradeState: trade.state, cancelStatus, ...extra,
  };
  render(<div>{buildAppViews(ctx).renderTradeRoom()}</div>);
  return h;
};

describe('yedek mod yerel dekont özeti', () => {
  it('SHA-256 Web Crypto ile hesaplanır, biçim local-sha256:<64 hex>; çıplak hex ile çakışmaz', async () => {
    const out = await hashLocalReceipt(new File(['abc'], 'r.pdf'));
    expect(out).toBe(LOCAL_HASH);
    expect(isLocalReceiptHash(out)).toBe(true);
    expect(isLocalReceiptHash(ABC_SHA256)).toBe(false);
  });

  it('dosya içeriği ağ çağrısına gitmez; özet kontrata giden state\'e yazılır ve reportPayment ona verilir', async () => {
    const fetchFn = vi.fn(); const authenticatedFetch = vi.fn();
    vi.stubGlobal('fetch', fetchFn);
    const deps = {
      lang: 'EN', activeTrade: { id: 'x', onchainId: '7' }, paymentIpfsHash: '', resolvedTradeState: 'LOCKED', reportPayment: vi.fn(),
      authenticatedFetch, fetchFn, showToast: vi.fn(), setIsContractLoading: vi.fn(), setPaymentIpfsHash: vi.fn(), setActiveTrade: vi.fn(),
      setTradeState: vi.fn(), setCancelStatus: vi.fn(), setChargebackAccepted: vi.fn(), setCurrentView: vi.fn(), fetchMyTrades: vi.fn(),
    };
    await buildTradeRoomActions(deps).handleLocalReceiptSelect({ target: { files: [new File(['abc'], 'r.png')], value: 'r.png' } });
    expect(deps.setPaymentIpfsHash).toHaveBeenCalledWith(LOCAL_HASH);
    expect(fetchFn).not.toHaveBeenCalled();
    expect(authenticatedFetch).not.toHaveBeenCalled();
    await buildTradeRoomActions({ ...deps, paymentIpfsHash: LOCAL_HASH }).handleReportPayment();
    expect(deps.reportPayment).toHaveBeenCalledWith(7n, LOCAL_HASH);
  });

  it('LOCKED taker: seçici ve uyarı görünür; dekont yokken bildirim kapalı, varken açık ve tıklanınca çağrılır', async () => {
    const user = userEvent.setup();
    renderRoom({ maker: OTHER, taker: ME, state: 'LOCKED', lockedAt: NOW_SEC - 2 * H });
    expect(screen.getByTestId('chain-fallback-receipt-warning')).toHaveTextContent(/will not be sent to the counterparty/i);
    expect(within(screen.getByTestId('trade-primary-guidance')).getByRole('button', { name: /Report Payment/i })).toBeDisabled();
    cleanup();
    const h = renderRoom({ maker: OTHER, taker: ME, state: 'LOCKED', lockedAt: NOW_SEC - 2 * H }, { paymentIpfsHash: LOCAL_HASH });
    const btn = within(screen.getByTestId('trade-primary-guidance')).getByRole('button', { name: /Report Payment/i });
    expect(btn).toBeEnabled();
    await user.click(btn);
    expect(h.handleReportPayment).toHaveBeenCalledTimes(1);
  });

  it('uygun değilken seçici yok: süre dolmuş LOCKED, maker, PAID', () => {
    renderRoom({ maker: OTHER, taker: ME, state: 'LOCKED', lockedAt: NOW_SEC - 49 * H });
    expect(screen.queryByTestId('chain-fallback-receipt')).toBeNull();
    cleanup();
    renderRoom({ state: 'LOCKED', lockedAt: NOW_SEC - 2 * H });
    expect(screen.queryByTestId('chain-fallback-receipt')).toBeNull();
    cleanup();
    renderRoom({ maker: OTHER, taker: ME, state: 'PAID', paidAt: NOW_SEC - H });
    expect(screen.queryByTestId('chain-fallback-receipt')).toBeNull();
  });

  it('model: onchainId yoksa eski sunucu uyarısı aynen kalır; varsa yeni ipucu', () => {
    const base = { isConnected: true, isAuthenticated: true, isSupportedChain: true, isPaused: false, lang: 'TR', nowMs: 1_700_000_200_000, tradeState: 'LOCKED', userRole: 'taker', chainFallback: true, paymentIpfsHash: '' };
    expect(buildTradeDecisionModel({ ...base, trade: { lockedAt: 1_700_000_000 } }).disabledReasons.join(' ')).toMatch(/Sunucuya ulaşılamadığı için ödeme bildirilemiyor/);
    const eligible = buildTradeDecisionModel({ ...base, trade: { lockedAt: 1_700_000_000, onchainId: '7' } });
    expect(eligible.disabledReasons.join(' ')).toMatch(/Dekont dosyası seçin/);
    expect(eligible.disabledReasons.join(' ')).not.toMatch(/Sunucuya ulaşılamadığı/);
    expect(buildTradeDecisionModel({ ...base, paymentIpfsHash: LOCAL_HASH, trade: { onchainId: '7' } }).disabledReasons).toEqual([]);
  });
});
