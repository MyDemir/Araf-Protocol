import React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import PaymentProfilePanel from '../../frontend/src/app/contexts/profile/PaymentProfilePanel';
import PIIDisplay from '../../frontend/src/components/PIIDisplay';
import FillConfirmSheet from '../../frontend/src/components/FillConfirmSheet';
import MarketOrderCard from '../../frontend/src/app/contexts/marketplace/MarketOrderCard';
import MarketFilters from '../../frontend/src/app/contexts/marketplace/MarketFilters';
import { buildAppModals } from '../../frontend/src/app/AppModals';
import { buildMarketOrdersQuery, MARKET_FIAT_OPTIONS } from '../../frontend/src/app/contexts/marketplace/marketFilters';
import { canonicalizePayoutProfileDraft, resolvePaymentRiskEntry, SEPA_COUNTRY_CODES } from '../../frontend/src/app/orderUiModel';
import { getRailLabel, railLabel } from '../../frontend/src/app/railLabels';
import { getSupportedFiat, resetRailCatalogState, setRailCatalogState } from '../../frontend/src/app/railCatalog';
import { enabledRailsFixture, paymentRailCatalogFixture, supportedFiatFixture } from './fixtures/paymentRailCatalog.fixture';

const loadCatalog = (over = {}) => act(() => {
  setRailCatalogState({ paymentRailCatalog: paymentRailCatalogFixture, supportedFiat: supportedFiatFixture, enabledPaymentRails: enabledRailsFixture, ...over });
});

beforeEach(() => resetRailCatalogState());
afterEach(() => { cleanup(); resetRailCatalogState(); });

// ── Katalog yokken yedek davranış ───────────────────────────────────────────
describe('fallback without a catalog', () => {
  it('rail labels, fiat list and SEPA countries use the static 3-rail fallback', () => {
    expect(railLabel('TR_IBAN', 'TR')).toBe('Türkiye (IBAN)');
    expect(railLabel('GB_FPS', 'EN')).toBeNull();
    expect(getSupportedFiat()).toEqual(['TRY', 'USD', 'EUR']);
    expect(MARKET_FIAT_OPTIONS).toEqual(['TRY', 'USD', 'EUR']);
    expect(buildMarketOrdersQuery({ filters: { fiat: 'USD' } })).toContain('fiat=USD');
    expect(buildMarketOrdersQuery({ filters: { fiat: 'BRL' } })).not.toContain('fiat=');
    expect(SEPA_COUNTRY_CODES).toHaveLength(12);
  });

  it('profile form lists exactly the three legacy rails (closed ones stay visible but disabled)', () => {
    const cfg = { US: { US_ACH: { enabled: false } } };
    render(<PaymentProfilePanel lang="EN" paymentRiskConfig={cfg} setPayoutProfileDraft={vi.fn()} handleUpdatePII={vi.fn()} payoutProfileDraft={{ rail: 'TR_IBAN', country: 'TR', contact: {}, fields: {} }} />);
    const options = within(screen.getByLabelText('Payment method')).getAllByRole('option');
    expect(options.map((o) => o.value)).toEqual(['TR_IBAN', 'SEPA_IBAN', 'US_ACH']);
    expect(options[2]).toBeDisabled();
    expect(options[2]).toHaveTextContent('currently closed');
  });
});

