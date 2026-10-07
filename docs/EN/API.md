# 🌀 Araf Protocol API (Current Backend Surface)

> Base URL: `/api`  
> Canonical model: **V3 order-first** (parent order + child trade)

This document reflects the currently mounted backend routes in `backend/scripts/app.js`. The source of truth is the code; every middleware chain, limit and schema below is read from `backend/scripts/routes/*` and `backend/scripts/middleware/*`.

---

## 1) Auth model

Authentication uses SIWE + cookie sessions:
- `araf_jwt` — short-lived auth cookie (15 min, `httpOnly`, `SameSite=Lax`, `Secure` in production, path `/`)
- `araf_refresh` — refresh cookie (7-day sliding window, path `/api/auth`; absolute lifetime `REFRESH_ABSOLUTE_TTL_SECS`, default 30 days)
- trade-scoped PII token (`Authorization: Bearer ...`) for sensitive payout access (`PII_TOKEN_EXPIRES_IN`, default `15m`)

The auth JWT is read **only** from the cookie; there is no bearer fallback for normal auth. A JWT without `jti`, or one found on the Redis blacklist, is rejected. If Redis cannot answer within `JWT_BLACKLIST_TIMEOUT_MS` the blacklist check follows `JWT_BLACKLIST_FAIL_MODE` (default `closed` in production, `open` otherwise).

### Middleware reference

| Middleware | Behaviour | Errors |
|---|---|---|
| `requireAuth` | Valid `araf_jwt` cookie; sets `req.wallet` | `401` (no cookie / invalid / blacklisted), `403` (token type is not `auth`) |
| `requireSessionWalletMatch` | The `x-wallet-address` header (connected wallet) must equal the cookie wallet | `401 SESSION_WALLET_HEADER_MISSING`, `400 SESSION_WALLET_HEADER_INVALID`, `409 SESSION_WALLET_MISMATCH` |
| `requireAdminWallet` | Cookie wallet must be listed in `ADMIN_WALLETS` (comma separated, case-insensitive; empty list = nobody) | `403 { error: "Admin erişimi reddedildi." }` |
| `requirePIIToken` | `Authorization: Bearer <piiToken>`: `type=pii`, `tradeId` equals the path `:tradeId`, token wallet equals the session wallet | `400` (bad `tradeId`), `401` (header missing/invalid), `403` |

`SESSION_WALLET_MISMATCH` is also a **session-invalidation event**: the backend blacklists the current JWT, revokes the wallet's refresh families, clears both cookies and returns `409`.

### Rate limiters

All limiters return `429 { "error": "..." }` when exceeded (PII limiters add `retryAfter` in seconds) and set standard `RateLimit-*` headers. They are Redis-backed; when Redis is down the sensitive ones fall back to a process-local counter (never fail-open). Tiered limiters scale with the caller's mirrored `effective_tier` (0–4, bounded by `max_allowed_tier`; anonymous = tier 0; cached `RATE_LIMIT_TIER_CACHE_TTL_SECONDS`, default 120 s).

| Limiter | Window | Limit | Key |
|---|---|---|---|
| `authLimiter` | 1 min | 10 | IP |
| `nonceLimiter` | 1 min | 6 | IP + `wallet` query |
| `marketReadLimiter` | 1 min | 100 | IP |
| `statsReadLimiter` | 1 min | 60 | IP |
| `ordersWriteLimiter` | 1 hour | 5 | wallet |
| `ordersReadLimiter` | 1 min | 70 / 110 / 150 / 190 / 230 (tier 0–4) | wallet |
| `roomReadLimiter` | 1 min | 20 / 30 / 40 / 55 / 70 (tier 0–4) | wallet |
| `receiptUploadLimiter` | 10 min | 6 / 8 / 10 / 12 / 14 (tier 0–4) | wallet |
| `coordinationWriteLimiter` | 10 min | 8 / 12 / 16 / 20 / 24 (tier 0–4) | wallet |
| `feedbackLimiter` | 1 hour | 2 / 3 / 4 / 5 / 6 (tier 0–4) | wallet |
| `adminReadLimiter` | 1 min | 60 | wallet |
| `clientLogLimiter` | 1 min | 10 | IP |
| `piiProfileLimiter` | 10 min | 10 | IP + wallet |
| `piiTakerNameLimiter` | 10 min | 10 | IP + wallet + `onchainId` |
| `piiTokenRequestLimiter` | 10 min | 5 | IP + wallet + `tradeId` |
| `piiFetchLimiter` | 10 min | 5 | IP + wallet + `tradeId` |

