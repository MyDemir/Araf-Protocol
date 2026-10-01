const ACTIVE_ROOM_STATES = ['CHALLENGED'];
const TERMINAL_PROPOSAL_STATES = ['FINALIZED', 'REJECTED', 'WITHDRAWN', 'EXPIRED'];
const SETTLEMENT_STATE_BY_INDEX = ['NONE', 'PROPOSED', 'REJECTED', 'WITHDRAWN', 'EXPIRED', 'FINALIZED'];

// [TR] Settlement durumunun tek normalize kapısı (kontrat index'i, bigint veya backend string'i).
// [EN] Single normalization gate for settlement state (contract index, bigint or backend string).
export const normalizeSettlementState = (rawState) => {
  if (typeof rawState === 'number') return SETTLEMENT_STATE_BY_INDEX[rawState] || 'UNKNOWN';
  if (typeof rawState === 'bigint') return SETTLEMENT_STATE_BY_INDEX[Number(rawState)] || 'UNKNOWN';
  if (typeof rawState === 'string') return rawState.toUpperCase() || 'NONE';
  return 'NONE';
};

// [TR] Backend hem unix (sn/ms) hem ISO tarih dönebilir. [EN] Backend may send unix (s/ms) or ISO time.
export const toUnixSeconds = (value) => {
  if (!value) return 0;
  if (typeof value === 'bigint') return Number(value);
  if (typeof value === 'number') return value > 1e12 ? Math.floor(value / 1000) : Math.floor(value);
  const asNumber = Number(value);
  if (Number.isFinite(asNumber)) return asNumber > 1e12 ? Math.floor(asNumber / 1000) : Math.floor(asNumber);
  const asDateMs = new Date(value).getTime();
  return Number.isFinite(asDateMs) ? Math.floor(asDateMs / 1000) : 0;
};

export const normalizeAddress = (address) => address?.toLowerCase?.() || null;

export const getSettlementActionContext = ({ activeTrade, userRole, address, nowTs = Math.floor(Date.now() / 1000) }) => {
  const proposal = activeTrade?.settlementProposal || activeTrade?.rawTrade?.settlementProposal || null;
  const proposalState = normalizeSettlementState(proposal?.state);
  const onchainTradeId = activeTrade?.onchainId ?? activeTrade?.rawTrade?.onchainId ?? null;
  const hasOnchainTradeId = onchainTradeId !== null && onchainTradeId !== undefined && onchainTradeId !== '';
  const roomState = activeTrade?.state || 'LOCKED';
  const isActionableRoom = ACTIVE_ROOM_STATES.includes(roomState);
  const makerAddress = normalizeAddress(activeTrade?.makerFull || activeTrade?.rawTrade?.maker_address || null);
  const takerAddress = normalizeAddress(activeTrade?.takerFull || activeTrade?.rawTrade?.taker_address || null);
  const userAddress = normalizeAddress(address);
  const isTradeParty = Boolean(userAddress && (userAddress === makerAddress || userAddress === takerAddress));
  const proposer = normalizeAddress(proposal?.proposer ?? proposal?.proposed_by);
  const isProposer = Boolean(isTradeParty && userAddress && proposer && userAddress === proposer);
  const isCounterparty = Boolean(isTradeParty && userAddress && proposer && userAddress !== proposer);
  const expiresAt = toUnixSeconds(proposal?.expiresAt ?? proposal?.expires_at ?? 0);
  // [TR] Kontrat: teklif `now <= expiresAt` iken canlıdır, `now > expiresAt` iken dolmuştur (sınır saniyesi dahil birebir).
  // [EN] Contract: live while now <= expiresAt, expired once now > expiresAt (boundary second mirrored exactly).
  const isExpired = expiresAt > 0 && nowTs > expiresAt;
  const isProposed = proposalState === 'PROPOSED';
  const isTerminalProposal = TERMINAL_PROPOSAL_STATES.includes(proposalState);

  return {
    proposal,
    proposalState,
    onchainTradeId,
    hasOnchainTradeId,
    roomState,
    isActionableRoom,
    isTradeParty,
    isProposer,
    isCounterparty,
    expiresAt,
    isExpired,
    isProposed,
    isTerminalProposal,
    // [TR] Kontrat yalnız canlı (PROPOSED ve süresi dolmamış) teklif varken yeni teklifi reddeder. Reddedilen, geri
    //      çekilen ya da süresi dolan tekliften sonra taraflar yeniden teklif verebilmeli; aksi halde itiraz erimeyle
    //      yakıma giderken uzlaşma yolu UI'da kapanıyordu.
    // [EN] The contract only blocks a new offer while a live one exists; after a rejected/withdrawn/expired offer the
    //      parties must be able to propose again (the UI used to close the settlement path while funds kept decaying).
    canPropose: Boolean(activeTrade && isActionableRoom && (!proposal || proposalState === 'NONE' || (isTerminalProposal && proposalState !== 'FINALIZED') || (isProposed && isExpired))),
    canAccept: Boolean(activeTrade && isActionableRoom && isProposed && !isExpired && isCounterparty),
    canReject: Boolean(activeTrade && isActionableRoom && isProposed && !isExpired && isCounterparty),
    canWithdraw: Boolean(activeTrade && isActionableRoom && isProposed && !isExpired && isProposer),
    canExpire: Boolean(activeTrade && isActionableRoom && isProposed && isExpired && isTradeParty),
    userRole,
  };
};

