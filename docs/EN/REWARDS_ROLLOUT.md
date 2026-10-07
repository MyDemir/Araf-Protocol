# Proof of Peace Rewards — Rollout Plan (EN)

This document defines a **safe, staged, and game-theory-aligned rollout** for Proof of Peace Rewards.

Proof of Peace is the positive-incentive side of the dispute system. Bleeding Escrow makes bad strategy expensive; Proof of Peace makes fast clean resolution more valuable in future reward epochs.

> Canonical principle: **Rewards are not cashback; they are a pro-rata peace premium for fast clean resolution.**

## 1) Economic and Authority Boundaries

- Rewards are **not trade cashback**.
- Eligibility is generated only from **ArafEscrow terminal outcomes**.
- Backend is **mirror/read-model only** and cannot define recipients, eligibility, weights, or claimable amounts.
- Admin cannot choose recipients.
- Sponsors/funders cannot choose recipients.
- `paymentRiskLevel` is **not** a reward multiplier.
- In MVP, these terminal outcomes are **zero-weight** (in code every outcome other than clean release and partial settlement weighs zero):
  - auto-release
  - burn
  - mutual cancel
  - disputed release
  - payment-window expiry (`PAYMENT_WINDOW_EXPIRED`)
- In MVP, **Tier 0 is not reward eligible**, and direct (non-order-child) escrow trades are not rewardable either.
- `rewardBps` (the reward share of escrow revenue in `ArafRevenueVault`) starts at **4000** and the owner can only move it within **4000–7000** (`MIN_REWARD_BPS` / `MAX_REWARD_BPS`).

## 2) Game-Theory Guardrails

The reward system is not only a positive incentive; it is also a limited economic defense against farming and bad strategy.

| Behavior | Reward posture | Why |
|---|---|---|
| Fast clean release | Highest positive weight | Incentivizes the best cooperative equilibrium |
| Slow clean release | Lower positive weight | Prices delay as opportunity cost |
| Partial settlement | Low positive weight | Rewards dispute de-escalation without making disputes profitable |
| Auto-release | Zero weight | Maker inactivity is not rewarded |
| Mutual cancel | Zero weight | Avoids cancel-loop farming |
| Disputed release | Zero weight | Prevents challenge-then-release farming |
| Burn | Zero weight | Deadlock must never become rewardable |

Operational rule:

> **Expected reward must remain below the cost of synthetic volume / wash trading.**

Therefore sponsor campaigns, external funding, and `rewardBps` increases should be ramped gradually with observable metrics.

## 3) Staged Rollout

### Phase A — Read-only reward analytics
- Enable read-only analytics and observability only.
- No on-chain claim or treasury switch.
- Monitor outcome distribution, clean release speed, partial settlement ratio, zero-weight outcome ratio, and possible wash-trade clusters.

### Phase B — External funding enabled, claim disabled
- Enable external reward funding flows (`fundGlobalRewards` / `fundProductRewards`; a product pool must first be enabled by the owner with `setProductPool`).
- Keep claim closed at the product level (see the note below: there is no on-chain claim switch).
- Verify that sponsors/funders cannot choose recipients, weights, or multipliers.

### Phase C — Revenue split enabled, recordTradeOutcome enabled
- Enable revenue split accounting via vault (the escrow treasury points at the vault only after the separate treasury-switch step).
- Enable `recordTradeOutcome` flow. `recordTradeOutcome(tradeId)` / `recordTradeOutcomes(tradeIds)` are permissionless; the backend `rewardOutcomeRecorder` job (hourly, `JOB_REWARD_RECORDER_INTERVAL_MS`) calls the batch variant when `ARAF_REWARDS_ADDRESS` and `RELAYER_PRIVATE_KEY` are set, and stays inactive otherwise. The relayer only triggers recording; it cannot influence weights.
- Verify that outcome recording depends only on `ArafEscrow.getRewardableTrade`.

### Phase D — Claim enabled
- Enable epoch finalization/claim in controlled rollout.
- Increase operational monitoring and reserve-liability checks.
- Explain claim window, claimDelay, and dust sweep rules clearly to users (see the parameters in section 5).