### Common error shapes

- Joi validation failures: `400 { "error": "<joi message>" }`.
- Unknown path: `404 { "error": "İstenen endpoint bulunamadı" }`.
- Global handler: Mongoose validation `400 { error, details[] }`, duplicate key `409 { error: "Duplicate entry", message }`, JWT errors `401`, errors thrown with a 4xx `statusCode` pass through, anything else `500 { error: "Internal server error", message }`.
- Request body limit is 50 kb; CORS allows `GET, POST, PUT, DELETE` with credentials for `ALLOWED_ORIGINS`.

---

## 2) Mounted route groups

- `/api/auth`
- `/api/orders`
- `/api/trades`
- `/api/pii`
- `/api/feedback`
- `/api/stats`
- `/api/receipts`
- `/api/admin`
- `/api/reference-rates`
- `/api/rewards`
- `/api/logs`
- `/health` (liveness)
- `/ready` (readiness)

There is no `/api/listings` route in the codebase; the canonical market primitive is the parent order.

---

## 3) Auth routes (`/api/auth`)

### `GET /api/auth/nonce?wallet=<address>`
Middleware: `authLimiter`, `nonceLimiter`. `wallet` must match `^0x[a-fA-F0-9]{40}$` (`400` otherwise).

Generates a SIWE nonce (Redis-backed, 5-minute TTL). Response: `{ nonce, siweDomain, siweUri, termsVersion }`. `503` if the SIWE config is invalid (`SIWE_*` message).

### `POST /api/auth/verify`
Middleware: `authLimiter`.

Request (Joi):
```json
{ "message": "EIP-4361 message (max 2000 chars)", "signature": "0x… (130 hex chars)" }
```
Verifies the SIWE signature and sets the auth/refresh cookies. Terms acceptance is carried inside the signed SIWE `statement` (`I accept the Araf Terms of Use v<YYYY-MM-DD>`); the first signed acceptance per wallet and version is stored permanently (`TermsAcceptance`). Response: `{ wallet, profile, terms: { version } }`.

Errors: `400` (schema), `401 { code: "TERMS_NOT_ACCEPTED", reason: "UNSUPPORTED_VERSION" | "ACCEPTANCE_REQUIRED", termsVersion }`, `401 { error: "Kimlik doğrulama başarısız: ..." }` (expected SIWE failures), `500` generic message for unexpected failures.

### `GET /api/auth/me`
Middleware: `requireAuth` (the `x-wallet-address` header is optional here; if present and different from the cookie wallet the session is invalidated and `409 SESSION_WALLET_MISMATCH` is returned).

Response: `{ wallet, authenticated: true, isAdmin, hasPayoutProfile }`.
- `isAdmin`: whether the wallet is in `ADMIN_WALLETS` (same logic as `requireAdminWallet`).
- `hasPayoutProfile`: whether the user has a SAVED payout profile on the backend (boolean only, no PII). If the lookup fails it is `null`; clients treat `null` as "unknown" and keep order creation/filling blocked (fail-closed).

### `POST /api/auth/refresh`
Middleware: `authLimiter`. Reads the `araf_refresh` cookie (`401` if missing).

Request body (optional, compatibility only; not an authority source):
```json
{ "wallet": "0x..." }
```
Rotates the refresh token and issues a new `araf_jwt`; response `{ wallet }`. If two tabs race inside `REFRESH_REUSE_GRACE_MS` (default 10 s) only a new JWT is issued and the refresh cookie is **not** overwritten. A malformed `wallet` returns `400`. Any refresh failure clears both cookies and returns `401 { error }` (plus `code: "TERMS_NOT_ACCEPTED"` when the terms version is no longer accepted).

