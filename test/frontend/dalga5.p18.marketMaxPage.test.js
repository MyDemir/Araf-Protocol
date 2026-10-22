import { describe, it, expect } from 'vitest';
import { hasMoreMarketOrders, MARKET_MAX_PAGE } from '../../frontend/src/app/contexts/marketplace/marketFilters';

describe('Dalga5 P18 pazar sayfa ust siniri (backend page<=200)', () => {
  it('sabit 200', () => { expect(MARKET_MAX_PAGE).toBe(200); });
  it('200. sayfaya ulasinca toplam daha buyuk olsa da hasMore false', () => {
    expect(hasMoreMarketOrders({ total: 1000000, page: 200, lastPageCount: 50, limit: 50 })).toBe(false);
  });
  it('199. sayfada hasMore hala true', () => {
    expect(hasMoreMarketOrders({ total: 1000000, page: 199, lastPageCount: 50, limit: 50 })).toBe(true);
  });
});
