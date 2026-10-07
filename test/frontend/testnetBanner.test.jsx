import React from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import { isTestnetBuild } from '../../frontend/src/app/chainPolicy';
import { SystemStatusBar } from '../../frontend/src/app/shell/SystemStatusBar';
import { resolveRevenueVaultAddress, __resetEnvConfigWarningsForTest } from '../../frontend/src/app/envConfig';

afterEach(() => { cleanup(); vi.unstubAllEnvs(); vi.restoreAllMocks(); __resetEnvConfigWarningsForTest(); });

describe('isTestnetBuild', () => {
  it('is true only for production + base-sepolia', () => {
    expect(isTestnetBuild(true, 'base-sepolia')).toBe(true);
    expect(isTestnetBuild(true, 'base')).toBe(false);
    expect(isTestnetBuild(true, undefined)).toBe(false);
    expect(isTestnetBuild(false, 'base-sepolia')).toBe(false);
  });
});

describe('testnet banner', () => {
  it('shows in prod + base-sepolia (TR and EN)', () => {
    render(<SystemStatusBar isTestnet={isTestnetBuild(true, 'base-sepolia')} lang="TR" />);
    expect(screen.getByTestId('testnet-banner').textContent).toBe('Base Sepolia Testnet — test tokenları, gerçek para yok');
    cleanup();
    render(<SystemStatusBar isTestnet={isTestnetBuild(true, 'base-sepolia')} lang="EN" />);
    expect(screen.getByTestId('testnet-banner').textContent).toMatch(/no real money/);
  });
  it('is hidden in prod + base', () => {
    render(<SystemStatusBar isTestnet={isTestnetBuild(true, 'base')} />);
    expect(screen.queryByTestId('testnet-banner')).toBeNull();
  });
  it('default reads the real build env: visible with PROD + base-sepolia, hidden in dev', () => {
    vi.stubEnv('PROD', true);
    vi.stubEnv('VITE_TARGET_CHAIN', 'base-sepolia');
    render(<SystemStatusBar />);
    expect(screen.getByTestId('testnet-banner')).toBeTruthy();
    cleanup();
    vi.stubEnv('PROD', false);
    render(<SystemStatusBar />);
    expect(screen.queryByTestId('testnet-banner')).toBeNull();
  });
});

describe('resolveRevenueVaultAddress', () => {
  it('prefers VITE_REVENUE_VAULT_ADDRESS without warning', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    expect(resolveRevenueVaultAddress({ VITE_REVENUE_VAULT_ADDRESS: '0xa', VITE_REWARDS_VAULT_ADDRESS: '0xb' })).toBe('0xa');
    expect(warn).not.toHaveBeenCalled();
  });
  it('falls back to the legacy name with a single console.warn', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    expect(resolveRevenueVaultAddress({ VITE_REWARDS_VAULT_ADDRESS: '0xb' })).toBe('0xb');
    resolveRevenueVaultAddress({ VITE_REWARDS_VAULT_ADDRESS: '0xb' });
    expect(warn).toHaveBeenCalledTimes(1);
  });
});
