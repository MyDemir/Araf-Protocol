import { describe, expect, it, vi } from 'vitest';
import { buildTradeRoomActions, isReceiptUncertainError, buildProfileActions } from '../../frontend/src/app/actions/contractLifecycleActions';

const named = (name) => Object.assign(new Error('boom'), { name });

describe('P19b receipt belirsizliği yalnız viem receipt hata adlarıyla', () => {
  it('receipt timeout/not-found belirsiz sayılır', () => {
    expect(isReceiptUncertainError(named('WaitForTransactionReceiptTimeoutError'))).toBe(true);
    expect(isReceiptUncertainError(named('TransactionReceiptNotFoundError'))).toBe(true);
  });

  it('gönderim öncesi HTTP timeout "gönderildi" sayılmaz', () => {
    expect(isReceiptUncertainError(named('HttpRequestTimeoutError'))).toBe(false);
    expect(isReceiptUncertainError(named('TimeoutError'))).toBe(false);
    expect(isReceiptUncertainError(named('ContractFunctionExecutionError'))).toBe(false);
  });

  it('report akışında HTTP timeout hata olarak gösterilir', async () => {
    const showToast = vi.fn();
    const deps = {
      lang: 'EN', activeTrade: { id: 'db', onchainId: '9' }, activeEscrows: [], paymentIpfsHash: 'h', isContractLoading: false,
      reportPayment: vi.fn().mockRejectedValue(Object.assign(new Error('request timed out'), { name: 'HttpRequestTimeoutError' })),
      showToast, setIsContractLoading: vi.fn(), setPaymentIpfsHash: vi.fn(), setActiveTrade: vi.fn(), setTradeState: vi.fn(),
    };
    await buildTradeRoomActions(deps).handleReportPayment();
    expect(showToast).toHaveBeenLastCalledWith('request timed out', 'error');
  });

  it('registerWallet: HTTP timeout "gönderildi" bilgisi vermez', async () => {
    const showToast = vi.fn();
    const deps = {
      lang: 'EN', isContractLoading: false, isRegisteringWallet: false, isWalletRegistered: false,
      registerWallet: vi.fn().mockRejectedValue(Object.assign(new Error('request timed out'), { name: 'HttpRequestTimeoutError' })),
      showToast, setIsRegisteringWallet: vi.fn(), setIsWalletRegistered: vi.fn(),
    };
    await buildProfileActions(deps).handleRegisterWallet();
    expect(showToast).toHaveBeenLastCalledWith('request timed out', 'error');
  });
});
