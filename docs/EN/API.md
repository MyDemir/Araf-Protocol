# 🌀 Araf Protocol API (Current Backend Surface)

> Base URL: `/api`  
> Canonical model: **V3 order-first** (parent order + child trade)

This document reflects the currently mounted backend routes in `backend/scripts/app.js` (via the `backend/scripts/routes/mounts.js` list). The source of truth is the code; every middleware chain, limit and schema below is read from `backend/scripts/routes/*` and `backend/scripts/middleware/*`. Last verified: 2026-10-22.

---

## 1) Auth model

Authentication uses SIWE + cookie sessions:
- `araf_jwt` — short-lived auth cookie (15 min, `httpOnly`, `SameSite=Lax`, `Secure` in production, path `/`)
- `araf_refresh` — refresh cookie (7-day sliding window, path `/api/auth`; absolute lifetime `REFRESH_ABSOLUTE_TTL_SECS`, default 30 days)
- trade-scoped PII token (`Authorization: Bearer ...`) for sensitive payout access (`PII_TOKEN_EXPIRES_IN`, default `15m`)

The auth JWT is read **only** from the cookie; there is no bearer fallback for normal auth. A JWT without `jti`, or one found on the Redis blacklist, is rejected. If Redis cannot answer within `JWT_BLACKLIST_TIMEOUT_MS` the blacklist check follows `JWT_BLACKLIST_FAIL_MODE` (default `closed` in production: the request is rejected with `401`; `open` otherwise).

Raw `jsonwebtoken` errors are not echoed; they carry a fixed message and a machine-readable `code`: an expired token is `401 { code: "TOKEN_EXPIRED" }`, a token with a bad signature/format (or not yet valid) is `401 { code: "TOKEN_INVALID" }`. Both codes apply to `requireAuth` and `requirePIIToken`; on `TOKEN_EXPIRED` the client tries `POST /api/auth/refresh`.

### Middleware reference

| Middleware | Behaviour | Errors |
|---|---|---|
| `requireAuth` | Valid `araf_jwt` cookie; sets `req.wallet` | `401` (no cookie / no `jti` / blacklisted; JWT errors carry `TOKEN_EXPIRED` or `TOKEN_INVALID`), `403` (token type is not `auth`) |
| `requireSessionWalletMatch` | The `x-wallet-address` header (connected wallet) must equal the cookie wallet | `401 SESSION_WALLET_HEADER_MISSING`, `400 SESSION_WALLET_HEADER_INVALID`, `409 SESSION_WALLET_MISMATCH` |
| `requireAdminWallet` | Cookie wallet must be listed in `ADMIN_WALLETS` (comma separated, case-insensitive; empty list = nobody) | `403 { error: "Admin erişimi reddedildi." }` |
| `requirePIIToken` | `Authorization: Bearer <piiToken>`: `type=pii`, `tradeId` equals the path `:tradeId`, token wallet equals the session wallet | `400` (bad `tradeId`), `401` (header missing; JWT errors carry `TOKEN_EXPIRED` / `TOKEN_INVALID`), `403` (type / `tradeId` / wallet mismatch) |

`SESSION_WALLET_MISMATCH` returned by `requireSessionWalletMatch` is also a **session-invalidation event**: the backend blacklists the current JWT, revokes the wallet's refresh families, clears both cookies and returns `409`. `GET /api/auth/me` returns the same `409` code on a header mismatch but invalidates less: it only revokes the refresh families and clears the cookies; the JWT is **not** blacklisted there.

### Rate limiters

