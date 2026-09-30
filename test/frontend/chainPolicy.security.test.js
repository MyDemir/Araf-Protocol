import { describe, it, expect } from 'vitest';
import {
  getSupportedChainIds,
  isSupportedChainId,
  isMintTokenEnabled,
  checkDeploymentAlignment,
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
    expect(issues[0]).toMatch(/Escrow adresi uyuşmuyor/);
  });
  it('flags a backend chain outside the frontend policy (prod is Base mainnet only)', () => {
    expect(checkDeploymentAlignment({ frontendEscrowAddress: escrow, backendDeployment: { escrowAddress: escrow, chainId: 84532 }, isProd: true })[0]).toMatch(/84532/);
    expect(checkDeploymentAlignment({ frontendEscrowAddress: escrow, backendDeployment: { escrowAddress: escrow, chainId: 84532 }, isProd: false })).toEqual([]);
  });
  it('stays silent until the backend reports its deployment', () => {
    expect(checkDeploymentAlignment({ frontendEscrowAddress: escrow, backendDeployment: null })).toEqual([]);
  });
});