// ── Eski 3 rail: gönderim yükü DEĞİŞMEZ ─────────────────────────────────────
describe('legacy rail payload is unchanged (fingerprint rule)', () => {
  const cases = {
    TR_IBAN: [
      { rail: 'TR_IBAN', country: 'TR', contact: { channel: 'phone', value: '+90 555 000 00 00' }, fields: { account_holder_name: '  Ali  Veli ', iban: 'tr00 1111 2222', bank_name: ' X ', sort_code: '123456' } },
      '{"rail":"TR_IBAN","country":"TR","contact":{"channel":"phone","value":"+905550000000"},"fields":{"account_holder_name":"Ali Veli","iban":"TR0011112222","routing_number":null,"account_number":null,"account_type":null,"bic":null,"bank_name":"X"}}',
    ],
    SEPA_IBAN: [
      { rail: 'SEPA_IBAN', country: 'FR', contact: {}, fields: { account_holder_name: 'A B', iban: 'fr76 3000', bic: ' abcdfrpp ' } },
      '{"rail":"SEPA_IBAN","country":"FR","contact":{"channel":null,"value":null},"fields":{"account_holder_name":"A B","iban":"FR763000","routing_number":null,"account_number":null,"account_type":null,"bic":"ABCDFRPP","bank_name":null}}',
    ],
    US_ACH: [
      { rail: 'US_ACH', country: 'DE', contact: {}, fields: { account_holder_name: 'John', routing_number: '1100 0000 0', account_number: '12 34', account_type: 'checking' } },
      '{"rail":"US_ACH","country":"US","contact":{"channel":null,"value":null},"fields":{"account_holder_name":"John","iban":null,"routing_number":"110000000","account_number":"1234","account_type":"checking","bic":null,"bank_name":null}}',
    ],
  };
  for (const [rail, [draft, expected]] of Object.entries(cases)) {
    it(`${rail}: identical key set, order and values with and without a catalog`, () => {
      expect(JSON.stringify(canonicalizePayoutProfileDraft(draft))).toBe(expected);
      loadCatalog();
      expect(JSON.stringify(canonicalizePayoutProfileDraft(draft))).toBe(expected);
    });
  }
});

// ── Katalogla profil formu ──────────────────────────────────────────────────
function Harness({ initial, onSubmit = vi.fn(), paymentRiskConfig = null, lang = 'EN', savedRail = null }) {
  const [draft, setDraft] = React.useState(initial);
  return (
    <PaymentProfilePanel
      lang={lang}
      payoutProfileDraft={draft}
      setPayoutProfileDraft={setDraft}
      handleUpdatePII={(e) => { e.preventDefault(); onSubmit(canonicalizePayoutProfileDraft(draft)); }}
      canonicalizePayoutProfileDraft={canonicalizePayoutProfileDraft}
      paymentRiskConfig={paymentRiskConfig}
      savedRail={savedRail}
    />
  );
}
const draftOf = (rail, country, fields = {}) => ({ rail, country, contact: { channel: null, value: null }, fields: { account_holder_name: 'Jane Doe', ...fields } });

