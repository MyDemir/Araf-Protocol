import { describe, expect, it, vi } from 'vitest';
import { buildTradeRoomActions } from '../../frontend/src/app/actions/contractLifecycleActions';
import { buildTradeRoomPanelCallbacks } from '../../frontend/src/app/contexts/trade-room/tradeRoomPanelActions';
import { buildTradeDecisionModel } from '../../frontend/src/app/contexts/trade-room/tradeDecisionModel';

const deps = (over = {}) => ({
  lang: 'EN',
  activeTrade: { id: 'db', onchainId: '9' },
  isContractLoading: false,
  revokeCancel: vi.fn().mockResolvedValue(undefined),
  showToast: vi.fn(),
  fetchMyTrades: vi.fn().mockResolvedValue(undefined),
  setIsContractLoading: vi.fn(),
  setCancelStatus: vi.fn(),
  ...over,
});

describe('item 3: revokeCancel', () => {
  it('handleRevokeCancel sends revokeCancel(onchainId) and clears the local cancel status', async () => {
    const d = deps();
    await buildTradeRoomActions(d).handleRevokeCancel();
    expect(d.revokeCancel).toHaveBeenCalledWith('9');
    expect(d.setCancelStatus).toHaveBeenCalledWith(null);
  });

  it('does nothing without a valid on-chain id and keeps status on failure', async () => {
    const none = deps({ activeTrade: { id: 'db', onchainId: '0' } });
    await buildTradeRoomActions(none).handleRevokeCancel();
    expect(none.revokeCancel).not.toHaveBeenCalled();

    vi.spyOn(console, 'error').mockImplementation(() => {});
    const failing = deps({ revokeCancel: vi.fn().mockRejectedValue(new Error('x')) });
    await buildTradeRoomActions(failing).handleRevokeCancel();
    expect(failing.setCancelStatus).not.toHaveBeenCalled();
    expect(failing.showToast).toHaveBeenCalledWith(expect.any(String), 'error');
  });

  it('panel callback revoke_cancel is wired to the handler', () => {
    const handleRevokeCancel = vi.fn();
    const cb = buildTradeRoomPanelCallbacks({ lang: 'EN', activeTrade: { onchainId: 1 }, roomState: 'PAID', hasOnchainTradeId: true, handleRevokeCancel });
    expect(cb.revoke_cancel.disabled).toBe(false);
    cb.revoke_cancel.onClick();
    expect(handleRevokeCancel).toHaveBeenCalled();
  });
});

describe('item 5: reportPayment closes after the payment window', () => {
  const lockedAgo = (h) => new Date(Date.now() - h * 3600e3).toISOString();
  it('report_payment is disabled with a "time expired" reason once the window has passed', () => {
    const mk = (paymentWindowExpired) => buildTradeRoomPanelCallbacks({
      lang: 'EN', activeTrade: { onchainId: 1, lockedAt: lockedAgo(49) }, roomState: 'LOCKED', hasOnchainTradeId: true,
      handleReportPayment: () => {}, paymentWindowExpired,
    }).report_payment;
    expect(mk(false).disabled).toBe(false);
    expect(mk(true).disabled).toBe(true);
    expect(mk(true).disabledReasons.join(' ')).toMatch(/Time expired/);
  });

  it('decision model no longer offers report_payment to the taker after expiry', () => {
    const model = buildTradeDecisionModel({
      trade: { id: 't', onchainId: 1 }, tradeState: 'LOCKED', userRole: 'taker', paymentIpfsHash: 'h', timers: {},
      isConnected: true, isAuthenticated: true, isSupportedChain: true, isPaused: false, lang: 'EN', paymentWindowExpired: true,
    });
    expect(model.primaryAction.key).not.toBe('report_payment');
    expect(model.primaryAction.label).toBe('Time expired');
  });
});
