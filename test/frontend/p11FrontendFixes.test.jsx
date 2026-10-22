import React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import SettlementProposalCard from '../../frontend/src/components/SettlementProposalCard';
import PIIDisplay from '../../frontend/src/components/PIIDisplay';
import { piiCopy } from '../../frontend/src/app/copy/pii';

afterEach(() => cleanup());

const cardProps = (trade) => ({
  activeTrade: {
    id: 'db-id',
    onchainId: '7',
    state: 'RESOLVED',
    makerFull: '0x1111111111111111111111111111111111111111',
    takerFull: '0x2222222222222222222222222222222222222222',
    ...trade,
  },
  userRole: 'maker',
  address: '0x1111111111111111111111111111111111111111',
  lang: 'EN',
  authenticatedFetch: vi.fn(),
  settlementContractFns: { proposeSettlement: vi.fn(), acceptSettlement: vi.fn(), rejectSettlement: vi.fn(), withdrawSettlement: vi.fn(), expireSettlement: vi.fn() },
  fetchMyTrades: vi.fn(),
  showToast: vi.fn(),
  isContractLoading: false,
  setIsContractLoading: vi.fn(),
});

describe('F4-02: sonuçlanan uzlaşma tutarları token birimiyle gösterilir', () => {
  it('ham taban birimi ondalık ve sembolle biçimlenir', () => {
    render(<SettlementProposalCard {...cardProps({ crypto: 'USDT', tokenDecimals: 6, settlementProposal: { state: 'FINALIZED', makerPayout: '950000', takerPayout: '50000' } })} />);
    expect(screen.getByText('0.95 USDT')).toBeInTheDocument();
    expect(screen.getByText('0.05 USDT')).toBeInTheDocument();
    expect(screen.queryByText('950000')).not.toBeInTheDocument();
  });

  it('tokenDecimals yoksa 6 kullanılır; okunamayan değer — gösterir', () => {
    render(<SettlementProposalCard {...cardProps({ crypto: 'USDC', settlementProposal: { state: 'FINALIZED', maker_payout: '2000000' } })} />);
    expect(screen.getByText('2 USDC')).toBeInTheDocument();
    expect(screen.getAllByText('—').length).toBeGreaterThan(0);
  });
});

describe('F4-04: US_ACH kopyalama düğmeleri hata durumunu gösterir', () => {
  beforeEach(() => {
    Object.defineProperty(window, 'isSecureContext', { value: false, configurable: true });
    global.fetch = vi.fn()
      .mockResolvedValueOnce({ ok: true, json: async () => ({ piiToken: 'token-us' }) })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ payoutProfile: { rail: 'US_ACH', fields: { account_holder_name: 'John Doe', routing_number: '021000021', account_number: '000123456789' } } }),
      });
  });

  it.each([['Copy Routing'], ['Copy Account']])('%s hata verince "Copy failed" gösterir', async (label) => {
    const user = userEvent.setup();
    render(<PIIDisplay tradeId="trade-us" lang="EN" />);
    await user.click(screen.getByRole('button', { name: /Reveal/i }));
    await waitFor(() => expect(screen.getByText('John Doe')).toBeInTheDocument());
    await user.click(screen.getByRole('button', { name: new RegExp(label, 'i') }));
    expect(screen.getByRole('button', { name: /Copy failed/i })).toBeInTheDocument();
  });
});

describe('F4-05: PII metinleri uçtan uca şifreleme iddia etmez', () => {
  it('TR ve EN metinlerinde "uçtan uca / end-to-end" geçmez', () => {
    const all = JSON.stringify(piiCopy);
    expect(all).not.toMatch(/uçtan uca|end-to-end/i);
  });

  it('rozet saklamada şifreleme + TLS ifadesini taşır', () => {
    expect(piiCopy.tr.encryptedBadge).toBe('Şifreli saklanır ve şifreli kanaldan iletilir');
    expect(piiCopy.en.encryptedBadge).toBe('Encrypted at rest and sent over TLS');
  });
});

describe('C2: panoya yazma reddedilir ve execCommand false döner -> hata etiketi', () => {
  it('Copy Routing "Copy failed" gösterir', async () => {
    const user = userEvent.setup();
    Object.defineProperty(window, 'isSecureContext', { value: true, configurable: true });
    Object.defineProperty(navigator, 'clipboard', { value: { writeText: vi.fn().mockRejectedValue(new Error('denied')) }, configurable: true });
    document.execCommand = vi.fn(() => false);
    global.fetch = vi.fn()
      .mockResolvedValueOnce({ ok: true, json: async () => ({ piiToken: 't' }) })
      .mockResolvedValueOnce({ ok: true, json: async () => ({ payoutProfile: { rail: 'US_ACH', fields: { account_holder_name: 'John Doe', routing_number: '021000021', account_number: '000123456789' } } }) });
    render(<PIIDisplay tradeId="trade-us" lang="EN" />);
    await user.click(screen.getByRole('button', { name: /Reveal/i }));
    await waitFor(() => expect(screen.getByText('John Doe')).toBeInTheDocument());
    await user.click(screen.getByRole('button', { name: /Copy Routing/i }));
    await waitFor(() => expect(screen.getByRole('button', { name: /Copy failed/i })).toBeInTheDocument());
    expect(document.execCommand).toHaveBeenCalledWith('copy');
  });
});

describe('C3: büyük değerler ve sembolsüz tutar', () => {
  it('18 ondalık ve 2^64 üstü değer biçimlenir', () => {
    render(<SettlementProposalCard {...cardProps({ crypto: 'DAI', tokenDecimals: 18, settlementProposal: { state: 'FINALIZED', makerPayout: '1500000000000000000', takerPayout: '18446744073709551616000000000000000000' } })} />);
    expect(screen.getByText(/^1\.5\d? DAI$/)).toBeInTheDocument();
    const taker = screen.getByText(/Taker payout/).querySelector('span').textContent;
    expect(taker.endsWith(' DAI')).toBe(true);
    expect(taker.replace(/\D/g, '').startsWith('18446744073709551616')).toBe(true);
  });

  it('sembol yoksa birimsiz sayı gösterilir', () => {
    render(<SettlementProposalCard {...cardProps({ tokenDecimals: 6, settlementProposal: { state: 'FINALIZED', makerPayout: '950000', takerPayout: '50000' } })} />);
    expect(screen.getByText('0.95')).toBeInTheDocument();
    expect(screen.getByText('0.05')).toBeInTheDocument();
  });
});
