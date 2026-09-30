/**
 * Frontend UI model/adapter helpers for order rendering & view actions.
 * NOTE: This is NOT the backend DB model (see backend/scripts/models/Order.js).
 */

import { formatUnits } from 'viem';
import { orderSide as orderSideCopy } from './copy';

const DEFAULT_TOKEN_DECIMALS = 6;
const VALID_ORDER_SIDES = new Set(['SELL_CRYPTO', 'BUY_CRYPTO']);
const SEPA_COUNTRIES = new Set(['DE', 'FR', 'NL', 'BE', 'ES', 'IT', 'AT', 'PT', 'IE', 'LU', 'FI', 'GR']);

export const getOrderSideCopy = (side, variant = 'display', lang = 'TR') => {
  const suffixByVariant = {
    display: '',
    action: '_ACTION',
    order: '_ORDER',
  };
  const suffix = suffixByVariant[variant] ?? '';
  const row = orderSideCopy?.[`${side}${suffix}`];
  if (!row) return null;
  return row[lang === 'TR' ? 'TR' : 'EN'] || row.EN || row.TR || null;
};

export const SIDE_META = {
  SELL_CRYPTO: {
    sideLabel: { TR: getOrderSideCopy('SELL_CRYPTO', 'order', 'TR'), EN: getOrderSideCopy('SELL_CRYPTO', 'order', 'EN') },
    ctaLabel: { TR: getOrderSideCopy('SELL_CRYPTO', 'action', 'TR'), EN: getOrderSideCopy('SELL_CRYPTO', 'action', 'EN') },
    displayLabel: { TR: getOrderSideCopy('SELL_CRYPTO', 'display', 'TR'), EN: getOrderSideCopy('SELL_CRYPTO', 'display', 'EN') },
  },
  BUY_CRYPTO: {
    sideLabel: { TR: getOrderSideCopy('BUY_CRYPTO', 'order', 'TR'), EN: getOrderSideCopy('BUY_CRYPTO', 'order', 'EN') },
    ctaLabel: { TR: getOrderSideCopy('BUY_CRYPTO', 'action', 'TR'), EN: getOrderSideCopy('BUY_CRYPTO', 'action', 'EN') },
    displayLabel: { TR: getOrderSideCopy('BUY_CRYPTO', 'display', 'TR'), EN: getOrderSideCopy('BUY_CRYPTO', 'display', 'EN') },
  },
};

export const STATUS_META = {
  OPEN: { TR: 'Açık', EN: 'Open' },
  PARTIALLY_FILLED: { TR: 'Kısmi Dolu', EN: 'Partially Filled' },
  FILLED: { TR: 'Dolu', EN: 'Filled' },
  CANCELED: { TR: 'İptal', EN: 'Canceled' },
  UNKNOWN: { TR: 'Bilinmiyor', EN: 'Unknown' },
};

export const normalizeOrderSide = (side) => {
  if (VALID_ORDER_SIDES.has(side)) return side;
  return 'UNKNOWN';
};

export const assertOrderSide = (side) => {
  const normalized = normalizeOrderSide(side);
  if (normalized === 'UNKNOWN') {
    throw new Error(`Invalid order side: ${String(side ?? 'undefined')}`);
  }
  return normalized;
};

export const resolveOrderActionFns = (side, fns) => {
  const validSide = assertOrderSide(side);

  if (validSide === 'BUY_CRYPTO') {
    return {
      createFn: fns.createBuyOrder,
      cancelFn: fns.cancelBuyOrder,
      fillFn: fns.fillBuyOrder,
    };
  }

  return {
    createFn: fns.createSellOrder,
    cancelFn: fns.cancelSellOrder,
    fillFn: fns.fillSellOrder,
  };
};

// [TR] Ham taban birim → token birimi; uygulamadaki tek dönüştürücü (UI/analitik, enforcement değil).
// [EN] Raw base units → token units; the app's single converter (UI/analytics only, never enforcement).
const validDecimals = (decimals) => Number.isInteger(decimals) && decimals >= 0 && decimals <= 36;

