import React from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen, waitFor, fireEvent } from '@testing-library/react';
import AdminSocialLinksPanel from '../../frontend/src/app/contexts/admin/AdminSocialLinksPanel';
import AdminRuntimeSettingsPanel from '../../frontend/src/app/contexts/admin/AdminRuntimeSettingsPanel';

const json = (status, body) => ({ ok: status < 400, status, json: async () => body });
const LINKS = [{ id: 'a1', label: 'X', url: 'https://x.com/araf', order: 0, enabled: true }];
const SETTINGS = [
  { key: 'LIVE_POLL_INTERVAL_MS', unit: 'ms', min: 5000, max: 300000, default: 15000, envValue: null, adminValue: null, value: 15000, source: 'default', description: { TR: 'tr', EN: 'Live polling interval' }, changedAt: null, changedBy: null },
];

const socialFetch = () => vi.fn(async (url) => {
  if (String(url).includes('social-links/audit')) return json(200, { items: [], total: 0, page: 1, limit: 10 });
  return json(200, { links: LINKS, version: 3 });
});
const runtimeFetch = () => vi.fn(async (url) => {
  if (String(url).includes('runtime-settings/audit')) return json(200, { items: [], total: 0, page: 1, limit: 10 });
  return json(200, { settings: SETTINGS, version: 4, degraded: false });
});
const loadCalls = (f, part) => f.mock.calls.filter(([u]) => String(u).includes(part) && !String(u).includes('audit')).length;

afterEach(() => cleanup());

describe('P10 admin taslağı dil değişince korunur (F4-03)', () => {
  it('Sosyal linkler: dil değişince yeniden yükleme olmaz, kirli taslak durur', async () => {
    const f = socialFetch();
    const { rerender } = render(<AdminSocialLinksPanel lang="EN" authenticatedFetch={f} showToast={vi.fn()} />);
    await waitFor(() => expect(screen.getByLabelText('URL #1')).toHaveValue('https://x.com/araf'));
    fireEvent.change(screen.getByLabelText('URL #1'), { target: { value: 'https://github.com/yeni' } });
    rerender(<AdminSocialLinksPanel lang="TR" authenticatedFetch={f} showToast={vi.fn()} />);
    await new Promise((r) => setTimeout(r, 20));
    expect(loadCalls(f, 'admin/social-links')).toBe(1);
    expect(screen.getByLabelText('URL #1')).toHaveValue('https://github.com/yeni');
  });

  it('Sosyal linkler: authenticatedFetch kimliği değişse de kirli taslak ezilmez', async () => {
    const f1 = socialFetch();
    const { rerender } = render(<AdminSocialLinksPanel lang="EN" authenticatedFetch={f1} showToast={vi.fn()} />);
    await waitFor(() => screen.getByLabelText('URL #1'));
    fireEvent.change(screen.getByLabelText('URL #1'), { target: { value: 'https://github.com/yeni' } });
    const f2 = socialFetch();
    rerender(<AdminSocialLinksPanel lang="EN" authenticatedFetch={f2} showToast={vi.fn()} />);
    await waitFor(() => expect(loadCalls(f2, 'admin/social-links')).toBe(1));
    await new Promise((r) => setTimeout(r, 20));
    expect(screen.getByLabelText('URL #1')).toHaveValue('https://github.com/yeni');
  });

  it('Çalışma ayarları: dil değişince yeniden yükleme olmaz, kirli taslak durur', async () => {
    const f = runtimeFetch();
    const { rerender } = render(<AdminRuntimeSettingsPanel lang="EN" authenticatedFetch={f} showToast={vi.fn()} />);
    await waitFor(() => screen.getAllByLabelText(/New value|Yeni değer/));
    fireEvent.change(screen.getAllByLabelText(/New value|Yeni değer/)[0], { target: { value: '9000' } });
    rerender(<AdminRuntimeSettingsPanel lang="TR" authenticatedFetch={f} showToast={vi.fn()} />);
    await new Promise((r) => setTimeout(r, 20));
    expect(loadCalls(f, 'admin/runtime-settings')).toBe(1);
    expect(screen.getAllByLabelText(/New value|Yeni değer/)[0]).toHaveValue(9000);
  });

  it('Çalışma ayarları: authenticatedFetch kimliği değişse de kirli taslak ezilmez', async () => {
    const f1 = runtimeFetch();
    const { rerender } = render(<AdminRuntimeSettingsPanel lang="EN" authenticatedFetch={f1} showToast={vi.fn()} />);
    await waitFor(() => screen.getAllByLabelText(/New value/));
    fireEvent.change(screen.getAllByLabelText(/New value/)[0], { target: { value: '9000' } });
    const f2 = runtimeFetch();
    rerender(<AdminRuntimeSettingsPanel lang="EN" authenticatedFetch={f2} showToast={vi.fn()} />);
    await waitFor(() => expect(loadCalls(f2, 'admin/runtime-settings')).toBe(1));
    await new Promise((r) => setTimeout(r, 20));
    expect(screen.getAllByLabelText(/New value/)[0]).toHaveValue(9000);
  });
});
