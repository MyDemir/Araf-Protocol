import { makeEscrow, buildActiveEscrowCounts, UI_LAB_VIEWER } from './operationsFixtures';

export const activeTradesFixture = [
  makeEscrow('3001', 'LOCKED', 'maker'),
  makeEscrow('3002', 'PAID', 'taker'),
  makeEscrow('3003', 'CHALLENGED', 'maker'),
];

export const activeTradesScenarios = [
  { id: 'active-trades-all', label: 'ALL / LOCKED / PAID / CHALLENGED', category: 'activeTrades', activeEscrows: activeTradesFixture, activeEscrowCounts: buildActiveEscrowCounts(activeTradesFixture), initialFilter: 'ALL', address: UI_LAB_VIEWER },
  { id: 'active-trades-challenged', label: 'CHALLENGED filter', category: 'activeTrades', activeEscrows: activeTradesFixture, activeEscrowCounts: buildActiveEscrowCounts(activeTradesFixture), initialFilter: 'CHALLENGED', address: UI_LAB_VIEWER },
  { id: 'active-trades-empty', label: 'Empty state', category: 'activeTrades', activeEscrows: [], activeEscrowCounts: buildActiveEscrowCounts([]), initialFilter: 'ALL', address: UI_LAB_VIEWER },
];
