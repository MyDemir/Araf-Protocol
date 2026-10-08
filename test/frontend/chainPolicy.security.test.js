import { describe, it, expect, vi } from 'vitest';
import {
  getSupportedChainIds,
  isSupportedChainId,
  isMintTokenEnabled,
  checkDeploymentAlignment,
  resolveTargetChain,
  getSupportedChainsMap,
} from '../../frontend/src/app/chainPolicy';

describe('frontend chain policy security', () => {
  it('security_prod_mode_allows_only_base_mainnet_chain_id_8453', () => {
    expect(getSupportedChainIds(true)).toEqual([8453]);
    expect(isSupportedChainId(8453, true)).toBe(true);
    expect(isSupportedChainId(84532, true)).toBe(false);
    expect(isSupportedChainId(31337, true)).toBe(false);
  });

  it('security_dev_mode_allows_hardhat_and_base_sepolia', () => {
    expect(isSupportedChainId(31337, false)).toBe(true);
    expect(isSupportedChainId(84532, false)).toBe(true);
    expect(isSupportedChainId(8453, false)).toBe(true);
  });

  it('security_mint_feature_disabled_in_production_policy', () => {
    expect(isMintTokenEnabled(true)).toBe(false);
    expect(isMintTokenEnabled(false)).toBe(true);
  });
});

describe('deploy alignment (frontend vs backend /orders/config)', () => {
  const escrow = '0x1111111111111111111111111111111111111111';
  it('passes when escrow addresses match (case-insensitive) and the chain is supported', () => {
    expect(checkDeploymentAlignment({ frontendEscrowAddress: escrow.toUpperCase().replace('0X', '0x'), backendDeployment: { escrowAddress: escrow, chainId: 8453 }, isProd: true })).toEqual([]);
  });
  it('flags an escrow address drift', () => {
    const issues = checkDeploymentAlignment({ frontendEscrowAddress: escrow, backendDeployment: { escrowAddress: '0x2222222222222222222222222222222222222222', chainId: 8453 }, isProd: true });
    expect(issues).toHaveLength(1);
    expect(issues[0].code).toBe('ESCROW_MISMATCH');
    expect(issues[0].message).toMatch(/Escrow adresi uyuşmuyor/);
  });
  it('flags a backend chain outside the frontend policy (prod is Base mainnet only)', () => {
    expect(checkDeploymentAlignment({ frontendEscrowAddress: escrow, backendDeployment: { escrowAddress: escrow, chainId: 84532 }, isProd: true })[0].message).toMatch(/84532/);
    expect(checkDeploymentAlignment({ frontendEscrowAddress: escrow, backendDeployment: { escrowAddress: escrow, chainId: 84532 }, isProd: true })[0].code).toBe('BACKEND_CHAIN_UNSUPPORTED');
    expect(checkDeploymentAlignment({ frontendEscrowAddress: escrow, backendDeployment: { escrowAddress: escrow, chainId: 84532 }, isProd: false })).toEqual([]);
  });
  it('stays silent until the backend reports its deployment', () => {
    expect(checkDeploymentAlignment({ frontendEscrowAddress: escrow, backendDeployment: null })).toEqual([]);
  });
});

describe('VITE_TARGET_CHAIN policy', () => {
  const escrow = '0x1111111111111111111111111111111111111111';
  const dep = (chainId) => ({ escrowAddress: escrow, chainId });
  it('prod + base (and unset) keeps mainnet only', () => {
    expect(getSupportedChainIds(true, 'base')).toEqual([8453]);
    expect(getSupportedChainIds(true, undefined)).toEqual([8453]);
    expect(getSupportedChainIds(true, '')).toEqual([8453]);
  });
  it('prod + base-sepolia exposes Sepolia only', () => {
    expect(getSupportedChainIds(true, 'base-sepolia')).toEqual([84532]);
    expect(isSupportedChainId(8453, true, 'base-sepolia')).toBe(false);
    expect(isSupportedChainId(84532, true, 'base-sepolia')).toBe(true);
    expect(getSupportedChainsMap(true, 'base-sepolia')).toEqual({ 84532: 'Base Sepolia' });
  });
  it('prod + unknown warns and falls back to base', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    expect(getSupportedChainIds(true, 'sepolia-typo')).toEqual([8453]);
    expect(resolveTargetChain('sepolia-typo')).toBe('base');
    expect(warn).toHaveBeenCalledTimes(1);
    expect(warn.mock.calls[0][0]).toMatch(/VITE_TARGET_CHAIN/);
    warn.mockRestore();
  });
  it('dev ignores target chain and keeps the full list', () => {
    expect(getSupportedChainIds(false, 'base')).toEqual([31337, 84532, 8453]);
    expect(getSupportedChainIds(false, 'base-sepolia')).toEqual([31337, 84532, 8453]);
  });
  it('mint stays disabled in prod regardless of target', () => {
    expect(isMintTokenEnabled(true)).toBe(false);
  });
  it('alignment: testnet build accepts 84532, flags 8453', () => {
    expect(checkDeploymentAlignment({ frontendEscrowAddress: escrow, backendDeployment: dep(84532), isProd: true, targetChain: 'base-sepolia' })).toEqual([]);
    expect(checkDeploymentAlignment({ frontendEscrowAddress: escrow, backendDeployment: dep(8453), isProd: true, targetChain: 'base-sepolia' })[0].message).toMatch(/8453/);
  });
  it('alignment: mainnet build flags 84532, accepts 8453', () => {
    expect(checkDeploymentAlignment({ frontendEscrowAddress: escrow, backendDeployment: dep(84532), isProd: true, targetChain: 'base' })[0].message).toMatch(/84532/);
    expect(checkDeploymentAlignment({ frontendEscrowAddress: escrow, backendDeployment: dep(8453), isProd: true, targetChain: 'base' })).toEqual([]);
  });
});
