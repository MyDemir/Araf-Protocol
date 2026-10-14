import React from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { buildStartTradeAction } from '../../frontend/src/app/actions/contractLifecycleActions';
import { buildAppModals } from '../../frontend/src/app/AppModals';
import { useFillConfirm, FILL_CONFIRM_TIMEOUT_MS } from '../../frontend/src/app/useFillConfirm';
import { mapApiOrderToUi } from '../../frontend/src/app/orderUiModel';
import { resolveNewTxGate } from '../../frontend/src/app/txGate';
import FillConfirmSheet from '../../frontend/src/components/FillConfirmSheet';

afterEach(() => cleanup());

const ADDR = '0xabc0000000000000000000000000000000000000';
const OPEN_GATE = resolveNewTxGate({ rpcChecked: true });

const chainOrder = (over = {}) => ({
  tokenAddress: '0x0000000000000000000000000000000000000002',
  remainingAmount: 100_000_000n,
  minFillAmount: 10_000_000n,
  tier: 2,
  takerFeeBpsSnapshot: 20,
  makerFeeBpsSnapshot: 10,
  ...over,
});

const uiOrder = (over = {}) => ({
  id: 'order-1', onchainId: 12, crypto: 'USDT', side: 'SELL_CRYPTO', fiat: 'TRY', rate: 32.5, hasPrice: true,
  tokenDecimals: 6, maker: '0x1234...abcd', tier: 2, ...over,
});

const makeDeps = (over = {}) => ({
  lang: 'TR',
  address: ADDR,
  isBanned: false,
  isContractLoading: () => false,
  supportedTokenAddresses: { USDT: '0x0000000000000000000000000000000000000001' },
  getOrder: vi.fn(async () => chainOrder()),
  getAllowance: vi.fn(async () => 1_000_000_000n),
  approveToken: vi.fn(async () => undefined),
  fillSellOrder: vi.fn(async () => ({ tradeId: 77n })),
  fillBuyOrder: vi.fn(async () => ({ tradeId: 88n })),
  createSellOrder: vi.fn(), createBuyOrder: vi.fn(), cancelSellOrder: vi.fn(), cancelBuyOrder: vi.fn(),
  authenticatedFetch: vi.fn(async () => ({ ok: true, json: async () => ({ trade: { _id: 'backend-trade-77' } }) })),
  showToast: vi.fn(),
  setIsContractLoading: vi.fn(), setLoadingText: vi.fn(), setActiveTrade: vi.fn(), setTradeState: vi.fn(),
  setCancelStatus: vi.fn(), setChargebackAccepted: vi.fn(), setCurrentView: vi.fn(),
  hasPayoutProfile: true,
  getReputation: vi.fn(async () => ({ successful: 0, riskPoints: 0 })),
  sleep: vi.fn(async () => undefined),
  ...over,
});

// Gerçek bağlantı: hook + AppModals.renderFillConfirm + eylem, App.jsx'teki gibi.
function Harness({ lang = 'TR', gateRef, deps, orderArg, onReady }) {
  const { confirmFill, fillConfirmSummary, settleFillConfirm } = useFillConfirm();
  const gate = gateRef.current;
  const modals = buildAppModals({ lang, txGate: gate, fillConfirmSummary, settleFillConfirm });
  React.useEffect(() => {
    onReady(() => buildStartTradeAction({ ...deps, lang, confirmFill, txGate: () => gateRef.current })(orderArg));
  }, []); // eslint-disable-line react-hooks/exhaustive-deps
  return <div>{modals.renderFillConfirm()}</div>;
}

const setup = async ({ lang = 'TR', depsOver = {}, orderArg = uiOrder(), gate = OPEN_GATE } = {}) => {
  const gateRef = { current: gate };
  const deps = makeDeps({ lang, ...depsOver });
  let start;
  const view = render(<Harness lang={lang} gateRef={gateRef} deps={deps} orderArg={orderArg} onReady={(fn) => { start = fn; }} />);
  const rerender = (nextGate) => { gateRef.current = nextGate; view.rerender(<Harness lang={lang} gateRef={gateRef} deps={deps} orderArg={orderArg} onReady={() => {}} />); };
  let done;
  act(() => { done = start(); });
  return { deps, rerender, done: () => done };
};

