import React from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { HistoryPanel, ReputationPanel } from '../../frontend/src/app/contexts/profile/ProfilePanels';
import MyOrdersPanel from '../../frontend/src/app/contexts/profile/MyOrdersPanel';
import PaymentProfilePanel from '../../frontend/src/app/contexts/profile/PaymentProfilePanel';
import { computeTierByCounts, deriveReputationView, resolveReputationPolicy } from '../../frontend/src/app/contexts/profile/reputationModel';
import { mapResolutionTypeLabel } from '../../frontend/src/app/useAppSessionData';

const DAY = 86400;
const NOW = 1_800_000_000;
const rep = (o = {}) => ({
  effectiveTier: 1, successful: 20, failed: 0, bannedUntil: 0, consecutiveBans: 0, firstSuccessfulTradeAt: NOW - 40 * DAY,
  ...o,
  authorityCounters: { riskPoints: 0, partialSettlementCount: 0, ...(o.authorityCounters || {}) },
});

afterEach(cleanup);

describe('reputationModel mirrors ArafEscrow rules', () => {
  it('uses contract constructor defaults until the policy event is mirrored', () => {
    const p = resolveReputationPolicy(null);
    expect(p.fromChain).toBe(false);
    expect(p.tierMinSuccessfulTrades).toEqual([0, 15, 50, 100, 200]);
    expect(resolveReputationPolicy({ source: 'onchain_event', tierMinSuccessfulTrades: [0, 5, 10, 20, 40], tierMaxRiskPoints: [100, 80, 50, 30, 15] }).fromChain).toBe(true);
  });

  it('computes tier like _getEffectiveTier (trades AND risk cap)', () => {
    const p = resolveReputationPolicy(null);
    expect(computeTierByCounts(60, 40, p)).toBe(2);
    expect(computeTierByCounts(60, 60, p)).toBe(1);
    expect(computeTierByCounts(250, 16, p)).toBe(3);
    expect(computeTierByCounts(14, 0, p)).toBe(0);
  });

  it('flags the 15-day active period and a contract tier cap', () => {
    const pending = deriveReputationView({ reputation: rep({ effectiveTier: 0, successful: 16, firstSuccessfulTradeAt: NOW - 5 * DAY }), now: NOW });
    expect(pending.activePeriodPending).toBe(true);
    expect(pending.tierCapped).toBe(false);
    const capped = deriveReputationView({ reputation: rep({ effectiveTier: 1, successful: 58 }), now: NOW });
    expect(capped.tierCapped).toBe(true);
  });

  it('opens clean slate only after bannedUntil + cleanPeriod with bans on record (decayReputation)', () => {
    const base = { consecutiveBans: 1 };
    expect(deriveReputationView({ reputation: rep({ ...base, bannedUntil: NOW + DAY }), now: NOW }).cleanSlate).toBe('ban_active');
    expect(deriveReputationView({ reputation: rep({ ...base, bannedUntil: NOW - 30 * DAY }), now: NOW }).cleanSlate).toBe('waiting');
    expect(deriveReputationView({ reputation: rep({ ...base, bannedUntil: NOW - 91 * DAY }), now: NOW }).cleanSlate).toBe('eligible');
    expect(deriveReputationView({ reputation: rep({ bannedUntil: NOW - 91 * DAY }), now: NOW }).cleanSlate).toBe('none');
  });

  it('bond effect matches resolveEffectiveBondBps and is neutral at tier 0', () => {
    expect(deriveReputationView({ reputation: rep(), now: NOW }).bondAdjustment).toBe('discount');
    expect(deriveReputationView({ reputation: rep({ authorityCounters: { riskPoints: 5 } }), now: NOW }).bondAdjustment).toBe('penalty');
    expect(deriveReputationView({ reputation: rep({ effectiveTier: 0 }), now: NOW }).bondAdjustment).toBe('tier0');
  });
});

