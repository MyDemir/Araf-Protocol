import React from 'react';
import { createRequire } from 'node:module';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import PaymentProfilePanel from '../../frontend/src/app/contexts/profile/PaymentProfilePanel';
import PIIDisplay from '../../frontend/src/components/PIIDisplay';
import AdminRailsPanel from '../../frontend/src/app/contexts/admin/AdminRailsPanel';
import { canonicalizePayoutProfileDraft } from '../../frontend/src/app/orderUiModel';
import { resetRailCatalogState, setRailCatalogState, validateCatalogRail, getCatalogRail } from '../../frontend/src/app/railCatalog';

// [TR] Gerçek backend kataloğu (tek kaynak): sözleşme kayması bu dosyada yakalanır.
const require = createRequire(import.meta.url);
const REAL = require('../../backend/scripts/config/paymentRailCatalog.js').getPublicRailCatalog();
const ALL_OPEN = REAL.map((r) => r.code);
const load = (enabled = ALL_OPEN) => act(() => { setRailCatalogState({ paymentRailCatalog: REAL, supportedFiat: ['USD', 'TRY', 'EUR'], enabledPaymentRails: enabled }); });

beforeEach(() => resetRailCatalogState());
afterEach(() => { cleanup(); resetRailCatalogState(); });

let setDraftRef;
function Harness({ initial, onSubmit = vi.fn() }) {
  const [draft, setDraft] = React.useState(initial);
  setDraftRef = setDraft;
  return (
    <PaymentProfilePanel
      lang="EN"
      payoutProfileDraft={draft}
      setPayoutProfileDraft={setDraft}
      handleUpdatePII={(e) => { e.preventDefault(); onSubmit(canonicalizePayoutProfileDraft(draft)); }}
      canonicalizePayoutProfileDraft={canonicalizePayoutProfileDraft}
    />
  );
}
const draftOf = (rail, country, fields = {}) => ({ rail, country, contact: { channel: null, value: null }, fields: { account_holder_name: 'Jane Doe', ...fields } });

describe('real catalog: SWIFT_INTL free country input', () => {
  it('can be typed character by character and is submitted; a sanctioned country shows the warning', async () => {
    load();
    const user = userEvent.setup();
    const onSubmit = vi.fn();
    render(<Harness initial={draftOf('SWIFT_INTL', '', { bic: 'DEUTDEFF', bank_country: 'ZA', account_number: '12345' })} onSubmit={onSubmit} />);
    const country = screen.getByLabelText('Country');
    await user.type(country, 'za');
    expect(country).toHaveValue('ZA');
    await user.click(screen.getByRole('button', { name: 'Save' }));
    expect(onSubmit).toHaveBeenCalledTimes(1);
    expect(onSubmit.mock.calls[0][0].country).toBe('ZA');
    await user.clear(country);
    await user.type(country, 'RU');
    expect(country).toHaveValue('RU');
    await user.click(screen.getByRole('button', { name: 'Save' }));
    expect(onSubmit).toHaveBeenCalledTimes(1);
    expect(screen.getByText('This country is not supported')).toBeInTheDocument();
  });

  it('IBAN precheck: prefix must match bank_country; blocked bank_country is rejected', () => {
    load();
    const rail = getCatalogRail('SWIFT_INTL');
    const base = { bic: 'DEUTDEFF', account_holder_name: 'x' };
    const goodDe = 'DE89370400440532013000';
    expect(validateCatalogRail(rail, { ...base, bank_country: 'DE', account_number: goodDe })).toEqual({});
    // Geçerli bir IBAN ama bank_country farklı: önek eşleşmez -> tabloda GB varsa hata
    expect(validateCatalogRail(rail, { ...base, bank_country: 'GB', account_number: goodDe }).account_number).toBe('length');
    expect(validateCatalogRail(rail, { ...base, bank_country: 'ZA', account_number: '123456789' })).toEqual({});
    expect(validateCatalogRail(rail, { ...base, bank_country: 'RU', account_number: '123456789' }).bank_country).toBe('blocked');
  });
});