All limiters return `429 { "error": "..." }` when exceeded (PII and admin-write limiters add `retryAfter` in seconds) and set standard `RateLimit-*` headers. They are Redis-backed; when Redis is down **every** limiter falls back to a process-local counter (no route is left unbounded, never fail-open). The IP key is `req.ip`; if `ORIGIN_SHARED_SECRET` is set and the request carries the same secret in the `x-araf-origin-secret` header, a valid `x-real-ip` is used instead (Vercel rewrite chain; `backend/scripts/utils/clientIp.js`). Tiered limiters scale with the caller's mirrored `effective_tier` (0–4, bounded by `max_allowed_tier`; anonymous = tier 0; cached for the `RATE_LIMIT_TIER_CACHE_TTL_SECONDS` runtime setting, default 120 s).

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
| `adminWriteLimiter` | 10 min | 10 | wallet |
| `clientLogLimiter` | 1 min | 10 | IP |
| `piiProfileLimiter` | 10 min | 10 | wallet (IP if anonymous) |
| `piiTakerNameLimiter` | 10 min | 10 | wallet + `onchainId` (IP if anonymous) |
| `piiTokenRequestLimiter` | 10 min | 5 | wallet + `tradeId` (IP if anonymous) |
| `piiFetchLimiter` | 10 min | 5 | wallet + `tradeId` (IP if anonymous) |

PII limiters key on the authenticated wallet only (plus `onchainId`/`tradeId`) when one is present, so rotating IPs cannot multiply the limit. Because the auth chain runs before the limiter on these routes, the key is always the wallet in practice.

### Common error shapes

- Joi validation failures: `400 { "error": "<joi message>" }`.
- Unknown path: `404 { "error": "İstenen endpoint bulunamadı" }`.
- Global handler: Mongoose validation `400 { error: "Doğrulama başarısız.", details[] }`, duplicate key `409 { error: "Duplicate entry", message }`, JWT errors `401 { error, message }`, errors thrown with a 4xx `statusCode` pass through as `{ error }`, anything else `500 { error: "Internal server error", message }`. Multer errors on the receipt upload return fixed codes (see section 7): `413 RECEIPT_TOO_LARGE`, `415 RECEIPT_UNSUPPORTED_TYPE`, `400 RECEIPT_UPLOAD_INVALID`.
- Request body limit is 50 kb; CORS allows `GET, POST, PUT, DELETE` with credentials for `ALLOWED_ORIGINS`. The body is sanitized with `express-mongo-sanitize` (keys containing `$`/`.` are replaced with `_`).

### Degraded mode and escrow-guard gate (under `/api`, before all routes)

`requireFullService` (`backend/scripts/middleware/requireFullService.js`) is mounted once under `/api` and is **default-deny**: in the two situations below, every endpoint outside the allowlist (including future ones) answers `503` with `Retry-After: 30`.

- **Degraded mode** (the RPC was transiently unreachable at boot): only `GET /orders`, `/orders/config`, `/orders/payment-risk-config`, `/orders/:id` (numeric id), `/stats`, `/reference-rates/ticker`, `/rewards/*`, `/social-links`, `POST /logs/client-error` and the auth endpoints (`GET /auth/nonce`, `POST /auth/verify`, `/auth/refresh`, `/auth/logout`, `GET /auth/me`) pass; allowed responses carry `X-Araf-Degraded: true` (config endpoints served from a stale config additionally carry `X-Araf-Config-Stale: true`). Everything else: `503 { code: "SERVICE_DEGRADED", degradedReasons[] }`.
- **Escrow guard** (`ESCROW_REGISTRY_GUARD_MODE=enforce` and the active escrow record in Mongo does not match `ARAF_ESCROW_ADDRESS`/`EXPECTED_CHAIN_ID`): only escrow-independent endpoints pass (`POST /logs/client-error`, the auth endpoints, `GET /social-links`, `GET /reference-rates/ticker`, `POST /feedback`); everything else: `503 { code: "ESCROW_MISMATCH", reason }`. In `warn`/`off` mode it has no effect.

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
- `/api/social-links`
- `/health` (liveness)
- `/ready` (readiness)

There is no `/api/listings` route in the codebase; the canonical market primitive is the parent order.

---

## 3) Auth routes (`/api/auth`)

### `GET /api/auth/nonce?wallet=<address>`
Middleware: `authLimiter`, `nonceLimiter`. `wallet` must match `^0x[a-fA-F0-9]{40}$` (`400` otherwise).

Generates a SIWE nonce (Redis-backed, 5-minute TTL). Response: `{ nonce, siweDomain, siweUri, termsVersion }`. `503 { error: "Kimlik doğrulama servisi geçici olarak kullanılamıyor." }` if the SIWE config is invalid (the `SIWE_*` detail is only in the server log).

### `POST /api/auth/verify`
Middleware: `authLimiter`.