### `POST /api/auth/logout`
Middleware: `authLimiter` (deliberately **no** `requireAuth`).

Works with a validly-signed but expired JWT, or with the `araf_refresh` cookie alone. The identity is still cryptographically resolved: JWT signature first, otherwise the server-side refresh record. If a signed JWT is present it is blacklisted; all refresh families of the resolved wallet are revoked; both cookies are cleared. When no identity can be resolved only the cookies are cleared. Always returns `{ success: true, message }`.

### `PUT /api/auth/profile`
Middleware: `requireAuth`, `requireSessionWalletMatch`, `authLimiter`.

Updates the encrypted payout profile (rail-aware) in `User.payout_profile`.

Key behavior:
- Payout-profile writes are blocked while an active trade exists (`LOCKED/PAID/CHALLENGED`, as maker or taker), including first-ever creation: `409 { code: "BANK_PROFILE_LOCKED_DURING_ACTIVE_TRADE" }`. The snapshot is taken when the trade locks and must not change for the trade's lifetime (fraud prevention). Contact-only changes are not treated as a bank-profile change.
- Whether the bank profile changed is decided by comparing HMAC fingerprints (`hmac-v1`) of the old and new details plus rail/country; only a real change bumps `profileVersion` and the 7d/30d change counters.

Accepted request body:
```json
{
  "payoutProfile": {
    "rail": "TR_IBAN | US_ACH | SEPA_IBAN",
    "country": "TR | US | DE | ...",
    "contact": {
      "channel": "telegram | email | phone | null",
      "value": "string | null"
    },
    "fields": {
      "account_holder_name": "string",
      "iban": "string | null",
      "routing_number": "string | null",
      "account_number": "string | null",
      "account_type": "checking | savings | null",
      "bic": "string | null",
      "bank_name": "string | null"
    }
  }
}
```
All of `rail`, `country`, `contact.channel`, `contact.value`, and every `fields.*` key are required (use `null` for unused ones). `account_holder_name` is 2–100 letters/space/apostrophe/dot/hyphen; `bank_name` max 120; `contact.value` max 120.

Rail-country rules (enforced):
- `TR_IBAN` -> `TR`
- `US_ACH` -> `US`
- `SEPA_IBAN` -> one of `DE, FR, NL, BE, ES, IT, AT, PT, IE, LU, FI, GR`

IBAN checks: `TR_IBAN` must match `TR` + 24 digits; `SEPA_IBAN` must match `^[A-Z]{2}[A-Z0-9]{13,32}$` and its country prefix must equal `country`; both must pass the ISO 13616 mod-97 checksum. `US_ACH`: `routing_number` is 9 digits, `account_number` 4–17 digits, `account_type` required.

Contact canonicalization:
- `telegram`: leading `@` is removed before storage; `^[a-zA-Z0-9_]{5,32}$`
- `email`: validated with basic e-mail pattern
- `phone`: spaces are removed, then validated with `^\+?[0-9]{7,15}$`
- `channel/value` must be both present or both null

Rail-specific fields:
- `TR_IBAN`: `account_holder_name`, `iban`, optional `bank_name`
- `SEPA_IBAN`: `account_holder_name`, `iban`, optional `bic`, optional `bank_name`
- `US_ACH`: `account_holder_name`, `routing_number`, `account_number`, `account_type`, optional `bank_name`

Response: `{ success, message, bankProfileChanged, profileVersion, lastBankChangeAt, bankChangeCount7d, bankChangeCount30d, payoutProfile: { rail, country, contact: { channel }, fingerprintVersion } }` (no PII is echoed back).

