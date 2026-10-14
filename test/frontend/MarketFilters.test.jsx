import React from 'react';
import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, fireEvent, within, cleanup } from '@testing-library/react';
import MarketFilters, { MarketEmpty, amountUnit } from '../../frontend/src/app/contexts/marketplace/MarketFilters';
import { MARKET_FILTER_DEFAULTS } from '../../frontend/src/app/contexts/marketplace/marketFilters';

afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

// [TR] Chip çubuğu: yalnız görünüm; filtre state'i aynı setFilter/onReset çağrılarıyla değişmeli.
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

describe('MarketFilters chip bar (desktop popover)', () => {
  it('picks a chip option through setFilter and shows closed-rail info', () => {
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
    fireEvent.click(screen.getByRole('button', { name: 'Filtreleri sıfırla (2)' }));
    expect(p.onReset).toHaveBeenCalled();
  });

  it('hides reset when nothing is bound', () => {
    render(<MarketFilters {...baseProps()} />);
    expect(screen.queryByTestId('market-filters-reset')).toBeNull();
  });

  it('idle chips show the dimension, bound chips show the value', () => {
    const { rerender } = render(<MarketFilters {...baseProps()} />);
    expect(screen.getByTestId('market-clause-fiat')).toHaveTextContent('Döviz');
    expect(screen.getByTestId('market-clause-token')).toHaveTextContent('Token');
    expect(screen.getByTestId('market-clause-tier')).toHaveTextContent('Kademe');
    rerender(<MarketFilters {...baseProps({ filters: { ...MARKET_FILTER_DEFAULTS, fiat: 'EUR', token: 'USDC', tier: 'NO_BOND' }, activeFilterCount: 3 })} />);
    expect(screen.getByTestId('market-clause-fiat')).toHaveTextContent('EUR');
    expect(screen.getByTestId('market-clause-token')).toHaveTextContent('USDC');
    expect(screen.getByTestId('market-clause-tier')).toHaveTextContent('Teminatsız');
    expect(screen.getByTestId('market-clause-fiat')).toHaveAttribute('aria-label', 'Para birimi: EUR');
  });

  it('labels the amount unit USDT/USDC or the chosen token, never a pseudo glyph', () => {
    const { rerender } = render(<MarketFilters {...baseProps({ filters: { ...MARKET_FILTER_DEFAULTS, amount: '20' } })} />);
    const section = screen.getByTestId('market-filters');
    expect(section.textContent).not.toMatch(/₮/);
    expect(within(section).getAllByText('USDT/USDC').length).toBeGreaterThan(0);
    rerender(<MarketFilters {...baseProps({ filters: { ...MARKET_FILTER_DEFAULTS, token: 'USDC', amount: '20' } })} />);
    expect(screen.getByTestId('market-filters').textContent).not.toMatch(/₮/);
    expect(within(screen.getByTestId('market-filters')).getAllByText('USDC').length).toBeGreaterThan(0);
  });

  it('switches the side through the segment, with arrow keys too', () => {
    const p = baseProps({ filters: { ...MARKET_FILTER_DEFAULTS, side: 'BUY' } });
    render(<MarketFilters {...p} />);
    const group = screen.getByRole('radiogroup', { name: 'İşlem yönü' });
    expect(within(group).getByRole('radio', { name: 'Al' })).toHaveAttribute('aria-checked', 'true');
    fireEvent.click(within(group).getByRole('radio', { name: 'Sat' }));
    expect(p.setFilter).toHaveBeenLastCalledWith('side', 'SELL');
    fireEvent.keyDown(group, { key: 'ArrowLeft' });
    expect(p.setFilter).toHaveBeenLastCalledWith('side', 'ALL');
  });

  it('toggles hide-mine and shows the server total in the result line', () => {
    const p = baseProps({ result: { loading: false, error: false, shown: 3, total: 120, loaded: 50 } });
    render(<MarketFilters {...p} />);
    expect(screen.getByText('3 emir · toplam 120')).toBeInTheDocument();
    const hide = screen.getByRole('button', { name: 'Emirlerimi gizle' });
    expect(hide).toHaveAttribute('aria-pressed', 'false');
    fireEvent.click(hide);
    expect(p.setFilter).toHaveBeenCalledWith('hideOwn', true);
  });
});