Request (Joi):
```json
{ "message": "EIP-4361 message (max 2000 chars)", "signature": "0x… (130 hex chars)" }
```
Verifies the SIWE signature and sets the auth/refresh cookies. Terms acceptance is carried inside the signed SIWE `statement` (`I accept the Araf Terms of Use v<YYYY-MM-DD>`); the first signed acceptance per wallet and version is stored permanently (`TermsAcceptance`). Response: `{ wallet, profile, terms: { version } }`.

Errors: `400` (schema), `401 { code: "TERMS_NOT_ACCEPTED", reason: "UNSUPPORTED_VERSION" | "ACCEPTANCE_REQUIRED", termsVersion }`, `401 { error: "Kimlik doğrulama başarısız: ..." }` (expected SIWE failures), `500` generic message for unexpected failures.

### `GET /api/auth/me`
Middleware: `requireAuth` (the `x-wallet-address` header is optional here; if present and different from the cookie wallet, refresh families are revoked, cookies are cleared (the JWT is not blacklisted) and `409 SESSION_WALLET_MISMATCH` is returned).

Response: `{ wallet, authenticated: true, isAdmin, hasPayoutProfile, payoutRail, payoutRailEnabled }`.
- `isAdmin`: whether the wallet is in `ADMIN_WALLETS` (same logic as `requireAdminWallet`).
- `hasPayoutProfile`: whether the user has a SAVED payout profile on the backend (boolean only, no PII). If the lookup fails it is `null`; clients treat `null` as "unknown" and keep order creation/filling blocked (fail-closed).
- `payoutRail` / `payoutRailEnabled`: the saved profile's rail code (`TR_IBAN` / `US_ACH` / `SEPA_IBAN`) and whether an admin has that rail open. Both are `null` when there is no profile or it could not be read; `payoutRailEnabled: false` when the rail is closed (`hasPayoutProfile` keeps meaning "data exists").

### `POST /api/auth/refresh`
Middleware: `authLimiter`. Reads the `araf_refresh` cookie (`401` if missing).

Request body (optional, compatibility only; not an authority source):
```json
{ "wallet": "0x..." }
```
Rotates the refresh token and issues a new `araf_jwt`; response `{ wallet }`. If two tabs race inside `REFRESH_REUSE_GRACE_MS` (default 10 s) only a new JWT is issued and the refresh cookie is **not** overwritten. A malformed or non-string `wallet` returns `400`. An invalid/revoked/expired refresh token clears both cookies and returns `401 { error }` (plus `code: "TERMS_NOT_ACCEPTED"` when the terms version is no longer accepted). An infrastructure failure (Redis/DB outage) returns `503 { error: "AUTH_REFRESH_UNAVAILABLE" }` and the cookies are **not** cleared, so a transient outage does not mass-log-out users.

### `POST /api/auth/logout`
Middleware: `authLimiter` (deliberately **no** `requireAuth`).

Works with a validly-signed but expired JWT, or with the `araf_refresh` cookie alone. The identity is still cryptographically resolved: JWT signature first, otherwise the server-side refresh record. If a signed JWT is present it is blacklisted; all refresh families of the resolved wallet are revoked; both cookies are cleared. When no identity can be resolved only the cookies are cleared. On success it returns `{ success: true, message }`. If the JWT blacklist write fails (a stolen JWT could stay valid until its TTL ends) the cookies are still cleared but the response is `503 { code: "LOGOUT_REVOKE_INCOMPLETE" }`, so the client knows logout did not fully complete and retries.

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
All of `rail`, `country`, `contact.channel`, `contact.value`, and every `fields.*` key are required (use `null` for unused ones). `country` is 2–3 characters; `account_holder_name` is 2–100 letters/space/apostrophe/dot/hyphen; `bank_name` max 120; `contact.value` max 120.

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

