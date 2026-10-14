import React from 'react';
import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, fireEvent, within, cleanup } from '@testing-library/react';
import MarketFilters, { MarketEmpty, amountUnit } from '../../frontend/src/app/contexts/marketplace/MarketFilters';
import { MARKET_FILTER_DEFAULTS } from '../../frontend/src/app/contexts/marketplace/marketFilters';

afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

// [TR] Şart Cümlesi: yalnız görünüm; filtre state'i aynı setFilter/onReset çağrılarıyla değişmeli.
const sortOptions = [{ value: 'AUTO', label: 'En yüksek miktar' }, { value: 'NEWEST', label: 'En yeni' }];
const baseProps = (over = {}) => ({
  lang: 'TR', filters: { ...MARKET_FILTER_DEFAULTS }, setFilter: vi.fn(), onReset: vi.fn(), activeFilterCount: 0,
  sortOptions, sortValue: 'AUTO', viewerTier: null, canHideOwn: true,
  result: { loading: false, error: false, shown: 8, total: 8, loaded: 8 }, closedRailCount: 2, ...over,
});
// [TR] Telefon genişliği: matchMedia(min-width: 768px) eşleşmez. [EN] Phone width: the desktop query does not match.
const stubPhone = () => vi.stubGlobal('matchMedia', () => ({ matches: false, addEventListener: () => {}, removeEventListener: () => {} }));

describe('amountUnit', () => {
  it('shows a readable unit instead of a pseudo symbol', () => {
    expect(amountUnit('ALL')).toBe('USDT/USDC');
    expect(amountUnit('USDC')).toBe('USDC');
  });
});

describe('MarketFilters desktop sentence', () => {
  it('picks a clause option through setFilter and shows closed-rail info', () => {
    const p = baseProps();
    render(<MarketFilters {...p} />);
    expect(screen.getByText('2 emirde ödeme yöntemi şu an kapalı')).toBeInTheDocument();
    fireEvent.click(screen.getByTestId('market-clause-fiat'));
    const dialog = screen.getByRole('dialog', { name: 'Para birimi' });
    fireEvent.click(within(dialog).getByRole('radio', { name: 'TRY' }));
    expect(p.setFilter).toHaveBeenCalledWith('fiat', 'TRY');
    fireEvent.change(screen.getByLabelText('İşlem tutarı'), { target: { value: '500' } });
    expect(p.setFilter).toHaveBeenCalledWith('amount', '500');
  });

  it('keeps the ELIGIBLE tier disabled without a viewer tier and resets in one tap', () => {
    const p = baseProps({ activeFilterCount: 2 });
    render(<MarketFilters {...p} />);
    fireEvent.click(screen.getByTestId('market-clause-tier'));
    expect(screen.getByRole('radio', { name: /Girebildiklerim/ })).toBeDisabled();
    fireEvent.keyDown(window, { key: 'Escape' });
    expect(screen.queryByRole('dialog')).toBeNull();
    fireEvent.click(screen.getAllByRole('button', { name: /Sıfırla/ })[0]);
    expect(p.onReset).toHaveBeenCalled();
  });

  it('labels the amount unit USDT/USDC or the chosen token, never a pseudo glyph', () => {
    const { rerender } = render(<MarketFilters {...baseProps()} />);
    const section = screen.getByTestId('market-filters');
    expect(section.textContent).not.toMatch(/₮/);
    expect(within(section).getAllByText('USDT/USDC').length).toBeGreaterThan(0);
    rerender(<MarketFilters {...baseProps({ filters: { ...MARKET_FILTER_DEFAULTS, token: 'USDC', amount: '20' } })} />);
    expect(screen.getByTestId('market-filters').textContent).not.toMatch(/₮/);
  });
});

