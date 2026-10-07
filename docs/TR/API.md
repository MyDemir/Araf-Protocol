# 🌀 Araf Protocol API (Güncel Backend Surface)

> Base URL: `/api`  
> Kanonik model: **V3 order-first** (parent order + child trade)

Bu doküman, `backend/scripts/app.js` içinde mount edilen güncel endpoint yüzeyini anlatır. Doğruluk kaynağı koddur; aşağıdaki her middleware zinciri, limit ve şema `backend/scripts/routes/*` ile `backend/scripts/middleware/*` dosyalarından okunmuştur.

---

## 1) Kimlik doğrulama modeli

Kimlik modeli SIWE + cookie oturumuna dayanır:
- `araf_jwt` — kısa ömürlü auth cookie (15 dk, `httpOnly`, `SameSite=Lax`, production'da `Secure`, path `/`)
- `araf_refresh` — refresh cookie (7 günlük kayan pencere, path `/api/auth`; mutlak ömür `REFRESH_ABSOLUTE_TTL_SECS`, varsayılan 30 gün)
- hassas PII erişimi için trade-scoped token (`Authorization: Bearer ...`; `PII_TOKEN_EXPIRES_IN`, varsayılan `15m`)

Auth JWT **yalnız** cookie'den okunur; normal auth için bearer fallback yoktur. `jti` taşımayan ya da Redis blacklist'inde bulunan JWT reddedilir. Redis `JWT_BLACKLIST_TIMEOUT_MS` içinde yanıt vermezse blacklist kontrolü `JWT_BLACKLIST_FAIL_MODE`'a göre davranır (production'da varsayılan `closed`, diğer ortamlarda `open`).

### Middleware referansı

| Middleware | Davranış | Hatalar |
|---|---|---|
| `requireAuth` | Geçerli `araf_jwt` cookie'si; `req.wallet` set eder | `401` (cookie yok / geçersiz / blacklist), `403` (token tipi `auth` değil) |
| `requireSessionWalletMatch` | `x-wallet-address` header'ı (bağlı cüzdan) cookie cüzdanıyla birebir eşleşmeli | `401 SESSION_WALLET_HEADER_MISSING`, `400 SESSION_WALLET_HEADER_INVALID`, `409 SESSION_WALLET_MISMATCH` |
| `requireAdminWallet` | Cookie cüzdanı `ADMIN_WALLETS` içinde olmalı (virgülle ayrılmış, büyük/küçük harf duyarsız; boş liste = kimse) | `403 { error: "Admin erişimi reddedildi." }` |
| `requirePIIToken` | `Authorization: Bearer <piiToken>`: `type=pii`, `tradeId` path'teki `:tradeId` ile eşit, token cüzdanı session cüzdanıyla eşit | `400` (hatalı `tradeId`), `401` (header yok/geçersiz), `403` |

`requireSessionWalletMatch`'in döndürdüğü `SESSION_WALLET_MISMATCH` aynı zamanda bir **oturum geçersiz kılma olayıdır**: backend mevcut JWT'yi blacklist'e alır, cüzdanın refresh ailelerini iptal eder, iki cookie'yi de temizler ve `409` döner. `GET /api/auth/me` header uyuşmazlığında aynı `409` kodunu döner ama daha az geçersiz kılar: yalnız refresh ailelerini iptal eder ve cookie'leri temizler; JWT orada blacklist'e **alınmaz**.

### Rate limiter'lar