Other errors:
- `400 { error }`: Joi/schema or business-rule violation (rail-country, IBAN, contact format).
- `409 { code: "PAYMENT_RAIL_DISABLED", rail }`: the profile is being created or its bank details are changing and the target rail has been closed by an admin. An already-saved, unchanged profile (contact-only update) is not gated.
- `503 { code: "PAYMENT_RAIL_STATE_UNAVAILABLE" }`: the rail state could not be read at all (cold start + DB error); the write gate is fail-closed.
- `409 { code: "PROFILE_UPDATE_CONFLICT" }`: another profile write slipped in between read and write (no lost update; the write is a single `updateOne` conditioned on `profileVersion` + the encrypted details, and a concurrent first creation is caught as a duplicate key). The client retries.

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

Returns the mirrored protocol config snapshot: `configStale`, `bondMap`, `feeConfig`, `cooldownConfig`, `tokenMap`, `paymentRiskConfig` (each rail entry carries `enabled`), `enabledPaymentRails`, `reputationPolicy`, `deployment: { escrowAddress, chainId }` (from `ARAF_ESCROW_ADDRESS` / `EXPECTED_CHAIN_ID`; the frontend uses it to warn on deploy drift) and `selectedOrderRiskLevel`. `configStale: true` means the config could not be refreshed from the chain and the last-known Redis copy is served (degraded mode). `503 { error }` when the config mirror is not available (internal error code `CONFIG_UNAVAILABLE`; the body has no separate `code` field).

### `GET /api/orders/payment-risk-config`
Middleware: `marketReadLimiter`. Public. Returns `{ configStale, paymentRiskConfig, enabledPaymentRails, selectedOrderRiskLevel }`; `503` when the config is unavailable.

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
| `min_amount` | positive number in token units, max `1e12` (`400` above that; `503` if token decimals are unknown) | — |
| `sort` | `default` \| `best_rate` \| `newest` | `default` |
| `page` | integer 1–200 | `1` |
| `limit` | integer 1–50 | `20` |