Invalid example (rejected with 400):
```json
{ "payoutProfile": { "rail": "US_ACH", "country": "TR", "contact": { "channel": null, "value": null }, "fields": { "account_holder_name": "John Doe", "iban": null, "routing_number": "021000021", "account_number": "1234567890", "account_type": "checking", "bic": null, "bank_name": null } } }
```

Legacy flat fields are no longer accepted: `bankOwner`, `iban`, `telegram`, `contactChannel`, `contactValue`.

---

## 4) Orders routes (`/api/orders`)

Order routes are read-layer mirrors of parent-order state. State-changing order actions happen on-chain.

### `GET /api/orders/config`
Middleware: `marketReadLimiter`. Public.

Returns the mirrored protocol config snapshot: `bondMap`, `feeConfig`, `cooldownConfig`, `tokenMap`, `paymentRiskConfig`, `reputationPolicy`, `deployment: { escrowAddress, chainId }` (from `ARAF_ESCROW_ADDRESS` / `EXPECTED_CHAIN_ID`; the frontend uses it to warn on deploy drift) and `selectedOrderRiskLevel`. `503` when the config mirror is not available (`CONFIG_UNAVAILABLE`).

### `GET /api/orders/payment-risk-config`
Middleware: `marketReadLimiter`. Public. Returns `{ paymentRiskConfig, selectedOrderRiskLevel }`; `503` when the config is unavailable.

### `GET /api/orders`
Middleware: `marketReadLimiter`. Public order feed. Query (Joi):

| Param | Values | Default |
|---|---|---|
| `side` | `SELL_CRYPTO` \| `BUY_CRYPTO` | — |
| `status` | `ACTIVE` (= `OPEN` + `PARTIALLY_FILLED`) \| `OPEN` \| `PARTIALLY_FILLED` \| `FILLED` \| `CANCELED` | — |
| `tier` | `0`–`4` (exact) | — |
| `max_tier` | `0`–`4` (orders with `tier <= max_tier`; ignored when `tier` is given) | — |
| `token_address` | `0x` + 40 hex | — |
| `owner_address` | `0x` + 40 hex | — |
| `fiat` | `TRY` \| `USD` \| `EUR` | — |
| `min_amount` | positive number in token units (`503` if token decimals are unknown) | — |
| `sort` | `default` \| `best_rate` \| `newest` | `default` |
| `page` | integer ≥ 1 | `1` |
| `limit` | integer 1–50 | `20` |

Response: `{ orders, total, page, limit }`. The response is cached in memory per URL for `MARKET_CACHE_TTL_MS` (default 10 s; `0` in tests); a hit adds the `X-Cache: HIT` header. Each order carries `trust_visibility_summary` and `owner_has_payout_profile` (boolean): whether the order owner has a saved payout profile. No PII/encrypted fields are returned; the UI disables filling when false.

### `GET /api/orders/my`
Middleware: `requireAuth`, `requireSessionWalletMatch`, `ordersReadLimiter`. Query: `page` (default 1), `limit` (1–50, default 20). Response `{ orders, total, page, limit }` for caller-owned orders, newest update first.

### `POST /api/orders/market-meta`
Middleware: `requireAuth`, `requireSessionWalletMatch`, `ordersWriteLimiter` (5/hour).

Stores the maker's off-chain fiat/rate (UI enrichment only, non-authoritative, set-once).
```json
{ "orderRef": "0x… (64 hex)", "fiatCurrency": "TRY | USD | EUR", "exchangeRate": 36.5 }
```
`exchangeRate` is positive, max 1 000 000. `201 { success, applied: true }` when applied to an existing mirror order; `202 { success, applied: false }` when the mirror does not exist yet (the intent is held and applied by the worker on `OrderCreated` after verifying the owner). Errors: `400`, `403` (order belongs to someone else), `409 { code: "MARKET_META_ALREADY_SET" }`.

### `GET /api/orders/:id/trades`
Middleware: `requireAuth`, `requireSessionWalletMatch`, `ordersReadLimiter`. Owner-only (`403` for non-owners, `404` unknown order, `400` bad id).

