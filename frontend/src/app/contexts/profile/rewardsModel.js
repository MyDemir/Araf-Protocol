// [TR] Ödüller (airdrop) sekmesinin saf modeli; ArafRewards.sol ile birebir:
//      - claim tutarı = epochRewardPool * userWeight / totalWeight (tamsayı bölme)
//      - talep açılışı = dönem sonu + claimDelay (aynı an kayıt penceresinin kapanışı)
//      - talep kapanışı = dönem sonu + claimDelay + claimWindow
//      - finalize edilmeden claim edilemez; finalize sırasında hedeflenmiş sponsor fonu havuza eklenebilir,
//        bu yüzden finalize öncesi tutar "en az" tahminidir.
// [EN] Pure model for the rewards tab, mirroring ArafRewards.sol claim math and windows.

const big = (v) => { try { return BigInt(v ?? 0); } catch { return 0n; } };

export const REWARD_STATUS = Object.freeze({
  ACCRUING: 'accruing', // epoch still running; weight and pool can grow
  RECORDING: 'recording', // epoch ended, outcomes can still be recorded; claims not open yet
  CLAIMABLE: 'claimable',
  CLAIMED: 'claimed',
  EXPIRED: 'expired',
  NONE: 'none', // no weight in this epoch
});

export function deriveEpochReward({
  epoch, now, timing, totalWeight, userWeight, pool, finalized = false, claimed = false,
}) {
  const e = BigInt(epoch);
  const dur = BigInt(timing.epochDuration);
  const epochStart = e * dur;
  const epochEnd = (e + 1n) * dur;
  const claimOpenAt = epochEnd + BigInt(timing.claimDelay);
  const claimCloseAt = claimOpenAt + BigInt(timing.claimWindow);
  const t = big(totalWeight);
  const u = big(userWeight);
  const p = big(pool);
  const nowB = BigInt(Math.floor(Number(now)));

  const shareBps = t > 0n ? Number((u * 10000n) / t) : 0;
  const amount = t > 0n ? (p * u) / t : 0n;

  let status;
  if (nowB < epochEnd) status = REWARD_STATUS.ACCRUING;
  else if (u === 0n) status = REWARD_STATUS.NONE;
  else if (claimed) status = REWARD_STATUS.CLAIMED;
  else if (nowB < claimOpenAt) status = REWARD_STATUS.RECORDING;
  else if (nowB > claimCloseAt) status = REWARD_STATUS.EXPIRED;
  else status = REWARD_STATUS.CLAIMABLE;

  return {
    epoch: e,
    epochStart,
    epochEnd,
    claimOpenAt,
    claimCloseAt,
    shareBps,
    amount,
    pool: p,
    userWeight: u,
    totalWeight: t,
    status,
    needsFinalize: status === REWARD_STATUS.CLAIMABLE && !finalized,
    // Amount can still change while accruing/recording, or grow with sponsor funding until finalized.
    isEstimate: status === REWARD_STATUS.ACCRUING || status === REWARD_STATUS.RECORDING || (!finalized && status !== REWARD_STATUS.CLAIMED),
  };
}

// [TR] Özet: token bazında talep edilebilir toplam, toplam alınan (backend RewardClaim aynası), bu dönem tahmini.
export function summarizeRewards({ rows = [], claimHistory = [], currentEpoch }) {
  const byToken = {};
  const bucket = (sym) => (byToken[sym] ||= { claimable: 0n, claimed: 0n, currentEstimate: 0n });
  for (const row of rows) {
    const b = bucket(row.symbol);
    if (row.status === REWARD_STATUS.CLAIMABLE) b.claimable += row.amount;
    if (currentEpoch != null && row.epoch === BigInt(currentEpoch)) b.currentEstimate += row.amount;
  }
  if (claimHistory.length) {
    for (const c of claimHistory) bucket(c.symbol).claimed += big(c.amount);
  } else {
    for (const row of rows) if (row.status === REWARD_STATUS.CLAIMED) bucket(row.symbol).claimed += row.amount;
  }
  const current = rows.find((r) => currentEpoch != null && r.epoch === BigInt(currentEpoch));
  return { byToken, currentShareBps: current ? current.shareBps : 0 };
}