describe('fill confirm sheet: values', () => {
  it('opens as a dialog and shows direction, amount, fiat, rate, counterparty, bond, fee, rail, window and warning (TR)', async () => {
    await setup({ lang: 'TR' });
    const sheet = await screen.findByTestId('fill-confirm-sheet');
    expect(screen.getByRole('dialog')).toBeInTheDocument();
    expect(sheet).toHaveTextContent('Alıyorsun');
    // 100 USDT dolduruluyor (zincirdeki kalan); sell emrini dolduran taker yalnız teminat öder.
    expect(screen.getByTestId('fill-confirm-amount')).toHaveTextContent('100 USDT');
    // 100 * 32,5 = 3.250,00 TRY; tr-TR ayırıcıları
    expect(screen.getByTestId('fill-confirm-fiat')).toHaveTextContent('3.250,00 TRY');
    expect(screen.getByTestId('fill-confirm-rate')).toHaveTextContent('Kur: 32,5 TRY / USDT');
    expect(screen.getByTestId('fill-confirm-counterparty')).toHaveTextContent('0x1234...abcd');
    expect(screen.getByTestId('fill-confirm-counterparty')).toHaveTextContent('Tier 2');
    // Tier 2 taker %8 temel, temiz itibar için (successful=0) düzeltme yok -> 8 USDT
    expect(screen.getByTestId('fill-confirm-bond')).toHaveTextContent('8 USDT');
    expect(screen.getByTestId('fill-confirm-total')).toHaveTextContent('8 USDT');
    // taker ücreti 20 bps = %0,2 -> 0,2 USDT
    expect(screen.getByTestId('fill-confirm-fee')).toHaveTextContent('%0,2');
    expect(screen.getByTestId('fill-confirm-fee')).toHaveTextContent('0,2 USDT');
    expect(screen.getByTestId('fill-confirm-window')).toHaveTextContent('48 saat');
    expect(screen.getByTestId('fill-confirm-warning')).toHaveTextContent('teminatından ceza kesilir');
    expect(screen.getByRole('button', { name: 'Onayla ve devam et' })).toBeEnabled();
    expect(screen.getByRole('button', { name: 'Vazgeç' })).toBeInTheDocument();
  });

  it('uses English separators and wording for EN', async () => {
    await setup({ lang: 'EN' });
    await screen.findByTestId('fill-confirm-sheet');
    expect(screen.getByTestId('fill-confirm-fiat')).toHaveTextContent('3,250.00 TRY');
    expect(screen.getByTestId('fill-confirm-rate')).toHaveTextContent('Rate: 32.5 TRY / USDT');
    expect(screen.getByTestId('fill-confirm-fee')).toHaveTextContent('0.2%');
    expect(screen.getByRole('button', { name: 'Confirm and continue' })).toBeInTheDocument();
  });

  it('sell direction on a buy order: amount + bond leave the wallet, maker fee comes from the bond', async () => {
    await setup({ lang: 'TR', orderArg: uiOrder({ side: 'BUY_CRYPTO' }) });
    await screen.findByTestId('fill-confirm-sheet');
    expect(screen.getByRole('dialog')).toHaveTextContent('Satıyorsun');
    // Tier 2 maker %6 -> 6 USDT teminat, toplam 106
    expect(screen.getByTestId('fill-confirm-bond')).toHaveTextContent('6 USDT');
    expect(screen.getByTestId('fill-confirm-total')).toHaveTextContent('106 USDT');
    expect(screen.getByTestId('fill-confirm-fee')).toHaveTextContent('%0,1');
    expect(screen.getByTestId('fill-confirm-fee')).toHaveTextContent('teminatından kesilir');
  });

  it('hides the rail row and shows "Bilinmiyor" for rate and fee when there is no source (nothing invented)', async () => {
    await setup({
      lang: 'TR',
      orderArg: uiOrder({ rate: 0, hasPrice: false, fiat: null }),
      depsOver: { getOrder: vi.fn(async () => ({ ...chainOrder(), takerFeeBpsSnapshot: undefined, makerFeeBpsSnapshot: undefined })) },
    });
    await screen.findByTestId('fill-confirm-sheet');
    expect(screen.queryByTestId('fill-confirm-rail')).toBeNull();
    expect(screen.getByTestId('fill-confirm-fee')).toHaveTextContent('Bilinmiyor');
    expect(screen.getByTestId('fill-confirm-fiat')).toHaveTextContent('Kur belirtilmedi');
    expect(screen.queryByTestId('fill-confirm-rate')).toBeNull();
  });

  it('marks the bond as an upper bound when reputation could not be read', async () => {
    await setup({ lang: 'TR', depsOver: { getReputation: vi.fn(async () => { throw new Error('rpc'); }) } });
    await screen.findByTestId('fill-confirm-sheet');
    // %8 + 3 puan ceza varsayımı = %11 -> 11 USDT, "En fazla"
    expect(screen.getByTestId('fill-confirm-bond')).toHaveTextContent('En fazla 11 USDT');
  });

  it('shows the on-chain partial fill amount that the fill transaction will use', async () => {
    const { deps } = await setup({ lang: 'EN', orderArg: uiOrder({ fillAmountRaw: '25500000' }) });
    await screen.findByTestId('fill-confirm-sheet');
    expect(screen.getByTestId('fill-confirm-amount')).toHaveTextContent('25.5 USDT');
    fireEvent.click(screen.getByTestId('fill-confirm-accept'));
    await waitFor(() => expect(deps.fillSellOrder).toHaveBeenCalled());
    expect(deps.fillSellOrder.mock.calls[0][1]).toBe(25_500_000n);
  });
});

