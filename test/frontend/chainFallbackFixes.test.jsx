import React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, render, renderHook, screen, waitFor, within } from '@testing-library/react';

vi.mock('../../frontend/src/components/PIIDisplay', () => ({ default: () => <div data-testid="pii-display" /> }));
vi.mock('../../frontend/src/components/SettlementProposalCard', () => ({ default: () => <div data-testid="settlement-proposal-card" /> }));

import { useChainFallbackRoomSync, useChainFallbackTrades } from '../../frontend/src/app/useChainFallbackTrades';
import { isChainFallbackRoomOwnedBy, mapChainTradeToRoomTrade } from '../../frontend/src/app/chainFallback';
import { buildTradeDecisionModel } from '../../frontend/src/app/contexts/trade-room/tradeDecisionModel';
import { buildTradeRoomActions } from '../../frontend/src/app/actions/contractLifecycleActions';
import { useAppSessionData } from '../../frontend/src/app/useAppSessionData';
import { addKnownTradeIds } from '../../frontend/src/app/knownTrades';
import { ME, OTHER, THIRD, USDT, chainTrade } from './chainTradeFixture';

afterEach(() => cleanup());

const roomOf = (opts = {}) => {
  // eslint-disable-next-line no-unused-vars
  const { role, cancelStatus, ...rest } = mapChainTradeToRoomTrade('7', chainTrade({ id: 7, state: 'PAID', paidAt: 1_700_000_100, ...opts }), { viewer: ME, supportedTokens: { USDT } });
  return { trade: rest, role };
};

const syncSetters = () => ({ setActiveTrade: vi.fn(), setCancelStatus: vi.fn(), setChargebackAccepted: vi.fn(), setCurrentView: vi.fn() });

describe('ENGEL: cüzdan değişince yedek oda kapanır', () => {
  it('isChainFallbackRoomOwnedBy yalnız aynı roldeki tarafı kabul eder', () => {
    const { trade } = roomOf();
    expect(isChainFallbackRoomOwnedBy(trade, ME, 'maker')).toBe(true);
    expect(isChainFallbackRoomOwnedBy(trade, ME.toUpperCase().replace('0X', '0x'), 'maker')).toBe(true);
    expect(isChainFallbackRoomOwnedBy(trade, ME, 'taker')).toBe(false);
    expect(isChainFallbackRoomOwnedBy(trade, OTHER, 'maker')).toBe(false);
    expect(isChainFallbackRoomOwnedBy(trade, THIRD, 'maker')).toBe(false);
    expect(isChainFallbackRoomOwnedBy(trade, null, 'maker')).toBe(false);
  });

  it('A (maker) odası açıkken B (ilgisiz) bağlanınca oda kapanır ve listeye dönülür', () => {
    const { trade, role } = roomOf();
    const setters = syncSetters();
    const { rerender } = renderHook((p) => useChainFallbackRoomSync(p), {
      initialProps: { enabled: true, activeTrade: trade, address: ME, userRole: role, trades: [], states: {}, ...setters },
    });
    expect(setters.setActiveTrade).not.toHaveBeenCalledWith(null);
    rerender({ enabled: true, activeTrade: trade, address: THIRD, userRole: role, trades: [], states: {}, ...setters });
    expect(setters.setActiveTrade).toHaveBeenCalledWith(null);
    expect(setters.setCancelStatus).toHaveBeenCalledWith(null);
    expect(setters.setChargebackAccepted).toHaveBeenCalledWith(false);
    expect(setters.setCurrentView).toHaveBeenCalledWith('profile');
  });

  it('B aynı işlemin karşı tarafıysa (rol uyuşmuyor) oda yine kapanır; rol sessizce değiştirilmez', () => {
    const { trade, role } = roomOf();
    const setters = syncSetters();
    renderHook(() => useChainFallbackRoomSync({ enabled: true, activeTrade: trade, address: OTHER, userRole: role, trades: [], states: {}, ...setters }));
    expect(setters.setActiveTrade).toHaveBeenCalledWith(null);
    expect(setters.setCurrentView).toHaveBeenCalledWith('profile');
  });

  it('backend kaynaklı oda (_chainFallback yok) bu korumadan etkilenmez', () => {
    const { trade, role } = roomOf();
    const setters = syncSetters();
    renderHook(() => useChainFallbackRoomSync({ enabled: true, activeTrade: { ...trade, _chainFallback: false, id: 'db-1' }, address: THIRD, userRole: role, trades: [], states: {}, ...setters }));
    expect(setters.setActiveTrade).not.toHaveBeenCalled();
  });

  it('sahibi aynıysa zincir okumasıyla birleştirir ve iptal durumunu zincirden alır', () => {
    const { trade, role } = roomOf();
    const fresh = mapChainTradeToRoomTrade('7', chainTrade({ id: 7, state: 'CHALLENGED', paidAt: 1_700_000_100, challengedAt: 1_700_100_000, cancelProposedByTaker: true }), { viewer: ME, supportedTokens: { USDT } });
    const setters = syncSetters();
    renderHook(() => useChainFallbackRoomSync({ enabled: true, activeTrade: trade, address: ME, userRole: role, trades: [fresh], states: { 7: 'CHALLENGED' }, ...setters }));
    expect(setters.setActiveTrade).toHaveBeenCalledTimes(1);
    const updater = setters.setActiveTrade.mock.calls[0][0];
    expect(updater(trade)).toMatchObject({ state: 'CHALLENGED', challengedAt: 1_700_100_000 });
    expect(setters.setCancelStatus).toHaveBeenCalledWith('proposed_by_other');
    expect(setters.setCurrentView).not.toHaveBeenCalled();
  });
});

