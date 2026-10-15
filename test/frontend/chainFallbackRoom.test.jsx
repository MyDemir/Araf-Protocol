import React from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

// [TR] Backend'e bağlı bileşenler işaretçiyle değiştirilir: yedek odada render EDİLMEMELİLER.
vi.mock('../../frontend/src/components/PIIDisplay', () => ({ default: () => <div data-testid="pii-display" /> }));
vi.mock('../../frontend/src/components/SettlementProposalCard', () => ({ default: () => <div data-testid="settlement-proposal-card" /> }));

import { buildAppViews } from '../../frontend/src/app/AppViews';
import ChainFallbackTradesPanel from '../../frontend/src/app/contexts/trade-room/ChainFallbackTradesPanel';
import { mapChainTradeToRoomTrade } from '../../frontend/src/app/chainFallback';
import { ME, OTHER, USDT, chainTrade } from './chainTradeFixture';

afterEach(() => cleanup());

const H = 3600;
const NOW_SEC = 1_800_000_000;
const NOW_MS = NOW_SEC * 1000;

const roomTrade = (opts) => {
  const t = mapChainTradeToRoomTrade(String(opts.id ?? 7), chainTrade(opts), { viewer: ME, supportedTokens: { USDT }, tokenDecimalsMap: { USDT: 6 } });
  // eslint-disable-next-line no-unused-vars
  const { role, cancelStatus, ...rest } = t;
  return { trade: rest, role, cancelStatus };
};

const handlers = () => ({
  handleReportPayment: vi.fn(),
  handleRelease: vi.fn(),
  handleChallenge: vi.fn(),
  handlePingMaker: vi.fn(),
  handleAutoRelease: vi.fn(),
  handleProposeCancel: vi.fn(),
  handleRevokeCancel: vi.fn(),
  handleBurnExpired: vi.fn(),
  handleExpirePaymentWindow: vi.fn(),
  handleFileUpload: vi.fn(),
  handleChargebackAck: vi.fn(),
});

const baseCtx = {
  lang: 'EN',
  setLang: vi.fn(),
  isConnected: true,
  // [TR] Backend yok → oturum doğrulanamadı.
  isAuthenticated: false,
  isLoggingIn: false,
  isContractLoading: false,
  isPaused: false,
  authChecked: false,
  currentView: 'tradeRoom',
  setCurrentView: vi.fn(),
  toggleSidebar: vi.fn(),
  handleAuthAction: vi.fn(),
  formatAddress: (a) => `${String(a).slice(0, 6)}…`,
  address: ME,
  chainId: 84532,
  activeEscrows: [],
  SUPPORTED_TOKEN_ADDRESSES: { USDT },
  isSupportedChainId: () => true,
  activeEscrowCounts: { LOCKED: 0, PAID: 0, CHALLENGED: 0 },
  takerFeeBps: 10,
  setActiveTrade: vi.fn(),
  setUserRole: vi.fn(),
  setTradeState: vi.fn(),
  setCancelStatus: vi.fn(),
  setChargebackAccepted: vi.fn(),
  paymentIpfsHash: '',
  cancelStatus: null,
  chargebackAccepted: false,
  canMakerStartChallengeFlow: false,
  canMakerChallenge: false,
  bleedingAmounts: null,
  takerName: '',
  tokenDecimalsMap: { USDT: 6 },
  formatTokenAmountFromRaw: () => '0',
  rawTokenToDisplayNumber: (raw, d) => Number(raw) / 10 ** d,
  fetchMyTrades: vi.fn(),
  setIsContractLoading: vi.fn(),
  authenticatedFetch: vi.fn(),
  showToast: vi.fn(),
  chainNowMs: NOW_MS,
  chainFallback: { active: true, trades: [], loading: false, loadedAt: 1, submitManualId: vi.fn(), openTrade: vi.fn() },
};

const renderRoom = (opts, extra = {}) => {
  const { trade, role, cancelStatus } = roomTrade(opts);
  const h = handlers();
  const views = buildAppViews({ ...baseCtx, ...h, activeTrade: trade, userRole: role, tradeState: trade.state, resolvedTradeState: trade.state, cancelStatus, ...extra });
  render(<div>{views.renderTradeRoom()}</div>);
  return h;
};

const primary = () => within(screen.getByTestId('trade-primary-guidance'));
const secondary = () => within(screen.getByTestId('trade-secondary-guidance'));

