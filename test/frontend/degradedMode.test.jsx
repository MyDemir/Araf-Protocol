import React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, render, screen } from '@testing-library/react';
import { SystemStatusBar } from '../../frontend/src/app/shell/SystemStatusBar';
import { isCriticalStatus, __resetStatusDismissalsForTest } from '../../frontend/src/app/shell/statusDismissal';
import { ENV_ERROR_CODES, CRITICAL_ENV_ERROR_CODES } from '../../frontend/src/app/envErrorCodes';
import { __resetInfraForTest, getInfraHealth, markInfraFailure, registerInfraProbe } from '../../frontend/src/app/infraHealth';
import { fetchWithTimeout } from '../../frontend/src/app/fetchWithTimeout';
import { resolveNewTxGate } from '../../frontend/src/app/txGate';

beforeEach(() => { vi.useFakeTimers(); vi.spyOn(Math, 'random').mockReturnValue(0.5); __resetInfraForTest(); window.sessionStorage.clear(); __resetStatusDismissalsForTest(); });
afterEach(() => { cleanup(); vi.useRealTimers(); vi.restoreAllMocks(); vi.unstubAllGlobals(); __resetInfraForTest(); });

const degraded503 = () => new Response(JSON.stringify({ code: 'SERVICE_DEGRADED', degradedReasons: ['rpc_unavailable_at_boot'] }), { status: 503 });

describe('SERVICE_DEGRADED detection', () => {
  it('503 SERVICE_DEGRADED sets degraded, NOT backend unreachable', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(degraded503()));
    await fetchWithTimeout('/api/x', { infra: 'backend' });
    expect(getInfraHealth()).toMatchObject({ degraded: true, backend: false });
  });
  it('plain 503 or 500 still means backend unreachable', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('{"error":"x"}', { status: 503 })));
    await fetchWithTimeout('/api/x', { infra: 'backend' });
    expect(getInfraHealth()).toMatchObject({ degraded: false, backend: true });
  });
  it('X-Araf-Degraded header on an allowed 200 marks degraded', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('{}', { status: 200, headers: { 'X-Araf-Degraded': 'true' } })));
    await fetchWithTimeout('/api/orders/config', { infra: 'backend' });
    expect(getInfraHealth().degraded).toBe(true);
  });
});

describe('degraded banner', () => {
  it('is calm, dismissible, not critical', () => {
    expect(CRITICAL_ENV_ERROR_CODES).not.toContain(ENV_ERROR_CODES.SERVICE_DEGRADED);
    expect(isCriticalStatus({ key: 'service_degraded' })).toBe(false);
    render(<SystemStatusBar isTestnet={false} serviceDegraded lang="TR" />);
    expect(screen.getByText('Sistem kısıtlı modda')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Uyarıyı kapat: Sistem kısıtlı modda/ })).toBeInTheDocument();
    expect(screen.queryByText('Sunucuya ulaşılamıyor')).toBeNull();
  });
  it('backend unreachable keeps its own banner and suppresses the degraded one', () => {
    render(<SystemStatusBar isTestnet={false} backendUnreachable serviceDegraded />);
    expect(screen.getByText('Server unreachable')).toBeInTheDocument();
    expect(screen.queryByText('System in restricted mode')).toBeNull();
  });
  it('probe success removes the banner', async () => {
    registerInfraProbe('degraded', async () => true);
    render(<SystemStatusBar isTestnet={false} />);
    act(() => { markInfraFailure('degraded'); });
    expect(screen.getByText('System in restricted mode')).toBeInTheDocument();
    await act(async () => { await vi.advanceTimersByTimeAsync(7000); });
    expect(screen.queryByText('System in restricted mode')).toBeNull();
    expect(getInfraHealth().epoch).toBe(1);
  });
});

describe('configStale', () => {
  it('shows info banner and closes only the NEW-position gate', () => {
    render(<SystemStatusBar isTestnet={false} configStale />);
    expect(screen.getByText('Protocol settings are shown from last known values and may be out of date.')).toBeInTheDocument();
    expect(resolveNewTxGate({ rpcChecked: true, configStale: true })).toMatchObject({ blocked: true, reason: 'config_stale' });
    expect(resolveNewTxGate({ rpcChecked: true, configStale: false })).toMatchObject({ blocked: false });
  });
  it('probe clears stale flag', async () => {
    registerInfraProbe('configStale', async () => true);
    markInfraFailure('configStale');
    expect(getInfraHealth().configStale).toBe(true);
    await vi.advanceTimersByTimeAsync(7000);
    expect(getInfraHealth().configStale).toBe(false);
  });
});