Aşılınca hepsi `429 { "error": "..." }` döner (PII limiter'ları ayrıca saniye cinsinden `retryAfter` ekler) ve standart `RateLimit-*` header'larını set eder. Redis tabanlıdır; Redis kapalıyken hassas olanlar proses-içi sayaca düşer (asla fail-open değil). Tier'lı limiter'lar çağıranın mirror'daki `effective_tier` değerine (0–4, `max_allowed_tier` ile sınırlı; anonim = tier 0; `RATE_LIMIT_TIER_CACHE_TTL_SECONDS` kadar önbellek, varsayılan 120 sn) göre ölçeklenir.

| Limiter | Pencere | Limit | Anahtar |
|---|---|---|---|
| `authLimiter` | 1 dk | 10 | IP |
| `nonceLimiter` | 1 dk | 6 | IP + `wallet` query |
| `marketReadLimiter` | 1 dk | 100 | IP |
| `statsReadLimiter` | 1 dk | 60 | IP |
| `ordersWriteLimiter` | 1 saat | 5 | cüzdan |
| `ordersReadLimiter` | 1 dk | 70 / 110 / 150 / 190 / 230 (tier 0–4) | cüzdan |
| `roomReadLimiter` | 1 dk | 20 / 30 / 40 / 55 / 70 (tier 0–4) | cüzdan |
| `receiptUploadLimiter` | 10 dk | 6 / 8 / 10 / 12 / 14 (tier 0–4) | cüzdan |
| `coordinationWriteLimiter` | 10 dk | 8 / 12 / 16 / 20 / 24 (tier 0–4) | cüzdan |
| `feedbackLimiter` | 1 saat | 2 / 3 / 4 / 5 / 6 (tier 0–4) | cüzdan |
| `adminReadLimiter` | 1 dk | 60 | cüzdan |
| `clientLogLimiter` | 1 dk | 10 | IP |
| `piiProfileLimiter` | 10 dk | 10 | IP + cüzdan |
| `piiTakerNameLimiter` | 10 dk | 10 | IP + cüzdan + `onchainId` |
| `piiTokenRequestLimiter` | 10 dk | 5 | IP + cüzdan + `tradeId` |
| `piiFetchLimiter` | 10 dk | 5 | IP + cüzdan + `tradeId` |

### Ortak hata biçimleri

- Joi doğrulama hataları: `400 { "error": "<joi mesajı>" }`.
- Bilinmeyen path: `404 { "error": "İstenen endpoint bulunamadı" }`.
- Global handler: Mongoose validation `400 { error, details[] }`, duplicate key `409 { error: "Duplicate entry", message }`, JWT hataları `401`, 4xx `statusCode` ile fırlatılanlar aynen geçer, geri kalan her şey `500 { error: "Internal server error", message }`.
- Request body limiti 50 kb; CORS, `ALLOWED_ORIGINS` için `GET, POST, PUT, DELETE` ve credentials'a izin verir.

---

## 2) Mount edilen route grupları

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

Kod tabanında `/api/listings` route'u yoktur; kanonik pazar primitive'i parent order'dır.

---

## 3) Auth rotaları (`/api/auth`)

### `GET /api/auth/nonce?wallet=<address>`
Middleware: `authLimiter`, `nonceLimiter`. `wallet`, `^0x[a-fA-F0-9]{40}$` ile eşleşmeli (aksi halde `400`).

SIWE için nonce üretir (Redis, 5 dakika TTL). Yanıt: `{ nonce, siweDomain, siweUri, termsVersion }`. SIWE config geçersizse `503` (`SIWE_*` mesajı).

### `POST /api/auth/verify`
Middleware: `authLimiter`.

İstek (Joi):
```json
{ "message": "EIP-4361 mesajı (en çok 2000 karakter)", "signature": "0x… (130 hex karakter)" }
```
SIWE imzasını doğrular ve auth/refresh cookie'lerini set eder. Koşul kabulü imzalanan SIWE `statement` içinde taşınır (`I accept the Araf Terms of Use v<YYYY-MM-DD>`); cüzdanın o sürümdeki ilk imzalı kabulü kalıcı saklanır (`TermsAcceptance`). Yanıt: `{ wallet, profile, terms: { version } }`.

Hatalar: `400` (şema), `401 { code: "TERMS_NOT_ACCEPTED", reason: "UNSUPPORTED_VERSION" | "ACCEPTANCE_REQUIRED", termsVersion }`, `401 { error: "Kimlik doğrulama başarısız: ..." }` (beklenen SIWE hataları), beklenmeyen hatalarda genel mesajlı `500`.

### `GET /api/auth/me`
Middleware: `requireAuth` (`x-wallet-address` header'ı burada opsiyoneldir; varsa ve cookie cüzdanından farklıysa refresh aileleri iptal edilir, cookie'ler temizlenir (JWT blacklist'e alınmaz) ve `409 SESSION_WALLET_MISMATCH` döner).

Yanıt: `{ wallet, authenticated: true, isAdmin, hasPayoutProfile }`.
- `isAdmin`: cüzdan `ADMIN_WALLETS` içinde mi (`requireAdminWallet` ile aynı mantık).
- `hasPayoutProfile`: kullanıcının backend'e KAYITLI ödeme profili var mı (yalnız boolean, PII yok). Sorgu başarısız olursa `null` döner; istemci `null`'ı "bilinmiyor" sayıp emir oluşturma/doldurmayı kapalı tutar (fail-closed).

### `POST /api/auth/refresh`
Middleware: `authLimiter`. `araf_refresh` cookie'sini okur (yoksa `401`).

İstek gövdesi (opsiyonel, yalnız uyumluluk; authority kaynağı değildir):
```json
{ "wallet": "0x..." }
```
Refresh token'ı döndürür ve yeni `araf_jwt` üretir; yanıt `{ wallet }`. İki sekme `REFRESH_REUSE_GRACE_MS` (varsayılan 10 sn) içinde yarışırsa yalnız yeni JWT üretilir, refresh cookie'nin üzerine **yazılmaz**. Biçimsiz `wallet` `400` döner. Her refresh hatasında iki cookie temizlenir ve `401 { error }` döner (koşul sürümü artık kabul edilmiyorsa ayrıca `code: "TERMS_NOT_ACCEPTED"`).

### `POST /api/auth/logout`
Middleware: `authLimiter` (bilinçli olarak `requireAuth` **yok**).

Süresi dolmuş ama imzası geçerli JWT ile ya da yalnız `araf_refresh` cookie'si ile çalışır. Kimlik yine kriptografik olarak çözülür: önce JWT imzası, yoksa sunucuda kayıtlı refresh kaydı. İmzalı JWT varsa blacklist'e alınır; çözülen cüzdanın tüm refresh aileleri iptal edilir; iki cookie temizlenir. Kimlik çözülemezse yalnız cookie'ler temizlenir. Her zaman `{ success: true, message }` döner.

### `PUT /api/auth/profile`
Middleware: `requireAuth`, `requireSessionWalletMatch`, `authLimiter`.

Rail-aware payout profilini `User.payout_profile` altında şifreli günceller.

Kilit davranışlar:
- Aktif trade (`LOCKED/PAID/CHALLENGED`; maker ya da taker olarak) varken ödeme profili yazımı engellenir; İLK oluşturma dahil: `409 { code: "BANK_PROFILE_LOCKED_DURING_ACTIVE_TRADE" }`. Snapshot işlem kilitlendiği anda alınır ve işlem süresince değişmemelidir (dolandırıcılığı önleme). Yalnız contact değişimi banka profili değişimi sayılmaz.
- Banka profilinin değişip değişmediği, eski/yeni detayların HMAC fingerprint'leri (`hmac-v1`) ile rail/country karşılaştırılarak belirlenir; yalnız gerçek değişim `profileVersion` ve 7g/30g sayaçlarını artırır.

Kabul edilen request body:
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
`rail`, `country`, `contact.channel`, `contact.value` ve tüm `fields.*` anahtarları zorunludur (kullanılmayanlar için `null` gönderin). `account_holder_name` 2–100 karakter harf/boşluk/apostrof/nokta/tire; `bank_name` en çok 120; `contact.value` en çok 120.

Rail-country kuralları (zorunlu):
- `TR_IBAN` -> `TR`
- `US_ACH` -> `US`
- `SEPA_IBAN` -> `DE, FR, NL, BE, ES, IT, AT, PT, IE, LU, FI, GR`

IBAN kontrolleri: `TR_IBAN`, `TR` + 24 rakam olmalı; `SEPA_IBAN`, `^[A-Z]{2}[A-Z0-9]{13,32}$` ile eşleşmeli ve ülke öneki `country` ile aynı olmalı; ikisi de ISO 13616 mod-97 kontrol basamağından geçmeli. `US_ACH`: `routing_number` 9 rakam, `account_number` 4–17 rakam, `account_type` zorunlu.

Contact canonicalization:
- `telegram`: baştaki `@` storage öncesi temizlenir; `^[a-zA-Z0-9_]{5,32}$`
- `email`: temel e-mail pattern doğrulaması yapılır
- `phone`: boşluklar temizlenir, ardından `^\+?[0-9]{7,15}$` doğrulanır
- `channel/value` birlikte gelir veya birlikte `null` olur

Rail-specific field set:
- `TR_IBAN`: `account_holder_name`, `iban`, opsiyonel `bank_name`
- `SEPA_IBAN`: `account_holder_name`, `iban`, opsiyonel `bic`, opsiyonel `bank_name`
- `US_ACH`: `account_holder_name`, `routing_number`, `account_number`, `account_type`, opsiyonel `bank_name`

Yanıt: `{ success, message, bankProfileChanged, profileVersion, lastBankChangeAt, bankChangeCount7d, bankChangeCount30d, payoutProfile: { rail, country, contact: { channel }, fingerprintVersion } }` (PII geri döndürülmez).

Geçersiz kombinasyon örneği (400):
```json
{ "payoutProfile": { "rail": "US_ACH", "country": "TR", "contact": { "channel": null, "value": null }, "fields": { "account_holder_name": "John Doe", "iban": null, "routing_number": "021000021", "account_number": "1234567890", "account_type": "checking", "bic": null, "bank_name": null } } }
```

Legacy flat alanlar artık kabul edilmez: `bankOwner`, `iban`, `telegram`, `contactChannel`, `contactValue`.

---

## 4) Order rotaları (`/api/orders`)

Order rotaları parent-order state'in read-layer mirror yüzeyidir. State-changing order aksiyonları on-chain yapılır.

### `GET /api/orders/config`
Middleware: `marketReadLimiter`. Public.

Mirror protocol config snapshot döner: `bondMap`, `feeConfig`, `cooldownConfig`, `tokenMap`, `paymentRiskConfig`, `reputationPolicy`, `deployment: { escrowAddress, chainId }` (`ARAF_ESCROW_ADDRESS` / `EXPECTED_CHAIN_ID` kaynaklı; frontend deploy kaymasını uyarmak için kullanır) ve `selectedOrderRiskLevel`. Config mirror'ı yoksa `503` (`CONFIG_UNAVAILABLE`).

### `GET /api/orders/payment-risk-config`
Middleware: `marketReadLimiter`. Public. `{ paymentRiskConfig, selectedOrderRiskLevel }` döner; config yoksa `503`.

### `GET /api/orders`
Middleware: `marketReadLimiter`. Public order feed. Query (Joi):

| Parametre | Değerler | Varsayılan |
|---|---|---|
| `side` | `SELL_CRYPTO` \| `BUY_CRYPTO` | — |
| `status` | `ACTIVE` (= `OPEN` + `PARTIALLY_FILLED`) \| `OPEN` \| `PARTIALLY_FILLED` \| `FILLED` \| `CANCELED` | — |
| `tier` | `0`–`4` (tam eşleşme) | — |
| `max_tier` | `0`–`4` (`tier <= max_tier` emirleri; `tier` verilirse yok sayılır) | — |
| `token_address` | `0x` + 40 hex | — |
| `owner_address` | `0x` + 40 hex | — |
| `fiat` | `TRY` \| `USD` \| `EUR` | — |
| `min_amount` | token biriminde pozitif sayı (token decimals bilinmiyorsa `503`) | — |
| `sort` | `default` \| `best_rate` \| `newest` | `default` |
| `page` | tamsayı ≥ 1 | `1` |
| `limit` | tamsayı 1–50 | `20` |

Yanıt: `{ orders, total, page, limit }`. Yanıt URL başına bellekte `MARKET_CACHE_TTL_MS` kadar tutulur (varsayılan 10 sn; testte `0`); isabet olursa `X-Cache: HIT` header'ı eklenir. Her order `trust_visibility_summary` ve `owner_has_payout_profile` (boolean) taşır: emir sahibinin kayıtlı ödeme profili var mı. PII/şifreli alan dönmez; `false` ise UI doldurmayı kapatır.

### `GET /api/orders/my`
Middleware: `requireAuth`, `requireSessionWalletMatch`, `ordersReadLimiter`. Query: `page` (varsayılan 1), `limit` (1–50, varsayılan 20). Yanıt: çağıranın emirleri için `{ orders, total, page, limit }`, son güncellenen önce.

### `POST /api/orders/market-meta`
Middleware: `requireAuth`, `requireSessionWalletMatch`, `ordersWriteLimiter` (5/saat).

Maker'ın zincir dışı fiat/kur bilgisini saklar (yalnız UI zenginleştirme, authority değil, bir kez yazılır).
```json
{ "orderRef": "0x… (64 hex)", "fiatCurrency": "TRY | USD | EUR", "exchangeRate": 36.5 }
```
`exchangeRate` pozitif, en çok 1 000 000. Mirror'daki emre uygulanırsa `201 { success, applied: true }`; mirror henüz yoksa `202 { success, applied: false }` (niyet saklanır, worker `OrderCreated`'da sahibi doğrulayıp uygular). Hatalar: `400`, `403` (emir başkasına ait), `409 { code: "MARKET_META_ALREADY_SET" }`.

### `GET /api/orders/:id/trades`
Middleware: `requireAuth`, `requireSessionWalletMatch`, `ordersReadLimiter`. Yalnız sahip (`403` sahip değilse, `404` emir yok, `400` hatalı id).

Çağıranın emrine bağlı child trade'lerin sayfalı listesi. Query: `page` (varsayılan 1), `limit` (1–100, varsayılan 50). Yanıt: `{ trades, total, page, limit }`, yeniden eskiye. PII snapshot, şifreli dekont payload'ı ve ham imza alanları projeksiyona girmez.

### `GET /api/orders/:id`
Middleware: `marketReadLimiter`. On-chain order ID ile tek bir mirror parent order döner: `{ order }` (`400` hatalı id, `404` yok).

---

## 5) Trade rotaları (`/api/trades`)

Trade'ler child-trade read/coordination endpoint'leridir. Backend settlement sonuçları için **non-authoritative** kalır:
- hiçbir backend/admin onayı settlement'ı finalize edemez,
- hiçbir backend/admin aksiyonu release/cancel/burn/payout kararını override edemez,
- final ekonomik sonuç yalnız kabul edilen on-chain tx ile belirlenir.

Tüm trade rotaları `requireAuth` + `requireSessionWalletMatch` kullanır; erişim trade'in maker'ı ya da taker'ı ile sınırlıdır (aksi halde `403 Erişim reddedildi.`). Mongo trade id'leri 24 hex karakter olmalı (aksi halde `400`).

### Partial settlement semantiği
- **Nedir:** tek bir child trade için tarafların anlaştığı bölüşümlü ödeme akışı.
- **Yaşam döngüsü:** `NONE -> PROPOSED -> REJECTED/WITHDRAWN/EXPIRED/FINALIZED`.
- **Kim teklif eder:** yalnız o trade'in iki karşı tarafından biri (`maker` veya `taker`).
- **Kim kabul/ret eder:** aktif teklifi yalnız **karşı taraf** kabul veya reddedebilir.
- **Kim geri çeker:** yalnız teklif sahibi, hâlâ aktif olan teklifi geri çekebilir.
- **Kim expire eder:** deadline sonrası herkes expiry tetikleyebilir; bu da kontrat tarafından doğrulanır.

### Settlement akışında backend rolü
- bilgilendirici split hesabı için preview yüzeyi (`POST /api/trades/:id/settlement-proposal/preview`)
- kontrat log'larından event mirror
- sorgu/UX için read model projection
- operasyon için audit/observability (admin read-only analytics dahil)

### Backend'in YAPAMAYACAKLARI
- settlement sonucunu belirlemek
- `release/cancel/burn` veya payout authority'sini override etmek
- reputation authority state'i yazmak
- fon transfer etmek

### `GET /api/trades/my`
Middleware: `roomReadLimiter`. Çağıranın aktif (terminal olmayan) trade'leri. Query: `page` (varsayılan 1), `limit` (1–50, varsayılan 20). Yanıt `{ trades, total, page, limit }`; her trade `bank_profile_risk` ve `offchain_health_score_input` taşır (read-only sinyaller; ham `payout_snapshot` dönmez).

### `GET /api/trades/history`
Middleware: `roomReadLimiter`. Terminal trade'ler (`RESOLVED/CANCELED/BURNED`), `timers.resolved_at` azalan. Query: `page` (varsayılan 1), `limit` (1–50, varsayılan **10**). Yanıt biçimi `/my` ile aynı.

### `GET /api/trades/by-escrow/:onchainId`
Middleware: `roomReadLimiter`. Child trade'i on-chain trade kimliğiyle (`onchain_escrow_id`; pozitif tamsayı, aksi halde `400`) getirir. Yanıt `{ trade }`; `404` yok.

### `GET /api/trades/:id`
Middleware: `roomReadLimiter`. Trade'i Mongo `_id` ile getirir. Yanıt `{ trade }`; `404` yok.

### Cancel koordinasyonu (backend route'u yok)
Karşılıklı iptal tamamen on-chain yürür: her taraf kendi `proposeOrApproveCancel(tradeId)` tx'ini gönderir, ikinci onay iptali yürütür. İkinci onaydan önce taraf kendi onayını `revokeCancel(tradeId)` ile geri çekebilir (`CancelRevoked` event'i).
Worker `CancelProposed`'ı `cancel_proposal` alanına mirror eder. Backend imza saklamaz; eski `POST /api/trades/propose-cancel` kaldırıldı.

### `POST /api/trades/:id/chargeback-ack`
Middleware: `coordinationWriteLimiter`. Yalnız maker için, `PAID/CHALLENGED` durumlarında onay endpoint'i (hukuki/risk audit sinyali); hiçbir on-chain çağrıyı engellemez. Çağıran IP'si düz SHA-256 ile değil, yalnız master-key HMAC'i (`chargeback-ip`) olarak saklanır.

`201 { success, acknowledged_at, message }`. Hatalar: `404`, `403` (maker değil), `409 { error, acknowledged_at }` (zaten onaylanmış), `400` (durum `PAID/CHALLENGED` değil).

### `GET /api/trades/:id/settlement-proposal`
Middleware: `roomReadLimiter`. `{ tradeId, settlement_proposal }` döner (trade-scoped partial-settlement mirror payload'ı; her zaman `informational_only` ve `non_authoritative_semantics` işaretli). Yalnız read-model; **bilgilendirici**, non-authoritative.

### `POST /api/trades/:id/settlement-proposal/preview`
Middleware: `roomReadLimiter`. Bilgilendirici split önizlemesini **on-chain** `getCurrentAmounts(tradeId)` ve trade'in fee snapshot'ından hesaplar (`BASE_RPC_URL`, `ARAF_ESCROW_ADDRESS` ve geçen bir chain-id kontrolü gerekir).

İstek (Joi):
```json
{ "makerShareBps": 7000 }
```
`makerShareBps` 0–10000 arası tamsayıdır.

Yanıt alanları:
- `informationalOnly: true`, `nonAuthoritative: true`, `poolSource: "onchain-current-amounts"`
- `makerShareBps`, `takerShareBps`
- `pool`, `grossMaker`, `grossTaker`, `makerFee`, `takerFee`, `makerPayout`, `takerPayout`, `decayedAmount`, `treasuryAmount` (BigInt-safe string)
- `warning`: nihai sonucu yalnız on-chain kabul edilen tx belirler

Hatalar: `409 { code: "SETTLEMENT_ONLY_CHALLENGED" }` (önizleme yalnız trade `CHALLENGED` iken), `503 { code: "PREVIEW_UNAVAILABLE" }` (RPC/kontrat config'i yok, okuma başarısız ya da trade'in geçerli on-chain id'si yok), `400`, `403`, `404`.

### Payment risk semantiği (`PaymentRiskLevel`)
- `PaymentRiskLevel` bir kullanıcının trust/reputation notu **değildir**.
- UX/read-model için payment-rail karmaşıklık/erişilebilirlik sinyalidir.
- On-chain sonuç veya settlement finalization için asla authority olmamalıdır.

---

## 6) PII rotaları (`/api/pii`)

PII rotaları child-trade-scoped ve yoğun korumalıdır. Her rota `requireAuth` + `requireSessionWalletMatch` çalıştırır, ardından **kendi** rate limiter'ını uygular (endpoint başına ayrı bucket; trade'e bağlı olanlar trade başına anahtarlanır, bu yüzden bir endpoint'e yapılan istekler diğerlerini kilitlemez). Hassas yanıtlar `Cache-Control: no-store, max-age=0` ve `Pragma: no-cache` taşır. PII yalnız trade mirror'da `LOCKED/PAID/CHALLENGED` iken **ve** zincirde kapanmamışken verilir.

### `GET /api/pii/my`
Limiter: `piiProfileLimiter` (10 / 10 dk). `{ pii }` döner: çağıranın kendi çözülmüş payout profili (`{ rail, country, contact: { channel, value }, fields }`) ya da `{ pii: null }`.

### `GET /api/pii/taker-name/:onchainId`
Limiter: `piiTakerNameLimiter` (trade başına 10 / 10 dk). Yalnız maker: maker, lock anı snapshot'ından taker'ın hesap sahibi adını okur. Yanıt `{ bankOwner }` (taker henüz yoksa `null`).

Hatalar: `400` (hatalı id / durum aktif değil / zincirde kapanmış), `403` (çağıran maker değil), `404`, `409 { code: "SNAPSHOT_UNAVAILABLE" }` (snapshot yok ya da eksik; güncel profile fallback yoktur), `503 { code: "IDENTITY_NORMALIZATION_REQUIRED" }` (identity migration tamamlanmamış; deploy rehberine bakın).

### `POST /api/pii/request-token/:tradeId`
Limiter: `piiTokenRequestLimiter` (trade başına 5 / 10 dk). Yalnız taker. Kısa ömürlü trade-scoped PII token üretir: `{ piiToken }`. Hatalar: `400` (hatalı id / durum), `403` (taker değil), `404`.

### `GET /api/pii/:tradeId`
Middleware sırası: `requireAuth`, `requireSessionWalletMatch`, `requirePIIToken`, `piiFetchLimiter` (trade başına 5 / 10 dk). Maker ödeme bilgisini lock anı snapshot'ından döner: `{ payoutProfile: { rail, country, contact: { channel, value }, fields }, notice }`.

Hatalar: `403` (taker değil, trade artık aktif değil, zincirde kapanmış), `404`, `409 { code: "SNAPSHOT_UNAVAILABLE" }`, şifre çözme hatasında genel mesajlı `500`.

Güvenlik özellikleri:
- hassas yanıtlarda no-store cache header'ları
- trade tutarlılığı için snapshot-first davranış (güncel profile fallback yok)
- erişim cüzdan rolü + trade durumu + trade-scoped token + session cüzdanı ile kısıtlı

---

## 7) Dekont rotası (`/api/receipts`)

### `POST /api/receipts/upload`
Middleware: `requireAuth`, `requireSessionWalletMatch`, `receiptUploadLimiter`, ardından multipart parser. Child trade için şifreli dekont payload'ı yükler.

Beklenen multipart alanlar:
- `receipt` dosyası (JPEG/PNG/WebP/GIF/PDF, en çok 5 MB)
- `onchainEscrowId` (pozitif sayısal trade ID)

Davranış:
- MIME magic byte doğrular
- payload'ı çağıranın cüzdanından türetilen anahtarla şifreler
- dekont hash'ini + şifreli blob'u trade belgesine yazar (dekont saklama süresi: 30 gün)
- yalnız taker için, trade `LOCKED` iken ve trade başına bir kez izinlidir

Yanıt: `201 { hash }`. Hatalar: `400` (dosya yok / hatalı `onchainEscrowId` / trade `LOCKED` değil), `403` (taker değil), `404`, `409` (dekont zaten yüklenmiş; üzerine yazılamaz), `413` (5 MB üstü), `415` (desteklenmeyen MIME ya da magic byte uyuşmazlığı).

---

## 8) Feedback, stats, log, referans kur

### `POST /api/feedback`
Middleware: `requireAuth`, `requireSessionWalletMatch`, `feedbackLimiter`.
```json
{ "rating": 1, "comment": "opsiyonel, en çok 1000 karakter", "category": "bug | suggestion | ui/ux | other" }
```
`rating` 1–5 arası tamsayı. Yanıt `201 { success, message }`.

### `GET /api/stats`
Middleware: `statsReadLimiter`. Public protokol istatistikleri: en son `HistoricalStat` satırından `{ stats }` + `changes_30d` ve `meta` (`cache_ttl_seconds`, `open_order_semantics`, `numeric_fields_are_approximate`). Redis'te 300 sn önbelleklenir. Henüz snapshot yoksa `{ stats: {} }`.

### `POST /api/logs/client-error`
Middleware: `clientLogLimiter`. Frontend runtime'ının kullandığı, akışı bloklamayan istemci hata telemetrisi. Gövde: `message` (zorunlu string, en çok 500 karakter tutulur), opsiyonel `stack`, `componentStack`, `url`. Kontrol karakterleri ve PII benzeri değerler (IBAN, cüzdan, e-mail, bearer/JWT) loglanmadan önce maskelenir. Yanıt `204`; `message` yoksa `400`.

### `GET /api/reference-rates/ticker`
Middleware: `marketReadLimiter`. Public, bilgilendirici referans kur şeridi: `{ items, generatedAt, informationalOnly: true, nonAuthoritative: true, canAffectSettlement: false }`. `REFERENCE_TICKER_MAX_STALE_SECONDS`'tan (varsayılan 86400) eski satırlar taşınmaz, düşürülür.

---

## 9) Rewards mirror (`/api/rewards`)

Ödül event'lerinin public, read-only mirror'ı; router'ın tamamı `marketReadLimiter` arkasındadır. Authority `ArafRewards` / `ArafRevenueVault` kontratlarındadır; backend alıcı, ağırlık veya claimable tutar hesaplamaz.

| Route | Yanıt |
|---|---|
| `GET /api/rewards/epochs/current` | `{ epoch, rows, source: "WALL_CLOCK_ESTIMATE_NOT_AUTHORITY" }` (30 günlük epoch duvar saatinden tahmin edilir) |
| `GET /api/rewards/epochs/:epoch` | `{ epoch, rows }`; `:epoch` 1–12 rakam (aksi halde `400`) |
| `GET /api/rewards/health` | `{ mirror_only: true, counts: { epochs, claims, funding } }` |
| `GET /api/rewards/funding/global` | `{ rows }` (son 200 `GLOBAL` funding event'i) |
| `GET /api/rewards/funding/product/:productId` | `{ productId, rows }`; `:productId` `0x` + 64 hex (aksi halde `400`); son 200 |
| `GET /api/rewards/:wallet/claimable` | `{ wallet, claimable: [], source: "ESTIMATE_UNAVAILABLE_USE_ONCHAIN_GETTER" }`; her zaman boş, on-chain `claimable(...)` getter'ını kullanın |
| `GET /api/rewards/:wallet/history` | `{ wallet, claims }` (son 200 claim event'i); hatalı adres `400` |

---

## 10) Admin read-only gözlem (`/api/admin`)

Router'ın tamamı `requireAuth` → `requireSessionWalletMatch` → `requireAdminWallet` → `adminReadLimiter` (cüzdan başına 60 / dk) zincirini çalıştırır. Yazma/override aksiyonu sunulmaz. Admin erişimi yalnız `ADMIN_WALLETS` ile belirlenir.

| Route | Query (Joi) | Yanıt |
|---|---|---|
| `GET /api/admin/summary` | — | `{ timestamp, readiness, stats, tradeCounts, settlementAnalytics, resolutionAnalytics, dlq, scheduler, degraded }`; her alt kaynak ayrı ayrı degrade olur ve `degraded.errors` içinde listelenir |
| `GET /api/admin/trades` | `status` (`ALL\|LOCKED\|PAID\|CHALLENGED\|RESOLVED\|CANCELED\|BURNED`, varsayılan `CHALLENGED`), `tier` 0–4, `origin` (`ALL\|ORDER_CHILD\|DIRECT_ESCROW`), `riskOnly` (bool), `snapshotComplete` (`ALL\|true\|false`), `page`, `limit` (1–50, varsayılan 20) | `{ trades, total, page, limit, paginationScope }`. `riskOnly=true` sınırlı pencerede çalışır (`windowSize` 1000) ve bunu `paginationScope` içinde belirtir |
| `GET /api/admin/settlement-proposals` | `state` (`ALL\|PROPOSED\|EXPIRED\|FINALIZED\|REJECTED\|WITHDRAWN`, varsayılan `ALL`), `riskOnly` (bool), `page`, `limit` (1–50, varsayılan 20) | `{ proposals, total, page, limit }`; teklifler `informational_only` / `non_authoritative_semantics` işaretlidir |
| `GET /api/admin/feedback` | `category`, `rating` 1–5, `page`, `limit` (1–50, varsayılan 20) | `{ feedback, total, page, limit }` |
| `GET /api/admin/revenue` | — | `{ rows }` (son 500 `RevenueEvent` satırı) |
| `GET /api/admin/rewards/health` | — | `{ mirror_only: true, counts: { epochs, funding, claims } }` |

Admin olmayan cüzdanlar `403` alır; `/summary` içindeki `scheduler` bloğu `reputationDecayLastRunAt`, `statsSnapshotLastRunAt`, `sensitiveCleanupLastRunAt`, `userBankRiskCleanupLastRunAt` alanlarını listeler.

---

## 11) Health endpoint'leri

İkisinde de rate limiter ve kimlik doğrulama yoktur; `/api` altında değildir.

### `GET /health`
Liveness probe (process ayakta sinyali, bellek içi, RPC çağırmaz). `200 { status: "ok", timestamp, worker: { state, lastBlockAgeMs } }`. Event worker blokları izliyorsa ve `WORKER_LIVENESS_STALE_MS` boyunca yeni blok görülmediyse durum `"stale"` olur ve HTTP kodu **`503`** döner (platform makineyi yeniden başlatsın diye). Worker nesnesi yoksa her zaman `ok`'tur. Fly.io health check'i budur (`backend/fly.toml`).

### `GET /ready`
Readiness probe: Mongo, Redis, provider, chain id, config, replay bootstrap ve worker (durum, lag ≤ `WORKER_MAX_LAG_BLOCKS`, `replaying` değil). Hazırsa `200`, değilse `503` (kontrolün kendisi başarısız olursa `503 { ok: false, error: "readiness_unavailable" }`).

- Sonuç `READY_CACHE_TTL_MS` (varsayılan 7000 ms, 5000–10000 aralığına sıkıştırılır) kadar önbelleklenir ve eşzamanlı çağrılar birleştirilir; böylece kimliksiz bir çağıran her istekte RPC tetikleyemez.
- **Kimliksiz görünüm redakte edilir:** `{ ok, checks, worker: { state, replaying, lagBlocks }, configIssueCount, degraded, degradedReasons }`; eksik config adları, blok numaraları, chain id'ler ve worker diagnostics gösterilmez.
- **İç görünüm:** `x-internal-token: <READY_INTERNAL_TOKEN>` header'ı gönderin (sabit zamanlı karşılaştırma; env tanımlı değilse kapalıdır); `missingConfig`, `worker.diagnostics` ve blok/zincir ayrıntılarıyla tam gövde döner.

---

## 12) Kanonik terminoloji notları

- Kanonik pazar primitive'i listing değil **parent order**'dır.
- Kanonik escrow yaşam döngüsü **child trade**'dir.
- Backend modellerindeki `onchain_escrow_id`, child-trade on-chain kimliğini ifade eder.
- Backend bir mirror/coordination katmanıdır, protokol authority'si değildir.
