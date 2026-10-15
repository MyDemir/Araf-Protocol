import { describe, expect, it, vi } from 'vitest';
import { renderHook } from '@testing-library/react';
import { buildCreateOrderAction } from '../../frontend/src/app/actions/orderCreationActions';
import { buildStartTradeAction } from '../../frontend/src/app/actions/contractLifecycleActions';

const ESCROW = '0x00000000000000000000000000000000000000AA';
const WALLET = '0x00000000000000000000000000000000000000BB';
const TOKEN = '0x0000000000000000000000000000000000000001';

const makeCreateDeps = (overrides = {}) => {
  const state = { makerTier: 1, makerAmount: '100', makerRate: '34', makerMinLimit: '100', makerFiat: 'TRY', makerToken: 'USDT', makerSide: 'SELL_CRYPTO', ...(overrides.state || {}) };
  return {
    getFormState: () => state,
    resetForm: vi.fn(),
    requireSignedSessionForActiveWallet: vi.fn(() => true),
    supportedTokens: { USDT: { address: TOKEN, decimalsRequired: true } },
    address: '0xabc0000000000000000000000000000000000000',
    lang: 'EN',
    isContractLoading: vi.fn(() => false),
    setIsContractLoading: vi.fn(),
    setLoadingText: vi.fn(),
    setShowMakerModal: vi.fn(),
    showToast: vi.fn(),
    getTokenDecimals: vi.fn(async () => 6),
    getAllowance: vi.fn(async () => 0n),
    getTokenBalance: vi.fn(async () => 1_000_000_000n),
    approveToken: vi.fn(async () => undefined),
    createSellOrder: vi.fn(async () => undefined),
    createBuyOrder: vi.fn(async () => undefined),
    fillSellOrder: vi.fn(), fillBuyOrder: vi.fn(), cancelSellOrder: vi.fn(), cancelBuyOrder: vi.fn(),
    canonicalizePayoutProfileDraft: vi.fn((v) => ({ rail: v.rail || 'TR_IBAN', country: v.country || 'TR' })),
    payoutProfileDraft: { rail: 'TR_IBAN', country: 'TR' },
    paymentRiskConfig: { TR: { TR_IBAN: { riskLevel: 'MEDIUM', enabled: true } } },
    hasPayoutProfile: true,
    effectiveTier: 4,
    ...overrides,
  };
};

describe('create order: token balance guard before approve', () => {
  it('SELL: balance below amount + bond -> no approve, no create, clear toast, loading cleared', async () => {
    const deps = makeCreateDeps({ getTokenBalance: vi.fn(async () => 50_000_000n) });
    await buildCreateOrderAction(deps)();
    expect(deps.approveToken).not.toHaveBeenCalled();
    expect(deps.createSellOrder).not.toHaveBeenCalled();
    expect(deps.showToast).toHaveBeenCalledWith('Insufficient USDT balance. Required: 111 USDT (amount + bond), in wallet: 50 USDT.', 'error');
    expect(deps.setIsContractLoading).toHaveBeenLastCalledWith(false);
    expect(deps.setLoadingText).toHaveBeenLastCalledWith('');
  });

  it('SELL TR message', async () => {
    const deps = makeCreateDeps({ lang: 'TR', getTokenBalance: vi.fn(async () => 50_000_000n) });
    await buildCreateOrderAction(deps)();
    expect(deps.showToast).toHaveBeenCalledWith('Yetersiz USDT bakiyesi. Gereken: 111 USDT (tutar + teminat), cüzdanınızda: 50 USDT.', 'error');
  });

  it('BUY: balance below taker bond -> no approve, no create, bond-only wording', async () => {
    const deps = makeCreateDeps({ state: { makerSide: 'BUY_CRYPTO' }, getTokenBalance: vi.fn(async () => 1_000_000n) });
    await buildCreateOrderAction(deps)();
    expect(deps.approveToken).not.toHaveBeenCalled();
    expect(deps.createBuyOrder).not.toHaveBeenCalled();
    expect(deps.showToast).toHaveBeenCalledWith(expect.stringMatching(/^Insufficient USDT balance\. Required: .* USDT \(bond\), in wallet: 1 USDT\.$/), 'error');
  });

  it('sufficient balance (exactly required) -> flow proceeds', async () => {
    const deps = makeCreateDeps({ getTokenBalance: vi.fn(async () => 111_000_000n) });
    await buildCreateOrderAction(deps)();
    expect(deps.approveToken).toHaveBeenCalledWith(TOKEN, 111_000_000n);
    expect(deps.createSellOrder).toHaveBeenCalledTimes(1);
  });

  it('unknown balance (null) or missing getTokenBalance -> check skipped', async () => {
    const a = makeCreateDeps({ getTokenBalance: vi.fn(async () => null) });
    await buildCreateOrderAction(a)();
    expect(a.createSellOrder).toHaveBeenCalledTimes(1);
    const b = makeCreateDeps();
    delete b.getTokenBalance;
    await buildCreateOrderAction(b)();
    expect(b.createSellOrder).toHaveBeenCalledTimes(1);
  });
});