describe('ENGEL: 5xx/oturumsuz durumda cüzdan değişince eski liste temizlenir', () => {
  const A = ME;
  const B = THIRD;
  const response = (body, status = 200) => ({ ok: status >= 200 && status < 300, status, headers: { get: () => null }, json: async () => body, clone() { return this; } });
  const baseProps = { isConnected: true, connector: null, chainId: 84532, publicClient: null, currentView: 'home', lang: 'EN', isContractLoading: false, setShowMakerModal: vi.fn(), setCurrentView: vi.fn(), showToast: vi.fn(), SUPPORTED_TOKEN_ADDRESSES: { USDT: '', USDC: '' } };
  const propsA = { ...baseProps, address: A, connectedWallet: A };
  const propsB = { ...baseProps, address: B, connectedWallet: B };
  const propsAChain = { ...propsA, chainId: 8453 };
  const Harness = ({ hookProps }) => {
    const s = useAppSessionData(hookProps);
    return <><span data-testid="count">{s.activeEscrows.length}</span><span data-testid="cancel">{String(s.cancelStatus)}</span></>;
  };
  const originalFetch = global.fetch;
  let walletB = false;
  let tradesCalls = 0;
  beforeEach(() => {
    walletB = false;
    tradesCalls = 0;
    global.fetch = vi.fn(async (url) => {
      const path = new URL(String(url), 'http://localhost').pathname;
      if (path.endsWith('/api/auth/me')) return walletB ? response({}, 503) : response({ wallet: A });
      if (path.endsWith('/api/trades/my')) {
        tradesCalls += 1;
        if (walletB) return response({ error: 'down' }, 503);
        return response({ trades: [{ _id: 't1', onchain_escrow_id: '7', maker_address: A, taker_address: OTHER, status: 'LOCKED', financials: {}, timers: {}, cancel_proposal: { proposed_by: OTHER } }], total: 1, page: 1, limit: 50 });
      }
      if (path.endsWith('/api/orders/my')) return response({ orders: [], total: 0, page: 1, limit: 50 });
      return response({});
    });
  });
  afterEach(() => { global.fetch = originalFetch; });

  it('A\'nın aktif işlemleri B bağlanınca (auth/me 503) görünmez', async () => {
    const err = vi.spyOn(console, 'error').mockImplementation(() => {});
    const { rerender } = render(<Harness hookProps={propsA} />);
    await waitFor(() => expect(screen.getByTestId('count').textContent).toBe('1'));
    walletB = true;
    rerender(<Harness hookProps={propsB} />);
    await waitFor(() => expect(screen.getByTestId('count').textContent).toBe('0'));
    await new Promise((r) => setTimeout(r, 20));
    expect(screen.getByTestId('count').textContent).toBe('0');
    expect(screen.getByTestId('cancel').textContent).toBe('null');
    err.mockRestore();
  });

  it('CİLA 5: zincir değişimi fazladan /trades/my isteği yapmaz', async () => {
    const { rerender } = render(<Harness hookProps={propsA} />);
    await waitFor(() => expect(screen.getByTestId('count').textContent).toBe('1'));
    const before = tradesCalls;
    rerender(<Harness hookProps={propsAChain} />);
    await new Promise((r) => setTimeout(r, 30));
    expect(tradesCalls).toBe(before);
  });
});

