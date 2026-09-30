// [TR] İşlem odası senaryoları kontratın gerçek karar noktalarını kapsar. Süreler sabit sayaç değil,
//      zaman damgasıdır (lockedAt, paidAt, pingedAt, challengePingedAt, challengedAt); butonların
//      aktif/pasif durumu gerçek uygulamadaki aynı kurallardan (tradeTimeline.js) türetilir.
// [EN] Trade-room scenarios cover the contract's real decision points. Timing is expressed as timestamps,
//      so enablement comes from the same rules the live app uses (tradeTimeline.js).

export const UI_LAB_TRADE_VIEWER = '0xViewer000000000000000000000000000000000001';
export const UI_LAB_TRADE_COUNTERPARTY = '0xOther000000000000000000000000000000000001';

const hoursAgo = (h) => new Date(Date.now() - h * 3600 * 1000).toISOString();
const hoursFromNowUnix = (h) => Math.floor((Date.now() + h * 3600 * 1000) / 1000);

export const uiLabBaseTrade = {
  id: '#LAB-1001',
  onchainId: '1001',
  state: 'LOCKED',
  role: 'taker',
  crypto: 'USDT',
  fiat: 'TRY',
  rate: 41.25,
  max: 5156.25,
  tokenDecimals: 6,
  cryptoAmountRaw: '125000000',
  makerBondRaw: '10000000',
  takerBondRaw: '12500000',
  takerFeeBps: 10,
  chargebackAcked: true,
  settlementProposal: null,
  cancelProposedBy: null,
  _pendingBackendSync: false,
};

const buildTrade = ({ id, state, role, trade = {} }) => {
  const viewerIsMaker = role === 'maker';
  const makerFull = viewerIsMaker ? UI_LAB_TRADE_VIEWER : UI_LAB_TRADE_COUNTERPARTY;
  const takerFull = viewerIsMaker ? UI_LAB_TRADE_COUNTERPARTY : UI_LAB_TRADE_VIEWER;
  const numericId = String(id.split('').reduce((acc, ch) => (acc * 31 + ch.charCodeAt(0)) % 9000, 7) + 1000);
  return {
    ...uiLabBaseTrade,
    id: `#${id}`,
    onchainId: numericId,
    state,
    role,
    maker: makerFull,
    makerFull,
    takerFull,
    lockedAt: hoursAgo(1),
    ...trade,
  };
};

const who = (key) => (key === 'me' ? UI_LAB_TRADE_VIEWER : key === 'other' ? UI_LAB_TRADE_COUNTERPARTY : null);

const scenario = (id, label, {
  state = 'LOCKED', role = 'taker', trade = {}, paymentIpfsHash = '', env = {}, cancelBy = null, settlement = null,
} = {}) => {
  const built = buildTrade({ id, state, role, trade });
  if (cancelBy) built.cancelProposedBy = who(cancelBy);
  if (settlement) {
    built.settlementProposal = {
      state: settlement.state || 'PROPOSED',
      proposer: who(settlement.by),
      makerShareBps: settlement.makerShareBps ?? 6000,
      takerShareBps: 10000 - (settlement.makerShareBps ?? 6000),
      expiresAt: hoursFromNowUnix(settlement.expiresInHours ?? 2),
    };
  }
  return {
    id,
    label,
    category: 'tradeRoom',
    viewerAddress: UI_LAB_TRADE_VIEWER,
    cancelStatus: cancelBy === 'me' ? 'proposed_by_me' : cancelBy === 'other' ? 'proposed_by_other' : null,
    decisionInput: {
      trade: built,
      tradeState: state,
      userRole: role,
      paymentIpfsHash,
      chargebackAccepted: built.chargebackAcked,
      isConnected: env.isConnected ?? true,
      isAuthenticated: env.isAuthenticated ?? true,
      isSupportedChain: env.isSupportedChain ?? true,
      isPaused: env.isPaused ?? false,
    },
  };
};

