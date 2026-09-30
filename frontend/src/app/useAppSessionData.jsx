import React, { useEffect, useMemo, useState } from 'react';
import { deriveTradeTimeline } from './contexts/trade-room/tradeTimeline';
import { shortAddress } from './copy';
import { buildMarketOrdersQuery, MARKET_FILTER_DEFAULTS, matchesMarketFilters } from './contexts/marketplace/marketFilters';
import { mapApiOrderToUi, formatTokenAmount as formatTokenAmountFromRaw, tokenToNumber as rawTokenToDisplayNumber } from './orderUiModel';
import { buildApiUrl } from './apiConfig';
import { WALLET_AGE_MIN_SEC } from './walletAge';

const DEFAULT_TOKEN_DECIMALS = 6;

// [TR] Arka plandaki sekmede yoklama yapılmaz (boşa RPC/backend isteği). [EN] Never poll from a hidden tab.
const whenVisible = (fn) => () => {
  if (typeof document === 'undefined' || !document.hidden) fn();
};

const MY_ITEMS_PAGE_LIMIT = 50;
const MAX_MY_ITEMS_PAGE_FETCHES = 100;

const assertPaginatedPayload = (data, collectionKey, endpointLabel) => {
  const items = data?.[collectionKey];
  const total = Number(data?.total);
  const page = Number(data?.page);
  const limit = Number(data?.limit);

  if (!Array.isArray(items) || !Number.isFinite(total) || !Number.isFinite(page) || !Number.isFinite(limit) || page < 1 || limit < 1) {
    throw new Error(`${endpointLabel} response schema mismatch`);
  }

  return { items, total, page, limit };
};

const fetchAllMyPages = async ({ authenticatedFetch, endpoint, collectionKey, endpointLabel }) => {
  const allItems = [];
  let requestedPage = 1;

  while (requestedPage <= MAX_MY_ITEMS_PAGE_FETCHES) {
    const res = await authenticatedFetch(buildApiUrl(`${endpoint}?page=${requestedPage}&limit=${MY_ITEMS_PAGE_LIMIT}`));
    const data = await res.json();
    const { items, total, page, limit } = assertPaginatedPayload(data, collectionKey, endpointLabel);

    allItems.push(...items);

    const totalPages = Math.ceil(total / limit);
    if (totalPages <= page || allItems.length >= total || items.length === 0) return allItems;

    requestedPage += 1;
  }

  console.warn(`${endpointLabel} pagination stopped after ${MAX_MY_ITEMS_PAGE_FETCHES} pages to avoid an infinite loop.`);
  return allItems;
};

export function mapSettlementProposalFromApi(settlementProposal) {
  if (!settlementProposal || typeof settlementProposal !== 'object') return null;
  if (Object.keys(settlementProposal).length === 0) return null;

  // [TR] Fail-closed: state/id yoksa proposal authoritative kabul edilmez.
  // [EN] Fail-closed: without state/id we do not treat payload as an actionable proposal.
  const state = settlementProposal.state || null;
  if (!state || state === 'NONE') return null;

  const id = settlementProposal.id ?? settlementProposal.proposal_id ?? null;
  if (id === null || id === undefined || id === '') return null;

  const proposer = settlementProposal.proposer || settlementProposal.proposed_by || null;

  return {
    ...settlementProposal,
    id,
    proposalId: id,
    state,
    proposer,
    makerShareBps: settlementProposal.makerShareBps ?? settlementProposal.maker_share_bps ?? null,
    takerShareBps: settlementProposal.takerShareBps ?? settlementProposal.taker_share_bps ?? null,
    expiresAt: settlementProposal.expiresAt ?? settlementProposal.expires_at ?? null,
    finalizedAt: settlementProposal.finalizedAt ?? settlementProposal.finalized_at ?? null,
    makerPayout: settlementProposal.makerPayout ?? settlementProposal.maker_payout ?? null,
    takerPayout: settlementProposal.takerPayout ?? settlementProposal.taker_payout ?? null,
    txHash: settlementProposal.txHash ?? settlementProposal.tx_hash ?? null,
  };
}

export function buildSettlementQuickCounts(activeEscrows = [], connectedAddress = null) {
  const viewer = connectedAddress?.toLowerCase?.() || null;
  return activeEscrows.reduce((acc, escrow) => {
    const proposal = escrow?.rawTrade?.settlementProposal;
    if (!proposal || proposal.state !== 'PROPOSED') return acc;

    acc.PROPOSED += 1;
    // [TR] quick-count action lane sadece normalize proposer varsa hesaplanır.
    // [EN] action-required lane is counted only when normalized proposer exists.
    const proposer = proposal.proposer?.toLowerCase?.() || null;
    if (viewer && proposer && proposer === viewer) {
      acc.WAITING += 1;
    } else if (viewer && proposer && proposer !== viewer) {
      acc.ACTION_REQUIRED += 1;
    }
    return acc;
  }, { PROPOSED: 0, ACTION_REQUIRED: 0, WAITING: 0 });
}

export function mapReputationToSessionView(repData, firstTradeAt = 0n) {
  if (!repData) return null;

  // [TR] Frontend sadece kontrattan mirror edilen V3 authority alanlarını paketler.
  // [EN] Frontend only packages V3 authority fields mirrored from contract data.
  return {
    successful: Number(repData.successful ?? 0n),
    failed: Number(repData.failed ?? 0n),
    bannedUntil: Number(repData.bannedUntil ?? 0n),
    consecutiveBans: Number(repData.consecutiveBans ?? 0n),
    effectiveTier: Number(repData.effectiveTier ?? 0n),
    firstSuccessfulTradeAt: Number(firstTradeAt ?? 0n),
    authorityCounters: {
      manualReleaseCount: Number(repData.manualReleaseCount ?? 0n),
      autoReleaseCount: Number(repData.autoReleaseCount ?? 0n),
      mutualCancelCount: Number(repData.mutualCancelCount ?? 0n),
      disputedResolvedCount: Number(repData.disputedResolvedCount ?? 0n),
      burnCount: Number(repData.burnCount ?? 0n),
      disputeWinCount: Number(repData.disputeWinCount ?? 0n),
      disputeLossCount: Number(repData.disputeLossCount ?? 0n),
      partialSettlementCount: Number(repData.partialSettlementCount ?? 0n),
      riskPoints: Number(repData.riskPoints ?? 0n),
      lastPositiveEventAt: Number(repData.lastPositiveEventAt ?? 0n),
      lastNegativeEventAt: Number(repData.lastNegativeEventAt ?? 0n),
    },
  };
}