describe('Profile panels (ported from the removed profile modal)', () => {
  it('reputation tab shows next-tier requirements, agreed-settlement note and clean slate action', () => {
    const decayReputation = vi.fn().mockResolvedValue(undefined);
    render(<ReputationPanel lang="EN" address="0xabc" decayReputation={decayReputation} userReputation={rep({ effectiveTier: 1, successful: 58, consecutiveBans: 1, bannedUntil: Math.floor(Date.now() / 1000) - 100 * DAY, authorityCounters: { riskPoints: 20, partialSettlementCount: 2 } })} />);
    expect(screen.getByText('Path to Tier 2')).toBeInTheDocument();
    expect(screen.getByText(/not a penalty/)).toBeInTheDocument();
    expect(screen.getByText(/contract defaults/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Clear my record' }));
    expect(decayReputation).toHaveBeenCalledWith('0xabc');
  });

  it('shows Trust Visibility as informational and fails soft without a signal', () => {
    render(<ReputationPanel lang="EN" userReputation={rep()} activeEscrows={[{ onchainId: '321', role: 'maker', rawTrade: { offchainHealthScoreInput: { readOnly: true, nonBlocking: true, canBlockProtocolActions: false, explainableReasons: ['maker_frequent_recent_bank_changes_at_lock'] } } }]} />);
    expect(screen.getByText('Trust Visibility')).toBeInTheDocument();
    expect(screen.getByText(/bank-change frequency/i)).toBeInTheDocument();
    expect(screen.queryByText(/canBlockProtocolActions/i)).not.toBeInTheDocument();
    cleanup();
    render(<ReputationPanel lang="EN" userReputation={rep()} activeEscrows={[{ onchainId: '1', role: 'maker', rawTrade: {} }]} />);
    expect(screen.getByText(/No signals to show/i)).toBeInTheDocument();
  });

  it('history rows show direction, terminal outcome label and paginate', () => {
    const setPage = vi.fn();
    render(<HistoryPanel lang="EN" address="0xAbc" mapResolutionTypeLabel={mapResolutionTypeLabel} tradeHistoryTotal={25} tradeHistoryLimit={10} setTradeHistoryPage={setPage}
      tradeHistory={[{ _id: 't1', status: 'RESOLVED', resolution_type: 'PARTIAL_SETTLEMENT', onchain_escrow_id: '101', maker_address: '0xabc', financials: { crypto_amount: '1000000', crypto_asset: 'USDT' } }]} />);
    expect(screen.getByText('Closed by agreed partial settlement')).toBeInTheDocument();
    expect(screen.getByText(/Sold 1 USDT/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Next page' }));
    expect(setPage).toHaveBeenCalled();
  });

  it('my orders show remaining/total, min fill and tier', () => {
    render(<MyOrdersPanel lang="EN" handleDeleteOrder={vi.fn()} myOrders={[{ id: 'o1', onchainId: '9', side: 'BUY_CRYPTO', status: 'OPEN', crypto: 'USDT', totalAmount: 100, remainingAmount: 50, minFillAmount: 10, tier: 2 }]} />);
    expect(screen.getByText('50 / 100 USDT')).toBeInTheDocument();
    expect(screen.getByText(/Min 10 USDT · T2/)).toBeInTheDocument();
  });

  it('payment profile keeps contact channels, bank name and rail-aware countries', () => {
    render(<PaymentProfilePanel lang="EN" setPayoutProfileDraft={vi.fn()} handleUpdatePII={vi.fn()} payoutProfileDraft={{ rail: 'TR_IBAN', country: 'TR', contact: {}, fields: {} }} />);
    expect(screen.getByRole('option', { name: 'Telegram' })).toBeInTheDocument();
    expect(screen.getByLabelText('Bank name (optional)')).toBeInTheDocument();
    expect(screen.getAllByRole('option', { name: 'TR' }).length).toBe(1);
  });
});
