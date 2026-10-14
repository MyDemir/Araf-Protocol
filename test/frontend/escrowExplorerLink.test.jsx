import React from 'react';
import { afterEach, describe, it, expect, vi } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import { getAddress } from 'viem';
import { getEscrowExplorerUrl } from '../../frontend/src/app/chainPolicy';
import { buildAppViews } from '../../frontend/src/app/AppViews';

const ADDR = '0x1234567890abcdef1234567890abcdef12345678';
const CS = getAddress(ADDR);
const ZERO = '0x0000000000000000000000000000000000000000';

afterEach(() => { cleanup(); vi.unstubAllEnvs(); });

describe('getEscrowExplorerUrl', () => {
  it('sepolia', () => {
    expect(getEscrowExplorerUrl({ address: ADDR, targetChain: 'base-sepolia' })).toBe(`https://sepolia.basescan.org/address/${CS}`);
  });
  it('mainnet', () => {
    expect(getEscrowExplorerUrl({ address: ADDR, targetChain: 'base' })).toBe(`https://basescan.org/address/${CS}`);
  });
  it('hardhat/unknown chain -> null', () => {
    expect(getEscrowExplorerUrl({ address: ADDR, targetChain: 'hardhat' })).toBeNull();
    expect(getEscrowExplorerUrl({ address: ADDR, targetChain: undefined })).toBeNull();
    expect(getEscrowExplorerUrl({ address: ADDR, targetChain: 'toString' })).toBeNull();
  });
  it('invalid/zero/empty address -> null', () => {
    for (const a of ['', undefined, null, '0xabc', 'nope', ZERO]) {
      expect(getEscrowExplorerUrl({ address: a, targetChain: 'base' })).toBeNull();
    }
  });
});

const renderFooter = () => {
  const views = buildAppViews({ lang: 'EN', setShowFeedbackModal: vi.fn() });
  return render(views.renderFooter());
};

describe('footer contract link', () => {
  it('shows link with safe attrs for valid address', () => {
    vi.stubEnv('VITE_ESCROW_ADDRESS', ADDR);
    vi.stubEnv('VITE_TARGET_CHAIN', 'base-sepolia');
    renderFooter();
    const a = screen.getByTestId('footer-contract-link');
    expect(a.getAttribute('href')).toBe(`https://sepolia.basescan.org/address/${CS}`);
    expect(a.getAttribute('target')).toBe('_blank');
    expect(a.getAttribute('rel')).toBe('noreferrer noopener');
    expect(a.getAttribute('title')).toBe('0x1234…5678');
    expect(a.textContent).toBe('Contract');
  });
  it('hidden without address', () => {
    vi.stubEnv('VITE_ESCROW_ADDRESS', '');
    renderFooter();
    expect(screen.queryByTestId('footer-contract-link')).toBeNull();
  });
});
