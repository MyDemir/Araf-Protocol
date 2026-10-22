import React from 'react';
import { afterEach, describe, expect, it } from 'vitest';
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import AdminRevenuePanel from '../../frontend/src/app/contexts/admin/AdminRevenuePanel';

afterEach(() => cleanup());

const makeRows = (n) => Array.from({ length: n }, (_, i) => ({
  tx_hash: `0x${i}`, log_index: i, block_number: i, kind: 0, token: '0xabc', amount: '1000000', reward_share: '0', treasury_share: '0', trade_id: i,
}));
const fetchWith = (rows) => async (url) => ({
  ok: true, status: 200,
  json: async () => (String(url).includes('rewards/health') ? { counts: { epochs: 1, funding: 1, claims: 1 } } : { rows }),
});

// [TR] F4-08: toplam etiketi sabit "500" demez; tablo kırpılınca kullanıcıya söylenir.
describe('F4-08: gelir paneli satır sayısı tutarlılığı', () => {
  it('250 satır: etiket gerçek sayıyı söyler ve tablo kırpması belirtilir', async () => {
    render(<AdminRevenuePanel lang="EN" authenticatedFetch={fetchWith(makeRows(250))} />);
    await waitFor(() => expect(screen.getByText(/last 250 loaded events/)).toBeInTheDocument());
    expect(screen.getByTestId('admin-revenue-truncated').textContent).toMatch(/100 of 250/);
  });

  it('50 satır: kırpma notu yok', async () => {
    render(<AdminRevenuePanel lang="EN" authenticatedFetch={fetchWith(makeRows(50))} />);
    await waitFor(() => expect(screen.getByText(/last 50 loaded events/)).toBeInTheDocument());
    expect(screen.queryByTestId('admin-revenue-truncated')).toBeNull();
  });
});
