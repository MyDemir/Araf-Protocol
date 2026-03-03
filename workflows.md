```markdown
# 🔄 Araf Protocol - Visual Workflows & Diagrams

This document contains the visual flowcharts of the Araf Protocol's smart contract logic, Game Theory mechanics, and Anti-Sybil shield.
*(Bu doküman, Araf Protocol'ün akıllı kontrat mantığını, Oyun Teorisi mekaniklerini ve Anti-Sybil kalkanını gösteren görsel iş akışlarını içerir.)*

---

## 🇬🇧 ENGLISH WORKFLOWS

### 1. Standard Trade Flow (The Happy Path)
The standard, dispute-free process where both Maker and Taker act honestly.

```mermaid
graph TD
    A[START] -->|Maker locks USDT & Collateral| B(OPEN - Ad is Live)
    B -->|Taker clicks 'Buy' & Passes Anti-Sybil| C(LOCKED - Funds Secured)
    C -->|Taker sends Fiat & Uploads Receipt Hash| D(PAID - Fiat Sent)
    D -.->|48-Hour Release Timer Starts| D
    D -->|Maker receives Fiat & clicks 'Release'| E((RESOLVED - Trade Successful))
    E --> F[USDT goes to Taker, Bonds returned, +1 Rep Score]

```

### 2. Dispute & Time-Decay Burn (Purgatory Phase)

The Game Theory mechanism that makes scamming unprofitable.

```mermaid
stateDiagram-v2
    [*] --> PAID: Taker confirms Fiat payment
    PAID --> CHALLENGED: Maker Disputes (Purgatory Phase Begins)
    
    state Purgatory_Phase {
        CHALLENGED --> Grace_Period: First 48 Hours (Penalty-Free)
        Grace_Period --> Mutual_Agreement: Mutual Cancel / Release
        Grace_Period --> BLEEDING_ESCROW: Stubbornness Prevails (No Agreement)
        
        BLEEDING_ESCROW --> BLEEDING_ESCROW: ⏳ 10% of total funds sent to Treasury every 24h
        BLEEDING_ESCROW --> Mutual_Agreement: Parties compromise to save remaining funds
    }
    
    Mutual_Agreement --> RESOLVED: Escrow Closed Successfully
    BLEEDING_ESCROW --> BURNED: 💀 10 Days Pass (100% Funds Decayed)
    BURNED --> [*]: Trade Closed. Total Loss for Both.

```

### 3. Anti-Sybil Shield (Taker Entry Logic)

The on-chain filters protecting the 0% bond entry for Tier 1 users from bot networks.

```mermaid
graph LR
    A[Taker 'Buy' Request] --> B{Wallet Age > 7 Days?}
    B -- No --> X((REVERT / TX FAILED))
    B -- Yes --> C{Native Balance > Dust Limit?}
    C -- No --> X
    C -- Yes --> D{Traded within last 24h? - Cooldown}
    D -- Yes --> X
    D -- No --> E((LOCKED / Trade Starts))

```

---

## 🇹🇷 TÜRKÇE İŞ AKIŞLARI

### 1. Standart İşlem Akışı (Mutlu Senaryo)

Hem Satıcının (Maker) hem de Alıcının (Taker) dürüst davrandığı ve uyuşmazlık çıkmayan standart süreç.

```mermaid
graph TD
    A[BAŞLANGIÇ] -->|Maker USDT ve Teminat Kilitler| B(OPEN - İlan Tahtada)
    B -->|Taker 'Satın Al'a Basar + Anti-Sybil Geçilir| C(LOCKED - Fonlar Kilitli)
    C -->|Taker Bankadan TRY Gönderir + Dekont Yükler| D(PAID - Ödendi)
    D -.->|48 Saatlik Sayacı Başlar| D
    D -->|Maker Parayı Görür + 'Serbest Bırak' Der| E((RESOLVED - Başarılı Kapanış))
    E --> F[USDT Alıcıya Geçer, Teminatlar İade Edilir, +1 Puan]

```

### 2. Uyuşmazlık, Araf ve Eriyen Kasa (Oyun Teorisi)

Dolandırıcılığı ve şantajı matematiksel olarak kârsız hale getiren oyun teorisi mekanizması.

```mermaid
stateDiagram-v2
    [*] --> PAID: Taker Ödeme Bildirdi
    PAID --> CHALLENGED: Maker İtiraz Etti (Araf Fazı Başlar)
    
    state Araf_Fazi {
        CHALLENGED --> Muzakere_Sureci: İlk 48 Saat (Cezasız)
        Muzakere_Sureci --> Anlasma_Saglandi: Karşılıklı İptal / Onay
        Muzakere_Sureci --> ERIYEN_KASA: İnatlaşma Devam Ediyor
        
        ERIYEN_KASA --> ERIYEN_KASA: ⏳ Her 24 saatte %10 fon Hazineye kesilir
        ERIYEN_KASA --> Anlasma_Saglandi: Kalan fonu kurtarmak için mecburi uzlaşma
    }
    
    Anlasma_Saglandi --> RESOLVED: İşlem Kapatılır
    ERIYEN_KASA --> BURNED: 💀 10 Gün Bitti (%100 Eridi)
    BURNED --> [*]: İşlem Kapatıldı. İki taraf da kaybetti.

```

### 3. Anti-Sybil Kalkanı (Troll Koruması)

Tier 1 kullanıcıları için %0 teminat girişini bot ağlarından koruyan zincir-içi filtreler.

```mermaid
graph LR
    A[Taker 'Satın Al' İsteği] --> B{Cüzdan Yaşı > 7 Gün mü?}
    B -- Hayır --> X((REVERT / İŞLEM İPTAL))
    B -- Evet --> C{Bakiye > Minimum Dust Limit mi?}
    C -- Hayır --> X
    C -- Evet --> D{Son 24 Saatte Başka İşlem Var mı?}
    D -- Evet --> X
    D -- Hayır --> E((LOCKED / İşlem Başlar))

```