describe('fill confirm sheet: flow semantics (same as window.confirm)', () => {
  it('cancel button: no approve, no fill, no allowance read', async () => {
    const { deps, done } = await setup();
    await screen.findByTestId('fill-confirm-sheet');
    fireEvent.click(screen.getByRole('button', { name: 'Vazgeç' }));
    await done();
    expect(screen.queryByTestId('fill-confirm-sheet')).toBeNull();
    expect(deps.approveToken).not.toHaveBeenCalled();
    expect(deps.fillSellOrder).not.toHaveBeenCalled();
    expect(deps.fillBuyOrder).not.toHaveBeenCalled();
    expect(deps.getAllowance).not.toHaveBeenCalled();
    expect(deps.setIsContractLoading).toHaveBeenLastCalledWith(false);
  });

  it('Esc cancels: no tx', async () => {
    const { deps, done } = await setup();
    await screen.findByTestId('fill-confirm-sheet');
    fireEvent.keyDown(window, { key: 'Escape' });
    await done();
    expect(screen.queryByTestId('fill-confirm-sheet')).toBeNull();
    expect(deps.approveToken).not.toHaveBeenCalled();
    expect(deps.fillSellOrder).not.toHaveBeenCalled();
  });

  it('backdrop click cancels: no tx', async () => {
    const { deps, done } = await setup();
    const dialog = await screen.findByRole('dialog');
    fireEvent.click(dialog);
    await done();
    expect(deps.approveToken).not.toHaveBeenCalled();
    expect(deps.fillSellOrder).not.toHaveBeenCalled();
  });

  it('click inside the panel does not cancel', async () => {
    const { deps } = await setup();
    fireEvent.click(await screen.findByTestId('fill-confirm-sheet'));
    expect(screen.getByTestId('fill-confirm-sheet')).toBeInTheDocument();
    expect(deps.fillSellOrder).not.toHaveBeenCalled();
  });

  it('confirm: gate check, then approve, then fill; the flow continues unchanged', async () => {
    const order = [];
    const { deps, done } = await setup({
      depsOver: {
        getAllowance: vi.fn(async () => 0n),
        approveToken: vi.fn(async () => { order.push('approve'); }),
        fillSellOrder: vi.fn(async () => { order.push('fill'); return { tradeId: 77n }; }),
      },
    });
    await screen.findByTestId('fill-confirm-sheet');
    expect(deps.approveToken).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: 'Onayla ve devam et' }));
    await done();
    expect(order).toEqual(['approve', 'fill']);
    // approve tutarı = yalnız teminat (8 USDT), eskisiyle aynı
    expect(deps.approveToken).toHaveBeenCalledWith('0x0000000000000000000000000000000000000002', 8_000_000n);
    expect(deps.fillSellOrder).toHaveBeenCalledWith(12n, 100_000_000n, expect.any(String));
    expect(deps.setCurrentView).toHaveBeenCalledWith('tradeRoom');
    expect(screen.queryByTestId('fill-confirm-sheet')).toBeNull();
  });

  it('confirm button is disabled while the tx gate is closed, and shows the reason', async () => {
    const { rerender } = await setup();
    await screen.findByTestId('fill-confirm-sheet');
    expect(screen.getByRole('button', { name: 'Onayla ve devam et' })).toBeEnabled();
    act(() => rerender(resolveNewTxGate({ rpcChecked: true, backendUnreachable: true, lang: 'TR' })));
    expect(screen.getByRole('button', { name: 'Onayla ve devam et' })).toBeDisabled();
    expect(screen.getByTestId('fill-confirm-gate')).toHaveTextContent('doğrulanamıyor');
    // Altyapı düzelirse tekrar açılır.
    act(() => rerender(OPEN_GATE));
    expect(screen.getByRole('button', { name: 'Onayla ve devam et' })).toBeEnabled();
  });

  it('gate closes while open: clicking the disabled confirm sends nothing, cancel still works', async () => {
    const { deps, rerender, done } = await setup();
    await screen.findByTestId('fill-confirm-sheet');
    act(() => rerender(resolveNewTxGate({ rpcChecked: true, rpcUnreachable: true, lang: 'TR' })));
    fireEvent.click(screen.getByRole('button', { name: 'Onayla ve devam et' }));
    expect(deps.approveToken).not.toHaveBeenCalled();
    expect(deps.fillSellOrder).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: 'Vazgeç' }));
    await done();
    expect(deps.fillSellOrder).not.toHaveBeenCalled();
  });

  it('action re-checks the gate right after confirmation, before approve', async () => {
    const showToast = vi.fn();
    const deps = makeDeps({ getAllowance: vi.fn(async () => 0n), showToast });
    let gate = OPEN_GATE;
    const confirmFill = vi.fn(async () => { gate = resolveNewTxGate({ rpcChecked: true, backendUnreachable: true, lang: 'TR' }); return true; });
    await buildStartTradeAction({ ...deps, confirmFill, txGate: () => gate })(uiOrder());
    expect(confirmFill).toHaveBeenCalledTimes(1);
    expect(deps.approveToken).not.toHaveBeenCalled();
    expect(deps.fillSellOrder).not.toHaveBeenCalled();
    expect(showToast).toHaveBeenCalledWith(expect.stringMatching(/doğrulanamıyor/), 'error');
    expect(deps.setIsContractLoading).toHaveBeenLastCalledWith(false);
  });

  it('the first gate check still runs before any read or confirmation', async () => {
    const deps = makeDeps();
    const confirmFill = vi.fn(async () => true);
    await buildStartTradeAction({ ...deps, confirmFill, txGate: () => resolveNewTxGate({ rpcChecked: false }) })(uiOrder());
    expect(confirmFill).not.toHaveBeenCalled();
    expect(deps.getOrder).not.toHaveBeenCalled();
  });

  it('without confirmFill the legacy confirmFn path is unchanged', async () => {
    const confirmFn = vi.fn(() => false);
    const deps = makeDeps({ lang: 'EN', confirmFn });
    await buildStartTradeAction(deps)(uiOrder());
    expect(confirmFn).toHaveBeenCalledWith('Do you confirm the transaction?');
    expect(deps.getOrder).not.toHaveBeenCalled();
  });

  it('unmounting while open resolves as cancel (no tx)', async () => {
    const { deps, done } = await setup();
    await screen.findByTestId('fill-confirm-sheet');
    cleanup();
    await done();
    expect(deps.approveToken).not.toHaveBeenCalled();
    expect(deps.fillSellOrder).not.toHaveBeenCalled();
  });
});

