import React from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import AdminRailsPanel from '../../frontend/src/app/contexts/admin/AdminRailsPanel';
import AdminRuntimeSettingsPanel from '../../frontend/src/app/contexts/admin/AdminRuntimeSettingsPanel';
import { readJsonWithTimeout } from '../../frontend/src/app/fetchWithTimeout';

afterEach(() => { cleanup(); vi.useRealTimers(); });

const hungRes = () => ({ ok: true, status: 200, json: () => new Promise(() => {}) });
const okRes = (body) => ({ ok: true, status: 200, json: async () => body });

// [TR] F4-13: authenticatedFetch yalnız başlık zaman aşımını kapsar; gövde okuması da sınırlı olmalı.
describe('F4-13: gövde okuma zaman aşımı', () => {
  it('readJsonWithTimeout: takılan gövde TimeoutError ile reddedilir', async () => {
    vi.useFakeTimers();
    const p = readJsonWithTimeout(hungRes(), 1000);
    const assertion = expect(p).rejects.toMatchObject({ name: 'TimeoutError' });
    await vi.advanceTimersByTimeAsync(1500);
    await assertion;
  });

  it('readJsonWithTimeout: normal gövde döner', async () => {
    await expect(readJsonWithTimeout(okRes({ a: 1 }), 1000)).resolves.toEqual({ a: 1 });
  });

  it('AdminRailsPanel: takılan gövde "yükleniyor"da kalmaz, hata gösterir', async () => {
    vi.useFakeTimers();
    render(<AdminRailsPanel lang="EN" authenticatedFetch={vi.fn(async () => hungRes())} showToast={vi.fn()} />);
    await act(async () => { await vi.advanceTimersByTimeAsync(11000); });
    expect(screen.getByText('Failed to load payment methods.')).toBeInTheDocument();
  });

  it('AdminRuntimeSettingsPanel: takılan gövde hata gösterir', async () => {
    vi.useFakeTimers();
    render(<AdminRuntimeSettingsPanel lang="EN" authenticatedFetch={vi.fn(async () => hungRes())} showToast={vi.fn()} />);
    await act(async () => { await vi.advanceTimersByTimeAsync(11000); });
    expect(screen.getByText('Failed to load runtime settings.')).toBeInTheDocument();
  });
});

// [TR] F4-13 (ek): PUT yol parçaları encodeURIComponent ile kodlanır.
describe('F4-13: PUT yolu kodlama', () => {
  it('AdminRailsPanel: rail.code kodlanır', async () => {
    const fetchFn = vi.fn(async (url, opts = {}) => {
      if (opts.method === 'PUT') return okRes({ success: true });
      return okRes({ rails: [{ code: 'A/B?x', name: { EN: 'Odd' }, countries: [], riskLevel: 'LOW', enabled: true }, { code: 'OK', name: { EN: 'Ok' }, countries: [], riskLevel: 'LOW', enabled: true }] });
    });
    render(<AdminRailsPanel lang="EN" authenticatedFetch={fetchFn} showToast={vi.fn()} />);
    await waitFor(() => screen.getAllByRole('switch'));
    fireEvent.click(screen.getAllByRole('switch')[0]);
    fireEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Confirm' }));
    await waitFor(() => expect(fetchFn.mock.calls.some(([, o]) => o?.method === 'PUT')).toBe(true));
    const put = fetchFn.mock.calls.find(([, o]) => o?.method === 'PUT');
    expect(String(put[0])).toContain('/admin/payment-rails/A%2FB%3Fx');
  });

  it('AdminRuntimeSettingsPanel: setting.key kodlanır', async () => {
    const fetchFn = vi.fn(async (url, opts = {}) => {
      if (opts.method === 'PUT') return okRes({ success: true });
      if (String(url).includes('audit')) return okRes({ items: [], total: 0, page: 1, limit: 10 });
      return okRes({ settings: [{ key: 'ODD/KEY', unit: 'ms', min: 1, max: 100, default: 5, value: 5, source: 'default', description: { EN: 'd', TR: 'd' } }], version: 1, degraded: false });
    });
    render(<AdminRuntimeSettingsPanel lang="EN" authenticatedFetch={fetchFn} showToast={vi.fn()} />);
    await waitFor(() => screen.getAllByLabelText(/New value/));
    fireEvent.change(screen.getAllByLabelText(/New value/)[0], { target: { value: '10' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save: ODD/KEY' }));
    fireEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Confirm' }));
    await waitFor(() => expect(fetchFn.mock.calls.some(([, o]) => o?.method === 'PUT')).toBe(true));
    const put = fetchFn.mock.calls.find(([, o]) => o?.method === 'PUT');
    expect(String(put[0])).toContain('/admin/runtime-settings/ODD%2FKEY');
  });
});
