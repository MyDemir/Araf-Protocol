import { describe, expect, it } from 'vitest';
import { tradeStateRank } from '../../frontend/src/app/tradeStateSync';

// [TR] F4-18: prototip anahtarları rank üretmemeli.
describe('F4-18: tradeStateRank prototip anahtarlarını reddeder', () => {
  it.each(['constructor', 'toString', '__proto__', 'hasOwnProperty'])('%s -> -1', (k) => {
    expect(tradeStateRank(k)).toBe(-1);
  });
  it('bilinen durumlar korunur', () => {
    expect(tradeStateRank('OPEN')).toBe(0);
    expect(tradeStateRank('BURNED')).toBe(4);
    expect(tradeStateRank(undefined)).toBe(-1);
  });
});