describe('fill confirm sheet: rail and fee note', () => {
  it('shows the readable rail name from order.paymentRail (TR and EN)', async () => {
    await setup({ lang: 'TR', orderArg: uiOrder({ paymentRail: 'TR_IBAN' }) });
    await screen.findByTestId('fill-confirm-sheet');
    expect(screen.getByTestId('fill-confirm-rail')).toHaveTextContent('Türkiye (IBAN)');
    cleanup();
    await setup({ lang: 'EN', orderArg: uiOrder({ paymentRail: 'SEPA_IBAN' }) });
    await screen.findByTestId('fill-confirm-sheet');
    expect(screen.getByTestId('fill-confirm-rail')).toHaveTextContent('Europe (SEPA)');
  });

  it('an unknown rail code hides the row instead of printing the raw code', async () => {
    await setup({ lang: 'TR', orderArg: uiOrder({ paymentRail: 'WEIRD_RAIL' }) });
    await screen.findByTestId('fill-confirm-sheet');
    expect(screen.queryByTestId('fill-confirm-rail')).toBeNull();
    expect(screen.getByTestId('fill-confirm-sheet')).not.toHaveTextContent('WEIRD_RAIL');
  });

  it('fee note explains partial settlement (gross payout) and mutual cancel (from the bond)', async () => {
    await setup({ lang: 'TR' });
    await screen.findByTestId('fill-confirm-sheet');
    const note = screen.getByTestId('fill-confirm-fee-note');
    expect(note).toHaveTextContent('brüt tutardan');
    expect(note).toHaveTextContent('teminattan kesilir');
    expect(note).toHaveTextContent('ödeme bildirilmeden iptalde ücret yoktur');
  });

  it('orderUiModel maps owner_rail to paymentRail (code only) and null when absent', () => {
    const base = { _id: '507f1f77bcf86cd799439011', onchain_order_id: '1', owner_address: ADDR, side: 'SELL_CRYPTO', status: 'OPEN', tier: 1, token_address: '0x1', market: {}, amounts: {} };
    expect(mapApiOrderToUi({ order: { ...base, owner_rail: 'US_ACH' } }).paymentRail).toBe('US_ACH');
    expect(mapApiOrderToUi({ order: { ...base } }).paymentRail).toBeNull();
    expect(mapApiOrderToUi({ order: { ...base, owner_rail: '' } }).paymentRail).toBeNull();
  });
});

