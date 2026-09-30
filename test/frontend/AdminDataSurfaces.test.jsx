import React from 'react';
import { describe, expect, it } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import AdminChainPanel from '../../frontend/src/app/contexts/admin/AdminChainPanel';
import AdminRevenuePanel from '../../frontend/src/app/contexts/admin/AdminRevenuePanel';
import { createMockAdminFetch, createMockProtocolConfigReader } from '../ui-lab/mocks/mockAdminFetch';
import { labTokenSymbols } from '../ui-lab/fixtures/adminFixtures';

describe('Admin surfaces for contract + backend data that were not shown before', () => {
  it('On-chain tab shows owner settings read-only and warns about EOA owners', async () => {
    render(<AdminChainPanel lang="EN" readProtocolConfig={createMockProtocolConfigReader({ chainMode: 'eoa' })} />);
    await waitFor(() => expect(screen.getByText('ArafEscrow')).toBeInTheDocument());
    expect(screen.getAllByText('0.10% (10 bps)')).toHaveLength(2);
    expect(screen.getByText(/single-key wallets \(EOA\)/)).toBeInTheDocument();
    expect(screen.getByText('30.00% (3000 bps)')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /pause|set|withdraw/i })).not.toBeInTheDocument();
  });

  it('On-chain tab reports an unreachable RPC instead of blank data', async () => {
    render(<AdminChainPanel lang="EN" readProtocolConfig={createMockProtocolConfigReader({ chainMode: 'error' })} />);
    await waitFor(() => expect(screen.getByText(/Could not read contracts/)).toBeInTheDocument());
  });

  it('Revenue tab renders /admin/revenue rows with contract RevenueKind labels and reward counts', async () => {
    render(<AdminRevenuePanel lang="EN" authenticatedFetch={createMockAdminFetch({ responseMode: 'healthy' })} tokenSymbols={labTokenSymbols} />);
    await waitFor(() => expect(screen.getByText('Manual release fee')).toBeInTheDocument());
    expect(screen.getByText('Burn residual')).toBeInTheDocument();
    expect(screen.getByText('31')).toBeInTheDocument();
  });

  it('Revenue tab respects 403', async () => {
    render(<AdminRevenuePanel lang="EN" authenticatedFetch={createMockAdminFetch({ responseMode: 'forbidden' })} />);
    await waitFor(() => expect(screen.getByText('Unauthorized Access')).toBeInTheDocument());
  });
});
