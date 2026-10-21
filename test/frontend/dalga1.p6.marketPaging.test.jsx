import React from 'react';
import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, fireEvent, cleanup } from '@testing-library/react';
import MarketFilters from '../../frontend/src/app/contexts/marketplace/MarketFilters';
import {
  buildMarketOrdersQuery,
  hasMoreMarketOrders,
  MARKET_FILTER_DEFAULTS,
  mergeOrdersById,
} from '../../frontend/src/app/contexts/marketplace/marketFilters';

afterEach(() => cleanup());

const params = (q) => Object.fromEntries(new URLSearchParams(q.split('?')[1]));

describe('F3-02: pazar sayfalama yardımcıları', () => {
  it('1. sayfa için page göndermez, 2+ için gönderir; limit 50 kalır', () => {
    expect(params(buildMarketOrdersQuery())).toEqual({ status: 'ACTIVE', limit: '50' });
    expect(params(buildMarketOrdersQuery({ page: 1 })).page).toBeUndefined();
    expect(params(buildMarketOrdersQuery({ page: 3 }))).toEqual({ status: 'ACTIVE', limit: '50', page: '3' });
    expect(params(buildMarketOrdersQuery({ page: 0 })).page).toBeUndefined();
    expect(params(buildMarketOrdersQuery({ page: 'x' })).page).toBeUndefined();
  });

  it('id ile tekilleştirir, ilk görüleni tutar ve sıralamayı korur', () => {
    const a = [{ id: 'a', v: 1 }, { id: 'b', v: 1 }];
    const b = [{ id: 'b', v: 2 }, { id: 'c', v: 2 }, { id: 'a', v: 2 }];
    expect(mergeOrdersById(a, b)).toEqual([{ id: 'a', v: 1 }, { id: 'b', v: 1 }, { id: 'c', v: 2 }]);
  });

  it('id olmayan kayıtları elemez', () => {
    expect(mergeOrdersById([{ x: 1 }], [{ x: 2 }])).toHaveLength(2);
  });

  it('hasMore: toplam sayfa kapasitesini aşıyorsa ve son sayfa boş değilse', () => {
    expect(hasMoreMarketOrders({ total: 120, page: 1, lastPageCount: 50 })).toBe(true);
    expect(hasMoreMarketOrders({ total: 120, page: 3, lastPageCount: 20 })).toBe(false);
    expect(hasMoreMarketOrders({ total: 100, page: 2, lastPageCount: 50 })).toBe(false);
    expect(hasMoreMarketOrders({ total: 120, page: 2, lastPageCount: 0 })).toBe(false);
    expect(hasMoreMarketOrders({ total: null, page: 1, lastPageCount: 50 })).toBe(false);
  });
});

describe('F3-02: "Daha fazla yükle" düğmesi', () => {
  const base = (over = {}) => ({
    lang: 'TR', filters: { ...MARKET_FILTER_DEFAULTS }, setFilter: vi.fn(), onReset: vi.fn(),
    sortOptions: [{ value: 'AUTO', label: 'x' }], sortValue: 'AUTO',
    result: { loading: false, error: false, shown: 50, total: 120, loaded: 50 }, ...over,
  });

  it('hasMore yokken görünmez', () => {
    render(<MarketFilters {...base({ onLoadMore: vi.fn() })} />);
    expect(screen.queryByTestId('market-load-more')).toBeNull();
  });

  it('hasMore iken görünür ve tıklanınca onLoadMore çağrılır', () => {
    const onLoadMore = vi.fn();
    render(<MarketFilters {...base({ hasMore: true, onLoadMore })} />);
    fireEvent.click(screen.getByTestId('market-load-more'));
    expect(onLoadMore).toHaveBeenCalledTimes(1);
  });

  it('yüklenirken devre dışıdır; hata varsa uyarı ve "Tekrar dene" gösterir', () => {
    const { rerender } = render(<MarketFilters {...base({ hasMore: true, loadingMore: true, onLoadMore: vi.fn() })} />);
    expect(screen.getByTestId('market-load-more')).toBeDisabled();
    rerender(<MarketFilters {...base({ hasMore: true, loadMoreError: true, onLoadMore: vi.fn() })} />);
    expect(screen.getByRole('alert')).toHaveTextContent('Daha fazla emir yüklenemedi.');
    expect(screen.getByTestId('market-load-more')).toHaveTextContent('Tekrar dene');
  });
});