describe('fill confirm sheet: re-read after confirmation', () => {
  it('unchanged state: a single confirmation goes straight to approve/fill (second read confirms nothing changed)', async () => {
    const { deps, done } = await setup({ depsOver: { getAllowance: vi.fn(async () => 0n) } });
    await screen.findByTestId('fill-confirm-sheet');
    fireEvent.click(screen.getByTestId('fill-confirm-accept'));
    await done();
    expect(deps.getOrder).toHaveBeenCalledTimes(2);
    expect(deps.getReputation).toHaveBeenCalledTimes(2);
    expect(screen.queryByTestId('fill-confirm-changed')).toBeNull();
    expect(deps.approveToken).toHaveBeenCalledTimes(1);
    expect(deps.fillSellOrder).toHaveBeenCalledTimes(1);
  });

  it('reputation worsens after confirm: no approve, sheet re-opens with new bond and a "changed" note, second confirm uses new amounts', async () => {
    // Yeterli allowance önceden verilmiş olsa bile eski (düşük) teminat gösterilip yüksek teminat çekilmemeli.
    const getReputation = vi.fn()
      .mockResolvedValueOnce({ successful: 0, riskPoints: 0 })
      .mockResolvedValue({ successful: 0, riskPoints: 2 });
    const { deps, done } = await setup({ depsOver: { getReputation, getAllowance: vi.fn(async () => 0n) } });
    await screen.findByTestId('fill-confirm-sheet');
    expect(screen.getByTestId('fill-confirm-bond')).toHaveTextContent('8 USDT');
    fireEvent.click(screen.getByTestId('fill-confirm-accept'));
    // Yeni değerlerle yeniden açılır (tier 2 taker %8 + 300 bps ceza = %11)
    await waitFor(() => expect(screen.getByTestId('fill-confirm-changed')).toBeInTheDocument());
    expect(screen.getByTestId('fill-confirm-changed')).toHaveTextContent('Koşullar değişti');
    expect(screen.getByTestId('fill-confirm-bond')).toHaveTextContent('11 USDT');
    expect(deps.approveToken).not.toHaveBeenCalled();
    expect(deps.fillSellOrder).not.toHaveBeenCalled();
    fireEvent.click(screen.getByTestId('fill-confirm-accept'));
    await done();
    expect(deps.approveToken).toHaveBeenCalledTimes(1);
    expect(deps.approveToken).toHaveBeenCalledWith('0x0000000000000000000000000000000000000002', 11_000_000n);
    expect(deps.fillSellOrder).toHaveBeenCalledTimes(1);
  });

  it('remaining amount shrinks after confirm: re-opens with the new amount, never approves for the stale one', async () => {
    const getOrder = vi.fn()
      .mockResolvedValueOnce(chainOrder())
      .mockResolvedValue(chainOrder({ remainingAmount: 60_000_000n }));
    const { deps, done } = await setup({ lang: 'EN', depsOver: { getOrder, getAllowance: vi.fn(async () => 0n) } });
    await screen.findByTestId('fill-confirm-sheet');
    expect(screen.getByTestId('fill-confirm-amount')).toHaveTextContent('100 USDT');
    fireEvent.click(screen.getByTestId('fill-confirm-accept'));
    await waitFor(() => expect(screen.getByTestId('fill-confirm-changed')).toBeInTheDocument());
    expect(screen.getByTestId('fill-confirm-amount')).toHaveTextContent('60 USDT');
    expect(deps.approveToken).not.toHaveBeenCalled();
    fireEvent.click(screen.getByTestId('fill-confirm-accept'));
    await done();
    expect(deps.fillSellOrder).toHaveBeenCalledWith(12n, 60_000_000n, expect.any(String));
    expect(deps.approveToken).toHaveBeenCalledWith('0x0000000000000000000000000000000000000002', 4_800_000n);
  });

  it('order state changes after confirm: re-opens instead of sending', async () => {
    const getOrder = vi.fn()
      .mockResolvedValueOnce(chainOrder({ state: 0 }))
      .mockResolvedValue(chainOrder({ state: 1 }));
    const { deps, done } = await setup({ depsOver: { getOrder } });
    await screen.findByTestId('fill-confirm-sheet');
    fireEvent.click(screen.getByTestId('fill-confirm-accept'));
    await waitFor(() => expect(screen.getByTestId('fill-confirm-changed')).toBeInTheDocument());
    expect(deps.fillSellOrder).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: 'Vazgeç' }));
    await done();
    expect(deps.approveToken).not.toHaveBeenCalled();
    expect(deps.fillSellOrder).not.toHaveBeenCalled();
  });

  it('order fully filled during the confirmation: stops with a toast, no tx', async () => {
    const getOrder = vi.fn()
      .mockResolvedValueOnce(chainOrder())
      .mockResolvedValue(chainOrder({ remainingAmount: 0n }));
    const { deps, done } = await setup({ depsOver: { getOrder } });
    await screen.findByTestId('fill-confirm-sheet');
    fireEvent.click(screen.getByTestId('fill-confirm-accept'));
    await done();
    expect(deps.showToast).toHaveBeenCalledWith(expect.stringContaining('Order dolu'), 'error');
    expect(deps.approveToken).not.toHaveBeenCalled();
    expect(deps.fillSellOrder).not.toHaveBeenCalled();
  });

  it('stops after too many consecutive changes', async () => {
    let n = 0;
    const getOrder = vi.fn(async () => chainOrder({ remainingAmount: BigInt(100_000_000 - (n++) * 1_000_000) }));
    const { deps, done } = await setup({ depsOver: { getOrder } });
    for (let i = 0; i < 5; i += 1) {
      await waitFor(() => expect(screen.getByTestId('fill-confirm-accept')).toBeInTheDocument());
      fireEvent.click(screen.getByTestId('fill-confirm-accept'));
      await waitFor(() => expect(deps.getOrder).toHaveBeenCalledTimes(2 + i));
    }
    await done();
    expect(deps.showToast).toHaveBeenCalledWith(expect.stringContaining('Koşullar tekrar tekrar değişti'), 'error');
    expect(deps.fillSellOrder).not.toHaveBeenCalled();
    expect(deps.approveToken).not.toHaveBeenCalled();
  });
});

