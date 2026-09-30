export const createUiLabActionLogger = ({ scenarioId, appendLog }) => (actionKey, details = {}) => {
  const entry = {
    actionKey,
    scenarioId,
    timestamp: new Date().toISOString(),
    details,
  };
  if (typeof appendLog === 'function') appendLog(entry);
  return entry;
};

export const createSetterAction = ({ scenarioId, appendLog, actionKey }) => (...args) => {
  createUiLabActionLogger({ scenarioId, appendLog })(actionKey, { args });
};

// [TR] Lab işlem odası: gerçek buton kuralları (buildTradeRoomPanelCallbacks) çalışır, yalnız kontrat
//      çağrısı yerine günlüğe yazılır. Anahtarlar AppViews'taki handler adlarıyla eşleşir.
// [EN] Trade-room lab handlers: real enablement rules run, contract calls are replaced by log entries.
const HANDLER_ACTION_KEYS = {
  handleReportPayment: 'report_payment',
  handleRelease: 'release_funds',
  handleChallenge: 'start_challenge',
  handlePingMaker: 'ping_maker',
  handleAutoRelease: 'auto_release',
  handleProposeCancel: 'propose_cancel',
  handleBurnExpired: 'burn_expired',
  handleExpirePaymentWindow: 'expire_payment_window',
};

export const createTradeRoomHandlers = ({ scenarioId, appendLog } = {}) => {
  const log = createUiLabActionLogger({ scenarioId, appendLog });
  return Object.fromEntries(Object.entries(HANDLER_ACTION_KEYS).map(([handler, key]) => [handler, (...args) => log(key, { args })]));
};

export const createSettlementContractMocks = ({ scenarioId, appendLog } = {}) => {
  const log = createUiLabActionLogger({ scenarioId, appendLog });
  const fn = (key) => async (...args) => { log(key, { args: args.map(String) }); return { hash: `0xlab-${key}` }; };
  return {
    proposeSettlement: fn('propose_settlement'),
    acceptSettlement: fn('accept_settlement'),
    rejectSettlement: fn('reject_settlement'),
    withdrawSettlement: fn('withdraw_settlement'),
    expireSettlement: fn('expire_settlement'),
  };
};

// [TR] Lab işlem odası: uzlaşma önizlemesi backend'in kontrat formülüyle aynı hesapla üretilir
//      (acceptSettlement: havuz = güncel ana para + iki teminat, ücret brüt paylar üzerinden).
// [EN] Lab trade room: settlement preview mirrors the backend/contract formula.
export const createTradeRoomFetch = ({ trade, estimate, fallbackFetch }) => async (url, options = {}) => {
  if (!String(url).includes('/settlement-proposal/preview')) return fallbackFetch(url, options);
  const body = JSON.parse(options.body || '{}');
  const makerShareBps = BigInt(Number(body.makerShareBps) || 0);
  const cur = estimate(trade || {}) || {
    currentCrypto: BigInt(trade?.cryptoAmountRaw || 0), currentMakerBond: BigInt(trade?.makerBondRaw || 0), currentTakerBond: BigInt(trade?.takerBondRaw || 0), totalDecayed: 0n,
  };
  const pool = cur.currentCrypto + cur.currentMakerBond + cur.currentTakerBond;
  const grossMaker = (pool * makerShareBps) / 10000n;
  const grossTaker = pool - grossMaker;
  const makerFee = (grossMaker * BigInt(trade?.makerFeeBps ?? 10)) / 10000n;
  const takerFee = (grossTaker * BigInt(trade?.takerFeeBps ?? 10)) / 10000n;
  const json = {
    informationalOnly: true,
    makerShareBps: Number(makerShareBps),
    takerShareBps: 10000 - Number(makerShareBps),
    pool: pool.toString(),
    makerFee: makerFee.toString(),
    takerFee: takerFee.toString(),
    makerPayout: (grossMaker - makerFee).toString(),
    takerPayout: (grossTaker - takerFee).toString(),
    decayedAmount: cur.totalDecayed.toString(),
  };
  return new Response(JSON.stringify(json), { status: 200, headers: { 'Content-Type': 'application/json' } });
};
