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

## Security fixes + library split (2026-09, fix/kontrat-guvenlik)

Changes: G1 (terminal fee snapshot 3 → 2 slots, `uint128` fees), G2 (vault intent handshake in transient storage),
G3 (rewards durations are constants), G4 (treasury/code-length cache), G9 (`unchecked ++i`), G10 (single
`maxAllowedTier` write). Security fixes add work on some paths: K3/K6 read the effective tier of both order owner
and filler at fill time (cold reputation/threshold slots of a second wallet, ≈+19k on sell fills), and the
reputation/payout logic now runs in linked libraries (`ArafReputationLib`, `ArafSettlementLib`) via DELEGATECALL
(≈2.6k cold-address + ABI copy per call). Terminal paths with fees still net ≈-18k thanks to G1; zero-fee terminal
paths (LOCKED mutual cancel, burn) pay the library overhead without a G1 saving.

Güvenlik düzeltmeleri bazı yollara iş ekler: K3/K6 fill anında hem order sahibinin hem filler'ın efektif tier'ını
okur (ikinci cüzdanın soğuk slotları, satış fill'inde ≈+19k); reputation/payout mantığı DELEGATECALL ile linkli
library'lerde çalışır (çağrı başına ≈2,6k). Ücretli terminal yollar G1 sayesinde net ≈-18k.

| Operation | Before | After | Δ gas | Δ % |
|---|---:|---:|---:|---:|
| `createSellOrder_t0` | 255,028 | 255,330 | +302 | +0.1% |
| `fillSellOrder_t0` | 201,383 | 203,737 | +2,354 | +1.2% |
| `reportPayment_t0` | 37,696 | 37,844 | +148 | +0.4% |
| `releaseFunds_t0` | 212,134 | 193,967 | -18,167 | -8.6% |
| `createSellOrder_t2` | 277,580 | 277,883 | +303 | +0.1% |
| `fillSellOrder_t2` | 254,271 | 273,545 | +19,274 | +7.6% |
| `reportPayment_t2` | 37,696 | 37,844 | +148 | +0.4% |
| `releaseFunds_t2` | 240,382 | 221,994 | -18,388 | -7.6% |
| `createBuyOrder_t2` | 262,653 | 262,940 | +287 | +0.1% |
| `fillBuyOrder_t2` | 268,934 | 276,760 | +7,826 | +2.9% |
| `fillSellOrder_t2_partial` | 261,293 | 280,566 | +19,273 | +7.4% |
| `pingTakerForChallenge` | 53,841 | 53,893 | +52 | +0.1% |
| `challengeTrade` | 36,193 | 36,275 | +82 | +0.2% |
| `proposeSettlement` | 144,813 | 147,015 | +2,202 | +1.5% |
| `acceptSettlement` | 295,202 | 276,924 | -18,278 | -6.2% |
| `pingMaker` | 53,861 | 53,915 | +54 | +0.1% |
| `autoRelease` | 292,948 | 274,702 | -18,246 | -6.2% |
| `proposeOrApproveCancel_first` | 35,959 | 35,986 | +27 | +0.1% |
| `proposeOrApproveCancel_final` | 208,780 | 219,217 | +10,437 | +5.0% |
| `expirePaymentWindow` | 245,105 | 228,119 | -16,986 | -6.9% |
| `burnExpired` | 226,772 | 229,653 | +2,881 | +1.3% |
| `recordTradeOutcome_single` | 149,406 | 142,975 | -6,431 | -4.3% |
| `recordTradeOutcomes_batch10` | 601,666 | 573,356 | -28,310 | -4.7% |
| `recordTradeOutcomes_perTrade` | 60,167 | 57,336 | -2,831 | -4.7% |
| `finalizeEpochToken` | 58,688 | 54,461 | -4,227 | -7.2% |
| `claim` | 126,626 | 120,223 | -6,403 | -5.1% |

## K2(B) "ping lapses" (2026-10, fix/kontrat-k2-ping-duser)

`challengeTrade` is maker-only again and gets one extra timestamp comparison (`ChallengeWindowExpired`);
`pingMaker` checks the maker ping's age before `ConflictingPingPath`. No new storage. Other rows move by
±22–220 gas only because the function dispatcher layout shifted (new `MAKER_CHALLENGE_WINDOW` getter).
ArafEscrow runtime bytecode: 22,175 → 22,061 bytes (EIP-170 limit 24,576).

`challengeTrade` yeniden yalnız maker'a açık ve tek bir ek zaman karşılaştırması yapar; `pingMaker`
`ConflictingPingPath`'ten önce maker pinginin yaşına bakar. Yeni storage yok. Diğer satırlardaki ±22–220 gaz
fark yalnız dispatcher yerleşiminin kaymasındandır.

| Operation | Before | After | Δ gas | Δ % |
|---|---:|---:|---:|---:|
| `createSellOrder_t0` | 255,330 | 255,243 | -87 | -0.0% |
| `fillSellOrder_t0` | 203,737 | 203,737 | +0 | +0.0% |
| `reportPayment_t0` | 37,844 | 37,866 | +22 | +0.1% |
| `releaseFunds_t0` | 193,967 | 193,989 | +22 | +0.0% |
| `createSellOrder_t2` | 277,883 | 277,796 | -87 | -0.0% |
| `fillSellOrder_t2` | 273,545 | 273,327 | -218 | -0.1% |
| `reportPayment_t2` | 37,844 | 37,866 | +22 | +0.1% |
| `releaseFunds_t2` | 221,994 | 222,016 | +22 | +0.0% |
| `createBuyOrder_t2` | 262,940 | 262,853 | -87 | -0.0% |
| `fillBuyOrder_t2` | 276,760 | 276,564 | -196 | -0.1% |
| `fillSellOrder_t2_partial` | 280,566 | 280,348 | -218 | -0.1% |
| `pingTakerForChallenge` | 53,893 | 53,915 | +22 | +0.0% |
| `challengeTrade` | 36,275 | 36,409 | +134 | +0.4% |
| `proposeSettlement` | 147,015 | 147,037 | +22 | +0.0% |
| `acceptSettlement` | 276,924 | 276,946 | +22 | +0.0% |
| `pingMaker` | 53,915 | 53,954 | +39 | +0.1% |
| `autoRelease` | 274,702 | 274,724 | +22 | +0.0% |
| `proposeOrApproveCancel_first` | 35,986 | 36,008 | +22 | +0.1% |
| `proposeOrApproveCancel_final` | 219,217 | 219,239 | +22 | +0.0% |
| `expirePaymentWindow` | 228,119 | 228,141 | +22 | +0.0% |
| `burnExpired` | 229,653 | 229,675 | +22 | +0.0% |
| `recordTradeOutcome_single` | 142,975 | 142,975 | +0 | +0.0% |
| `recordTradeOutcomes_batch10` | 573,356 | 573,356 | +0 | +0.0% |
| `recordTradeOutcomes_perTrade` | 57,336 | 57,336 | +0 | +0.0% |
| `finalizeEpochToken` | 54,461 | 54,461 | +0 | +0.0% |
| `claim` | 120,223 | 120,223 | +0 | +0.0% |

## Considered and not done / Değerlendirilip yapılmayanlar

- Shrinking `ReputationUpdated`: saves ≈2.5k gas per event but the backend would then need an RPC read per
  event to mirror counters (more infrastructure load). Kept.
- Moving analytics counters off-chain: they live in slots that are already written on every outcome, so the
  saving is near zero while the backend would become a source of truth. Kept on-chain.
- `Math.mulDiv` in reward weight: the product cannot overflow (6-decimal notional × 25,000 × 13,000). Not needed.
- Batch claim: with a 30-day epoch and a 7-day claim window at most one epoch is claimable at a time.
- `uint128` amounts: would save a further ~22–44k per fill/order but exceeded the 24,576-byte EIP-170 limit.
