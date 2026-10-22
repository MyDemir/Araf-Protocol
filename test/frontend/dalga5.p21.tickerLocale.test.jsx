import React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, render, screen } from '@testing-library/react';
import ReferenceRateTicker from '../../frontend/src/components/ReferenceRateTicker';

const originalFetch = global.fetch;
const okPayload = (rate = 1234.5) => ({
  ok: true,
  json: async () => ({ items: [{ symbol: 'USD/TRY', rate, sourceKind: 'FIAT_OFFICIAL_REFERENCE' }], informationalOnly: true }),
});

beforeEach(() => {
  global.fetch = vi.fn();
  Object.defineProperty(document, 'hidden', { configurable: true, value: false });
});
afterEach(() => { cleanup(); vi.useRealTimers(); vi.restoreAllMocks(); global.fetch = originalFetch; });

describe('F4-14: ticker dil ve yaşlanma', () => {
  it('kur biçimi uygulamanın dilini izler (TR ondalık virgül, EN nokta)', async () => {
    global.fetch.mockResolvedValue(okPayload(1234.5));
    render(<ReferenceRateTicker lang="TR" />);
    expect((await screen.findAllByText('1.234,5')).length).toBeGreaterThan(0);
    cleanup();
    render(<ReferenceRateTicker lang="EN" />);
    expect((await screen.findAllByText('1,234.5')).length).toBeGreaterThan(0);
  });

  it('art arda iki yenileme hatasından sonra son kurlar "gecikmiş" işaretlenir', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    global.fetch.mockResolvedValueOnce(okPayload(35));
    global.fetch.mockRejectedValue(new Error('network'));
    render(<ReferenceRateTicker lang="TR" />);
    await screen.findAllByText('35');
    expect(screen.queryByTestId('reference-rate-ticker-aged')).toBeNull();
    await act(async () => { await vi.advanceTimersByTimeAsync(60_000); });
    expect(screen.queryByTestId('reference-rate-ticker-aged')).toBeNull();
    await act(async () => { await vi.advanceTimersByTimeAsync(60_000); });
    expect(screen.getByTestId('reference-rate-ticker-aged')).toBeInTheDocument();
  });
});
