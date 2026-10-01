import React from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import { AccountPanel } from '../../frontend/src/app/contexts/profile/ProfilePanels';
import { deriveReputationView } from '../../frontend/src/app/contexts/profile/reputationModel';
import { fmtBps, isKnownNumber } from '../../frontend/src/app/copy';

afterEach(cleanup);

describe('item 9: unknown states are shown as unknown, never as 0', () => {
  it('fmtBps / isKnownNumber treat null, undefined and empty as unknown', () => {
    for (const v of [null, undefined, '']) {
      expect(isKnownNumber(v)).toBe(false);
      expect(fmtBps(v, 'EN')).toBe('—');
    }
    expect(isKnownNumber(0)).toBe(true);
    expect(fmtBps(0, 'EN')).toBe('0%');
  });

  it('reputation model: firstSuccessfulTradeAt null is unknown, 0 is "no success yet"', () => {
    const base = { effectiveTier: 0, successful: 60, failed: 0, bannedUntil: 0, consecutiveBans: 0, authorityCounters: { riskPoints: 0 } };
    const unknown = deriveReputationView({ reputation: { ...base, firstSuccessfulTradeAt: null }, now: 1_800_000_000 });
    expect(unknown.firstSuccessUnknown).toBe(true);
    expect(unknown.activePeriodPending).toBe(false);
    expect(unknown.tierCapped).toBe(false);
    const none = deriveReputationView({ reputation: { ...base, firstSuccessfulTradeAt: 0 }, now: 1_800_000_000 });
    expect(none.firstSuccessUnknown).toBe(false);
    expect(none.activePeriodPending).toBe(true);
  });

  it('AccountPanel: unknown cooldown and unknown registration render "Unknown" instead of a countdown / "registration needed"', () => {
    render(<AccountPanel lang="EN" address="0xabc" isConnected isAuthenticated userReputation={null} isBanned={false}
      sybilStatus={{ aged: false, funded: true, cooldownOk: false, cooldownUnknown: true, cooldownRemaining: 0 }}
      isWalletRegistered={null} walletAgeRemainingDays={null} />);
    const card = screen.getByTestId('profile-eligibility');
    expect(card.textContent).toContain('Registration status unknown');
    expect(card.textContent).toContain('Unknown');
    expect(card.textContent).not.toContain('0 min');
    expect(card.textContent).not.toContain('Registration needed');
  });

  it('AccountPanel: registered-but-young and known cooldown keep their concrete text', () => {
    render(<AccountPanel lang="EN" address="0xabc" isConnected isAuthenticated userReputation={null} isBanned={false}
      sybilStatus={{ aged: false, funded: true, cooldownOk: false, cooldownUnknown: false, cooldownRemaining: 600 }}
      isWalletRegistered walletAgeRemainingDays={3} />);
    const card = screen.getByTestId('profile-eligibility');
    expect(card.textContent).toContain('3 days left');
    expect(card.textContent).toContain('10 min');
  });
});
