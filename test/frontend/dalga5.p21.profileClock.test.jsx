import React from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { AccountPanel, ReputationPanel } from '../../frontend/src/app/contexts/profile/ProfilePanels';
import { setClockOffset } from '../../frontend/src/app/clock';

vi.mock('../../frontend/src/components/TokenBalances', () => ({ default: () => null }));

afterEach(() => { cleanup(); setClockOffset(0); vi.unstubAllGlobals(); });

const DAY = 86400;
const rep = (firstAt) => ({
  effectiveTier: 1, successful: 20, failed: 0, bannedUntil: 0, consecutiveBans: 0, firstSuccessfulTradeAt: firstAt,
  authorityCounters: { riskPoints: 0, partialSettlementCount: 0 },
});

// [TR] F4-17: itibar süreleri cihaz saatine değil zincir saatine (clock.js) göre hesaplanır.
describe('F4-17: zincir saati ve pano geri bildirimi', () => {
  it('cihaz saatine göre bekleyen 15 gün, zincir saati ilerideyse tamamlanmış görünür', () => {
    const deviceNow = Math.floor(Date.now() / 1000);
    const firstAt = deviceNow - 10 * DAY;
    render(<ReputationPanel lang="EN" userReputation={rep(firstAt)} />);
    expect(screen.getByText(/days left/)).toBeInTheDocument();
    cleanup();
    setClockOffset(10 * DAY * 1000);
    render(<ReputationPanel lang="EN" userReputation={rep(firstAt)} />);
    expect(screen.queryByText(/days left/)).toBeNull();
  });

  it('adres kopyalama başarısız olursa kullanıcıya mesaj gösterilir', async () => {
    vi.stubGlobal('navigator', { clipboard: { writeText: vi.fn(async () => { throw new Error('denied'); }) } });
    render(<AccountPanel lang="EN" address="0xabc" isConnected isAuthenticated userReputation={null} isBanned={false} />);
    fireEvent.click(screen.getByRole('button', { name: 'Copy address' }));
    await waitFor(() => expect(screen.getByRole('status')).toHaveTextContent(/Could not copy/i));
  });
});
