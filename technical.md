iy# 🛠️ Araf Protocol - Technical Architecture & Roadmap (V1.0)

Bu doküman, Araf Protocol'ün merkeziyetsiz, hakemsiz ve oyun teorisi (MAD & Time-Decay) tabanlı P2P escrow sisteminin teknik altyapısını ve geliştirme yol haritasını detaylandırır.

---

## 1. Teknoloji Yığını (Tech Stack)
Proje, modern ve güvenli Web3 standartlarına göre inşa edilecektir:
* **Akıllı Kontrat (Backend):** Solidity (v0.8.20+)
* **Geliştirme Ortamı & Test:** Foundry (Yüksek hız ve Solidity tabanlı fuzzing/stress testleri için)
* **Frontend (Arayüz):** Next.js (React), TailwindCSS
* **Web3 Etkileşimi:** Wagmi ve Viem (Cüzdan entegrasyonu ve kontrat okuma/yazma)
* **Veri İndeksleme (Opsiyonel):** The Graph (Subgraph) - İlan tahtasını hızlı render etmek için

---

## 2. Akıllı Kontrat Mimarisi (Modüler Yapı)
Sistem tek bir monolitik yapı yerine, güvenlik ve güncellenebilirlik için modüler parçalara bölünmüştür:

1. `ArafEscrow.sol`: Ana kontrat. İlan açma, fon kilitleme, ödeme bildirimi ve Araf (Purgatory) fazını yönetir.
2. `ArafTreasury.sol`: Kasa kontratı. "Eriyen Kasa" (Bleeding Escrow) mekanizmasından kesilen fonların toplandığı güvenli havuz.
3. `ArafReputation.sol`: Kullanıcıların +1 başarı puanlarını, başarısız işlem verilerini ve Tier (Kademe) seviyelerini tutan sözleşme.

---

## 3. Durum Makinesi (State Machine) ve Veri Yapıları

### A. Durumlar (Enums)
İşlemlerin hangi aşamada olduğunu belirten temel durumlar:
```solidity
enum TradeState {
    OPEN,           // 0: İlan açık, alıcı bekleniyor
    LOCKED,         // 1: Alıcı geldi, fonlar kilitli, fiat ödemesi bekleniyor
    PAID,           // 2: Alıcı ödemeyi bildirdi, 48 saatlik Müzakere/Release süresi başladı
    CHALLENGED,     // 3: Satıcı itiraz etti, Araf (Purgatory) fazı başladı
    RESOLVED,       // 4: İşlem başarıyla bitti (Fonlar dağıtıldı)
    CANCELLED       // 5: Karşılıklı iptal (Fonlar sahiplerine iade edildi)
}

```

### B. İşlem Modeli (Trade Struct)

Her bir P2P işleminin blokzincirde tutulacak verisi:

```solidity
struct Escrow {
    uint256 tradeId;        // İşlem ID'si
    address maker;          // Satıcı cüzdanı (Kripto sağlayan)
    address taker;          // Alıcı cüzdanı (Fiat gönderen)
    uint256 fiatAmount;     // TRY cinsi tutar
    uint256 cryptoAmount;   // Kilitlenen USDT tutarı
    uint256 makerBond;      // Satıcı teminatı
    uint256 takerBond;      // Alıcı teminatı (Tier 1 için 0 olabilir)
    TradeState state;       // İşlemin güncel durumu
    uint256 timerStart;     // Geri sayımlar için zaman damgası (Timestamp)
    uint256 decayedAmount;  // Araf fazında eriyip hazineye giden toplam miktar
}

```

---

## 4. Güvenlik ve Anti-Sybil Filtreleri (Modifiers)

* `onlyMaker` / `onlyTaker`: Fonksiyonları sadece yetkili tarafın çağırmasını sağlar.
* `checkCooldown`: Alıcının (özellikle Tier 1) son 24 saat içinde işlem yapıp yapmadığını kontrol eder.
* `checkDustBalance`: Bot saldırılarını engellemek için alıcı cüzdanında minimum ağ ücreti kadar (örn. $2 değerinde native coin) bakiye arar.

---

## 5. Eriyen Kasa (Time-Decay) Matematiği

Araf (Purgatory) fazında, 48 saatlik cezasız müzakere süresi dolduktan sonra içerideki toplam fon (USDT + Teminatlar) her 24 saatte bir **%10** oranında erir.

* `Erime Miktarı = (Toplam Fon * %10) * (Geçen Gün Sayısı)`
* Eriyen miktar anında `ArafTreasury.sol` kontratına aktarılır. Kalan miktar tarafların anlaşması durumunda dağıtılır.

---

## 6. Geliştirme Yol Haritası (Milestones)

* [ ] **Faz 1: Akıllı Kontrat Geliştirme**
* Temel veri yapılarının ve `ArafEscrow.sol` iskeletinin kurulması.
* Standart P2P akışının (Open -> Lock -> Paid -> Release) kodlanması.
* Araf ve Eriyen Kasa (Bleeding) matematiğinin entegrasyonu.


* [ ] **Faz 2: Oyun Teorisi Stres Testleri (Foundry)**
* TDD (Test-Driven Development) yaklaşımı ile Sybil saldırısı, inatlaşma ve re-entrancy testlerinin yazılması.


* [ ] **Faz 3: Frontend ve Web3 Entegrasyonu**
* Next.js ile kullanıcı arayüzünün geliştirilmesi.
* Wagmi/Viem ile cüzdan bağlantılarının ve kontrat etkileşimlerinin sağlanması.


* [ ] **Faz 4: Testnet Dağıtımı**
* Arbitrum Sepolia veya Base Sepolia ağına deploy edilmesi.
* Canlı test token'ları ile uçtan uca senaryoların test edilmesi.
