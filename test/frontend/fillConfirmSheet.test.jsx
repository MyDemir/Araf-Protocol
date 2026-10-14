import React from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { buildStartTradeAction } from '../../frontend/src/app/actions/contractLifecycleActions';
import { buildAppModals } from '../../frontend/src/app/AppModals';
import { useFillConfirm } from '../../frontend/src/app/useFillConfirm';
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

  it('shows "Bilinmiyor" instead of inventing rail, rate and fee when there is no source', async () => {
    await setup({
      lang: 'TR',
      orderArg: uiOrder({ rate: 0, hasPrice: false, fiat: null }),
      depsOver: { getOrder: vi.fn(async () => ({ ...chainOrder(), takerFeeBpsSnapshot: undefined, makerFeeBpsSnapshot: undefined })) },
    });
    await screen.findByTestId('fill-confirm-sheet');
    expect(screen.getByTestId('fill-confirm-rail')).toHaveTextContent('Bilinmiyor');
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

describe('FillConfirmSheet standalone', () => {
  it('renders nothing without a summary', () => {
    const { container } = render(<FillConfirmSheet summary={null} />);
    expect(container).toBeEmptyDOMElement();
  });
});