describe('P4 yedek işlem odası (zincir verisi)', () => {
  it('PAID maker: release etkin (kendi onayıyla), PII/gönderen adı/dekont yok, sunucu notu var', async () => {
    const user = userEvent.setup();
    const h = renderRoom({ state: 'PAID', paidAt: NOW_SEC - 2 * H }, { chargebackAccepted: true });
    expect(screen.getByTestId('chain-fallback-notice')).toHaveTextContent(/server is unreachable/i);
    expect(screen.queryByTestId('pii-display')).not.toBeInTheDocument();
    expect(screen.queryByText(/Sender name must be/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/Session is not authenticated/i)).not.toBeInTheDocument();
    const release = primary().getByRole('button', { name: /Release Funds/i });
    expect(release).toBeEnabled();
    await user.click(release);
    expect(h.handleRelease).toHaveBeenCalledTimes(1);
    // İtiraz yolu (ping) 24 saat dolmadan kapalı: kontrat kuralı aynen uygulanır.
    expect(secondary().getByRole('button', { name: /Ping Taker/i })).toBeDisabled();
    expect(secondary().getByRole('button', { name: /Propose Cancel/i })).toBeEnabled();
  });

  it('PAID maker: ters ibraz onayı verilmeden release kapalı (mevcut kural)', () => {
    renderRoom({ state: 'PAID', paidAt: NOW_SEC - 2 * H }, { chargebackAccepted: false });
    expect(primary().getByRole('button', { name: /Release Funds/i })).toBeDisabled();
    expect(screen.getByRole('checkbox')).toBeInTheDocument();
  });

  it('PAID maker 25 saat sonra: alıcıyı uyar (pingTakerForChallenge) etkin', () => {
    renderRoom({ state: 'PAID', paidAt: NOW_SEC - 25 * H });
    expect(secondary().getByRole('button', { name: /Ping Taker/i })).toBeEnabled();
  });

  it('PAID taker: pingMaker 48 saat sonra, autoRelease ping + 24 saat sonra etkin', async () => {
    const user = userEvent.setup();
    cleanup();
    renderRoom({ maker: OTHER, taker: ME, state: 'PAID', paidAt: NOW_SEC - 49 * H });
    expect(secondary().getByRole('button', { name: /Ping Maker/i })).toBeEnabled();
    cleanup();
    const h = renderRoom({ maker: OTHER, taker: ME, state: 'PAID', paidAt: NOW_SEC - 80 * H, pingedAt: NOW_SEC - 25 * H, pingedByTaker: true });
    const auto = secondary().getByRole('button', { name: /Auto-Release/i });
    expect(auto).toBeEnabled();
    await user.click(auto);
    expect(h.handleAutoRelease).toHaveBeenCalledWith('7');
    expect(screen.queryByTestId('pii-display')).not.toBeInTheDocument();
  });

  it('CHALLENGED: maker release etkin, uzlaşma kartı yok; 240 saat sonra burnExpired etkin', () => {
    renderRoom({ state: 'CHALLENGED', paidAt: NOW_SEC - 300 * H, challengedAt: NOW_SEC - 241 * H });
    expect(primary().getByRole('button', { name: /Release Funds/i })).toBeEnabled();
    expect(secondary().getByRole('button', { name: /Burn Expired/i })).toBeEnabled();
    expect(secondary().getByRole('button', { name: /Propose Cancel/i })).toBeEnabled();
    expect(screen.queryByTestId('settlement-proposal-card')).not.toBeInTheDocument();
    expect(screen.getByTestId('chain-fallback-notice')).toBeInTheDocument();
  });

  it('CHALLENGED taker: release yok; iptal teklifi etkin; yakım süresi dolmadan kapalı', () => {
    renderRoom({ maker: OTHER, taker: ME, state: 'CHALLENGED', paidAt: NOW_SEC - 100 * H, challengedAt: NOW_SEC - 10 * H });
    expect(screen.queryByRole('button', { name: /Release Funds/i })).not.toBeInTheDocument();
    expect(secondary().getByRole('button', { name: /Propose Cancel/i })).toBeEnabled();
    expect(screen.queryByRole('button', { name: /Burn Expired/i })).not.toBeInTheDocument();
    expect(screen.queryByTestId('settlement-proposal-card')).not.toBeInTheDocument();
  });

  it('LOCKED taker: dekont yüklemesi yok (ödeme bildirimi kapalı); 48 saat sonra kilidi çöz etkin', () => {
    renderRoom({ maker: OTHER, taker: ME, state: 'LOCKED', lockedAt: NOW_SEC - 2 * H });
    expect(document.getElementById('receipt-upload')).toBeNull();
    expect(primary().getByRole('button', { name: /Report Payment/i })).toBeDisabled();
    expect(screen.queryByTestId('pii-display')).not.toBeInTheDocument();
    cleanup();
    renderRoom({ maker: OTHER, taker: ME, state: 'LOCKED', lockedAt: NOW_SEC - 49 * H });
    expect(secondary().getByRole('button', { name: /I did not pay/i })).toBeEnabled();
  });

  it('karşı taraf zincirde iptal teklif ettiyse onay kartı görünür', () => {
    renderRoom({ state: 'LOCKED', lockedAt: NOW_SEC - 2 * H, cancelProposedByTaker: true });
    expect(screen.getByText(/Counterparty proposed a cancel/i)).toBeInTheDocument();
  });

  it('yedek mod pasifse (backend listesi var) aynı işlem normal odada açılır: PII görünür, not yok', () => {
    renderRoom({ maker: OTHER, taker: ME, state: 'LOCKED', lockedAt: NOW_SEC - 2 * H }, { chainFallback: { active: false }, isAuthenticated: true });
    expect(screen.queryByTestId('chain-fallback-notice')).not.toBeInTheDocument();
    expect(screen.getByTestId('pii-display')).toBeInTheDocument();
  });
});