describe('profile form with a catalog', () => {
  it('lists only open rails plus the saved rail, grouped by region', () => {
    loadCatalog();
    render(<Harness initial={draftOf('TR_IBAN', 'TR')} savedRail="GB_FPS" />);
    const select = screen.getByLabelText('Payment method');
    const codes = within(select).getAllByRole('option').map((o) => o.value);
    // GB_FPS kapalı ama kayıtlı rail olarak listede; SWIFT_INTL kapalı ve kayıtlı değil: gizli.
    expect(codes).toEqual(['TR_IBAN', 'SEPA_IBAN', 'GB_FPS', 'US_ACH', 'MX_SPEI', 'BR_PIX', 'IN_UPI']);
    expect(codes).not.toContain('SWIFT_INTL');
    const groups = Array.from(select.querySelectorAll('optgroup')).map((g) => g.label);
    expect(groups).toEqual(['Europe', 'Americas', 'Asia-Pacific']);
    expect(within(select).getByRole('option', { name: /Faster Payments.*currently closed/ })).toBeDisabled();
  });

  it('keeps the current closed rail selected and shows the closed alert', () => {
    loadCatalog();
    render(<Harness initial={draftOf('GB_FPS', 'GB')} />);
    expect(screen.getByLabelText('Payment method')).toHaveValue('GB_FPS');
    expect(within(screen.getByLabelText('Payment method')).getByRole('option', { name: /Faster Payments/ })).toBeInTheDocument();
  });

  it('GB_FPS: renders catalog fields, country from `countries`, and submits the canonical catalog payload', async () => {
    loadCatalog({ enabledPaymentRails: [...enabledRailsFixture, 'GB_FPS'] });
    const onSubmit = vi.fn();
    render(<Harness initial={draftOf('GB_FPS', 'GB')} onSubmit={onSubmit} />);
    expect(screen.getByLabelText(/Sort code/)).toBeInTheDocument();
    expect(screen.getByLabelText(/Account number/)).toBeInTheDocument();
    expect(screen.queryByLabelText('IBAN')).not.toBeInTheDocument();
    expect(within(screen.getByLabelText('Country')).getAllByRole('option').map((o) => o.value)).toEqual(['GB']);
    fireEvent.change(screen.getByLabelText(/Sort code/), { target: { value: '12 34 56' } });
    fireEvent.change(screen.getByLabelText(/Account number/), { target: { value: '12345678' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));
    expect(onSubmit).toHaveBeenCalledTimes(1);
    expect(onSubmit.mock.calls[0][0]).toEqual({
      rail: 'GB_FPS', country: 'GB', contact: { channel: null, value: null },
      fields: { account_holder_name: 'Jane Doe', bank_name: null, sort_code: '123456', account_number: '12345678' },
    });
  });

  it('client pre-check blocks submit and shows errors (required + pattern); backend stays authoritative', () => {
    loadCatalog({ enabledPaymentRails: [...enabledRailsFixture, 'GB_FPS'] });
    const onSubmit = vi.fn();
    render(<Harness initial={draftOf('GB_FPS', 'GB', { sort_code: '12' })} onSubmit={onSubmit} />);
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));
    expect(onSubmit).not.toHaveBeenCalled();
    const alerts = screen.getAllByRole('alert').map((a) => a.textContent);
    expect(alerts).toContain('Invalid format');
    expect(alerts).toContain('Required');
    expect(screen.getByLabelText(/Sort code/)).toHaveAttribute('aria-invalid', 'true');
  });

  it('BR_PIX: enum key type + alias value are checked against the pattern of the chosen type', () => {
    loadCatalog();
    const onSubmit = vi.fn();
    render(<Harness initial={draftOf('BR_PIX', 'BR', { pix_key_type: 'cnpj', pix_key: 'abc' })} onSubmit={onSubmit} />);
    const type = screen.getByLabelText(/Pix key type/);
    expect(type.tagName).toBe('SELECT');
    expect(within(type).getAllByRole('option').map((o) => o.value)).toEqual(['', 'email', 'phone', 'evp', 'cnpj']);
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));
    expect(onSubmit).not.toHaveBeenCalled();
    fireEvent.change(screen.getByLabelText(/^Pix key \*/), { target: { value: '12345678000199' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));
    expect(onSubmit.mock.calls[0][0].fields).toEqual({
      account_holder_name: 'Jane Doe', bank_name: null, pix_key_type: 'cnpj', pix_key: '12345678000199',
    });
  });

  it('MX_SPEI: single digits field with numeric keyboard', () => {
    loadCatalog();
    render(<Harness initial={draftOf('MX_SPEI', 'MX')} />);
    const clabe = screen.getByLabelText(/CLABE/);
    expect(clabe).toHaveAttribute('inputmode', 'numeric');
    expect(clabe).toHaveAttribute('aria-required', 'true');
  });

  it('SWIFT_INTL (countries ["*"]) takes a free two-letter country; SEPA uses the catalog country list', () => {
    loadCatalog({ enabledPaymentRails: [...enabledRailsFixture, 'SWIFT_INTL'] });
    const { unmount } = render(<Harness initial={draftOf('SWIFT_INTL', 'ZA')} />);
    expect(screen.getByLabelText('Country').tagName).toBe('INPUT');
    unmount();
    render(<Harness initial={draftOf('SEPA_IBAN', 'PL')} />);
    expect(within(screen.getByLabelText('Country')).getAllByRole('option').map((o) => o.value)).toContain('PL');
  });

  it('canonicalizer derives allowed countries and defaults from the catalog', () => {
    loadCatalog();
    expect(canonicalizePayoutProfileDraft(draftOf('SEPA_IBAN', 'PL')).country).toBe('PL');
    expect(canonicalizePayoutProfileDraft(draftOf('SEPA_IBAN', 'US')).country).toBe('DE');
    expect(canonicalizePayoutProfileDraft(draftOf('BR_PIX', 'XX')).country).toBe('BR');
    expect(canonicalizePayoutProfileDraft(draftOf('SWIFT_INTL', 'za')).country).toBe('ZA');
  });

  it('resolvePaymentRiskEntry resolves multi-country SEPA through catalog countries', () => {
    const cfg = { EU: { SEPA_IBAN: { riskLevel: 'LOW' } } };
    expect(resolvePaymentRiskEntry({ paymentRiskConfig: cfg, rail: 'SEPA_IBAN', country: 'PL' })).toEqual({ riskLevel: 'LOW' });
    loadCatalog();
    expect(resolvePaymentRiskEntry({ paymentRiskConfig: cfg, rail: 'SEPA_IBAN', country: 'PL' })).toEqual({ riskLevel: 'LOW' });
  });
});

