// [TR] P4 testleri için getTrade çıktısı üreticisi (test dosyası değildir).
export const ME = '0x1111111111111111111111111111111111111111';
export const OTHER = '0x2222222222222222222222222222222222222222';
export const THIRD = '0x5555555555555555555555555555555555555555';
export const USDT = '0x6666666666666666666666666666666666666666';
const STATE = { OPEN: 0, LOCKED: 1, PAID: 2, CHALLENGED: 3, RESOLVED: 4, CANCELED: 5, BURNED: 6 };

export const chainTrade = ({ id = 1, maker = ME, taker = OTHER, state = 'LOCKED', lockedAt = 1_700_000_000, paidAt = 0, challengedAt = 0, pingedAt = 0, pingedByTaker = false, challengePingedAt = 0, challengePingedByMaker = false, cancelProposedByMaker = false, cancelProposedByTaker = false } = {}) => ({
  id: BigInt(id),
  parentOrderId: 9n,
  maker,
  taker,
  tokenAddress: USDT,
  cryptoAmount: 100_000_000n,
  makerBond: 5_000_000n,
  takerBond: 3_000_000n,
  takerFeeBpsSnapshot: 10,
  makerFeeBpsSnapshot: 10,
  tier: 1,
  paymentRiskLevelSnapshot: 1,
  state: STATE[state],
  lockedAt: BigInt(lockedAt),
  paidAt: BigInt(paidAt),
  challengedAt: BigInt(challengedAt),
  cancelProposedByMaker,
  cancelProposedByTaker,
  pingedAt: BigInt(pingedAt),
  pingedByTaker,
  challengePingedAt: BigInt(challengePingedAt),
  challengePingedByMaker,
});

