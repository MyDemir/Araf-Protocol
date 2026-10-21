import { describe, expect, it, vi } from 'vitest';
import { buildCreateOrderAction } from '../../frontend/src/app/actions/orderCreationActions';

const cfg = {
  TR: { TR_IBAN: { riskLevel: 'LOW', enabled: true } },
  US: { US_ACH: { riskLevel: 'HIGH', enabled: true } },
};

const makeDeps = (overrides = {}) => ({
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
  getAllowance: vi.fn(async () => 1_000_000_000_000n),
  approveToken: vi.fn(async () => undefined),
  createSellOrder: vi.fn(async () => undefined),
  createBuyOrder: vi.fn(async () => undefined),
  fillSellOrder: vi.fn(), fillBuyOrder: vi.fn(), cancelSellOrder: vi.fn(), cancelBuyOrder: vi.fn(),
  canonicalizePayoutProfileDraft: vi.fn((v) => ({ rail: v.rail || 'TR_IBAN', country: v.country || 'TR' })),
  payoutProfileDraft: { rail: 'TR_IBAN', country: 'TR' },
  paymentRiskConfig: cfg,
  hasPayoutProfile: true,
  effectiveTier: 4,
  ...overrides,
});

const piiFetch = (pii, ok = true) => vi.fn(async () => ({ ok, json: async () => ({ pii }) }));
const run = (deps) => buildCreateOrderAction(deps)();

describe('F2-02: risk kayıtlı profilden türer', () => {
  it('taslak kayıtlıdan farklıysa emir açılmaz ve "önce profili kaydet" gösterilir', async () => {
    const deps = makeDeps({
      payoutProfileDraft: { rail: 'TR_IBAN', country: 'TR' },
      authenticatedFetch: piiFetch({ rail: 'US_ACH', country: 'US' }),
    });
    await run(deps);
    expect(deps.createSellOrder).not.toHaveBeenCalled();
    expect(deps.approveToken).not.toHaveBeenCalled();
    expect(deps.showToast).toHaveBeenCalledWith(expect.stringMatching(/Save the profile first/), 'error');
  });

  it('taslak eşleşiyorsa zincire kayıtlı profilin riski gider', async () => {
    const deps = makeDeps({
      payoutProfileDraft: { rail: 'US_ACH', country: 'US' },
      authenticatedFetch: vi.fn(async (url) => (String(url).includes('pii/my')
        ? { ok: true, json: async () => ({ pii: { rail: 'US_ACH', country: 'US' } }) }
        : { ok: true, json: async () => ({}) })),
    });
    await run(deps);
    expect(deps.createSellOrder).toHaveBeenCalledTimes(1);
    expect(deps.createSellOrder.mock.calls[0][5]).toBe('HIGH');
  });

  it('kayıtlı profil RESTRICTED ise engellenir', async () => {
    const deps = makeDeps({
      paymentRiskConfig: { ...cfg, US: { US_ACH: { riskLevel: 'RESTRICTED', enabled: false } } },
      payoutProfileDraft: { rail: 'US_ACH', country: 'US' },
      authenticatedFetch: piiFetch({ rail: 'US_ACH', country: 'US' }),
    });
    await run(deps);
    expect(deps.createSellOrder).not.toHaveBeenCalled();
    expect(deps.showToast).toHaveBeenCalledWith(expect.stringMatching(/restricted/), 'error');
  });

  it('kayıtlı profil okunamazsa kapalı davranır', async () => {
    const deps = makeDeps({ authenticatedFetch: piiFetch(null, false) });
    await run(deps);
    expect(deps.createSellOrder).not.toHaveBeenCalled();
    expect(deps.showToast).toHaveBeenCalledWith(expect.stringMatching(/verify your saved payout profile/), 'error');
  });

  it('risk config yoksa MEDIUM varsayılmaz; emir açılmaz', async () => {
    const deps = makeDeps({
      paymentRiskConfig: {},
      authenticatedFetch: piiFetch({ rail: 'TR_IBAN', country: 'TR' }),
    });
    await run(deps);
    expect(deps.createSellOrder).not.toHaveBeenCalled();
    expect(deps.showToast).toHaveBeenCalledWith(expect.stringMatching(/No risk configuration/), 'error');
  });

  it('authenticatedFetch yokken de config yoksa MEDIUM varsayılmaz', async () => {
    const deps = makeDeps({ paymentRiskConfig: {} });
    await run(deps);
    expect(deps.createSellOrder).not.toHaveBeenCalled();
    expect(deps.showToast).toHaveBeenCalledWith(expect.stringMatching(/No risk configuration/), 'error');
  });
});