export const validateSettlementProposalInput = ({ tradeId, makerShareBps, expiresAt, nowTs = Math.floor(Date.now() / 1000), lang = 'EN' }) => {
  const tradeIdError = validateSettlementTradeId({ tradeId, lang });
  if (tradeIdError) return tradeIdError;
  const share = Number(makerShareBps);
  if (!Number.isInteger(share) || share < 0 || share > 10000) {
    return lang === 'TR' ? 'makerShareBps 0..10000 aralığında olmalı.' : 'makerShareBps must be in range 0..10000.';
  }
  const expiry = Number(expiresAt);
  if (!Number.isInteger(expiry) || expiry <= nowTs) {
    return lang === 'TR' ? 'Geçerli bir settlement bitiş zamanı girin.' : 'Enter a valid settlement expiry.';
  }
  return null;
};

export const validateSettlementTradeId = ({ tradeId, lang = 'EN' }) => {
  if (tradeId === null || tradeId === undefined || tradeId === '') {
    return lang === 'TR' ? 'On-chain trade ID bulunamadı.' : 'Missing on-chain trade ID.';
  }
  try {
    if (BigInt(tradeId) <= 0n) {
      return lang === 'TR' ? 'Geçersiz on-chain trade ID.' : 'Invalid on-chain trade ID.';
    }
  } catch {
    return lang === 'TR' ? 'Geçersiz on-chain trade ID.' : 'Invalid on-chain trade ID.';
  }
  return null;
};

// [TR] Zincirdeki canlı teklif (getSettlementProposal) ile kullanıcının önizlediği teklifi karşılaştırır.
//      Teklif sahibi withdraw + yeniden teklif ile oranı kabulden hemen önce değiştirebilir (K5); bu yüzden
//      PROPOSED değil / süresi dolmuş / id ya da makerShareBps önizlemeden farklıysa tx GÖNDERİLMEZ.
// [EN] Compares the live on-chain proposal with what the user previewed. If it is not PROPOSED, is expired, or
//      the id / makerShareBps differ from the preview, NO tx is sent and the user must re-confirm.
export const normalizeLiveProposal = (raw) => {
  if (!raw || typeof raw !== 'object') return null;
  const pick = (name, index) => (Array.isArray(raw) ? raw[index] : raw[name]);
  try {
    return {
      id: BigInt(pick('id', 0) ?? 0),
      proposer: pick('proposer', 2) || null,
      makerShareBps: Number(pick('makerShareBps', 3)),
      takerShareBps: Number(pick('takerShareBps', 4)),
      expiresAt: Number(pick('expiresAt', 6) ?? 0),
      state: normalizeSettlementState(pick('state', 7)),
    };
  } catch {
    return null;
  }
};

export const checkLiveProposalForAccept = ({ live, expected = null, nowTs }) => {
  const proposal = normalizeLiveProposal(live);
  if (!proposal) return { ok: false, reason: 'UNREADABLE', live: null };
  if (proposal.state !== 'PROPOSED' || proposal.id <= 0n) return { ok: false, reason: 'NOT_PROPOSED', live: proposal };
  // Kontrat: now > expiresAt => dolmuş.
  if (!(proposal.expiresAt > 0) || nowTs > proposal.expiresAt) return { ok: false, reason: 'EXPIRED', live: proposal };
  if (expected) {
    const sameId = expected.id !== null && expected.id !== undefined && expected.id !== '' && BigInt(expected.id) === proposal.id;
    const sameShare = Number(expected.makerShareBps) === proposal.makerShareBps;
    if (!sameId || !sameShare) return { ok: false, reason: 'CHANGED', live: proposal };
  } else {
    return { ok: false, reason: 'CHANGED', live: proposal };
  }
  return { ok: true, reason: null, live: proposal };
};