describe('CİLA 1-2: yedek odada backend\'e bağlı adımlar yerine gerçek çıkışlar anlatılır', () => {
  const base = { isConnected: true, isAuthenticated: true, isSupportedChain: true, isPaused: false, lang: 'TR', nowMs: 1_700_000_200_000 };
  it('LOCKED taker: pasif gerekçe sunucu notu; hash uydurulmaz', () => {
    const m = buildTradeDecisionModel({ ...base, trade: { lockedAt: 1_700_000_000 }, tradeState: 'LOCKED', userRole: 'taker', paymentIpfsHash: '', chainFallback: true });
    expect(m.primaryAction.key).toBe('report_payment');
    expect(m.disabledReasons.join(' ')).toMatch(/Sunucuya ulaşılamadığı için ödeme bildirilemiyor \(dekont sunucuya yüklenir\)/);
    expect(m.disabledReasons.join(' ')).not.toMatch(/Dekont gerekli/);
    const normal = buildTradeDecisionModel({ ...base, trade: { lockedAt: 1_700_000_000 }, tradeState: 'LOCKED', userRole: 'taker', paymentIpfsHash: '' });
    expect(normal.disabledReasons).toContain('Dekont gerekli.');
    const en = buildTradeDecisionModel({ ...base, lang: 'EN', trade: { lockedAt: 1_700_000_000 }, tradeState: 'LOCKED', userRole: 'taker', paymentIpfsHash: '', chainFallback: true });
    expect(en.disabledReasons.join(' ')).toMatch(/Payment cannot be reported while the server is unreachable/);
  });

  it('CHALLENGED taker: uzlaşma kartı yönlendirmesi yerine çıkış yolları', () => {
    const m = buildTradeDecisionModel({ ...base, trade: { challengedAt: 1_700_000_000 }, tradeState: 'CHALLENGED', userRole: 'taker', chainFallback: true });
    expect(m.primaryAction.key).toBe('chain_fallback_exits');
    expect(m.primaryAction.description).toMatch(/karşılıklı iptal/);
    expect(m.primaryAction.description).not.toMatch(/uzlaşma kartından/);
    const normal = buildTradeDecisionModel({ ...base, trade: { challengedAt: 1_700_000_000 }, tradeState: 'CHALLENGED', userRole: 'taker' });
    expect(normal.primaryAction.key).toBe('settlement_guidance');
  });

  it('yedek odada CHALLENGED taker metni görünür', async () => {
    const { buildAppViews } = await import('../../frontend/src/app/AppViews');
    const t = mapChainTradeToRoomTrade('7', chainTrade({ id: 7, maker: OTHER, taker: ME, state: 'CHALLENGED', paidAt: 1_700_000_050, challengedAt: 1_700_000_100 }), { viewer: ME, supportedTokens: { USDT } });
    // eslint-disable-next-line no-unused-vars
    const { role, cancelStatus, ...room } = t;
    const views = buildAppViews({
      lang: 'EN', isConnected: true, isAuthenticated: false, currentView: 'tradeRoom', setCurrentView: vi.fn(), address: ME, chainId: 84532,
      activeEscrows: [], isSupportedChainId: () => true, activeTrade: room, userRole: 'taker', tradeState: 'CHALLENGED', resolvedTradeState: 'CHALLENGED',
      tokenDecimalsMap: { USDT: 6 }, rawTokenToDisplayNumber: () => 1, formatTokenAmountFromRaw: () => '0', formatAddress: (a) => a, showToast: vi.fn(),
      handleProposeCancel: vi.fn(), handleBurnExpired: vi.fn(), handleRelease: vi.fn(), chainNowMs: 1_700_000_200_000,
      chainFallback: { active: true, trades: [], loadedAt: 1 },
    });
    render(<div>{views.renderTradeRoom()}</div>);
    expect(within(screen.getByTestId('trade-primary-guidance')).getByText(/Contract exits remain open/)).toBeInTheDocument();
    expect(screen.queryByTestId('settlement-proposal-card')).not.toBeInTheDocument();
  });
});