Paginated child trades of the caller-owned order. Query: `page` (default 1), `limit` (1–100, default 50). Response: `{ trades, total, page, limit }`, newest first. PII snapshot, encrypted receipt payload and raw signature fields are not part of the projection.

### `GET /api/orders/:id`
Middleware: `marketReadLimiter`. Returns `{ order }` for one mirrored parent order by on-chain order ID (`400` bad id, `404` unknown).

---

## 5) Trades routes (`/api/trades`)

Trades are child-trade read/coordination endpoints. Backend remains **non-authoritative** for settlement outcomes:
- no backend/admin approval can finalize settlement,
- no backend/admin action can override release/cancel/burn/payout,
- final economic outcome is determined only by accepted on-chain tx.

All trade routes use `requireAuth` + `requireSessionWalletMatch`; access is restricted to the trade's maker or taker (`403 Erişim reddedildi.` otherwise). Mongo trade ids must be 24 hex chars (`400` otherwise).

### Partial settlement semantics
- **What it is:** a party-agreed split payout flow for a single child trade.
- **Lifecycle:** `NONE -> PROPOSED -> REJECTED/WITHDRAWN/EXPIRED/FINALIZED`.
- **Who can propose:** only one of the two trade counterparties (`maker` or `taker`) of that trade.
- **Who can accept/reject:** only the **counterparty** can accept or reject an active proposal.
- **Who can withdraw:** only the proposer can withdraw a still-active proposal.
- **Who can expire:** anyone can trigger expiry after deadline; this is still contract-validated.

### Backend role in settlement flow
- preview surface (`POST /api/trades/:id/settlement-proposal/preview`) for informational split math
- event mirror from contract logs
- read model projection for query/UX
- audit/observability for operations (including admin read-only analytics)

### Backend is NOT allowed to do
- determine settlement outcome
- override `release/cancel/burn` or payout authority
- write reputation authority state
- transfer funds

### `GET /api/trades/my`
Middleware: `roomReadLimiter`. Active (non-terminal) trades of the caller. Query: `page` (default 1), `limit` (1–50, default 20). Response `{ trades, total, page, limit }`; each trade carries `bank_profile_risk` and `offchain_health_score_input` (read-only signals; the raw `payout_snapshot` is not returned).

### `GET /api/trades/history`
Middleware: `roomReadLimiter`. Terminal trades (`RESOLVED/CANCELED/BURNED`), sorted by `timers.resolved_at` desc. Query: `page` (default 1), `limit` (1–50, default **10**). Same response shape as `/my`.

### `GET /api/trades/by-escrow/:onchainId`
Middleware: `roomReadLimiter`. Fetches a child trade by on-chain trade identity (`onchain_escrow_id`; positive integer, `400` otherwise). Response `{ trade }`; `404` unknown.

### `GET /api/trades/:id`
Middleware: `roomReadLimiter`. Fetches a trade by Mongo `_id`. Response `{ trade }`; `404` unknown.

### Cancel coordination (no backend route)
Mutual cancel runs fully on-chain: each party sends its own `proposeOrApproveCancel(tradeId)` tx and the second consent executes it. Before the second consent a party may withdraw its own consent with `revokeCancel(tradeId)` (`CancelRevoked` event).
The worker mirrors `CancelProposed` into `cancel_proposal`. The backend stores no signatures; the old `POST /api/trades/propose-cancel` was removed.

### `POST /api/trades/:id/chargeback-ack`
Middleware: `coordinationWriteLimiter`. Maker-only acknowledgment (legal/risk audit signal) for `PAID/CHALLENGED` states; it never gates an on-chain call. The caller IP is stored only as a master-key HMAC (`chargeback-ip`), never as plain SHA-256.

`201 { success, acknowledged_at, message }`. Errors: `404`, `403` (not the maker), `409 { error, acknowledged_at }` (already acknowledged), `400` (state not `PAID/CHALLENGED`).