describe('fill confirm sheet: timeout', () => {
  it('action: a timed-out confirmation sends nothing and tells the user', async () => {
    const deps = makeDeps({ getAllowance: vi.fn(async () => 0n) });
    const confirmFill = vi.fn(async () => 'timeout');
    await buildStartTradeAction({ ...deps, confirmFill, txGate: () => OPEN_GATE })(uiOrder());
    expect(deps.showToast).toHaveBeenCalledWith(expect.stringContaining('Onay süresi doldu'), 'info');
    expect(deps.approveToken).not.toHaveBeenCalled();
    expect(deps.fillSellOrder).not.toHaveBeenCalled();
    expect(deps.setIsContractLoading).toHaveBeenLastCalledWith(false);
  });

  it('action: only a strict true confirms (truthy non-true values do not)', async () => {
    const deps = makeDeps();
    await buildStartTradeAction({ ...deps, confirmFill: vi.fn(async () => 'yes'), txGate: () => OPEN_GATE })(uiOrder());
    expect(deps.fillSellOrder).not.toHaveBeenCalled();
  });

  it('hook: the sheet closes after 2 minutes and the promise resolves "timeout"', async () => {
    vi.useFakeTimers();
    try {
      let api;
      const Probe = () => { api = useFillConfirm(); return <div data-testid="open">{api.fillConfirmSummary ? 'open' : 'closed'}</div>; };
      render(<Probe />);
      let result;
      act(() => { api.confirmFill({ direction: 'buy' }).then((r) => { result = r; }); });
      expect(screen.getByTestId('open')).toHaveTextContent('open');
      await act(async () => { vi.advanceTimersByTime(FILL_CONFIRM_TIMEOUT_MS - 1); });
      expect(screen.getByTestId('open')).toHaveTextContent('open');
      await act(async () => { vi.advanceTimersByTime(1); });
      expect(screen.getByTestId('open')).toHaveTextContent('closed');
      expect(result).toBe('timeout');
      expect(FILL_CONFIRM_TIMEOUT_MS).toBe(120000);
    } finally {
      vi.useRealTimers();
    }
  });

  it('hook: confirming before the timeout clears the timer (no late resolution)', async () => {
    vi.useFakeTimers();
    try {
      let api;
      const Probe = () => { api = useFillConfirm(); return null; };
      render(<Probe />);
      const results = [];
      act(() => { api.confirmFill({ direction: 'buy' }).then((r) => results.push(r)); });
      await act(async () => { api.settleFillConfirm(true); });
      await act(async () => { vi.advanceTimersByTime(FILL_CONFIRM_TIMEOUT_MS * 2); });
      expect(results).toEqual([true]);
    } finally {
      vi.useRealTimers();
    }
  });
});

describe('FillConfirmSheet standalone', () => {
  it('renders nothing without a summary', () => {
    const { container } = render(<FillConfirmSheet summary={null} />);
    expect(container).toBeEmptyDOMElement();
  });
});
