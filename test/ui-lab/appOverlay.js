import { deriveTradeTimeline, estimateBleeding } from '../../frontend/src/app/contexts/trade-room/tradeTimeline';
import { createMockAdminFetch, createMockProtocolConfigReader } from './mocks/mockAdminFetch';
import { createSetterAction, createSettlementContractMocks, createTradeRoomFetch, createTradeRoomHandlers } from './mocks/mockActions';
import { labTokenSymbols } from './fixtures/adminFixtures';
import { LAB_BOND_MAP, LAB_FEE_CONFIG, LAB_TOKEN_ADDRESSES } from './fixtures/makerOrderFixtures';
import { buildLabRewards } from './fixtures/profileFixtures';

// [TR] Lab senaryosunun gerçek App üzerindeki kaplaması. App yalnız bu üç fonksiyonu çağırır; senaryo
//      kategorisine göre hangi verinin/handler'ın değiştirileceği burada, production paketinin dışında durur.
// [EN] The lab scenario overlay on top of the real App. App only calls these three functions; which data and
//      handlers each scenario category replaces lives here, outside the production bundle.

const ESCROW_CATEGORIES = new Set(['activeTrades', 'operations', 'profile']);
const OPERATIONS_SETTERS = {
  setActiveTrade: 'operations_set_active_trade',
  setUserRole: 'operations_set_user_role',
  setTradeState: 'operations_set_trade_state',
  setChargebackAccepted: 'operations_set_chargeback_accepted',
  setCurrentView: 'operations_set_current_view',
  setSidebarOpen: 'operations_set_sidebar_open',
  setShowProfileModal: 'operations_set_show_profile_modal',
};

const lower = (value) => String(value || '').toLowerCase();
const countEscrows = (activeEscrows = []) => {
  const proposed = activeEscrows.filter((e) => e.settlementProposal?.state === 'PROPOSED');
  const mine = (e) => lower(e.settlementProposal.proposer) === lower(e.viewerAddress || e.takerFull);
  return {
    LOCKED: activeEscrows.filter((e) => e.state === 'LOCKED').length,
    PAID: activeEscrows.filter((e) => e.state === 'PAID').length,
    CHALLENGED: activeEscrows.filter((e) => e.state === 'CHALLENGED').length,
    settlement: {
      PROPOSED: proposed.length,
      ACTION_REQUIRED: proposed.filter((e) => !mine(e)).length,
      WAITING: proposed.filter(mine).length,
    },
  };
};

// [TR] Senaryo başına bir kez kurulur (App, devScenario + authenticatedFetch üzerinden memo'lar); dönen
//      nesnedeki alanlar yalnız ilgili kategoride doludur, diğerlerinde null → App canlı değeri kullanır.
// [EN] Built once per scenario; each field is set only for its category, otherwise null so App uses the live value.
export const createLabRuntime = ({ categoryKey: category, scenario = {}, appendLog }, { authenticatedFetch } = {}) => {
  const scenarioId = scenario.id;
  const setter = (actionKey) => createSetterAction({ scenarioId, appendLog, actionKey });
  const activeEscrows = ESCROW_CATEGORIES.has(category) ? (scenario.activeEscrows || []) : null;
  const decisionTrade = scenario.decisionInput?.trade;
  let labFetch = authenticatedFetch;
  if (category === 'admin') labFetch = createMockAdminFetch(scenario);
  if (category === 'tradeRoom') labFetch = createTradeRoomFetch({ trade: decisionTrade, estimate: estimateBleeding, fallbackFetch: authenticatedFetch });

  return {
    category,
    setter,
    // [TR] Kontrat çağrıları lab'da günlüğe yazılır. [EN] Contract calls are logged instead of sent.
    noop: (actionKey) => (...args) => setter(actionKey)(...args),
    authenticatedFetch: labFetch,
    forceSignedIn: category === 'admin',
    activeEscrows,
    activeEscrowCounts: category === 'activeTrades' || category === 'operations'
      ? (scenario.activeEscrowCounts || countEscrows(activeEscrows))
      : null,
    // [TR] İzleyici adresi senaryodan gelir; yoksa "yanıtınız bekleniyor" şeritleri oluşmaz.
    viewerAddress: category === 'tradeRoom' ? scenario.viewerAddress : activeEscrows ? scenario.address : null,
    admin: category === 'admin' ? {
      key: `lab-${scenarioId}`,
      initialTab: scenario.initialTab,
      readProtocolConfig: createMockProtocolConfigReader(scenario),
      tokenSymbols: labTokenSymbols,
    } : null,
    operationsSetters: category === 'operations'
      ? Object.fromEntries(Object.entries(OPERATIONS_SETTERS).map(([name, key]) => [name, setter(key)]))
      : null,
    profile: category === 'profile' ? {
      ...scenario,
      userReputation: scenario.build?.() || null,
      labRewards: scenario.labRewards ? buildLabRewards(scenario.labRewards) : null,
    } : null,
    maker: category === 'makerOrder' ? {
      form: scenario.form || {},
      tokenMap: scenario.tokenMap,
      reputation: scenario.reputation,
      tokenAddresses: LAB_TOKEN_ADDRESSES,
      supportedTokens: { USDT: { address: LAB_TOKEN_ADDRESSES.USDT }, USDC: { address: LAB_TOKEN_ADDRESSES.USDC } },
      bondMap: LAB_BOND_MAP,
      feeConfig: LAB_FEE_CONFIG,
    } : null,
    tradeRoom: category === 'tradeRoom' ? {
      input: scenario.decisionInput || {},
      handlers: createTradeRoomHandlers({ scenarioId, appendLog }),
      settlementFns: createSettlementContractMocks({ scenarioId, appendLog }),
      cancelStatus: scenario.cancelStatus ?? null,
      takerName: 'Ay*** Yıl***',
    } : null,
  };
};

