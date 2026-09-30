# Gas baseline / Gas ölçümü

Measured with `npm --prefix contracts run gas:baseline` (Hardhat network, production wiring: escrow treasury =
ArafRevenueVault, rewards connected, warm wallets, median of repeated runs). Values are `gasUsed`.

`npm --prefix contracts run gas:baseline` ile ölçüldü (üretim bağlantısı: escrow treasury = RevenueVault,
rewards bağlı, ısınmış cüzdanlar, tekrarların medyanı). Değerler `gasUsed`'dır.

## Storage packing (2026-09)

- Trade: 18 → 9 slots. ids `uint64`, timestamps `uint64` packed with the snapshot/state slot; cancel and ping
  flags share one slot. Reporting payment and challenging no longer open new slots.
- The receipt hash is no longer copied into storage (≈66k gas per report); its canonical record is the
  `PaymentReported` event, which the backend already mirrors. No contract decision ever read it.
- Order: `id` shares the owner/side slot. Terminal snapshot: outcome + terminalAt share a slot.
- Tier 2+ fills skip the `lastTradeAt` write (cooldown only applies to Tier 0/1 orders).
- Field order is unchanged, so every getter keeps its ABI word order apart from the removed `ipfsReceiptHash`.

Full clean Tier 2 lifecycle (create + fill + report + release): **991,978 → 809,929 gas
(-18.4%)**.

| Operation | Before | After | Δ gas | Δ % |
|---|---:|---:|---:|---:|
| `createSellOrder_t0` | 277,101 | 255,028 | -22,073 | -8.0% |
| `fillSellOrder_t0` | 245,345 | 201,383 | -43,962 | -17.9% |
| `reportPayment_t0` | 126,600 | 37,696 | -88,904 | -70.2% |
| `releaseFunds_t0` | 234,166 | 212,134 | -22,032 | -9.4% |
| `createSellOrder_t2` | 299,653 | 277,580 | -22,073 | -7.4% |
| `fillSellOrder_t2` | 303,311 | 254,271 | -49,040 | -16.2% |
| `reportPayment_t2` | 126,600 | 37,696 | -88,904 | -70.2% |
| `releaseFunds_t2` | 262,414 | 240,382 | -22,032 | -8.4% |
| `createBuyOrder_t2` | 284,741 | 262,653 | -22,088 | -7.8% |
| `fillBuyOrder_t2` | 318,076 | 268,934 | -49,142 | -15.4% |
| `fillSellOrder_t2_partial` | 310,333 | 261,293 | -49,040 | -15.8% |
| `pingTakerForChallenge` | 79,907 | 53,841 | -26,066 | -32.6% |
| `challengeTrade` | 62,400 | 36,193 | -26,207 | -42.0% |
| `proposeSettlement` | 144,813 | 144,813 | +0 | +0.0% |
| `acceptSettlement` | 319,400 | 295,202 | -24,198 | -7.6% |
| `pingMaker` | 79,995 | 53,861 | -26,134 | -32.7% |
| `autoRelease` | 316,960 | 292,948 | -24,012 | -7.6% |
| `proposeOrApproveCancel_first` | 52,962 | 35,959 | -17,003 | -32.1% |
| `proposeOrApproveCancel_final` | 213,575 | 208,780 | -4,795 | -2.2% |
| `expirePaymentWindow` | 269,145 | 245,105 | -24,040 | -8.9% |
| `burnExpired` | 251,000 | 226,772 | -24,228 | -9.7% |
| `recordTradeOutcome_single` | 159,834 | 149,406 | -10,428 | -6.5% |
| `recordTradeOutcomes_batch10` | 705,946 | 601,666 | -104,280 | -14.8% |
| `recordTradeOutcomes_perTrade` | 70,595 | 60,167 | -10,428 | -14.8% |
| `finalizeEpochToken` | 58,688 | 58,688 | +0 | +0.0% |
| `claim` | 126,626 | 126,626 | +0 | +0.0% |

## Considered and not done / Değerlendirilip yapılmayanlar

- Shrinking `ReputationUpdated`: saves ≈2.5k gas per event but the backend would then need an RPC read per
  event to mirror counters (more infrastructure load). Kept.
- Moving analytics counters off-chain: they live in slots that are already written on every outcome, so the
  saving is near zero while the backend would become a source of truth. Kept on-chain.
- `Math.mulDiv` in reward weight: the product cannot overflow (6-decimal notional × 25,000 × 13,000). Not needed.
- Batch claim: with a 30-day epoch and a 7-day claim window at most one epoch is claimable at a time.
- `uint128` amounts: would save a further ~22–44k per fill/order but exceeded the 24,576-byte EIP-170 limit.
