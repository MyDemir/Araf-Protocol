# Araf V3 Test Senaryoları ve Kapanış Planı

Bu dosya, `ArafEscrow-yeni.sol` için kapsamlı V3 kontrat test planıdır. Ana DOCX sürümü ile aynı içeriğin sade markdown çıktısıdır.

## Önerilen test dosyaları
- `ArafEscrow.legacy.test.js`
- `ArafEscrow.orders.sell.test.js`
- `ArafEscrow.orders.buy.test.js`
- `ArafEscrow.accounting.test.js`
- `ArafEscrow.config.test.js`
- `ArafEscrow.events.test.js`
- `ArafEscrow.e2e.test.js`

## Fixture standardı
- 3 parametreli `createEscrow` çağrısı `InvalidListingRef` revert etmelidir.
- Tüm yeni testler 4 parametreli canonical create yolunu kullanmalıdır.
- Base fixture supported token, wallet registration, aging, native dust ve allowance hazırlamalıdır.
- Tier 4 gereken bloklar için ayrı boosted fixture kullanılmalıdır.
- ListingRef / orderRef deterministik üretilmelidir.
- Event parser helper `OrderFilled -> EscrowCreated -> EscrowLocked` sırasını okuyabilmelidir.

## Senaryo kataloğu

### Legacy regression
- LGC-01: Legacy 3-param create revert
- LGC-02: Canonical create works
- LGC-03: Happy path release
- LGC-04: Cancel OPEN escrow
- LGC-05: Challenge path
- LGC-06: Burn path
- LGC-07: Collaborative cancel in LOCKED
- LGC-08: Collaborative cancel in PAID
- LGC-09: AutoRelease negligence
- LGC-10: Pause still allows closing
- LGC-11: Tier caps unchanged
- LGC-12: Reputation ban & decay regression

### Sell order
- SEL-01: Create sell order success
- SEL-02: Sell order upfront lock
- SEL-03: Invalid min fill
- SEL-04: Zero/invalid refs
- SEL-05: Tier gating
- SEL-06: Token direction blocked
- SEL-07: Partial fill creates child
- SEL-08: Final fill closes order
- SEL-09: Min fill exception on last remainder
- SEL-10: Overfill blocked
- SEL-11: Under-min non-final blocked
- SEL-12: Self fill blocked
- SEL-13: Cancel OPEN sell order
- SEL-14: Cancel PARTIALLY_FILLED sell order
- SEL-15: Wrong cancel path

### Buy order
- BUY-01: Create buy order success
- BUY-02: Buy order upfront reserve
- BUY-03: Direction blocked
- BUY-04: Tier gating on create
- BUY-05: Partial fill creates child
- BUY-06: Final fill closes order
- BUY-07: Buy owner re-check taker gate
- BUY-08: Maker tier check on filler
- BUY-09: Self fill blocked
- BUY-10: Min fill edge
- BUY-11: Cancel OPEN buy order
- BUY-12: Cancel PARTIALLY_FILLED buy order
- BUY-13: Wrong cancel path

### Accounting
- ACC-01: Sell reserve proportional slice
- ACC-02: Buy reserve proportional slice
- ACC-03: Final fill sweeps remainder
- ACC-04: Child aggregate amount conservation
- ACC-05: Sell partial cancel conservation
- ACC-06: Buy partial cancel conservation
- ACC-07: Tier0 zero-bond on order paths
- ACC-08: Treasury accounting on child release

### Fee snapshot & config
- SNP-01: Legacy escrow fee snapshot
- SNP-02: Sell order snapshot immutability
- SNP-03: Buy order snapshot immutability
- SNP-04: New orders use new fee
- SNP-05: Tier0 maker fee zero
- SNP-06: Cooldown applies only to new entries
- SNP-07: Tier2+ cooldown remains zero
- SNP-08: Getter integrity

### Token config / pause / access
- CFG-01: setSupportedToken sync
- CFG-02: setTokenConfig split routing
- CFG-03: Unsupported token blocks legacy create
- CFG-04: Pause blocks new entries
- CFG-05: Pause does not block close paths
- CFG-06: OnlyOwner config ops
- CFG-07: Treasury update routing

### Event contract
- EVT-01: Sell fill event order
- EVT-02: Buy fill event order
- EVT-03: Sell payload correctness
- EVT-04: Buy payload correctness
- EVT-05: Order cancel payload
- EVT-06: Config update events

### Negative / security
- NEG-01: Sell fill taker gate – wallet too young
- NEG-02: Sell fill taker gate – dust low
- NEG-03: Sell fill taker gate – banned
- NEG-04: Buy fill owner gate – banned owner
- NEG-05: Invalid order state on refill
- NEG-06: Double close protection
- NEG-07: Reentrancy-sensitive payouts
- NEG-08: Getter on nonexistent ids

### E2E
- E2E-01: Sell order -> child happy path
- E2E-02: Buy order -> child happy path
- E2E-03: Sell child dispute then cancel
- E2E-04: Buy child burn path
- E2E-05: Mixed partial fills then parent cancel
- E2E-06: Config change between partial fills

## Kabul kapısı
- Legacy regression paketi geçmeli.
- Sell ve buy order yüzeyinde tüm P0 senaryoları geçmeli.
- Reserve conservation ve final fill rounding sweep testleri geçmeli.
- Fee snapshot senaryoları immutability kanıtlamalı.
- Same-tx event order testleri logIndex seviyesinde geçmeli.
- Pause/access/token direction testleri yeni giriş ve kapanış yollarını doğru ayrıştırmalı.
- En az iki E2E order -> child lifecycle akışı sorunsuz tamamlanmalı.