export function mapResolutionTypeLabel(resolutionType, lang = "EN") {
  const labels = {
    PARTIAL_SETTLEMENT: {
      EN: "Closed by agreed partial settlement",
      TR: "Uzlaşmalı kısmi ödemeyle kapandı",
    },
    MANUAL_RELEASE: {
      EN: "Closed by manual release",
      TR: "Manuel onayla kapandı",
    },
    AUTO_RELEASE: {
      EN: "Closed by auto-release",
      TR: "Otomatik serbest bırakma ile kapandı",
    },
    MUTUAL_CANCEL: {
      EN: "Closed by mutual cancel",
      TR: "Karşılıklı iptal ile kapandı",
    },
    BURNED: {
      EN: "Closed by burn",
      TR: "Yakım ile kapandı",
    },
    DISPUTED_RESOLUTION: {
      EN: "Released after a dispute",
      TR: "İtiraz sonrası serbest bırakıldı",
    },
    PAYMENT_WINDOW_EXPIRED: {
      EN: "Unlocked: payment not reported in 48h",
      TR: "Kilit çözüldü: 48 saatte ödeme bildirilmedi",
    },
    UNKNOWN: {
      EN: "Closed; outcome type unavailable",
      TR: "Kapandı; sonuç tipi bilinmiyor",
    },
  };
  const key = labels[resolutionType] ? resolutionType : "UNKNOWN";
  return labels[key][lang === "TR" ? "TR" : "EN"];
}