export const tokenToNumber = (raw, decimals = DEFAULT_TOKEN_DECIMALS) => {
  if (!validDecimals(decimals)) return 0;
  try {
    return Number(formatUnits(BigInt(raw ?? 0), decimals));
  } catch {
    return 0;
  }
};

export const formatTokenAmount = (raw, decimals = DEFAULT_TOKEN_DECIMALS, maxFractionDigits = 4) => {
  if (!validDecimals(decimals)) return '—';
  try {
    return Number(formatUnits(BigInt(raw ?? 0), decimals)).toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: maxFractionDigits });
  } catch {
    return '—';
  }
};

// [TR] ArafEscrow._getMakerBondBps / _getTakerBondBps aynası: tier tabanı + itibar ayarı.
//      Tier 0 her zaman 0; riskPoints == 0 ve en az 1 başarılı işlem → −100 bps; riskPoints > 0 → +300 bps.
// [EN] Mirror of the contract bond rule: tier base + reputation adjustment.
const FALLBACK_BOND_PCT = { maker: [0, 8, 6, 5, 2], taker: [0, 10, 8, 5, 2] };
export const resolveEffectiveBondBps = ({ side, tier, bondMap = null, reputation = null }) => {
  const key = side === 'BUY_CRYPTO' ? 'taker' : 'maker';
  const t = Number(tier) || 0;
  const pct = Number(bondMap?.[t]?.[key] ?? FALLBACK_BOND_PCT[key][t] ?? 0);
  const baseBps = Math.round(pct * 100);
  if (t === 0) return { bps: 0, baseBps: 0, adjustment: null };
  if (!reputation) return { bps: baseBps, baseBps, adjustment: null };
  const riskPoints = Number(reputation?.authorityCounters?.riskPoints ?? reputation?.riskPoints ?? 0);
  const successful = Number(reputation?.successful ?? 0);
  if (riskPoints === 0 && successful > 0) return { bps: Math.max(0, baseBps - 100), baseBps, adjustment: 'discount' };
  if (riskPoints > 0) return { bps: baseBps + 300, baseBps, adjustment: 'penalty' };
  return { bps: baseBps, baseBps, adjustment: null };
};

export const getMakerModalCopy = (side, lang = 'TR') => {
  if (side === 'BUY_CRYPTO') {
    return {
      submitLabel: lang === 'TR' ? `Onayla ve ${getOrderSideCopy('BUY_CRYPTO', 'order', 'TR')} Aç` : `Approve & Open ${getOrderSideCopy('BUY_CRYPTO', 'order', 'EN')}`,
      previewTitle: lang === 'TR' ? `${getOrderSideCopy('BUY_CRYPTO', 'order', 'TR')} Reserve Özeti` : `${getOrderSideCopy('BUY_CRYPTO', 'order', 'EN')} Reserve Summary`,
      bondRoleLabel: lang === 'TR' ? 'Alıcı teminatı' : 'Taker bond',
      totalLabel: lang === 'TR' ? 'Toplam kilitlenecek' : 'Total Reserve',
      previewHint: lang === 'TR' ? 'Kontrat buy order oluştururken yalnız taker reserve tutar.' : 'Contract only locks taker reserve when creating a buy order.',
    };
  }
  return {
    submitLabel: lang === 'TR' ? `Onayla ve ${getOrderSideCopy('SELL_CRYPTO', 'order', 'TR')} Aç` : `Approve & Open ${getOrderSideCopy('SELL_CRYPTO', 'order', 'EN')}`,
    previewTitle: lang === 'TR' ? `${getOrderSideCopy('SELL_CRYPTO', 'order', 'TR')} Kilit Özeti` : `${getOrderSideCopy('SELL_CRYPTO', 'order', 'EN')} Lock Summary`,
    bondRoleLabel: lang === 'TR' ? 'Satıcı teminatı' : 'Maker bond',
    totalLabel: lang === 'TR' ? 'Toplam kilitlenecek' : 'Total Locked',
    previewHint: lang === 'TR' ? 'Kontrat sell order oluştururken inventory + maker reserve kilitler.' : 'Contract locks inventory + maker reserve when creating a sell order.',
  };
};