Response: `{ orders, total, page, limit }`. The response is cached in memory, keyed by the validated query values, for `MARKET_CACHE_TTL_MS` (runtime setting; default 10 s; `0` under `NODE_ENV=test` unless the env is set; at most 200 entries); a hit adds the `X-Cache: HIT` header. Invalid query: `400`. Each order carries `trust_visibility_summary`, `owner_has_payout_profile` (boolean: whether the order owner has a saved payout profile), `owner_rail_enabled` (boolean: whether the rail on the owner's profile is open; `true` when there is no profile/rail) and `owner_rail` (the rail code only, `TR_IBAN`/`SEPA_IBAN`/`US_ACH`, `null` if unknown). No PII/encrypted fields are returned; the UI disables filling when `owner_has_payout_profile` is false.

### `GET /api/orders/my`
Middleware: `requireAuth`, `requireSessionWalletMatch`, `ordersReadLimiter`. Query: `page` (default 1), `limit` (1–50, default 20). Response `{ orders, total, page, limit }` for caller-owned orders, newest update first.

### `POST /api/orders/market-meta`
Middleware: `requireAuth`, `requireSessionWalletMatch`, `ordersWriteLimiter` (5/hour).

Stores the maker's off-chain fiat/rate (UI enrichment only, non-authoritative, set-once).
```json
{ "orderRef": "0x… (64 hex)", "fiatCurrency": "TRY | USD | EUR", "exchangeRate": 36.5 }
```
`exchangeRate` is positive, max 1 000 000. `201 { success, applied: true }` when applied to an existing mirror order; `202 { success, applied: false }` when the mirror does not exist yet (the intent is held in Redis and applied by the worker on `OrderCreated` after verifying the owner). Errors: `400`, `403` (order belongs to someone else), `409 { code: "MARKET_META_ALREADY_SET" }` (rate already stored or a pending intent exists), `409 { code: "PAYMENT_RAIL_DISABLED", rail }` (the owner's saved profile is on a closed rail), `503 { code: "PAYMENT_RAIL_STATE_UNAVAILABLE" }` (rail state unreadable; fail-closed).

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
- audit/observability for operations (including admin read analytics and settings writes)

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

Errors: `409 { code: "SETTLEMENT_ONLY_CHALLENGED" }` (preview is only available while the trade is `CHALLENGED`), `503 { code: "PREVIEW_UNAVAILABLE" }` (RPC/contract config missing, the on-chain read failed or timed out after 4 s, or the trade has no valid on-chain id; the body also carries `informationalOnly: true`, `nonAuthoritative: true`), `400`, `403`, `404`. A chain-id verification failure (`ChainGuard`) returns a generic `500`, not `PREVIEW_UNAVAILABLE`.

### Payment risk semantics (`PaymentRiskLevel`)
- `PaymentRiskLevel` is **not** a trust/reputation grade for a user.
- It is a payment-rail complexity/availability signal for UX/read-model purposes.
- It must never become authority for on-chain outcome or settlement finalization.

---

## 6) PII routes (`/api/pii`)

PII routes are child-trade-scoped and heavily guarded. Every route runs `requireAuth` + `requireSessionWalletMatch`, then its **own** rate limiter (one bucket per endpoint; trade-scoped endpoints are keyed per trade, so hitting one endpoint does not lock the others). Sensitive responses carry `Cache-Control: no-store, max-age=0` and `Pragma: no-cache`. PII is only available while the trade is `LOCKED/PAID/CHALLENGED` in the mirror **and** not closed on-chain. The chain state is read with `getTrade` (2 s timeout; active results cached 10 s, terminal results 5 min). If the chain state cannot be read (RPC error/timeout), PII is **not** released when `NODE_ENV=production` (fail-closed): `503 { code: "ONCHAIN_STATE_UNAVAILABLE" }` (`taker-name` and `GET /:tradeId`); outside production the mirror decides. `request-token` does not read the chain.

### `GET /api/pii/my`
Limiter: `piiProfileLimiter` (10 / 10 min). Returns `{ pii }`: the caller's own decrypted payout profile (`{ rail, country, contact: { channel, value }, fields }`), or `{ pii: null }`.

### `GET /api/pii/taker-name/:onchainId`
Limiter: `piiTakerNameLimiter` (10 / 10 min per trade). Maker-only: the maker reads the taker's account-holder name from the lock-time snapshot. Response `{ bankOwner }` (`null` when no taker yet).

Errors: `400` (bad id / state not active / closed on-chain), `403` (caller is not the maker), `404`, `409 { code: "SNAPSHOT_UNAVAILABLE" }` (snapshot missing, incomplete or not `is_complete`; there is no current-profile fallback), `503 { code: "IDENTITY_NORMALIZATION_REQUIRED" }` (identity migration not completed, see the deployment guide; this gate applies to this route only, mode `PII_IDENTITY_NORMALIZATION_GUARD` → `IDENTITY_NORMALIZATION_GUARD` → `enforce`), `503 { code: "ONCHAIN_STATE_UNAVAILABLE" }` (see above).

### `POST /api/pii/request-token/:tradeId`
Limiter: `piiTokenRequestLimiter` (5 / 10 min per trade). Taker-only. Issues a short-lived trade-scoped PII token: `{ piiToken }`. Errors: `400` (bad id / state), `403` (not the taker), `404`.

### `GET /api/pii/:tradeId`
Middleware order: `requireAuth`, `requireSessionWalletMatch`, `requirePIIToken`, `piiFetchLimiter` (5 / 10 min per trade). Returns the maker payout info from the lock-time snapshot: `{ payoutProfile: { rail, country, contact: { channel, value }, fields }, notice }`.

Errors: `403` (not the taker, trade no longer active, closed on-chain), `404`, `409 { code: "SNAPSHOT_UNAVAILABLE" }` (snapshot missing or not `is_complete`), `503 { code: "ONCHAIN_STATE_UNAVAILABLE" }`, `500` on decrypt failure (generic message). `requirePIIToken` errors (including `TOKEN_EXPIRED` / `TOKEN_INVALID`) also apply.

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

`hash` is the SHA-256 of the encrypted payload (hex). The authorization/state checks run before the file is processed (magic bytes, base64, encryption); the plain file sits temporarily under `os.tmpdir()/araf-receipts` (0700), is deleted when the request ends, and leftovers older than 1 hour are swept at startup.

Response: `201 { hash }`. Errors: `400` (no file / bad `onchainEscrowId` / trade not `LOCKED`; other multer errors `400 { code: "RECEIPT_UPLOAD_INVALID" }`), `403` (not the taker), `404`, `409` (receipt already uploaded; no overwrite), `413 { code: "RECEIPT_TOO_LARGE" }` (file over 5 MB, or the record exceeds the BSON limit), `415` (unsupported MIME `{ code: "RECEIPT_UNSUPPORTED_TYPE" }`; a magic-byte/MIME mismatch returns a plain `{ error }` without a code).

---

## 8) Feedback, stats, logs, reference rates

### `POST /api/feedback`
Middleware: `requireAuth`, `requireSessionWalletMatch`, `feedbackLimiter`.
```json
{ "rating": 1, "comment": "optional, max 1000 chars", "category": "bug | suggestion | ui/ux | other" }
```
`rating` is an integer 1–5 and `category` is required. The free-text `comment` is masked before storage (IBAN, e-mail, 9+ digit numbers, bearer and JWT patterns become `[REDACTED]`). Response `201 { success, message }`.

### `GET /api/stats`
Middleware: `statsReadLimiter`. Public protocol statistics: `{ stats }` from the latest `HistoricalStat` row plus `changes_30d` and `meta` (`cache_ttl_seconds`, `open_order_semantics`, `numeric_fields_are_approximate`). Cached in Redis for 300 s. `{ stats: {} }` when no snapshot exists yet.

### `POST /api/logs/client-error`
Middleware: `clientLogLimiter`. Client-side non-blocking error telemetry used by the frontend runtime. Body: `message` (required string, max 500 kept), optional `stack` (2000), `componentStack` (1000), `url` (200) and diagnostic fields `diag` (`^[A-Za-z0-9:_-]{1,64}$`), `rpcCode` (integer, |n| ≤ 99999), `selector` (`0x` + 8 hex); diagnostic fields are logged only when they match these strict patterns. Control characters and PII-looking tokens (IBAN, wallet, e-mail, bearer/JWT) are redacted before logging. Response `204`; `400` when `message` is missing.

### `GET /api/reference-rates/ticker`
Middleware: `marketReadLimiter`. Public informational reference rate strip: `{ items, generatedAt, informationalOnly: true, nonAuthoritative: true, canAffectSettlement: false }`. Rows older than `REFERENCE_TICKER_MAX_STALE_SECONDS` (default 86400) are dropped instead of carried forward.

### `GET /api/social-links`
Middleware: `marketReadLimiter`. Public, unauthenticated: footer social links. Response `{ links: [{ label, url }] }`; only `enabled` links that pass server-side re-validation (https, allowed host) are returned. An empty list is returned when the DB is unavailable or the read fails (the frontend falls back to build-time env). `Cache-Control: public, max-age=30`.

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
| `GET /api/rewards/:wallet/claimable` | `{ wallet, available: false, claimable: null, authority: "chain", source: "ESTIMATE_UNAVAILABLE_USE_ONCHAIN_GETTER", note }`; the backend cannot compute this (weights are not persisted); `null` means "unknown", not "zero". Use the on-chain `ArafRewards.claimable(epoch, user, token)` getter |
| `GET /api/rewards/:wallet/history` | `{ wallet, claims }` (latest 200 claim events); bad address `400` |

---

## 10) Admin observability and operational settings (`/api/admin`; reads + `PUT /payment-rails`, `/runtime-settings`, `/social-links`)

The whole router runs `requireAuth` → `requireSessionWalletMatch` → `requireAdminWallet` → `adminReadLimiter` (60 / min per wallet). No write or override action that affects protocol outcomes is exposed; the only write surface is the operational settings below (payment rails, runtime settings, social links). Admin access is controlled only by `ADMIN_WALLETS`.

| Route | Query (Joi) | Response |
|---|---|---|
| `GET /api/admin/summary` | — | `{ timestamp, readiness, stats, tradeCounts, settlementAnalytics, resolutionAnalytics, dlq, scheduler, degraded }`; each sub-source degrades independently and is listed in `degraded.errors` |
| `GET /api/admin/trades` | `status` (`ALL\|LOCKED\|PAID\|CHALLENGED\|RESOLVED\|CANCELED\|BURNED`, default `CHALLENGED`), `tier` 0–4, `origin` (`ALL\|ORDER_CHILD\|DIRECT_ESCROW`), `riskOnly` (bool), `snapshotComplete` (`ALL\|true\|false`), `page`, `limit` (1–50, default 20) | `{ trades, total, page, limit, paginationScope }`. `riskOnly=true` works over a bounded window (`windowSize` 1000) and says so in `paginationScope` |
| `GET /api/admin/settlement-proposals` | `state` (`ALL\|PROPOSED\|EXPIRED\|FINALIZED\|REJECTED\|WITHDRAWN`, default `ALL`), `riskOnly` (bool), `page`, `limit` (1–50, default 20) | `{ proposals, total, page, limit }`; proposals are flagged `informational_only` / `non_authoritative_semantics` |
| `GET /api/admin/feedback` | `category`, `rating` 1–5, `page`, `limit` (1–50, default 20) | `{ feedback, total, page, limit }` |
| `GET /api/admin/revenue` | — | `{ rows }` (latest 500 `RevenueEvent` rows) |
| `GET /api/admin/rewards/health` | — | `{ mirror_only: true, counts: { epochs, funding, claims } }` |

Non-admin wallets receive `403`; the `scheduler` block of `/summary` lists `reputationDecayLastRunAt`, `statsSnapshotLastRunAt`, `sensitiveCleanupLastRunAt`, `archiveRetentionLastRunAt`, `userBankRiskCleanupLastRunAt`. The `/summary` DB aggregates and the `riskOnly` window are held in a 10 s in-memory cache (successful results only).


### Payment rail management (admin write)

Same auth chain (`requireAuth` -> `requireSessionWalletMatch` -> `requireAdminWallet`); the `x-wallet-address` header requirement doubles as the CSRF layer next to the `SameSite=Lax` cookie. Writes also pass `adminWriteLimiter` (10 / 10 min per wallet).

| Route | Body / Query | Response |
|---|---|---|
| `GET /api/admin/payment-rails` | — | `{ rails: [{ code, name{TR,EN}, countries, riskLevel, enabled, changedAt, changedBy }] }` |
| `PUT /api/admin/payment-rails/:rail` | `{ enabled: boolean, reason?: string<=300 }` (strict Joi) | `{ success, rail, previousEnabled, enabled, changed }`; unknown rail `400 PAYMENT_RAIL_UNKNOWN`, invalid body `400`; closing the last enabled rail `409 LAST_ENABLED_RAIL`; concurrent change `409 PAYMENT_RAIL_CONFLICT`; DB unavailable `503 DB_UNAVAILABLE` |
| `GET /api/admin/payment-rails/audit` | `page` (1-10000), `limit` (1-100, default 20) | `{ items: [{ rail, previousEnabled, newEnabled, adminWallet, reason, ipHash, createdAt }], total, page, limit }` (append-only collection, IP stored only as HMAC) |
| `GET /api/admin/runtime-settings` | — | `{ settings: [{ key, group, unit, min, max, default, envValue, adminValue, value, source(admin\|env\|default), warning?, constraints[{TR,EN}], constraintViolations[string], changedAt, changedBy }], version, degraded }` |
| `PUT /api/admin/runtime-settings/:key` | `{ value: integer }` or `{ reset: true }` (+ `reason?<=300`, `expectedVersion?`) (strict Joi) | `{ success, key, previousValue, value, changed, version }`; unknown key `400 RUNTIME_SETTING_UNKNOWN`, out of range `400 RUNTIME_SETTING_OUT_OF_RANGE`, invalid body `400`; cross-field constraint violation `400 RUNTIME_SETTING_CONSTRAINT`; conflict `409 RUNTIME_SETTING_CONFLICT`; DB unavailable `503 DB_UNAVAILABLE`; rolled back if the audit write fails `500 RUNTIME_SETTING_AUDIT_FAILED` |
| `GET /api/admin/runtime-settings/audit` | `page` (1-10000), `limit` (1-100) | `{ items: [{ setting, previousValue, newValue, adminWallet, reason, ipHash, createdAt }], total, page, limit }` |
| `GET /api/admin/social-links` | — | `{ links: [{ id, label, url, order, enabled }], version }` (DB unavailable `503 DB_UNAVAILABLE`) |
| `PUT /api/admin/social-links` | `{ links: [...] (max 8), expectedVersion: integer ≥ 0 (required), reason?: string<=300 }` | `{ success, links, version, changedAt }`; invalid body/link `400 SOCIAL_LINKS_INVALID`; version mismatch `409 SOCIAL_LINKS_CONFLICT`; not applied if the audit write fails `500 SOCIAL_LINKS_AUDIT_FAILED`; DB unavailable `503 DB_UNAVAILABLE` |
| `GET /api/admin/social-links/audit` | `page` (1-10000), `limit` (1-100) | `{ items: [{ id, previousLinks, newLinks, version, adminWallet, reason, ipHash, createdAt }], total, page, limit }` |

Note (EN): `GET /api/admin/runtime-settings` returns, per setting, `constraints` (short constraint hints, `{TR,EN}`) and `constraintViolations` (messages of constraints the current effective values violate, including env-caused ones). The panel shows violations as a warning.

Social link validation has a single server-side source (`backend/scripts/utils/socialLinks.js`): each link is `{ id?, label, url, order?, enabled }` (other keys are rejected); `label` is 1-24 characters of plain text, `url` is `https` only, max 300 characters, with no userinfo/port/IDN-punycode, no duplicate URLs, and the host must be on the allowlist (code default list or the `SOCIAL_LINK_ALLOWED_HOSTS` env; not changeable from the admin panel). The server generates an `id` when none is given.

Public effects: `GET /api/orders/config` and `/payment-risk-config` return `enabledPaymentRails` and set `paymentRiskConfig[*][rail].enabled`; `GET /api/orders` rows carry `owner_rail_enabled` (boolean); `GET /api/auth/me` returns `payoutRail` and `payoutRailEnabled` (`false` when the saved profile's rail is closed; `hasPayoutProfile` keeps meaning "data exists"); `PUT /api/auth/profile` and `POST /api/orders/market-meta` answer `409 PAYMENT_RAIL_DISABLED` for a closed rail. Active trades (LOCKED/PAID/CHALLENGED), snapshots and the PII flow never consult rail state. The contract is rail-agnostic: this gate exists at UI/API level only.

---

## 11) Health endpoints

Neither endpoint has a rate limiter or authentication; they are not under `/api`.

### `GET /health`
Liveness probe (process-up signal, in-memory, no RPC calls). `200 { status: "ok", timestamp, worker: { state, lastBlockAgeMs } }`. If the event worker is watching blocks and no new block was seen for `WORKER_LIVENESS_STALE_MS` the status is `"stale"` and the HTTP code is **`503`** (so the platform restarts the machine). Without a worker object it is always `ok`. This is the Fly.io health check (`backend/fly.toml`).

### `GET /ready`
Readiness probe: full-service mode (not degraded), escrow registry guard (blocks only in `enforce` + mismatch), Mongo, Redis, provider, chain id, config, replay bootstrap and worker (state, lag ≤ `WORKER_MAX_LAG_BLOCKS`, not `replaying`). `200` when ready, `503` when not (`503 { ok: false, error: "readiness_unavailable" }` if the check itself fails). The body also carries an informational `relayer: "configured" | "disabled"` (no value/address, does not affect the status code).

- The result is cached for `READY_CACHE_TTL_MS` (default 7000 ms, clamped to 5000–10000) and concurrent calls are coalesced, so an unauthenticated caller cannot trigger RPC calls on every request.
- **Unauthenticated view is redacted:** `{ ok, checks, worker: { state, replaying, lagBlocks }, escrowRegistry: { mode, checked, ok, reason }, configIssueCount, degraded, degradedReasons, relayer }`; missing-config names, block numbers, chain ids and worker diagnostics are not exposed.
- **Internal view:** send the header `x-internal-token: <READY_INTERNAL_TOKEN>` (constant-time comparison; disabled when the env is not set) to get the full body including `missingConfig`, `worker.diagnostics` and block/chain details.

---

## 12) Canonical terminology notes

- Canonical market primitive is **parent order**, not listing.
- Canonical escrow lifecycle is **child trade**.
- `onchain_escrow_id` in backend models refers to child-trade on-chain identity.
- Backend is a mirror/coordination layer, not protocol authority.