describe('CİLA 3: yedek mod açılıp kapanınca 30 sn sınırı atlanmaz', () => {
  beforeEach(() => window.localStorage.clear());
  it('enabled dalgalanması yeni okuma tetiklemez; kapsam değişimi tetikler', async () => {
    const scope = { wallet: ME, escrow: '0x3333333333333333333333333333333333333333', chainId: 84532 };
    addKnownTradeIds(scope, ['1']);
    let now = 5_000_000;
    const readTrade = vi.fn(async () => chainTrade({ id: 1 }));
    const props = (enabled, address = ME) => ({ enabled, viewActive: true, address, chainId: 84532, escrowAddress: scope.escrow, readTrade, supportedTokens: { USDT }, nowFn: () => now });
    const { rerender } = renderHook((p) => useChainFallbackTrades(p), { initialProps: props(true) });
    await act(async () => {});
    expect(readTrade).toHaveBeenCalledTimes(1);
    now += 5_000;
    rerender(props(false));
    await act(async () => {});
    rerender(props(true));
    await act(async () => {});
    expect(readTrade).toHaveBeenCalledTimes(1);
    rerender(props(true, OTHER));
    await act(async () => {});
    // OTHER kapsamında kayıt yok → okuma yapılacak id yok; sayaç sıfırlandığı için yükleme çalıştı.
    expect(readTrade).toHaveBeenCalledTimes(1);
  });
});

describe('CİLA 4: kapanan işlem bilinen işlemler kaydından çıkar', () => {
  const build = (overrides = {}) => buildTradeRoomActions({
    lang: 'EN',
    activeTrade: { id: null, onchainId: '7', crypto: 'USDT' },
    resolvedTradeState: 'PAID',
    chargebackAccepted: true,
    isContractLoading: false,
    releaseFunds: vi.fn(async () => ({})),
    burnExpired: vi.fn(async () => ({})),
    authenticatedFetch: vi.fn(),
    showToast: vi.fn(),
    fetchMyTrades: vi.fn(),
    setIsContractLoading: vi.fn(),
    setActiveTrade: vi.fn(),
    setTradeState: vi.fn(),
    setPaymentIpfsHash: vi.fn(),
    setCancelStatus: vi.fn(),
    setChargebackAccepted: vi.fn(),
    setCurrentView: vi.fn(),
    getTrade: vi.fn(async () => ({ state: 4 })),
    ...overrides,
  });

  it('release sonrası onTradeFinished terminal durumla çağrılır', async () => {
    const onTradeFinished = vi.fn();
    await build({ onTradeFinished }).handleRelease();
    expect(onTradeFinished).toHaveBeenCalledWith('7', 'RESOLVED');
  });

  it('tx başarısızsa kayıttan çıkarılmaz', async () => {
    const onTradeFinished = vi.fn();
    const err = vi.spyOn(console, 'error').mockImplementation(() => {});
    await build({ onTradeFinished, releaseFunds: vi.fn(async () => { throw new Error('reverted'); }) }).handleRelease();
    expect(onTradeFinished).not.toHaveBeenCalled();
    err.mockRestore();
  });

  it('kayıt hatası tx sonucunu bozmaz', async () => {
    const showToast = vi.fn();
    await build({ onTradeFinished: () => { throw new Error('quota'); }, showToast }).handleRelease();
    expect(showToast).toHaveBeenLastCalledWith(expect.stringMatching(/released/), 'success');
  });
});
