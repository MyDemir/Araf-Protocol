import { describe, expect, it } from 'vitest';
import { getMakerOrderValidationError, resolveTierMaxAmounts } from '../../frontend/src/app/actions/orderCreationActions';
import { buildMakerPreview, resolveEffectiveBondBps } from '../../frontend/src/app/orderUiModel';

// [TR] Emir oluşturma önizlemesi ArafEscrow kurallarıyla birebir olmalı.
const base = { makerTier: 1, makerAmount: '100', makerRate: '40', makerMinLimit: '', makerMaxLimit: '', makerFiat: 'TRY', makerToken: 'USDC' };

describe('maker order mirrors ArafEscrow rules', () => {
  it('blocks a direction the token policy has closed (TokenDirectionNotAllowed)', () => {
    const policy = { supported: true, allowSellOrders: true, allowBuyOrders: false };
    expect(getMakerOrderValidationError({ ...base, makerSide: 'BUY_CRYPTO', tokenPolicy: policy })).toMatch(/Buy orders are closed for USDC/);
    expect(getMakerOrderValidationError({ ...base, makerSide: 'SELL_CRYPTO', tokenPolicy: policy })).toBeNull();
    expect(getMakerOrderValidationError({ ...base, tokenPolicy: { supported: false } })).toMatch(/not supported/);
  });

  it('treats an on-chain tier cap of 0 as "no cap" instead of the small default', () => {
    const caps = resolveTierMaxAmounts({ decimals: 6, tierMaxAmountsBaseUnit: ['0', '1500000000', '0', '0'] });
    expect(caps[0]).toBe(Infinity);
    expect(caps[1]).toBe(1500);
    expect(getMakerOrderValidationError({ ...base, makerTier: 0, makerAmount: '5000', tierMaxAmounts: caps })).toBeNull();
  });

  it('floors the bond in base units like the contract (no round-up)', () => {
    expect(buildMakerPreview({ side: 'SELL_CRYPTO', amountUi: 100.5, bondBps: 800 }).reserveAmount).toBeCloseTo(8.04, 6);
    expect(buildMakerPreview({ side: 'BUY_CRYPTO', amountUi: 0.000003, bondBps: 1000 }).reserveAmount).toBe(0);
  });

  it('applies the reputation bond adjustment (−100 bps clean, +300 bps with risk points, tier 0 always 0)', () => {
    const bondMap = { 1: { maker: 8, taker: 10 } };
    expect(resolveEffectiveBondBps({ side: 'SELL_CRYPTO', tier: 1, bondMap, reputation: { successful: 3, authorityCounters: { riskPoints: 0 } } })).toMatchObject({ bps: 700, adjustment: 'discount' });
    expect(resolveEffectiveBondBps({ side: 'BUY_CRYPTO', tier: 1, bondMap, reputation: { successful: 3, authorityCounters: { riskPoints: 2 } } })).toMatchObject({ bps: 1300, adjustment: 'penalty' });
    expect(resolveEffectiveBondBps({ side: 'SELL_CRYPTO', tier: 1, bondMap, reputation: { successful: 0, authorityCounters: { riskPoints: 0 } } })).toMatchObject({ bps: 800, adjustment: null });
    expect(resolveEffectiveBondBps({ side: 'SELL_CRYPTO', tier: 0, bondMap, reputation: { successful: 9 } }).bps).toBe(0);
  });
});
