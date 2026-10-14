import React from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen, waitFor, within, fireEvent } from '@testing-library/react';
import AdminSocialLinksPanel from '../../frontend/src/app/contexts/admin/AdminSocialLinksPanel';

const ADMIN = '0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa';
const LINKS = [
  { id: 'a1', label: 'X', url: 'https://x.com/araf', order: 0, enabled: true },
  { id: 'b2', label: 'GitHub', url: 'https://github.com/araf', order: 1, enabled: true },
];
const json = (status, body) => ({ ok: status < 400, status, json: async () => body });

function makeFetch({ putStatus = 200, putBody = { success: true } } = {}) {
  return vi.fn(async (url, opts = {}) => {
    if (opts.method === 'PUT') return json(putStatus, putBody);
    if (String(url).includes('social-links/audit')) {
      return json(200, { items: [{ id: 'x1', previousLinks: [], newLinks: LINKS, version: 3, adminWallet: ADMIN, reason: 'initial setup', createdAt: '2026-01-01T00:00:00Z' }], total: 1, page: 1, limit: 10 });
    }
    return json(200, { links: LINKS, version: 3 });
  });
}
const putCalls = (f) => f.mock.calls.filter(([, o]) => o?.method === 'PUT');

afterEach(() => cleanup());

describe('AdminSocialLinksPanel', () => {
  it('lists links, allowed domains and audit history', async () => {
    render(<AdminSocialLinksPanel lang="EN" authenticatedFetch={makeFetch()} showToast={vi.fn()} />);
    await waitFor(() => expect(screen.getByLabelText('URL #1')).toHaveValue('https://x.com/araf'));
    expect(screen.getByLabelText('URL #2')).toHaveValue('https://github.com/araf');
    expect(screen.getByText(/Allowed domains/)).toBeInTheDocument();
    await waitFor(() => expect(screen.getByText('initial setup')).toBeInTheDocument());
  });

  it('client validation blocks invalid URL and label; no dialog and no PUT', async () => {
    const f = makeFetch();
    render(<AdminSocialLinksPanel lang="EN" authenticatedFetch={f} showToast={vi.fn()} />);
    await waitFor(() => screen.getByLabelText('URL #1'));
    fireEvent.change(screen.getByLabelText('URL #1'), { target: { value: 'javascript:alert(1)' } });
    fireEvent.change(screen.getByLabelText('Label #2'), { target: { value: '   ' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));
    expect(screen.getByText('Only https:// is accepted.')).toBeInTheDocument();
    expect(screen.getByText(/Label must be 1–24/)).toBeInTheDocument();
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(putCalls(f)).toHaveLength(0);

    fireEvent.change(screen.getByLabelText('URL #1'), { target: { value: 'https://evilx.com/a' } });
    fireEvent.change(screen.getByLabelText('Label #2'), { target: { value: 'GH' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));
    expect(screen.getByText('This domain is not allowed.')).toBeInTheDocument();

    fireEvent.change(screen.getByLabelText('URL #1'), { target: { value: 'https://github.com/araf' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));
    expect(screen.getByText('The same URL cannot be added twice.')).toBeInTheDocument();
    expect(putCalls(f)).toHaveLength(0);
  });

  it('save shows a change summary, then PUTs links + expectedVersion + reason only after confirm', async () => {
    const f = makeFetch();
    const showToast = vi.fn();
    render(<AdminSocialLinksPanel lang="EN" authenticatedFetch={f} showToast={showToast} />);
    await waitFor(() => screen.getByLabelText('URL #1'));
    fireEvent.click(screen.getByRole('button', { name: 'Add link' }));
    fireEvent.change(screen.getByLabelText('Label #3'), { target: { value: 'TG' } });
    fireEvent.change(screen.getByLabelText('URL #3'), { target: { value: 'https://t.me/araf' } });
    fireEvent.click(screen.getByRole('button', { name: 'Move up #3' }));
    fireEvent.click(screen.getByRole('button', { name: 'Delete #1' }));
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));
    const dialog = screen.getByRole('dialog');
    expect(within(dialog).getByText(/Added: TG → https:\/\/t.me\/araf/)).toBeInTheDocument();
    expect(within(dialog).getByText(/Removed: X → https:\/\/x.com\/araf/)).toBeInTheDocument();
    expect(putCalls(f)).toHaveLength(0);
    fireEvent.change(within(dialog).getByLabelText(/Reason/), { target: { value: 'rebrand' } });
    fireEvent.click(within(dialog).getByRole('button', { name: 'Confirm' }));
    await waitFor(() => expect(showToast).toHaveBeenCalledWith('Social links updated.', 'success'));
    const [url, opts] = putCalls(f)[0];
    expect(String(url)).toContain('admin/social-links');
    const body = JSON.parse(opts.body);
    expect(body.expectedVersion).toBe(3);
    expect(body.reason).toBe('rebrand');
    expect(body.links).toEqual([
      { label: 'TG', url: 'https://t.me/araf', enabled: true },
      { id: 'b2', label: 'GitHub', url: 'https://github.com/araf', enabled: true },
    ]);
  });

  it('toggling enabled counts as a change', async () => {
    render(<AdminSocialLinksPanel lang="EN" authenticatedFetch={makeFetch()} showToast={vi.fn()} />);
    await waitFor(() => screen.getByLabelText('URL #1'));
    expect(screen.getByRole('button', { name: 'Save' })).toBeDisabled();
    fireEvent.click(screen.getAllByLabelText('Enabled')[0]);
    expect(screen.getByRole('button', { name: 'Save' })).not.toBeDisabled();
  });

  it('409 shows the "someone else changed it, refresh" message and reloads on refresh', async () => {
    const f = makeFetch({ putStatus: 409, putBody: { code: 'SOCIAL_LINKS_CONFLICT' } });
    const showToast = vi.fn();
    render(<AdminSocialLinksPanel lang="EN" authenticatedFetch={f} showToast={showToast} />);
    await waitFor(() => screen.getByLabelText('URL #1'));
    fireEvent.click(screen.getAllByLabelText('Enabled')[0]);
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));
    fireEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Confirm' }));
    await waitFor(() => expect(screen.getByText(/changed by someone else/)).toBeInTheDocument());
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(showToast).not.toHaveBeenCalledWith(expect.anything(), 'success');
    const before = f.mock.calls.length;
    fireEvent.click(screen.getByRole('button', { name: 'Refresh' }));
    await waitFor(() => expect(f.mock.calls.length).toBeGreaterThan(before));
    await waitFor(() => expect(screen.queryByText(/changed by someone else/)).toBeNull());
  });

  it('403 shows access denied', async () => {
    const f = vi.fn(async () => json(403, {}));
    render(<AdminSocialLinksPanel lang="EN" authenticatedFetch={f} showToast={vi.fn()} />);
    await waitFor(() => expect(screen.getByText('Admin access denied.')).toBeInTheDocument());
  });
});