describe('MarketFilters chip bar (phone sheet)', () => {
  it('opens a chip in the shared bottom sheet and keeps Tab inside it', () => {
    stubPhone();
    const p = baseProps();
    render(<MarketFilters {...p} />);
    const fiat = screen.getByTestId('market-clause-fiat');
    fiat.focus();
    fireEvent.click(fiat);
    const sheet = screen.getByTestId('market-clause-fiat-sheet');
    expect(screen.getByRole('dialog', { name: 'Para birimi' })).toHaveAttribute('aria-modal', 'true');
    const close = within(sheet).getByRole('button', { name: 'Kapat' });
    const last = within(sheet).getAllByRole('radio').at(-1);
    last.focus();
    fireEvent.keyDown(last, { key: 'Tab' });
    expect(document.activeElement).toBe(close);
    fireEvent.click(within(sheet).getByRole('radio', { name: 'EUR' }));
    expect(p.setFilter).toHaveBeenCalledWith('fiat', 'EUR');
    expect(screen.queryByTestId('market-clause-fiat-sheet')).toBeNull();
    expect(document.activeElement).toBe(fiat);
  });

  it('closes the sheet with Esc without picking', () => {
    stubPhone();
    const p = baseProps();
    render(<MarketFilters {...p} />);
    fireEvent.click(screen.getByTestId('market-clause-tier'));
    expect(screen.getByRole('dialog', { name: 'Teminat kademesi' })).toBeInTheDocument();
    fireEvent.keyDown(window, { key: 'Escape' });
    expect(screen.queryByRole('dialog', { name: 'Teminat kademesi' })).toBeNull();
    expect(p.setFilter).not.toHaveBeenCalled();
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
  it('loosens a single filter', () => {
    const setFilter = vi.fn();
    render(<MarketEmpty lang="TR" filters={{ ...MARKET_FILTER_DEFAULTS, fiat: 'EUR' }} setFilter={setFilter} activeFilterCount={1} isNarrowed canCreate />);
    expect(screen.getByText('Bu filtrelerle emir yok')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'EUR filtresini kaldır' }));
    expect(setFilter).toHaveBeenCalledWith('fiat', 'ALL');
  });

  it('shows the amount chip with a readable unit', () => {
    render(<MarketEmpty lang="TR" filters={{ ...MARKET_FILTER_DEFAULTS, amount: '500' }} setFilter={vi.fn()} activeFilterCount={1} isNarrowed />);
    expect(screen.getByRole('button', { name: '500 USDT/USDC filtresini kaldır' })).toBeInTheDocument();
  });

  it('offers "post the first order" when the market is empty and the gate is open', () => {
    const onCreate = vi.fn();
    render(<MarketEmpty lang="TR" filters={MARKET_FILTER_DEFAULTS} setFilter={vi.fn()} isNarrowed={false} canCreate onCreate={onCreate} />);
    expect(screen.getByText('Henüz açık emir yok')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'İlk emri sen aç' }));
    expect(onCreate).toHaveBeenCalled();
    expect(screen.queryByTestId('market-empty-closed')).toBeNull();
  });

  it('replaces the CTA with a calm "temporarily closed" chip when the gate is closed', () => {
    render(<MarketEmpty lang="TR" filters={MARKET_FILTER_DEFAULTS} setFilter={vi.fn()} isNarrowed={false} canCreate={false} onCreate={vi.fn()} />);
    expect(screen.queryByRole('button', { name: 'İlk emri sen aç' })).toBeNull();
    expect(screen.getByTestId('market-empty-closed')).toHaveTextContent('Yeni emirler geçici olarak kapalı');
  });

  it('shows only the feed error without create or closed chips', () => {
    render(<MarketEmpty lang="TR" filters={MARKET_FILTER_DEFAULTS} setFilter={vi.fn()} feedError canCreate={false} />);
    expect(screen.getByText('Pazar verisi alınamadı')).toBeInTheDocument();
    expect(screen.queryByTestId('market-empty-closed')).toBeNull();
  });
});
