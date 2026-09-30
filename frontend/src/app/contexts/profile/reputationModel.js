// [TR] Profil "İtibar" sekmesinin saf hesap modeli. Kural kaynağı ArafEscrow.sol:
//      _getEffectiveTier (başarılı işlem + risk puanı eşiği + 15 gün aktiflik), decayReputation
//      (bannedUntil + cleanPeriod sonrası), teminat indirimi/cezası (riskPoints). Eşiklerin kontratta
//      getter'ı yok; backend ReputationPolicyUpdated / ReputationTierThresholdsUpdated event'lerini aynalar.
//      Event henüz görülmediyse constructor varsayılanları kullanılır ve bu açıkça işaretlenir.
// [EN] Pure model for the Reputation tab, mirroring ArafEscrow.sol rules. Thresholds come from the
//      backend event mirror; constructor defaults are used (and flagged) until an event is seen.

export const MIN_ACTIVE_PERIOD_SEC = 15 * 24 * 3600;
// [TR] ArafEscrow.MIN_REPUTATION_NOTIONAL (6 ondalık, 20 USD): altındaki trade'ler başarılı işlem sayılmaz.
// [EN] ArafEscrow.MIN_REPUTATION_NOTIONAL (20 USD): smaller trades do not count as successful trades.
export const MIN_REPUTATION_NOTIONAL_USD = 20;

export const DEFAULT_REPUTATION_POLICY = Object.freeze({
  cleanPeriodSec: 90 * 24 * 3600,
  baseBanDurationSec: 30 * 24 * 3600,
  banRiskPointsThreshold: 100,
  tierMinSuccessfulTrades: [0, 15, 50, 100, 200],
  tierMaxRiskPoints: [100, 80, 50, 30, 15],
});

export const resolveReputationPolicy = (policy) => {
  const hasThresholds = Array.isArray(policy?.tierMinSuccessfulTrades) && policy.tierMinSuccessfulTrades.length === 5
    && Array.isArray(policy?.tierMaxRiskPoints) && policy.tierMaxRiskPoints.length === 5;
  return {
    ...DEFAULT_REPUTATION_POLICY,
    ...(policy || {}),
    tierMinSuccessfulTrades: hasThresholds ? policy.tierMinSuccessfulTrades.map(Number) : DEFAULT_REPUTATION_POLICY.tierMinSuccessfulTrades,
    tierMaxRiskPoints: hasThresholds ? policy.tierMaxRiskPoints.map(Number) : DEFAULT_REPUTATION_POLICY.tierMaxRiskPoints,
    cleanPeriodSec: Number(policy?.cleanPeriodSec ?? DEFAULT_REPUTATION_POLICY.cleanPeriodSec),
    fromChain: policy?.source === 'onchain_event' && hasThresholds,
  };
};

// [TR] Kontrattaki sırayla aynı: en yüksek tier'dan aşağı, hem işlem sayısı hem risk tavanı sağlanmalı.
export const computeTierByCounts = (successful, riskPoints, policy) => {
  for (let tier = 4; tier >= 1; tier -= 1) {
    if (successful >= policy.tierMinSuccessfulTrades[tier] && riskPoints <= policy.tierMaxRiskPoints[tier]) return tier;
  }
  return 0;
};

export const deriveReputationView = ({ reputation, policy: rawPolicy = null, now = Math.floor(Date.now() / 1000) } = {}) => {
  if (!reputation) return null;
  const policy = resolveReputationPolicy(rawPolicy);
  const c = reputation.authorityCounters || {};
  const successful = Number(reputation.successful ?? 0);
  const failed = Number(reputation.failed ?? 0);
  const riskPoints = Number(c.riskPoints ?? 0);
  const tier = Number(reputation.effectiveTier ?? 0);
  const bannedUntil = Number(reputation.bannedUntil ?? 0);
  const consecutiveBans = Number(reputation.consecutiveBans ?? 0);
  const firstSuccessAt = Number(reputation.firstSuccessfulTradeAt ?? 0);

  const byCounts = computeTierByCounts(successful, riskPoints, policy);
  const activeUntil = firstSuccessAt > 0 ? firstSuccessAt + MIN_ACTIVE_PERIOD_SEC : 0;
  const activePeriodPending = byCounts > 0 && (firstSuccessAt === 0 || now < activeUntil);
  // [TR] Sayılar daha yüksek tier'a yetiyor, aktiflik süresi dolmuş, ama efektif tier düşük → kontrat ceza tavanı.
  const tierCapped = !activePeriodPending && tier < byCounts;

  let nextTier = null;
  if (tier < 4) {
    const target = tier + 1;
    const needTrades = Math.max(0, policy.tierMinSuccessfulTrades[target] - successful);
    const riskCap = policy.tierMaxRiskPoints[target];
    nextTier = {
      tier: target,
      minTrades: policy.tierMinSuccessfulTrades[target],
      needTrades,
      riskCap,
      riskOk: riskPoints <= riskCap,
      progressPct: policy.tierMinSuccessfulTrades[target] > 0
        ? Math.min(100, Math.round((successful / policy.tierMinSuccessfulTrades[target]) * 100))
        : 100,
    };
  }

  const banActive = bannedUntil > now;
  const cleanSlateAt = bannedUntil > 0 ? bannedUntil + policy.cleanPeriodSec : 0;
  let cleanSlate = 'none';
  if (consecutiveBans > 0 && bannedUntil > 0) {
    if (banActive) cleanSlate = 'ban_active';
    else if (now > cleanSlateAt) cleanSlate = 'eligible';
    else cleanSlate = 'waiting';
  }

  // [TR] orderUiModel.resolveEffectiveBondBps ile aynı kural (tier 0 teminatsız).
  //      Tier 0 emirleri teminatsızdır; indirim/ceza yalnız tier 1+ emirlerde anlam taşır.
  const bondAdjustment = tier === 0 ? 'tier0' : riskPoints > 0 ? 'penalty' : (successful > 0 ? 'discount' : 'none');

  const total = successful + failed;
  return {
    policy,
    tier,
    tierByCounts: byCounts,
    tierCapped,
    successful,
    failed,
    riskPoints,
    riskToBan: Math.max(0, Number(policy.banRiskPointsThreshold) - riskPoints),
    overBanThreshold: riskPoints >= Number(policy.banRiskPointsThreshold),
    successRate: total > 0 ? Math.round((successful / total) * 100) : null,
    bannedUntil,
    banActive,
    consecutiveBans,
    activePeriodPending,
    activeUntil,
    nextTier,
    cleanSlate,
    cleanSlateAt,
    bondAdjustment,
    outcomes: {
      manualRelease: Number(c.manualReleaseCount ?? 0),
      autoRelease: Number(c.autoReleaseCount ?? 0),
      mutualCancel: Number(c.mutualCancelCount ?? 0),
      partialSettlement: Number(c.partialSettlementCount ?? 0),
      disputedResolved: Number(c.disputedResolvedCount ?? 0),
      disputeWin: Number(c.disputeWinCount ?? 0),
      disputeLoss: Number(c.disputeLossCount ?? 0),
      burn: Number(c.burnCount ?? 0),
    },
  };
};
