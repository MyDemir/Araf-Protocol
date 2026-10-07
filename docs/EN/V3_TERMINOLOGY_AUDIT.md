# V3 Terminology Audit

This audit classifies remaining `listing`, `createEscrow`, `lockEscrow`, and `legacy` references.

## Canonical current behavior

- `Order`, `parent order`, `child trade`, `order-first`, `backend mirror/read-model`, and `contract authority` are the canonical terms.
- Contract ABI names such as `childListingRef` are treated as immutable ABI field names only; their product meaning is a child-trade trace reference, not a Listing primitive.
- Backend `Order` routes and models are canonical read-model surfaces for parent orders.

## Compatibility/deprecated behavior

- The former `backend/scripts/routes/listings.js` (`/api/listings` alias) and `backend/scripts/jobs/cleanupPendingListings.js` (no-op job) have been **removed** from the repository; `app.js` mounts only `/api/orders` and the other canonical surfaces.
- Direct escrow event handlers (`EscrowCreated` / `EscrowLocked`) have been removed (B36): the contract never emits these events; child trades are mirrored via `OrderFilled` + `getTrade()`.
- `DIRECT_ESCROW` remains in the `Trade.trade_origin` enum only as a historical/compat mirror value (default `ORDER_CHILD`; written only if `parentOrderId == 0`). In V3 the contract creates every trade from an order fill; `ArafRewards` also rejects `isOrderChild == false` records with `DirectEscrowNotRewardable`.
- The names `canonical_refs.listing_ref` (Mongo) and `childListingRef` (ABI) are kept for backward compatibility; their meaning is a child-trade trace reference.
- Legacy environment aliases and legacy profile fields are compatibility concerns unrelated to the V3 market primitive.

## Stale/incorrect terminology fixed here

- Frontend user-facing copy now says parent order/order owner instead of listing/listing owner.
- Backend comments and tests now call `/api/listings` a deprecated compatibility alias rather than a canonical listing route.
