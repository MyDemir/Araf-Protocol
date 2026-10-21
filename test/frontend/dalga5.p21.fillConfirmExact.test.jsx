import React from 'react';
import { afterEach, describe, expect, it } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import FillConfirmSheet from '../../frontend/src/components/FillConfirmSheet';

afterEach(() => cleanup());

const summary = (over = {}) => ({
  direction: 'buy', crypto: 'DAI', fiat: 'TRY', rate: null, decimals: 18,
  fillAmountRaw: 1_000_000_000_000_000_001n, bondRaw: 80_000_000_000_000_000n, lockTotalRaw: 80_000_000_000_000_000n,
  feeRaw: null, paymentWindowMs: 48 * 3600000, counterpartyTier: 1, bondIsUpperBound: false, rail: null,
  ...over,
});

// [TR] F4-11: onay ekranı tutarı Number'a çevirip yuvarlamaz; bigint'ten birebir basamaklarla gösterir.
describe('F4-11: fon onay ekranında tutar birebir', () => {
  it('18 ondalıklı token: 1.000000000000000001 yuvarlanmaz (EN)', () => {
    render(<FillConfirmSheet summary={summary()} lang="EN" onConfirm={() => {}} onCancel={() => {}} />);
    expect(screen.getByTestId('fill-confirm-amount').textContent).toContain('1.000000000000000001 DAI');
    expect(screen.getByTestId('fill-confirm-bond').textContent).toContain('0.08 DAI');
  });

  it('TR ayırıcılar ve binlik gruplama korunur', () => {
    render(<FillConfirmSheet summary={summary({ fillAmountRaw: 1234567n * 10n ** 18n + 1n })} lang="TR" onConfirm={() => {}} onCancel={() => {}} />);
    expect(screen.getByTestId('fill-confirm-amount').textContent).toContain('1.234.567,000000000000000001 DAI');
  });

  it('negatif değerlerde işaret korunur (-0.5, -1.5)', () => {
    render(<FillConfirmSheet summary={summary({ fillAmountRaw: -500_000_000_000_000_000n, bondRaw: -1_500_000_000_000_000_000n })} lang="EN" onConfirm={() => {}} onCancel={() => {}} />);
    expect(screen.getByTestId('fill-confirm-amount').textContent).toContain('-0.5 DAI');
    expect(screen.getByTestId('fill-confirm-bond').textContent).toContain('-1.5 DAI');
  });

  it('6 ondalıklı token eski görünümü korur', () => {
    render(<FillConfirmSheet summary={summary({ decimals: 6, crypto: 'USDT', fillAmountRaw: 25_500_000n, bondRaw: 8_000_000n, lockTotalRaw: 8_000_000n })} lang="EN" onConfirm={() => {}} onCancel={() => {}} />);
    expect(screen.getByTestId('fill-confirm-amount').textContent).toContain('25.5 USDT');
  });
});