// [TR] Kontrat teminatı base-unit'te AŞAĞI yuvarlar: (amount * bps) / 10_000. Eski önizleme Math.ceil ile tam sayıya
//      YUKARI yuvarlıyordu (100.5 × %8 → 9 yerine 8.04). Token ondalığıyla aynı hesap yapılır.
// [EN] The contract floors the bond in base units; the old preview rounded up to a whole token.
export const buildMakerPreview = ({ side, amountUi, bondPct, bondBps = null, decimals = 6 }) => {
  const safeAmount = Number(amountUi || 0);
  const bps = bondBps != null ? Number(bondBps) : Math.round(Number(bondPct || 0) * 100);
  let reserveAmount = 0;
  try {
    const scale = 10 ** decimals;
    const amountBase = BigInt(Math.round(safeAmount * scale));
    reserveAmount = Number((amountBase * BigInt(Math.max(0, bps))) / 10000n) / scale;
  } catch { reserveAmount = 0; }

  if (side === 'BUY_CRYPTO') {
    return {
      reserveAmount,
      totalAmount: reserveAmount,
      includesInventory: false,
    };
  }

  return {
    reserveAmount,
    totalAmount: safeAmount + reserveAmount,
    includesInventory: true,
  };
};

export const resolvePaymentRiskEntry = ({ paymentRiskConfig = {}, rail, country }) => {
  const safeRail = String(rail || '').toUpperCase();
  const safeCountry = String(country || '').toUpperCase();
  if (!safeRail || !paymentRiskConfig || typeof paymentRiskConfig !== 'object') return null;
  const direct = paymentRiskConfig?.[safeCountry]?.[safeRail];
  if (direct) return direct;
  if (safeRail === 'SEPA_IBAN' && SEPA_COUNTRIES.has(safeCountry)) {
    return paymentRiskConfig?.EU?.SEPA_IBAN || null;
  }
  const genericEntry = Object.values(paymentRiskConfig)
    .find((bucket) => bucket && typeof bucket === 'object' && bucket[safeRail]);
  return genericEntry?.[safeRail] || null;
};

export const deriveOrderPaymentRiskSignal = ({ order, paymentRiskConfig = {} }) => {
  const snapshotRiskLevel = String(
    order?.payment_risk_level_snapshot
      || order?.payment_risk_level
      || order?.paymentRiskLevelSnapshot
      || order?.paymentRiskLevel
      || ""
  ).toUpperCase();
  if (["LOW", "MEDIUM", "HIGH", "RESTRICTED"].includes(snapshotRiskLevel)) {
    return {
      riskLevel: snapshotRiskLevel,
      description: {
        TR: "Order/trade oluşturulurken seçilen payment risk snapshot seviyesidir.",
        EN: "Payment risk snapshot level selected at order/trade creation.",
      },
      warningKey: "PAYMENT_RISK_SNAPSHOT",
      minBondSurchargeBps: 0,
      feeSurchargeBps: 0,
      enabled: true,
      generic: false,
      orderSpecific: true,
      source: "onchain_snapshot",
    };
  }

  const rail = order?.payment_method?.rail
    || order?.payment_rail
    || order?.settlement_profile?.rail
    || null;
  const country = order?.payment_method?.country
    || order?.payment_country
    || order?.settlement_profile?.country
    || null;
  const hasExplicitRailCountry = Boolean(rail && country);
  if (!hasExplicitRailCountry) {
    // [TR] Feed rail/country taşımıyorsa order-specific risk sinyali üretilmez.
    // [EN] If feed lacks explicit rail/country, do not fabricate an order-specific risk signal.
    return null;
  }

  const resolved = resolvePaymentRiskEntry({ paymentRiskConfig, rail, country });
  if (!resolved) return null;
  return {
    ...resolved,
    generic: resolved?.generic === true,
    orderSpecific: resolved?.generic === true ? false : true,
  };
};