### `GET /api/trades/:id/settlement-proposal`
Middleware: `roomReadLimiter`. Returns `{ tradeId, settlement_proposal }` (trade-scoped partial-settlement mirror payload, always flagged `informational_only` and `non_authoritative_semantics`). Read-model only; **informational**, non-authoritative.

### `POST /api/trades/:id/settlement-proposal/preview`
Middleware: `roomReadLimiter`. Computes an informational split preview from the **on-chain** `getCurrentAmounts(tradeId)` (needs `BASE_RPC_URL`, `ARAF_ESCROW_ADDRESS` and a passing chain-id check) and the trade's fee snapshot.

Request (Joi):
```json
{ "makerShareBps": 7000 }
```
`makerShareBps` is an integer 0–10000.

Response fields:
- `informationalOnly: true`, `nonAuthoritative: true`, `poolSource: "onchain-current-amounts"`
- `makerShareBps`, `takerShareBps`
- `pool`, `grossMaker`, `grossTaker`, `makerFee`, `takerFee`, `makerPayout`, `takerPayout`, `decayedAmount`, `treasuryAmount` (BigInt-safe strings)
- `warning`: only the on-chain accepted tx determines the final outcome

Errors: `409 { code: "SETTLEMENT_ONLY_CHALLENGED" }` (preview is only available while the trade is `CHALLENGED`), `503 { code: "PREVIEW_UNAVAILABLE" }` (RPC/contract config missing, read failed, or the trade has no valid on-chain id), `400`, `403`, `404`.

### Payment risk semantics (`PaymentRiskLevel`)
- `PaymentRiskLevel` is **not** a trust/reputation grade for a user.
- It is a payment-rail complexity/availability signal for UX/read-model purposes.
- It must never become authority for on-chain outcome or settlement finalization.

---

## 6) PII routes (`/api/pii`)

PII routes are child-trade-scoped and heavily guarded. Every route runs `requireAuth` + `requireSessionWalletMatch`, then its **own** rate limiter (one bucket per endpoint; trade-scoped endpoints are keyed per trade, so hitting one endpoint does not lock the others). Sensitive responses carry `Cache-Control: no-store, max-age=0` and `Pragma: no-cache`. PII is only available while the trade is `LOCKED/PAID/CHALLENGED` in the mirror **and** not closed on-chain.

### `GET /api/pii/my`
Limiter: `piiProfileLimiter` (10 / 10 min). Returns `{ pii }`: the caller's own decrypted payout profile (`{ rail, country, contact: { channel, value }, fields }`), or `{ pii: null }`.

### `GET /api/pii/taker-name/:onchainId`
Limiter: `piiTakerNameLimiter` (10 / 10 min per trade). Maker-only: the maker reads the taker's account-holder name from the lock-time snapshot. Response `{ bankOwner }` (`null` when no taker yet).

Errors: `400` (bad id / state not active / closed on-chain), `403` (caller is not the maker), `404`, `409 { code: "SNAPSHOT_UNAVAILABLE" }` (snapshot missing or incomplete; there is no current-profile fallback), `503 { code: "IDENTITY_NORMALIZATION_REQUIRED" }` (identity migration not completed, see the deployment guide).

### `POST /api/pii/request-token/:tradeId`
Limiter: `piiTokenRequestLimiter` (5 / 10 min per trade). Taker-only. Issues a short-lived trade-scoped PII token: `{ piiToken }`. Errors: `400` (bad id / state), `403` (not the taker), `404`.

### `GET /api/pii/:tradeId`
Middleware order: `requireAuth`, `requireSessionWalletMatch`, `requirePIIToken`, `piiFetchLimiter` (5 / 10 min per trade). Returns the maker payout info from the lock-time snapshot: `{ payoutProfile: { rail, country, contact: { channel, value }, fields }, notice }`.

Errors: `403` (not the taker, trade no longer active, closed on-chain), `404`, `409 { code: "SNAPSHOT_UNAVAILABLE" }`, `500` on decrypt failure (generic message).

Security characteristics:
- no-store cache headers on sensitive responses
- snapshot-first behavior for trade consistency (no fallback to the current profile)
- access restricted by wallet role + trade state + trade-scoped token + session wallet

