import React from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import { resolveNewTxGate, enforceTxGate } from '../../frontend/src/app/txGate';
import { buildCreateOrderAction } from '../../frontend/src/app/actions/orderCreationActions';
import { buildStartTradeAction } from '../../frontend/src/app/actions/contractLifecycleActions';
import { buildAppModals } from '../../frontend/src/app/AppModals';

afterEach(() => cleanup());

describe('resolveNewTxGate (fail-closed)', () => {
  it('is open only when chain read succeeded, not paused and infra healthy', () => {
    expect(resolveNewTxGate({ rpcChecked: true })).toMatchObject({ blocked: false });
  });
  it.each([
    [{ isPaused: true, rpcChecked: true }, 'paused'],
    [{ rpcChecked: false }, 'checking'],
    [{ rpcChecked: true, backendUnreachable: true }, 'infra'],
    [{ rpcChecked: true, rpcUnreachable: true }, 'infra'],
    [{ rpcChecked: false, rpcUnreachable: true }, 'infra'],
  ])('blocks %o as %s', (input, reason) => {
    const gate = resolveNewTxGate(input);
    expect(gate.blocked).toBe(true);
    expect(gate.reason).toBe(reason);
    expect(gate.message.length).toBeGreaterThan(5);
  });
  it('enforceTxGate toasts and returns false when blocked; accepts a getter', () => {
    const toast = vi.fn();
    expect(enforceTxGate(() => resolveNewTxGate({ rpcChecked: false }), toast)).toBe(false);
    expect(toast).toHaveBeenCalledWith(expect.stringMatching(/Checking chain status/), 'error');
  });
});

const createDeps = (gate) => ({
  getFormState: () => ({ makerTier: 1, makerAmount: '100', makerRate: '34', makerMinLimit: '100', makerFiat: 'TRY', makerToken: 'USDT', makerSide: 'SELL_CRYPTO' }),
  resetForm: vi.fn(),
  requireSignedSessionForActiveWallet: vi.fn(() => true),
  supportedTokens: { USDT: { address: '0x0000000000000000000000000000000000000001', decimalsRequired: true } },
  address: '0xabc0000000000000000000000000000000000000',
  lang: 'EN',
  isContractLoading: vi.fn(() => false),
  setIsContractLoading: vi.fn(),
  setLoadingText: vi.fn(),
  setShowMakerModal: vi.fn(),
  showToast: vi.fn(),
  getTokenDecimals: vi.fn(async () => 6),
  getAllowance: vi.fn(async () => 0n),
  approveToken: vi.fn(async () => undefined),
  createSellOrder: vi.fn(async () => undefined),
  createBuyOrder: vi.fn(async () => undefined),
  canonicalizePayoutProfileDraft: vi.fn((v) => v),
  payoutProfileDraft: { rail: 'TR_IBAN', country: 'TR' },
  paymentRiskConfig: {},
  hasPayoutProfile: true,
  txGate: gate,
});

describe('tx functions enforce the gate before approve', () => {
  it('createOrder: blocked gate never reaches approve / create', async () => {
    const deps = createDeps(resolveNewTxGate({ rpcChecked: true, rpcUnreachable: true }));
    await buildCreateOrderAction(deps)();
    expect(deps.approveToken).not.toHaveBeenCalled();
    expect(deps.createSellOrder).not.toHaveBeenCalled();
    expect(deps.getTokenDecimals).not.toHaveBeenCalled();
    expect(deps.showToast).toHaveBeenCalledWith(expect.stringMatching(/cannot be verified/), 'error');
  });

  it('createOrder: modal open, then infra fails -> submit through the SAME handler is rejected (getter reads live state)', async () => {
    let gate = resolveNewTxGate({ rpcChecked: true });
    const deps = createDeps(() => gate);
    const handler = buildCreateOrderAction(deps);
    gate = resolveNewTxGate({ rpcChecked: true, backendUnreachable: true });
    await handler();
    expect(deps.approveToken).not.toHaveBeenCalled();
    expect(deps.createSellOrder).not.toHaveBeenCalled();
  });

  it('startTrade: blocked gate never calls approve or fill', async () => {
    const showToast = vi.fn();
    const approveToken = vi.fn();
    const fillSellOrder = vi.fn();
    const getOrder = vi.fn();
    await buildStartTradeAction({
      lang: 'EN', hasPayoutProfile: true, showToast, approveToken, fillSellOrder, getOrder,
      isContractLoading: () => false, requireSignedSessionForActiveWallet: () => true,
      txGate: () => resolveNewTxGate({ rpcChecked: false }),
    })({ side: 'SELL_CRYPTO', onchainId: '1' });
    expect(approveToken).not.toHaveBeenCalled();
    expect(fillSellOrder).not.toHaveBeenCalled();
    expect(getOrder).not.toHaveBeenCalled();
    expect(showToast).toHaveBeenCalledWith(expect.stringMatching(/Checking chain status/), 'error');
  });
});

const modalCtx = (txGate) => ({
  lang: 'EN', showMakerModal: true, setShowMakerModal: vi.fn(), makerSide: 'SELL_CRYPTO', makerAmount: '100',
  makerRate: '34', makerTier: 1, makerToken: 'USDT', makerFiat: 'TRY', makerMinLimit: '',
  profileTab: 'ayarlar', showProfileModal: false, isContractLoading: false, loadingText: '',
  handleCreateOrder: vi.fn(), makerValidationError: null, isCreateTemporarilyDisabledByRisk: false,
  isPayoutProfileGateBlocked: false, txGate,
});

describe('maker modal submit follows the gate', () => {
  it('submit enabled when gate open, disabled with message when infra fails while modal is open', () => {
    const open = buildAppModals(modalCtx(resolveNewTxGate({ rpcChecked: true })));
    const { rerender } = render(<div>{open.renderMakerModal()}</div>);
    expect(screen.getByRole('button', { name: /Open Sell Order/i })).not.toBeDisabled();
    expect(screen.queryByTestId('create-tx-gate')).toBeNull();

    const failed = buildAppModals(modalCtx(resolveNewTxGate({ rpcChecked: true, backendUnreachable: true })));
    rerender(<div>{failed.renderMakerModal()}</div>);
    expect(screen.getByRole('button', { name: /Open Sell Order/i })).toBeDisabled();
    expect(screen.getByTestId('create-tx-gate')).toBeInTheDocument();
  });
});
