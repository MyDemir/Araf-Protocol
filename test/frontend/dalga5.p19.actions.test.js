import { describe, expect, it, vi } from 'vitest';
import { buildProfileActions, buildTradeRoomActions } from '../../frontend/src/app/actions/contractLifecycleActions';
import { parseAppHashRoute } from '../../frontend/src/app/actions/tradeNavigationActions';
import { diagnoseWriteError } from '../../frontend/src/app/walletRpcDiagnosis';
import { setClockOffset } from '../../frontend/src/app/clock';

const tradeDeps = (o = {}) => ({
  lang: 'EN', activeTrade: { id: 'db', onchainId: '9' }, activeEscrows: [], paymentIpfsHash: 'h',
  resolvedTradeState: 'PAID', chargebackAccepted: true, isContractLoading: false,
  canMakerStartChallengeFlow: true, canMakerChallenge: true,
  reportPayment: vi.fn().mockResolvedValue(undefined), releaseFunds: vi.fn().mockResolvedValue(undefined),
  proposeOrApproveCancel: vi.fn().mockResolvedValue(undefined), pingTakerForChallenge: vi.fn().mockResolvedValue(undefined),
  authenticatedFetch: vi.fn(), showToast: vi.fn(), fetchMyTrades: vi.fn(), refreshTrades: vi.fn(),
  setIsContractLoading: vi.fn(), setActiveTrade: vi.fn(), setTradeState: vi.fn(), setPaymentIpfsHash: vi.fn(),
  setCancelStatus: vi.fn(), setChargebackAccepted: vi.fn(), setCurrentView: vi.fn(), setLoadingText: vi.fn(),
  ...o,
});

describe('P19 F2-05 kullanıcı reddi hata nesnesinden', () => {
  it('RevenueHookFailed (EN, "rejected" içerir) iptal sayılmaz', async () => {
    const err = Object.assign(new Error('x'), { shortMessage: 'Protocol treasury rejected the transfer. Try later.', arafErrorName: 'RevenueHookFailed' });
    const deps = tradeDeps({ reportPayment: vi.fn().mockRejectedValue(err) });
    await buildTradeRoomActions(deps).handleReportPayment();
    expect(deps.showToast).toHaveBeenLastCalledWith('Protocol treasury rejected the transfer. Try later.', 'error');
  });
  it('code 4001 iptal sayılır', async () => {
    const err = Object.assign(new Error('x'), { code: 4001 });
    const deps = tradeDeps({ reportPayment: vi.fn().mockRejectedValue(err) });
    await buildTradeRoomActions(deps).handleReportPayment();
    expect(deps.showToast).toHaveBeenLastCalledWith('Transaction cancelled.', 'error');
  });
});

describe('P19 F2-06 receipt zaman aşımı belirsiz', () => {
  it('rapor ödeme timeout -> info, hata değil', async () => {
    const err = Object.assign(new Error('Timed out'), { name: 'WaitForTransactionReceiptTimeoutError' });
    const deps = tradeDeps({ reportPayment: vi.fn().mockRejectedValue(err) });
    await buildTradeRoomActions(deps).handleReportPayment();
    const [msg, type] = deps.showToast.mock.calls.at(-1);
    expect(type).toBe('info');
    expect(msg).toMatch(/verifying on-chain/);
  });
});

describe('P19 F2-07 bozuk hash', () => {
  it('#/trade/% çökmez, null döner', () => {
    expect(parseAppHashRoute('#/trade/%')).toBeNull();
    expect(parseAppHashRoute('#/trade/%E0%A4%A')).toBeNull();
    expect(parseAppHashRoute('#/trade/12')).toEqual({ view: 'tradeRoom', tradeId: '12' });
  });
});

describe('P19 F2-08 iptal sonrası geride kalan okuma', () => {
  it('karşı taraf onaylamışsa yeniden okur ve CANCELED görünce kapatır', async () => {
    const getTrade = vi.fn().mockResolvedValueOnce({ state: 2 }).mockResolvedValue({ state: 5 });
    const deps = tradeDeps({ cancelStatus: 'proposed_by_other', getTrade, sleep: vi.fn().mockResolvedValue(undefined), finishTrade: vi.fn() });
    await buildTradeRoomActions(deps).handleProposeCancel();
    expect(getTrade.mock.calls.length).toBeGreaterThan(1);
    expect(deps.setCancelStatus).not.toHaveBeenCalledWith('proposed_by_me');
  });
});

describe('P19 F2-12 zincir saati', () => {
  it('ping damgası zincir saatinden gelir', async () => {
    setClockOffset(3_600_000);
    const before = Date.now();
    const deps = tradeDeps();
    await buildTradeRoomActions(deps).handleChallenge();
    setClockOffset(0);
    const updater = deps.setActiveTrade.mock.calls[0][0];
    const next = updater({ onchainId: '9' });
    expect(new Date(next.challengePingedAt).getTime()).toBeGreaterThanOrEqual(before + 3_600_000 - 1000);
  });
});

describe('P19 F2-10 bekleyen cüzdan isteği', () => {
  it('-32002 "RPC değiştirin" değil, bekleyen istek mesajı', async () => {
    const error = Object.assign(new Error('Request already pending'), { code: -32002 });
    const simulateContract = vi.fn().mockResolvedValue({});
    const d = await diagnoseWriteError({ error, publicClient: { simulateContract }, account: '0x1', address: '0x2', abi: [], functionName: 'f', args: [], chainId: 8453, lang: 'EN' });
    expect(d.kind).toBe('wallet-request-pending');
    expect(d.message).toMatch(/pending request/);
    expect(simulateContract).not.toHaveBeenCalled();
  });
});

describe('P19 PROFILE_UPDATE_CONFLICT', () => {
  const run = async (lang, body = { code: 'PROFILE_UPDATE_CONFLICT' }) => {
    const res = { status: 409, ok: false, json: async () => body };
    const deps = {
      lang, isContractLoading: false, requireSignedSessionForActiveWallet: () => true,
      authenticatedFetch: vi.fn().mockResolvedValue(res), canonicalizePayoutProfileDraft: (x) => x, payoutProfileDraft: {},
      showToast: vi.fn(), setIsContractLoading: vi.fn(),
    };
    await buildProfileActions(deps).handleUpdatePII({ preventDefault: vi.fn() });
    return deps.showToast.mock.calls.at(-1);
  };
  it('TR', async () => expect(await run('TR')).toEqual(['Profil başka bir oturumda güncellendi, lütfen yeniden deneyin.', 'error']));
  it('EN', async () => expect(await run('EN')).toEqual(['Your profile was updated elsewhere, please try again.', 'error']));
  it('düz 409 hâlâ aktif trade mesajı', async () => {
    expect((await run('EN', {}))[0]).toMatch(/active trades/);
  });
});