export const removeOrderByOnchainId = (orders = [], onchainId) => {
  return orders.filter((o) => o?.onchainId !== onchainId);
};

const HEALTH_REASON_COPY = {
  maker_profile_changed_after_lock: {
    TR: 'Maker profil sürümü lock sonrası değişmiş.',
    EN: 'Maker profile version changed after lock.',
  },
  maker_frequent_recent_bank_changes_at_lock: {
    TR: 'Lock anında maker banka değişimi sıklığı eşik üstünde.',
    EN: 'At lock time, maker bank-change frequency exceeded threshold.',
  },
  partial_or_incomplete_snapshot: {
    TR: 'Snapshot eksik/kısmi olabilir; yorum dikkatle okunmalı.',
    EN: 'Snapshot may be partial/incomplete; interpret carefully.',
  },
  maker_ban_mirror_active: {
    TR: 'Maker ban mirror sinyali lock bağlamında aktif görünüyor.',
    EN: 'Maker ban mirror signal appears active in lock context.',
  },
  counterparty_high_partial_settlement_ratio: {
    TR: 'Karşı taraf geçmişinde uzlaşmalı kapanış oranı yüksek (ceza değil, davranış sinyali).',
    EN: 'Counterparty has a high agreed-settlement ratio (behavioral signal, not a penalty).',
  },
};

export const mapOffchainHealthToUi = ({ signal, lang = 'TR' }) => {
  if (!signal || typeof signal !== 'object') return null;

  const reasons = Array.isArray(signal.explainableReasons) ? signal.explainableReasons : [];

  // [TR] Deterministik, UI-only şiddet eşlemesi. Bu puan authority üretmez.
  // [EN] Deterministic UI-only severity mapping. This score never creates authority.
  const severityScore = reasons.reduce((acc, reason) => {
    if (reason === 'maker_ban_mirror_active') return acc + 2;
    if (reason === 'maker_profile_changed_after_lock') return acc + 1;
    if (reason === 'maker_frequent_recent_bank_changes_at_lock') return acc + 1;
    if (reason === 'partial_or_incomplete_snapshot') return acc + 1;
    if (reason === 'counterparty_high_partial_settlement_ratio') return acc;
    return acc;
  }, 0);

  const severityBand = severityScore >= 3 ? 'RED' : severityScore >= 1 ? 'YELLOW' : 'GREEN';
  const severityMeta = {
    GREEN: { TR: 'Düşük Sinyal', EN: 'Low Signal', chipClass: 'text-success border-success/40 bg-success/10' },
    YELLOW: { TR: 'Orta Sinyal', EN: 'Medium Signal', chipClass: 'text-warning border-warning/40 bg-warning/10' },
    RED: { TR: 'Yüksek Sinyal', EN: 'High Signal', chipClass: 'text-danger border-danger/40 bg-danger/10' },
  }[severityBand];

  return {
    severityBand,
    severityLabel: severityMeta[lang] || severityMeta.EN,
    severityChipClass: severityMeta.chipClass,
    reasons,
    reasonLabels: reasons.map((reason) => HEALTH_REASON_COPY?.[reason]?.[lang] || reason),
    readOnly: signal.readOnly === true,
    nonBlocking: signal.nonBlocking === true,
    canBlockProtocolActions: signal.canBlockProtocolActions === true,
    maker: signal.maker || null,
    snapshot: signal.snapshot || null,
  };
};