describe('real catalog: PIIDisplay IBAN rails', () => {
  beforeEach(() => {
    Object.defineProperty(window, 'isSecureContext', { value: true, configurable: true });
    if (!navigator.clipboard) Object.defineProperty(navigator, 'clipboard', { value: { writeText: async () => {} }, configurable: true });
  });
  const authFor = (payoutProfile) => {
    const f = vi.fn().mockResolvedValueOnce({ ok: true, json: async () => ({ piiToken: 't' }) }).mockResolvedValueOnce({ ok: true, json: async () => ({ payoutProfile }) });
    return (...a) => f(...a);
  };
  it('PL_IBAN shows the grouped IBAN and copies the raw value', async () => {
    load();
    const user = userEvent.setup();
    const spy = vi.spyOn(navigator.clipboard, 'writeText').mockResolvedValue(undefined);
    render(<PIIDisplay tradeId="t1" lang="EN" authenticatedFetch={authFor({ rail: 'PL_IBAN', fields: { account_holder_name: 'Jan', iban: 'PL61109010140000071219812874' } })} />);
    await user.click(screen.getByRole('button', { name: /Reveal/i }));
    await waitFor(() => expect(screen.getByText('PL61 1090 1014 0000 0712 1981 2874')).toBeInTheDocument());
    const copy = screen.getByRole('button', { name: /Copy: / });
    await user.click(copy);
    await waitFor(() => expect(spy).toHaveBeenCalledWith('PL61109010140000071219812874'));
  });
  it('CH_IBAN also shows the IBAN block', async () => {
    load();
    const user = userEvent.setup();
    render(<PIIDisplay tradeId="t1" lang="EN" authenticatedFetch={authFor({ rail: 'CH_IBAN', fields: { account_holder_name: 'Hans', iban: 'CH9300762011623852957' } })} />);
    await user.click(screen.getByRole('button', { name: /Reveal/i }));
    await waitFor(() => expect(screen.getByText('CH93 0076 2011 6238 5295 7')).toBeInTheDocument());
  });
});

describe('profile form: saved closed rail stays after the draft hydrates and the user switches away', () => {
  it('real flow: draft starts at the default rail, hydrates to the saved (closed) rail, user switches; saved rail stays listed', () => {
    const open = ALL_OPEN.filter((c) => c !== 'GB_FPS');
    load(open);
    render(<Harness initial={draftOf('TR_IBAN', 'TR')} />);
    expect(within(screen.getByLabelText('Payment method')).queryByRole('option', { name: /Faster Payments/ })).not.toBeInTheDocument();
    act(() => setDraftRef(draftOf('GB_FPS', 'GB')));          // /pii/my hidrasyonu
    expect(screen.getByLabelText('Payment method')).toHaveValue('GB_FPS');
    fireEvent.change(screen.getByLabelText('Payment method'), { target: { value: 'TR_IBAN' } });
    const opt = within(screen.getByLabelText('Payment method')).getByRole('option', { name: /Faster Payments.*currently closed/ });
    expect(opt).toBeDisabled();
  });
});

describe('AdminRailsPanel: PAYMENT_RAIL_CONFLICT', () => {
  it('shows a specific toast and reloads the list', async () => {
    const rows = REAL.slice(0, 3).map((r, i) => ({ code: r.code, name: r.name, countries: r.countries, riskLevel: r.risk.riskLevel, enabled: i < 2, region: r.region, currencies: r.currencies, defaultEnabled: r.defaultEnabled }));
    const fetchFn = vi.fn(async (url, opts = {}) => {
      if (opts.method === 'PUT') return { ok: false, status: 409, json: async () => ({ code: 'PAYMENT_RAIL_CONFLICT' }) };
      if (String(url).includes('audit')) return { ok: true, status: 200, json: async () => ({ items: [], total: 0, page: 1, limit: 10 }) };
      return { ok: true, status: 200, json: async () => ({ rails: rows }) };
    });
    const showToast = vi.fn();
    render(<AdminRailsPanel lang="EN" authenticatedFetch={fetchFn} showToast={showToast} />);
    await waitFor(() => screen.getAllByRole('switch'));
    const loads = () => fetchFn.mock.calls.filter(([u, o]) => !o?.method && !String(u).includes('audit')).length;
    expect(loads()).toBe(1);
    fireEvent.click(screen.getAllByRole('switch')[2]);
    fireEvent.click(screen.getByRole('button', { name: 'Confirm' }));
    await waitFor(() => expect(showToast).toHaveBeenCalledWith('Another admin changed it; the list was refreshed.', 'error'));
    await waitFor(() => expect(loads()).toBe(2));
  });
});
