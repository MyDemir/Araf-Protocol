import React from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen, waitFor, within, fireEvent } from '@testing-library/react';
import AdminRuntimeSettingsPanel from '../../frontend/src/app/contexts/admin/AdminRuntimeSettingsPanel';

const ADMIN = '0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa';
const mk = (over = {}) => ([
  { key: 'LIVE_POLL_INTERVAL_MS', unit: 'ms', min: 5000, max: 300000, default: 15000, envValue: null, adminValue: null, value: 15000, source: 'default', description: { TR: 'tr', EN: 'Live polling interval' }, changedAt: null, changedBy: null },
  { key: 'WORKER_BLOCK_BATCH_SIZE', unit: 'blocks', min: 1, max: 2000, default: 1000, envValue: 10, adminValue: 25, value: 25, source: 'admin', description: { TR: 'tr', EN: 'Blocks per call' }, changedAt: '2026-01-01T00:00:00Z', changedBy: ADMIN, ...over },
  { key: 'WORKER_REPLAY_BATCH_DELAY_MS', unit: 'ms', min: 0, max: 10000, default: 250, envValue: 100, adminValue: null, value: 100, source: 'env', description: { TR: 'tr', EN: 'Delay' }, changedAt: null, changedBy: null },
]);

const json = (status, body) => ({ ok: status < 400, status, json: async () => body });

function makeFetch({ putStatus = 200, putBody = { success: true }, settings = mk() } = {}) {
  return vi.fn(async (url, opts = {}) => {
    if (opts.method === 'PUT') return json(putStatus, putBody);
    if (String(url).includes('runtime-settings/audit')) {
      return json(200, { items: [{ id: 'a1', setting: 'WORKER_BLOCK_BATCH_SIZE', previousValue: null, newValue: 25, adminWallet: ADMIN, reason: 'free plan', createdAt: '2026-01-01T00:00:00Z' }], total: 1, page: 1, limit: 10 });
    }
    return json(200, { settings, version: 4, degraded: false });
  });
}

afterEach(() => cleanup());