describe('P4 yedek liste ve elle giriş', () => {
  it('yedek mod pasifken panel hiç render edilmez', () => {
    const { container } = render(<ChainFallbackTradesPanel lang="EN" chainFallback={{ active: false }} />);
    expect(container).toBeEmptyDOMElement();
  });

  it('ana sayfada yalnız yedek mod aktifken görünür', () => {
    const views = buildAppViews({ ...baseCtx, currentView: 'home', chainFallback: { ...baseCtx.chainFallback, active: false } });
    render(<div>{views.renderHome()}</div>);
    expect(screen.queryByTestId('chain-fallback-panel')).not.toBeInTheDocument();
    cleanup();
    const views2 = buildAppViews({ ...baseCtx, currentView: 'home' });
    render(<div>{views2.renderHome()}</div>);
    expect(screen.getByTestId('chain-fallback-panel')).toBeInTheDocument();
  });

  it('listeyi gösterir ve odayı açar', async () => {
    const user = userEvent.setup();
    const { trade } = roomTrade({ id: 12, state: 'PAID', paidAt: NOW_SEC - H });
    const openTrade = vi.fn();
    render(<ChainFallbackTradesPanel lang="EN" chainFallback={{ active: true, trades: [{ ...trade, role: 'maker' }], loadedAt: 1, openTrade, submitManualId: vi.fn() }} />);
    const row = screen.getByTestId('chain-fallback-row');
    expect(row).toHaveTextContent('#12');
    expect(row).toHaveTextContent('100 USDT');
    await user.click(within(row).getByRole('button', { name: /Open room/i }));
    expect(openTrade).toHaveBeenCalledWith(expect.objectContaining({ onchainId: '12' }));
  });

  it('elle giriş: geçersiz, başkasının işlemi ve uygun işlem', async () => {
    const user = userEvent.setup();
    const openTrade = vi.fn();
    const okTrade = { onchainId: '4', state: 'LOCKED' };
    const submitManualId = vi.fn(async (v) => {
      if (v === 'abc') return { status: 'invalid' };
      if (v === '2') return { status: 'not_party' };
      return { status: 'ok', trade: okTrade };
    });
    render(<ChainFallbackTradesPanel lang="TR" chainFallback={{ active: true, trades: [], loadedAt: 1, openTrade, submitManualId }} />);
    const input = screen.getByLabelText('İşlem numarasıyla aç');
    await user.type(input, 'abc');
    await user.click(screen.getByRole('button', { name: 'Aç' }));
    expect(await screen.findByTestId('chain-fallback-manual-message')).toHaveAttribute('data-status', 'invalid');
    await user.clear(input);
    await user.type(input, '2');
    await user.click(screen.getByRole('button', { name: 'Aç' }));
    expect(await screen.findByText('Bu işlemde tarafınız yok.')).toBeInTheDocument();
    expect(openTrade).not.toHaveBeenCalled();
    await user.clear(input);
    await user.type(input, '4');
    await user.click(screen.getByRole('button', { name: 'Aç' }));
    expect(openTrade).toHaveBeenCalledWith(okTrade);
  });
});
