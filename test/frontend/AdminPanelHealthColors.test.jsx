import React from 'react';
import { describe, it, expect, vi, afterEach } from 'vitest';
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import AdminPanel from '../../frontend/src/AdminPanel';

function renderWithChecks(checks) {
  const authenticatedFetch = vi.fn(async () => ({
    status: 200,
    ok: true,
    json: async () => ({ readiness: { checks }, stats: {}, tradeCounts: {}, dlq: {} }),
  }));
  render(
    <AdminPanel lang="EN" authenticatedFetch={authenticatedFetch} isAuthenticated authChecked showToast={vi.fn()} initialTab="sync" />
  );
}

const valueEl = (key) => screen.getAllByText(key).map((n) => n.nextSibling).find((n) => n && /font-semibold/.test(n.className));

describe('AdminPanel Health Checklist colors', () => {
  afterEach(() => cleanup());

  it('respects inverted and advisory checks without changing displayed text', async () => {
    renderWithChecks({ mongo: false, redis: true, configStale: false, wsConfigured: false });
    await waitFor(() => expect(screen.getAllByText('configStale').length).toBeGreaterThan(0));
    expect(valueEl('configStale')).toHaveTextContent('false');
    expect(valueEl('configStale')).toHaveClass('text-success');
    expect(valueEl('mongo')).toHaveTextContent('false');
    expect(valueEl('mongo')).toHaveClass('text-danger');
    expect(valueEl('redis')).toHaveClass('text-success');
    expect(valueEl('wsConfigured')).toHaveTextContent('false');
    expect(valueEl('wsConfigured')).toHaveClass('text-warning');
    expect(valueEl('wsConfigured')).not.toHaveClass('text-danger');
  });

  it('wsConfigured=true is green', async () => {
    renderWithChecks({ wsConfigured: true });
    await waitFor(() => expect(screen.getAllByText('wsConfigured').length).toBeGreaterThan(0));
    expect(valueEl('wsConfigured')).toHaveTextContent('true');
    expect(valueEl('wsConfigured')).toHaveClass('text-success');
  });

  it('configStale=true is red', async () => {
    renderWithChecks({ configStale: true });
    await waitFor(() => expect(screen.getAllByText('configStale').length).toBeGreaterThan(0));
    expect(valueEl('configStale')).toHaveTextContent('true');
    expect(valueEl('configStale')).toHaveClass('text-danger');
  });
});