// ── PIIDisplay ──────────────────────────────────────────────────────────────
const authFetchWith = (payoutProfile) => {
  const f = vi.fn()
    .mockResolvedValueOnce({ ok: true, json: async () => ({ piiToken: 't' }) })
    .mockResolvedValueOnce({ ok: true, json: async () => ({ payoutProfile }) });
  return (...a) => f(...a);
};
describe('PIIDisplay with a catalog', () => {
  beforeEach(() => {
    Object.defineProperty(window, 'isSecureContext', { value: true, configurable: true });
    if (!navigator.clipboard) Object.defineProperty(navigator, 'clipboard', { value: { writeText: async () => {} }, configurable: true });
  });

  it('uses catalog labels, a copy button for copyable fields, and falls back to the raw key for unknown ones', async () => {
    loadCatalog();
    const user = userEvent.setup();
    const spy = vi.spyOn(navigator.clipboard, 'writeText').mockResolvedValue(undefined);
    render(<PIIDisplay tradeId="t1" lang="EN" authenticatedFetch={authFetchWith({ rail: 'GB_FPS', fields: { account_holder_name: 'Jane', sort_code: '12 34 56', account_number: '12345678', mystery_key: 'zzz' } })} />);
    await user.click(screen.getByRole('button', { name: /Reveal/i }));
    await waitFor(() => expect(screen.getByText('Jane')).toBeInTheDocument());
    expect(screen.getByText('Sort code:')).toBeInTheDocument();
    expect(screen.getByText('Account number:')).toBeInTheDocument();
    expect(screen.getByText('mystery_key:')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: /Copy: Sort code/ }));
    await waitFor(() => expect(spy).toHaveBeenCalledWith('123456'));
    expect(screen.queryByRole('button', { name: /Copy: mystery_key/ })).not.toBeInTheDocument();
  });

  it('TR labels come from the catalog', async () => {
    loadCatalog();
    const user = userEvent.setup();
    render(<PIIDisplay tradeId="t1" lang="tr" authenticatedFetch={authFetchWith({ rail: 'BR_PIX', fields: { account_holder_name: 'Ana', pix_key_type: 'email', pix_key: 'a@b.co' } })} />);
    await user.click(screen.getByRole('button', { name: /göster/i }));
    await waitFor(() => expect(screen.getByText('Pix anahtarı:')).toBeInTheDocument());
    expect(screen.getByRole('button', { name: /Kopyala: Pix anahtarı/ })).toBeInTheDocument();
  });

  it('kind:"iban" fields are shown in groups of four while the copy keeps the raw value', async () => {
    loadCatalog();
    const user = userEvent.setup();
    render(<PIIDisplay tradeId="t1" lang="EN" authenticatedFetch={authFetchWith({ rail: 'TR_IBAN', fields: { account_holder_name: 'Ali', iban: 'TR330006100519786457841326' } })} />);
    await user.click(screen.getByRole('button', { name: /Reveal/i }));
    await waitFor(() => expect(screen.getByText('TR33 0006 1005 1978 6457 8413 26')).toBeInTheDocument());
  });

  it('without a catalog the raw IBAN and legacy labels stay as before', async () => {
    const user = userEvent.setup();
    render(<PIIDisplay tradeId="t1" lang="EN" authenticatedFetch={authFetchWith({ rail: 'TR_IBAN', fields: { account_holder_name: 'Ali', iban: 'TR330006100519786457841326', bank_name: 'B' } })} />);
    await user.click(screen.getByRole('button', { name: /Reveal/i }));
    await waitFor(() => expect(screen.getByText('TR330006100519786457841326')).toBeInTheDocument());
    expect(screen.getByText('Bank Name:')).toBeInTheDocument();
  });
});

