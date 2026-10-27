import React from 'react';
import { act } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import AdminRailsPanel from '../../frontend/src/app/contexts/admin/AdminRailsPanel';
import { useAppSessionData } from '../../frontend/src/app/useAppSessionData';
import { getRailCatalogState, resetRailCatalogState } from '../../frontend/src/app/railCatalog';
import { __resetInfraForTest } from '../../frontend/src/app/infraHealth';
import { paymentRailCatalogFixture, supportedFiatFixture } from './fixtures/paymentRailCatalog.fixture';

const json = (status, body) => ({ ok: status < 400, status, json: async () => body });
const ADMIN = '0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa';

// Katalog fixture'ından admin satırları (GET /admin/payment-rails): yeni alanlar region, currencies, countries, defaultEnabled.
const enabledSet = new Set(['TR_IBAN', 'SEPA_IBAN', 'US_ACH']);
const mkRows = () => paymentRailCatalogFixture.map((r) => ({
  code: r.code, name: r.name, countries: r.countries, riskLevel: r.risk.riskLevel, enabled: enabledSet.has(r.code),
  region: r.region, currencies: r.currencies, defaultEnabled: r.defaultEnabled, changedAt: null, changedBy: null,
}));
// 12'den fazla satır: gruplar varsayılan kapalı gelir.
const manyRows = () => {
  const rows = mkRows();
  for (let i = 0; i < 6; i += 1) rows.push({ code: `X${i}_IBAN`, name: { TR: `Ekstra ${i}`, EN: `Extra ${i}` }, countries: ['ZZ'], riskLevel: 'MEDIUM', enabled: false, region: 'EUROPE', currencies: ['EUR'], defaultEnabled: false });
  return rows;
};

function makeFetch({ rails = mkRows(), putStatus = 200, putBody = { success: true } } = {}) {
  return vi.fn(async (url, opts = {}) => {
    if (opts.method === 'PUT') return json(putStatus, putBody);
    if (String(url).includes('payment-rails/audit')) return json(200, { items: [], total: 0, page: 1, limit: 10 });
    return json(200, { rails });
  });
}
const mount = async (props = {}) => {
  const fetchFn = props.fetchFn || makeFetch(props);
  const showToast = vi.fn();
  render(<AdminRailsPanel lang="EN" authenticatedFetch={fetchFn} showToast={showToast} />);
  await waitFor(() => expect(screen.getByTestId('rail-group-EUROPE')).toBeInTheDocument());
  return { fetchFn, showToast };
};

afterEach(() => cleanup());

