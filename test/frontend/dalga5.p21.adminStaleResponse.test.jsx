import React from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import AdminPanel from '../../frontend/src/AdminPanel';

afterEach(() => cleanup());

const deferred = () => {
  let resolve;
  const promise = new Promise((r) => { resolve = r; });
  return { promise, resolve };
};
const ok = (body) => ({ status: 200, ok: true, json: async () => body });

// [TR] F4-07: filtre hızlı değişince geç dönen ESKİ yanıt yeni yanıtın üstüne yazmaz.
describe('F4-07: admin trades bayat yanıt koruması', () => {
  it('yavaş ilk istek sonradan dönse bile son filtrenin satırları kalır', async () => {
    const first = deferred();
    const second = deferred();
    const tradeCalls = [];
    const authenticatedFetch = vi.fn(async (url) => {
      const u = String(url);
      if (u.includes('admin/trades')) {
        tradeCalls.push(u);
        return tradeCalls.length === 1 ? first.promise : second.promise;
      }
      return ok({ readiness: {}, stats: {}, tradeCounts: {}, dlq: {} });
    });

    render(<AdminPanel lang="EN" authenticatedFetch={authenticatedFetch} isAuthenticated authChecked showToast={vi.fn()} />);
    fireEvent.click(screen.getAllByRole('button', { name: 'Trades' })[0]);
    await waitFor(() => expect(tradeCalls.length).toBe(1));

    const statusSelect = screen.getAllByRole('combobox').find((el) => el.value === 'CHALLENGED');
    fireEvent.change(statusSelect, { target: { value: 'RESOLVED' } });
    await waitFor(() => expect(tradeCalls.length).toBe(2));
    expect(tradeCalls[1]).toContain('status=RESOLVED');

    await act(async () => { second.resolve(ok({ trades: [{ _id: 'b', onchain_escrow_id: '222' }], total: 1 })); });
    await waitFor(() => expect(screen.getByText('222')).toBeInTheDocument());
    await act(async () => { first.resolve(ok({ trades: [{ _id: 'a', onchain_escrow_id: '111' }], total: 1 })); });
    await act(async () => { await Promise.resolve(); });

    expect(screen.getByText('222')).toBeInTheDocument();
    expect(screen.queryByText('111')).toBeNull();
  });
});
