# V3 Terminoloji Denetimi

Bu denetim kalan `listing`, `createEscrow`, `lockEscrow` ve `legacy` referanslarını sınıflandırır.

## Kanonik güncel davranış

- Kanonik terimler: `Order`, `parent order`, `child trade`, `order-first`, `backend mirror/read-model`, `contract authority`.
- `childListingRef` gibi kontrat ABI isimleri değiştirilemeyen ABI alanları olarak değerlendirilir; ürün anlamı Listing primitive’i değil child-trade trace referansıdır.
- Backend `Order` route/model yüzeyleri parent order için kanonik read-model yüzeyleridir.

## Compatibility/deprecated davranış

- Eski `backend/scripts/routes/listings.js` (`/api/listings` alias'ı) ve `backend/scripts/jobs/cleanupPendingListings.js` (no-op job) depodan **kaldırılmıştır**; `app.js` yalnız `/api/orders` ve diğer kanonik yüzeyleri bağlar.
- Direct escrow event handler'ları (`EscrowCreated` / `EscrowLocked`) kaldırılmıştır (B36): kontrat bu event'leri yayınlamaz, child trade'ler `OrderFilled` + `getTrade()` ile aynalanır.
- `Trade.trade_origin` enum'unda `DIRECT_ESCROW` değeri yalnız tarihsel/compat mirror değeri olarak durur (varsayılan `ORDER_CHILD`; `parentOrderId == 0` gelirse yazılır). Kontrat V3'te her trade'i bir order fill'inden üretir; `ArafRewards` da `isOrderChild == false` kaydı `DirectEscrowNotRewardable` ile reddeder.
- `canonical_refs.listing_ref` (Mongo) ve `childListingRef` (ABI) adları geriye dönük uyumluluk için korunur; anlamı child-trade trace referansıdır.
- Legacy environment alias’ları ve legacy profil alanları V3 market primitive’iyle ilgili olmayan compatibility konularıdır.

## Bu değişiklikte düzeltilen stale/incorrect terminoloji

- Frontend kullanıcı metinleri listing/listing owner yerine parent order/order owner kullanıyor.
- Backend yorumları ve testleri `/api/listings` yüzeyini kanonik listing route’u değil deprecated compatibility alias olarak adlandırıyor.
