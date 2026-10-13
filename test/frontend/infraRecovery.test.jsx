import React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, render, screen } from '@testing-library/react';
import { SystemStatusBar } from '../../frontend/src/app/shell/SystemStatusBar';
import { isCriticalStatus, __resetStatusDismissalsForTest } from '../../frontend/src/app/shell/statusDismissal';
import { ENV_ERROR_CODES, CRITICAL_ENV_ERROR_CODES, envError } from '../../frontend/src/app/envErrorCodes';
import {
  __resetInfraForTest, getInfraHealth, markInfraFailure, nextBackoffMs, registerInfraProbe,
} from '../../frontend/src/app/infraHealth';
import { importWithRetry } from '../../frontend/src/app/lazyWithRetry';

beforeEach(() => { vi.useFakeTimers(); __resetInfraForTest(); window.sessionStorage.clear(); __resetStatusDismissalsForTest(); });
afterEach(() => { cleanup(); vi.useRealTimers(); __resetInfraForTest(); });

describe('infra recovery', () => {
  it('backoff grows exponentially, is capped and jittered within 20 percent', () => {
    const mid = () => 0.5;
    expect(nextBackoffMs(0, mid)).toBe(5000);
    expect(nextBackoffMs(1, mid)).toBe(10000);
    expect(nextBackoffMs(2, mid)).toBe(20000);
    expect(nextBackoffMs(10, mid)).toBe(60000);
    expect(nextBackoffMs(0, () => 0)).toBe(4000);
    expect(nextBackoffMs(0, () => 1)).toBe(6000);
  });

  it('probes with backoff (one loop), then clears the flag and bumps epoch without reload', async () => {
    let calls = 0;
    registerInfraProbe('backend', async () => { calls += 1; return calls >= 3; });
    markInfraFailure('backend');
    markInfraFailure('backend');
    expect(getInfraHealth()).toMatchObject({ backend: true, epoch: 0 });
    await vi.advanceTimersByTimeAsync(7000);
    expect(calls).toBe(1);
    await vi.advanceTimersByTimeAsync(13000);
    expect(calls).toBe(2);
    await vi.advanceTimersByTimeAsync(26000);
    expect(calls).toBe(3);
    expect(getInfraHealth()).toMatchObject({ backend: false, epoch: 1 });
    await vi.advanceTimersByTimeAsync(120000);
    expect(calls).toBe(3);
  });

  it('a throwing probe is not an unhandled rejection and keeps retrying', async () => {
    let calls = 0;
    registerInfraProbe('rpc', async () => { calls += 1; throw new Error('429'); });
    markInfraFailure('rpc');
    await vi.advanceTimersByTimeAsync(40000);
    expect(calls).toBeGreaterThanOrEqual(2);
    expect(getInfraHealth().rpc).toBe(true);
  });

  it('banner appears while unreachable and disappears on recovery', async () => {
    registerInfraProbe('backend', async () => true);
    render(<SystemStatusBar isTestnet={false} />);
    expect(screen.queryByText('Server unreachable')).toBeNull();
    act(() => { markInfraFailure('backend'); });
    expect(screen.getByText('Server unreachable')).toBeInTheDocument();
    await act(async () => { await vi.advanceTimersByTimeAsync(7000); });
    expect(screen.queryByText('Server unreachable')).toBeNull();
  });

  it('infra banners are dismissible, safety banners stay non-dismissible', () => {
    expect(CRITICAL_ENV_ERROR_CODES).not.toContain(ENV_ERROR_CODES.BACKEND_UNREACHABLE);
    expect(CRITICAL_ENV_ERROR_CODES).not.toContain(ENV_ERROR_CODES.RPC_UNREACHABLE);
    render(<SystemStatusBar isTestnet={false} backendUnreachable rpcUnreachable envErrors={[envError(ENV_ERROR_CODES.ESCROW_MISMATCH, 'x')]} />);
    expect(screen.getAllByRole('button', { name: /Dismiss warning: (Server|Blockchain)/ })).toHaveLength(2);
    expect(screen.queryByRole('button', { name: /Dismiss warning: System Configuration/ })).toBeNull();
    expect(isCriticalStatus({ key: 'env_error', details: [envError(ENV_ERROR_CODES.ESCROW_MISMATCH, 'x')] })).toBe(true);
    expect(isCriticalStatus({ key: 'backend_unreachable' })).toBe(false);
  });
});

describe('flag hysteresis', () => {
  it('ordinary successful calls never clear the flag; only the probe does, and a quick re-failure keeps growing the backoff', async () => {
    let calls = 0;
    registerInfraProbe('backend', async () => { calls += 1; return true; });
    markInfraFailure('backend');
    await vi.advanceTimersByTimeAsync(1000);
    expect(getInfraHealth().backend).toBe(true);
    await vi.advanceTimersByTimeAsync(6000); // probe #1 (5s +-20%) succeeds
    expect(getInfraHealth()).toMatchObject({ backend: false, epoch: 1 });
    markInfraFailure('backend'); // flapping endpoint: re-fails right after recovery
    await vi.advanceTimersByTimeAsync(6000);
    expect(calls).toBe(1); // second probe waits >= 8s (10s +-20%), not 5s again
    await vi.advanceTimersByTimeAsync(5000);
    expect(calls).toBe(2);
  });
});

describe('lazy import retry', () => {
  it('retries a transient failure then succeeds', async () => {
    const importer = vi.fn().mockRejectedValueOnce(new Error('net')).mockResolvedValue({ default: 1 });
    const p = importWithRetry(importer, [10, 10]);
    await vi.advanceTimersByTimeAsync(20);
    await expect(p).resolves.toEqual({ default: 1 });
    expect(importer).toHaveBeenCalledTimes(2);
  });
  it('gives up after the last retry', async () => {
    const importer = vi.fn().mockRejectedValue(new Error('gone'));
    const p = importWithRetry(importer, [10, 10]);
    const assertion = expect(p).rejects.toThrow('gone');
    await vi.advanceTimersByTimeAsync(30);
    await assertion;
    expect(importer).toHaveBeenCalledTimes(3);
  });
});
