import React from 'react';
import { describe, expect, it, vi } from 'vitest';
import { act, render } from '@testing-library/react';
import { useMakerOrderForm } from '../../frontend/src/app/contexts/marketplace/useMakerOrderForm';

// [TR] Madde 7: hook bondMap ve getReputation'ı buildCreateOrderAction'a iletmeli; aksi halde approve tutarı
//      muhafazakâr üst sınıra düşer.
const run = async (extra) => {
  const approveToken = vi.fn(async () => undefined);
  let latest;
  const deps = {
    isPaused: false,
    requireSignedSessionForActiveWallet: () => true,
    setShowMakerModal: vi.fn(),
    showToast: vi.fn(),
    supportedTokens: { USDT: { address: '0x0000000000000000000000000000000000000001', decimalsRequired: true } },
    address: '0xabc0000000000000000000000000000000000000',
    lang: 'EN',
    isContractLoading: false,
    setIsContractLoading: vi.fn(),
    setLoadingText: vi.fn(),
    getTokenDecimals: async () => 6,
    getAllowance: async () => 0n,
    approveToken,
    createSellOrder: vi.fn(async () => undefined),
    createBuyOrder: vi.fn(),
    fillSellOrder: vi.fn(),
    fillBuyOrder: vi.fn(),
    cancelSellOrder: vi.fn(),
    cancelBuyOrder: vi.fn(),
    canonicalizePayoutProfileDraft: () => ({ rail: 'TR_IBAN', country: 'TR' }),
    payoutProfileDraft: {},
    paymentRiskConfig: { TR: { TR_IBAN: { riskLevel: 'MEDIUM', enabled: true } } },
    ...extra,
  };
  const H = () => { latest = useMakerOrderForm(deps); return null; };
  render(React.createElement(H));
  await act(async () => { latest.setMakerTier(1); latest.setMakerAmount('100'); latest.setMakerRate('34'); latest.setMakerMinLimit('100'); });
  await act(async () => { await latest.handleCreateOrder(); });
  return approveToken;
};

describe('item 7: useMakerOrderForm forwards bondMap and getReputation', () => {
  const bondMap = { 1: { maker: 8, taker: 10 } };
  const cleanRep = { successful: 5n, failed: 0n, bannedUntil: 0n, consecutiveBans: 0n, effectiveTier: 1n, riskPoints: 0n };

  it('approves the exact amount (amount + reputation-adjusted maker bond) when bondMap and reputation are supplied', async () => {
    const getReputation = vi.fn(async () => cleanRep);
    const approve = await run({ bondMap, getReputation });
    expect(getReputation).toHaveBeenCalled();
    expect(approve).toHaveBeenCalledWith('0x0000000000000000000000000000000000000001', 107_000_000n);
  });

  it('without them the approval falls back to the conservative bound (strictly larger)', async () => {
    const approve = await run({});
    const [, amount] = approve.mock.calls[0];
    expect(amount).toBeGreaterThan(107_000_000n);
  });
});