---

## 7) Receipt route (`/api/receipts`)

### `POST /api/receipts/upload`
Middleware: `requireAuth`, `requireSessionWalletMatch`, `receiptUploadLimiter`, then the multipart parser. Uploads an encrypted receipt payload for a child trade.

Expected multipart fields:
- `receipt` file (JPEG/PNG/WebP/GIF/PDF, max 5 MB)
- `onchainEscrowId` (positive numeric trade ID)

Behavior:
- verifies MIME magic bytes
- encrypts payload with the caller's wallet-derived key
- stores receipt hash + encrypted blob on the trade document (receipt retention: 30 days)
- allowed only for the taker while the trade is `LOCKED`, once per trade

Response: `201 { hash }`. Errors: `400` (no file / bad `onchainEscrowId` / trade not `LOCKED`), `403` (not the taker), `404`, `409` (receipt already uploaded; no overwrite), `413` (over 5 MB), `415` (unsupported MIME or magic-byte mismatch).

---

## 8) Feedback, stats, logs, reference rates

### `POST /api/feedback`
Middleware: `requireAuth`, `requireSessionWalletMatch`, `feedbackLimiter`.
```json
{ "rating": 1, "comment": "optional, max 1000 chars", "category": "bug | suggestion | ui/ux | other" }
```
`rating` is an integer 1–5. Response `201 { success, message }`.

### `GET /api/stats`
Middleware: `statsReadLimiter`. Public protocol statistics: `{ stats }` from the latest `HistoricalStat` row plus `changes_30d` and `meta` (`cache_ttl_seconds`, `open_order_semantics`, `numeric_fields_are_approximate`). Cached in Redis for 300 s. `{ stats: {} }` when no snapshot exists yet.

### `POST /api/logs/client-error`
Middleware: `clientLogLimiter`. Client-side non-blocking error telemetry used by the frontend runtime. Body: `message` (required string, max 500 kept), optional `stack`, `componentStack`, `url`. Control characters and PII-looking tokens (IBAN, wallet, e-mail, bearer/JWT) are redacted before logging. Response `204`; `400` when `message` is missing.

### `GET /api/reference-rates/ticker`
Middleware: `marketReadLimiter`. Public informational reference rate strip: `{ items, generatedAt, informationalOnly: true, nonAuthoritative: true, canAffectSettlement: false }`. Rows older than `REFERENCE_TICKER_MAX_STALE_SECONDS` (default 86400) are dropped instead of carried forward.

---

## 9) Rewards mirror (`/api/rewards`)

Public, read-only mirror of reward events; the whole router sits behind `marketReadLimiter`. Authority stays in `ArafRewards` / `ArafRevenueVault`; the backend never computes recipients, weights or claimable amounts.

| Route | Response |
|---|---|
| `GET /api/rewards/epochs/current` | `{ epoch, rows, source: "WALL_CLOCK_ESTIMATE_NOT_AUTHORITY" }` (30-day epoch estimated from the wall clock) |
| `GET /api/rewards/epochs/:epoch` | `{ epoch, rows }`; `:epoch` is 1–12 digits (`400` otherwise) |
| `GET /api/rewards/health` | `{ mirror_only: true, counts: { epochs, claims, funding } }` |
| `GET /api/rewards/funding/global` | `{ rows }` (latest 200 `GLOBAL` funding events) |
| `GET /api/rewards/funding/product/:productId` | `{ productId, rows }`; `:productId` is `0x` + 64 hex (`400` otherwise); latest 200 |
| `GET /api/rewards/:wallet/claimable` | `{ wallet, claimable: [], source: "ESTIMATE_UNAVAILABLE_USE_ONCHAIN_GETTER" }`; always empty, use the on-chain `claimable(...)` getter |
| `GET /api/rewards/:wallet/history` | `{ wallet, claims }` (latest 200 claim events); bad address `400` |

---

## 10) Admin read-only observability (`/api/admin`)