### Phase E — Product pool enabled
- Enable product pool metadata/funding layer.
- Recipient selection remains contract-authoritative.
- Product pool must remain a funding/metadata bucket, not an eligibility engine.

## 4) Safety Notes

- No hardcoded production addresses.
- Treasury switch is a separate step from deployment.
- Oracle-free dispute model and settlement authority stay on-chain.
- Reward budget must never become large enough to economically encourage risky release behavior.
- Reward language must not be presented as guaranteed yield or per-trade cashback.

## 5) Contract Parameters (verified from `ArafRewards` / `ArafRevenueVault`)

Rollout phases are product and operations stages. On-chain, recording, finalization, claim and dust sweep are **permissionless and cannot be paused by the owner**; the only gates are time windows and finalization. "Claim disabled/enabled" above therefore means whether the product exposes it and operations are ready, not an on-chain switch.

| Parameter | Value |
|---|---|
| Epoch length (`epochDuration`) | 30 days (`block.timestamp / epochDuration`) |
| `claimDelay` | 24 hours after epoch end |
| Recording window | closes at epoch end + `claimDelay`; `finalizeEpochToken` is open to anyone after that |
| `claimWindow` | 7 days after `claimDelay` |
| Clean release weight (by `terminalAt - paidAt`) | ≤ 1 h: 2.5× · ≤ 24 h: 1.5× · ≤ 72 h: 1.0× · slower or no `paidAt`: 0.5× |
| Partial settlement weight | 0.3× |
| Tier multipliers | Tier 1: 1.0× · Tier 2: 1.1× · Tier 3: 1.2× · Tier 4: 1.3× · Tier 0: not eligible |
| Weight formula | `stableNotional × outcome × tier`; maker and taker receive the same weight |
| Claim amount | `epochRewardPool × userWeight / totalWeight` |
| Dust | after the claim window (or once all weight has claimed) `sweepEpochDust` rolls the unclaimed remainder into the **current** epoch's pool; no recipient can be chosen |
| Funding | sponsor funding targets the current or a future epoch; the epoch pool = sponsor funding for that epoch + owner-triggered `allocateEpochRewards` from the reward reserve |
| Owner powers | `setRewardBps` (4000–7000), `allocateEpochRewards`, `setProductPool`, `withdrawTreasuryShare*` (treasury reserve only; the reward reserve is not withdrawable), `setSupportedToken`, `setFinalTreasury`, `pause()` / `unpause()`; `setRewards` is single use. `allocateEpochRewards` is `whenNotPaused` (`ArafRewards.sol:225`), so an owner pause of `ArafRewards` blocks allocation only; recording, finalize, claim and sweep stay open |

Backend/frontend surfaces: public read-only mirror under `/api/rewards/*` and admin `/api/admin/revenue`, `/api/admin/rewards/health`; `claimable` is never estimated by the backend (use the on-chain getter). The rewards flags in the `.env.example` files (`REWARDS_READ_ONLY`, `REWARDS_SOURCE`) are documentation constants and are not read by code.

## Pre-Go-Live Verification
- Vault contract address must be verified from deployment manifest/config.
- Rewards contract address must be verified from deployment manifest/config.
- Supported token set must be USDT/USDC.
- `rewardBps` must start at 4000.
- Backend/frontend remain read-only / mirror-only.
- Backend/frontend do not define reward eligibility, weights, outcomes, recipients, or claimable authority.
- Treasury switch is not part of deployment.
- Treasury switch is a separate explicit post-verification operation.
- No production address is hardcoded.
- Smoke and verify commands must pass before treasury switch (`npm run smoke:rewards` runs on the local Hardhat network; `npm run verify:rewards` is the read-only wiring check; `npm run switch:rewards:treasury` needs `CONFIRM_TREASURY_SWITCH=true` and `EXPECTED_CURRENT_TREASURY_ADDRESS`).
- Fast clean release / partial settlement / zero-weight outcome recording must be verified in staging.
- Sponsor/funder cannot choose recipients.
- Admin cannot drain reward reserve as treasury.