const makeFillDeps = (overrides = {}) => ({
  lang: 'EN',
  address: '0xabc0000000000000000000000000000000000000',
  isBanned: false,
  isContractLoading: vi.fn(() => false),
  supportedTokenAddresses: { USDT: TOKEN },
  getOrder: vi.fn(async () => ({ tokenAddress: TOKEN, remainingAmount: 100_000_000n, minFillAmount: 10_000_000n, tier: 1 })),
  getAllowance: vi.fn(async () => 0n),
  getTokenBalance: vi.fn(async () => 1_000_000n),
  getTokenDecimals: vi.fn(async () => 6),
  approveToken: vi.fn(async () => undefined),
  fillSellOrder: vi.fn(async () => ({ tradeId: 77n })),
  fillBuyOrder: vi.fn(async () => ({ tradeId: 88n })),
  createSellOrder: vi.fn(), createBuyOrder: vi.fn(), cancelSellOrder: vi.fn(), cancelBuyOrder: vi.fn(),
  authenticatedFetch: vi.fn(async () => ({ ok: true, json: async () => ({ trade: { _id: 't' } }) })),
  showToast: vi.fn(),
  setIsContractLoading: vi.fn(),
  setLoadingText: vi.fn(),
  setActiveTrade: vi.fn(), setTradeState: vi.fn(), setCancelStatus: vi.fn(), setChargebackAccepted: vi.fn(), setCurrentView: vi.fn(),
  hasPayoutProfile: true,
  confirmFn: vi.fn(() => true),
  sleep: vi.fn(async () => undefined),
  ...overrides,
});

describe('fill: token balance guard before approve', () => {
  it('SELL order (taker pays bond only): insufficient -> no approve, no fill', async () => {
    const deps = makeFillDeps();
    await buildStartTradeAction(deps)({ id: 'o', onchainId: 12, crypto: 'USDT', side: 'SELL_CRYPTO', fillAmountRaw: '50000000' });
    expect(deps.approveToken).not.toHaveBeenCalled();
    expect(deps.fillSellOrder).not.toHaveBeenCalled();
    expect(deps.showToast).toHaveBeenCalledWith('Insufficient USDT balance. Required: 6.5 USDT (bond), in wallet: 1 USDT.', 'error');
    expect(deps.setIsContractLoading).toHaveBeenLastCalledWith(false);
  });

  it('BUY order (maker pays amount + bond): insufficient -> no approve, no fill', async () => {
    const deps = makeFillDeps();
    await buildStartTradeAction(deps)({ id: 'o', onchainId: 12, crypto: 'USDT', side: 'BUY_CRYPTO', fillAmountRaw: '50000000' });
    expect(deps.approveToken).not.toHaveBeenCalled();
    expect(deps.fillBuyOrder).not.toHaveBeenCalled();
    expect(deps.showToast).toHaveBeenCalledWith(expect.stringContaining('(amount + bond), in wallet: 1 USDT.'), 'error');
  });

  it('sufficient or unknown balance -> fill proceeds', async () => {
    const ok = makeFillDeps({ getTokenBalance: vi.fn(async () => 1_000_000_000n) });
    await buildStartTradeAction(ok)({ id: 'o', onchainId: 12, crypto: 'USDT', side: 'SELL_CRYPTO', fillAmountRaw: '50000000' });
    expect(ok.fillSellOrder).toHaveBeenCalledTimes(1);
    const unknown = makeFillDeps({ getTokenBalance: vi.fn(async () => null) });
    await buildStartTradeAction(unknown)({ id: 'o', onchainId: 12, crypto: 'USDT', side: 'SELL_CRYPTO', fillAmountRaw: '50000000' });
    expect(unknown.fillSellOrder).toHaveBeenCalledTimes(1);
  });
});

const readContract = vi.fn();
vi.mock('wagmi', () => ({
  usePublicClient: () => ({ readContract, waitForTransactionReceipt: vi.fn() }),
  useWalletClient: () => ({ data: { writeContract: vi.fn(), account: { address: WALLET } } }),
  useChainId: () => 31337,
  useAccount: () => ({ chainId: 31337, address: WALLET }),
}));

describe('getTokenBalance (hook)', () => {
  const load = async () => {
    vi.resetModules();
    vi.stubEnv('VITE_ESCROW_ADDRESS', ESCROW);
    const { useArafContract } = await import('../../frontend/src/hooks/useArafContract');
    return renderHook(() => useArafContract({ expectedChainId: 31337 })).result;
  };

  it('reads balanceOf and returns the bigint', async () => {
    readContract.mockReset().mockResolvedValue(42n);
    const result = await load();
    await expect(result.current.getTokenBalance(TOKEN, WALLET)).resolves.toBe(42n);
    expect(readContract).toHaveBeenCalledWith(expect.objectContaining({ functionName: 'balanceOf' }));
  });

  it('returns null (not 0n) when the read fails', async () => {
    readContract.mockReset().mockRejectedValue(new Error('rpc down'));
    const result = await load();
    await expect(result.current.getTokenBalance(TOKEN, WALLET)).resolves.toBeNull();
  });
});