describe('MarketFilters phone summary + sheet', () => {
  it('summarises the terms with a bound count, edit and reset', () => {
    const p = baseProps({ filters: { ...MARKET_FILTER_DEFAULTS, fiat: 'TRY', amount: '500' }, activeFilterCount: 2 });
    render(<MarketFilters {...p} />);
    const summary = screen.getByTestId('market-filters-summary');
    expect(summary).toHaveTextContent('TRY · 500 USDT/USDC · Al/Sat · Tüm kademeler');
    expect(within(summary).getByText('2 bağlı')).toBeInTheDocument();
    const edit = within(summary).getByRole('button', { name: /Şartları düzenle: TRY · 500 USDT\/USDC/ });
    expect(edit).toHaveAttribute('aria-haspopup', 'dialog');
    expect(edit).toHaveAttribute('aria-expanded', 'false');
    fireEvent.click(within(summary).getByRole('button', { name: /Sıfırla/ }));
    expect(p.onReset).toHaveBeenCalledTimes(1);
  });

  it('hides reset when nothing is bound', () => {
    render(<MarketFilters {...baseProps()} />);
    const summary = screen.getByTestId('market-filters-summary');
    expect(within(summary).queryByRole('button', { name: /Sıfırla/ })).toBeNull();
    expect(summary).toHaveTextContent('Her döviz · USDT/USDC · Al/Sat · Tüm kademeler');
  });

  it('opens the same clause editor in a sheet; options open inline and Esc steps back', () => {
    stubPhone();
    const p = baseProps({ activeFilterCount: 1, filters: { ...MARKET_FILTER_DEFAULTS, tier: 'NO_BOND' } });
    render(<MarketFilters {...p} />);
    const edit = screen.getByTestId('market-filters-edit');
    edit.focus();
    fireEvent.click(edit);
    const sheet = screen.getByRole('dialog', { name: 'Şartların' });
    expect(sheet).toHaveAttribute('aria-modal', 'true');
    expect(edit).toHaveAttribute('aria-expanded', 'true');

    const fiatSlot = within(sheet).getByTestId('market-sheet-clause-fiat');
    fireEvent.click(fiatSlot);
    expect(fiatSlot).toHaveAttribute('aria-expanded', 'true');
    const group = within(sheet).getByRole('radiogroup', { name: 'Para birimi' });
    expect(fiatSlot.getAttribute('aria-controls')).toBe(group.parentElement.id);
    fireEvent.click(within(group).getByRole('radio', { name: 'EUR' }));
    expect(p.setFilter).toHaveBeenCalledWith('fiat', 'EUR');
    expect(within(sheet).queryByRole('radiogroup')).toBeNull();
    expect(document.activeElement).toBe(fiatSlot);

    fireEvent.change(within(sheet).getByLabelText('İşlem tutarı'), { target: { value: '250' } });
    expect(p.setFilter).toHaveBeenCalledWith('amount', '250');
    fireEvent.click(within(sheet).getByRole('button', { name: 'kendi emirlerim hariç' }));
    expect(p.setFilter).toHaveBeenCalledWith('hideOwn', true);

    // Esc with an open option list only collapses it; the next Esc closes the sheet and focus returns to "Edit".
    fireEvent.click(within(sheet).getByTestId('market-sheet-clause-tier'));
    fireEvent.keyDown(within(sheet).getByRole('radiogroup'), { key: 'Escape' });
    expect(within(sheet).queryByRole('radiogroup')).toBeNull();
    expect(screen.getByRole('dialog', { name: 'Şartların' })).toBeInTheDocument();
    fireEvent.keyDown(window, { key: 'Escape' });
    expect(screen.queryByRole('dialog', { name: 'Şartların' })).toBeNull();
    expect(document.activeElement).toBe(edit);
  });

  it('closes from the result button, the backdrop, and resets from inside the sheet', () => {
    stubPhone();
    const p = baseProps({ activeFilterCount: 1, filters: { ...MARKET_FILTER_DEFAULTS, token: 'USDT' } });
    render(<MarketFilters {...p} />);
    fireEvent.click(screen.getByTestId('market-filters-edit'));
    let sheet = screen.getByTestId('market-filters-sheet');
    fireEvent.click(within(sheet).getByRole('button', { name: 'Sıfırla (1)' }));
    expect(p.onReset).toHaveBeenCalled();
    fireEvent.click(within(sheet).getByRole('button', { name: '8 emri göster' }));
    expect(screen.queryByTestId('market-filters-sheet')).toBeNull();

    fireEvent.click(screen.getByTestId('market-filters-edit'));
    sheet = screen.getByRole('dialog', { name: 'Şartların' });
    fireEvent.click(sheet);
    expect(screen.queryByRole('dialog', { name: 'Şartların' })).toBeNull();
  });

  it('keeps Tab inside the sheet', () => {
    stubPhone();
    render(<MarketFilters {...baseProps()} />);
    fireEvent.click(screen.getByTestId('market-filters-edit'));
    const sheet = screen.getByTestId('market-filters-sheet');
    const close = within(sheet).getByRole('button', { name: 'Kapat' });
    const apply = within(sheet).getByTestId('market-filters-apply');
    apply.focus();
    fireEvent.keyDown(apply, { key: 'Tab' });
    expect(document.activeElement).toBe(close);
    fireEvent.keyDown(close, { key: 'Tab', shiftKey: true });
    expect(document.activeElement).toBe(apply);
  });

  it('opens sort in the shared bottom sheet on phones', () => {
    stubPhone();
    const p = baseProps();
    render(<MarketFilters {...p} />);
    fireEvent.click(screen.getByTestId('market-clause-sort'));
    const sheet = screen.getByTestId('market-clause-sort-sheet');
    expect(screen.getByRole('dialog', { name: 'Sıralama' })).toHaveAttribute('aria-modal', 'true');
    fireEvent.click(within(sheet).getByRole('radio', { name: 'En yeni' }));
    expect(p.setFilter).toHaveBeenCalledWith('sort', 'NEWEST');
    expect(screen.queryByTestId('market-clause-sort-sheet')).toBeNull();
  });
});

describe('MarketEmpty', () => {
  it('loosens a single clause', () => {
    const setFilter = vi.fn();
    render(<MarketEmpty lang="TR" filters={{ ...MARKET_FILTER_DEFAULTS, fiat: 'EUR' }} setFilter={setFilter} activeFilterCount={1} isNarrowed />);
    fireEvent.click(screen.getByRole('button', { name: 'EUR şartını kaldır' }));
    expect(setFilter).toHaveBeenCalledWith('fiat', 'ALL');
  });

  it('shows the amount chip with a readable unit', () => {
    render(<MarketEmpty lang="TR" filters={{ ...MARKET_FILTER_DEFAULTS, amount: '500' }} setFilter={vi.fn()} activeFilterCount={1} isNarrowed />);
    expect(screen.getByRole('button', { name: '500 USDT/USDC şartını kaldır' })).toBeInTheDocument();
  });
});