export const tradeRoomScenarios = [
  // LOCKED — taker must pay and report within PAYMENT_WINDOW (48h)
  scenario('locked-taker', 'LOCKED / taker', { state: 'LOCKED', role: 'taker' }),
  scenario('locked-taker-proof', 'LOCKED / taker · receipt uploaded', { state: 'LOCKED', role: 'taker', paymentIpfsHash: 'ipfs://proof-ready' }),
  scenario('locked-taker-window-expired', 'LOCKED / taker · 48h window expired', { state: 'LOCKED', role: 'taker', trade: { lockedAt: hoursAgo(49) } }),
  scenario('locked-maker', 'LOCKED / maker', { state: 'LOCKED', role: 'maker' }),
  scenario('locked-maker-window-expired', 'LOCKED / maker · 48h window expired', { state: 'LOCKED', role: 'maker', trade: { lockedAt: hoursAgo(50) } }),
  scenario('locked-cancel-by-other', 'LOCKED / taker · counterparty proposed cancel', { state: 'LOCKED', role: 'taker', cancelBy: 'other' }),
  scenario('locked-cancel-by-me', 'LOCKED / maker · I proposed cancel', { state: 'LOCKED', role: 'maker', cancelBy: 'me' }),

  // PAID — maker path: release, or ping taker (paidAt+24h) then challenge (ping+24h)
  scenario('paid-maker', 'PAID / maker', { state: 'PAID', role: 'maker', paymentIpfsHash: 'ipfs://proof-paid', trade: { lockedAt: hoursAgo(3), paidAt: hoursAgo(2) } }),
  scenario('paid-maker-no-ack', 'PAID / maker · chargeback not acknowledged', { state: 'PAID', role: 'maker', trade: { paidAt: hoursAgo(2), chargebackAcked: false } }),
  scenario('paid-maker-can-ping', 'PAID / maker · 24h passed, can ping taker', { state: 'PAID', role: 'maker', trade: { paidAt: hoursAgo(25) } }),
  scenario('paid-maker-pinged', 'PAID / maker · pinged, waiting 24h', { state: 'PAID', role: 'maker', trade: { paidAt: hoursAgo(30), challengePingedAt: hoursAgo(5) } }),
  scenario('paid-maker-can-challenge', 'PAID / maker · can open challenge', { state: 'PAID', role: 'maker', trade: { paidAt: hoursAgo(50), challengePingedAt: hoursAgo(25) } }),
  scenario('paid-maker-taker-pinged', 'PAID / maker · taker pinged first (conflict)', { state: 'PAID', role: 'maker', trade: { paidAt: hoursAgo(50), pingedAt: hoursAgo(2) } }),

  // PAID — taker path: wait GRACE_PERIOD (48h), ping maker, auto-release after 24h
  scenario('paid-taker', 'PAID / taker', { state: 'PAID', role: 'taker', paymentIpfsHash: 'ipfs://proof-paid', trade: { paidAt: hoursAgo(2) } }),
  scenario('paid-taker-can-ping', 'PAID / taker · 48h passed, can ping maker', { state: 'PAID', role: 'taker', trade: { paidAt: hoursAgo(49) } }),
  scenario('paid-taker-pinged', 'PAID / taker · pinged, waiting 24h', { state: 'PAID', role: 'taker', trade: { paidAt: hoursAgo(52), pingedAt: hoursAgo(3) } }),
  scenario('paid-taker-can-auto-release', 'PAID / taker · can auto-release', { state: 'PAID', role: 'taker', trade: { paidAt: hoursAgo(75), pingedAt: hoursAgo(25) } }),
  scenario('paid-taker-maker-pinged', 'PAID / taker · maker pinged first (conflict)', { state: 'PAID', role: 'taker', trade: { paidAt: hoursAgo(30), challengePingedAt: hoursAgo(3) } }),

  // CHALLENGED — bonds bleed after 48h, principal after 144h, burn at 240h
  scenario('challenged-maker', 'CHALLENGED / maker', { state: 'CHALLENGED', role: 'maker', trade: { paidAt: hoursAgo(60), challengePingedAt: hoursAgo(40), challengedAt: hoursAgo(10) } }),
  scenario('challenged-taker', 'CHALLENGED / taker', { state: 'CHALLENGED', role: 'taker', trade: { paidAt: hoursAgo(60), challengePingedAt: hoursAgo(40), challengedAt: hoursAgo(10) } }),
  scenario('challenged-bleeding', 'CHALLENGED / taker · bonds bleeding', { state: 'CHALLENGED', role: 'taker', trade: { challengedAt: hoursAgo(60) } }),
  scenario('challenged-principal-decay', 'CHALLENGED / maker · principal decaying', { state: 'CHALLENGED', role: 'maker', trade: { challengedAt: hoursAgo(160) } }),
  scenario('challenged-settlement-incoming', 'CHALLENGED / taker · settlement offer received', { state: 'CHALLENGED', role: 'taker', trade: { challengedAt: hoursAgo(20) }, settlement: { by: 'other', makerShareBps: 6000 } }),
  scenario('challenged-settlement-mine', 'CHALLENGED / maker · my settlement offer pending', { state: 'CHALLENGED', role: 'maker', trade: { challengedAt: hoursAgo(20) }, settlement: { by: 'me', makerShareBps: 5000 } }),
  scenario('challenged-settlement-expired', 'CHALLENGED / taker · settlement offer expired', { state: 'CHALLENGED', role: 'taker', trade: { challengedAt: hoursAgo(30) }, settlement: { by: 'other', expiresInHours: -1 } }),
  scenario('challenged-cancel-by-other', 'CHALLENGED / maker · counterparty proposed cancel', { state: 'CHALLENGED', role: 'maker', trade: { challengedAt: hoursAgo(20) }, cancelBy: 'other' }),
  scenario('challenged-burn-ready', 'CHALLENGED / taker · 240h passed, burn available', { state: 'CHALLENGED', role: 'taker', trade: { challengedAt: hoursAgo(241) } }),

  // Closed trades
  scenario('resolved', 'RESOLVED / taker', { state: 'RESOLVED', role: 'taker', trade: { paidAt: hoursAgo(5) } }),
  scenario('canceled', 'CANCELED / maker', { state: 'CANCELED', role: 'maker' }),
  scenario('burned', 'BURNED / taker', { state: 'BURNED', role: 'taker', trade: { challengedAt: hoursAgo(300) } }),

  // Environment
  scenario('wrong-chain', 'Wrong chain', { state: 'PAID', role: 'maker', trade: { paidAt: hoursAgo(2) }, env: { isSupportedChain: false } }),
  scenario('paused-system', 'Paused system', { state: 'LOCKED', role: 'taker', paymentIpfsHash: 'ipfs://proof', env: { isPaused: true } }),
  scenario('unauthenticated', 'Unauthenticated', { state: 'LOCKED', role: 'taker', env: { isAuthenticated: false, isConnected: false } }),
  scenario('pending-backend-sync', 'Pending backend sync', { state: 'LOCKED', role: 'taker', trade: { id: null, _pendingBackendSync: true } }),
];
