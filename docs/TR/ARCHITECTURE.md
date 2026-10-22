<div align="center">

# 🌀 Araf Protokolü
### Kanonik Mimari & Teknik Referans — V3 Order-First

[![Version](https://img.shields.io/badge/versiyon-V3_Order--First-00c9a7?style=flat-square)](.)
[![Network](https://img.shields.io/badge/ağ-Base_L2_(8453)-0052FF?style=flat-square&logo=coinbase)](.)
[![Status](https://img.shields.io/badge/durum-Canonical-f5a623?style=flat-square)](.)
[![Updated](https://img.shields.io/badge/güncelleme-2026--10--22-purple?style=flat-square)](.)
[![Solidity](https://img.shields.io/badge/Solidity-0.8.24-363636?style=flat-square&logo=solidity)](.)
[![Docs](https://img.shields.io/badge/docs-Source_of_Truth-green?style=flat-square)](.)

---

*Parent-order first market modeli ile çalışan, child-trade seviyesinde gerçek escrow lifecycle yürüten, non-custodial ve oracle-free P2P protocol.*

*Son doğrulama: 2026-10-22 (kod gerçekliği: `contracts/src`, `backend/scripts`, `frontend/src`; çelişkide kod esastır).*

> **"Contract decides. Off-chain only mirrors, coordinates, and accelerates."**

</div>

---

## 📋 İçindekiler

| # | Bölüm |
|---|---|
| 1 | [Executive canonical model](#1-executive-canonical-model) |
| 2 | [Hibrit mimari ve teknoloji stack](#2-hibrit-mimari-ve-teknoloji-stack) |
| 3 | [On-chain public surface](#3-on-chain-public-surface-arafescrowsol) |
| 4 | [Parent order vs child trade state modeli](#4-parent-order-vs-child-trade-state-modeli) |
| 5 | [Sell flow, Buy flow ve role mapping](#5-sell-flow-buy-flow-ve-role-mapping) |
| 6 | [Anti-sybil enforcement semantiği](#6-anti-sybil-enforcement-semantiği-v3) |
| 7 | [Dispute / Bleeding Escrow teknik akışı](#7-disputebleeding-escrow-teknik-akışı) |
| 8 | [Reputation / bans / clean-slate](#8-reputation--bans--clean-slate) |
| 9 | [Finalized parameters ve mutable config ayrımı](#9-finalized-parameters-ve-mutable-config-ayrımı) |
| 10 | [Runtime bağlantı ve operasyon politikaları](#10-runtime-bağlantı-ve-operasyon-politikaları) |
| 11 | [Event worker / replay / mirror reliability](#11-event-worker--replay--mirror-reliability) |
| 12 | [Güvenlik mimarisi ve trust boundaries](#12-güvenlik-mimarisi-ve-trust-boundaries) |
| 13 | [Veri modelleri](#13-veri-modelleri-mongo-read-model-katmanı) |
| 14 | [Backend route surface ve coordination semantiği](#14-backend-route-surface-ve-coordination-semantiği) |
| 15 | [Frontend UX guardrail katmanı](#15-frontend-ux-guardrail-katmanı) |
| 16 | [Saldırı vektörleri ve bilinen sınırlamalar](#16-saldırı-vektörleri-ve-bilinen-sınırlamalar) |
| 17 | [Legacy concepts](#17-legacy-concepts-historical--deprecated--non-canonical) |
| 18 | [Sonuç: bu dokümanın rolü](#18-sonuç-bu-dokümanın-rolü) |

---

## 1. Executive canonical model

Araf V3’te pazar primitive’i artık listing değil, **parent order**’dır.

```mermaid
flowchart TD
    A[Parent Order] --> B[OrderFilled]
    B --> C[Child Trade]
    C --> D[LOCKED]
    D --> E[PAID]
    E --> F[RESOLVED]
    E --> G[CHALLENGED]
    D --> H[CANCELED]
    E --> H
    G --> F
    G --> H
    G --> I[BURNED]
```

- **Parent Order** = kamusal market/order katmanı
- **Child Trade** = gerçek escrow lifecycle (ekonomik state machine)
- **Contract** = tek authoritative state machine
- **Backend** = mirror + coordination + operational read layer
- **Frontend** = UX guardrail + contract access layer

### 1.1 Otorite sınırları
- On-chain state transition ve ekonomik dağıtımın nihai belirleyicisi kontrattır.
- Backend “hakem” değildir; state üretmez, yalnızca mirror eder ve operasyonel koordinasyon sağlar.
- Frontend enforcement katmanı değildir; kullanıcıyı doğru akışa zorlayan guardrail katmanıdır.

### 1.2 V3’ün pratik sonucu
- Market yüzeyinde konuşulan nesne parent order’dır.
- Dispute, release, cancel, burn gibi escrow yaşam döngüsü child trade seviyesinde yürür.
- Kimlik doğrulamada authority: `OrderFilled + getTrade(tradeId)` kombinasyonu.

---

## 2. Hibrit mimari ve teknoloji stack

Araf hem güvenlik hem operasyonel gereksinimleri birlikte taşır. Bu nedenle mimari “Web2.5” hibrittir: on-chain authority + off-chain operational acceleration.

```mermaid
graph TB
    subgraph ONCHAIN [On-Chain]
        A[ArafEscrow.sol]
        B[Escrow state machine]
        C[Reputation enforcement]
        D[Governance controls]
    end

    subgraph BACKEND [Backend / Worker]
        E[Session & PII boundary]
        F[Mirror / projection]
        G[Replay / DLQ / checkpoint]
    end

    subgraph DATA [Data Plane]
        H[Mongo read-model]
        I[Redis ephemeral coordination]
    end

    subgraph FE [Frontend]
        J[Contract access layer]
        K[UX guardrails]
    end

    FE --> ONCHAIN
    FE --> BACKEND
    BACKEND --> ONCHAIN
    BACKEND --> DATA
```

### 2.1 Neden hibrit tasarım?
- **On-chain:** fon custody, state transition, ekonomik kurallar, reputasyon enforcement
- **Off-chain (Mongo):** read model, performans, PII ve operasyonel metadata
- **Redis:** checkpoint, readiness, rate limit, kısa ömürlü koordinasyon

### 2.2 Katman matrisi

| Katman | Ana sorumluluk | Authority seviyesi | Teknoloji |
|---|---|---|---|
| Contract | Escrow state machine, payout, dispute economics, governance controls | **Authoritative** | Solidity / Base |
| Backend API | Session, projection, coordination, PII güvenlik sınırı | Non-authoritative | Node.js + Express |
| Event Worker | Event mirror, replay, checkpoint/DLQ | Non-authoritative | ethers + Mongo + Redis |
| Mongo | Read model / operasyonel cache | Non-authoritative | MongoDB + Mongoose |
| Redis | Ephemeral coordination / safety signals | Non-authoritative | Redis |
| Frontend | Contract write/read orchestration + UX guardrails | Non-authoritative | React + Wagmi + viem |

### 2.3 Non-custodial backend modeli
- Backend kullanıcı fonlarını hareket ettiren custody anahtarı taşımaz.
- Backend, kontrat adına release/challenge/cancel sonucu “uyduramaz”.
- Opsiyonel `RELAYER_PRIVATE_KEY` yalnız permissionless bakım çağrıları içindir (`decayReputation`, `ArafRewards.recordTradeOutcomes`); bu anahtar fon hareket ettiremez ve yetki üretmez.
- Backend’in güçlü olduğu yer: session/policy/PII access boundary ve operasyonel görünürlük.
- Araf kimin haklı olduğuna karar vermez; split settlement normal kapanış yolu değildir ve yalnız `CHALLENGED` dispute safhasında kullanılabilir.

---

## 3. On-chain public surface (`ArafEscrow.sol`)

Kontrat, V3’ün tek authoritative state machine yüzeyidir. Aşağıdaki fonksiyon kümeleri canlı protocol davranışını tanımlar.

| Surface | Fonksiyonlar | Mimari anlam |
|---|---|---|
| Parent-order write surface | `createSellOrder`, `fillSellOrder`, `cancelSellOrder`, `createBuyOrder`, `fillBuyOrder`, `cancelBuyOrder` | Kamusal market ve fill primitive’i |
| Child-trade lifecycle write surface | `reportPayment`, `releaseFunds`, `challengeTrade`, `autoRelease`, `burnExpired`, `proposeOrApproveCancel`, `revokeCancel`, `expirePaymentWindow`, `proposeSettlement`, `acceptSettlement(tradeId, expectedProposalId)`, `rejectSettlement`, `withdrawSettlement`, `expireSettlement` | Gerçek escrow lifecycle ve ekonomik state geçişleri |
| Liveness / yardımcı write surface | `registerWallet`, `pingMaker`, `pingTakerForChallenge`, `decayReputation` | Entry gate, liveness ve clean-slate bakım yüzeyi |
| Governance / mutable admin surface (`onlyOwner`) | `setTreasury`, `setFeeConfig`, `setCooldownConfig`, `setTokenConfig`, `setReputationPolicy`, `setReputationTierThresholds`, `pause`, `unpause` (+ `Ownable`: `transferOwnership`, `renounceOwnership`) | Runtime policy ve governance kontrol yüzeyi |
| Read surface | `getOrder`, `getTrade`, `getReputation`, `getTokenConfig`, `getSettlementProposal`, `getRewardableTrade`, `getFeeConfig`, `getCooldownConfig`, `getCurrentAmounts`, `antiSybilCheck`, `getCooldownRemaining`, `getFirstSuccessfulTradeAt`, `cleanPeriod`, `maxAllowedTier`, `walletRegisteredAt`, `treasury`, `tradeCounter`, `orderCounter` | Doğrulama, görünürlük ve runtime read yüzeyi |

### 3.1 Parent-order write surface
- `createSellOrder(token, totalAmount, minFillAmount, tier, orderRef, paymentRiskLevel)` — satıcı envanteri + toplam maker bond rezervini peşin kilitler. Order sahibi için yalnız aktif ban kontrol edilir (`MakerBanActive`).
- `createBuyOrder(...)` — alıcı yalnız kendi toplam taker bond rezervini kilitler; sahibi child trade'de taker olacağı için create anında ban (`TakerBanActive`), kayıt (`registerWallet` yapılmamışsa `WalletTooYoung`), dust (`InsufficientNativeBalance`) ve tier cooldown (`TierCooldownActive`) kontrollerinden geçer (bu sırayla). **2 günlük cüzdan yaşı kontrolü create'te yoktur**; `fillBuyOrder` anında `_enforceTakerEntry` ile uygulanır (§6).
- `fillSellOrder(orderId, fillAmount, childListingRef)` / `fillBuyOrder(...)` — exact fill; child trade aynı tx'te `LOCKED` doğar. Son fill kalan rezervin tamamını süpürür (yuvarlama birikmez).
- `cancelSellOrder` / `cancelBuyOrder` — yalnız order sahibi, yalnız `OPEN`/`PARTIALLY_FILLED`; doldurulmamış envanter (sell) ve kullanılmamış bond rezervi iade edilir.
- Order doğrulaması: `totalAmount > 0`, `0 < minFillAmount ≤ totalAmount`, `tier ≤ 4`, `orderRef ≠ 0`, tier ≤ sahibinin efektif tier'ı (`TierNotAllowed`), tutar ≤ token'ın tier tavanı (`AmountExceedsTierLimit`; Tier 4 sınırsız). Token yönü kapalıysa `TokenDirectionNotAllowed`. Fee-on-transfer token girişleri `InvalidTransferAmount` ile reddedilir.
- Fill doğrulaması: `childListingRef ≠ 0`, self-trade yasak (`SelfTradeForbidden`), `fillAmount ≤ remaining`, `fillAmount ≥ minFillAmount` (son kalan kısım hariç).
- Fill anında hem filler'ın hem order sahibinin efektif tier'ı order tier'ına yetmeli (`TierNotAllowed`, Tier 0 hariç); maker rolündeki taraf için aktif ban `MakerBanActive` ile, taker rolündeki için giriş kapısı (ban/yaş/dust/cooldown) ile yeniden kontrol edilir. Create sonrası ceza alan sahibin açık order'ı böylece doldurulamaz.
- `pause` yalnız bu yüzeydeki `create*` ve `fill*` çağrılarını durdurur (`whenNotPaused`); order iptali ve aşağıdaki tüm trade yolları pause'dan etkilenmez.

### 3.2 Child-trade lifecycle write surface
- `reportPayment(tradeId, ipfsHash)` — yalnız taker, yalnız `LOCKED`, yalnız `lockedAt + PAYMENT_WINDOW` öncesi; dekont hash'i storage'a yazılmaz, kanonik kaydı `PaymentReported` event'idir.
- `releaseFunds` — yalnız maker, `PAID` veya `CHALLENGED`.
- `challengeTrade` — yalnız maker, ping sonrası pencere içinde (bkz. §7).
- `autoRelease` — yalnız taker, `pingMaker` + 24 saat sonra.
- `burnExpired` — permissionless, `challengedAt + MAX_BLEEDING` sonrası.
- `expirePaymentWindow` — maker veya taker, `lockedAt + PAYMENT_WINDOW` anından itibaren.
- `proposeOrApproveCancel` / `revokeCancel` — iki taraf, `LOCKED`/`PAID`/`CHALLENGED`.
- `proposeSettlement` / `acceptSettlement(tradeId, expectedProposalId)` / `rejectSettlement` / `withdrawSettlement` / `expireSettlement` — yalnız `CHALLENGED` (bkz. §7.6).

> **Bytecode ayrımı (EIP-170):** `ArafEscrow` iki external library'ye linklenir: `ArafReputationLib` (sonuç kaydı, risk puanı,
> ban/tier tavanı, reputation politika setter doğrulaması) ve `ArafSettlementLib` (terminal payout + treasury hook'ları,
> settlement teklif yönetimi). Library'ler DELEGATECALL ile escrow storage'ında çalışır; event'ler escrow adresinden aynı
> imzalarla yayınlanır, yetki kontrolleri escrow'da kalır, adresler deploy anında bytecode'a gömülür (upgrade yolu yok).
> Deploy sırası: `ArafReputationLib` → `ArafSettlementLib` (ikisi bağımsız) → linkli `ArafEscrow` (`contracts/scripts/deploy.js`).
> Runtime bytecode boyutları (solc 0.8.24, `viaIR`, optimizer 200 run, `cancun`): `ArafEscrow` 22.585 bayt (pay 1.991) (EIP-170 sınırı 24.576),
> `ArafReputationLib` 4.732, `ArafSettlementLib` 2.394 bayt. Hardhat ağında `allowUnlimitedContractSize: false` ile sınır yerelde de zorlanır.

### 3.3 Liveness / yardımcı write surface
- `registerWallet` — cüzdan yaşı sayacını başlatır (tek kez; `AlreadyRegistered`).
- `pingMaker` — taker, `paidAt + GRACE_PERIOD` sonrası.
- `pingTakerForChallenge` — maker, `paidAt + 24 saat` sonrası, trade başına bir kez.
- `decayReputation(wallet)` — permissionless clean-slate (bkz. §8.3).

### 3.4 Governance / mutable admin surface
- `setTreasury` (sıfır adres yasak: `ZeroAddress`; yeni hazine bu escrow'a bağlı vault olmalı: `escrow()` getter'ı `address(this)` döndürmeli, aksi hâlde EOA, kodsuz adres, getter'ı olmayan ya da başka escrow'a bağlı kontrat `TreasuryEscrowMismatch` ile reddedilir. Constructor'daki ilk hazine bu kontrole tabi değildir.)
- `setFeeConfig` (taraf başına ≤ 2000 bps)
- `setCooldownConfig` (her tier için ≤ 30 gün)
- `setTokenConfig` (token sıfır adres olamaz: `ZeroAddress`; decimals 1–18 ve token'ın `decimals()` değerine eşit, aksi `InvalidDecimals`; dört tier tavanı > 0, aksi `ZeroAmount`). `TokenConfigUpdated(token, supported, allowSellOrders, allowBuyOrders)` ile birlikte `TokenLimitsUpdated(token, decimals, tierMaxAmountsBaseUnit[4])` yayar. Constructor da sıfır hazineyi `ZeroAddress` ile reddeder.
- `setReputationPolicy`, `setReputationTierThresholds` (sınırlar §8.4)
- `pause` / `unpause`

Kontrata göre owner yetkileri (hiçbirinde zaman kilidi yoktur; ayrıntılı runbook: [GOVERNANCE_READINESS.md](./GOVERNANCE_READINESS.md)):

| Kontrat | Owner fonksiyonları | Kod sınırı |
|---|---|---|
| `ArafEscrow` | `setTreasury`, `setFeeConfig`, `setCooldownConfig`, `setTokenConfig`, `setReputationPolicy`, `setReputationTierThresholds`, `pause`/`unpause` | Hazine yalnız bu escrow'a bağlı vault (`TreasuryEscrowMismatch`); fee ≤ 2000 bps; cooldown ≤ 30 gün; decimals token'la eşleşmeli; politika sınırları §8.4; pause yalnız create/fill |
| `ArafRevenueVault` | `setRewardBps`, `setFinalTreasury`, `setRewards` (tek seferlik), `setSupportedToken`, `setProductPool`, `withdrawTreasuryShare`, `withdrawTreasuryShareToFinal`, `pause`/`unpause` | `rewardBps` 4000–7000; çekim yalnız treasury rezervinden; pause yalnız sponsor fonlamasını durdurur |
| `ArafRewards` | `allocateEpochRewards`, `pause`/`unpause` | Kaynak yalnız vault; kayıt, finalize, claim ve sweep pause edilemez ve alıcı seçilemez |

### 3.5 Read surface
- `getOrder`, `getTrade`, `getReputation`, `getTokenConfig`, `getSettlementProposal`
- `getRewardableTrade` (ArafRewards'ın tek veri kaynağı)
- `getFeeConfig`, `getCooldownConfig`
- `getCurrentAmounts`
- `antiSybilCheck`, `getCooldownRemaining`, `getFirstSuccessfulTradeAt`, `walletRegisteredAt`
- `cleanPeriod()`, `maxAllowedTier(wallet)`
- Struct mapping'leri `internal`'dır; veri yalnız bu adlandırılmış getter'larla okunur. Reputation politika puanları için ayrı getter yoktur; değerler `ReputationPolicyUpdated` / `ReputationTierThresholdsUpdated` event'leriyle (constructor'da da) yayınlanır.

---

## 4. Parent order vs child trade state modeli

Parent order market görünürlüğünü taşır; child trade ise gerçek escrow lifecycle’ı taşır.

```mermaid
stateDiagram-v2
    state "Parent Order" as PO {
        [*] --> OPEN
        OPEN --> PARTIALLY_FILLED
        PARTIALLY_FILLED --> FILLED
        OPEN --> CANCELED
        PARTIALLY_FILLED --> CANCELED
    }

    state "Child Trade" as CT {
        [*] --> LOCKED
        LOCKED --> PAID
        LOCKED --> CANCELED
        PAID --> CHALLENGED
        PAID --> RESOLVED
        PAID --> CANCELED
        CHALLENGED --> RESOLVED
        CHALLENGED --> CANCELED
        CHALLENGED --> BURNED
    }
```

### 4.1 Parent order state
- `OPEN`
- `PARTIALLY_FILLED`
- `FILLED`
- `CANCELED`

Parent order market görünürlüğünü taşır; escrow uyuşmazlığı çözmez.

### 4.2 Child trade state
- `OPEN` (enum'da durur; V3 fill path’i trade'i doğrudan `LOCKED` üretir, `OPEN` hiç yazılmaz)
- `LOCKED`
- `PAID`
- `CHALLENGED`
- `RESOLVED`
- `CANCELED`
- `BURNED`

### 4.3 Fill anında child trade yaratımı
Hem `fillSellOrder` hem `fillBuyOrder` akışında child trade aynı tx içinde doğrudan `LOCKED` oluşur. Böylece eski create+lock zinciri yerine tek adımda escrow entry gerçekleşir.

### 4.4 Kimlik ilişkisi
- Parent order identity: `orderId`
- Child trade identity: `tradeId` (`onchain_escrow_id` mirror)
- Link authority: `OrderFilled(orderId, tradeId, ...)` + `getTrade(tradeId)`

---

## 5. Sell flow, Buy flow ve role mapping

V3’te role mapping side-dependent olduğu için bu bölümde “owner kim, maker kim, taker kim?” ilişkisi netleştirilmelidir.

```mermaid
flowchart LR
    subgraph SELL ["SELL_CRYPTO"]
        A1[Owner] --> A2[Maker]
        A3[Filler] --> A4[Taker]
    end

    subgraph BUY ["BUY_CRYPTO"]
        B1[Owner] --> B2[Taker]
        B3[Filler] --> B4[Maker]
    end
```

### 5.1 Sell flow
1. Owner `createSellOrder`
2. Filler `fillSellOrder` (taker gate uygulanır)
3. Child trade `LOCKED`
4. Taker `reportPayment`
5. Maker `releaseFunds` veya dispute/cancel yolları

### 5.2 Buy flow
1. Owner `createBuyOrder` (owner eventual taker olduğu için ban/kayıt/dust/cooldown create-time’da uygulanır; cüzdan yaşı uygulanmaz)
2. Filler `fillBuyOrder`
3. Owner (taker) fill-time’da tam taker giriş kapısından (ban, kayıt + 2 gün yaş, dust, cooldown) geçer; owner yaşını doldurmamışsa `fillBuyOrder` `WalletTooYoung` ile revert eder
4. Child trade `LOCKED`
5. `reportPayment` → `releaseFunds` / dispute / cancel

### 5.3 Side-dependent role mapping
Mutlak “maker=seller, taker=buyer” yoktur:
- `SELL_CRYPTO`: owner→maker, filler→taker
- `BUY_CRYPTO`: owner→taker, filler→maker

| Yön | Rol | Kilitlediği | Giriş kapısı | Trade'deki yetkileri |
|---|---|---|---|---|
| `SELL_CRYPTO` | Owner = maker (kripto satıcısı) | create'te envanter + toplam maker bond rezervi | create ve fill anında aktif ban; create'te tier ≤ efektif tier, fill'de tekrar | `releaseFunds`, `pingTakerForChallenge`, `challengeTrade`, iptal, settlement |
| `SELL_CRYPTO` | Filler = taker (kripto alıcısı) | fill'de taker bond | taker giriş kapısı + tier | `reportPayment`, `pingMaker`, `autoRelease`, iptal, settlement |
| `BUY_CRYPTO` | Owner = taker (kripto alıcısı) | create'te toplam taker bond rezervi | create'te ban/kayıt/dust/cooldown (yaş yok) + tier; fill'de tam taker giriş kapısı (yaş dahil) + tier | `reportPayment`, `pingMaker`, `autoRelease`, iptal, settlement |
| `BUY_CRYPTO` | Filler = maker (kripto satıcısı) | fill'de kripto + maker bond | aktif ban + tier | `releaseFunds`, `pingTakerForChallenge`, `challengeTrade`, iptal, settlement |

Her iki taraf `expirePaymentWindow` çağırabilir; `burnExpired` ve `expireSettlement` herkese açıktır.

---

## 6. Anti-sybil enforcement semantiği (V3)

Kanonik gate helper: `_enforceTakerEntry(wallet, tier)` (ban + yaş + `_enforceTakerDustAndCooldown`: dust, cooldown)

```mermaid
flowchart TD
    A[Taker entry attempt] --> B{Active ban?}
    B -- Yes --> X[Reject]
    B -- No --> C{Wallet age OK?}
    C -- No --> X
    C -- Yes --> D{Dust threshold OK?}
    D -- No --> X
    D -- Yes --> E{Tier cooldown OK?}
    E -- No --> X
    E -- Yes --> F[Entry allowed]
```

Gate bileşenleri:
- aktif ban kontrolü (`bannedUntil`; `block.timestamp <= bannedUntil` ise `TakerBanActive`)
- wallet age: `registerWallet` + `WALLET_AGE_MIN` = **2 gün** (`WalletTooYoung`)
- native balance dust eşiği: `DUST_LIMIT` = **0,001 ETH** (`InsufficientNativeBalance`)
- tier bazlı cooldown: order tier'ı 0 ise `tier0TradeCooldown`, 1 ise `tier1TradeCooldown` (varsayılan ikisi de **4 saat**, üst sınır 30 gün); Tier 2+ için cooldown yoktur (`TierCooldownActive`). `lastTradeAt` yalnız Tier 0/1 fill'lerinde taker için yazılır.

V3 uygulama noktaları:
- `fillSellOrder` (filler taker): tam kapı (`_enforceTakerEntry`)
- `fillBuyOrder` (owner taker re-check): tam kapı (`_enforceTakerEntry`); cüzdan yaşı bu yolda uygulanır
- `createBuyOrder` (owner eventual taker): `_enforceTakerEntry` KULLANMAZ; ban, kayıt (`walletRegisteredAt == 0` ise `WalletTooYoung`), dust ve cooldown ayrı çağrılır, 2 günlük yaş kontrolü yoktur (fill'e taşınmıştır)

Maker rolü için yalnız aktif ban bakılır (`MakerBanActive`): `createSellOrder` (owner), `fillSellOrder` (owner), `fillBuyOrder` (filler). Yaş/dust/cooldown kapıları taker girişine özgüdür; maker zaten envanter + bond kilitler. Tier kapısı ayrıca uygulanır: order tier'ı create anında sahibinin, fill anında hem sahibinin hem filler'ın efektif tier'ını aşamaz.

`antiSybilCheck(wallet)` ve `getCooldownRemaining(wallet)` yalnız bilgi amaçlıdır; parametresiz oldukları için iki tier cooldown'unun büyüğünü raporlar, bağlayıcı karar state-changing fonksiyonlardadır.

Sonuç: anti-sybil enforcement lockEscrow-merkezli legacy değildir; V3 child-trade entry path merkezlidir.

---

## 7. Dispute/Bleeding Escrow teknik akışı

Bu bölüm V3’ün gerçek ekonomik state machine’ini açıklar. `LOCKED` ve `PAID` sonrası normal çözüm, dispute, liveness, cancel ve burn yolları child trade seviyesinde çalışır.

```mermaid
stateDiagram-v2
    [*] --> LOCKED
    LOCKED --> PAID : reportPayment
    LOCKED --> CANCELED : expirePaymentWindow / dual cancel
    PAID --> RESOLVED : releaseFunds
    PAID --> CHALLENGED : pingTakerForChallenge -> challengeTrade
    PAID --> RESOLVED : pingMaker -> autoRelease
    PAID --> CANCELED : dual cancel
    CHALLENGED --> RESOLVED : releaseFunds / acceptSettlement
    CHALLENGED --> CANCELED : dual cancel
    CHALLENGED --> BURNED : burnExpired
```

### 7.1 `LOCKED` ve `PAID` sonrası çözüm yolları
- **Normal kapanış:** maker `releaseFunds`
- **Dispute hattı:** maker `pingTakerForChallenge` (en erken `paidAt + 24 saat`; öncesinde `PingCooldownNotElapsed`) → 24 saat cevap penceresi → `challengeTrade` (yalnız maker). Ping bir iddiadır: maker challenge'ı `[ping+24sa, ping+48sa)` aralığında (`MAKER_CHALLENGE_WINDOW` = 24 saat, sabit) açmazsa ping **düşer**; `ping+48sa` saniyesinden itibaren `challengeTrade` `ChallengeWindowExpired` ile reddedilir. Maker trade başına tek ping atabilir (`AlreadyPinged`).
- **Liveness hattı:** taker `pingMaker` (`paidAt + GRACE_PERIOD` = `paidAt + 48 saat` sonrası) → 24 saat → `autoRelease` (taraf başına kesinti = max(bond'un `AUTO_RELEASE_PENALTY_BPS` = %2'si, o tarafın `releaseFunds` ücreti); Tier 0 dahil, K2-01). Maker'ın pingi geçerliyken (`ping+48sa` öncesi) `pingMaker` `ConflictingPingPath` ile reddedilir; ping düştüğü saniyeden itibaren açılır. Böylece ping atıp susan maker PAID trade'i süresiz kilitleyemez. Ters yönde, taker `pingMaker` attıysa maker'ın `pingTakerForChallenge`'ı `ConflictingPingPath` ile reddedilir.
- **Maker her zaman release edebilir:** `PAID`'den `releaseFunds` ping'den bağımsız her an açıktır (clean release); `CHALLENGED`'dan release `DISPUTED_RELEASE` + maker dispute kaybıdır.
- **Mutual cancel:** her iki taraf kendi `proposeOrApproveCancel(tradeId)` işlemini gönderir (ayrı imza yok); ikinci onay gelmeden önce taraf kendi onayını `revokeCancel(tradeId)` ile geri çekebilir (`CancelRevoked`; onay yoksa `NoCancelConsent`)
- **Ödeme penceresi aşımı:** `reportPayment` yalnız `lockedAt + PAYMENT_WINDOW` (48 saat) öncesinde kabul edilir (sınır saniyesinden itibaren `PaymentWindowClosed`). LOCKED'da 48 saat içinde ödeme bildirilmezse taraflardan biri `expirePaymentWindow` çağırır (öncesinde `PaymentWindowActive`); maker tam iade alır, taker bond'undan %2 liveness cezası kesilip maker'a tazminat olarak ödenir (K1-03; hazineye gitmez, Tier 0'da bond olmadığı için 0) + taker'a negatif itibar sinyali
- **Terminal burn:** challenge sonrası `MAX_BLEEDING` (240 saat) dolunca `burnExpired`

### 7.2 Bleeding bileşenleri
- maker bond decay
- taker bond decay
- belirli eşik sonrası crypto side decay

Kesin zaman çizelgesi (tüm süreler `challengedAt`'ten itibaren, `getCurrentAmounts` ile birebir):

| Aralık | Ne erir | Oran | 240. saate kadar toplam |
|---|---|---|---|
| 0–48 saat (grace) | hiçbir şey | — | — |
| 48–240 saat | maker bond | saatte %0,26 (`MAKER_BOND_DECAY_BPS_H` = 26) | ≈ %49,9 |
| 48–240 saat | taker bond | saatte %0,42 (`TAKER_BOND_DECAY_BPS_H` = 42) | ≈ %80,6 |
| 144–240 saat | ana para (kripto) | saatte %0,68 (`CRYPTO_DECAY_BPS_H` = 34, ×2) | ≈ %65,3 |
| 240. saat | `burnExpired` çağrılabilir; trade'in tüm bakiyesi (erimiş kısım dahil: `cryptoAmount + makerBond + takerBond`) hazineye gider | — | %100 |

Ana para erimesi, grace sonrası `USDT_DECAY_START` (96 saat) dolunca başlar. `MAX_BLEEDING` (240 saat) challenge'dan itibaren toplam süredir, ana paranın erime süresi değildir: ana para
yalnız son 96 saatte erir; bu yüzden yakılma anına kadar yaklaşık %34,7'si uzlaşmaya konu olarak durur.

`getCurrentAmounts(tradeId)`, o anki ekonomik bakiyeyi kanonik olarak çıkarır. `PAID` (ve `CHALLENGED` dışındaki her state) için erime yoktur; tutarlar trade snapshot'ıdır.

### 7.3 Challenge ve liveness ping semantiği
- Ping yolları birbirini dışlayan şekilde tasarlanır (conflicting path koruması). İstisna: maker pingi `challengePingedAt + 24 saat + MAKER_CHALLENGE_WINDOW` anında düşer; o saniyeden itibaren `challengeTrade` `ChallengeWindowExpired` verir ve taker `pingMaker` çağırabilir.
`T = challengePingedAt` (en erken `paidAt + 24 saat`):

| Zaman | Maker `challengeTrade` | Taker `pingMaker` | Maker `releaseFunds` |
|---|---|---|---|
| `T ≤ t < T+24sa` | `ResponseWindowActive` | `ConflictingPingPath` | açık |
| `T+24sa ≤ t < T+48sa` | **açık** → `CHALLENGED` | `ConflictingPingPath` | açık |
| `t ≥ T+48sa` (ping düştü) | `ChallengeWindowExpired` | **açık** (`paidAt + 48 saat` kuralıyla) → 24 saat sonra `autoRelease` | açık |

- Ping'in düşmesi event ile duyurulmaz; off-chain taraf `getTrade` alanlarından (`challengePingedByMaker`, `challengePingedAt`, `pingedByTaker`) hesaplar.
- Bekleme pencereleri state-guard ile enforce edilir.

### 7.4 Burn semantiği
- `burnExpired` permissionless'tır: challenge süresi dolan state’i herkes finalize edebilir.
- Trade'in escrow'daki tüm bakiyesi (erimiş kısım dahil) treasury'ye gider (`RevenueKind.BURN_RESIDUAL`); burn sonrası escrow'da o trade'e ait bakiye kalmaz. `EscrowBurned.burnedAmount` bu toplamdır; `burnExpired` `BleedingDecayed` yaymaz.

### 7.5 Cancel semantiği
- `proposeOrApproveCancel` onayı msg.sender ile kanıtlanır; onaylar yalnız verildikleri state için geçerlidir (`reportPayment` / `challengeTrade` sıfırlar).
- Her iki taraf onayı tamamlanmadan cancel finalize edilmez; tamamlanmadan önce verilen onay `revokeCancel` ile geri alınabilir.
- **Tasarım notu (EIP-712 iptal imzası):** Önceki sürümde `proposeOrApproveCancel(tradeId, deadline, sig)` bir EIP-712 imzası (`CANCEL_TYPEHASH`, `sigNonces`, `deadline`) istiyordu; 2026-09-29'da `f4a3298` commit'iyle (PR #112) kaldırıldı. Kontrat `recovered == msg.sender` şartı aradığı için imzayı işlemi gönderen cüzdanın kendisi atıyordu: relay mümkün değildi ve imza `msg.sender` yetkisine ek koruma sağlamıyordu. `deadline` yalnız gönderim anında kontrol ediliyor, verilen onaya süre koymuyordu; nonce pratikte işlevsizdi. Yerine gelen korumalar: `reportPayment` ve `challengeTrade`'de onayların sıfırlanması (ödeme öncesi verilen onay ödeme sonrası kullanılamaz) ve `revokeCancel`. Bu akıştan kalan kullanılmayan `MAX_CANCEL_DEADLINE` sabiti K1-07'de kaldırıldı.
- `LOCKED` iptalinde fee yoktur, iki taraf tam iade alır. `PAID`/`CHALLENGED` iptalinde her tarafın fee'si (snapshot oranı × güncel kripto) kendi güncel bond'uyla sınırlanarak kesilir; `CHALLENGED`'da erimiş kısım da hazineye gider.

### 7.6 Settlement semantiği
- Teklif yalnız `CHALLENGED`'da ve yalnız trade taraflarınca açılır; aynı anda tek canlı teklif olur (`ActiveSettlementProposalExists`; süresi dolmuş teklifin üzerine yazılabilir). `makerShareBps ≤ 10.000`, son geçerlilik `now + 10 dakika` ile `now + 7 gün` arası.
- `acceptSettlement(tradeId, expectedProposalId)`: karşı taraf gördüğü teklifin `id`'sini verir. Teklif sahibi withdraw + yeniden teklif ile oranı değiştirirse `id` değişir ve kabul `SettlementProposalMismatch` ile revert eder.
- `rejectSettlement` (karşı taraf) ve `withdrawSettlement` (teklif sahibi) canlı teklifte; `expireSettlement` süresi dolmuş teklifte herkes tarafından çağrılır.
- Kabulde havuz = güncel (erime sonrası) kripto + iki bond; maker payı `makerShareBps`, fee'ler gross paylardan kesilir, erimiş kısım hazineye gider.

### 7.7 Terminal dağıtım özeti (koddan)

| Yol | Maker alır | Taker alır | Treasury alır |
|---|---|---|---|
| `releaseFunds` (PAID) | `makerBond − makerFee` (fee bond ile sınırlı) | `crypto − takerFee + takerBond` | `takerFee + makerFee` |
| `releaseFunds` (CHALLENGED) | aynı formül, güncel (erime sonrası) tutarlarla | aynı | fee'ler + erimiş kısım |
| `autoRelease` | `makerBond − makerCut` | `crypto + takerBond − takerCut` | `takerCut + makerCut`; `cut = max(bond × %2, releaseFunds ücreti)` (K2-01) |
| `expirePaymentWindow` | `crypto + makerBond + takerBond × %2` | `takerBond − %2` | — (K1-03: ceza maker'a) |
| Mutual cancel (LOCKED) | `crypto + makerBond` | `takerBond` | — |
| Mutual cancel (PAID/CHALLENGED) | `crypto + makerBond − makerFee` | `takerBond − takerFee` | fee'ler (+ erimiş kısım) |
| `acceptSettlement` | maker gross payı − maker fee | taker gross payı − taker fee | fee'ler + erimiş kısım |
| `burnExpired` | — | — | `crypto + makerBond + takerBond` |

Fee'ler: `takerFee = crypto × takerFeeBpsSnapshot`, `makerFee = crypto × makerFeeBpsSnapshot` (varsayılan 15 bps = %0,15; Tier 0 order'da maker fee 0). Treasury bir kontratsa (`ArafRevenueVault`) aktarım `noteEscrowRevenueIntent` → transfer → `onArafRevenue` sırasıyla yapılır; hook revert ederse tüm işlem `RevenueHookFailed` ile geri alınır. Intent çağrısı nedenli revert ettiyse hata `RevenueIntentFailed(bytes reason)` ile kök nedeni taşır (K3-09; işlem yine revert eder).

### 7.8 Dalga 5 kontrat notları (2026-10-21)

Davranış değişiklikleri (kullanıcı onaylı; yeni deploy gerektirir):

- **K1-06 CEI sırası:** Terminal yollarda `_recordTerminalOutcome` ve itibar kaydı, hazine hook'u ve token transferlerinden **önce** yazılır. Hook sırasında okunan view'lar (terminal snapshot, `getReputation`, `getRewardableTrade`) artık güncel değeri döndürür. Log sırası değişti: `ReputationUpdated` → (`BleedingDecayed`) → `ProtocolRevenueSent` / `Transfer` → terminal event (`EscrowReleased` vb.). Backend dinleyicisi sıraya bağlı değildir (event'ler blok + log index ile işlenir; itibar ve trade handler'ları birbirini okumaz).
- **K2-01 autoRelease:** taraf başına kesinti `max(bond × %2, releaseFunds ücreti)`; maker ücreti `releaseFunds`'taki gibi maker bond ile sınırlıdır. Böylece maker'ın susması protokol gelirini `releaseFunds`'ın altına düşürmez (Tier 0'da taker ücreti alınır, maker bond 0 olduğundan maker kesintisi 0).
- **K1-03 expirePaymentWindow:** bonded tier'larda taker cezası hazine yerine envanteri kilitlenen maker'a gider; `ProtocolRevenueSent` yayılmaz. `PaymentWindowExpired.makerRefund` maker'ın aldığı toplamdır (envanter + bond + ceza).
- **K3-02 ödül ağırlığı:** snapshot'ta ödenen ücreti 0 olan taraf ödül ağırlığı almaz (`TradeOutcomeRecorded` maker/taker ağırlığı ayrı olabilir).
- **K3-04 setRewards:** yalnız kodu olan ve `revenueVault()` getter'ı bu vault'u gösteren kontrat kabul edilir (`InvalidRewardsBinding`). Getter'ı taklit eden sahte kontratı tek başına engellemez.
- **K3-06 liability:** `outstandingExternalFunding[token]` (sponsor fonuyla artar, `transferEpochAllocation` ödedikçe azalır) `onArafRevenue` değişmez kontrolünde yükümlülüğe katılır; sponsor bakiyesi bir açığı maskeleyemez.
- **K3-07:** süresi dolmuş ama hâlâ PROPOSED görünen teklif yeni teklifle üzerine yazılırken önce eski id için `SettlementExpired` yayılır.
- **K2-07 / K2-08 / K1-07:** sıfır treasury/token için `ZeroAddress()`; `setTokenConfig` ek olarak `TokenLimitsUpdated(token, decimals, tierMaxAmountsBaseUnit[4])` yayar (`TokenConfigUpdated` imzası aynı); kullanılmayan `MAX_CANCEL_DEADLINE` ve `MIN_SETTLEMENT_EXPIRY` escrow'dan silindi (tek kaynak `ArafSettlementLib`). `TradeState.OPEN` hiçbir trade'e atanmaz, ABI uyumu için durur.

Yalnız belgelenen davranışlar (kontrat değişmedi):

- **K2-04 `burnExpired` front-run:** `challengedAt + MAX_BLEEDING` sonrasında durum CHALLENGED kaldıkça `releaseFunds`, cancel ve `acceptSettlement` hâlâ geçerlidir; bu anda kriptonun ≈%34,7'si, maker bond'un ≈%50'si, taker bond'un ≈%19'u kurtarılabilir. Herkese açık `burnExpired` mempool'daki geç uzlaşmayı front-run edip kalan her şeyi hazineye gönderebilir. Saldırgan kazanç elde etmez (griefing; hazine lehine). Karar: dokunulmadı; burn zaman temelli son çıkıştır. Taraflar uzlaşmayı `MAX_BLEEDING` dolmadan tamamlamalıdır.
- **K1-05 / K2-05 iptal ücreti etiketi:** `PAID` iptal ücreti `ProtocolRevenueSent.kind = MANUAL_RELEASE_FEE`, `CHALLENGED` iptal ücreti `DISPUTED_RELEASE_FEE` ile yayılır; `RevenueKind` içinde iptal türü yoktur. İptal gelirini release gelirinden ayırmak için `tradeId` terminal snapshot'ı (`getRewardableTrade(...).outcome == MUTUAL_CANCEL`) ile birleştirilmelidir.
- **K2-06 ücret tabanı:** `acceptSettlement` ücreti settlement havuzunun (kripto + iki bond) gross payları üzerinden ve tavansız alır; `releaseFunds` ve cancel ücreti yalnız kripto üzerinden alır ve maker ücretini maker bond ile sınırlar. Bu yüzden Tier 0'da maker release'de ücret ödemez, settlement'ta öder. Korunum bozulmaz.
- **K2-11 snapshot ücret alanları:** `AUTO_RELEASE` için terminal snapshot'taki `takerFeePaid`/`makerFeePaid` kesinti tutarlarıdır (K2-01 sonrası en az release ücreti). `PAYMENT_WINDOW_EXPIRED` için `takerFeePaid` artık protokol geliri değildir, maker'a giden cezayı (`takerBond × %2`) gösterir (K1-03); bu yolda `ProtocolRevenueSent`/`EscrowRevenueReceived` yayılmaz. Ödül motoru bu iki sonuca 0 çarpan verdiği için ağırlığı etkilemez. Backend bu alanı gelir saymaz: escrow gelir kayıtları (`RevenueEvent`) yalnız `ProtocolRevenueSent`/`EscrowRevenueReceived` handler'larından yazılır, `getRewardableTrade` yalnız sonuç sınıfı (`resolution_type`) için okunur, `PaymentWindowExpired` handler'ı trade'i yalnız `CANCELED` işaretler.
- **K3-05 permissionless finalize:** `finalizeEpochToken` `recordingDeadline` (epoch sonu + 24 saat) anından itibaren herkese açıktır; sonra gelen `allocateEpochRewards` `EpochTokenFinalized` ile revert eder (fon kaybı yok, rezerv yerinde kalır). Operasyon kuralı: tahsis epoch bitmeden yapılır.

---

## 8. Reputation / bans / clean-slate

Reputation modeli V3’te tier progression, ban disiplini ve clean-slate bakım çağrısını birlikte taşır. Motor `ArafReputationLib` içindedir (DELEGATECALL; storage ve event'ler escrow'a aittir).

```mermaid
flowchart TD
    A[successfulTrades / riskPoints] --> B[calculated tier]
    T[MIN_ACTIVE_PERIOD 15 gün] --> B
    B --> C[maxAllowedTier ceiling]
    C --> D[effective tier]
    R[riskPoints >= ban eşiği] --> E[ban + tavan bir kademe düşer]
    E --> C
    E --> F[cleanPeriod 90 gün]
    F --> G[decayReputation]
```

### 8.1 Reputation alanları
- `successfulTrades`, `failedDisputes`, `bannedUntil`, `consecutiveBans`, `riskPoints`
- Sonuç sayaçları: `manualReleaseCount`, `autoReleaseCount`, `mutualCancelCount`, `disputedResolvedCount`, `burnCount`, `disputeWinCount`, `disputeLossCount`, `partialSettlementCount`
- `lastPositiveEventAt`, `lastNegativeEventAt`; ayrıca `firstSuccessfulTradeAt` (`getFirstSuccessfulTradeAt`) ve ceza tavanı `maxAllowedTier`
- Her terminal sonuçta iki taraf için (ödeme penceresi aşımında yalnız taker için) `ReputationUpdated` yayınlanır.

### 8.2 Sonuç → itibar etkisi (varsayılan politika)

| Terminal sonuç | Maker | Taker |
|---|---|---|
| `MANUAL_RELEASE` (PAID'den release) | +1 başarı, −8 risk | +1 başarı, −8 risk |
| `AUTO_RELEASE` | `failedDisputes`+1, +60 risk | +1 başarı, −8 risk |
| `MUTUAL_CANCEL` | +20 risk | +20 risk |
| `DISPUTED_RELEASE` (CHALLENGED'dan release) | `failedDisputes`+1, dispute kaybı, +60 risk | dispute kazancı, +1 başarı, −10 risk |
| `BURN` | `failedDisputes`+1, +90 risk | `failedDisputes`+1, +90 risk |
| `PARTIAL_SETTLEMENT` | +1 başarı, 0 puan | +1 başarı, 0 puan |
| `PAYMENT_WINDOW_EXPIRED` | etkilenmez | `failedDisputes`+1, +60 risk |

- **Mikro işlem koruması:** 6 ondalığa normalize edilmiş tutarı `MIN_REPUTATION_NOTIONAL` (20e6 = 20 birim, ör. 20 USDT) altında kalan trade'lerde pozitif sinyaller (başarı sayacı, risk düşüşü, `firstSuccessfulTradeAt`) yok sayılır; cezalar her büyüklükte uygulanır.
- Puanlar `setReputationPolicy` ile değiştirilebilir; değişiklik yalnız sonraki kayıtları etkiler.

### 8.3 Tier, ban ve clean-slate
- **Efektif tier:** 4'ten 1'e doğru, `successfulTrades ≥ tierMinSuccessfulTrades[i]` ve `riskPoints ≤ tierMaxRiskPoints[i]` sağlayan ilk tier. Varsayılan eşikler: başarı **0 / 15 / 50 / 100 / 200**, azami risk **100 / 80 / 50 / 30 / 15** (Tier 0–4). Tier > 0 için ilk başarılı işlemden bu yana `MIN_ACTIVE_PERIOD` = **15 gün** geçmiş olmalı. Ceza tavanı varsa sonuç `maxAllowedTier` ile sınırlanır.
- **Ban:** negatif sinyal sonrası `riskPoints ≥ banRiskPointsThreshold` (**100**) ise: kullanıcı o an banlı değilse `consecutiveBans`+1 ve ban süresi `baseBanDuration × 2^(consecutiveBans−1)` (**30 gün**, 60, 120 …, en çok **365 gün**). Aynı koşulda her seferinde tier tavanı bir kademe düşer (ilk ceza 4'ten başlatıp 3'e indirir).
- **Ban etkisi:** taker girişi (`TakerBanActive`) ve maker rolleri (`MakerBanActive`: sell order açma, sell order'ın doldurulması, buy order'ı doldurma) kapanır. Açık trade'lerin kapanış yolları açık kalır.
- **Bond fiyatlaması:** `riskPoints == 0` ve en az bir başarı varsa bond oranı 100 bps düşer; `riskPoints > 0` ise 300 bps artar (Tier 0 bond'u her durumda 0).
- **Clean-slate:** `decayReputation(wallet)` permissionless'tır; koşullar: ban geçmişi var (`NoPriorBanHistory`), `now > bannedUntil + cleanPeriod` ve `now > lastNegativeEventAt + cleanPeriod` (ikisi de `CleanPeriodNotElapsed`), `consecutiveBans > 0` (`NoBansToReset`). Yani af ancak hem ban bitiminden hem son olumsuz olaydan sonra tam bir temiz dönem geçince verilir; ban sonrası biriken risk, son olumsuz olaydan sonra tam temiz dönem geçene kadar affedilmez (K3-01, 2026-10-21). Bilinen sınır: hiç banlanmamış cüzdan `decayReputation` çağıramaz (`NoPriorBanHistory`); onun `riskPoints`'i yalnız pozitif sinyallerle düşer. Banlanan cüzdanın daha hızlı tam af alması yönündeki ters teşvik daraldı ama kapanmadı. Backend decay görevi yalnız bu koşulu karşılayan adaylara tx gönderir; karar kontrattadır. Güncel `cleanPeriod`: **90 gün**. Sıfırlananlar: `consecutiveBans`, `riskPoints`, tier tavanı (4'e döner). Bu tam af değildir; `failedDisputes`, sonuç sayaçları ve `bannedUntil` silinmez.
- Backend'in `reputationDecay` job'ı aday cüzdanlar için kontratın `getReputation()` / `cleanPeriod()` okumasıyla bu çağrıyı tetikleyebilir (opsiyonel `RELAYER_PRIVATE_KEY`); karar yine kontrattadır.

### 8.4 Politika sınırları (`setReputationPolicy` / `setReputationTierThresholds`)
- `cleanPeriod` 7–365 gün; `baseBanDuration` > 0 ve ≤ 365 gün; `banRiskPointsThreshold` > 0 ve ≤ `tierMaxRiskPoints[0]`; her ödül/ceza puanı ≤ ban eşiği.
- Tier eşiklerinde `minSuccessfulTrades` artan, `maxRiskPoints` azalan olmalı ve `maxRiskPoints[0] ≥ banRiskPointsThreshold`.

---

## 9. Finalized parameters ve mutable config ayrımı

Bu bölüm immutable parametreler ile runtime’da owner tarafından değiştirilebilen yüzeyleri ayırır. Tüm değerler `contracts/src/ArafEscrow.sol` ve `ArafReputationLib.sol`'den alınmıştır.

### 9.0 Parametre sınıflandırma tablosu

| Sınıf | Parametreler | Not |
|---|---|---|
| Sabitler (`constant`; public getter'ı olanlar ve internal olanlar) | Bond BPS'leri (`MAKER_BOND_TIER*_BPS`, `TAKER_BOND_TIER*_BPS`), `GOOD_REP_DISCOUNT_BPS`, `BAD_REP_PENALTY_BPS`, `AUTO_RELEASE_PENALTY_BPS`, `GRACE_PERIOD`, `PAYMENT_WINDOW`, `MAKER_CHALLENGE_WINDOW`, `USDT_DECAY_START`, `MAX_BLEEDING`, `*_DECAY_BPS_H`, `WALLET_AGE_MIN`, `DUST_LIMIT`, `MIN_ACTIVE_PERIOD`, `MIN_REPUTATION_NOTIONAL`, `MAX_TRADE_COOLDOWN`, `MAX_FEE_CONFIG_BPS` | Runtime’da owner çağrısıyla değişmez. |
| Mutable runtime config | `takerFeeBps`, `makerFeeBps`, `tier0TradeCooldown`, `tier1TradeCooldown`, `treasury`, reputation politikası ve tier eşikleri | Owner governance surface ile değişebilir; aktif trade'lerin fee'si snapshot ile korunur. |
| Direction-aware token runtime policy | `tokenConfigs[token] => {supported, allowSellOrders, allowBuyOrders, decimals, tierMaxAmountsBaseUnit[4]}` | Token desteği ve tier tavanları token bazında yönetilir. |

### 9.1 Sabit değerler

| Sabit | Değer | Anlam |
|---|---|---|
| Maker bond (Tier 0–4) | %0 / %8 / %6 / %5 / %2 | Order tier'ına göre, fill tutarı üzerinden |
| Taker bond (Tier 0–4) | %0 / %10 / %8 / %5 / %2 | Order tier'ına göre, fill tutarı üzerinden |
| `GOOD_REP_DISCOUNT_BPS` / `BAD_REP_PENALTY_BPS` | −100 / +300 bps | Bond oranına itibar düzeltmesi (Tier 1+) |
| `AUTO_RELEASE_PENALTY_BPS` | 200 bps (%2) | `autoRelease` (iki bond) ve `expirePaymentWindow` (taker bond) cezası |
| `PAYMENT_WINDOW` | 48 saat | `LOCKED`'da ödeme bildirme süresi |
| `GRACE_PERIOD` | 48 saat | `pingMaker` için `paidAt` sonrası bekleme; challenge sonrası erimesiz süre |
| `MAKER_CHALLENGE_WINDOW` | 24 saat | Ping+24 saatten sonra challenge açma penceresi |
| `USDT_DECAY_START` | 96 saat | Grace sonrası ana para erimesinin başlaması |
| `MAX_BLEEDING` | 240 saat | `challengedAt`'ten burn'e kadar toplam süre |
| `MAKER/TAKER/CRYPTO_DECAY_BPS_H` | 26 / 42 / 34 (×2) bps/saat | Erime hızları |
| `WALLET_AGE_MIN` | 2 gün | Taker girişi için kayıt yaşı |
| `DUST_LIMIT` | 0,001 ETH | Taker girişi için native bakiye |
| `MIN_ACTIVE_PERIOD` | 15 gün | Tier > 0 için ilk başarıdan bu yana süre |
| `MIN_REPUTATION_NOTIONAL` | 20e6 (6 ondalık) | İtibara sayılan en küçük trade |
| `MAX_TRADE_COOLDOWN` | 30 gün | Cooldown setter üst sınırı |
| `MAX_FEE_CONFIG_BPS` | 2000 bps | Fee setter üst sınırı (taraf başına) |

Kullanılmayan `MAX_CANCEL_DEADLINE` ve `MIN_SETTLEMENT_EXPIRY` sabitleri escrow'dan silinmiştir (K1-07); settlement süre sınırları (10 dakika – 7 gün) yalnız `ArafSettlementLib` içindeki sabitlerle uygulanır.

### 9.2 Mutable runtime config
- `takerFeeBps`, `makerFeeBps` — varsayılan **15 / 15 bps** (%0,15), taraf başına ≤ 2000 bps
- `tier0TradeCooldown`, `tier1TradeCooldown` — varsayılan **4 saat / 4 saat**, ≤ 30 gün
- `treasury` — `setTreasury`
- reputation politikası ve tier eşikleri — `setReputationPolicy`, `setReputationTierThresholds` (varsayılanlar §8)
- direction-aware token config (`setTokenConfig`): `supported`, `allowSellOrders`, `allowBuyOrders`, `decimals` (token'ın `decimals()` değerine eşit olmalı), dört tier tavanı (Tier 0–3, base unit, > 0). Tier 4 tavanı yoktur.

### 9.3 Fee snapshot semantiği
- Snapshot order create anında alınır; Tier 0 order'da maker fee snapshot'ı bilinçli olarak 0'dır.
- Child trade, parent snapshot’ını taşır.
- Sonraki `setFeeConfig` aktif trade economics’ini geriye dönük değiştirmez.

### 9.4 Toolchain / deployment assumptions
- `contracts/scripts/deploy.js` sırası: `ArafReputationLib` → `ArafSettlementLib` → linkli `ArafEscrow(treasury)` → USDT/USDC için `setTokenConfig` (6 ondalık, sell+buy açık, tier tavanları 150 / 1.500 / 7.500 / 30.000 token) ve `getTokenConfig` ile doğrulama → `transferOwnership(FINAL_OWNER_ADDRESS)`. Manifest library adreslerini de kaydeder.
- Public ağda `CONFIRM_PUBLIC_DEPLOY=yes` zorunludur; public/custom modda `FINAL_OWNER_ADDRESS` ile `TREASURY_ADDRESS` aynı olamaz.
- `ArafRevenueVault` + `ArafRewards` ayrı script'le (`deployRewards.js`) kurulur; escrow treasury'nin vault'a çevrilmesi ayrı ve açık bir operasyondur (`rewardsOps.js`).
- Derleme hedefi `cancun`'dur (`hardhat.config.js`): `ArafRevenueVault` escrow gelir niyetini EIP-1153 transient storage'da (`tstore`/`tload`) tutar; vault'un deploy edildiği ağ EIP-1153'ü desteklemelidir.
- Production rehberinde owner key’in multisig altında tutulması governance risk azaltımı için varsayımdır.

---

## 10. Runtime bağlantı ve operasyon politikaları

Backend davranışı yalnız teknoloji seçimiyle değil, bootstrap, readiness ve shutdown disipliniyle tanımlanır.

```mermaid
flowchart LR
    A[Env / security checks + KMS self-test] --> B[Mongo connect]
    B --> C[Redis connect]
    C --> D[Identity guard + escrow registry guard + protocol config load]
    D --> E[Scheduler + route mount + health/ready]
    E --> F[app.listen]
    F --> G[Worker start + replay arka planda]
```

### 10.1 Bootstrap sırası (backend, `backend/scripts/app.js`)
0. Modül yüklenirken: CORS (`ALLOWED_ORIGINS` production'da zorunlu; wildcard/localhost/path içeren origin süreci durdurur) ve `runtimeSettings` env denetimi (tam bir kez)
1. Env ve güvenlik kontrolleri (production'da `SIWE_DOMAIN` localhost olamaz; SIWE yapılandırması geçersizse çıkış) + production KMS self-test (§12.5)
2. Mongo bağlantısı
3. Redis bağlantısı
4. Kimlik normalizasyonu guard'ı (production'da varsayılan enforce)
5. Escrow kayıt bekçisi ilk kontrolü (`escrowGuard.check()`, §10.8)
6. Mutable protocol config mirror'ının yüklenmesi (yüklenemezse süreç çökmez; ilgili route'lar `CONFIG_UNAVAILABLE` dönebilir)
7. Scheduler job'ları (§10.6)
8. `requireFullService` kapısı + route mount (`routes/mounts.js` tek kaynak) + `/health`, `/ready`
9. `app.listen`
10. Worker `startInBackground` ile başlar: bağlan + replay HTTP dinlemeye başladıktan sonra arka planda sürer, bu sırada `/ready` "replaying" raporlar. Escrow bekçisi engelliyorsa ya da kısıtlı moddaysa worker başlatılmaz (§10.8, "Kısıtlı (degraded) mod")

### 10.2 Readiness-first yaklaşımı
- Liveness (`/health`) süreç ayakta mı sorusuna bakar.
- Readiness (`/ready`) bağımlılıkların gerçekten hazır olup olmadığını doğrular.
- Trafik açma kararı readiness’e göre verilmelidir.

### 10.3 Fail-fast / fail-open kararları
- Kritik bağımlılık kopuşlarında fail-fast yaklaşımı uygulanır (özellikle DB/worker bütünlüğü için).
- Güvenlik sınırında fail-open yerine fail-closed tercih edilir (ör. auth/session sınırları).

### 10.4 Timeout ve bağlantı politikaları
- Mongo tarafında `maxPoolSize: 100` (`MONGO_MAX_POOL_SIZE`), `socketTimeoutMS: 20000` (`MONGO_SOCKET_TIMEOUT_MS`), `serverSelectionTimeoutMS: 5000` varsayılanları worker+API yükünü birlikte kaldıracak şekilde kullanılır.
- Beklenmeyen Mongo kopuşunda bağlantı `MONGO_DISCONNECT_GRACE_MS` (varsayılan 10 sn) içinde dönmezse `process.exit(1)` ile fail-fast yeniden başlatma uygulanır (stale/yarım bağlantı drift’ini azaltmak için); süre içinde dönerse fail-fast iptal edilir. Graceful shutdown sırasında bu çıkış bastırılır.
- RPC: tek paylaşılan sağlayıcı (`services/rpcProvider.js`). `BASE_RPC_URL` birincil, `BASE_RPC_URL_FALLBACKS` (virgülle ayrık) sıralı failover'dır; 429/ağ hatasında URL soğumaya alınır (rate limit 60 sn, aylık kapasite 10 dk, ağ hatası 30 sn). Her URL kullanılmadan önce beklenen zincire (`EXPECTED_CHAIN_ID`) karşı doğrulanır, doğrulanamayan URL kullanılmaz. URL başına saniyelik istek sınırı `RPC_MAX_REQUESTS_PER_SEC` (varsayılan 4; aşan istekler kuyruğa girer). İstek zaman aşımı 10 sn, `eth_getLogs` için 60 sn. URL'ler (API anahtarı içerir) log ve hata mesajlarında redakte edilir.
- Redis tarafında `isReady` sinyali `connected` durumundan ayrı ele alınır; middleware kararları buna göre verilir.
- Redis TLS (`rediss://`) ve managed servis senaryoları runtime config’te dikkate alınır.

### 10.5 Graceful shutdown sırası
- AES master key önbelleğini sıfırla, scheduler interval/timeout’larını temizle
- Yeni istekleri kes (`server.close`)
- Worker’ı durdur
- Mongo/Redis bağlantılarını kapat
- süreçten kontrollü çık (zaman aşımında zorla çıkış)

### 10.6 Scheduler / cleanup jobs
Varsayılan aralıklar `JOB_*_MS` env'leriyle değiştirilebilir.

| Job | Varsayılan aralık | Not |
|---|---|---|
| DLQ processing | 60 sn | Bkz. §11.4; zincire bağlı + dağıtık kilitli |
| Reputation decay tetikleyicisi | 24 saat (ilk çalışma 30 sn sonra) | `BASE_RPC_URL` yoksa hata; `RELAYER_PRIVATE_KEY` yoksa görev pasif kalır. Zincire bağlı + dağıtık kilitli |
| Reward outcome recorder | 1 saat | `ArafRewards.recordTradeOutcomes`; aynı relayer koşulu. Zincire bağlı + dağıtık kilitli |
| Stats snapshot | 24 saat (ilk çalışma 60 sn sonra) | |
| Receipt & PII snapshot retention cleanup | 30 dk | |
| Arşiv retention (`archive_<chainId>_<escrow>_trades`) | 30 dk (ilk çalışma 180 sn sonra) | Mongo-only; degraded/escrow engelinde de sürer (§10.8) |
| User bank risk metadata cleanup | 6 saat | |
| Referans kur şeridi | 120 sn (`REFERENCE_TICKER_REFRESH_INTERVAL_MS`) | Yalnız bilgilendirme; settlement'i etkilemez |
| Reconciliation raporu | 10 dk | Production'da varsayılan açık (`JOB_RECONCILIATION_ENABLED`); zincire bağlı |

- Aralıklar `JOB_*_INTERVAL_MS` / `JOB_*_DELAY_MS` env'leriyle değişir; yeniden kullanılabilir iş limitleri (decay/recorder aday ve tx limitleri vb.) admin çalışma ayarlarından (§14.7) gelir.
- Zincire bağlı işler (`dlq`, `reputationDecay`, `rewardRecorder`, `reconciliation`) kısıtlı modda ve escrow bekçisi engellerken atlanır. Aynı iş üst üste binmez (süreç-içi kilit).
- `dlq`, `reputationDecay`, `rewardRecorder` birden çok makinede aynı anda çalışmasın diye Redis dağıtık kilidi alır (`services/jobLock.js`): `SET NX PX` + süreç başına rastgele token, yenileme/bırakma yalnız token eşleşirse (Lua), anahtar `lock:job:<chainId>:<escrow>:<iş>`. **Fail-closed:** Redis hata verirse ya da `ARAF_ESCROW_ADDRESS`/`EXPECTED_CHAIN_ID` yoksa iş o turda çalışmaz. Kilit kaybolursa iş yeni öğe/tx başlatmadan durur.

### 10.7 Health vs ready operasyonel anlamı
- `/health`: süreç ayakta mı ve worker yeni blok görüyor mu? (worker son blok eşiğini aşarsa `503 stale`)
- `/ready`: Mongo/Redis + config + chain id + worker lag (varsayılan en çok 25 blok, `WORKER_MAX_LAG_BLOCKS`) + replay durumu + escrow kayıt bekçisi güvenli mi? (traffic gate). Sonuç birkaç saniye önbelleklenir (`READY_CACHE_TTL_MS`, varsayılan 7 sn); kimliksiz çağrıya redakte görünüm döner, ayrıntı yalnız `READY_INTERNAL_TOKEN` ile. Kısıtlı modda ve enforce edilen escrow uyumsuzluğunda 503 döner (`degradedReasons`).
- Worker replay veya yüksek lag durumunda liveness true kalsa bile readiness false olabilir; bu bilinçli tasarım tercihidir.

### 10.8 Escrow kayıt bekçisi (escrow registry enforce)
- `services/escrowRegistryGuard.js`, Mongo `escrow_registry` içindeki `_id:"active"` belgesini yalnız okur ve `ARAF_ESCROW_ADDRESS` / `EXPECTED_CHAIN_ID` ile karşılaştırır; veri silmez/değiştirmez, tx göndermez. Açılışta bir kez, sonra `ESCROW_REGISTRY_GUARD_INTERVAL_MS` (varsayılan 60 sn) aralıkla yeniden kontrol eder.
- Mod `ESCROW_REGISTRY_GUARD_MODE`: `off` | `warn` | `enforce`. Varsayılan production'da `enforce`, diğer ortamlarda `warn`; geçersiz değer varsayılana düşer.
- Uyumsuzluk nedenleri: `registry_missing` (kayıt yok / bilinmeyen state), `rotating`, `escrow_mismatch`, `chain_mismatch`, `registry_unreadable`.
- `warn`: yalnız log + `/ready` bilgi alanı. `enforce` + uyumsuz (kayıt okunamıyorsa da, fail-closed): worker başlamaz/durur, zincire bağlı işler atlanır, escrow'a bağlı `/api` uçları `503 ESCROW_MISMATCH` döner (yalnız auth, istemci logu, sosyal linkler, referans kur ve feedback izinli), `/ready` 503. Bu bayrak kısıtlı moddan (degraded) ayrıdır.
- Kayıt belgesini yalnız deploy akışı yazar (`.github/scripts/escrow-registry.js`; `escrow-registry-adopt.yml`, `rotate-escrow.yml`); backend modeli (`EscrowRegistry`) salt-okunurdur, hiçbir route/admin paneli yazmaz.
- Kullanıcı çıkışları etkilenmez: işlemler frontend'den doğrudan kontrata gider; frontend `escrow_mismatch` nedeniyle yalnız YENİ pozisyon açan işlemleri kapatır (bkz. "Altyapı arızasında frontend davranışı").

### 10.9 İstemci IP'si ve origin sırrı
- İstek yolu tarayıcı → Vercel rewrite → Fly → Express olduğundan `req.ip` altyapı adresidir. `utils/clientIp.js::resolveClientIp(req)`: `ORIGIN_SHARED_SECRET` tanımlıysa ve istek `x-araf-origin-secret` başlığında aynı sırrı taşıyorsa (sabit zamanlı karşılaştırma) geçerli `x-real-ip` kullanılır; aksi hâlde `req.ip`. Sır, başlık değeri ve IP loglanmaz; istek reddedilmez.
- Rate limit anahtarları, admin denetim IP özeti (HMAC) ve chargeback-ack IP özeti bu çözümleyiciyi kullanır.

---

## 11. Event worker / replay / mirror reliability

Worker zincirden authoritative state’i okur, Mongo’ya operational mirror üretir; fakat authority olmaz.

```mermaid
flowchart TD
    A[Contract events] --> B[Worker]
    B --> C[Replay / batch processing]
    C --> D[Mongo projection]
    C --> E[Safe checkpoint]
    C --> F[DLQ / retry]
```

### 11.1 Worker state mantığı
Worker kontrat event’lerini consume eder, Mongo’yu authoritative olmadan günceller. Canlı izleme abonelik değil **periyodik log yoklamasıdır**: her tur (`LIVE_POLL_INTERVAL_MS`, varsayılan 15 sn) 1 `eth_blockNumber` + `eth_getLogs` yapar ve `head − WORKER_FINALITY_DEPTH` sınırına kadar okur (sığ reorg'da event atlanmasın). Son güvenli checkpoint head'in `WORKER_CHECKPOINT_INTERVAL_BLOCKS` (50) blok gerisine düşerse kaçırılan event'ler için kısa bir catch-up replay tetiklenir. Blok görülmezse watchdog yeniden bağlanır, yine blok yoksa süreç çıkar (`WORKER_BLOCK_STALE_MS`, `WORKER_WATCHDOG_INTERVAL_MS`). Bu zamanlama ayarları admin çalışma ayarlarıdır (§14.7).

### 11.2 Checkpoint yaklaşımı
- son işlenen blok (`worker:last_block`) ve son güvenli checkpoint (`worker:last_safe_block`)
- finality derinliği: production'da varsayılan 6 blok (`WORKER_FINALITY_DEPTH`)
- checkpoint yoksa production'da `WORKER_START_BLOCK` veya `ARAF_DEPLOYMENT_BLOCK` zorunludur
- replay başlangıç güvenliği

### 11.3 Replay ve batch işleme
- bloklar batch halinde işlenir (varsayılan 1.000 blok, `WORKER_BLOCK_BATCH_SIZE`; batch'ler arası `WORKER_REPLAY_BATCH_DELAY_MS` = 250 ms; başarısız replay üstel geri çekilir: 5 sn → 5 dk, `WORKER_REPLAY_BACKOFF_*`)
- bir aralık okunamazsa ya da bir batch başarısız olursa checkpoint ilerletilmez; replay ilk başarısız batch'te durur
- replay’de idempotent davranış hedeflenir; scope başına son uygulanan `(blockNumber, logIndex)` tutulur, daha eski event geri yazamaz
- state regression guard’larıyla geriye düşüş engellenir; terminal state'ler geri açılmaz

### 11.3.1 Last-safe-block semantiği
- Worker yalnız son görülen blok değil, son güvenli checkpoint bloğunu da izler.
- Ready kararı, provider block yüksekliği ile worker safe checkpoint farkını (lag) hesaba katar.
- Bu yaklaşım “işleniyor gibi görünüp geride kalma” durumunu operasyonel olarak görünür kılar.

### 11.4 DLQ ve poison event görünürlüğü
- event önce yerinde yeniden denenir (5 deneme); işlenemeyen event DLQ’ya taşınır. Kayıt `txHash:logIndex` anahtarıyla tekildir (canlı DLQ, arşiv ve karantina indeks setleri)
- DLQ işlemcisi kayıtları yeniden sürer (60 sn'de bir; çok makinede tek çalışsın diye dağıtık kilit, §10.6); başarılı re-drive event'i ack'ler ve bloğun unsafe bayrağını kaldırır. Ayrıştırılamayan ham kayıt izsiz silinmez, karantinaya alınır (ham metin loglanmaz)
- `MAX_REDRIVE_ATTEMPTS` (10) aşılırsa kayıt **kalıcı karantinaya** alınır (TTL yok, manuel inceleme): event "acked-poison" sayılır, checkpoint onun yüzünden takılmaz; alarm `logger.error` + karantina sayacı ile verilir. Karantina listesi en yeni 1.000 kaydı tutar (indeks seti silinmez; budanan kaydın event'i yine ack'li sayılır). Arşiv 7 gün tutulur. DLQ'ya yazılan hata metni RPC URL'sinden arındırılır ve 500 karakterle sınırlanır
- operasyonel görünürlük için log/metric izi korunur

### 11.5 Kimlik normalizasyonu
- on-chain id alanları numeric-string disipliniyle tutulur
- parent order id ve child trade id karışmasını önleyen explicit lookup stratejisi uygulanır

### 11.6 OrderFilled + getTrade linkage
Child trade authority worker tarafında heuristik yerine explicit event+getter kombinasyonuyla mirror edilir. Kontrat `EscrowCreated` / `EscrowLocked` yayınlamaz; mirror `OrderFilled` anında `LOCKED` olarak kurulur ve tek seferlik payout snapshot aynı adımda alınır (§12.4.1).

### 11.6.1 Mirror edilen event'ler ve terminal sayaç
- Escrow event'leri: order (`OrderCreated/Filled/Canceled`), trade lifecycle (`PaymentReported`, `EscrowReleased`, `DisputeOpened`, `MakerPinged`, `CancelProposed`, `CancelRevoked`, `EscrowCanceled`, `PaymentWindowExpired`, `BleedingDecayed`, `EscrowBurned`), settlement (`SettlementProposed/Rejected/Withdrawn/Expired/Finalized`), reputation/config (`ReputationUpdated`, `FeeConfigUpdated`, `CooldownConfigUpdated`, `TokenConfigUpdated`, `TokenLimitsUpdated`, `ReputationPolicyUpdated`, `ReputationTierThresholdsUpdated`), `WalletRegistered`, `ProtocolRevenueSent`. Vault event'leri (`EscrowRevenueReceived`, `ExternalRewardFunded`, `ProductRewardFunded`) ve `ArafRewards` event'leri (`EpochRewardAllocated`, `TradeOutcomeRecorded`, `RewardClaimed`, `EpochTokenFinalizedEvent`, `EpochDustRolledOver`) `ARAF_REVENUE_VAULT_ADDRESS` / `ARAF_REWARDS_ADDRESS` adreslerinden ayrıca okunur (adresler eksikse reward mirror izlenmez, worker uyarı verir).
- `CancelRevoked` ilgili tarafın `cancel_proposal` onay bayrağını geri alır; mirror yoksa event retry/DLQ'ya gider.
- Manuel/otomatik release ayrımı heuristikle değil kontratın terminal snapshot'ından (`getRewardableTrade`) okunur; okuma hatası kalıcı "UNKNOWN" yazmaz, event retry/DLQ'ya gider.
- Terminal geçiş (`resolved_at` işareti) trade başına bir kez uygulanır ve aynı işlemde **kalıcı terminal sayaç** satırı (`TerminalTradeStat`, `trade_key` tekil) yazılır; Trade belgesi 1 yıllık TTL ile silinse de istatistik geriye gitmez.

### 11.7 Mirror authority uyarısı
- Event worker, protokol kuralı üretmez; yalnız authoritative zincir durumunu operasyonel modele taşır.
- Mongo’daki bir alan ile kontrat storage çelişirse otorite kontrattadır.

---

## 12. Güvenlik mimarisi ve trust boundaries

Bu bölüm auth, session, PII ve client telemetry gibi güvenlik sınırlarını tek yerde toplar.

### 12.1 Auth modeli (SIWE + JWT + cookie session)

```mermaid
sequenceDiagram
    participant FE as Frontend
    participant BE as Backend
    participant RD as Redis

    FE->>BE: GET /api/auth/nonce
    BE->>RD: SET NX nonce
    RD-->>BE: nonce
    BE-->>FE: nonce + siwe config
    FE->>BE: POST /api/auth/verify
    BE->>RD: getDel(nonce)
    BE-->>FE: httpOnly cookies
```

#### 12.1.1 Nonce lifecycle (TTL + consume)
- Nonce Redis’te wallet bazlı tutulur (`nonce:<wallet>`), varsayılan TTL **5 dakika**dır.
- Yarış durumunda nonce authority’si Redis’tir: `SET NX` başarısızsa yerel üretilen değer döndürülmez; Redis’te yaşayan nonce yeniden okunur.
- SIWE verify sırasında nonce `getDel` ile consume edilir; replay penceresi daraltılır.
- SIWE domain/URI doğrulaması request-time’da yapılır (özellikle production’da host/origin eşleşmesi zorunlu).

#### 12.1.2 Session token lifecycle
- Auth JWT cookie (`araf_jwt`) varsayılan kısa ömürlüdür (konfigürasyonla; default 15m).
- Refresh cookie (`araf_refresh`) daha uzun ömürlüdür (kayan pencere default 7 gün, oturum başına mutlak üst sınır default 30 gün, `REFRESH_ABSOLUTE_TTL_SECS`) ve `/api/auth` path scope’u ile sınırlandırılır.
- Cookie modeli httpOnly + sameSite=lax + credentials:include çizgisini korur; header bearer normal auth authority üretmez.

### 12.2 Cookie-only auth boundary ve session-wallet mismatch davranışı

| Kontrol adımı | Ne kontrol edilir | Mismatch sonucu |
|---|---|---|
| `requireAuth` | Cookie JWT geçerli mi + blacklist durumu | 401 / 403 |
| `requireSessionWalletMatch` | `x-wallet-address` == cookie-auth wallet | 409 + session invalidation |
| Session invalidation | JWT blacklist + refresh revoke + cookie clear | Session güvenli kapatılır |

> Önemli sınır: `x-wallet-address` tek başına auth kaynağı değildir; yalnız cookie-auth oturumla eşleşme kontrolüdür.

### 12.3 Refresh token family invalidation
- Logout ve session-wallet mismatch olaylarında refresh family revoke edilir.
- Amaç yalnız aktif access token’ı değil, refresh zincirinin yeniden kullanım riskini de kırmaktır.
- Böylece “tek request reddi” yerine “oturum soy ağacı iptali” uygulanır.

### 12.4 PII access boundary (trade-scoped token + canlı state kontrolü)

```mermaid
flowchart TD
    A[Cookie-auth user] --> B[request-token tradeId]
    B --> C[PII bearer token]
    C --> D{live trade state OK?}
    D -- No --> X[deny]
    D -- Yes --> E{snapshot available?}
    E -- No --> Y[controlled error]
    E -- Yes --> F[decrypt + no-store response]
```

- PII token parent order’a değil, tek bir `tradeId`’ye scoped üretilir.
- `requirePIIToken` token type=`pii`, tradeId eşleşmesi ve token wallet == cookie session wallet koşullarını birlikte doğrular.
- Token tek başına yeterli değildir; route tekrar canlı trade state kontrolü yapar (`LOCKED/PAID/CHALLENGED` penceresi).
- Snapshot-first politika: payout snapshot yoksa controlled hata döner; current profile fallback kapalıdır.
- PII token ömrü varsayılan 15 dakikadır (`PII_TOKEN_EXPIRES_IN`).
- Hassas PII yanıtları `Cache-Control: no-store` / `Pragma: no-cache` ile döndürülür.


### 12.4.1 Ödeme profili kapısı ve tek seferlik snapshot
- İlke: ödeme profilini doldurmayan taraf işleme girmemeli; snapshot işlem kilitlendiği anda alınır ve işlem süresince değiştirilemez.
- Snapshot TEK SEFERLİDİR: `_captureLockedTradeSnapshot`, yalnız `payout_snapshot.captured_at` boşsa, atomik koşullu güncellemeyle yazar. Worker replay, DLQ re-drive ya da aynı `OrderFilled`'ın tekrar işlenmesi mevcut snapshot'ı yeniden yazmaz; eksik (`is_complete=false`) snapshot da sonradan "tamamlanmaz".
- Kapı (emir oluşturma/doldurma için "kayıtlı ödeme profili yok → işlem yok") YALNIZ arayüz ve API düzeyindedir: karar `/api/auth/me.hasPayoutProfile` (kayıtlı profil; taslak form değil) ve pazar listesindeki `owner_has_payout_profile` boolean'ına dayanır, durum bilinmiyorsa kapalıdır. Kontrat doğrudan çağrılarak bu kapı ATLANABİLİR.
- Asıl güvence kuraldır: **eksik snapshot → PII kapalı, işlem ödeme penceresinde çözülür.** Profili olmayan taraf için snapshot eksik kalır, `/api/pii/*` erişimi açılmaz ve işlem ödeme penceresi içinde (zamanaşımı/iptal akışıyla) çözülür.
- **Aktif işlemde profil kilidi:** cüzdanın `LOCKED`/`PAID`/`CHALLENGED` trade'i varken `PUT /api/auth/profile` ödeme detaylarını değiştiremez (ilk oluşturma dahil): `409 BANK_PROFILE_LOCKED_DURING_ACTIVE_TRADE`. Yalnız iletişim (contact) güncellemesi serbesttir. Kapalı ödeme yöntemiyle (§17b) yeni profil oluşturma/değiştirme `409 PAYMENT_RAIL_DISABLED`'dır.

### 12.5 Şifreleme modeli
- PII ve receipt payload alanları AES-256-GCM ile şifrelenmiş saklanır.
- Master key `KMS_PROVIDER` ile yüklenir (`aws` = AWS KMS ile çözülen data key, `vault` = HashiCorp Vault Transit, `env` = yalnız geliştirme); cüzdan başına DEK, HKDF (RFC 5869, SHA-256) ile türetilir ve saklanmaz.
- **Fail-closed (SEC-01):** production'da `KMS_PROVIDER=env` reddedilir; tek istisna `EXPECTED_CHAIN_ID=84532` (Base Sepolia) + `ALLOW_ENV_KMS_ON_TESTNET=yes` ve RPC'nin gerçekten 84532 olduğunun doğrulanmasıdır (mainnet'te istisna yoktur). Açılışta production KMS self-test'i çalışır; geçersiz yapılandırma süreci durdurur. Geçici RPC hatasında anahtar yüklenmez ve şifreleme çağrıları `KMS_UNAVAILABLE_DEGRADED` ile reddedilir (bkz. "Kısıtlı (degraded) mod").
- Kontrat tarafına plaintext yazılmaz; receipt için zincire yalnız hash izi taşınır.

### 12.6 Rate-limit sınıfları ve fallback davranışı
- Limiter sınıfları yüzeye göre ayrılır: auth, nonce, market read, stats read, orders read/write, trade room read, receipt upload, coordination write, PII (profil / taker-name / token / fetch), admin read, admin write, feedback, client logs.
- Anahtar: kimliksiz isteklerde `resolveClientIp(req)` (§10.9); kimliği doğrulanmış cüzdanlı isteklerde (tier'lı sınıflar, admin, PII) cüzdan. PII limiter'ları endpoint başına ayrı bucket kullanır; doğrulanmış cüzdan varsa anahtar yalnız cüzdana bağlıdır (IP değiştirerek limit katlanamaz), trade'e bağlı olanlarda trade başına anahtar eklenir.
- Bir kısmı (orders/room read, receipt upload, coordination write, feedback) kullanıcının efektif tier'ına göre kademeli sınır uygular.
- Redis yoksa limiter'lar süreç-içi (in-memory) fallback ile korunmaya devam eder; auth/PII dahil hiçbir yüzey bilinçli olarak fail-open değildir.

### 12.7 Client-error logging boundary (scrub semantiği)
- Frontend telemetry yalnız `/api/logs/client-error` endpoint’ine gider.
- Mesaj/stack alanlarında regex scrub ile IBAN, wallet, email, bearer/JWT benzeri duyarlı parçalar redakte edilir; alanlar kırpılır (mesaj 500, stack 2.000, componentStack 1.000, url/user-agent 200 karakter).
- Log boyutu sınırları ve rate-limit birlikte kullanılarak hem veri minimizasyonu hem abuse direnci sağlanır.

### 12.8 Trust boundary özeti
- Contract: economic/state authority.
- Backend: auth/session/PII koordinasyonu + read-model projection.
- Frontend: runtime guardrail ve kullanıcı geri bildirimi katmanı.
- Off-chain veri: operasyonel fayda; protocol authority değildir.

---

## 13. Veri modelleri (Mongo read-model katmanı)

> Mongo canonical protocol authority değildir; ama yüksek performanslı read-model ve operasyonel observability için kritik katmandır.

```mermaid
erDiagram
    USER ||--o{ ORDER : owns
    USER ||--o{ TRADE : participates
    ORDER ||--o{ TRADE : spawns
```

### 13.1 User modeli (field-aware)

#### Kimlik ve payout profile yapısı
- `wallet_address` birincil kullanıcı kimliğidir (lowercase EVM address).
- `payout_profile` yapısı rail-aware tutulur:
  - `rail`, `country`
  - `contact.{channel, value_enc}`
  - `payout_details_enc`
  - `fingerprint.{hash, version, last_changed_at}`
  - `updated_at`

#### Şifreleme ve public projection sınırı
- `contact.value_enc` ve `payout_details_enc` şifreli saklanır; plaintext kalıcı depoda tutulmaz.
- `toPublicProfile()` allowlist yaklaşımıyla yalnız güvenli alanları döndürür.
- `bank_change_history` ve payout detayları public profile’a sızdırılmaz.

#### Banka profil risk metadata’sı (authority değil)
- `profileVersion`
- `lastBankChangeAt`
- `bankChangeCount7d`
- `bankChangeCount30d`
- `bank_change_history` (rolling pencere hesabı için internal dizi)
- Bu alanlar anti-fraud/risk sinyalidir; kontrat enforcement authority’si değildir.

#### Reputation/ban mirror sınırı
- `reputation_cache` ve ban mirror alanları (`is_banned`, `banned_until`, `consecutive_bans`, `max_allowed_tier`) query/UI kolaylığı içindir.
- Kontrat ile çelişki durumunda otorite on-chain veridedir.
- Reputation extension içinde `partialSettlementCount` event-taxonomy amaçlı sayaçtır.
- `partialSettlementCount` tek başına ceza/failure anlamına gelmez.

### 13.2 Order modeli (field-aware)

#### Kimlik + lifecycle alanları
- `onchain_order_id` (numeric-string kimlik)
- `owner_address`, `side`, `status`, `tier`, `token_address`

#### Finansal/snapshot alanları
- `amounts.{total_amount, remaining_amount, min_fill_amount}` + `*_num` cache
- `reserves.{remaining_maker_bond_reserve, remaining_taker_bond_reserve}` + `*_num` cache
- `fee_snapshot.{taker_fee_bps, maker_fee_bps}`

#### Referans, timer ve yardımcı istatistik alanları
- `refs.order_ref` (event trace / idempotent ilişkilendirme için)
- `timers.{created_at_onchain, last_filled_at, canceled_at}`
- `stats.*` (`child_trade_count`, `active/resolved/canceled/burned` dağılımı, `total_filled_amount`)

#### Mirror sınırı
- Remaining/reserve değerleri backend’de hesaplanan authority değil; worker’ın kontrattan taşıdığı projeksiyon verisidir.

### 13.3 Trade modeli (field-aware)

#### Kimlik ve canonical ilişki
- `onchain_escrow_id` (child trade birincil kimliği)
- `parent_order_id`
- `parent_order_side`
- `trade_origin` (`ORDER_CHILD` / `DIRECT_ESCROW`)
- `canonical_refs.{listing_ref, order_ref}` (`listing_ref` legacy ABI/event trace alanıdır; `order_ref` parent order bağını taşır)

#### Fill ve fee ilişkisi
- `fill_metadata.{fill_amount, filler_address, remaining_amount_after_fill}` (+ num cache’ler)
- `fee_snapshot.{taker_fee_bps, maker_fee_bps}`

#### BigInt-safe finansal strateji
- Otoritatif finansal alanlar string tutulur:
  - `financials.crypto_amount`
  - `financials.maker_bond`
  - `financials.taker_bond`
  - `financials.total_decayed`
  - `financials.burned_amount`
- `*_num` alanları yalnız UI/aggregation kolaylığı içindir; enforcement input’u değildir.

#### PII / receipt / payout snapshot alanları
- `evidence.ipfs_receipt_hash`
- `evidence.receipt_encrypted`
- `evidence.receipt_timestamp`
- `evidence.receipt_delete_at`
- `evidence.receipt_delete_at` yüklemede `+30 gün` olarak yazılır; trade terminale geçince worker yeniden yazar: `RESOLVED` (release, auto-release, settlement) ve `CANCELED` (karşılıklı iptal, ödeme penceresi aşımı) için terminal an `+24 saat`, `BURNED` için `+30 gün`. Yükleme anındaki 30 gün yalnız terminale hiç ulaşmayan trade için geçerli kalır.
- `payout_snapshot.{maker,taker,...}` altında lock-time `profile_version_at_lock`, `bank_change_count_*_at_lock`, `fingerprint_hash_at_lock` gibi risk bağlamı alanları tutulur.
- `payout_snapshot.{captured_at, snapshot_delete_at, is_complete, incomplete_reason}`: `captured_at` doluysa snapshot bir daha yazılmaz (tek seferlik); eksik profil `is_complete=false` + gerekçe olarak kalır.

#### Cancel / chargeback audit alanları
- `cancel_proposal.{proposed_by, proposed_at, approved_by, maker_signed, taker_signed}` — on-chain `CancelProposed` / `CancelRevoked` mirror'ıdır; ayrı imza ya da deadline alanı yoktur (iptal koordinasyonu tamamen on-chain)
- `chargeback_ack.{acknowledged, acknowledged_by, acknowledged_at, ip_hash}`
- `settlement_proposal` taraf-imzalı partial-settlement lifecycle mirror’ını taşır:
  - `NONE -> PROPOSED -> REJECTED/WITHDRAWN/EXPIRED/FINALIZED`
  - split settlement **normal close path değildir**; proposal/accept yalnız `CHALLENGED` state’inde geçerlidir
  - proposer trade taraflarından biridir; accept/reject yalnız karşı tarafla tamamlanır
  - backend yalnız mirror/audit tutar; settlement authority kontratta kalır

#### Retention ve terminal TTL ayrımı
- Trade dokümanı terminal state’lerde `timers.resolved_at` üzerinden 365 günlük TTL index ile temizlenir; kümülatif istatistik `TerminalTradeStat` satırlarında kalır.
- Receipt/snapshot alanları için ayrı cleanup alanları (`receipt_delete_at`, `snapshot_delete_at`) ve job’lar kullanılır.
- Bu ayrım “belge yaşam döngüsü” ile “hassas payload minimizasyonu”nu birbirinden ayırır.

### 13.4 Feedback / stats/snapshot katmanı
- Feedback modeli ürün geri bildirimi için ayrı operational yüzeydir.
- Diğer modeller: `TerminalTradeStat` (kalıcı terminal sayaç), `HistoricalStat`, `RevenueEvent` (vault/escrow gelir mirror'ı), `RewardEpoch`, `RewardClaim`, `RewardFunding`, `RewardEpochAllocationEvent` (ödül read-model'i), `TermsAcceptance` (kullanım koşulları onayı), `PaymentRailSetting` / `PaymentRailAudit` (§17b), `RuntimeSetting` / `RuntimeSettingAudit` (§14.7), `SocialLinkSetting` / `SocialLinkAudit` (footer bağlantıları), `EscrowRegistry` (aktif escrow kaydı; backend için salt-okunur, §10.8).
- Stats/snapshot katmanı (daily aggregates, dashboard counters) karar desteği üretir; protocol authority üretmez.
- Read-model snapshot’ları kontrat state’inin yerini almaz; yalnız operatör görünürlüğünü artırır.

---

## 14. Backend route surface ve coordination semantiği

V3 backend yüzeyi authority üretmez; route’lar projection, coordination ve güvenlik sınırlarını uygular.

| Route grubu | Yüzey | Anlam |
|---|---|---|
| Orders (`/api/orders`) | `GET /config`, `GET /payment-risk-config`, `GET /`, `GET /my`, `POST /market-meta`, `GET /:id/trades`, `GET /:id` | Market read-model, owner görünürlüğü ve off-chain pazar metadata'sı |
| Trades (`/api/trades`) | `GET /my`, `GET /history`, `GET /by-escrow/:onchainId`, `GET /:id`, `GET /:id/settlement-proposal`, `POST /:id/settlement-proposal/preview`, `POST /:id/chargeback-ack` | Child-trade okuma, settlement önizleme ve audit yardımcı yüzeyi |
| Auth (`/api/auth`) | `GET /nonce`, `POST /verify`, `POST /refresh`, `POST /logout`, `GET /me`, `PUT /profile` | Session ve wallet-bound auth authority sınırı |
| PII (`/api/pii`) | `GET /my`, `GET /taker-name/:onchainId`, `POST /request-token/:tradeId`, trade-scoped retrieve | Snapshot-first, role-bound hassas veri erişimi |
| Receipts (`/api/receipts`) | `POST /upload` | Taker + `LOCKED` state için tek seferlik dekont yükleme |
| Rewards (`/api/rewards`) | `GET /epochs/current`, `/epochs/:epoch`, `/health`, `/funding/global`, `/funding/product/:productId`, `/:wallet/claimable`, `/:wallet/history` | Salt-okunur ödül görünümü; kayıt/claim kontratta |
| Admin (`/api/admin`) | Okuma: `GET /revenue`, `/rewards/health`, `/summary`, `/feedback`, `/trades`, `/settlement-proposals`. Operasyon ayarı: `GET/PUT /payment-rails`, `/runtime-settings`, `/social-links` (+ `/audit`) | Yalnız `ADMIN_WALLETS` listesindeki oturumlara açık. Gözlem uçları salt-okunurdur; yazma uçları yalnız off-chain operasyon ayarıdır (sınırlı, denetim kayıtlı, `adminWriteLimiter`); hiçbir protokol yetkisi yoktur |
| Social links (`/api/social-links`) | `GET /` | Footer bağlantıları (herkese açık okuma) |
| Logs / stats / feedback / reference rates | `POST /api/logs/client-error`, `GET /api/stats`, `POST /api/feedback`, `GET /api/reference-rates/ticker` | Observability, ürün geri bildirimi ve bilgilendirme amaçlı kur şeridi |

Backend `/api` altındaki tüm router'ları `routes/mounts.js` tek kaynağından bağlar; kısıtlı modda ve escrow uyumsuzluğunda `requireFullService` kapısı varsayılan-kapalıdır (§10.8, "Kısıtlı (degraded) mod").

### 14.1 Orders routes
- Parent order read/config yüzeyi
- Owner-scope child-trade list/read yüzeyi

### 14.2 Trades routes
- active/history/by-escrow kimlikli okuma
- iptal koordinasyonu backend'de değildir: `proposeOrApproveCancel` / `revokeCancel` doğrudan kontrata gönderilir, backend yalnız event'leri mirror eder
- chargeback ack audit surface (yalnız maker, `PAID`/`CHALLENGED`; on-chain akışa veto uygulamaz)
- settlement-proposal preview + mirror read yüzeyi bilgilendirme/non-authoritative amaçlıdır
- preview yalnız `CHALLENGED` trade için açıktır; non-challenged istekler reddedilir
- backend rolü: preview, event mirror, read-model, audit/observability
- nihai settlement ekonomisi on-chain belirlenir; backend outcome finalize edemez
- settlement finalization’da fee, decay sonrası gross maker/taker split payout üzerinden uygulanır
- backend’in rolü olmayanlar: outcome belirleme, release/cancel/burn/payout override, reputation authority yazma, fon transferi

### 14.2.1 Payment risk sınırı
- `PaymentRiskLevel`, payment rail complexity sinyalidir (UI/read-model).
- Kullanıcı güven/reputation skoru değildir; on-chain authority kaynağı olamaz.

### 14.3 Auth routes
- nonce/verify/refresh/logout/me/profile
- session-wallet mismatch guard

### 14.4 PII routes
- `/my`, `taker-name`, request-token, trade-scoped retrieve
- snapshot-first ve role-bound access

### 14.5 Receipts routes
- file validation (magic byte / MIME eşleşmesi) + encryption + SHA-256 hash
- yalnız taker + `LOCKED` state kabulü; trade başına tek dekont (üzerine yazma `409`)

### 14.6 Logs/stats/feedback
- client error logs
- protocol stats read surface
- feedback intake

### 14.7 Admin operasyon ayarları
- Admin yetkisi `ADMIN_WALLETS` ile (`requireAuth` + cüzdan eşleşmesi + liste kontrolü) verilir; liste boşsa kimse admin değildir ve `/api/admin/*` 403 döner. Bu uçlar protokol state'i yazmaz.
- **Ödeme yöntemi anahtarları** (`/payment-rails`): bkz. §17b.
- **Çalışma ayarları** (`/runtime-settings`, `PUT /:key` = `{value}` ya da `{reset:true}`, isteğe bağlı `reason`, `expectedVersion` ile iyimser çakışma kontrolü): yalnız performans/operasyon düğmeleri (worker yoklama/batch/geri çekilme, watchdog eşikleri, `WORKER_MAX_LAG_BLOCKS`, önbellek TTL'leri, referans kur TTL'leri, decay/recorder iş limitleri, `RPC_MAX_REQUESTS_PER_SEC`). Öncelik: admin değeri > env > koddaki varsayılan; sınırlar her kaynak için sunucuda uygulanır. RPC URL'leri, gizli anahtarlar, kontrat adresleri, `EXPECTED_CHAIN_ID`, finality, CORS, `ADMIN_WALLETS`, KMS ve SEC-01 bilinçli olarak kapsam dışıdır (yalnız env). Her değişiklik `RuntimeSettingAudit`'e yazılır; DB okunamazsa son bilinen/env/varsayılan değerler kullanılır (performans ayarı olduğu için fail-open).
- **Footer sosyal linkleri** (`/social-links`): yalnız https, userinfo yok, kod/env allowlist'i (admin değiştiremez), IDN/punycode reddi, en fazla 8 bağlantı; `expectedVersion` zorunlu, `SocialLinkAudit` kayıtlı.
- Her yazma uç `adminWriteLimiter` altındadır; denetim kaydına yalnız HMAC'li IP özeti yazılır.

---

## 15. Frontend UX guardrail katmanı

Frontend enforcement değildir; ama runtime orchestration ve fail-fast UX guardrail katmanı olarak kritik rol oynar.

```mermaid
flowchart TD
    A[App session layer] --> B[authenticatedFetch]
    A --> C[useArafContract]
    A --> D[usePII]
    C --> E[Contract write/read]
    D --> F[trade-scoped PII flow]
    A --> G[pending tx recovery]
    A --> H[auto-resume active trade]
```

### 15.1 Runtime orchestration: `useArafContract`
- Tüm write çağrılarında preflight guard:
  - wallet client var mı
  - kontrat adresi geçerli mi (`VITE_ESCROW_ADDRESS`)
  - chain destekli mi
- İşlem gönderildikten sonra receipt beklenir; pending tx hash’i `localStorage(araf_pending_tx)` altında saklanır.
- Fill akışlarında `OrderFilled` event decode edilerek `tradeId` çıkarılır; frontend trade kimliği uydurmaz, receipt’ten okur.
- BUY emrinin sahibi 2 günlük cüzdan yaşını doldurmadıysa kontrat `fillBuyOrder`'ı `WalletTooYoung` ile reddeder (yaş create'te değil fill'de uygulanır, §6). Frontend bunu yalnız ipucu olarak gösterir (`useOwnerWalletAge`; okuma başarısızsa hiçbir şey kilitlenmez, fail-open); karar kontrattadır.

### 15.2 Runtime orchestration: `usePII`
- PII akışı 2 adımlıdır:
  1) `pii/request-token/:tradeId`
  2) `pii/:tradeId` (Bearer + cookie session birlikte)
- API path canonicalization `buildApiUrl(...)` üstünden zorlanır.
- `authenticatedFetch` ile me/refresh orkestrasyonu merkezileştirilir.
- Her yeni PII isteğinde önceki request `AbortController` ile iptal edilir; stale response state’i ezemez.
- Unmount/trade değişiminde hassas PII state temizlenir.

### 15.3 Session mismatch ve recovery UX
- `authenticatedFetch` 409 (`SESSION_WALLET_MISMATCH`) gördüğünde backend logout + local session cleanup uygular.
- 401 durumunda `auth/refresh` denenir; başarısızsa kullanıcı yeniden imza akışına yönlendirilir.
- Bağlı cüzdan ile authenticated wallet ayrışırsa fail-fast logout/re-entry davranışı uygulanır.

### 15.4 Wrong-network / wrong-address fail-fast
- Desteklenmeyen chain’de kontrat write çağrısı başlamadan hata verilir.
- Geçersiz/sıfır kontrat adresi durumunda işlem başlatılmaz.
- Amaç zincir dışı silent-failure yerine kullanıcıya erken ve net hata geri bildirimi vermektir.

### 15.5 Provider/bootstrap notları
- App session katmanı açılışta pending tx recovery kontrolü yapar; 24 saatten eski/bozuk hash’ler temizlenir.
- Aynı katman aktif trade’i otomatik resume ederek kullanıcıyı doğru trade room’a döndürebilir.

### 15.6 Frontend enforcement sınırı
Frontend kontratın yerine geçmez; enforcement kontrattadır. Frontend guardrail/orchestration katmanıdır.

### 15.7 Kod yerleşimi (`frontend/src`)
- `hooks/`: `useArafContract` (escrow okuma/yazma), `usePII`, `useRewardsContract`
- `app/providers/`: `SessionProvider` (SIWE oturumu), `AppProviders`, `ThemeProvider`; `app/useAppSessionData.jsx` (`authenticatedFetch`, pending tx kurtarma, aktif trade'e dönüş)
- `app/contexts/`: bağlam bazlı ekranlar — `marketplace`, `trade-room` (karar modeli, zaman çizelgesi, birincil/ikincil aksiyonlar), `operations`, `profile` (ödeme profili, aktif trade'ler, ödüller), `settlement`, `admin` (gözlem paneli + ödeme yöntemi / çalışma ayarı / sosyal link yönetim panelleri; §14.7)
- `app/actions/`: kontrat yaşam döngüsü ve order oluşturma aksiyonları; `app/payoutProfileGate.js`: ödeme profili kapısı (§12.4.1); `app/chainPolicy.js`, `app/apiConfig.js`: zincir ve API yolu politikası; `app/chainFallback.js` + `useChainFallbackTrades.js`: backend erişilemezken bilinen tradeId'leri kontrattan okuyan yedek görünüm ("Altyapı arızasında frontend davranışı"); `app/tradeStateSync.js`: işlem sonrası zincir durumunu `pin`leyip gecikmiş mirror'ın iyimser güncellemeyi ezmesini önler (90 sn); `app/txGate.js`: yeni pozisyon kapısı; `app/walletAge.js` + `hooks/useOwnerWalletAge.js`: cüzdan yaşı ipucu; `app/copy/`: kullanıcı metinleri

---

## 16. Saldırı vektörleri ve bilinen sınırlamalar

### 16.1 Azaltılmış / mitigated riskler

| Risk | Azaltım |
|---|---|
| Maker'ın ping atıp susarak PAID trade'i rehin tutması | Ping `ping+48sa`'te düşer (`MAKER_CHALLENGE_WINDOW`), taker `pingMaker` → `autoRelease` yolunu kullanır |
| Bond'suz (Tier 0) taker'ın LOCKED trade'i rehin tutması | `PAYMENT_WINDOW` (48 saat) + `expirePaymentWindow`; `reportPayment` pencere sonrası `PaymentWindowClosed` |
| Settlement oranının kabul öncesi değiştirilmesi | `acceptSettlement(tradeId, expectedProposalId)`; uyuşmazlıkta `SettlementProposalMismatch` |
| Yanlış yapılandırılmış hazine yüzünden ücretli çıkışların durması (`RevenueHookFailed`) | `setTreasury` yalnız `escrow()` getter'ı bu escrow'u gösteren vault'u kabul eder (`TreasuryEscrowMismatch`). Kötü niyetli owner'a karşı tam koruma değildir: owner yine bu escrow'a bağlı ama hook'u revert eden bir kontrat kurabilir; zaman kilidi yoktur. |
| Owner'ın rewards adresini değiştirip ödül rezervini çekmesi | `ArafRevenueVault.setRewards` tek seferlik (`RewardsAlreadySet`) ve yalnız `revenueVault()` bu vault'u gösteren kontratı kabul eder (`InvalidRewardsBinding`, K3-04; ilk atamada EOA reddedilir, getter'ı taklit eden sahte kontrata karşı tam güvence değildir) |
| Sponsor fonunun vault bakiye açığını maskelemesi | `outstandingExternalFunding` `onArafRevenue` yükümlülüğüne katılır (K3-06) |
| Sıfır ücretli wash-trade ile ödül havuzunun emilmesi | Ödenen ücreti 0 olan tarafın ödül ağırlığı 0 (K3-02). Çok düşük (sıfır olmayan) ücretle arbitraj belgelenmiş kalan risktir |
| Maker sessiz kalınca `autoRelease`'in `releaseFunds`'tan az ücret bırakması | Kesinti taraf başına en az release ücreti (K2-01) |
| Yanlış token decimals ile tier tavanı / ödül notional'ı bozulması | `setTokenConfig` token'ın `decimals()` değerini zincirde doğrular (`InvalidDecimals`) |
| Burn'de erimiş kısmın escrow'da kalıcı kilitlenmesi | `burnExpired` trade'in tüm bakiyesini hazineye gönderir |
| Create sonrası cezalanan order sahibinin order'ının doldurulması | Fill anında sahibin ban'ı ve efektif tier'ı yeniden kontrol edilir |
| Backend authority confusion (kısmen azaltıldı) | doküman + route projection sınırları + worker mirror uyarıları ile backend’in “hakem” gibi yorumlanma riski daraltıldı. |
| Session/account confusion | cookie wallet ↔ header wallet mismatch durumunda request reddi + refresh family revoke + cookie clear zinciri uygulanır. |
| PII overexposure | trade-scoped token + role/state/session üçlü kontrolü + snapshot-first + no-store semantiği. |
| API path drift | frontend canonical path helper kullanımıyla farklı endpoint kökü kaynaklı sessiz hatalar azaltıldı. |
| Wrong-network tx riski (UX düzeyinde) | chain/address preflight guard’ları ile işlem başlamadan fail-fast. |

### 16.2 Kalan / open riskler

| Risk | Açıklama |
|---|---|
| Governance key risk | mutable fee/cooldown/token config/reputation politikası/treasury yüzeyi owner kontrolündedir; zaman kilidi yoktur, multisig ve operasyon disiplini gerektirir. |
| Kara listeye giren taraf (K1-01) | Ödeme doğrudan gönderilir; taraf token kara listesine girerse LOCKED Tier≥1 işlemde çıkış, kara liste kalkana kadar mümkün olmaz. Kullanıcı kararıyla (2026-10-21) çekilebilir bakiye eklenmedi. |
| Decay ters teşviki (K3-01 sonrası kalan) | Hiç banlanmamış cüzdan `decayReputation` çağıramaz (`NoPriorBanHistory`), `riskPoints`'i yalnız pozitif sinyallerle düşer; banlanan cüzdan temiz dönem sonunda `riskPoints` sıfırlaması alır. Son olumsuz olay koşuluyla fark daraldı ama kapanmadı (§8.3). |
| `renounceOwnership` | `Ownable` mirası kapatılmamıştır; çağrılırsa owner yüzeyleri (pause dahil) kalıcı kilitlenir. |
| Fake receipt / off-chain payment ambiguity | dekont hash’i ve encrypted payload fraud’u pahalılaştırır ama fiat transferin maddi gerçekliğini matematiksel kanıtlamaz. |
| Chargeback reality | bankacılık katmanındaki geri alma/itiraz süreçleri zincir üstü finaliteyi dış dünyada tartışmalı hale getirebilir. |
| Açık kalan iptal onayı | iptal koordinasyonu on-chain'dir (imza/deadline yok). Verilen onay, state değişmedikçe karşı taraf ikinci onayı verene kadar geçerli kalır; kullanıcı vazgeçerse `revokeCancel` ile geri çekmelidir (`reportPayment` / `challengeTrade` onayları zaten sıfırlar). |
| Ödeme profili kapısı yalnız UI/API'dedir | kontrat doğrudan çağrılarak atlanabilir; güvence eksik snapshot → PII kapalı → ödeme penceresi kuralıdır (§12.4.1). |
| Backend mirror’in authority sanılması | operatör veya entegratör, Mongo/state cache’i yanlışlıkla source-of-truth okuyabilir. |
| Frontend wrong-network/wrong-address configuration riski | guardrail’e rağmen yanlış env/config dağıtımı kullanıcıyı yanıltabilir. |
| Operator/doc misunderstanding riski | eski listing-first veya “backend hakemdir” gibi mental model kalıntıları operasyonel hataya yol açabilir. |

### 16.3 Bilinçli sınırlamalar (oracle-free model)
- Oracle-free tasarım gereği fiat transferin “gerçekten yapıldı mı” sorusu kontrat içinde kesin doğrulanmaz.
- Sistem mutlak hakemlik yerine ekonomik teşvik/ceza ve zaman-bazlı decay mekanizmasıyla kötü davranışı pahalılaştırır.
- Bu bilinçli sınır, merkezi oracle/arbiter güven varsayımını azaltırken sosyal/operasyonel uyuşmazlık riskini tamamen yok etmez.

---

## 17. Legacy concepts (historical / deprecated / non-canonical)

```mermaid
flowchart LR
    A[createEscrow / lockEscrow-centered flow] --> X[Non-canonical]
    B[listing-first mental model] --> X
    C[fixed fee / fixed cooldown assumptions] --> X
    D[mutlak maker=seller / taker=buyer] --> X
    E[V3 parent-order first + child-trade lifecycle] --> Y[Canonical]
```

Aşağıdakiler canlı V3 mimarinin canonical yüzeyi değildir:
- createEscrow/lockEscrow merkezli anlatı
- listing-first market primitive
- fixed fee/fixed cooldown varsayımları
- maker=seller, taker=buyer mutlaklığı
- old single-dimension token support dili

Legacy içerik yalnız tarihsel bağlam için tutulmalı; operasyonel kararlar bu doküman + source-of-truth kod üzerinden verilmelidir.

---

## 17b. Ödeme yöntemi anahtarları (admin)

Rail durumu tek Mongo belgesindedir (`PaymentRailSetting`, iyimser `version`); 15 sn'lik süreç-içi önbellekle (`PAYMENT_RAILS_CACHE_TTL_MS`) okunur (`services/paymentRails.js`; yerel yazmada geçersiz kılınır, DB okuma hatasında son bilinen/hepsi etkin). Kayıt yoksa `paymentRailRiskConfig.js`'te tanımlı tüm rail'ler etkindir. Her değişiklik değiştirilemez `PaymentRailAudit` koleksiyonuna eklenir (admin cüzdanı, önceki/yeni değer, gerekçe, HMAC'li IP). En az bir rail açık kalmalıdır (`LAST_ENABLED_RAIL`, 409); yazma kapısı fail-closed'dır (durum hiç okunamadıysa 503). Rail kapatmak yalnız YENİ işi engeller: profil oluşturma/değiştirme, market-meta ve sahibi kapalı rail'de olan emirleri doldurma (`owner_rail_enabled=false`). Aktif işlemler, ödeme snapshot'ları ve PII akışı etkilenmez. Kontrat rail bilmez; bu kapı UI/API düzeyindedir, kontrat doğrudan çağrılarak aşılabilir.

---

## 18. Sonuç: bu dokümanın rolü

Bu metin iki rolü aynı anda taşır:
1. V3 canonical modelin kısa ve net çerçevesi
2. Ekip içi operasyonel/teknik referans (security, data model, runtime reliability, guardrails, attack surface)

Dolayısıyla doküman ne yalnız “özet”, ne de stale legacy metin kopyasıdır; güncel V3 gerçekliğe hizalanmış kapsamlı teknik referanstır.

<div align="center">

*Araf Protokolü — V3 Order-First canonical docs*

[![Base](https://img.shields.io/badge/Base_L2-0052FF?style=for-the-badge&logo=coinbase&logoColor=white)](https://base.org)
[![Solidity](https://img.shields.io/badge/Solidity-363636?style=for-the-badge&logo=solidity&logoColor=white)](https://soliditylang.org)
[![MongoDB](https://img.shields.io/badge/MongoDB-47A248?style=for-the-badge&logo=mongodb&logoColor=white)](https://mongodb.com)
[![Redis](https://img.shields.io/badge/Redis-DC382D?style=for-the-badge&logo=redis&logoColor=white)](https://redis.io)

</div>

## Altyapı arızasında frontend davranışı

- Açılış istekleri `fetchWithTimeout` (10 sn; yazma/yükleme 60 sn, otomatik tekrar yok) ile yapılır. Backend/RPC arızası `infraHealth` deposuna işlenir; `BACKEND_UNREACHABLE` / `RPC_UNREACHABLE` bantları kapatılabilir, kritik güvenlik uyarıları (`ESCROW_MISMATCH` vb.) kapatılamaz kalır.
- Toparlanma: tek arka plan yoklaması, üstel geri çekilme (5 sn → 60 sn, jitter); yoklama başarısında bant kalkar ve veri sayfa yenilenmeden yeniden çekilir.
- Fail-closed: YENİ pozisyon açan işlemler (emir oluştur / emre gir) `txGate` ile paused, "ilk zincir okuması gelmedi", altyapı arızası, kısıtlı mod, bayat config ya da backend escrow kaydı uyumsuzluğunda (`503 ESCROW_MISMATCH` → `escrow_mismatch`) kapalıdır; eylem fonksiyonları approve öncesi kontrol eder. Mevcut işlemden çıkış eylemleri kapatılmaz (kontrat zaman kurallarını zincirde uygular); trade room yalnız sakin bir uyarı gösterir.
- Yedek işlem görünümü: `/trades/my` alınamazsa ve cüzdan bağlıysa, kullanıcının bildiği tradeId'ler (yerel kayıt, en fazla 50, PII yok) kontrattan `getTrade` ile okunur (en fazla 4 eşzamanlı okuma, en sık 30 sn'de bir). Durum, roller ve zamanlar yalnız kontrat okumasından gelir; eylemler yine kontrata gider. İşlem sonrası zincir durumu 90 sn'ye kadar `pin`lenir, gecikmiş mirror daha eski durumla ezemez.
- RPC taşıması: `VITE_RPC_URL` (varsa) birincil, herkese açık RPC yedektir.
- Render hatası yalnız ilgili bölümü düşürür (`ErrorBoundary scope="section"`); `public/boot-guard.js` ana paket yüklenmezse "yenile" gösterir.

## Kısıtlı (degraded) mod

- RPC'ye bağlı bir açılış adımı (SEC-01 zincir doğrulaması, protocol config, worker) GEÇİCİ RPC hatası (429, ağ, zaman aşımı) alırsa backend çıkmaz; kısıtlı modda açılır: tek `warn` (RPC URL'si redakte), `/ready` 503 ve `degradedReasons: ["rpc_unavailable_at_boot"]`. Kesin hata (ChainGuard / yanlış zincir / bilinmeyen hata) ve DB hatası bugünkü gibi çıkış kodu 1 verir. Atlatma bayrağı yoktur.
- SEC-01 zinciri 84532 olarak doğrulamadan KMS anahtarı yüklenmez (`blockKeyLoadingUntilSelfTest`); şifreleme çağrıları `KMS_UNAVAILABLE_DEGRADED` ile reddedilir.
- `middleware/requireFullService.js` `/api` üzerinde varsayılan-kapalı kapıdır: yalnız izin listesi (herkese açık order/stat/ticker/rewards okuma, SIWE auth, istemci logu) geçer; diğer her uç 503 `SERVICE_DEGRADED` döner. Test gerçek router'ları listeler; yeni uç izin listesine eklenene kadar kapalıdır. Zincire bağlı zamanlayıcılar (DLQ, reputation decay, reward recorder, reconciliation) kısıtlı modda atlanır. Protocol config Redis'teki son bilinen kopyadan gelir ve bayat işaretlenir (`X-Araf-Config-Stale`).
- Toparlanma: tek arka plan döngüsü (5 sn → 5 dk üstel, jitter) sırayla SEC-01 + KMS anahtarı, protocol config, worker'ı dener. Başarıda `degraded=false`, `/ready` 200 ve tek info log.
- Hata sınıflandırma: SEC-01 "kesin yanlış zincir" kararı hata nesnesi özelliğiyle taşınır (`err.definitiveWrongChain` / `err.code = "SEC01_WRONG_CHAIN"`); mesaj metni (RPC kaynaklı) kararı etkilemez. HTTP 403 + "capacity" / "limit exceeded" / "rate" metni (sağlayıcı kotası) geçicidir; diğer 401/403 kesin hatadır. `configStale` hem `serviceMode` hem `protocolConfig.isProtocolConfigStale()` değerini okur.
- Frontend: 503 `SERVICE_DEGRADED` (ya da izinli uçta `X-Araf-Degraded`) genel "sunucuya ulaşılamıyor" bandına değil, ayrı sakin ve kapatılabilir `service_degraded` bandına düşer (kritik değildir). `configStale: true` gelirse bilgi bandı çıkar ve yeni emir oluşturma / emre girme kapısı (`txGate`, neden `config_stale`) kapanır; mevcut işlemdeki çıkış eylemleri açık kalır. Tek yoklama bayrakları kaldırır.
- Sınıflandırma: yalnız RPC kaynaklı geçici hatalar kısıtlı moda düşürür (429, aylık kapasite, bağlantı kopması/timeout, 502/503/504). Mongo/Redis hataları, 4xx (401/403), ENOTFOUND, ChainGuard, yanlış zincir (SEC-01 denemelerinde HERHANGİ bir URL'de görülen dahil) ve bilinmeyen hatalar toparlanma sırasında da çıkış kodu 1 verir.
- Config toparlanması bilinçli olarak açılıştan sıkıdır: açılış `loadProtocolConfig` (strictTokens=false; okunamayan token "desteklenmiyor" yüklenir), toparlanma `refreshProtocolConfig` (strictTokens=true) kullanır; null ya da bayat sonuç adımı başarısız sayar, böylece kısmi config tam hizmete çıkmaz ve `configStale` temizlenmez. `/api/orders/config` ve `/payment-risk-config` yanıtında `configStale: true|false` vardır.