export const mapCompactTrustSummary = ({ compactSummary, signal, lang = 'TR' }) => {
  // [TR] Öncelik backend'in market-safe compact özet alanındadır.
  // [EN] Prefer backend-provided market-safe compact summary field.
  if (compactSummary && typeof compactSummary === 'object' && compactSummary.available === true) {
    const band = compactSummary.band || null;
    const fallbackChip = 'text-textSecondary border-borderSubtle bg-elevated';
    const chipByBand = {
      GREEN: 'text-success border-success/40 bg-success/10',
      YELLOW: 'text-warning border-warning/40 bg-warning/10',
      RED: 'text-danger border-danger/40 bg-danger/10',
    };
    return {
      available: true,
      band,
      label: compactSummary.label || (lang === 'TR' ? 'Sinyal' : 'Signal'),
      chipClass: chipByBand[band] || fallbackChip,
      readOnly: compactSummary.readOnly === true,
      nonBlocking: compactSummary.nonBlocking === true,
      canBlockProtocolActions: compactSummary.canBlockProtocolActions === true,
    };
  }

  const mapped = mapOffchainHealthToUi({ signal, lang });
  if (!mapped) {
    return {
      available: false,
      band: null,
      label: lang === 'TR' ? 'Sinyal yok' : 'Signal unavailable',
      chipClass: 'text-textSecondary border-borderSubtle bg-elevated',
    };
  }

  // [TR] Hover'da gizlilik için nedenleri göstermiyoruz; yalnız band + kısa etiket döneriz.
  // [EN] For hover privacy we do not expose reasons; only band + short label are returned.
  return {
    available: true,
    band: mapped.severityBand,
    label: mapped.severityLabel,
    chipClass: mapped.severityChipClass,
    readOnly: mapped.readOnly,
    nonBlocking: mapped.nonBlocking,
    canBlockProtocolActions: mapped.canBlockProtocolActions,
  };
};