describe('AdminRuntimeSettingsPanel', () => {
  it('shows effective value, source, bounds hint, labelled numeric inputs, audit and RPC explanation', async () => {
    render(<AdminRuntimeSettingsPanel lang="EN" authenticatedFetch={makeFetch()} showToast={vi.fn()} />);
    await waitFor(() => expect(screen.getByText('LIVE_POLL_INTERVAL_MS')).toBeInTheDocument());
    expect(screen.getByText(/Source: Admin/)).toBeInTheDocument();
    expect(screen.getByText(/Source: Env/)).toBeInTheDocument();
    expect(screen.getByText(/Source: Default/)).toBeInTheDocument();
    expect(screen.getByText('Range: 5000–300000 ms')).toBeInTheDocument();
    const inputs = screen.getAllByLabelText(/New value/);
    expect(inputs).toHaveLength(3);
    expect(inputs[0]).toHaveAttribute('type', 'number');
    expect(inputs[0]).toHaveAttribute('min', '5000');
    expect(inputs[0]).toHaveAttribute('max', '300000');
    expect(screen.getByText(/RPC URLs are intentionally not here/)).toBeInTheDocument();
    await waitFor(() => expect(screen.getByText('free plan')).toBeInTheDocument());
    // sadece admin kaynaklı ayarda "env'e dön" görünür
    expect(screen.getAllByRole('button', { name: /Revert to env/ })).toHaveLength(1);
  });

  it('client-side bounds: out-of-range value shows an error and does not open the dialog or call PUT', async () => {
    const fetchFn = makeFetch();
    render(<AdminRuntimeSettingsPanel lang="EN" authenticatedFetch={fetchFn} showToast={vi.fn()} />);
    await waitFor(() => screen.getAllByLabelText(/New value/));
    fireEvent.change(screen.getAllByLabelText(/New value/)[0], { target: { value: '100' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save: LIVE_POLL_INTERVAL_MS' }));
    expect(screen.getByText('Enter a whole number between 5000 and 300000.')).toBeInTheDocument();
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(fetchFn.mock.calls.some(([, o]) => o?.method === 'PUT')).toBe(false);
  });

  it('save asks for confirmation (reason <= 300) and PUTs value with expectedVersion only after confirm', async () => {
    const fetchFn = makeFetch();
    const showToast = vi.fn();
    render(<AdminRuntimeSettingsPanel lang="EN" authenticatedFetch={fetchFn} showToast={showToast} />);
    await waitFor(() => screen.getAllByLabelText(/New value/));
    fireEvent.change(screen.getAllByLabelText(/New value/)[0], { target: { value: '30000' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save: LIVE_POLL_INTERVAL_MS' }));
    const dialog = screen.getByRole('dialog');
    expect(fetchFn.mock.calls.some(([, o]) => o?.method === 'PUT')).toBe(false);
    const reason = within(dialog).getByLabelText(/Reason/);
    expect(reason).toHaveAttribute('maxlength', '300');
    fireEvent.change(reason, { target: { value: 'quota' } });
    fireEvent.click(within(dialog).getByRole('button', { name: 'Confirm' }));
    await waitFor(() => expect(showToast).toHaveBeenCalledWith('Setting updated. Applies from the next round.', 'success'));
    const put = fetchFn.mock.calls.find(([, o]) => o?.method === 'PUT');
    expect(put[0]).toMatch(/admin\/runtime-settings\/LIVE_POLL_INTERVAL_MS$/);
    expect(JSON.parse(put[1].body)).toEqual({ value: 30000, expectedVersion: 4, reason: 'quota' });
  });

  it('revert to env sends reset:true after confirmation', async () => {
    const fetchFn = makeFetch();
    render(<AdminRuntimeSettingsPanel lang="EN" authenticatedFetch={fetchFn} showToast={vi.fn()} />);
    await waitFor(() => screen.getAllByLabelText(/New value/));
    fireEvent.click(screen.getByRole('button', { name: /Revert to env: WORKER_BLOCK_BATCH_SIZE/ }));
    fireEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Confirm' }));
    await waitFor(() => expect(fetchFn.mock.calls.some(([, o]) => o?.method === 'PUT')).toBe(true));
    const put = fetchFn.mock.calls.find(([, o]) => o?.method === 'PUT');
    expect(JSON.parse(put[1].body)).toMatchObject({ reset: true, expectedVersion: 4 });
  });

  it('409 conflict shows a refresh warning and refresh reloads', async () => {
    const fetchFn = makeFetch({ putStatus: 409, putBody: { code: 'RUNTIME_SETTING_CONFLICT' } });
    const showToast = vi.fn();
    render(<AdminRuntimeSettingsPanel lang="EN" authenticatedFetch={fetchFn} showToast={showToast} />);
    await waitFor(() => screen.getAllByLabelText(/New value/));
    fireEvent.change(screen.getAllByLabelText(/New value/)[0], { target: { value: '30000' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save: LIVE_POLL_INTERVAL_MS' }));
    fireEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Confirm' }));
    const alert = await screen.findByText(/changed by another admin/);
    expect(alert).toBeInTheDocument();
    expect(showToast).not.toHaveBeenCalledWith(expect.anything(), 'success');
    const getsBefore = fetchFn.mock.calls.filter(([u, o]) => !o?.method && String(u).endsWith('admin/runtime-settings')).length;
    fireEvent.click(screen.getByRole('button', { name: 'Refresh' }));
    await waitFor(() => expect(fetchFn.mock.calls.filter(([u, o]) => !o?.method && String(u).endsWith('admin/runtime-settings')).length).toBe(getsBefore + 1));
    await waitFor(() => expect(screen.queryByText(/changed by another admin/)).toBeNull());
  });

  it('403 shows access denied', async () => {
    const fetchFn = vi.fn(async () => json(403, {}));
    render(<AdminRuntimeSettingsPanel lang="EN" authenticatedFetch={fetchFn} showToast={vi.fn()} />);
    await waitFor(() => expect(screen.getByRole('alert')).toHaveTextContent('Admin access denied.'));
  });

  it('groups settings, shows cost warning, and surfaces a server constraint error (400)', async () => {
    const base = { unit: 'ms', min: 1, max: 100, default: 5, envValue: null, adminValue: null, value: 5, source: 'default', description: { TR: 'tr', EN: 'desc' }, changedAt: null, changedBy: null };
    const settings = [
      { ...base, key: 'LIVE_POLL_INTERVAL_MS', group: 'worker' },
      { ...base, key: 'WORKER_BLOCK_STALE_MS', group: 'watchdog' },
      { ...base, key: 'READY_CACHE_TTL_MS', group: 'cache' },
      { ...base, key: 'REFERENCE_TICKER_MAX_STALE_SECONDS', group: 'ticker' },
      { ...base, key: 'REPUTATION_DECAY_TX_LIMIT', group: 'jobs', unit: 'tx', warning: { TR: 'maliyet', EN: 'Cost warning: relayer gas' } },
    ];
    const fetchFn = makeFetch({ settings, putStatus: 400, putBody: { error: 'WORKER_LIVENESS_STALE_MS too low', code: 'RUNTIME_SETTING_CONSTRAINT' } });
    const showToast = vi.fn();
    render(<AdminRuntimeSettingsPanel lang="EN" authenticatedFetch={fetchFn} showToast={showToast} />);
    await waitFor(() => screen.getByText('REPUTATION_DECAY_TX_LIMIT'));
    for (const name of ['Worker', 'Watchdog / Health', 'Caches', 'Rate reference', 'Background jobs']) {
      expect(screen.getByRole('heading', { name })).toBeInTheDocument();
    }
    expect(screen.getByText(/Cost warning: relayer gas/)).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText(/New value/, { selector: '#rs-input-WORKER_BLOCK_STALE_MS' }), { target: { value: '50' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save: WORKER_BLOCK_STALE_MS' }));
    fireEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Confirm' }));
    await waitFor(() => expect(showToast).toHaveBeenCalledWith('WORKER_LIVENESS_STALE_MS too low', 'error'));
  });

  it('shows constraint hints and a calm violation warning per setting', async () => {
    const base = { unit: 'ms', min: 1, max: 100, default: 5, envValue: null, adminValue: null, value: 5, source: 'default', description: { TR: 'tr', EN: 'desc' }, changedAt: null, changedBy: null, group: 'watchdog' };
    const settings = [
      { ...base, key: 'WORKER_LIVENESS_STALE_MS', constraints: [{ TR: 'tr', EN: '≥ 2 × Block stale threshold' }], constraintViolations: ['liveness too low'] },
      { ...base, key: 'READY_CACHE_TTL_MS', constraints: [], constraintViolations: [] },
    ];
    render(<AdminRuntimeSettingsPanel lang="EN" authenticatedFetch={makeFetch({ settings })} showToast={vi.fn()} />);
    await waitFor(() => screen.getByText('WORKER_LIVENESS_STALE_MS'));
    expect(screen.getByText(/≥ 2 × Block stale threshold/)).toBeInTheDocument();
    expect(screen.getByText(/violate this constraint: liveness too low/)).toBeInTheDocument();
    expect(screen.getAllByText(/Current values violate/)).toHaveLength(1);
  });
});
