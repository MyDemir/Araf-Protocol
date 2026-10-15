import React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, render, screen } from '@testing-library/react';
import { SystemStatusBar } from '../../frontend/src/app/shell/SystemStatusBar';
import { __resetStatusDismissalsForTest } from '../../frontend/src/app/shell/statusDismissal';
import { __resetInfraForTest, getInfraHealth, markEscrowMismatch } from '../../frontend/src/app/infraHealth';
import { fetchWithTimeout } from '../../frontend/src/app/fetchWithTimeout';
import { resolveNewTxGate, TX_GATE_REASONS } from '../../frontend/src/app/txGate';

beforeEach(() => { vi.useFakeTimers(); vi.spyOn(Math, 'random').mockReturnValue(0.5); __resetInfraForTest(); window.sessionStorage.clear(); __resetStatusDismissalsForTest(); });
afterEach(() => { cleanup(); vi.useRealTimers(); vi.restoreAllMocks(); vi.unstubAllGlobals(); __resetInfraForTest(); });

const mismatch503 = (reason) => new Response(JSON.stringify({ code: 'ESCROW_MISMATCH', reason }), { status: 503, headers: { 'Retry-After': '30' } });

describe('503 ESCROW_MISMATCH detection', () => {
  it('sets escrowMismatch + reason, not backend/degraded', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(mismatch503('chain_mismatch')));
    await fetchWithTimeout('/api/x', { infra: 'backend' });
    expect(getInfraHealth()).toMatchObject({ escrowMismatch: true, escrowMismatchReason: 'chain_mismatch', backend: false, degraded: false });
  });
  it.each(['registry_missing', 'rotating', 'escrow_mismatch', 'chain_mismatch', 'registry_unreadable'])('keeps allowed reason %s', async (reason) => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(mismatch503(reason)));
    await fetchWithTimeout('/api/x', { infra: 'backend' });
    expect(getInfraHealth().escrowMismatchReason).toBe(reason);
  });
  it('invalid or missing reason becomes unknown', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(mismatch503('<script>')));
    await fetchWithTimeout('/api/x', { infra: 'backend' });
    expect(getInfraHealth().escrowMismatchReason).toBe('unknown');
  });
  it('SERVICE_DEGRADED and generic 5xx behave as before', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('{"code":"SERVICE_DEGRADED"}', { status: 503 })));
    await fetchWithTimeout('/api/x', { infra: 'backend' });
    expect(getInfraHealth()).toMatchObject({ degraded: true, escrowMismatch: false, backend: false });
    __resetInfraForTest();
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('{"code":"OTHER"}', { status: 503 })));
    await fetchWithTimeout('/api/x', { infra: 'backend' });
    expect(getInfraHealth()).toMatchObject({ backend: true, escrowMismatch: false });
    __resetInfraForTest();
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('{"code":"ESCROW_MISMATCH"}', { status: 500 })));
    await fetchWithTimeout('/api/x', { infra: 'backend' });
    expect(getInfraHealth()).toMatchObject({ backend: true, escrowMismatch: false });
  });
  it('flag clears when backend answers 200 (probe)', async () => {
    const f = vi.fn().mockResolvedValueOnce(mismatch503('rotating')).mockResolvedValue(new Response('{}', { status: 200 }));
    vi.stubGlobal('fetch', f);
    await fetchWithTimeout('/api/x', { infra: 'backend' });
    expect(getInfraHealth().escrowMismatch).toBe(true);
    await act(async () => { await vi.advanceTimersByTimeAsync(7000); });
    expect(getInfraHealth()).toMatchObject({ escrowMismatch: false, escrowMismatchReason: null });
  });
  it('probe keeps flag while still 503', async () => {
    vi.stubGlobal('fetch', vi.fn().mockImplementation(async () => mismatch503('rotating')));
    await fetchWithTimeout('/api/x', { infra: 'backend' });
    await act(async () => { await vi.advanceTimersByTimeAsync(7000); });
    expect(getInfraHealth().escrowMismatch).toBe(true);
  });
});

describe('banner', () => {
  it('is non-dismissable, shows TR copy, hides backend-unreachable', () => {
    render(<SystemStatusBar isTestnet={false} escrowMismatch escrowMismatchReason="escrow_mismatch" backendUnreachable lang="TR" />);
    expect(screen.getByText('Sunucu bu kontrata hizmet vermiyor')).toBeInTheDocument();
    expect(screen.getByText('Yeni işlem açılamaz. Açık işlemleriniz kontratta güvende; çıkış işlemleri kontrata doğrudan gider.')).toBeInTheDocument();
    expect(screen.getByTestId('status-critical-mark')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Uyarıyı kapat/ })).toBeNull();
    expect(screen.queryByText('Sunucuya ulaşılamıyor')).toBeNull();
  });
  it('rotating has its own title; EN copy', () => {
    render(<SystemStatusBar isTestnet={false} escrowMismatch escrowMismatchReason="rotating" lang="TR" />);
    expect(screen.getByText('Sistem bakımda: kontrat geçişi')).toBeInTheDocument();
    expect(screen.queryByText('Sunucu bu kontrata hizmet vermiyor')).toBeNull();
    cleanup();
    render(<SystemStatusBar isTestnet={false} escrowMismatch escrowMismatchReason="unknown" lang="EN" />);
    expect(screen.getByText('The server is not serving this contract')).toBeInTheDocument();
    expect(screen.getByText(/exit actions go directly to the contract/)).toBeInTheDocument();
  });
  it('reads the infra store without props', () => {
    render(<SystemStatusBar isTestnet={false} lang="TR" />);
    act(() => { markEscrowMismatch('rotating'); });
    expect(screen.getByText('Sistem bakımda: kontrat geçişi')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Uyarıyı kapat/ })).toBeNull();
  });
});

describe('txGate', () => {
  it('closes new-position gate; unrelated flags unchanged', () => {
    expect(resolveNewTxGate({ rpcChecked: true, escrowMismatch: true })).toMatchObject({ blocked: true, reason: TX_GATE_REASONS.ESCROW_MISMATCH });
    expect(resolveNewTxGate({ rpcChecked: true, escrowMismatch: false })).toMatchObject({ blocked: false });
  });
});
