import React from 'react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, within, cleanup } from '@testing-library/react';
import MarketFiltersA, { MarketEmptyA } from '../../frontend/src/app/contexts/marketplace/MarketFiltersA';
import MarketFiltersB, { MarketEmptyB } from '../../frontend/src/app/contexts/marketplace/MarketFiltersB';
import { readMarketFiltersVariant } from '../../frontend/src/app/contexts/marketplace/marketFiltersVariant';
import { MARKET_FILTER_DEFAULTS } from '../../frontend/src/app/contexts/marketplace/marketFilters';

afterEach(cleanup);

// [TR] Geçici tasarım önerileri: yalnız görünüm değişir; filtre state'i aynı setFilter/reset çağrılarıyla değişmeli.
const sortOptions = [{ value: 'AUTO', label: 'En yüksek miktar' }, { value: 'NEWEST', label: 'En yeni' }];
const baseProps = (over = {}) => ({
  lang: 'TR', filters: { ...MARKET_FILTER_DEFAULTS }, setFilter: vi.fn(), onReset: vi.fn(), activeFilterCount: 0,
  sortOptions, sortValue: 'AUTO', viewerTier: null, canHideOwn: true,
  result: { loading: false, error: false, shown: 8, total: 8, loaded: 8 }, closedRailCount: 2, ...over,
});

describe('readMarketFiltersVariant', () => {
  beforeEach(() => sessionStorage.clear());
  const win = (search) => ({ location: { search }, sessionStorage });
  it('defaults to the current UI', () => { expect(readMarketFiltersVariant(win(''))).toBeNull(); });
  it('reads A/B from the query and remembers it; off clears it', () => {
    expect(readMarketFiltersVariant(win('?filtersVariant=b'))).toBe('B');
    expect(readMarketFiltersVariant(win(''))).toBe('B');
    expect(readMarketFiltersVariant(win('?filtersVariant=off'))).toBeNull();
    expect(readMarketFiltersVariant(win(''))).toBeNull();
  });
});

describe('MarketFiltersA (clause line)', () => {
  it('picks a clause option through setFilter and shows closed-rail info', () => {
    const p = baseProps();
    render(<MarketFiltersA {...p} />);
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
    render(<MarketFiltersA {...p} />);
    fireEvent.click(screen.getByTestId('market-clause-tier'));
    expect(screen.getByRole('radio', { name: /Girebildiklerim/ })).toBeDisabled();
    fireEvent.keyDown(window, { key: 'Escape' });
    fireEvent.click(screen.getByRole('button', { name: /Sıfırla/ }));
    expect(p.onReset).toHaveBeenCalled();
  });
  it('empty state loosens a single clause', () => {
    const setFilter = vi.fn();
    render(<MarketEmptyA lang="TR" filters={{ ...MARKET_FILTER_DEFAULTS, fiat: 'EUR' }} setFilter={setFilter} activeFilterCount={1} isNarrowed />);
    fireEvent.click(screen.getByRole('button', { name: 'EUR şartını kaldır' }));
    expect(setFilter).toHaveBeenCalledWith('fiat', 'ALL');
  });
});

describe('MarketFiltersB (tier console)', () => {
  it('opens the full sheet, sets filters and closes with the result button', () => {
    const p = baseProps({ activeFilterCount: 1, filters: { ...MARKET_FILTER_DEFAULTS, amount: '250' } });
    render(<MarketFiltersB {...p} />);
    fireEvent.click(screen.getByTestId('market-filters-open'));
    const sheet = screen.getByTestId('market-filters-sheet');
    fireEvent.click(within(sheet).getByRole('button', { name: 'Teminatsız' }));
    expect(p.setFilter).toHaveBeenCalledWith('tier', 'NO_BOND');
    fireEvent.click(within(sheet).getByRole('radio', { name: 'Sat' }));
    expect(p.setFilter).toHaveBeenCalledWith('side', 'SELL');
    fireEvent.click(within(sheet).getByRole('switch', { name: 'Emirlerimi gizle' }));
    expect(p.setFilter).toHaveBeenCalledWith('hideOwn', true);
    fireEvent.click(within(sheet).getByRole('button', { name: '8 emri göster' }));
    expect(screen.queryByTestId('market-filters-sheet')).toBeNull();
  });
  it('quick chips toggle token back to ALL and remove active chips', () => {
    const p = baseProps({ filters: { ...MARKET_FILTER_DEFAULTS, token: 'USDT', amount: '250' }, activeFilterCount: 2 });
    render(<MarketFiltersB {...p} />);
    // [0] masaüstü paneli, [1] telefon hızlı çipi (seçiliyken tekrar dokunmak ALL'a döner).
    fireEvent.click(screen.getAllByRole('button', { name: 'USDT' })[1]);
    expect(p.setFilter).toHaveBeenCalledWith('token', 'ALL');
    fireEvent.click(screen.getAllByRole('button', { name: /≥ 250 USDT filtresini kaldır/ })[0]);
    expect(p.setFilter).toHaveBeenCalledWith('amount', '');
  });
  it('empty state widens the side and clears filters', () => {
    const setFilter = vi.fn(); const onReset = vi.fn();
    render(<MarketEmptyB lang="TR" filters={{ ...MARKET_FILTER_DEFAULTS, side: 'BUY' }} setFilter={setFilter} onReset={onReset} activeFilterCount={1} isNarrowed />);
    fireEvent.click(screen.getByRole('button', { name: 'Al + Sat göster' }));
    expect(setFilter).toHaveBeenCalledWith('side', 'ALL');
    fireEvent.click(screen.getByRole('button', { name: /Temizle \(1\)/ }));
    expect(onReset).toHaveBeenCalled();
  });
});
