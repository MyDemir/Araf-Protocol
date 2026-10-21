import React from 'react';
import { afterEach, describe, expect, it } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import { buildOperationsContextModel } from '../../frontend/src/app/contexts/operations/operationsContextModel';
import OperationTradeCard, { compareActiveTradePriority } from '../../frontend/src/app/contexts/operations/OperationTradeCard';
import OperationLaneTabs from '../../frontend/src/app/contexts/operations/OperationLaneTabs';

afterEach(() => cleanup());

const NOW = 2_000_000_000;
const counts = { LOCKED: 0, PAID: 0, CHALLENGED: 0, settlement: {} };
const escrow = (expiresAt) => ({
  id: '#7',
  role: 'taker',
  state: 'CHALLENGED',
  rawTrade: { settlementProposal: { state: 'PROPOSED', proposer: '0xAAA', expiresAt } },
});
const build = (e, nowSec) => buildOperationsContextModel({ activeEscrows: [e], activeEscrowCounts: counts, address: '0xbbb', lang: 'EN', nowSec });

describe('P20 F3-04: suresi dolmus uzlasma teklifi', () => {
  it('canli teklif (now <= expiresAt) action_required seridinde kalir, sinir saniyesi dahil', () => {
    expect(build(escrow(NOW + 60), NOW).lanes[0].key).toBe('settlement_action_required');
    expect(build(escrow(NOW), NOW).lanes[0].key).toBe('settlement_action_required');
  });
  it('suresi dolmus teklif action_required seridinden cikar', () => {
    const model = build(escrow(NOW - 1), NOW);
    expect(model.lanes.map((l) => l.key)).toEqual(['challenged']);
  });
  it('kart suresi doldu metnini gosterir', () => {
    const past = Math.floor(Date.now() / 1000) - 3600;
    render(<OperationTradeCard escrow={{ ...escrow(past), viewerAddress: '0xbbb' }} lang="EN" onGoToRoom={() => {}} />);
    expect(screen.getByText('Settlement offer expired')).toBeTruthy();
    expect(screen.queryByText('Settlement needs your response')).toBeNull();
  });
  it('kart canli teklifte yanit gerekiyor metnini korur', () => {
    const future = Math.floor(Date.now() / 1000) + 3600;
    render(<OperationTradeCard escrow={{ ...escrow(future), viewerAddress: '0xbbb' }} lang="EN" onGoToRoom={() => {}} />);
    expect(screen.getByText('Settlement needs your response')).toBeTruthy();
  });
});

describe('P20 F3-14: esit durumda id dogal sirayla siralanir', () => {
  it('#9, #10den once gelir', () => {
    const list = [{ id: '#10', state: 'PAID' }, { id: '#9', state: 'PAID' }, { id: '#2', state: 'PAID' }];
    expect(list.sort(compareActiveTradePriority).map((x) => x.id)).toEqual(['#2', '#9', '#10']);
  });
});

describe('P20 F3-10: lane sekmeleri secili durumu bildirir', () => {
  it('aria-pressed aktif sekmede true, digerinde false', () => {
    const lanes = [
      { key: 'paid', label: 'Paid', items: [1] },
      { key: 'locked', label: 'Locked', items: [1] },
    ];
    render(<OperationLaneTabs lanes={lanes} activeLaneKey="locked" setActiveLaneKey={() => {}} />);
    expect(screen.getByRole('button', { name: /Locked/ }).getAttribute('aria-pressed')).toBe('true');
    expect(screen.getByRole('button', { name: /Paid/ }).getAttribute('aria-pressed')).toBe('false');
  });
});
