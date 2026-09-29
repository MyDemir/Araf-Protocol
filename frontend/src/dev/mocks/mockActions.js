export const UI_LAB_ACTION_KEYS = [
  'report_payment',
  'release_funds',
  'start_challenge',
  'ping_maker',
  'auto_release',
  'propose_cancel',
  'burn_expired',
];

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

export const createTradeRoomActionCallbacks = ({ scenarioId, appendLog, disabled = false } = {}) => {
  const log = createUiLabActionLogger({ scenarioId, appendLog });
  return UI_LAB_ACTION_KEYS.reduce((acc, key) => {
    acc[key] = {
      onClick: () => log(key),
      disabled,
    };
    return acc;
  }, {});
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
