import React from 'react';
import { afterEach, describe, it, expect, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { buildAppViews } from '../../frontend/src/app/AppViews';
import { getExternalFaucetUrl } from '../../frontend/src/app/chainPolicy';

afterEach(() => { cleanup(); vi.unstubAllEnvs(); });

const CIRCLE_USDC = '0x036CbD53842c5426634e7929541eC2318f3dCF7e';
const TEST_USDT = '0x00000000000000000000000000000000000000a1';

const baseCtx = {
  lang: 'EN', setLang: vi.fn(), isConnected: true, isAuthenticated: true, hasPayoutProfile: true,
  isLoggingIn: false, isContractLoading: false, loadingText: '', isPaused: false,
  authChecked: true, currentView: 'market', setCurrentView: vi.fn(), toggleSidebar: vi.fn(),
  handleAuthAction: vi.fn(), formatAddress: (a) => a, address: '0xabc', chainId: 84532,
  sidebarOpen: false, setSidebarOpen: vi.fn(), setExpandedStatus: vi.fn(), expandedStatus: null,
  marketFilters: { side: 'ALL', token: 'ALL', amount: '', fiat: 'ALL', tier: 'ALL', sort: 'AUTO', hideOwn: false },
  setMarketFilter: vi.fn(), resetMarketFilters: vi.fn(), filteredOrders: [], orders: [], activeEscrows: [],
  loading: false, SUPPORTED_TOKEN_ADDRESSES: { USDT: TEST_USDT, USDC: CIRCLE_USDC },
  handleStartTrade: vi.fn(), handleMint: vi.fn(), isFaucetEnabled: true, isSupportedChainId: () => true,
  handleOpenMakerModal: vi.fn(), activeEscrowCounts: { LOCKED: 0, PAID: 0, CHALLENGED: 0 },
  setShowProfileModal: vi.fn(), setProfileTab: vi.fn(), setShowFeedbackModal: vi.fn(),
  protocolStats: {}, statsLoading: false, authenticatedFetch: vi.fn(), showToast: vi.fn(),
};

const renderFaucet = (over) => {
  vi.stubEnv('VITE_USDT_ADDRESS', TEST_USDT);
  vi.stubEnv('VITE_USDC_ADDRESS', CIRCLE_USDC);
  render(<div>{buildAppViews({ ...baseCtx, ...over }).renderMarket()}</div>);
  return screen.getByRole('group', { name: /Get test tokens|Test token al/ });
};

describe('faucet chip: real Circle USDC links out', () => {
  it('Base Sepolia + Circle USDC -> external link, no mint', () => {
    const handleMint = vi.fn();
    const group = renderFaucet({ handleMint });
    const link = within(group).getByRole('link', { name: /Get USDC \(Circle\)/ });
    expect(link).toHaveAttribute('href', 'https://faucet.circle.com/');
    expect(link).toHaveAttribute('target', '_blank');
    expect(link).toHaveAttribute('rel', 'noopener noreferrer');
    fireEvent.click(link);
    expect(handleMint).not.toHaveBeenCalled();
    expect(within(group).queryByRole('button', { name: 'Get test USDC' })).not.toBeInTheDocument();
  });

  it('TR label', () => {
    const group = renderFaucet({ lang: 'TR' });
    expect(within(group).getByRole('link', { name: /USDC al \(Circle\)/ })).toBeInTheDocument();
  });

  it('configured test USDT -> mint button, handleMint called', () => {
    const handleMint = vi.fn();
    const group = renderFaucet({ handleMint });
    expect(within(group).queryByRole('link', { name: /USDT/ })).not.toBeInTheDocument();
    fireEvent.click(within(group).getByRole('button', { name: 'Get test USDT' }));
    expect(handleMint).toHaveBeenCalledWith('USDT');
  });

  it('other chain -> no link (old behavior)', () => {
    const group = renderFaucet({ chainId: 31337 });
    expect(within(group).queryByRole('link')).not.toBeInTheDocument();
    expect(within(group).getByRole('button', { name: 'Get test USDC' })).toBeInTheDocument();
  });

  it('helper', () => {
    const env = { VITE_USDT_ADDRESS: TEST_USDT };
    expect(getExternalFaucetUrl(84532, CIRCLE_USDC, env)).toBe('https://faucet.circle.com/');
    expect(getExternalFaucetUrl(84532, TEST_USDT, env)).toBeNull();
    expect(getExternalFaucetUrl(8453, CIRCLE_USDC, env)).toBeNull();
  });
});