The whole router runs `requireAuth` → `requireSessionWalletMatch` → `requireAdminWallet` → `adminReadLimiter` (60 / min per wallet). No write/override actions are exposed. Admin access is controlled only by `ADMIN_WALLETS`.

| Route | Query (Joi) | Response |
|---|---|---|
| `GET /api/admin/summary` | — | `{ timestamp, readiness, stats, tradeCounts, settlementAnalytics, resolutionAnalytics, dlq, scheduler, degraded }`; each sub-source degrades independently and is listed in `degraded.errors` |
| `GET /api/admin/trades` | `status` (`ALL\|LOCKED\|PAID\|CHALLENGED\|RESOLVED\|CANCELED\|BURNED`, default `CHALLENGED`), `tier` 0–4, `origin` (`ALL\|ORDER_CHILD\|DIRECT_ESCROW`), `riskOnly` (bool), `snapshotComplete` (`ALL\|true\|false`), `page`, `limit` (1–50, default 20) | `{ trades, total, page, limit, paginationScope }`. `riskOnly=true` works over a bounded window (`windowSize` 1000) and says so in `paginationScope` |
| `GET /api/admin/settlement-proposals` | `state` (`ALL\|PROPOSED\|EXPIRED\|FINALIZED\|REJECTED\|WITHDRAWN`, default `ALL`), `riskOnly` (bool), `page`, `limit` (1–50, default 20) | `{ proposals, total, page, limit }`; proposals are flagged `informational_only` / `non_authoritative_semantics` |
| `GET /api/admin/feedback` | `category`, `rating` 1–5, `page`, `limit` (1–50, default 20) | `{ feedback, total, page, limit }` |
| `GET /api/admin/revenue` | — | `{ rows }` (latest 500 `RevenueEvent` rows) |
| `GET /api/admin/rewards/health` | — | `{ mirror_only: true, counts: { epochs, funding, claims } }` |

Non-admin wallets receive `403`; the `scheduler` block of `/summary` lists `reputationDecayLastRunAt`, `statsSnapshotLastRunAt`, `sensitiveCleanupLastRunAt`, `userBankRiskCleanupLastRunAt`.

---

## 11) Health endpoints

Neither endpoint has a rate limiter or authentication; they are not under `/api`.

### `GET /health`
Liveness probe (process-up signal, in-memory, no RPC calls). `200 { status: "ok", timestamp, worker: { state, lastBlockAgeMs } }`. If the event worker is watching blocks and no new block was seen for `WORKER_LIVENESS_STALE_MS` the status is `"stale"` and the HTTP code is **`503`** (so the platform restarts the machine). Without a worker object it is always `ok`. This is the Fly.io health check (`backend/fly.toml`).

### `GET /ready`
Readiness probe: Mongo, Redis, provider, chain id, config, replay bootstrap and worker (state, lag ≤ `WORKER_MAX_LAG_BLOCKS`, not `replaying`). `200` when ready, `503` when not (`503 { ok: false, error: "readiness_unavailable" }` if the check itself fails).

- The result is cached for `READY_CACHE_TTL_MS` (default 7000 ms, clamped to 5000–10000) and concurrent calls are coalesced, so an unauthenticated caller cannot trigger RPC calls on every request.
- **Unauthenticated view is redacted:** `{ ok, checks, worker: { state, replaying, lagBlocks }, configIssueCount, degraded, degradedReasons }`; missing-config names, block numbers, chain ids and worker diagnostics are not exposed.
- **Internal view:** send the header `x-internal-token: <READY_INTERNAL_TOKEN>` (constant-time comparison; disabled when the env is not set) to get the full body including `missingConfig`, `worker.diagnostics` and block/chain details.

---

## 12) Canonical terminology notes

- Canonical market primitive is **parent order**, not listing.
- Canonical escrow lifecycle is **child trade**.
- `onchain_escrow_id` in backend models refers to child-trade on-chain identity.
- Backend is a mirror/coordination layer, not protocol authority.