// [TR] İşlem odası görünümü: senaryo girdisi canlı state'in üstüne yazılır; süreler ve eriyen tutar
//      canlı uygulamayla aynı kurallarla (tradeTimeline) zaman damgalarından türetilir.
// [EN] Trade room view: scenario input overrides live state; timers and bleeding use the live rules.
export const deriveLabTradeRoom = (runtime, live) => {
  const input = runtime?.tradeRoom?.input;
  if (!input) return null;
  const trade = input.trade || live.activeTrade;
  const tradeState = input.tradeState || trade?.state || live.resolvedTradeState;
  const userRole = input.userRole || trade?.role || live.userRole;
  const chargebackAccepted = input.chargebackAccepted ?? trade?.chargebackAcked ?? live.chargebackAccepted;
  const timeline = deriveTradeTimeline(trade, { state: tradeState });
  const timers = input.timers || timeline.timers;
  return {
    activeTrade: trade,
    tradeState,
    userRole,
    chargebackAccepted,
    paymentIpfsHash: input.paymentIpfsHash || '',
    timers: input.trade || input.timers ? timers : {},
    bleedingAmounts: estimateBleeding(input.trade || {}),
    decisionInput: {
      trade,
      tradeState,
      userRole,
      chargebackAccepted,
      paymentIpfsHash: input.paymentIpfsHash ?? live.paymentIpfsHash,
      timers,
      isConnected: input.isConnected ?? live.isConnected,
      isAuthenticated: input.isAuthenticated ?? live.isAuthenticated,
      isSupportedChain: input.isSupportedChain ?? live.isSupportedChain,
      isPaused: input.isPaused ?? live.isPaused,
      lang: live.lang,
      canBurnExpired: input.canBurnExpired ?? timeline.flags.canBurn,
      paymentWindowExpired: timeline.flags.paymentWindowExpired,
    },
  };
};

// [TR] Senaryoya girerken App state'ini kategorinin açılış ekranına ayarlar. [EN] Moves App state to the category's entry view.
export const enterScenario = (scenario, set) => {
  const category = scenario.categoryKey || scenario.category;
  if (category === 'tradeRoom') {
    const input = scenario.decisionInput || {};
    set.activeTrade(input.trade || null);
    set.tradeState(input.tradeState || input.trade?.state || 'LOCKED');
    set.userRole(input.userRole || input.trade?.role || 'taker');
    set.chargebackAccepted(Boolean(input.trade?.chargebackAcked ?? true));
    set.currentView('tradeRoom');
  } else if (category === 'activeTrades') {
    set.activeTradesFilter(scenario.initialFilter || 'ALL');
    set.profileContextTab('active');
    set.currentView('profile');
  } else if (category === 'profile') {
    set.profileContextTab(scenario.tab || 'account');
    set.currentView('profile');
  } else if (category === 'operations') {
    set.activeTrade(null);
    set.currentView('operations');
  } else if (category === 'admin') {
    set.currentView('admin');
  }
};