// ── Rail adları: kart ve onay sayfası ───────────────────────────────────────
describe('rail names from the catalog', () => {
  it('getRailLabel prefers the catalog name, then the static fallback', () => {
    expect(getRailLabel('GB_FPS', 'EN', paymentRailCatalogFixture)).toBe('United Kingdom (Faster Payments)');
    expect(getRailLabel('US_ACH', 'TR', [])).toBe('ABD (ACH)');
    expect(getRailLabel('NOPE', 'EN', paymentRailCatalogFixture)).toBeNull();
  });

  it('MarketOrderCard shows the short catalog rail name', () => {
    loadCatalog();
    render(<MarketOrderCard lang="EN" order={{ id: 'o1', side: 'SELL_CRYPTO', crypto: 'USDT', fiat: 'BRL', rate: 5, tier: 0, paymentRail: 'BR_PIX', remainingAmount: 10, minFillAmount: 1 }} cta={{ onClick: vi.fn(), content: 'Fill', toneClass: '' }} />);
    expect(screen.getByText('Pix')).toBeInTheDocument();
  });

  it('FillConfirmSheet shows the full catalog rail name', () => {
    loadCatalog();
    render(<FillConfirmSheet lang="EN" onConfirm={vi.fn()} onCancel={vi.fn()} summary={{ direction: 'buy', fillAmountRaw: '1000000', bondRaw: '0', lockTotalRaw: '0', feeRaw: '0', decimals: 6, crypto: 'USDT', fiat: 'GBP', rate: 0.8, rail: 'GB_FPS', paymentWindowMs: 172800000, counterparty: '0x1234...abcd', counterpartyTier: 1, feeBps: 20 }} />);
    expect(screen.getByTestId('fill-confirm-sheet')).toHaveTextContent('United Kingdom (Faster Payments)');
  });
});

// ── Fiat ────────────────────────────────────────────────────────────────────
describe('fiat options come from supportedFiat', () => {
  it('market query accepts a catalog fiat and market filter chip lists them', async () => {
    loadCatalog();
    expect(buildMarketOrdersQuery({ filters: { fiat: 'BRL' } })).toContain('fiat=BRL');
    const user = userEvent.setup();
    render(<MarketFilters lang="EN" filters={{}} setFilter={vi.fn()} onReset={vi.fn()} sortOptions={[]} />);
    await user.click(screen.getByTestId('market-clause-fiat'));
    expect(screen.getByRole('radio', { name: 'BRL' })).toBeInTheDocument();
  });

  const makerCtx = (over = {}) => ({
    lang: 'EN', showMakerModal: true, setShowMakerModal: vi.fn(), makerTier: 1, setMakerTier: vi.fn(), makerToken: 'USDT', setMakerToken: vi.fn(),
    makerSide: 'SELL_CRYPTO', setMakerSide: vi.fn(), makerAmount: '100', setMakerAmount: vi.fn(), makerRate: '34', setMakerRate: vi.fn(),
    makerMinLimit: '', setMakerMinLimit: vi.fn(), makerFiat: 'TRY', setMakerFiat: vi.fn(), onchainBondMap: {}, userReputation: { effectiveTier: 3 },
    SUPPORTED_TOKEN_ADDRESSES: { USDT: '0x1' }, onchainTokenMap: {}, tokenDecimalsMap: { USDT: 6 }, handleCreateOrder: vi.fn(), showToast: vi.fn(), ...over,
  });

  it('maker modal: fallback list without a catalog, catalog list with one', () => {
    const { unmount } = render(<div>{buildAppModals(makerCtx()).renderMakerModal()}</div>);
    expect(within(screen.getByLabelText('Fiat currency')).getAllByRole('option').map((o) => o.value)).toEqual(['TRY', 'USD', 'EUR']);
    expect(screen.queryByTestId('maker-no-reference-rate')).not.toBeInTheDocument();
    unmount();
    loadCatalog();
    render(<div>{buildAppModals(makerCtx({ makerFiat: 'BRL' })).renderMakerModal()}</div>);
    expect(within(screen.getByLabelText('Fiat currency')).getAllByRole('option').map((o) => o.value)).toEqual(supportedFiatFixture);
    expect(screen.getByTestId('maker-no-reference-rate')).toHaveTextContent('No reference rate for BRL');
  });
});
