import { describe, expect, it } from 'vitest';
import { fmtCompact, fmtDate, fmtDateTime, fmtInt, fmtNumber } from '../../frontend/src/app/format';
import { formatTokenAmount } from '../../frontend/src/app/orderUiModel';
import { formatTokenUnits, shortNum } from '../../frontend/src/components/SettlementPreviewModal';
import { safeDate } from '../../frontend/src/components/SettlementProposalCard';

describe('format.js (dile duyarlı gösterim)', () => {
  it('sayıları dile göre ayırıcılarla yazar; okunamayan değer "—" olur', () => {
    expect(fmtNumber(5156.25, 'TR', { maxFractionDigits: 2 })).toBe('5.156,25');
    expect(fmtNumber(5156.25, 'EN', { maxFractionDigits: 2 })).toBe('5,156.25');
    expect(fmtInt(18450, 'TR')).toBe('18.450');
    expect(fmtInt(18450, 'EN')).toBe('18,450');
    expect(fmtNumber(null, 'TR')).toBe('—');
    expect(fmtNumber('abc', 'EN')).toBe('—');
    expect(fmtNumber(0, 'TR')).toBe('0');
    expect(fmtNumber(123456789012345678901234567890n, 'EN', { maxFractionDigits: 0 })).toBe('123,456,789,012,345,678,901,234,567,890');
  });

  it('kompakt gösterim dile göre', () => {
    expect(fmtCompact(123456, 'EN')).toBe('123.5K');
    expect(fmtCompact(123456, 'TR')).toMatch(/^123,5\sB$/);
  });

  it('tarih ve saati dile göre yazar; geçersiz girdi "—" olur', () => {
    const iso = '2026-10-14T03:30:41Z';
    expect(fmtDateTime(iso, 'TR', { timeZone: 'UTC' })).toBe('14 Eki 2026 03:30');
    expect(fmtDateTime(iso, 'EN', { timeZone: 'UTC' })).toMatch(/^Oct 14, 2026,? 03:30 AM$/);
    expect(fmtDateTime(iso, 'TR', { timeZone: 'UTC', seconds: true })).toBe('14 Eki 2026 03:30:41');
    expect(fmtDate(iso, 'TR', { timeZone: 'UTC' })).toBe('14 Eki 2026');
    expect(fmtDateTime('invalid', 'TR')).toBe('—');
    expect(fmtDateTime(null, 'EN')).toBe('—');
  });

  it('token tutarı: hassasiyet aynı, yalnız ayırıcı dile göre', () => {
    expect(formatTokenAmount('1234567890', 6, 4)).toBe('1,234.5679');
    expect(formatTokenAmount('1234567890', 6, 4, 'TR')).toBe('1.234,5679');
    expect(formatTokenAmount('942000', 6, 4, 'TR')).toBe('0,942');
  });

  it('uzlaşma önizleme tutarları dile göre; kesme (2 hane) değişmez', () => {
    expect(formatTokenUnits('1234567890', 6)).toBe('1,234.56');
    expect(formatTokenUnits('1234567890', 6, 'TR')).toBe('1.234,56');
    expect(formatTokenUnits('73670000', 6, 'TR')).toBe('73,67');
    expect(shortNum('1234567', 'TR')).toBe('1.234.567');
    expect(shortNum('73.675', 'TR')).toBe('73,675');
  });

  it('safeDate dil alır', () => {
    expect(safeDate('2025-01-01T00:00:00.000Z', 'TR')).toMatch(/2025/);
    expect(safeDate('invalid-date', 'TR')).toBe('—');
  });
});