export const mapApiOrderToUi = ({ order, lang = 'TR', bondMap = {}, tokenMap = {}, paymentRiskConfig = {}, formatAddress = (v) => v }) => {
  const side = normalizeOrderSide(order?.side);
  const sideMeta = SIDE_META[side] || null;
  const status = order?.status || 'UNKNOWN';
  const statusMeta = STATUS_META[status] || STATUS_META.UNKNOWN;

  const crypto = order?.market?.crypto_asset || 'USDT';
  const fiat = order?.market?.fiat_currency || null;
  const rate = Number(order?.market?.exchange_rate || 0);

  // [TR] Backend *_num alanları token base-unit'tir (1 USDT = 1_000_000). Gösterim için authoritative
  //      raw string token decimals ile ölçeklenir; aksi halde pazar yeri 10^6 kat büyük tutar gösterir.
  // [EN] Backend *_num fields are raw base units; scale the raw strings by token decimals for display.
  const orderTokenAddress = String(order?.token_address || '').toLowerCase();
  const configuredDecimals = Number(tokenMap?.[orderTokenAddress]?.decimals);
  const tokenDecimals = Number.isInteger(configuredDecimals) && configuredDecimals > 0 && configuredDecimals <= 18
    ? configuredDecimals
    : DEFAULT_TOKEN_DECIMALS;
  const minFillAmountRaw = order?.amounts?.min_fill_amount;
  const remainingAmountRaw = order?.amounts?.remaining_amount;
  const minFillAmount = minFillAmountRaw != null
    ? tokenToNumber(minFillAmountRaw, tokenDecimals)
    : Number(order?.amounts?.min_fill_amount_num ?? 0);
  const remainingAmount = remainingAmountRaw != null
    ? tokenToNumber(remainingAmountRaw, tokenDecimals)
    : Number(order?.amounts?.remaining_amount_num ?? 0);
  const totalAmountRaw = order?.amounts?.total_amount;
  const totalAmount = totalAmountRaw != null
    ? tokenToNumber(totalAmountRaw, tokenDecimals)
    : Number(order?.amounts?.total_amount_num ?? 0);

  const tier = order?.tier ?? 0;
  const makerBondPct = Number(bondMap?.[tier]?.maker ?? 0);
  const takerBondPct = Number(bondMap?.[tier]?.taker ?? 0);
  const sideBondPct = side === 'BUY_CRYPTO'
    ? takerBondPct
    : side === 'SELL_CRYPTO'
      ? makerBondPct
      : null;

  const limitLabel = lang === 'TR'
    ? `Min Fill ${minFillAmount} ${crypto} • Kalan ${remainingAmount} ${crypto}`
    : `Min Fill ${minFillAmount} ${crypto} • Remaining ${remainingAmount} ${crypto}`;

  const ownerAddress = order?.owner_address || '';
  const tokenAddress = order?.token_address || '';
  const tokenPolicy = tokenAddress ? (tokenMap?.[tokenAddress.toLowerCase()] || null) : null;
  const ownerSideHint = side === 'SELL_CRYPTO'
    ? (lang === 'TR' ? `Order sahibi: ${getOrderSideCopy('SELL_CRYPTO', 'display', 'TR')}` : `Order owner: ${getOrderSideCopy('SELL_CRYPTO', 'display', 'EN')}`)
    : side === 'BUY_CRYPTO'
      ? (lang === 'TR' ? `Order sahibi: ${getOrderSideCopy('BUY_CRYPTO', 'display', 'TR')}` : `Order owner: ${getOrderSideCopy('BUY_CRYPTO', 'display', 'EN')}`)
      : (lang === 'TR' ? 'Order sahibi rolü doğrulanamadı' : 'Order owner side could not be verified');
  // [TR] Backend Order.stats alanı child_trade_count/resolved_child_trade_count taşır.
  // [EN] Backend Order.stats carries child_trade_count / resolved_child_trade_count.
  const fillsCount = Number(order?.stats?.child_trade_count ?? order?.stats?.fills_count ?? 0);
  const resolvedCount = Number(order?.stats?.resolved_child_trade_count ?? 0);
  const burnedCount = Number(order?.stats?.burned_child_trade_count ?? 0);
  const closedCount = resolvedCount + burnedCount + Number(order?.stats?.canceled_child_trade_count ?? 0);
  const trustSummary = mapCompactTrustSummary({
    compactSummary: order?.trust_visibility_summary || null,
    signal: order?.offchain_health_score_input || null,
    lang,
  });
  const paymentRiskSignal = deriveOrderPaymentRiskSignal({ order, paymentRiskConfig });
  return {
    id: order?._id,
    onchainId: order?.onchain_order_id ?? null,
    ownerAddress,
    ownerDisplay: formatAddress(ownerAddress),
    maker: formatAddress(ownerAddress),
    makerFull: ownerAddress,
    side,
    sideLabel: sideMeta ? sideMeta.sideLabel[lang] : (lang === 'TR' ? 'Geçersiz Side' : 'Invalid Side'),
    status,
    statusLabel: statusMeta[lang] || status,
    ctaLabel: sideMeta ? sideMeta.ctaLabel[lang] : (lang === 'TR' ? 'Kullanılamaz' : 'Unavailable'),
    isActionable: Boolean(sideMeta),
    tier,
    crypto,
    fiat,
    rate,
    hasPrice: rate > 0 && Boolean(fiat),
    tokenDecimals,
    minFillAmount,
    remainingAmount,
    totalAmount,
    limitLabel,
    bondLabel: sideBondPct != null && sideBondPct > 0 ? `${sideBondPct}%` : '—',
    tokenAddress,
    tokenPolicy,
    // [TR] V3 market hover kartı için taraf-bağımlı kısa açıklama (seller-only dilinden kaçınır).
    // [EN] Side-aware summary hint for V3 hover card (avoids seller-only terminology).
    ownerSideHint,
    trustSummary,
    paymentRiskSignal,
    // [TR] Başarı oranı yalnız kapanmış child trade varsa hesaplanır; sahte %100 gösterilmez.
    // [EN] Success rate only when closed child trades exist; never a fabricated 100%.
    successRate: closedCount > 0 ? Math.round((resolvedCount / closedCount) * 100) : null,
    txCount: fillsCount,
    totalTrades: fillsCount,
  };
};