describe('AdminRailsPanel: region groups, search, filter, counters', () => {
  it('groups rails by region with an enabled/total counter in each header', async () => {
    await mount();
    const europe = screen.getByTestId('rail-group-EUROPE');
    expect(within(europe).getByText('Europe')).toBeInTheDocument();
    expect(screen.getByTestId('rail-group-count-EUROPE')).toHaveTextContent('2/3 enabled');
    expect(screen.getByTestId('rail-group-count-AMERICAS')).toHaveTextContent('1/3 enabled');
    expect(screen.getByTestId('rail-group-count-ASIA_PACIFIC')).toHaveTextContent('0/1 enabled');
    expect(screen.getByTestId('rail-group-count-INTERNATIONAL')).toHaveTextContent('0/1 enabled');
    expect(within(europe).getByTestId('rail-row-GB_FPS')).toBeInTheDocument();
    expect(within(screen.getByTestId('rail-row-GB_FPS')).getByText(/Currency: GBP/)).toBeInTheDocument();
  });

  it('rows without a region (old API) land in the "Other" group', async () => {
    const rows = [
      { code: 'TR_IBAN', name: { TR: 'Türkiye', EN: 'Turkey' }, countries: ['TR'], riskLevel: 'MEDIUM', enabled: true },
      { code: 'US_ACH', name: { TR: 'ABD', EN: 'US ACH' }, countries: ['US'], riskLevel: 'HIGH', enabled: true },
    ];
    await mountOther(rows);
  });
  const mountOther = async (rows) => {
    render(<AdminRailsPanel lang="EN" authenticatedFetch={makeFetch({ rails: rows })} showToast={vi.fn()} />);
    await waitFor(() => expect(screen.getByTestId('rail-group-OTHER')).toBeInTheDocument());
    expect(within(screen.getByTestId('rail-group-OTHER')).getByText('Other')).toBeInTheDocument();
    expect(screen.getByTestId('rail-group-count-OTHER')).toHaveTextContent('2/2 enabled');
    expect(screen.getAllByRole('switch')).toHaveLength(2);
  };

  it('groups collapse and expand; with many rails they start collapsed', async () => {
    await mount({ rails: manyRows() });
    expect(screen.queryAllByRole('switch')).toHaveLength(0);
    const head = within(screen.getByTestId('rail-group-EUROPE')).getByRole('button', { expanded: false });
    fireEvent.click(head);
    expect(head).toHaveAttribute('aria-expanded', 'true');
    expect(within(screen.getByTestId('rail-group-EUROPE')).getAllByRole('switch')).toHaveLength(9);
    fireEvent.click(head);
    expect(screen.queryAllByRole('switch')).toHaveLength(0);
    // sayaç katlanmış grupta da görünür
    expect(screen.getByTestId('rail-group-count-EUROPE')).toHaveTextContent('2/9 enabled');
  });

  it('search matches code, name (either language) and country, and opens matching groups', async () => {
    await mount({ rails: manyRows() });
    const search = screen.getByRole('searchbox', { name: 'Search payment methods' });
    fireEvent.change(search, { target: { value: 'pix' } });
    expect(screen.getAllByRole('switch')).toHaveLength(1);
    expect(screen.getByTestId('rail-row-BR_PIX')).toBeInTheDocument();
    fireEvent.change(search, { target: { value: 'meksika' } }); // TR adı, EN arayüzde de eşleşir
    expect(screen.getByTestId('rail-row-MX_SPEI')).toBeInTheDocument();
    fireEvent.change(search, { target: { value: 'gb' } }); // ülke kodu + kod
    expect(screen.getByTestId('rail-row-GB_FPS')).toBeInTheDocument();
    fireEvent.change(search, { target: { value: 'nope-nothing' } });
    expect(screen.getByText('No matching payment methods.')).toBeInTheDocument();
  });

  it('status filter shows enabled / disabled / all', async () => {
    await mount();
    fireEvent.click(screen.getByRole('button', { name: 'Enabled' }));
    expect(screen.getAllByRole('switch')).toHaveLength(3);
    fireEvent.click(screen.getByRole('button', { name: 'Disabled' }));
    expect(screen.getAllByRole('switch')).toHaveLength(mkRows().length - 3);
    expect(screen.queryByTestId('rail-row-TR_IBAN')).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'All' }));
    expect(screen.getAllByRole('switch')).toHaveLength(mkRows().length);
    // süzgeç sayaçları değiştirmez (grubun tamamı üzerinden)
    fireEvent.click(screen.getByRole('button', { name: 'Disabled' }));
    expect(screen.getByTestId('rail-group-count-EUROPE')).toHaveTextContent('2/3 enabled');
  });

  it('there is no bulk enable/disable control', async () => {
    await mount();
    expect(screen.queryByRole('button', { name: /all rails|enable all|disable all|toplu/i })).not.toBeInTheDocument();
  });
});