export function useAppSessionData({
  address,
  isConnected,
  connector,
  chainId,
  publicClient,
  currentView,
  lang,
  isContractLoading,
  connectedWallet,
  setShowMakerModal,
  setCurrentView,
  showToast,
  getTakerFeeBps,
  getTokenDecimals,
  getCurrentAmounts,
  getWalletRegisteredAt,
  getReputation,
  getFirstSuccessfulTradeAt,
  antiSybilCheck,
  getCooldownRemaining,
  getPaused,
  SUPPORTED_TOKEN_ADDRESSES,
  marketFilters = MARKET_FILTER_DEFAULTS,
  devScenarioActive = false,
}) {
  const [tradeState, setTradeState] = useState('LOCKED');
  const [userRole, setUserRole] = useState('taker');
  const [isBanned, setIsBanned] = useState(false);
  const [cancelStatus, setCancelStatus] = useState(null);
  const [chargebackAccepted, setChargebackAccepted] = useState(false);

  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [authChecked, setAuthChecked] = useState(false);
  const [authenticatedWallet, setAuthenticatedWallet] = useState(null);
  const [isWalletRegistered, setIsWalletRegistered] = useState(null);
  const [isRegisteringWallet, setIsRegisteringWallet] = useState(false);
  const [isLoggingIn, setIsLoggingIn] = useState(false);

  const [userReputation, setUserReputation] = useState(null);
  const [payoutProfileDraft, setPayoutProfileDraft] = useState({
    rail: 'TR_IBAN',
    country: 'TR',
    contact: { channel: null, value: null },
    fields: {
      account_holder_name: '',
      iban: null,
      routing_number: null,
      account_number: null,
      account_type: null,
      bic: null,
      bank_name: null,
    },
  });

  const [tradeHistory, setTradeHistory] = useState([]);
  const [historyLoading, setHistoryLoading] = useState(true);
  const [tradeHistoryPage, setTradeHistoryPage] = useState(1);
  const [tradeHistoryTotal, setTradeHistoryTotal] = useState(0);
  const [tradeHistoryLimit, setTradeHistoryLimit] = useState(10);

  const [activeTrade, setActiveTrade] = useState(null);
  const resolvedTradeState = activeTrade?.state || tradeState;
  const [paymentIpfsHash, setPaymentIpfsHash] = useState('');

  const [sybilStatus, setSybilStatus] = useState(null);
  const [walletAgeRemainingDays, setWalletAgeRemainingDays] = useState(null);
  const [takerName, setTakerName] = useState('');
  const [isPaused, setIsPaused] = useState(false);

  const [protocolStats, setProtocolStats] = useState(null);
  const [statsLoading, setStatsLoading] = useState(true);
  const [statsError, setStatsError] = useState(false);

  const [onchainBondMap, setOnchainBondMap] = useState(null);
  const [onchainTokenMap, setOnchainTokenMap] = useState({});
  const [paymentRiskConfig, setPaymentRiskConfig] = useState({});
  const [takerFeeBps, setTakerFeeBps] = useState(15);
  // [TR] Kontrat getFeeConfig aynası (backend /orders/config): emir önizlemesinde ücret gösterimi için.
  const [protocolFeeConfig, setProtocolFeeConfig] = useState(null);
  // [TR] Kontrat itibar politikası (tier eşikleri, temiz sayfa süresi); getter olmadığından backend event aynası.
  const [reputationPolicy, setReputationPolicy] = useState(null);
  const [backendDeployment, setBackendDeployment] = useState(null);
  const [tokenDecimalsMap, setTokenDecimalsMap] = useState({ USDT: DEFAULT_TOKEN_DECIMALS, USDC: DEFAULT_TOKEN_DECIMALS });
  const [bleedingAmounts, setBleedingAmounts] = useState(null);

  const [orders, setOrders] = useState([]);
  // [TR] Sunucudaki eşleşen emir sayısı (ilk sayfa 50 ile sınırlı olduğundan ayrı tutulur). [EN] Server-side match count.
  const [marketOrdersTotal, setMarketOrdersTotal] = useState(null);
  // [TR] Pazar akışı alınamazsa sayaçlar "0" yerine "—" göstermeli; boş pazar ile ulaşılamayan sunucu ayırt edilir.
  // [EN] Distinguish an unreachable feed from an empty market.
  const [ordersFeedError, setOrdersFeedError] = useState(false);
  const [myOrders, setMyOrders] = useState([]);
  const [activeEscrows, setActiveEscrows] = useState([]);
  const [loading, setLoading] = useState(true);

  const authenticatedWalletRef = React.useRef(null);
  const pendingTxCheckedRef = React.useRef(false);
  const autoTradeResumeRef = React.useRef(false);
  const authValidationKeyRef = React.useRef(null);
  const showToastRef = React.useRef(showToast);
  const langRef = React.useRef(lang);
  const sessionToastShownRef = React.useRef(false);

  useEffect(() => {
    showToastRef.current = showToast;
  }, [showToast]);

  useEffect(() => {
    langRef.current = lang;
  }, [lang]);

  const clearLocalSessionState = React.useCallback((options = {}) => {
    const { navigateHome = false, closeModals = true } = options;
    setIsAuthenticated(false);
    setAuthenticatedWallet(null);
    authenticatedWalletRef.current = null;
    if (closeModals) {
      setShowMakerModal(false);
    }
    if (navigateHome) {
      setCurrentView('home');
    }
    setActiveTrade(null);
    setActiveEscrows([]);
    setCancelStatus(null);
    setChargebackAccepted(false);
    setPaymentIpfsHash('');
    setIsLoggingIn(false);
    pendingTxCheckedRef.current = false;
    autoTradeResumeRef.current = false;
    if (typeof window !== 'undefined') {
      localStorage.removeItem('araf_pending_tx');
    }
  }, [setCurrentView, setShowMakerModal]);

  const bestEffortBackendLogout = React.useCallback(async () => {
    try {
      await fetch(buildApiUrl('auth/logout'), {
        method: 'POST',
        credentials: 'include',
      });
    } catch (_) {}
  }, []);

  const authenticatedFetch = React.useCallback(async (url, options = {}) => {
    const {
      skipRefresh = false,
      suppressAuthToast = false,
      ...requestOptions
    } = options || {};
    const walletHeader = connectedWallet ? { 'x-wallet-address': connectedWallet } : {};
    // [TR] FormData (dekont yükleme) için Content-Type tarayıcıya bırakılır; aksi halde multipart
    //      boundary kaybolur. JSON istekleri için varsayılan application/json korunur.
    // [EN] Let the browser set multipart Content-Type for FormData uploads (boundary).
    const isFormData = typeof FormData !== 'undefined' && requestOptions.body instanceof FormData;
    const buildHeaders = () => ({
      ...(isFormData ? {} : { 'Content-Type': 'application/json' }),
      ...requestOptions.headers,
      ...walletHeader,
    });
    const res = await fetch(url, {
      ...requestOptions,
      headers: buildHeaders(),
      credentials: 'include',
    });

    if (res.status === 409) {
      try {
        await fetch(buildApiUrl('auth/logout'), {
          method: 'POST',
          credentials: 'include',
        });
      } catch (_) {}

      clearLocalSessionState({ navigateHome: false, closeModals: true });
      if (!suppressAuthToast && !sessionToastShownRef.current) {
        sessionToastShownRef.current = true;
        showToast(
          lang === 'TR'
            ? 'Oturum cüzdan uyuşmazlığı nedeniyle sonlandırıldı. Lütfen yeniden giriş yapın.'
            : 'Session ended due to wallet mismatch. Please sign in again.',
          'error'
        );
      }
      return res;
    }

    if (res.status !== 401) return res;
    if (skipRefresh) return res;

    try {
      const refreshRes = await fetch(buildApiUrl('auth/refresh'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ wallet: address?.toLowerCase() }),
      });

      if (!refreshRes.ok) {
        clearLocalSessionState({ navigateHome: false, closeModals: true });
        if (!suppressAuthToast && !sessionToastShownRef.current) {
          sessionToastShownRef.current = true;
          showToast(
            lang === 'TR'
              ? 'Oturumunuz sona erdi. Lütfen tekrar imzalayın.'
              : 'Session expired. Please sign in again.',
            'error'
          );
        }
        return res;
      }

      // [TR] Oturum başarıyla yenilendiğinde auth-toast dalgası sıfırlanır.
      // [EN] Reset auth-toast wave only after successful session refresh.
      sessionToastShownRef.current = false;

      return fetch(url, {
        ...requestOptions,
        headers: buildHeaders(),
        credentials: 'include',
      });
    } catch (_) {
      return res;
    }
  }, [connectedWallet, address, clearLocalSessionState, lang, showToast]);

  useEffect(() => {
    // [TR] Dedupe bayrağını yalnız doğrulanmış auth geri geldiğinde sıfırlarız.
    // [EN] Reset dedupe flag only when authenticated state is recovered.
    if (isAuthenticated) {
      sessionToastShownRef.current = false;
    }
  }, [isAuthenticated]);

  const formatAddress = shortAddress;

  const fetchStats = React.useCallback(async () => {
    try {
      setStatsError(false);
      setStatsLoading(true);
      const res = await fetch(buildApiUrl('stats'), { credentials: 'include' });
      const data = await res.json();
      if (data.stats) setProtocolStats(data.stats);
      else setStatsError(true);
    } catch {
      setStatsError(true);
    } finally {
      setStatsLoading(false);
    }
  }, []);

  const fetchMyTrades = React.useCallback(async () => {
    if (devScenarioActive) return;
    if (!isAuthenticated || !isConnected) {
      setActiveEscrows([]);
      return;
    }

    try {
      const trades = await fetchAllMyPages({
        authenticatedFetch,
        endpoint: 'trades/my',
        collectionKey: 'trades',
        endpointLabel: 'trades/my',
      });

      const mappedEscrows = trades.map((t) => {
        const cryptoAmtRaw = t.financials?.crypto_amount || '0';
        const cryptoAsset = t.financials?.crypto_asset || 'USDT';
        const tokenDecimals = tokenDecimalsMap[cryptoAsset] ?? DEFAULT_TOKEN_DECIMALS;
        const cryptoAmtNum = rawTokenToDisplayNumber(cryptoAmtRaw, tokenDecimals);
        const rate = Number(t.financials?.exchange_rate) > 0 ? Number(t.financials.exchange_rate) : null;
        const fiatAmt = rate ? cryptoAmtNum * rate : null;

        return {
          id: `#${t.onchain_escrow_id}`,
          role: t.maker_address.toLowerCase() === address?.toLowerCase() ? 'maker' : 'taker',
          counterparty: formatAddress(
            t.maker_address.toLowerCase() === address?.toLowerCase() ? (t.taker_address || '') : t.maker_address
          ),
          state: t.status,
          paidAt: t.timers?.paid_at,
          lockedAt: t.timers?.locked_at,
          pingedAt: t.timers?.pinged_at,
          challengePingedAt: t.timers?.challenge_pinged_at,
          challengedAt: t.timers?.challenged_at,
          resolutionType: t.resolution_type || null,
          onchainId: t.onchain_escrow_id,
          settlementProposal: mapSettlementProposalFromApi(t.settlement_proposal),
          amount: `${formatTokenAmountFromRaw(cryptoAmtRaw, tokenDecimals)} ${cryptoAsset}`,
          action: t.status === 'PAID' ? (lang === 'TR' ? 'Onay Bekliyor' : 'Pending Approval') : (lang === 'TR' ? 'İşlemde' : 'In Progress'),
          rawTrade: {
            id: t._id,
            onchainId: t.onchain_escrow_id,
            maker: formatAddress(t.maker_address),
            makerFull: t.maker_address,
            takerFull: t.taker_address,
            crypto: cryptoAsset,
            cryptoAmountRaw: cryptoAmtRaw,
            cryptoAmountUi: cryptoAmtNum,
            fiat: t.financials?.fiat_currency || null,
            rate,
            max: fiatAmt,
            tokenDecimals,
            // [TR] Bleeding barı için lock anındaki orijinal teminatlar ve trade'e özgü fee snapshot.
            // [EN] Original lock-time bonds for the bleeding bar and the trade's own fee snapshot.
            makerBondRaw: t.financials?.maker_bond || '0',
            takerBondRaw: t.financials?.taker_bond || '0',
            takerFeeBps: Number.isFinite(Number(t.fee_snapshot?.taker_fee_bps)) ? Number(t.fee_snapshot.taker_fee_bps) : null,
            makerFeeBps: Number.isFinite(Number(t.fee_snapshot?.maker_fee_bps)) ? Number(t.fee_snapshot.maker_fee_bps) : null,
            paidAt: t.timers?.paid_at,
            lockedAt: t.timers?.locked_at,
            pingedAt: t.timers?.pinged_at,
            challengePingedAt: t.timers?.challenge_pinged_at,
            challengedAt: t.timers?.challenged_at,
            resolutionType: t.resolution_type || null,
            cancelProposedBy: t.cancel_proposal?.proposed_by,
            chargebackAcked: t.chargeback_ack?.acknowledged === true,
            settlementProposal: mapSettlementProposalFromApi(t.settlement_proposal),
            // [TR] Trust Visibility Layer payload'ı backend'den read-only gelir; UI explainability için taşınır.
            // [EN] Trust Visibility payload arrives read-only from backend; carried for UI explainability only.
            offchainHealthScoreInput: t.offchain_health_score_input || null,
            bankProfileRisk: t.bank_profile_risk || null,
          },
        };
      });
      setActiveEscrows(mappedEscrows);

      setActiveTrade((prev) => {
        if (!prev) return prev;
        const prevOnchainId = String(prev.onchainId ?? '');
        const updated = trades.find((t) => String(t.onchain_escrow_id ?? '') === prevOnchainId);
        if (!updated) return prev;
        // [TR] Pazar yerinden açılan odada activeTrade yalnız order kartı alanlarını taşır; ham tutar,
        //      teminat, karşı taraf ve fee snapshot backend kaydından birleştirilir.
        // [EN] A room opened from the marketplace only carries order-card fields; merge the trade's
        //      raw amount, bonds, counterparty and fee snapshot from the backend record.
        const mappedRaw = mappedEscrows.find((e) => String(e.onchainId ?? '') === prevOnchainId)?.rawTrade || {};

        const wasPendingSync = prev._pendingBackendSync && !prev.id;
        if (wasPendingSync && updated._id) {
          showToast(lang === 'TR' ? 'İşlem odası hazır!' : 'Trade room ready!', 'success');
        }

        if (updated.status !== prev.state) setTradeState(updated.status);
        setChargebackAccepted(updated.chargeback_ack?.acknowledged === true);

        return {
          ...prev,
          ...mappedRaw,
          id: prev.id || updated._id,
          onchainId: prev.onchainId,
          _pendingBackendSync: false,
          state: updated.status,
          paidAt: updated.timers?.paid_at ?? prev.paidAt,
          lockedAt: updated.timers?.locked_at ?? prev.lockedAt,
          pingedAt: updated.timers?.pinged_at ?? prev.pingedAt,
          challengePingedAt: updated.timers?.challenge_pinged_at ?? prev.challengePingedAt,
          challengedAt: updated.timers?.challenged_at ?? prev.challengedAt,
          resolutionType: updated.resolution_type ?? prev.resolutionType ?? null,
          cancelProposedBy: updated.cancel_proposal?.proposed_by ?? prev.cancelProposedBy,
          chargebackAcked: updated.chargeback_ack?.acknowledged === true,
          settlementProposal: mapSettlementProposalFromApi(updated.settlement_proposal) ?? prev.settlementProposal ?? null,
          offchainHealthScoreInput: updated.offchain_health_score_input ?? prev.offchainHealthScoreInput ?? null,
          bankProfileRisk: updated.bank_profile_risk ?? prev.bankProfileRisk ?? null,
        };
      });
    } catch (err) {
      console.error('Trades fetch error:', err);
    }
  }, [devScenarioActive, isAuthenticated, isConnected, address, lang, authenticatedFetch, tokenDecimalsMap, showToast]);

  // Protocol configuration and read models
  useEffect(() => {
    fetch(buildApiUrl('orders/config'), { credentials: 'include' })
      .then((r) => r.json())
      .then((data) => {
        if (data.bondMap) setOnchainBondMap(data.bondMap);
        if (data.tokenMap) setOnchainTokenMap(data.tokenMap);
        if (data.feeConfig) setProtocolFeeConfig(data.feeConfig);
        if (data.reputationPolicy) setReputationPolicy(data.reputationPolicy);
        if (data.deployment) setBackendDeployment(data.deployment);
        if (data.paymentRiskConfig) setPaymentRiskConfig(data.paymentRiskConfig);
      })
      .catch((err) => console.error('[ProtocolConfig] fetch failed:', err));
  }, []);

  useEffect(() => {
    if (!getTakerFeeBps) return;
    const run = async () => {
      try {
        const fee = await getTakerFeeBps();
        setTakerFeeBps(Number(fee));
      } catch (_) {}
    };
    run();
  }, [getTakerFeeBps]);

  useEffect(() => {
    const loadTokenDecimals = async () => {
      try {
        const [usdtDecimals, usdcDecimals] = await Promise.all([
          SUPPORTED_TOKEN_ADDRESSES.USDT ? getTokenDecimals(SUPPORTED_TOKEN_ADDRESSES.USDT) : DEFAULT_TOKEN_DECIMALS,
          SUPPORTED_TOKEN_ADDRESSES.USDC ? getTokenDecimals(SUPPORTED_TOKEN_ADDRESSES.USDC) : DEFAULT_TOKEN_DECIMALS,
        ]);
        setTokenDecimalsMap({
          USDT: Number.isFinite(usdtDecimals) ? usdtDecimals : DEFAULT_TOKEN_DECIMALS,
          USDC: Number.isFinite(usdcDecimals) ? usdcDecimals : DEFAULT_TOKEN_DECIMALS,
        });
      } catch {
        setTokenDecimalsMap({ USDT: DEFAULT_TOKEN_DECIMALS, USDC: DEFAULT_TOKEN_DECIMALS });
      }
    };
    if (getTokenDecimals) loadTokenDecimals();
  }, [getTokenDecimals, SUPPORTED_TOKEN_ADDRESSES.USDT, SUPPORTED_TOKEN_ADDRESSES.USDC]);

  useEffect(() => {
    if (resolvedTradeState !== 'CHALLENGED' || !activeTrade?.onchainId || !getCurrentAmounts) {
      setBleedingAmounts(null);
      return;
    }
    const fetchAmounts = async () => {
      const result = await getCurrentAmounts(activeTrade.onchainId);
      if (result) setBleedingAmounts(result);
    };
    fetchAmounts();
    const interval = setInterval(whenVisible(fetchAmounts), 30000);
    return () => clearInterval(interval);
  }, [resolvedTradeState, activeTrade?.onchainId, getCurrentAmounts]);

  useEffect(() => {
    if (!isConnected || !connectedWallet) {
      authValidationKeyRef.current = null;
      clearLocalSessionState({ navigateHome: false, closeModals: true });
      setAuthChecked(true);
      return;
    }

    const validationKey = `wallet:${connectedWallet}`;
    if (authValidationKeyRef.current !== validationKey) {
      authValidationKeyRef.current = validationKey;
      setAuthChecked(false);
    }

    let cancelled = false;
    fetch(buildApiUrl('auth/me'), {
      credentials: 'include',
      headers: { 'x-wallet-address': connectedWallet },
    })
      .then(async (res) => {
        if (cancelled) return;
        if (res.status === 409) {
          clearLocalSessionState({ navigateHome: false, closeModals: true });
          setAuthChecked(true);
          showToastRef.current(
            langRef.current === 'TR'
              ? 'Oturum cüzdanınızla eşleşmiyor. Lütfen yeniden giriş yapın.'
              : 'Session does not match your wallet. Please sign in again.',
            'info'
          );
          return;
        }

        if (!res.ok) {
          clearLocalSessionState({ navigateHome: false, closeModals: true });
          setAuthChecked(true);
          return;
        }

        const data = await res.json().catch(() => ({}));
        const sessionWallet = data?.wallet?.toLowerCase?.() || null;

        if (!sessionWallet) {
          await bestEffortBackendLogout();
          if (cancelled) return;
          clearLocalSessionState({ navigateHome: false, closeModals: true });
          setAuthChecked(true);
          return;
        }

        if (sessionWallet !== connectedWallet) {
          await bestEffortBackendLogout();
          if (cancelled) return;
          clearLocalSessionState({ navigateHome: false, closeModals: true });
          showToastRef.current(
            langRef.current === 'TR'
              ? 'Bağlı cüzdan oturumla eşleşmiyor. Lütfen yeniden imzalayın.'
              : 'Connected wallet does not match session. Please sign in again.',
            'info'
          );
          setAuthChecked(true);
          return;
        }

        setIsAuthenticated(true);
        setAuthenticatedWallet(sessionWallet);
        authenticatedWalletRef.current = sessionWallet;
        setAuthChecked(true);
      })
      .catch(() => {
        if (cancelled) return;
        clearLocalSessionState({ navigateHome: false, closeModals: true });
        setAuthChecked(true);
      });
    return () => {
      cancelled = true;
    };
  }, [isConnected, connectedWallet, clearLocalSessionState, bestEffortBackendLogout]);

  // [TR] Tutar araması her tuşta istek atmasın diye 400 ms geciktirilir. [EN] Debounce the amount search.
  const searchAmount = marketFilters.amount;
  const [debouncedSearchAmount, setDebouncedSearchAmount] = useState(searchAmount);
  useEffect(() => {
    const t = setTimeout(() => setDebouncedSearchAmount(searchAmount), 400);
    return () => clearTimeout(t);
  }, [searchAmount]);
  const viewerTier = Number.isInteger(userReputation?.effectiveTier) ? userReputation.effectiveTier : null;
  const marketViewOpen = currentView === 'market';
  const ordersLoadedRef = React.useRef(false);
  const marketOrdersQuery = buildMarketOrdersQuery({
    filters: { ...marketFilters, amount: debouncedSearchAmount },
    tokenAddresses: SUPPORTED_TOKEN_ADDRESSES,
    userTier: viewerTier,
  });

  useEffect(() => {
    const mapOrders = (apiOrders = []) => apiOrders.map((o) => mapApiOrderToUi({
      order: o,
      lang,
      bondMap: onchainBondMap || {},
      tokenMap: onchainTokenMap || {},
      paymentRiskConfig: paymentRiskConfig || {},
      formatAddress,
    }));

    // [TR] Pazar yeri yalnız fill edilebilir (OPEN + PARTIALLY_FILLED) emirleri gösterir ve periyodik
    //      yenilenir. Önceki çağrı filtresizdi (iptal/dolu emirler başta) ve yalnız bir kez çalışıyordu.
    // [EN] Marketplace shows only fillable orders and refreshes periodically.
    let initialLoad = true;
    const fetchOrders = async () => {
      try {
        if (initialLoad) setLoading(true);
        const res = await fetch(buildApiUrl(marketOrdersQuery), { credentials: 'include' });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const data = await res.json();
        if (!Array.isArray(data.orders)) throw new Error('Malformed orders payload');
        setOrders(mapOrders(data.orders));
        setMarketOrdersTotal(Number.isFinite(data.total) ? data.total : null);
        setOrdersFeedError(false);
        ordersLoadedRef.current = true;
      } catch (err) {
        console.error('Order fetch error:', err);
        setOrdersFeedError(true);
      } finally {
        if (initialLoad) setLoading(false);
        initialLoad = false;
      }
    };
    // [TR] Pazardan çıkarken tekrar çekilmez; yalnız ilk yüklemede ya da Pazar açıkken. [EN] No refetch on leaving Market.
    if (marketViewOpen || !ordersLoadedRef.current) fetchOrders();
    // [TR] Liste yalnız Pazar ekranı açıkken yenilenir; diğer ekranlarda ilk yükleme yeterlidir.
    // [EN] Refresh only while the Market view is open; other views keep the initial load.
    if (!marketViewOpen) return undefined;
    const interval = setInterval(whenVisible(fetchOrders), 30000);
    return () => clearInterval(interval);
  }, [lang, onchainBondMap, onchainTokenMap, paymentRiskConfig, marketOrdersQuery, marketViewOpen]);

  useEffect(() => {
    if (!isAuthenticated || !isConnected) {
      setMyOrders([]);
      return;
    }

    const fetchMyOrders = async () => {
      try {
        const myOrdersPayload = await fetchAllMyPages({
          authenticatedFetch,
          endpoint: 'orders/my',
          collectionKey: 'orders',
          endpointLabel: 'orders/my',
        });
        setMyOrders(myOrdersPayload.map((o) => mapApiOrderToUi({
          order: o,
          lang,
          bondMap: onchainBondMap || {},
          tokenMap: onchainTokenMap || {},
          paymentRiskConfig: paymentRiskConfig || {},
          formatAddress,
        })));
      } catch (err) {
        console.error('My orders fetch error:', err);
      }
    };

    fetchMyOrders();
  }, [isAuthenticated, isConnected, authenticatedFetch, lang, onchainBondMap, onchainTokenMap, paymentRiskConfig]);

  useEffect(() => { fetchStats(); }, [fetchStats]);

  useEffect(() => {
    if (!isConnected || !address || !getWalletRegisteredAt) {
      setIsWalletRegistered(null);
      setWalletAgeRemainingDays(null);
      return;
    }
    const checkRegistration = async () => {
      try {
        const regAt = await getWalletRegisteredAt(address);
        setIsWalletRegistered(regAt > 0n);
        if (regAt > 0n) {
          const nowSec = Math.floor(Date.now() / 1000);
          const remainingSec = Math.max(0, Number(regAt) + WALLET_AGE_MIN_SEC - nowSec);
          setWalletAgeRemainingDays(Math.ceil(remainingSec / (24 * 3600)));
        } else {
          setWalletAgeRemainingDays(null);
        }
      } catch {
        setIsWalletRegistered(null);
        setWalletAgeRemainingDays(null);
      }
    };
    checkRegistration();
  }, [isConnected, address, getWalletRegisteredAt]);

  useEffect(() => {
    if (!isConnected || !address || !getReputation) {
      setUserReputation(null);
      return;
    }
    const fetchUserReputation = async () => {
      try {
        const repData = await getReputation(address);
        if (!repData) {
          setUserReputation(null);
          setIsBanned(false);
          return;
        }
        const firstTradeAt = getFirstSuccessfulTradeAt ? await getFirstSuccessfulTradeAt(address) : 0n;
        const mappedReputation = mapReputationToSessionView(repData, firstTradeAt);
        setUserReputation(mappedReputation);
        setIsBanned((mappedReputation?.bannedUntil ?? 0) > Date.now() / 1000);
      } catch (err) {
        console.error('Kullanıcı itibar verisi çekilemedi:', err);
      }
    };
    fetchUserReputation();
  }, [isConnected, address, getReputation, getFirstSuccessfulTradeAt]);

  useEffect(() => {
    if (!isConnected || !address || !antiSybilCheck) return;
    const fetchSybil = async () => {
      const res = await antiSybilCheck(address);
      if (res) {
        const cooldownOk = typeof res.cooldownOk !== 'undefined' ? res.cooldownOk : res[2];
        const remaining = (!cooldownOk && getCooldownRemaining) ? await getCooldownRemaining(address) : 0n;
        setSybilStatus({
          aged: typeof res.aged !== 'undefined' ? res.aged : res[0],
          funded: typeof res.balanceOk !== 'undefined' ? res.balanceOk : (typeof res.funded !== 'undefined' ? res.funded : res[1]),
          cooldownOk,
          cooldownRemaining: Number(remaining),
        });
      }
    };
    fetchSybil();
    const interval = setInterval(whenVisible(fetchSybil), 60000);
    return () => clearInterval(interval);
  }, [isConnected, address, antiSybilCheck, getCooldownRemaining]);

  useEffect(() => {
    if (!getPaused) return;
    const fetchPausedStatus = async () => {
      try {
        const paused = await getPaused();
        setIsPaused(paused);
      } catch (err) {
        console.error('Paused durumu çekilemedi:', err);
      }
    };
    fetchPausedStatus();
    const interval = setInterval(whenVisible(fetchPausedStatus), 120000);
    return () => clearInterval(interval);
  }, [getPaused]);

  useEffect(() => {
    if (!devScenarioActive && currentView === 'tradeRoom' && ['LOCKED', 'PAID', 'CHALLENGED'].includes(resolvedTradeState) && userRole === 'maker' && activeTrade?.id && isAuthenticated) {
      authenticatedFetch(buildApiUrl(`pii/taker-name/${activeTrade.onchainId}`))
        .then((res) => res.json())
        .then((data) => { if (data.bankOwner) setTakerName(data.bankOwner); })
        .catch((err) => console.error('Taker name fetch error', err));
    }
  }, [devScenarioActive, currentView, resolvedTradeState, userRole, activeTrade?.onchainId, activeTrade?.id, isAuthenticated, authenticatedFetch]);

  useEffect(() => {
    if (activeTrade?.state && activeTrade.state !== tradeState) {
      setTradeState(activeTrade.state);
    }
  }, [activeTrade?.state, tradeState]);

  useEffect(() => {
    if (!activeTrade?.onchainId || !activeEscrows.length) return;
    const currentTrade = activeEscrows.find((e) => e.onchainId === activeTrade.onchainId);
    if (currentTrade?.rawTrade?.cancelProposedBy) {
      const isMyProposal = currentTrade.rawTrade.cancelProposedBy.toLowerCase() === address?.toLowerCase();
      setCancelStatus(isMyProposal ? 'proposed_by_me' : 'proposed_by_other');
    } else {
      setCancelStatus((prev) => prev ? null : prev);
    }
  }, [activeTrade?.onchainId, activeEscrows, address]);

  useEffect(() => { fetchMyTrades(); }, [fetchMyTrades]);

  useEffect(() => {
    if (currentView !== 'tradeRoom' || !isAuthenticated || isContractLoading || document.hidden) return;
    const interval = setInterval(fetchMyTrades, 15000);
    return () => clearInterval(interval);
  }, [currentView, isAuthenticated, isContractLoading, fetchMyTrades]);

  useEffect(() => {
    if (!isAuthenticated) return;
    const onVisibilityChange = () => {
      if (!document.hidden && currentView === 'tradeRoom') fetchMyTrades();
    };
    document.addEventListener('visibilitychange', onVisibilityChange);
    return () => document.removeEventListener('visibilitychange', onVisibilityChange);
  }, [isAuthenticated, currentView, fetchMyTrades]);

  // [TR] Ödeme profili ve geçmiş, tek profil yüzeyi olan Profil Merkezi sayfasında yüklenir.
  // [EN] Payout profile and history load on the Profile Center page (the only profile surface).
  const wantsPayoutProfile = currentView === 'profile';
  const wantsTradeHistory = currentView === 'profile';

  useEffect(() => {
    if (!wantsPayoutProfile || !isAuthenticated) return;
    const fetchMyPII = async () => {
      try {
        const res = await authenticatedFetch(buildApiUrl('pii/my'));
        if (!res.ok) return;
        const data = await res.json();
        if (data.pii) {
          setPayoutProfileDraft({
            rail: data.pii.rail || 'TR_IBAN',
            country: data.pii.country || 'TR',
            contact: {
              channel: data.pii?.contact?.channel || null,
              value: data.pii?.contact?.value || null,
            },
            fields: {
              account_holder_name: data.pii?.fields?.account_holder_name || '',
              iban: data.pii?.fields?.iban || null,
              routing_number: data.pii?.fields?.routing_number || null,
              account_number: data.pii?.fields?.account_number || null,
              account_type: data.pii?.fields?.account_type || null,
              bic: data.pii?.fields?.bic || null,
              bank_name: data.pii?.fields?.bank_name || null,
            },
          });
        }
      } catch (err) {
        console.error('Mevcut PII verisi çekilemedi:', err);
      }
    };
    fetchMyPII();
  }, [wantsPayoutProfile, isAuthenticated, authenticatedFetch]);

  useEffect(() => {
    if (!wantsTradeHistory || !isAuthenticated) return;
    const fetchHistory = async (page) => {
      try {
        setHistoryLoading(true);
        const res = await authenticatedFetch(buildApiUrl(`trades/history?page=${page}&limit=5`));
        if (!res.ok) throw new Error('History fetch failed');
        const data = await res.json();
        if (data.trades) {
          setTradeHistory(
            data.trades.map((trade) => ({
              ...trade,
              resolutionType: trade?.resolution_type || null,
            }))
          );
          setTradeHistoryTotal(data.total);
          setTradeHistoryPage(data.page);
          setTradeHistoryLimit(data.limit);
        }
      } catch (err) {
        console.error('İşlem geçmişi çekilemedi:', err);
        setTradeHistory([]);
        setTradeHistoryTotal(0);
      } finally {
        setHistoryLoading(false);
      }
    };
    fetchHistory(tradeHistoryPage);
  }, [wantsTradeHistory, isAuthenticated, tradeHistoryPage, authenticatedFetch]);

  useEffect(() => {
    if (!isConnected) clearLocalSessionState({ navigateHome: true, closeModals: true });
  }, [isConnected, clearLocalSessionState]);

  useEffect(() => {
    if (!publicClient || !isConnected) return;
    if (pendingTxCheckedRef.current) return;
    pendingTxCheckedRef.current = true;
    const raw = localStorage.getItem('araf_pending_tx');
    if (!raw) return;

    let parsed = null;
    try {
      parsed = JSON.parse(raw);
    } catch {
      localStorage.removeItem('araf_pending_tx');
      return;
    }

    if (!parsed?.hash) {
      localStorage.removeItem('araf_pending_tx');
      return;
    }
    const isValidHash = /^0x[a-fA-F0-9]{64}$/.test(parsed.hash);
    if (!isValidHash) {
      localStorage.removeItem('araf_pending_tx');
      return;
    }
    if (parsed.createdAt && (Date.now() - Number(parsed.createdAt) > 24 * 3600 * 1000)) {
      localStorage.removeItem('araf_pending_tx');
      return;
    }
    if (parsed.chainId && Number(parsed.chainId) !== Number(chainId)) return;

    publicClient.getTransactionReceipt({ hash: parsed.hash })
      .then(() => {
        localStorage.removeItem('araf_pending_tx');
        fetchMyTrades();
        showToast(
          lang === 'TR'
            ? 'Bekleyen işlem bulundu ve onaylandı. Veriler yenilendi.'
            : 'Recovered pending transaction and confirmed it. Data refreshed.',
          'success'
        );
      })
      .catch(() => {});
  }, [publicClient, isConnected, fetchMyTrades, chainId, lang, showToast]);

  useEffect(() => {
    if (!isAuthenticated) {
      autoTradeResumeRef.current = false;
      return;
    }
    if (autoTradeResumeRef.current || currentView !== 'home' || activeEscrows.length !== 1) return;

    const escrow = activeEscrows[0];
    autoTradeResumeRef.current = true;
    setActiveTrade({ ...escrow.rawTrade, onchainId: escrow.onchainId, state: escrow.state });
    setTradeState(escrow.state);
    setUserRole(escrow.role);
    setChargebackAccepted(escrow.rawTrade?.chargebackAcked === true);
    setCurrentView('tradeRoom');
    showToast(
      lang === 'TR' ? 'Aktif işleminize otomatik geri dönüldü.' : 'Automatically returned to your active trade.',
      'info'
    );
  }, [isAuthenticated, currentView, activeEscrows, lang, showToast, setCurrentView]);

  useEffect(() => {
    if (!isConnected || !connectedWallet || !isAuthenticated || !authenticatedWallet) return;
    if (authenticatedWallet !== connectedWallet) {
      bestEffortBackendLogout();
      clearLocalSessionState({ navigateHome: false, closeModals: true });
      showToast(
        lang === 'TR'
          ? 'Cüzdan değişikliği algılandı. Güvenlik için yeniden giriş yapmanız gerekiyor.'
          : 'Wallet change detected. For security, please sign in again.',
        'info'
      );
    }
  }, [isConnected, connectedWallet, isAuthenticated, authenticatedWallet, lang, bestEffortBackendLogout, clearLocalSessionState, showToast]);

  useEffect(() => {
    if (!connector?.getProvider) return undefined;
    let provider = null;
    const handleWalletRuntimeEvent = () => {
      if (!isAuthenticated || !authenticatedWallet) return;
      const runtimeWallet = provider?.selectedAddress?.toLowerCase?.() || connectedWallet;
      if (runtimeWallet && runtimeWallet !== authenticatedWallet) {
        bestEffortBackendLogout();
        clearLocalSessionState({ navigateHome: false, closeModals: true });
        showToast(
          lang === 'TR'
            ? 'Wallet oturumu değişti. Güvenlik için tekrar imza gerekli.'
            : 'Wallet session changed. Re-sign is required for security.',
          'info'
        );
      }
    };

    const bind = async () => {
      provider = await connector.getProvider();
      if (!provider?.on) return;
      provider.on('accountsChanged', handleWalletRuntimeEvent);
      provider.on('disconnect', handleWalletRuntimeEvent);
      provider.on('chainChanged', handleWalletRuntimeEvent);
    };
    bind().catch(() => {});

    return () => {
      if (!provider?.removeListener) return;
      provider.removeListener('accountsChanged', handleWalletRuntimeEvent);
      provider.removeListener('disconnect', handleWalletRuntimeEvent);
      provider.removeListener('chainChanged', handleWalletRuntimeEvent);
    };
  }, [connector, connectedWallet, isAuthenticated, authenticatedWallet, lang, bestEffortBackendLogout, clearLocalSessionState, showToast]);

  const filteredOrders = orders.filter((order) => matchesMarketFilters(order, marketFilters, { viewerAddress: connectedWallet, userTier: viewerTier }));

  const activeEscrowCounts = {
    LOCKED: activeEscrows.filter((e) => e.state === 'LOCKED').length,
    PAID: activeEscrows.filter((e) => e.state === 'PAID').length,
    CHALLENGED: activeEscrows.filter((e) => e.state === 'CHALLENGED').length,
    settlement: buildSettlementQuickCounts(activeEscrows, address),
  };

  // [TR] İşlem odası sayaçları tek saatten, kontrat kurallarının aynası tradeTimeline ile türetilir.
  //      Önceden 6 ayrı useCountdown (6 ayrı 1 sn interval) tüm App'i her saniye 6 kez render ediyordu;
  //      şimdi tek interval, yalnız işlem odası açıkken ve sekme görünürken çalışır.
  // [EN] Trade room timers derive from one clock via tradeTimeline (the contract-rule mirror): one interval,
  //      only while the trade room is open and the tab is visible (was six 1s intervals re-rendering App).
  const [clockMs, setClockMs] = useState(() => Date.now());
  // [TR] Süre kararları cihaz saatine değil zincir saatine göre verilir: cihaz saati geri kalan taker'ın uyarı butonu
  //      geç açılırsa maker ping yolunu önce açıp otomatik serbest bırakma hakkını kapatabilirdi. İşlem odası her
  //      açıldığında tek bir getBlock ile fark ölçülür (ek yük yok); okunamazsa cihaz saati kullanılır.
  // [EN] Timing decisions follow chain time, not the device clock (a lagging clock could cost the taker the
  //      auto-release path). One getBlock per trade-room open measures the offset; falls back to the device clock.
  const [chainOffsetMs, setChainOffsetMs] = useState(0);
  const tradeRoomOpen = currentView === 'tradeRoom' && Boolean(activeTrade);
  useEffect(() => {
    if (!tradeRoomOpen || !publicClient?.getBlock) return undefined;
    let alive = true;
    publicClient.getBlock()
      .then((block) => {
        const blockMs = Number(block?.timestamp) * 1000;
        if (alive && Number.isFinite(blockMs) && blockMs > 0) setChainOffsetMs(blockMs - Date.now());
      })
      .catch(() => {});
    return () => { alive = false; };
  }, [tradeRoomOpen, publicClient]);
  useEffect(() => {
    if (!tradeRoomOpen) return undefined;
    setClockMs(Date.now() + chainOffsetMs);
    const interval = setInterval(whenVisible(() => setClockMs(Date.now() + chainOffsetMs)), 1000);
    return () => clearInterval(interval);
  }, [tradeRoomOpen, chainOffsetMs]);
  // [TR] Odaya yeniden girişte ilk render'da saat eski kalmasın. [EN] Never decide on a stale tick after re-entering the room.
  const freshNowMs = Date.now() + chainOffsetMs;
  const chainNowMs = Math.abs(clockMs - freshNowMs) > 1500 ? freshNowMs : clockMs;
  const tradeTimers = useMemo(
    () => deriveTradeTimeline(activeTrade, { state: resolvedTradeState, now: chainNowMs }).timers,
    [activeTrade, resolvedTradeState, chainNowMs],
  );
  // [TR] Zaman damgası bilinmiyorsa (eski veri) buton kilidi kontrata bırakılır. [EN] Unknown timestamp → let the contract decide.
  const canMakerStartChallengeFlow = tradeTimers.makerChallengePing ? tradeTimers.makerChallengePing.isFinished : true;
  const canMakerChallenge = tradeTimers.makerChallenge ? tradeTimers.makerChallenge.isFinished : true;

  return {
    isAuthenticated,
    setIsAuthenticated,
    authChecked,
    authenticatedWallet,
    setAuthenticatedWallet,
    isWalletRegistered,
    setIsWalletRegistered,
    isRegisteringWallet,
    setIsRegisteringWallet,
    isLoggingIn,
    setIsLoggingIn,
    userReputation,
    payoutProfileDraft,
    setPayoutProfileDraft,
    tradeHistory,
    historyLoading,
    tradeHistoryPage,
    setTradeHistoryPage,
    tradeHistoryTotal,
    tradeHistoryLimit,
    activeTrade,
    setActiveTrade,
    resolvedTradeState,
    paymentIpfsHash,
    setPaymentIpfsHash,
    sybilStatus,
    walletAgeRemainingDays,
    takerName,
    isPaused,
    protocolStats,
    statsLoading,
    statsError,
    onchainBondMap,
    onchainTokenMap,
    protocolFeeConfig,
    reputationPolicy,
    backendDeployment,
    paymentRiskConfig,
    takerFeeBps,
    tokenDecimalsMap,
    bleedingAmounts,
    orders,
    ordersFeedError,
    myOrders,
    setMyOrders,
    setOrders,
    activeEscrows,
    setActiveEscrows,
    loading,
    setLoading,
    clearLocalSessionState,
    bestEffortBackendLogout,
    authenticatedFetch,
    fetchStats,
    fetchMyTrades,
    tradeState,
    setTradeState,
    userRole,
    setUserRole,
    isBanned,
    setIsBanned,
    cancelStatus,
    setCancelStatus,
    chargebackAccepted,
    setChargebackAccepted,
    formatAddress,
    filteredOrders,
    marketOrdersTotal,
    activeEscrowCounts,
    tradeTimers,
    chainNowMs,
    chainOffsetMs,
    canMakerStartChallengeFlow,
    canMakerChallenge,
  };
}