describe('AdminRailsPanel: per-rail PUT flow is unchanged', () => {
  it('a row switch asks for confirmation and PUTs only that rail with {enabled, reason}', async () => {
    const { fetchFn, showToast } = await mount();
    fireEvent.click(within(screen.getByTestId('rail-row-GB_FPS')).getByRole('switch'));
    const dialog = screen.getByRole('dialog');
    expect(fetchFn.mock.calls.some(([, o]) => o?.method === 'PUT')).toBe(false);
    fireEvent.change(within(dialog).getByLabelText(/Reason/), { target: { value: 'open for UK' } });
    fireEvent.click(within(dialog).getByRole('button', { name: 'Confirm' }));
    await waitFor(() => expect(showToast).toHaveBeenCalledWith('Payment method updated.', 'success'));
    const puts = fetchFn.mock.calls.filter(([, o]) => o?.method === 'PUT');
    expect(puts).toHaveLength(1);
    expect(puts[0][0]).toMatch(/admin\/payment-rails\/GB_FPS$/);
    expect(JSON.parse(puts[0][1].body)).toEqual({ enabled: true, reason: 'open for UK' });
  });

  it('LAST_ENABLED_RAIL 409 still shows its toast; the last enabled rail switch is disabled', async () => {
    const { showToast } = await mount({ putStatus: 409, putBody: { code: 'LAST_ENABLED_RAIL' } });
    fireEvent.click(within(screen.getByTestId('rail-row-TR_IBAN')).getByRole('switch'));
    fireEvent.click(screen.getByRole('button', { name: 'Confirm' }));
    await waitFor(() => expect(showToast).toHaveBeenCalledWith('At least one payment method must stay enabled.', 'error'));
    cleanup();
    const only = mkRows().map((r) => ({ ...r, enabled: r.code === 'TR_IBAN' }));
    render(<AdminRailsPanel lang="EN" authenticatedFetch={makeFetch({ rails: only })} showToast={vi.fn()} />);
    await waitFor(() => screen.getByTestId('rail-row-TR_IBAN'));
    expect(within(screen.getByTestId('rail-row-TR_IBAN')).getByRole('switch')).toBeDisabled();
  });
});

// ── /orders/config tüketimi (useAppSessionData) ─────────────────────────────
describe('useAppSessionData reads the catalog from /orders/config', () => {
  const baseProps = {
    address: '0xabc', isConnected: true, connector: null, chainId: 84532, publicClient: null, currentView: 'home',
    showProfileModal: false, profileTab: 'ayarlar', lang: 'EN', isContractLoading: false,
    setShowMakerModal: vi.fn(), setShowProfileModal: vi.fn(), setCurrentView: vi.fn(), showToast: vi.fn(),
    SUPPORTED_TOKEN_ADDRESSES: { USDT: '', USDC: '' }, connectedWallet: '0xabc',
  };
  let exposed;
  const Harness = () => { exposed = useAppSessionData(baseProps); return null; };
  const original = global.fetch;
  const okJson = (body) => Promise.resolve({ ok: true, status: 200, json: async () => body });
  const route = (config) => vi.fn((url) => {
    const u = String(url);
    if (u.includes('/orders/config')) return okJson(config);
    if (u.includes('/auth/me')) return Promise.resolve({ ok: false, status: 401, json: async () => ({}) });
    if (u.includes('/orders')) return okJson({ orders: [], total: 0 });
    return okJson({});
  });
  beforeEach(() => { __resetInfraForTest(); resetRailCatalogState(); vi.spyOn(console, 'error').mockImplementation(() => {}); });
  afterEach(() => { cleanup(); global.fetch = original; vi.restoreAllMocks(); resetRailCatalogState(); __resetInfraForTest(); });

  it('puts paymentRailCatalog and supportedFiat into the context and the shared catalog state', async () => {
    global.fetch = route({ paymentRailCatalog: paymentRailCatalogFixture, supportedFiat: supportedFiatFixture, enabledPaymentRails: ['TR_IBAN', 'BR_PIX'] });
    render(<Harness />);
    await waitFor(() => expect(exposed.paymentRailCatalog).toHaveLength(paymentRailCatalogFixture.length));
    expect(exposed.supportedFiat).toEqual(supportedFiatFixture);
    expect(getRailCatalogState().catalog).toHaveLength(paymentRailCatalogFixture.length);
    expect(getRailCatalogState().enabledRails).toEqual(['TR_IBAN', 'BR_PIX']);
  });

  it('an older server without the new fields leaves the static fallback in place', async () => {
    global.fetch = route({ paymentRiskConfig: {}, enabledPaymentRails: ['TR_IBAN'] });
    render(<Harness />);
    await act(async () => { await new Promise((r) => setTimeout(r, 60)); });
    expect(exposed.paymentRailCatalog).toBeNull();
    expect(exposed.supportedFiat).toBeNull();
    expect(getRailCatalogState().catalog).toBeNull();
  });
});
