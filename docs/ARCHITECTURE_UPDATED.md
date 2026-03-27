# 🌀 Araf Protokolü — Kanonik Mimari & Teknik Referans

> **Versiyon:** 2.22 | **Ağ:** Base (Katman 2) | **Durum:** Testnete Hazır | **Son Güncelleme:** Mart 2026

> **Sürüm Notu (aktif çalışma kopyası):** Bu revizyon, deploy güvenliği ve production kurulum semantiğini mimariye işleyen 2.21 sürümüdür. Son eklenen kapsam: `contracts/scripts/deploy.js` üzerinden supported token aktivasyonunun zincir üstünde doğrulanmadan ownership devri yapılmaması; production ortamında gerçek token adreslerinin ENV üzerinden zorunlu alınması; non-production yardımcı otomasyonların mimarinin çekirdeği sayılmaması; ayrıca bu deployment yanlış varsayımlarının 12. bölüme ayrı risk maddeleri olarak eklenmesi.

---

## İçindekiler

1. [Vizyon ve Temel Felsefe](#1-vizyon-ve-temel-felsefe)
2. [Hibrit Mimari: On-Chain ve Off-Chain](#2-hibrit-mimari-on-chain-ve-off-chain)
3. [Sistem Katılımcıları](#3-sistem-katılımcıları)
4. [Tier ve Teminat Sistemi](#4-tier-ve-teminat-sistemi)
5. [Anti-Sybil Kalkanı](#5-anti-sybil-kalkanı)
6. [Standart İşlem Akışı (Happy Path)](#6-standart-işlem-akışı-happy-path)
7. [Uyuşmazlık Sistemi — Bleeding Escrow](#7-uyuşmazlık-sistemi--bleeding-escrow)
8. [İtibar ve Ceza Sistemi](#8-itibar-ve-ceza-sistemi)
9. [Güvenlik Mimarisi](#9-güvenlik-mimarisi)
10. [Veri Modelleri (MongoDB)](#10-veri-modelleri-mongodb)
11. [Hazine Modeli](#11-hazine-modeli)
12. [Saldırı Vektörleri ve Bilinen Sınırlamalar](#12-saldırı-vektörleri-ve-bilinen-sınırlamalar)
13. [Kesinleşmiş Protokol Parametreleri](#13-kesinleşmiş-protokol-parametreleri)
14. [Gelecek Evrim Yolu](#14-gelecek-evrim-yolu)
15. [Frontend UX Koruma Katmanı (Mart 2026)](#15-frontend-ux-koruma-katmanı-mart-2026)

---

## 1. Vizyon ve Temel Felsefe

Araf Protokolü; fiat para birimi (TRY / USD / EUR) ile kripto varlıklar (USDT / USDC) arasında güvensiz ortamda takas yapmayı mümkün kılan, **emanet tutmayan, insansız ve oracle-bağımsız** bir eşten eşe escrow sistemidir. Moderatör yok, hakeme başvuru yok, müşteri hizmetleri yok. Uyuşmazlıklar on-chain zamanlayıcılar ve ekonomik oyun teorisi ile özerk olarak çözülür.

> *"Sistem yargılamaz. Dürüstsüzlüğü pahalıya mal eder."*

### Temel İlkeler

| İlke | Açıklama |
|---|---|
| **Emanet Tutmayan (Non-Custodial)** | Platform kullanıcı fonlarına hiçbir zaman el sürmez. Tüm varlıklar şeffaf bir akıllı sözleşmede kilitlenir. |
| **Oracle-Bağımsız Uyuşmazlık Çözümü** | Hiçbir dış veri kaynağı anlaşmazlıklarda kazananı belirlemez. Çözüm tamamen zaman bazlıdır (Bleeding Escrow). |
| **İnsansız** | Moderatör yok. Jüri yok. Kodu ve zamanlayıcılar her şeye karar verir. |
| **MAD Tabanlı Güvenlik** | Karşılıklı Garantili Yıkım (MAD) oyun teorisi: dürüstsüz davranış her zaman dürüst davranıştan daha pahalıya mal olur. |
| **Non-custodial Backend Anahtar Modeli** | Backend kullanıcı fonlarını kontrol eden custody anahtarı tutmaz; operasyonel automation/relayer signer olabilir ancak kullanıcı fonlarını doğrudan hareket ettiremez. |

### Oracle-Bağımsızlık Açıklaması

**Oracle KULLANILMAYAN alanlar:**
- ❌ Banka transferlerinin doğrulanması
- ❌ Uyuşmazlıklarda "haklı taraf" kararı
- ❌ Escrow serbest bırakmayı tetikleyen herhangi bir dış veri akışı

**Off-chain yaşayan veriler (ve nedeni):**
- ✅ PII verisi (IBAN, Telegram) — **GDPR / KVKK: Unutulma Hakkı**
- ✅ Emir defteri ve ilanlar — **Performans: 50ms altı sorgu**
- ✅ Analitik — **Kullanıcı deneyimi: gerçek zamanlı istatistikler**

> Ayrımın önemi: Oracle'lar yalnızca yasal veri depolama için kullanılır — **asla uyuşmazlık sonuçları için değil.**

---

## 2. Hibrit Mimari: On-Chain ve Off-Chain

Araf **Web2.5 Hibrit Sistem** olarak çalışır. Güvenlik açısından kritik operasyonlar on-chain'de; gizlilik ve performans açısından kritik veriler off-chain'de yaşar.

### Mimari Karar Matrisi

| Bileşen | Depolama | Teknoloji | Gerekçe |
|---|---|---|---|
| USDT / USDC Escrow | On-Chain | ArafEscrow.sol | Değiştirilemez, emanet tutmayan, güvensiz |
| İşlem Durum Makinesi | On-Chain | ArafEscrow.sol | Bleeding zamanlayıcısı tamamen özerk |
| İtibar Puanları | On-Chain | ArafEscrow.sol | Kalıcı, sahte olunamaz geçmiş kanıtı |
| Teminat Hesaplamaları | On-Chain | ArafEscrow.sol | Hiçbir backend cezaları manipüle edemez |
| Anti-Sybil Kontrolleri | On-Chain | ArafEscrow.sol | Cüzdan yaşı, dust, cooldown zorunlu kılınmış |
| PII Verisi (IBAN / İsim) | Off-Chain | MongoDB + KMS | GDPR / KVKK: Unutulma Hakkı |
| Emir Defteri ve İlanlar | Off-Chain | MongoDB | 50ms altı sorgular, ücretsiz filtreleme |
| Olay Önbelleği | Off-Chain | MongoDB | Hızlı UI için işlem durumu aynası |
| Operasyonel Geçici Durum | Bellekte | Redis | Nonce, rate limit, checkpoint, DLQ, kısa ömürlü koordinasyon |

### Teknoloji Yığını

| Katman | Teknoloji | Detaylar |
|---|---|---|
| Akıllı Sözleşme | Solidity + Hardhat | 0.8.24, optimizer runs=200, `viaIR`, `evmVersion=cancun` — Base L2 (Chain ID 8453) / Base Sepolia (84532) |
| Backend | Node.js + Express | CommonJS, non-custodial relayer |
| Veritabanı | MongoDB + Mongoose | v8.x — İlanlar, İşlemler, Kullanıcılar; `maxPoolSize=100`, `socketTimeoutMS=20000`, `serverSelectionTimeoutMS=5000` |
| Önbellek / Auth / Koordinasyon | Redis | v4.x — Hız limitleri, nonce'lar, event checkpoint, DLQ, readiness gate |
| Zamanlanmış Görevler | Node.js jobs | Pending listing cleanup, PII/dekont retention cleanup, on-chain reputation decay, günlük stats snapshot |
| Şifreleme | AES-256-GCM + HKDF + KMS/Vault | Zarf şifreleme, cüzdan başına deterministik DEK, üretimde harici anahtar yöneticisi |
| Kimlik Doğrulama | SIWE + JWT (HS256) | EIP-4361, 15 dakika geçerlilik |
| Frontend | React 18 + Vite + Wagmi | Tailwind CSS, viem, EIP-712 |
| Sözleşme ABI | Deploy'da otomatik oluşturulur | `frontend/src/abi/ArafEscrow.json` |

### Çalışma Zamanı Bağlantı Politikaları

Araf'ın gerçek çalışma zamanı davranışı yalnızca teknoloji seçimiyle değil, **bağlantı ve hata politikalarıyla** tanımlanır:

- **MongoDB havuz politikası:** Event replay/worker yükü ile eşzamanlı API trafiği aynı anda Mongo'ya binebilir. Bu nedenle bağlantı havuzu düşük tutulmaz; havuz doygunluğu sonucu kullanıcı isteklerinin `serverSelectionTimeoutMS` ile düşmesi önlenir.
- **Timeout hizalama:** Mongo `socketTimeoutMS`, reverse proxy/CDN timeout'ının altında tutulur. Amaç, istemci bağlantısı koptuktan sonra arka planda uzun süre yaşayan "zombi" sorgular bırakmamaktır.
- **Fail-fast DB yaklaşımı:** Mongo bağlantısı `disconnected` event'i ile koparsa süreç kendini sonlandırır. PM2 / Docker / orchestrator temiz bir process ile yeniden başlatır. Kısmi reconnect yerine temiz başlangıç tercih edilir.
- **Redis readiness-first yaklaşımı:** Redis yalnızca bağlanmış olmakla yetinmez; `isReady` durumu uygulama tarafından kontrol edilir. Böylece Redis'e bağlı middleware'ler tek nokta hatasına dönüşmez.
- **Managed Redis / TLS uyumu:** `rediss://` veya TLS zorunlu servislerde güvenli bağlantı yerel config tarafından desteklenir. Self-signed sertifika bypass yalnızca geliştirme içindir.

### Sıfır Güven Backend Modeli

Off-chain altyapı kullanılmasına rağmen **backend fonları çalamaz veya sonuçları manipüle edemez:**

```
✅ Backend'de kullanıcı fonları için custody anahtarı yoktur (operasyonel signer olabilir)
✅ Backend escrow serbest bırakamaz (yalnızca kullanıcılar imzalayabilir)
✅ Backend Bleeding Escrow zamanlayıcısını atlayamaz (on-chain zorunlu)
✅ Backend itibar puanlarını sahte gösteremez (on-chain doğrulanır)
⚠️  Backend PII'yı şifre çözebilir (UX için zorunlu kötülük — hız sınırlama + denetim logları ile azaltılmış)
```

### Kontrat Otoritesi ve Backend Aynası

`ArafEscrow.sol`, protokolün **tek otoritatif durum makinesidir**. Backend, event listener ve Mongo aynası yalnızca bu gerçeği indeksler; iş kurallarını tek başına değiştiremez.

Bunun pratik anlamı:
- `TradeState` geçişleri kontratta zorunlu kılınır; backend yalnızca yansıtır.
- Tier limiti, teminat BPS'leri, maksimum tutarlar, anti-sybil kapıları ve decay matematiği kontrat sabitlerinden gelir.
- Backend bir UX yüzeyi sağlar ama kontratın reddettiği bir akışı “geçerli” hale getiremez.
- Mimari uyuşmazlıklarda **kontrat gerçekliği esas alınır**; backend mirror alanları en fazla cache / görüntüleme kolaylığıdır.
- Event adları, Mongo aynaları, route cevapları ve analitik özetler **yardımcı yorum katmanlarıdır**; kontrat storage'ı ve state-changing fonksiyonlarıyla çelişiyorsa otorite sayılmaz.

---

## 3. Sistem Katılımcıları

| Rol | Etiket | Yetenekler | Kısıtlamalar |
|---|---|---|---|
| **Maker** | Satıcı | İlan açar. USDT + Teminat kilitler. Serbest bırakabilir, itiraz edebilir, iptal önerebilir. | Kendi ilanında Taker olamaz. Teminat işlem çözülene kadar kilitli kalır. |
| **Taker** | Alıcı | Fiat'ı off-chain gönderir. Taker Teminatı kilitler. Ödeme bildirebilir, iptal onaylayabilir. | Anti-Sybil filtrelerine tabidir. Yasak/ban kapısı yalnız taker girişinde uygulanır. |
| **Hazine** | Protokol | %0.2 başarı ücreti + eriyip/yanan fonları alır. | İlk adres deploy sırasında verilir; ancak kontrat sahibi `setTreasury()` ile güncelleyebilir. Backend tek başına değiştiremez. |
| **Backend** | Relayer | Şifreli PII'yı depolar, emir defterini indeksler, JWT yayınlar, API sunar. | Kullanıcı fonları için custody anahtarı yoktur; operasyonel signer olabilir. Kullanıcı fonlarını hareket ettiremez. On-chain durumu değiştiremez. |

---

## 4. Tier ve Teminat Sistemi

5 kademeli sistem **"Soğuk Başlangıç" sorununu** çözer: yeni cüzdanlar yüksek hacimli işlemlere anında erişemez, böylece deneyimli kullanıcılar test edilmemiş karşı taraflardan korunur. Tüm teminat sabitleri on-chain zorunlu kılınmıştır ve backend tarafından değiştirilemez.

### Tier Tanımları

> **YENİ KURAL:** Bir kullanıcı, yalnızca mevcut efektif tier seviyesine eşit veya daha düşük seviyedeki ilanları açabilir veya bu ilanlara alım emri verebilir.

| Tier | Kripto Limiti (USDT/USDC) | Maker Teminatı | Taker Teminatı | Cooldown | **Erişim İçin Gerekli İtibar (On-Chain Zorunlu)** |
|---|---|---|---|---|---|
| **Tier 0** | Maksimum 150 USDT | %0 | %0 | 4 saat / işlem | **Varsayılan:** Tüm yeni kullanıcılar buradan başlar. |
| **Tier 1** | Maksimum 1.500 USDT | %8 | %10 | 4 saat / işlem | ≥ 15 başarılı işlem, 15 gün aktiflik, **≤ 2 başarısız uyuşmazlık** |
| **Tier 2** | Maksimum 7.500 USDT | %6 | %8 | Sınırsız | ≥ 50 başarılı işlem, **≤ 5 başarısız uyuşmazlık** |
| **Tier 3** | Maksimum 30.000 USDT | %5 | %5 | Sınırsız | ≥ 100 başarılı işlem, **≤ 10 başarısız uyuşmazlık** |
| **Tier 4** | Limitsiz (30.000+ USDT) | %2 | %2 | Sınırsız | ≥ 200 başarılı işlem, **≤ 15 başarısız uyuşmazlık** |

Not: Limitler Kur Manipülasyonunu (Rate Manipulation) engellemek adına tamamen Kripto varlık (USDT/USDC) üzerinden hesaplanır. Fiat (TRY/USD) kurları limit belirlemede dikkate alınmaz.

### Kontrat Tarafından Zorlanan Tier Gerçekliği

Kontrat, frontend veya backend varsayımlarına güvenmez; aşağıdaki kuralları doğrudan `createEscrow()` ve `lockEscrow()` içinde zorlar:

- `createEscrow()` için istenen tier, maker'ın **efektif tier** değerinden yüksek olamaz.
- `lockEscrow()` için taker'ın efektif tier'ı trade tier'ını karşılamalıdır.
- Tier 0–3 için maksimum escrow tutarı on-chain sabittir; Tier 4 bilinçli olarak sınırsızdır.
- `GOOD_REP_DISCOUNT_BPS` ve `BAD_REP_PENALTY_BPS` maker/taker bond hesabına kontrat içinde uygulanır.
- `listingRef == bytes32(0)` olan escrow oluşturma çağrıları doğrudan revert eder; kanonik olmayan create yolu kabul edilmez.

### Efektif Tier Hesaplaması

Bir kullanıcının işlem yapabileceği maksimum tier, iki değerin **en düşüğü** alınarak belirlenir:
1.  **İtibar Bazlı Tier:** Yukarıdaki tabloya göre kullanıcının `successfulTrades` ve `failedDisputes` sayılarına göre ulaştığı en yüksek tier.
2.  **Ceza Bazlı Tier Tavanı (`maxAllowedTier`):** Ardışık yasaklamalar sonucu uygulanan tier düşürme cezası.

Örnek: Bir kullanıcı normalde Tier 3 için yeterli itibara sahip olsa bile, eğer bir ceza sonucu `maxAllowedTier` değeri 1'e düşürülmüşse, bu kullanıcı yalnızca Tier 0 ve Tier 1 işlemleri yapabilir.

Ek kontrat kuralı: Kullanıcı başarı sayısıyla Tier 1+ eşiğine ulaşmış olsa bile, ilk başarılı işleminin üzerinden en az **15 gün** (`MIN_ACTIVE_PERIOD`) geçmeden efektif tier'ı 0'ın üstüne çıkamaz. Yani performans tek başına yeterli değildir; zaman bileşeni de kontrat tarafından zorlanır.

### İtibar Temelli Teminat Düzenleyicileri

Tier 1–4 için temel teminat oranlarının üzerine uygulanır (Tier 0'a uygulanmaz):

| Koşul | Etki |
|---|---|
| 0 başarısız uyuşmazlık + en az 1 başarılı işlem | −%1 teminat indirimi (temiz geçmiş ödülü) |
| 1 veya daha fazla başarısız uyuşmazlık | +%3 teminat cezası |

---

## 5. Anti-Sybil Kalkanı

Her `lockEscrow()` çağrısından önce dört on-chain filtresi çalışır. Backend bunları **atlayamaz veya geçersiz kılamaz.**

| Filtre | Kural | Amaç |
|---|---|---|
| **Kendi Kendine İşlem Engeli** | `msg.sender ≠ maker adresi` | Kendi ilanlarında sahte işlemi engeller |
| **Cüzdan Yaşı** | Kayıt ≥ ilk işlemden 7 gün önce | Yeni oluşturulan Sybil cüzdanlarını engeller |
| **Dust Limiti** | Yerel bakiye ≥ `0.001 ether` | Sıfır bakiyeli tek kullanımlık cüzdanları engeller |
| **Tier 0 / 1 Cooldown** | Maksimum 4 saatte 1 işlem | Düşük teminatlı tierlerde bot ölçekli spam saldırısını sınırlar |
| **Challenge Ping Cooldown** | `PAID` durumundan sonra `pingTakerForChallenge` için ≥ 24 saat beklemek zorunlu | Hatalı itirazları ve anlık tacizi önler |
| **Ban Kapısı (yalnız taker rolü)** | `notBanned` sadece `lockEscrow()` girişinde uygulanır | Yasaklı cüzdanın alıcı rolünde yeni trade'e girmesini engeller; maker rolünü veya mevcut trade kapanışlarını tek başına dondurmaz |

### İlgili Kontrat Fonksiyonları

| Fonksiyon | Açıklama |
|---|---|
| `registerWallet()` | Bir cüzdanın, 7 günlük "cüzdan yaşlandırma" sürecini başlatmasını sağlar. `lockEscrow` fonksiyonundaki Anti-Sybil kontrolü için zorunludur. |
| `antiSybilCheck(address)` | `aged`, `funded` ve `cooldownOk` alanlarını döndüren bilgi amaçlı bir `view` helper'ıdır. Bu fonksiyon UX ve ön-bilgilendirme içindir; bağlayıcı karar yine `lockEscrow()` içinde alınır. |
| `getCooldownRemaining(address)` | Cooldown penceresinde kalan süreyi döndürür. Kullanıcıya "ne kadar beklemeliyim?" bilgisini vermek için yararlıdır; cooldown kuralını kendisi uygulamaz. |

---

## 6. Standart İşlem Akışı (Happy Path)

```
Maker createEscrow() çağırır
  → AÇIK (USDT + Maker Teminatı on-chain kilitlenir)
    → Taker lockEscrow() — Anti-Sybil geçer
      → KİLİTLİ (Taker Teminatı on-chain kilitlenir)
        → Taker reportPayment() + IPFS makbuz hash'i
          → ÖDENDİ (48 saatlik Grace Period zamanlayıcısı on-chain başlar)
            → Maker releaseFunds() çağırır
              → ÇÖZÜLDÜ ✅ (%0.2 ücret kesilir, fonlar dağıtılır)
```

### Durum Tanımları

| Durum | Tetikleyen | Açıklama |
|---|---|---|
| `OPEN` (Açık) | Maker `createEscrow()` | İlan yayında. USDT + Maker teminatı on-chain kilitli. |
| `LOCKED` (Kilitli) | Taker `lockEscrow()` | Anti-Sybil geçti. Taker teminatı on-chain kilitli. |
| `PAID` (Ödendi) | Taker `reportPayment()` | IPFS makbuz hash'i on-chain kaydedildi. 48 saatlik zamanlayıcı başladı. |
| `RESOLVED` (Çözüldü) | Maker `releaseFunds()` | %0.2 ücret alındı. USDT → Taker. Teminatlar iade edildi. |
| `CANCELED` (İptal) | 2/2 EIP-712 imzası | **LOCKED durumunda:** Ücret yok, tam iade. **PAID veya CHALLENGED durumunda:** Kalan miktarlar üzerinden %0.2 protokol ücreti kesilir, net tutar iade edilir. Her iki durumda itibar cezası uygulanmaz. |
| `BURNED` (Yakıldı) | 240 saattan sonra `burnExpired()` | Tüm kalan fonlar → Hazine. |

### İlan Yaşam Döngüsü (Off-Chain Vitrin + On-Chain Otorite)

1. Maker `POST /api/listings` çağrısı yapar.
2. Backend, session wallet eşleşmesini ve on-chain `effectiveTier` değerini doğrular.
3. İlan MongoDB'de önce `PENDING` oluşturulur; `listing_ref` deterministik olarak türetilir.
4. Frontend/kontrat akışı `EscrowCreated` olayını üretir.
5. Event listener ilgili kaydı `OPEN` durumuna geçirir ve vitrine görünür hale getirir.
6. Eğer ilan on-chain'e hiç düşmezse, cleanup job 12 saat sonra kaydı `DELETED` durumuna süpürür.

Bu akış, pazar yeri vitrininin hızlı kalmasını sağlarken otoriteyi yine zincirde bırakır; backend tek başına "gerçek" açık ilan uydurmaz.

### Kanonik Oluşturma Yolu ve Pause Semantiği

Kontratta escrow oluşturmanın tek geçerli yolu `createEscrow(token, amount, tier, listingRef)` çağrısıdır. Legacy üç parametreli overload artık bilinçli olarak `InvalidListingRef()` ile revert eder. Böylece kimliksiz / canonical bağdan kopuk escrow üretilemez.

Ayrıca `pause()` durumu tüm sistemi dondurmaz:
- **Yeni** `createEscrow()` ve `lockEscrow()` çağrıları durur.
- Mevcut işlemler için `releaseFunds`, `autoRelease`, `proposeOrApproveCancel`, `burnExpired` gibi kapanış yolları açık kalır.

Bu tercih, emergency modda yeni risk alınmasını engellerken canlı trade'lerin kilitli kalıp kullanıcıları sonsuza kadar hapsetmesini önler.

### Ücret Modeli

- **Taker ücreti:** Taker'ın aldığı USDT'den %0,1 kesilir
- **Maker ücreti:** Maker'ın teminat iadesinden %0,1 kesilir
- **Toplam:** Başarıyla çözülen her işlemde %0,2
- **İptal edilen işlemler:** Karşılıklı iptal (CANCELED) durumunda, varsa kanamadan (decay) kurtulan net tutar üzerinden de standart protokol ücreti alınır.

### Event Semantiği İçin Kontrat Notu

Kontrat bazı event adlarını birden fazla ekonomik yol için yeniden kullanır:
- `EscrowReleased` hem `releaseFunds()` hem de `autoRelease()` içinde emit edilir; ancak event alanları ikinci durumda standart başarı ücretini değil **ihmal cezalarını** temsil eder.
- `EscrowCanceled` hem `cancelOpenEscrow()` hem de karşılıklı iptal `_executeCancel()` yolunda emit edilir; ekonomik bağlam aynı değildir.

Bu yüzden backend analitiği veya event mirror'u yalnız event adına bakarak iş kararı veremez; ilgili önceki state ve çağrı yolu da dikkate alınmalıdır.

### İlgili Kontrat Fonksiyonları

| Fonksiyon | Açıklama |
|---|---|
| `createEscrow(...)` | Maker'ın bir ilan oluşturmasını ve fonları kilitlemesini sağlar. |
| `lockEscrow(tradeId)` | Taker'ın bir ilana girmesini ve teminatını kilitlemesini sağlar. |
| `reportPayment(tradeId, ipfsHash)` | Taker'ın ödemeyi yaptığını bildirmesini sağlar. |
| `releaseFunds(tradeId)` | Maker'ın ödemeyi onaylayıp fonları serbest bırakmasını sağlar. |
| `cancelOpenEscrow(tradeId)` | Sadece Maker'ın çağırabildiği, henüz bir Taker tarafından kilitlenmemiş (`OPEN` durumdaki) bir ilanı iptal etmesini ve kilitlediği tüm fonları geri almasını sağlar. |
| `getTrade(tradeId)` | Belirtilen `tradeId`'ye sahip işlemin tüm detaylarını (`Trade` struct) döndüren bir `view` fonksiyonudur. |

**Önemli kontrat sınırı:** `reportPayment()` on-chain tarafta `ipfsHash` için yalnızca **boş olmama** kontrolü yapar. CID biçimi / içerik doğrulaması kontrat garantisi değildir; bu hijyen katmanı backend mirror ve route doğrulamalarında sağlanır.

---

## 7. Uyuşmazlık Sistemi — Bleeding Escrow

Araf Protokolünde hakem yoktur. Bunun yerine, uzun süreli uyuşmazlıkları matematiksel olarak pahalıya mal eden **asimetrik zaman çürümesi mekanizması** kullanılır. Bir taraf ne kadar uzun süre iş birliği yapmayı reddederse, o kadar çok kaybeder.

### Tam Durum Makinesi

```
ÖDENDİ
  │
  ├──[Maker Serbest Bırak'a basar]──────────────── ÇÖZÜLDÜ ✅
  ├──[48 saat geçti, Taker 'pingMaker'e basar] → [24 saat daha geçti, Taker 'autoRelease'e basar]
  │   └── ÇÖZÜLDÜ ✅ (Maker'a +1 Başarısız itibar, her iki teminattan %2 ihmal cezası)
  │
  └──[24 saat geçti, Maker 'pingTakerForChallenge'e basar] → [24 saat daha geçti, Maker 'challengeTrade'e basar]
      │
    İTİRAZ AÇILDI
        GRACE PERIOD (48 saat) — mali ceza yok
        ├──[Müşterek İptal (2/2 EIP-712)]────────── İPTAL 🔄
        ├──[Karşılıklı Serbest Bırakma]──────────── ÇÖZÜLDÜ ✅
        │
        └──[48 saat sonra anlaşma yok]
                    │
                KANAMA ⏳ (özerk on-chain çürüme)
                ├── Taker teminatı: 42 BPS/saat
                ├── Maker teminatı: 26 BPS/saat
                ├── Escrowed kripto: 34 BPS/saat (Kanama'nın 96. saatinde başlar)
                │
                ├──[İstediği zaman serbest bırakma]── ÇÖZÜLDÜ ✅ (kalan fonlar)
                ├──[İptal (2/2)]──────────────────── İPTAL 🔄 (kalan fonlar)
                └──[240 saat geçti — anlaşma yok]
                          │
                        YAKILD 💀 (tüm fonlar → Hazine)
```

### Karşılıklı Dışlayıcı Ping Yolları

Kontrat iki ayrı liveness yolu tanımlar ve bunların aynı anda açılmasına izin vermez:

- **Maker yolu:** `pingTakerForChallenge()` → 24 saat sonra `challengeTrade()`
- **Taker yolu:** `pingMaker()` → 24 saat sonra `autoRelease()`

Bu iki yol `ConflictingPingPath` hatasıyla birbirini dışlar. Yani maker challenge penceresini açtıysa taker aynı trade üzerinde auto-release ping yolu başlatamaz; taker auto-release yolunu açtıysa maker sonradan challenge ping yoluna geçemez. Bu, aynı trade için iki çelişkili zorlayıcı çözüm hattının paralel açılmasını önler.

### Kanama Çürüme Oranları

| Varlık | Taraf | Oran | Başlangıç |
|---|---|---|---|
| **Taker Teminatı** | Taker (itiraz açan) | 42 BPS / saat (~günde %10,1) | Kanama'nın 0. saati |
| **Maker Teminatı** | Maker | 26 BPS / saat (~günde %6,2) | Kanama'nın 0. saati |
| **Escrowed Kripto** | Trade'in ana escrow tutarı | 34 BPS / saat (~günde %8,2) | Kanama'nın 96. saati |

> Bleeding decay tek kalemli değildir. Kontrat; **maker bond** için 26 BPS/saat, **taker bond** için 42 BPS/saat ve **escrowed crypto** için 34 BPS/saat uygular. `totalDecayed`, bu üç bileşenin toplamıdır.

> **USDT neden Kanama'nın 96. saatinde (itirazdaki 144. saatte) başlar?**
> 48 saatlik grace period + hafta sonu banka gecikmelerine karşı 96 saatlik tampon. Dürüst tarafları anında zarar görmekten korurken aciliyeti sürdürür.

### Müşterek İptal (EIP-712)

Her iki taraf da `LOCKED`, `PAID` veya `CHALLENGED` durumunda karşılıklı çıkış önerebilir. Ancak kontrat modeli, backend'in iki imzayı toplayıp üçüncü bir taraf adına tek seferde submit ettiği bir batch yol değildir. Her taraf kendi EIP-712 imzasını üretir ve **kendi hesabıyla** `proposeOrApproveCancel()` çağrısını yapar. Backend bu akışta yalnız koordinasyon, audit ve UX kolaylaştırıcı rol üstlenir.

Ekonomik sonuç kontrat içinde `_executeCancel()` ile belirlenir:
- erimiş (`decayed`) kısım önce hazineye gider,
- `PAID` / `CHALLENGED` durumlarında standart protokol ücretleri uygulanır,
- kalan net tutarlar iade edilir,
- ek itibar cezası yazılmaz.

İmza tipi: `CancelProposal(uint256 tradeId, address proposer, uint256 nonce, uint256 deadline)`

Önemli kontrat gerçeği: `sigNonces` sayaçları **cüzdan başına globaldir**. Bu nedenle off-chain saklanan bir cancel imzası, aynı cüzdanın başka bir trade üzerinde onay vermesi veya önceki bir cancel çağrısının başarıyla işlenmesi sonrası bayatlayabilir. İmza deposu otorite değildir; son geçerlilik kontrolü her zaman kontrat nonce'ı ile yapılmalıdır.

### `autoRelease` ve İhmal Cezası

Taker, `pingMaker` fonksiyonunu çağırdıktan 24 saat sonra hala yanıt alamaması durumunda `autoRelease` fonksiyonunu çağırarak fonları tek taraflı serbest bırakabilir. Bu durumda standart işlem ücreti yerine, hem Maker'ın hem de Taker'ın teminatından **%2'lik bir ihmal cezası** (`AUTO_RELEASE_PENALTY_BPS`) kesilir ve Hazine'ye aktarılır. Bu mekanizma, Taker'ın da süreci zorla sonlandırmasının küçük bir maliyeti olmasını sağlayarak sistemi dengeler ve Maker'a karşı kötüye kullanımı caydırır.

### İlgili Kontrat Fonksiyonları

| Fonksiyon | Açıklama |
|---|---|
| `pingTakerForChallenge(tradeId)` | Maker'ın, itiraz etmeden önce Taker'a "ödeme gelmedi" uyarısı göndermesini sağlar. `challengeTrade` için zorunlu bir ön koşuldur. |
| `challengeTrade(tradeId)` | Maker'ın, `pingTakerForChallenge`'dan 24 saat sonra bir işleme itiraz ederek "Bleeding Escrow" fazını başlatmasını sağlar. |
| `pingMaker(tradeId)` | Taker'ın, 48 saatlik `GRACE_PERIOD` dolduktan sonra pasif kalan Maker'a "hayat sinyali" göndermesini sağlar. Bu, `autoRelease` fonksiyonunu çağırmak için bir ön koşuldur. **Not:** ConflictingPingPath hatasını önlemek için Maker ilk uyarıyı (`pingTakerForChallenge`) yaptıysa bu fonksiyon kullanılamaz. |
| `autoRelease(tradeId)` | Taker'ın, `pingMaker`'dan 24 saat sonra hala yanıt vermeyen Maker'a karşı fonları tek taraflı serbest bırakmasını sağlar. |
| `proposeOrApproveCancel(...)` | Tarafların EIP-712 imzasıyla müşterek iptal teklif etmesini veya onaylamasını sağlar. |
| `burnExpired(tradeId)` | 10 günlük kanama süresi dolan işlemlerdeki tüm fonların Hazine'ye aktarılmasını sağlar. Sadece `CHALLENGED` durumunda çalışır ve `onlyOwner`/taraf kısıtı yoktur; timeout dolduktan sonra **permissionless** sonlandırma yoludur. |
| `getCurrentAmounts(tradeId)` | Bir uyuşmazlık durumunda, "Bleeding Escrow" mekanizması sonrası anlık olarak kalan kripto ve teminat miktarlarını hesaplayıp döndüren bir `view` fonksiyonudur. |

`getCurrentAmounts()` özellikle frontend simülasyonu, analitik ve üçüncü taraf doğrulaması için önemlidir: backend mirror'ın hesapladığı bir tahmin değil, kontratın o andaki ekonomik durumunu doğrudan verir.

---

## 8. İtibar ve Ceza Sistemi

### İtibar Güncelleme Mantığı

| Sonuç | Maker | Taker |
|---|---|---|
| Uyuşmazlıksız kapanış (ÇÖZÜLDÜ) | +1 Başarılı | +1 Başarılı |
| Maker itiraz etti → sonra serbest bıraktı (S2) | +1 Başarısız | +1 Başarılı |
| `autoRelease` — Maker 48 saat pasif kaldı | +1 Başarısız | +1 Başarılı |
| YAKILDI (10 günlük timeout) | +1 Başarısız | +1 Başarısız |

### Yasak ve Ardışık Eskalasyon

**Tetikleyici:** İlk ban, kullanıcı `failedDisputes >= 2` eşiğine ulaştığında başlar. Bundan sonra **her ek başarısız uyuşmazlık**, `consecutiveBans` sayacını tekrar artırır ve yeni/uzatılmış ban-escalation yaratır; model “her iki başarısızlıkta bir” değil, eşik aşıldıktan sonra **her yeni başarısızlıkta yeniden cezalandırma** mantığıyla çalışır. Yasak **yalnızca Taker'a** uygulanır — kontrattaki `notBanned` modifier'ı sadece `lockEscrow()` üzerinde durur. Yani yasaklı bir cüzdan yeni bir trade'e alıcı olarak giremez; ancak maker olarak ilan açması veya mevcut trade'lerini kapatması bu modifier nedeniyle otomatik engellenmez.

| Yasak Sayısı | Süre | Tier Etkisi | Notlar |
|---|---|---|---|
| 1. yasak | 30 gün | Tier değişimi yok | `consecutiveBans = 1` |
| 2. yasak | 60 gün | `maxAllowedTier −1` | `consecutiveBans = 2` |
| 3. yasak | 120 gün | `maxAllowedTier −1` | `consecutiveBans = 3` |
| N. yasak | 30 × 2^(N−1) gün (maks. 365) | Her yasakta `maxAllowedTier −1` (alt sınır: Tier 0) | Kalıcı on-chain hafıza |

> **Tier Tavanı Zorunluluğu:** `createEscrow()`, istenen tier > `maxAllowedTier` ise revert eder.
> Örnek: Tier 3 cüzdan 2. yasağı alır → `maxAllowedTier` 2'ye düşer. Tier 3 veya Tier 4 ilan açamaz.

### Otoritatif İtibar Notu

İtibarın bağlayıcı kaynağı kontrattaki `reputation` mapping'idir. Backend'deki `reputation_cache` ve `reputation_history` alanları yalnız aynalama / analitik amaçlıdır.

Dikkat edilmesi gereken önemli nokta: kontrat mantığında `CHALLENGED` durumundan `releaseFunds()` ile çıkılırsa `makerOpenedDispute = true` kabul edilir ve **maker başarısız uyuşmazlık** alır. Backend event mirror'ında bu akışın bazı yorum katmanları farklı işaretlenmiş olabilir; mimari otorite kontrattır.

Ayrıca `ReputationUpdated` event'i `consecutiveBans` veya `maxAllowedTier` değerlerini doğrudan taşımaz; bu alanlar kontrat storage'ında vardır ama event payload'ı sınırlıdır. Off-chain kullanıcı aynası bu alanları yalnız event'lerden türetmeye çalışırsa eksik/stale kalabilir; gerektiğinde `getReputation()` ve ilişkili state alanlarıyla mutabakat yapılmalıdır.

### İlgili Kontrat Fonksiyonları

| Fonksiyon | Açıklama |
|---|---|
| `getReputation(address)` | Sınırlı bir itibar özeti döndürür: `successful`, `failed`, `bannedUntil`, `consecutiveBans` ve `effectiveTier`. `hasTierPenalty`, `maxAllowedTier` veya `firstSuccessfulTradeAt` gibi tüm ilişkili state alanlarını tek başına taşımaz. |
| `getFirstSuccessfulTradeAt(address)` | Tier yükselişinin zaman bileşenini açıklamak için ilk başarılı işlemin zamanını döndürür. `MIN_ACTIVE_PERIOD` kuralının ne zaman dolacağını frontend ve analitik katmanı buradan görünür kılabilir. |
| `decayReputation(address)` | "Temiz Sayfa" kuralını on-chain'de uygular. Bir kullanıcının son yasağının üzerinden 180 gün geçtiyse, `consecutiveBans` sayacını sıfırlar, `hasTierPenalty` bayrağını kaldırır ve `maxAllowedTier` değerini tekrar 4'e çeker. Bu yol `onlyOwner` değildir; izinli bir admin değil, **permissionless bakım çağrısı** olarak tasarlanmıştır. Kullanıcının kendisi, backend relayer'ı veya herhangi bir üçüncü taraf uygun koşul oluştuğunda çağırabilir. |

---

## 9. Güvenlik Mimarisi

### 9.1 Kimlik Doğrulama Akışı (SIWE + JWT)

| Adım | Aktör | İşlem | Güvenlik Özelliği |
|---|---|---|---|
| 1 | Frontend | `GET /api/auth/nonce` | Nonce Redis'te 5 dakika TTL ile saklanır |
| 2 | Kullanıcı | Cüzdanda EIP-4361 SIWE mesajı imzalar | `siwe.SiweMessage` sınıfı ile standart format |
| 3 | Frontend | `POST /api/auth/verify` — mesaj + imza | Nonce atomik olarak tüketilir (`getDel` — tekrar korumalı) |
| 4 | Backend | SIWE imzasını doğrular, `type: "auth"` JWT üretir | Auth JWT yalnızca httpOnly `araf_jwt` cookie'sine yazılır; normal auth için Bearer fallback kapalıdır |
| 5 | Backend | Korumalı rotalar `requireAuth` ile cookie'den JWT okur | JWT blacklist / `jti` kontrolü her istekte çalışır |
| 6 | Backend | Gerekli rotalar `requireSessionWalletMatch` ile `x-wallet-address` başlığını doğrular | Header tek başına auth kaynağı değildir; cookie'deki wallet ile eşleşme zorunludur |
| 7 | Backend | Uyuşmazlıkta session invalidation uygulanır | Refresh token ailesi revoke edilir, `araf_jwt` ve `araf_refresh` temizlenir, `409 SESSION_WALLET_MISMATCH` döner |
| 8 | Backend | PII erişimi ayrı `type: "pii"` token ile yapılır | `requirePIIToken` yalnızca Bearer authorization kabul eder; token trade-scoped ve kısa ömürlüdür |

**Route düzeyi otorite sınırı**
- `GET /api/auth/me`, artık yalnızca "geçerli cookie var mı" kontrolü yapan pasif bir session probe değildir. Frontend `x-wallet-address` gönderirse, bu değer normalize edilip cookie içindeki `req.wallet` ile karşılaştırılır.
- Uyuşmazlık halinde backend aktif olarak session sonlandırır: `araf_jwt` ve `araf_refresh` temizlenir, refresh token ailesi revoke edilir ve `409 SESSION_WALLET_MISMATCH` döner. Böylece `/me`, wallet/session authority boundary'nin parçası olur.
- `POST /api/auth/logout`, mevcut JWT'yi blacklist'e alır, refresh token ailesini iptal eder ve cookie'leri temizler; logout sadece istemci taraflı bir UI reseti değildir.

**Profil güncelleme akışı**
- `PUT /api/auth/profile`, `requireAuth` + `requireSessionWalletMatch` + `authLimiter` ile korunur; yani hem geçerli cookie session hem de bağlı cüzdan eşleşmesi gerekir.
- Route, `bankOwner`, `iban`, `telegram` alanlarını normalize eder; Joi ile doğrular; ardından `encryptPII()` çağırarak yalnızca şifreli alanları (`pii_data.*_enc`) MongoDB'ye yazar.
- Plaintext PII kalıcı olarak saklanmaz; route katmanı yalnızca kısa ömürlü validation/normalization yüzeyi olarak çalışır.

**SIWE servis otoritesi ve token politikası**
- `getSiweConfig()` production'da gevşek fallback kabul etmez: `SIWE_DOMAIN` ve `SIWE_URI` zorunludur; `SIWE_URI` mutlaka `https` olmalı ve host değeri `SIWE_DOMAIN` ile birebir eşleşmelidir. Böylece imza mesajında farklı origin/domain kullanılarak session elde edilmesi engellenir.
- `generateNonce()` Redis'i nonce için **tek otorite** kabul eder. Aynı cüzdan için eşzamanlı iki istek yarışırsa, `SET NX` başarısız olan taraf kendi yerel nonce'ını döndürmez; Redis'te gerçekten yaşayan nonce'ı tekrar okuyup onu döndürür. Bu sayede frontend'e verilen nonce ile Redis'te doğrulanacak nonce drift etmez.
- `consumeNonce()` `getDel` semantiğiyle çalışır; nonce tek kullanımlıktır ve başarılı/başarısız verify denemesi sonrası yeniden kullanılamaz.
- `verifySiweSignature()`, imzayı doğrulamadan önce domain/origin eşleşmesini ve nonce bütünlüğünü kontrol eder; sonra `SiweMessage.verify()` ile imza doğrular. Böylece önce context, sonra kriptografik doğrulama zinciri kurulmuş olur.
- `JWT_SECRET` yalnızca tanımlı olmakla yetmez; minimum uzunluk, placeholder yasakları ve Shannon entropy kontrolünden geçmelidir. Secret yeterince güçlü değilse servis başlangıçta fail eder.
- JWT blacklist kontrolü Redis erişim hatasında ortama göre fail-mode uygular: production'da varsayılan **fail-closed**, geliştirmede varsayılan **fail-open**. Bu seçim `JWT_BLACKLIST_FAIL_MODE` ile override edilebilir.
- Refresh token'lar tekil değerler halinde değil **family** mantığıyla yönetilir. Normal rotasyonda kullanılan token tek seferlik tüketilir ve aynı aile içinde yeni token üretilir; reuse / geçersiz token denemesinde ilgili wallet'ın tüm aileleri kapatılır.
- `revokeRefreshToken(wallet)` tek bir token'ı değil, o cüzdana ait tüm aktif refresh ailelerini temizler. Böylece logout, session mismatch veya güvenlik ihlali sonrası backend tarafında kalıntı refresh yolu bırakılmaz.


### 9.2 Müşterek İptal Akışı (EIP-712 ile Gassız Anlaşma)

Protokol, tarafların on-chain bir işlem yapmadan (ve gas ödemeden) anlaşmaya varmalarını sağlamak için **EIP-712** standardını kullanır. Bu, özellikle "Müşterek İptal" senaryosunda kritik bir rol oynar.

**EIP-712 Nedir?** Kullanıcıların cüzdanlarında anlamsız onaltılık dizeler yerine, insan tarafından okunabilir, yapılandırılmış verileri imzalamalarına olanak tanır. Bu, güvenlik ve kullanıcı deneyimi açısından büyük bir adımdır.

**Akış Adım Adım (kontrat gerçekliği):**

1.  **Teklif (Frontend):** Bir kullanıcı (örn: Maker) "İptal Teklif Et" butonuna tıklar.
2.  **Veri Yapılandırma (Frontend):** Arayüz, `CancelProposal(uint256 tradeId, address proposer, uint256 nonce, uint256 deadline)` yapısını on-chain verilerle doldurur.
    *   `tradeId`: Mevcut işlemin ID'si.
    *   `proposer`: çağrıyı yapacak cüzdanın adresi.
    *   `nonce`: `ArafEscrow.sol` kontratındaki `sigNonces(proposer)` değeridir. Bu sayaç her başarılı on-chain cancel çağrısından sonra artar.
    *   `deadline`: İmzanın geçerli olacağı son zaman damgası; kontrat ayrıca bunu **en fazla 7 gün ileriye** izin verecek şekilde sınırlar.
3.  **İmzalama (Kullanıcı Cüzdanı):** Kullanıcı, kendi hesabı için yapılandırılmış veriyi imzalar.
4.  **Koordinasyon (Backend / Frontend):** İmza ve deadline bilgisi `POST /api/trades/propose-cancel` ile off-chain saklanabilir; bu adım UX/koordinasyon katmanıdır.
5.  **İlk On-Chain Onay:** İmzalayan taraf **kendi hesabıyla** `proposeOrApproveCancel(tradeId, deadline, sig)` çağrısını yapar. Kontrat `ECDSA.recover` ile adresi kurtarır ve `recovered == msg.sender` eşleşmesini zorlar.
6.  **İkinci On-Chain Onay:** Karşı taraf da **kendi hesabıyla** aynı trade için kendi imzasını göndererek aynı fonksiyonu çağırır.
7.  **Nihai Yürütme (Kontrat):** İkinci onay geldiğinde kontrat iki boolean bayrağın (`cancelProposedByMaker`, `cancelProposedByTaker`) da `true` olduğunu görür ve `_executeCancel()` ile işlemi `CANCELED` durumuna geçirir.

**Önemli düzeltme:** Mevcut kontrat, iki imzayı backend'de toplayıp tek transaction ile üçüncü bir relayer'ın submit ettiği bir batch-cancel yolu sunmaz. Kanonik model, her tarafın kendi hesabıyla ayrı on-chain onay vermesidir. Bu nedenle backend'de tutulan imzalar tek başına iptali finalize etmez; yalnız koordinasyon ve UX kolaylığı sağlar.

Kontratın cancel doğrulama zinciri şunları zorlar:
- trade state yalnız `LOCKED`, `PAID` veya `CHALLENGED` olabilir
- `deadline` geçmemiş olmalıdır
- `deadline`, `block.timestamp + MAX_CANCEL_DEADLINE` tavanını aşamaz
- imza `msg.sender` ile birebir eşleşmelidir
- başarılı çağrıdan sonra `sigNonces[msg.sender]` artırılır ve replay engellenir

Önemli kontrat gerçeği: `sigNonces` sayaçları **cüzdan başına globaldir**. Bu nedenle backend'de saklanan bir mutual-cancel imzası, aynı cüzdanın başka bir trade için cancel imzası kullanmasıyla veya aynı trade üzerinde daha önce başarılı bir on-chain onay vermesiyle bayatlayabilir. Off-chain imza deposu otorite değildir; imzanın halen geçerli olup olmadığı son anda kontrat nonce'ı ile mutabakat edilmelidir.

### 9.3 PII Şifreleme (Zarf Şifreleme)

IBAN, banka sahibi adı, Telegram ve dekont payload'ı yalnızca backend tarafında AES-256-GCM ile şifreli tutulur. Düz metin PII kalıcı depoya yazılmaz. Master Key üretimde uygulama ayar dosyasından okunmaz; çalışma zamanında harici anahtar yöneticisinden çözülür/alınır ve kısa süreli bellekte tutulur. Her cüzdan için DEK, **aynı cüzdan için deterministik ama cüzdanlar arasında benzersiz** olacak şekilde HKDF (RFC 5869, SHA-256) ile türetilir.

| Özellik | Değer |
|---|---|
| Algoritma | AES-256-GCM (doğrulanmış şifreleme) |
| Anahtar Türetme | Node.js native `crypto.hkdf()` ile HKDF (SHA-256, RFC 5869 tam uyum) |
| Salt Politikası | Sıfır-salt değil; `wallet` bağımlı deterministik salt (`sha256("araf-pii-salt-v1:<wallet>")`) |
| DEK Kapsamı | Cüzdan başına deterministik DEK — depolanmaz, ihtiyaç anında yeniden türetilir |
| Ciphertext Formatı | `iv(12B) + authTag(16B) + ciphertext`, hex-encoded |
| Master Key Kaynağı | Development: `.env` (`KMS_PROVIDER=env`) / Production: **AWS KMS** veya **HashiCorp Vault** |
| Production Koruması | `NODE_ENV=production` iken `KMS_PROVIDER=env` bilinçli olarak engellenir |
| Master Key Cache | KMS/Vault çağrı maliyetini azaltmak için bellek içi kısa ömürlü cache; shutdown/rotation'da zero-fill ile temizlenir |
| IBAN Erişim Akışı | Auth JWT → PII token (15 dk, işlem kapsamlı) → **anlık trade statü kontrolü** → şifre çözme |

**Anahtar yönetimi ve operasyon politikası**
- `_getMasterKey()` bir sağlayıcı soyutlamasıdır: `env` yalnızca geliştirme içindir; üretimde `aws` veya `vault` beklenir.
- AWS KMS modunda uygulama, şifreli data key'i runtime'da KMS `Decrypt` ile çözer; plaintext key yalnızca proses belleğinde yaşar.
- Vault modunda uygulama, Transit / datakey uç noktasından plaintext master key alır; yine yalnızca proses belleğinde tutulur.
- Master key her encrypt/decrypt çağrısında tekrar tekrar uzaktan alınmaz; performans için cache'lenir. Ancak bu cache kalıcı değildir; restart veya `clearMasterKeyCache()` çağrısıyla silinir.
- DEK kullanım penceresi `_withDataKey()` ile daraltılır; operasyon bitince türetilen anahtar buffer'ı `fill(0)` ile sıfırlanır.
- HKDF implementasyonu önceki özel/elle yazılmış türetme mantığı yerine native `crypto.hkdf()`'e taşınmıştır. Bu, şifreleme formatı ve türetme zinciri açısından **migrasyon etkisi** doğurur; eski ciphertext'ler için yeniden şifreleme planı gerekebilir.
- Cüzdan formatı normalize edilmeden türetme veya şifre çözme yapılmaz; büyük/küçük harf varyasyonları ayrı anahtar uzaylarına dönüşmez.

**PII route otorite kuralları**
- `GET /api/pii/my`, yalnızca kullanıcının kendi `pii_data` alanını çözer; erişim `piiLimiter` ile sınırlandırılır ve loglarda tam cüzdan yerine kısaltılmış kimlik kullanılır.
- `POST /api/pii/request-token/:tradeId`, yalnızca **taker** tarafından çağrılabilir. Token yalnızca `LOCKED`, `PAID` veya `CHALLENGED` durumlarındaki trade'ler için ihraç edilir. Böylece trade daha token alınırken aktiflik açısından doğrulanır.
- `GET /api/pii/:tradeId`, yalnızca `requirePIIToken` ile yetinmez; şifre çözmeden hemen önce trade'in **hala** `LOCKED`, `PAID` veya `CHALLENGED` durumda olup olmadığını tekrar kontrol eder. Trade `CANCELED` / `RESOLVED` / başka bir sona ermiş duruma geçtiyse token süresi dolmamış olsa bile erişim reddedilir.
- Maker'ın taker adını gördüğü `GET /api/pii/taker-name/:onchainId` endpoint'i de aynı `ALLOWED_TRADE_STATES` kümesine bağlıdır; işlem sonuçlandıktan sonra taker adı gösterilmeye devam etmez.
- PII gösteriminde öncelik `pii_snapshot` alanlarındadır. Snapshot yoksa yalnızca legacy/fallback olarak `User.pii_data` çözümlenir. Böylece trade sırasında görülen ödeme kimliği sabit kalır; kullanıcı profilini sonradan değiştirse bile bait-and-switch alanı daralır.
- Hassas yanıtlar ara katmanlar tarafından cache'lenmesin diye `Cache-Control: no-store` ve `Pragma: no-cache` başlıkları eklenir.
- PII erişim logları gözlemlenebilirlik sağlar ama tam wallet / trade / plaintext alanları kaydetmez; log yüzeyi en aza indirilir.

### 9.4 Hız Sınırlama

| Endpoint Grubu | Limit | Pencere | Anahtar |
|---|---|---|---|
| PII / IBAN | 3 istek | 10 dakika | IP + Cüzdan |
| Auth (SIWE) | 10 istek | 1 dakika | IP |
| İlanlar (okuma) | 100 istek | 1 dakika | IP |
| İlanlar (yazma) | 5 istek | 1 saat | Cüzdan |
| İşlemler | 30 istek | 1 dakika | Cüzdan |
| Geri Bildirim | 3 istek | 1 saat | Cüzdan |

**Genel yüzeyler için operasyonel karar:** Listings, trades, feedback ve benzeri public/düşük riskli yüzeylerde Redis readiness kontrolü başarısızsa limiter **fail-open** davranır; enforcement geçici olarak atlanır ama çekirdek API erişilebilir kalır.

**Auth yüzeyi için özel karar:** `/nonce`, `/verify`, `/refresh` gibi kimlik doğrulama endpoint'leri Redis yokken tamamen sınırsız bırakılmaz. Bu yüzey için IP bazlı **in-memory fallback limiter** devreye girer; eşik aşılırsa doğrudan `429` döner. Böylece genel platform availability korunurken auth yüzeyi tam fail-open olmaz.

**Dağıtım notu:** Uygulama `app.set("trust proxy", 1)` ile ters proxy arkasındaki gerçek istemci IPsini esas alacak şekilde yapılandırılmıştır. Yine de deploy topolojisinin buna uygun olması gerekir; yanlış proxy zinciri tüm kullanıcıların aynı IP kovasına düşmesine veya hukukî/audit IP hashlerinin bozulmasına yol açabilir.

**İstemci crash log yüzeyi için ayrı karar:** `POST /api/logs/client-error` endpoint'i kasıtlı olarak `requireAuth` istemez; çünkü frontend ErrorBoundary kullanıcı oturum açmadan önce de tetiklenebilir. Buna rağmen yüzey fail-open bırakılmaz:
- IP bazlı sıkı rate limit uygulanır (dakikada 10 istek)
- payload boyutu sert biçimde kırpılır (`message`, `stack`, `componentStack`, `url`)
- `message` alanı zorunludur; eksik/bot test istekleri reddedilir
- endpoint `204 No Content` döner; gözlemlenebilirlik sağlarken gereksiz response yükü üretilmez

> Not: Route içindeki açıklama Redis yoksa in-memory fallback öngörse de mevcut uygulama `express-rate-limit` limiter'ını doğrudan kullanır. Mimari dokümanda bu yüzey **kimliksiz ama sıkı sınırlandırılmış crash log endpoint'i** olarak tanımlanmıştır; gerçek fallback davranışı route uygulanışına göre ayrıca izlenmelidir.

### 9.5 Çalışma Zamanı Dayanıklılık ve Bağlantı Yönetimi

#### MongoDB

- Uygulama tek process içinde API + worker/event replay yükünü aynı havuzdan taşıyabilir; bu nedenle havuz kapasitesi düşük tutulmaz.
- `serverSelectionTimeoutMS = 5000`: Ulaşılamayan Mongo örneğinde istekler uzun süre asılı kalmaz, hatalar hızlı yüzeye çıkar.
- `socketTimeoutMS = 20000`: Reverse proxy / CDN timeout sınırının altında tutulur; kopmuş istemciye rağmen arkada çalışan uzun ömürlü sorgular azaltılır.
- `disconnected` event'i bir recoverable warning gibi ele alınmaz; süreç **fail-fast** ile kapanır. Aynı process içinde paralel reconnect, bozulmuş topology veya duplicate pool riskleri yerine temiz restart tercih edilir.

#### Redis

- Redis bağlantısı runtime'da singleton client olarak yönetilir.
- `rediss://` veya `REDIS_TLS=true` ile TLS etkinleşir; managed Redis servisleriyle uyumludur.
- `REDIS_TLS_SKIP_VERIFY=true` yalnızca self-signed geliştirme ortamları içindir; production'da kullanılmamalıdır.
- `isReady()` semantiği, Redis bağlantısının yalnızca oluşturulmuş değil gerçekten servis verebilir durumda olup olmadığını ayırt etmek için kullanılır.

### 9.5.1 Hata Yönetimi ve Güvenli Loglama

- Global error handler her istekte tek bir terminal response üretir; tanınmayan hata tiplerinde bile fallback `500` cevabı döner. Bu sayede isteklerin sonsuza kadar asılı kalması engellenir.
- `req.body` içindeki bilinen hassas alanlar (`iban`, `bankOwner`, `telegram`, `password`, `token`, `refreshToken`, `signature` ve şifreli karşılıkları) loglanmadan önce `[REDACTED]` olarak scrub edilir.
- PII scrub işlemi yalnızca production'da değil tüm ortamlarda uygulanır; geliştirme logları plaintext IBAN / isim sızıntı kanalı olarak kullanılmaz.
- Mongoose validation, duplicate key, JWT ve bilinçli `statusCode` hataları ayrı response sınıflarına ayrılır; geri kalan tüm beklenmeyen hatalar standart internal error cevabına düşer.
- Log dosyaları varsayılan olarak proje kökündeki web tarafından servis edilebilir alanlara değil, backend tarafında izole `logs/` dizinine yazılır; production'da bu dizin `LOG_DIR` ile `/var/log/...` gibi sistem seviyesinde bir konuma taşınabilir.
- Winston dosya transport'u yapılandırılmıştır; loglar tek dosyada sınırsız büyütülmez, yaklaşık 25 MB x 5 dosya rotasyonu ile tutulur. Bu, hem disk taşmasını hem de tek dosyada denetim izi kaybını sınırlandırır.
- Log dizini oluşturulamazsa uygulama tümüyle çökmez; en azından console transport ile gözlemlenebilirlik sürer. Ancak bu durum production'da kalıcı log saklama garantisi vermez ve operasyon alarmı olarak ele alınmalıdır.

### 9.5.2 Health, Readiness ve Bootstrap Kontrolleri

- `getLiveness()` en hafif health probe'dur; yalnızca prosesin yaşadığını ve zaman damgasını döndürür. Orkestratörlerin “uygulama ayakta mı?” sorusu için kullanılır; bağımlılık doğrulaması yapmaz.
- `getReadiness()` ise gerçek servislenebilirliği ölçer ve **mongo / redis / worker / provider / config / replayBootstrap** alt kontrollerini ayrı ayrı raporlar.
- Mongo readiness, `mongoose.connection.readyState === 1` ile; Redis readiness ise `isReady()` ile belirlenir. Böylece sadece client nesnesinin varlığı değil, gerçekten komut kabul eden durum esas alınır.
- Worker readiness, event worker'ın çalışır olmasıyla; provider readiness ise doğrudan `provider.getBlockNumber()` çağrısının başarıyla dönmesiyle ölçülür. Salt provider objesinin bellekte bulunması yeterli sayılmaz.
- Production'da config readiness için en az şu değişkenler zorunludur: `MONGODB_URI`, `REDIS_URL`, `JWT_SECRET`, `SIWE_DOMAIN`, `SIWE_URI`, `ARAF_ESCROW_ADDRESS`, `BASE_RPC_URL`.
- Production'da `SIWE_URI` ayrıca semantik olarak da doğrulanır: `https` olmak zorundadır ve host değeri `SIWE_DOMAIN` ile birebir eşleşmelidir. Yanlış ama “tanımlı” config hazır sayılmaz.
- Replay bootstrap readiness, worker'ın ilk nereden başlayacağını gerçekten bilip bilmediğini doğrular. Production ortamında ya Redis checkpoint (`worker:last_safe_block` / `worker:last_block`) bulunmalı ya da `ARAF_DEPLOYMENT_BLOCK` / `WORKER_START_BLOCK` tanımlı olmalıdır.
- Bu koşul sağlanmazsa servis “yarı canlı” kabul edilmez; çünkü event aynalama katmanı güvenli başlangıç bloğunu bilmeden on-chain geçmişi eksik okuyabilir.
- `BASE_WS_RPC_URL` readiness için zorunlu değildir ama `wsRecommended` sinyali olarak raporlanır; websocket provider gözlem/latency avantajı sunar ancak HTTP provider yokluğunu telafi etmez.
- Readiness ve liveness HTTP uçları uygulamada ayrı route'lar olarak sunulur: `/health` her zaman hafif probe, `/ready` ise ayrıntılı readiness JSON cevabı verir ve başarısızlıkta `503` döner.

### 9.5.3 Uygulama Bootstrap, Middleware Zinciri ve Shutdown Orkestrasyonu

- **Bootstrap sırası bilinçli olarak katıdır:** uygulama önce `.env` yükler, ardından MongoDB ve Redis bağlantılarını kurar, sonra on-chain protocol config'i yükler, event worker'ı başlatır, zamanlanmış görevleri takvime koyar ve en son HTTP route'larını mount eder. Böylece yarım-başlamış API yüzeyleri azaltılır.
- **Fail-fast startup doğrulamaları:** Production'da `SIWE_DOMAIN=localhost`, boş/`*` CORS origin'leri veya şema (`http://` / `https://`) içermeyen origin kayıtları kabul edilmez; uygulama bilinçli olarak başlamaz. Amaç, “çalışıyor görünen ama güvenlik sınırı yanlış” dağıtımları erkenden durdurmaktır.
- **Temel middleware zinciri:** `helmet`, `cors(credentials=true)`, sınırlı `express.json(50kb)`, `cookieParser` ve `express-mongo-sanitize` birlikte çalışır. Böylece CSP/HSTS, origin kontrolü, küçük JSON yüzeyi, cookie-only auth ve Mongo operatörü enjeksiyon temizliği aynı çekirdek Express hattında uygulanır.
- **Log route'unun üstte konumlanması:** `/api/logs` rotası diğer iş rotalarından önce yüklenir; frontend crash gözlemlenebilirliği auth başlamadan da çalışır. Buna rağmen auth gerektirmeyen tek rota olduğu için kendi rate-limit ve payload sınırlarıyla korunur.
- **Staggered scheduler başlatma:** Periyodik görevler cold-start anında aynı anda ateşlenmez. DLQ monitörü düzenli aralıkta çalışırken reputation decay, stats snapshot, pending cleanup ve sensitive-data cleanup görevleri farklı gecikmelerle başlatılır. Amaç ilk dakika içinde DB/RPC/Redis üstüne yığılmayı azaltmaktır.
- **Runtime scheduler sahipliği:** Uygulama süreç içinde oluşturduğu `setTimeout` / `setInterval` tanımlarını tutar ve shutdown sırasında temizler. Böylece kapanışta “eski timer'ların yeni süreçle yarışması” veya uzun kapanış beklemeleri azaltılır.
- **Graceful vs fatal shutdown ayrımı:** `SIGTERM` ve `SIGINT` için orderly kapanış, `uncaughtException` ve `unhandledRejection` için ise restart beklenen fatal kapanış akışı uygulanır. Her iki yol da ortak orchestrator fonksiyonundan geçer; davranış dalları log seviyesinde ayrılır.
- **Shutdown sırası:** Yeni HTTP istekleri durdurulur (`server.close()`), worker kapatılır, Mongo bağlantısı kapanır, Redis `quit()` ile bırakılır, master key cache sıfırlanır ve zamanlayıcılar temizlenir. Bu sıra, yeni iş kabulünü önce durdurup arka plan görevlerini sonra boşaltacak şekilde seçilmiştir.
- **Force-exit emniyet supabı:** Shutdown makul süre içinde tamamlanmazsa process belirli bir timeout sonunda zorla sonlandırılır. Amaç, orkestratörün asılı kalan süreç yüzünden yeni instance başlatamaması riskini azaltmaktır.
- **Master key hijyeni:** Şifreleme katmanının bellek içi master key cache'i shutdown başında temizlenir; böylece restart/fatal crash çevrimlerinde hassas materyalin RAM'de gereksiz uzaması azaltılır.

### 9.6 Olay Dinleyici Güvenilirliği

- **Durum Makinesi:** Worker iç durumunu `booting -> connected -> replaying -> live -> reconnecting -> stopped` çizgisinde izler; bu sayede sağlık sinyalleri ve loglar yalnız “çalışıyor/çalışmıyor” seviyesinde kalmaz.
- **Replay Başlangıcı:** Worker, başlangıç bloğunu önce Redis checkpoint'inden (`worker:last_safe_block`, yoksa `worker:last_block`) çözer. Checkpoint yoksa yalnız tanımlı `ARAF_DEPLOYMENT_BLOCK` / `WORKER_START_BLOCK` üzerinden başlar; production'da bunlardan hiçbiri yoksa başlatılmaz.
- **Safe Checkpoint Semantiği:** Checkpoint körlemesine “son görülen blok”a ilerletilmez. Canlı akışta her blok için `seen / acked / unsafe` durumu tutulur; yalnız tüm event'leri başarıyla ack'lenmiş ve unsafe işaretlenmemiş bloklar güvenli checkpoint'e alınır.
- **Replay Batch Disiplini:** Replay sırasında batch içindeki tek bir event bile başarısız olursa ilgili blok aralığı için safe checkpoint ilerletilmez. Böylece “işlenmemiş ama checkpoint geçmiş” sessiz veri kaybı önlenir.
- **Yeniden Deneme:** Başarısız olaylar önce worker tarafında sınırlı deneme ile yeniden işlenir; kalıcı başarısızlıklar Redis DLQ'ya alınır.
- **Ölü Mektup Kuyruğu (DLQ):** DLQ girdileri Redis listesinde (`worker:dlq`) tutulur; event adı, `txHash`, `logIndex`, idempotency anahtarı, block numarası, serialized argümanlar, deneme sayısı ve `next_retry_at` alanlarını taşır.
- **Re-drive Worker:** Ayrı bir processor DLQ'yu batch halinde tarar, zamanı gelmiş girdileri `eventListener.reDriveEvent()` ile yeniden sürer; başarılı girdileri kuyruktan siler. Re-drive başarısızsa ilgili blok unsafe işaretlenir.
- **Exponential Backoff:** Başarısız re-drive denemeleri `attempt` sayısına göre artan bekleme süresiyle kuyruğun sonuna yazılır; üst sınır 30 dakikadır.
- **Poison Event Politikası:** Yüksek deneme sayısına rağmen düzelmeyen girdiler poison event olarak metriklenir; otomatik silinmez, manuel inceleme için görünür kalır.
- **DLQ Arşivleme / Kırpma:** Kuyruk boyu güvenli eşiği aşarsa eski girdiler 7 günlük arşive taşınır ve ana DLQ kontrollü şekilde kırpılır.
- **Alarm / Soğuma Süresi:** DLQ derinliği kritik eşiği aştığında sürekli spam üretmemek için cooldown'lu alarm logu atılır.
- **Reconnect Hijyeni:** Provider hatasında reconnect öncesi eski listener'lar ve varsa WebSocket provider `destroy()` ile temizlenir; zombi socket / duplicate listener birikimine izin verilmez.
- **Authoritative Linkage Doktrini:** `EscrowCreated` yalnız kanonik `listing_ref` üzerinden eşleştirilir. Zero veya eksik `listingRef` recoverable gecikme değil, kritik kontrat/API bütünlük ihlalidir; event DLQ'ya kritik hata olarak gönderilir. Heuristik backfill yapılmaz.
- **Authoritative Eşleşme Kontrolleri:** `listing_ref` bulunduğunda dahi maker, tier ve token adresi on-chain event ile birebir doğrulanır. Uyuşmazlık varsa event kabul edilmez ve DLQ'ya alınır.
- **Atomik Bağlama:** `Listing.onchain_escrow_id` alanı yalnız atomik update ile bağlanır; aynı ilanı iki farklı escrow'a sessizce bağlayan yarışlara izin verilmez.
- **Atomik Sonlandırma:** `EscrowReleased` ve `EscrowBurned` akışları Mongo transaction ile yürür; trade statüsü, retention tarihleri ve reputation side-effect'leri tek atomik işlem içinde tutulur.
- **İdempotent Decay Aynalama:** `BleedingDecayed` event'leri `txHash:logIndex` anahtarıyla aynalanır; aynı decay event'i tekrar gelse bile `total_decayed` ikinci kez büyütülmez.
- **Sıra Tahmini Yapmama İlkesi:** `MakerPinged` işlendiğinde `taker_address` henüz DB'de yoksa worker zincirden tahmin üretmez; event DLQ'ya alınır ve doğru sıralama beklenir.
- **Büyük Sayı Aynası:** On-chain finansal miktarlar (`crypto_amount`, `total_decayed`) Mongo'da string olarak tutulur; Number alanları yalnız approx analytics/UI amaçlı cache'tir.
- **Mongo ölçekleme notu:** Event replay ile eşzamanlı canlı API trafiği Mongo üzerinde ani paralellik yaratabileceğinden, olay aynalama katmanı düşük pool varsayımıyla tasarlanmamıştır.
- **Temiz yeniden başlatma ilkesi:** DB bağlantısı koptuğunda worker ve API aynı process'te kirli reconnect yapmak yerine container/process supervisor tarafından temiz biçimde yeniden başlatılır.
### 9.7 Zamanlanmış Görevler ve Veri Yaşam Döngüsü

Backend, uygulama mantığının bir bölümünü periyodik job'lar ile yürütür. Bu görevler **yetkili durum kaynağını değiştirmez**; on-chain gerçekliği tamamlayan retention, bakım ve analytics işlevleri sağlar.

#### Pending Listing Cleanup

- `PENDING` durumda kalmış ve hiçbir zaman on-chain `tradeId` / `onchain_escrow_id` almamış ilanlar geçici kabul edilir.
- `created_at` üzerinden **12 saat** geçen ve hala on-chain'e düşmemiş kayıtlar `DELETED` durumuna çekilir.
- Amaç, başarısız oluşturma akışlarından kalan yarım ilanları orderbook'tan temizlemektir.

#### Sensitive Data Cleanup

- Dekont payload'ı (`evidence.receipt_encrypted`, `evidence.receipt_timestamp`) kendi `receipt_delete_at` zamanına ulaştığında null'lanır.
- Snapshot PII alanları (`pii_snapshot.*`) kendi `snapshot_delete_at` zamanına ulaştığında null'lanır.
- Bu temizlik işi hard delete yerine **alan bazlı scrub** uygular; işlem kaydı, denetim izi ve finansal tarihçe korunur.
- Uygulama bu retention cleanup işlerini runtime scheduler ile yaklaşık her 30 dakikada bir çalıştırır; ilk tetikleme cold-start yükünü azaltmak için gecikmeli başlatılır.

#### On-Chain Reputation Decay Job

- `decayReputation(address)` fonksiyonu kullanıcılar adına backend job'ı tarafından periyodik olarak tetiklenebilir.
- Aday seçiminde Mongo yalnızca **geniş aday havuzu** sağlar; nihai uygunluk `reputation(address)` on-chain okumasına göre belirlenir.
- Bu yaklaşım, `banned_until` veya `consecutive_bans` gibi DB aynalarının stale kalması halinde yanlış decay uygulanmasını engeller.
- Job, relayer signer ile yalnızca kontratın izin verdiği `decayReputation()` çağrısını yapar; itibarı off-chain değiştiremez.

#### Daily Stats Snapshot

- Güncel protokol istatistikleri Mongo aggregation ile DB seviyesinde hesaplanır.
- Sonuçlar `historical_stats` koleksiyonunda **gün bazlı idempotent upsert** ile saklanır.
- Aynı gün içinde job tekrar çalışsa bile mevcut gün kaydı güncellenir; duplicate günlük snapshot oluşmaz.
- `GET /api/stats`, bu günlük snapshot koleksiyonunu okur; en güncel kaydı ve mümkünse tam **30 gün önceki** kaydı karşılaştırır.
- Sonuçlar Redis içinde `cache:protocol_stats` anahtarında **1 saat** önbelleklenir; cache hit olduğunda hesaplama tekrarlanmaz.
- Yüzde değişim hesabı yalnızca anlamlı bir önceki değer varsa yapılır. `previous = 0/null/undefined` ise değişim alanı `null` döner; böylece `0→1` ile `0→1.000.000` aynı hatalı `%100` çıktısına indirgenmez ve UI `Yeni` / `—` gibi güvenli gösterimler yapabilir.


### 9.8 Şifreli Dekont Depolama ve Unutulma Hakkı (TTL)

Taker dekont yüklediğinde public IPFS'e atmak yerine, backend üzerinde AES-256-GCM ile şifrelenir ve veritabanına/geçici storage'a kaydedilir. Dosyanın SHA-256 hash'i frontend'e dönülür ve akıllı kontrata kaydedilir. İşlem `RESOLVED` veya `CANCELED` statüsüne geçtiğinde dekont verisi maksimum 24 saat içinde silinir. `CHALLENGED` veya `BURNED` işlemlerde ise süreci takip eden 30 gün sonra kalıcı olarak silinir.

**Dekont yükleme hattının güvenlik özellikleri**
- `POST /api/receipts/upload`, `requireAuth` + `requireSessionWalletMatch` + `tradesLimiter` ile korunur; yalnızca aktif taker kendi trade'i için yükleme yapabilir.
- Upload hattı `multer.memoryStorage()` kullanmaz; dosya önce geçici diske yazılır, sonra stream tabanlı olarak base64 okunup şifrelenir. Böylece büyük eşzamanlı yüklemelerde proses belleği sabit kalır ve OOM/heap baskısı azaltılır.
- Kabul edilen MIME tipleri `jpeg/png/webp/gif/pdf` ile sınırlıdır; ancak karar yalnızca istemcinin `mimetype` beyanına bırakılmaz. İlk baytlar (`magic bytes`) ayrıca doğrulanır; içerik-imza uyuşmazlığında istek `415` ile reddedilir.
- Trade güncellemesi **tek atomik `findOneAndUpdate`** ile yapılır. Filtrede eşzamanlı olarak `taker_address`, `status: "LOCKED"` ve `evidence.receipt_encrypted: null` koşulları aranır. Böylece hem TOCTOU penceresi kapanır hem de daha önce yüklenmiş kanıtın üzerine yazılamaz.
- Yükleme başarılı olduğunda saklanan hash, plaintext dosyanın değil **şifreli payload'ın SHA-256** özetidir; kontrata giden kanıt backend'de tutulan encrypted blob ile bağlanır.
- Route, hangi nedenle reddedildiğini ayrıştırır: trade yoksa `404`, yanlış tarafsa `403`, zaten dekont varsa `409`, trade aktif değilse `400`. Bu sayede kullanıcı davranışı ile güvenlik ihlali ayrılır, denetim logları daha anlamlı olur.
- Geçici dosya silme işlemi `finally` bloğunda zorunlu çalışır; cleanup başarısız olsa bile iş akışı düşmez, yalnızca warning log bırakılır.

### 9.9 Triangulation Fraud (Üçgen Dolandırıcılık) Koruması

Üçgen dolandırıcılığı önlemek için; işlem `LOCKED` durumuna geçtiğinde, Maker'ın (Satıcı) Trade Room ekranında, Backend'den şifresi çözülerek gelen Taker'ın (Alıcı) "İsim Soyisim" bilgisi gösterilir. Maker'a, gelen paranın gönderici ismi ile bu ismin kesinlikle eşleştiğini teyit etmesi için uyarı yapılır. Eşleşmeme durumunda işlem iptaline (Cancel) yönlendirilir.

### 9.10 On-Chain Güvenlik Fonksiyonları

| Fonksiyon | Açıklama |
|---|---|
| `pause()` / `unpause()` | Sadece kontrat sahibinin (`Owner`) çağırabildiği, acil bir durumda yeni `createEscrow()` ve `lockEscrow()` girişlerini durduran fonksiyonlardır. Mevcut trade kapanış yolları açık kalır. |
| `domainSeparator()` | EIP-712 imzaları için gereken ve kontrata özgü olan domain ayıracını döndürür. Frontend tarafından imza oluşturulurken kullanılır; imza akışının doğru kontrata bağlandığını doğrulamak için görünür bir helper'dır. |
| `nonReentrant` (Modifier) | Bir fonksiyonun yürütülmesi sırasında aynı fonksiyonun tekrar çağrılmasını engelleyerek "re-entrancy" saldırılarını önler. |

### 9.11 Owner Governance ve Yönetim Yetkileri

Aşağıdaki yüzey kontrat sahibine aittir ve protokolün operasyonel merkeziyet noktalarını oluşturur. Bunlar backend route'ları değil, doğrudan on-chain yönetim yetkileridir. Güven modeli yalnız "kod değişmez" varsayımına değil, aynı zamanda owner anahtarının güvenliğine de bağlıdır.

| Yetki | Kontrat Fonksiyonu | Etki |
|---|---|---|
| Hazine yönlendirmesi | `setTreasury(address)` | Protokol ücretlerinin ve decay/burn gelirlerinin hangi adrese aktığını değiştirir. |
| Desteklenen token seti | `setSupportedToken(address, bool)` | Yeni create/lock yüzeyinin hangi ERC20'ler için açık olduğunu belirler. |
| Acil durum freni | `pause()` / `unpause()` | Yeni create/lock akışlarını durdurur veya yeniden açar. |

---


### 9.11.1 Güvenli Deploy ve Ownership Devri

`contracts/scripts/deploy.js`, owner yetkisinin yalnız deploy anındaki teknik sahiplik olmadığını; güvenli kurulum tamamlanmadan son yetki devrinin yapılmaması gerektiğini tanımlar.

**Deploy güvenlik ilkeleri**
- Production ortamında gerçek token adresleri (`MAINNET_USDT_ADDRESS`, `MAINNET_USDC_ADDRESS`) `.env` üzerinden zorunlu alınır; eksik veya zero-address ise script hard fail olur.
- `ArafEscrow` deploy edildikten sonra desteklenen tokenlar owner yetkisiyle etkinleştirilir, ancak süreç burada bitmez.
- Her token için `setSupportedToken(token, true)` çağrısından sonra `supportedTokens(token)` değeri zincir üstünde yeniden okunur ve doğrulanır.
- Bu doğrulama tamamlanmadan `transferOwnership(treasury)` çalıştırılmaz.
- Dolayısıyla deploy completion koşulu yalnız kontratın zincire yazılması değil, **desteklenen token setinin zincir üstünde doğrulanmış olması ve ancak bundan sonra ownership devrinin tamamlanmasıdır.**

**Mimari not**
- ABI kopyalama, frontend `.env` auto-write ve benzeri kolaylaştırıcı adımlar geliştirici ergonomisi içindir; protokol güven modelinin parçası değildir.
- Buna karşılık token support doğrulaması ve ownership devri sırası güven modelinin parçasıdır.

## 10. Veri Modelleri (MongoDB)

Bu bölüm, backend model katmanının gerçek veri sözleşmesini özetler. Kritik ilke korunur: **on-chain alanlar otoritatif gerçekliği temsil eder; off-chain alanlar indeksleme, UX, retention ve analitik için tutulur.** Özellikle `reputation_cache`, `banned_until`, `consecutive_bans`, `max_allowed_tier`, `crypto_amount_num` ve `total_decayed_num` gibi alanlar hız ve görüntüleme amaçlı aynalardır; yetkilendirme veya ekonomik enforcement için tek başına kullanılmaz. Bu alanlardan türetilen backend yorumları, kontrat storage'ı veya fonksiyon davranışıyla çatıştığında hata backend'dedir; mimari hüküm kontrat tarafındadır.

### 10.1 Kullanıcılar Koleksiyonu

| Alan | Tür | Açıklama |
|---|---|---|
| `wallet_address` | Dize (benzersiz) | Küçük harfli Ethereum adresi — birincil kimlik |
| `pii_data.bankOwner_enc` | Dize | AES-256-GCM şifreli banka sahibi adı |
| `pii_data.iban_enc` | Dize | AES-256-GCM şifreli IBAN (TR formatı) |
| `pii_data.telegram_enc` | Dize | AES-256-GCM şifreli Telegram kullanıcı adı |
| `reputation_cache.total_trades` | Sayı | Başarılı tamamlanan toplam işlem sayısı |
| `reputation_cache.failed_disputes` | Sayı | Başarısızlıkla sonuçlanan toplam uyuşmazlık sayısı |
| `reputation_cache.success_rate` | Sayı | UI için hesaplanan başarı oranı |
| `reputation_cache.failure_score` | Sayı | Ağırlıklı başarısızlık puanı |
| `reputation_history` | Dizi | Zamanla etkisi düşen başarısızlık geçmişi |
| `is_banned` / `banned_until` | Boolean / Tarih | On-chain yasak durumu aynası |
| `consecutive_bans` | Sayı | On-chain ardışık yasak sayısı aynası |
| `max_allowed_tier` | Sayı | Ceza kaynaklı tier tavanı aynası |
| `last_login` | Tarih | TTL: 2 yıl hareketsizlik sonrası otomatik silme (GDPR) |

**Model davranışları**
- `toPublicProfile()` **allowlist/fail-safe** yaklaşımıyla çalışır; yalnızca açıkça seçilmiş public alanlar döner. Böylece modele ileride yeni alan eklense bile istemeden PII veya iç durum sızdırılmaz.
- `checkBanExpiry()` artık yalnızca bellekte flag düşürmez; ban süresi geçmişse veritabanına `save()` ile kalıcı yazar. Böylece kullanıcı bir istekte banlı görünmeyip sonraki sayfa yenilemede tekrar banlı görünme hatası oluşmaz.
- `reputation_cache` ve ban alanları hızlı UI render ve indeksleme içindir; nihai otorite gerektiğinde on-chain veridir.

**İndeks / retention**
- `wallet_address` benzersiz ve indekslidir.
- `is_banned` alanı ban taramaları için indekslidir.
- `last_login` üzerinde 2 yıllık TTL vardır; uzun süre inaktif kullanıcı verisi otomatik temizlenir.

### 10.2 İlanlar Koleksiyonu (`Listing`)

| Alan | Tür | Açıklama |
|---|---|---|
| `maker_address` | Dize | İlan oluşturucunun adresi |
| `crypto_asset` | `USDT` \| `USDC` | Satılan varlık |
| `fiat_currency` | `TRY` \| `USD` \| `EUR` | İstenen fiat para birimi |
| `exchange_rate` | Sayı | 1 kripto birimi başına oran |
| `limits.min` / `limits.max` | Sayı | İşlem başına fiat tutar aralığı |
| `tier_rules.required_tier` | 0 – 4 | Bu ilanı almak için gereken minimum tier |
| `tier_rules.maker_bond_pct` | Sayı | Maker teminat yüzdesi |
| `tier_rules.taker_bond_pct` | Sayı | Taker teminat yüzdesi |
| `status` | `PENDING` \| `OPEN` \| `PAUSED` \| `COMPLETED` \| `DELETED` | `PENDING` = henüz on-chain'e yazılmamış geçici ilan |
| `onchain_escrow_id` | Sayı \| null | Escrow oluştuğunda on-chain `tradeId` |
| `listing_ref` | Dize \| null | 64-byte hex referans; sparse+unique |
| `token_address` | Dize | Base'deki ERC-20 sözleşme adresi |

**Model davranışları**
- `pre("save")` kuralı ile `limits.max > limits.min` zorunlu tutulur; bozuk ilan verisi model seviyesinde reddedilir.
- `PENDING` durumu kalıcı iş durumu değil, **frontend/backend–on-chain senkronizasyon penceresi** olarak kabul edilir.
- `onchain_escrow_id = null` ve uzun süredir `PENDING` kalan kayıtlar, cleanup job tarafından yetim ilan olarak `DELETED` durumuna süpürülür.

**İndeks stratejisi**
- `status + fiat_currency + limits.min + limits.max` birleşik indeksi filtreli pazar yeri sorgularını hızlandırır.
- `maker_address + status` ve `tier_rules.required_tier + status` indeksleri hem kullanıcı panosu hem de eşleşme taramaları için kullanılır.
- `listing_ref` sparse/unique indekslidir; referans çakışmasını önler.

**Route davranışları**
- `GET /api/listings/config`, frontend'in teminat oranlarını hardcode etmeden okuması için `bondMap` döner; config erişilemezse `503` verir.
- `GET /api/listings`, yalnızca `OPEN` ilanları listeler; filtreler `fiat`, `amount`, `tier`, `page`, `limit` üstünden uygulanır.
- Sayfalama **deterministik** olacak şekilde `sort({ exchange_rate: 1, _id: 1 })` kullanılır; eşit kurda kayıtların sayfalar arasında kaybolması veya tekrar görünmesi engellenir.
- `POST /api/listings`, `requireAuth` + `requireSessionWalletMatch` + `listingsWriteLimiter` arkasındadır.
- Listing oluşturma akışında backend, kullanıcının on-chain `effectiveTier` değerini RPC üzerinden doğrular. Bu doğrulama başarısız olursa güvenli varsayılan olarak Tier 0 dayatılmaz; istek `503` ile reddedilir. Mimari karar: **doğrulanamıyorsa işlem yapma**.
- Yeni ilanlar `OPEN` değil önce `PENDING` oluşturulur. `listing_ref = keccak256("listing:<mongoId>")` türetilir; nihai açılma (`OPEN`) event listener'ın on-chain `EscrowCreated` gözlemiyle yapılır. Bu, chain-first listeleme felsefesidir.
- `DELETE /api/listings/:id`, yalnızca maker tarafından çağrılabilir. `DELETED` tekrar silinemez; ilişkili aktif trade varsa silme reddedilir. Böylece on-chain/off-chain durum ayrışması ve aktif oda varken vitrin silinmesi engellenir.

### 10.3 İşlemler Koleksiyonu (`Trade`)

| Alan Grubu | Temel Alanlar | Notlar |
|---|---|---|
| Kimlik | `onchain_escrow_id`, `listing_id`, `maker_address`, `taker_address` | `onchain_escrow_id` = gerçeğin kaynağı |
| Finansal | `crypto_amount` (String, authoritative), `crypto_amount_num` (Number, cache), `fiat_amount`, `exchange_rate`, `crypto_asset`, `fiat_currency`, `total_decayed` (String), `total_decayed_num` (Number, cache), `decay_tx_hashes`, `decayed_amounts` | `*_num` alanları analytics/UI içindir; enforcement için kullanılmaz |
| Durum | `status` | `OPEN`, `LOCKED`, `PAID`, `CHALLENGED`, `RESOLVED`, `CANCELED`, `BURNED` |
| Zamanlayıcılar | `locked_at`, `paid_at`, `challenged_at`, `resolved_at`, `last_decay_at`, `pinged_at`, `challenge_pinged_at` | Uyuşmazlık ve decay zaman çizelgesini yansıtır |
| Kanıt | `evidence.ipfs_receipt_hash`, `evidence.receipt_encrypted`, `evidence.receipt_timestamp`, `evidence.receipt_delete_at` | Hash on-chain referansıdır; payload public IPFS'te değil backend'de şifreli tutulur |
| PII Snapshot | `pii_snapshot.*`, `pii_snapshot.captured_at`, `pii_snapshot.snapshot_delete_at` | LOCKED anında karşı taraf verisinin sabitlenmiş görünümü |
| İptal Önerisi | `cancel_proposal.*` | Karşılıklı iptal için toplanan imzalar ve deadline |
| Chargeback Onayı | `chargeback_ack.*` | `releaseFunds` öncesi Maker'ın yasal beyan izi |
| Tier | `tier` (0–4) | İşlem açıldığı andaki tier |

**Model davranışları**
- Finansal doğruluk için `crypto_amount` ve `total_decayed` **String** tutulur; bu alanlar BigInt-safe otoritatif değerlerdir.
- `crypto_amount_num` ve `total_decayed_num` yalnızca dashboard/aggregation kolaylığı için bulunan yaklaşık cache alanlarıdır.
- Dekont verisi gerçek IPFS yüklemesi değildir; tarihsel isim korunmuş olsa da backend tarafında AES-256-GCM ile şifreli tutulur.
- `pii_snapshot`, LOCKED anındaki karşı taraf bilgilerini dondurarak bait-and-switch riskini azaltır.
- Virtual alanlar:
  - `isInGracePeriod`
  - `isInBleedingPhase`
  Bu alanlar sorgu değil, runtime hesaplaması için tasarlanmıştır.

**Route ve erişim davranışları**
- `GET /api/trades/my`, yalnızca çağıranın taraf olduğu ve henüz kapanmamış (`RESOLVED/CANCELED/BURNED` dışı) trade kayıtlarını döndürür. Bu endpoint trade room listesini besler.
- `GET /api/trades/history`, aynı güvenlik sınırı içinde yalnızca kapanmış trade kayıtlarını sayfalı sunar. Böylece aktif oda görünümü ile arşiv görünümü ayrışır.
- `GET /api/trades/:id` ve `GET /api/trades/by-escrow/:onchainId`, yalnızca maker veya taker olan taraflara cevap verir.
- Tüm trade okuma endpoint'leri tam belgeyi değil, `SAFE_TRADE_PROJECTION` ile daraltılmış alan kümesini döndürür; şifreli PII, ham imzalar ve gereksiz iç alanlar dışarı verilmez.
- `POST /api/trades/propose-cancel`, `requireAuth + requireSessionWalletMatch + tradesLimiter` arkasındadır. İlk teklif `cancel_proposal.deadline` alanını sabitler; ikinci tarafın getirdiği deadline bununla uyuşmuyorsa istek reddedilir. Böylece EIP-712 cancel akışında deadline ezme/deadlock saldırısı kapanır.
- `proposed_by` yalnızca ilk teklif veren için set edilir; karşı taraf onayı `approved_by` alanında ayrı tutulur. Bu, audit trail'in yönünü korur.
- `POST /api/trades/:id/chargeback-ack`, on-chain veto kapısı değil yalnızca audit/log kaydıdır. Kayıt atomik `findOneAndUpdate` ile bir kez yazılır; aynı anda gelen ikinci istek `acknowledged: true` filtresi nedeniyle yeni kayıt oluşturamaz.
- `chargeback_ack.ip_hash`, doğrudan saklanan çıplak IP değildir; `X-Forwarded-For` / `req.ip` üzerinden türetilen istemci IP'sinin SHA-256 özetidir. Böylece hukuki denetim izi korunurken ham IP yayılımı azaltılır.

**İndeks / retention**
- `maker_address + status`, `taker_address + status`, `onchain_escrow_id` indeksleri temel trade okuma yollarını hızlandırır.
- `timers.resolved_at` üzerinde **partial TTL index** vardır; yalnızca `RESOLVED`, `CANCELED`, `BURNED` trade'ler 1 yıl sonra otomatik silinir.
- `evidence.receipt_delete_at` üzerinde sparse index vardır; bu index TTL için değil, cleanup job'ın scrub edilecek alanları verimli bulması içindir. Mongo TTL field'ı değil dokümanı sildiğinden, dekont ve snapshot scrub'ı job ile yapılır.
- PII route'ları `pii_snapshot` alanlarını birincil kaynak olarak kullanır; snapshot eksikse yalnızca legacy uyumluluk için `User.pii_data` fallback devreye girer.
- Dekont upload route'u `evidence.receipt_encrypted` alanını **write-once kanıt slotu** gibi ele alır; bir kez set edildikten sonra aynı trade için tekrar yazılamaz.

### 10.4 Geri Bildirimler Koleksiyonu (`Feedback`)

| Alan | Tür | Açıklama |
|---|---|---|
| `wallet_address` | Dize | Geri bildirimi gönderen cüzdan |
| `rating` | 1–5 | Zorunlu yıldız puanı |
| `comment` | Dize | Maksimum 1000 karakter yorum |
| `category` | `bug` \| `suggestion` \| `ui/ux` \| `other` | Route doğrulamasıyla senkron kategori |
| `created_at` | Tarih | Kayıt tarihi |

**Model davranışları**
- Feedback modeli hafif ve operasyoneldir; ürün geri bildirimi toplar, protokol otoritesi üretmez.
- `category` alanı Mongoose enum ile kısıtlanır; route katmanındaki Joi doğrulaması ile uyumlu tutulur.

**Route akışı**
- `POST /api/feedback`, `requireAuth` + `feedbackLimiter` arkasındadır; anonim geri bildirim kabul edilmez.
- Route katmanında `rating`, `comment`, `category` alanları Joi ile doğrulanır; başarılı istek `201` döner.
- Log satırları wallet, rating ve category içerir; feedback verisi ürün/UX telemetrisi üretir fakat protokol state'ini etkilemez.

**İndeks / retention**
- `created_at` üzerinde 1 yıllık TTL bulunur; ürün geri bildirimleri süresiz saklanmaz.
- `wallet_address + created_at` indeksi, wallet başına saatlik feedback sınırı ve abuse analizleri için hızlı tarama sağlar.

### 10.5 Günlük İstatistikler Koleksiyonu (`HistoricalStat`)

| Alan | Tür | Açıklama |
|---|---|---|
| `date` | `YYYY-MM-DD` dizesi | Günlük benzersiz anahtar |
| `total_volume_usdt` | Sayı | Çözülen trade'lerin toplam hacmi |
| `completed_trades` | Sayı | Günlük snapshot anındaki toplam tamamlanan trade sayısı |
| `active_listings` | Sayı | Snapshot anındaki açık ilan sayısı |
| `burned_bonds_usdt` | Sayı | Toplam eriyen/yakılan miktar |
| `avg_trade_hours` | Sayı \| null | Ortalama çözülme süresi (saat) |
| `created_at` | Tarih | Snapshot'ın oluşturulma zamanı |

**Model davranışları**
- `date` benzersiz anahtardır; snapshot job aynı gün içinde tekrar çalışsa bile ikinci kayıt açılmaz, mevcut satır güncellenir.
- Bu koleksiyon, `/api/stats` için 30 günlük karşılaştırma ve trend hesaplarını trade koleksiyonunu her istekte taramadan destekler.
- `/api/stats`, önce Redis cache'i yoklar; cache boşsa en yeni `HistoricalStat` kaydı ile 30 gün önceki kaydı okuyup null-safe değişim alanları (`changes_30d.*`) üretir.

**İndeks stratejisi**
- `date: -1` indeksi en yeni snapshot'ların hızlı sıralanmasını sağlar.
- `created_at` yalnızca oluşturulma izidir; `updated_at` tutulmaz çünkü aynı günkü kayıt işlevsel olarak tek günlük snapshot'ı temsil eder.

---

## 11. Hazine Modeli

| Gelir Kaynağı | Oran | Koşul |
|---|---|---|
| Başarı ücreti | %0,2 (her iki taraftan %0,1) | Her `RESOLVED` (Çözüldü) işlem |
| Taker teminat çürümesi | 42 BPS / saat | `CHALLENGED` + Kanama aşaması |
| Maker teminat çürümesi | 26 BPS / saat | `CHALLENGED` + Kanama aşaması |
| Escrowed kripto çürümesi | 34 BPS / saat | Kanama'nın 96. saatinden sonra |
| YAKILDI sonucu | Kalan fonların %100'ü | 240 saat içinde uzlaşma olmaması |

### İlgili Kontrat Fonksiyonları

| Fonksiyon | Açıklama |
|---|---|
| `setTreasury(address)` | Sadece kontrat sahibinin (`Owner`) çağırabildiği, protokol ücretlerinin ve yakılan fonların gönderileceği Hazine (Treasury) adresini güncelleyen fonksiyondur. |
| `setSupportedToken(address, bool)` | Desteklenen ERC20 varlık listesini yönetir; create/lock yüzeyinin hangi token'lar için açık olduğunu belirler. Bu liste deploy sonrası statik değil, owner tarafından değiştirilebilir. |
| `pause()` / `unpause()` | Yalnız yeni create/lock akışlarını durdurur veya yeniden açar; mevcut işlemlerin kapanış fonksiyonlarını kilitlemez. |

---

## 12. Saldırı Vektörleri ve Bilinen Sınırlamalar

| Saldırı | Risk | Azaltma | Durum |
|---|---|---|---|
| Sahte makbuz yükleme | Yüksek | İtiraz teminat cezası — çürüme maliyeti potansiyel kazançtan fazla | ⚠️ Kısmi |
| Satıcı tacizi | Orta | Asimetrik çürüme: itiraz açan (Taker) daha hızlı kaybeder | ✅ Giderildi |
| Chargeback (TRY geri alımı) | Orta | Chargeback onay logu + IP hash kanıt zinciri | ⚠️ Kısmi |
| Sybil itibar çiftçiliği | Düşük | Cüzdan yaşı + dust limiti + benzersiz karşı taraf ağırlıklandırması | ✅ Giderildi |
| Challenge spam / düşük tier spam (Tier 0/1) | Yüksek | 4 saatlik cooldown + dust limiti + cüzdan yaşı | ✅ Giderildi |
| Kendi kendine işlem | Yüksek | On-chain `msg.sender ≠ maker` | ✅ Giderildi |
| Tek taraflı iptal tacizi | Yüksek | 2/2 EIP-712 — tek taraflı iptal imkansız | ✅ Giderildi |
| Backend anahtar hırsızlığı | Kritik | Sıfır özel anahtar mimarisi — yalnızca relayer | ✅ Giderildi |
| JWT ele geçirme / eski wallet session'ının yanlışlıkla geçerli görünmesi | Yüksek | 15 dakika geçerlilik + cookie-only auth + `/api/auth/me` strict wallet authority check + session-wallet mismatch durumunda aktif session invalidation + işlem kapsamlı PII tokenları | ✅ Giderildi |
| PII veri sızıntısı | Kritik | AES-256-GCM + HKDF + hız sınırı (3 / 10 dk) + retention cleanup job'ları + error log scrub | ✅ Giderildi |
| Production'da `.env` master key ile tüm PII'nın toplu açığa çıkması | Kritik | `KMS_PROVIDER=env` üretimde bloklanır; AWS KMS / Vault zorunludur | ✅ Giderildi |
| Yanlış / standart dışı HKDF ile anahtar türetme uyumsuzluğu | Orta | Node.js native `crypto.hkdf()` (RFC 5869) + planlı migrasyon gereksinimi | ✅ Giderildi |
| Bellekte uzun yaşayan master key / DEK kalıntısı | Orta | `_withDataKey()` sonrası zero-fill, `clearMasterKeyCache()` ve proses restart modeli | ✅ Giderildi |
| İşlem bittikten sonra hayalet PII erişimi | Kritik | `request-token` ve `GET /api/pii/:tradeId` aşamalarında anlık trade statü kontrolü; yalnızca `LOCKED/PAID/CHALLENGED` durumlarında erişim | ✅ Giderildi |
| Taker isminin trade sonrasında görünmeye devam etmesi | Orta | `taker-name` endpoint'inde de aynı aktif durum kümesi zorunlu | ✅ Giderildi |
| Public profile üzerinden alan sızması | Orta | `toPublicProfile()` allowlist/fail-safe tasarım; yalnızca açık seçilmiş alanlar döner | ✅ Giderildi |
| Ban bitişinin yalnızca bellekte kalması | Orta | `checkBanExpiry()` DB'ye kalıcı save yapar; ban durumu sayfa yenilemede geri dönmez | ✅ Giderildi |
| Redis tek nokta hatası | Yüksek | Readiness kontrolü + genel yüzeylerde fail-open + auth yüzeyinde in-memory fallback limiter | ✅ Giderildi |
| Yetim `PENDING` ilan birikimi | Orta | 12 saatlik cleanup job ile `DELETED`'a süpürme | ✅ Giderildi |
| Stale reputation mirror ile yanlış decay | Yüksek | Nihai uygunluğu on-chain `reputation()` ile doğrulayan decay job | ✅ Giderildi |
| Duplicate günlük istatistik kaydı | Düşük | Gün bazlı idempotent upsert (`historical_stats`) | ✅ Giderildi |
| Mongo reconnect kaosu / topology bozulması | Yüksek | Fail-fast process restart + supervisor yeniden başlatması | ✅ Giderildi |
| Kararsız listings sayfalama | Orta | `exchange_rate + _id` ile deterministik sort | ✅ Giderildi |
| RPC hatasında yanlış tier düşürme | Yüksek | Tier doğrulanamazsa `null` → `503`; Tier 0 fallback yok | ✅ Giderildi |
| Kimliksiz crash log endpoint'inin denetim izi doldurması | Yüksek | Sıkı IP rate limit + zorunlu alan doğrulaması + payload kırpma + 204 response | ✅ Giderildi |
| Dekont kanıtı üzerine yazma (evidence overwrite) | Kritik | Atomik update filtresinde `evidence.receipt_encrypted: null`; ikinci yükleme `409` ile reddedilir | ✅ Giderildi |
| Dekont yüklemede TOCTOU yarışı | Yüksek | `status: "LOCKED"` dahil tek atomik `findOneAndUpdate`; challenge ile yarışta son durum korunur | ✅ Giderildi |
| Dosya yükleme ile RAM tüketme / OOM | Yüksek | Disk tabanlı geçici storage + stream ile şifreleme; buffer tabanlı tüm-dosya yükleme yok | ✅ Giderildi |
| MIME spoofing ile zararlı payload kabul ettirme | Orta | İzinli MIME listesi + magic-bytes doğrulaması | ✅ Giderildi |
| İstatistiklerde anlamsız / hatalı yüzde değişimi | Orta | `previous=0/null` ise değişim `null`; yalnızca geçerli tarih çiftlerinde hesaplama | ✅ Giderildi |
| Trade detay endpointlerinden fazla alan sızması | Orta | `SAFE_TRADE_PROJECTION` ile alan daraltma ve taraf kontrolü | ✅ Giderildi |
| Cancel teklifinde deadline ezilmesi ile deadlock | Yüksek | İlk teklif deadline'ı sabitler; sonraki imza aynı deadline ile gelmek zorunda | ✅ Giderildi |
| Chargeback onayında yarış koşulu / çift kayıt | Orta | Atomik `findOneAndUpdate` + `acknowledged != true` filtresi | ✅ Giderildi |
| Proxy arkasında yanlış IP hash üretimi | Orta | `trust proxy` uyumlu gerçek IP belirleme + SHA-256 hash saklama | ✅ Giderildi |
| DLQ'da biriken / zehirli event'lerin sessizce kaybolması | Yüksek | Redis DLQ, re-drive worker, poison event metrikleri, arşivleme ve alarm cooldown | ✅ Giderildi |
| Zero / eksik `listingRef` ile kanonik bağın kaybedilmesi | Kritik | `EscrowCreated` için zero ref kritik bütünlük ihlali kabul edilir; heuristik fallback yok, DLQ + manuel inceleme | ✅ Giderildi |
| Canlı event'lerde checkpoint'in körlemesine ilerleyip sessiz veri kaybı yaratması | Kritik | `seen/acked/unsafe` blok takibi + yalnız safe checkpoint'in ilerletilmesi | ✅ Giderildi |
| Reconnect sonrası zombi listener / duplicate socket birikimi | Yüksek | Reconnect öncesi provider listener temizliği ve varsa `destroy()` çağrısı | ✅ Giderildi |
| SIWE nonce yarışında frontend'e Redis'te olmayan nonce dönülmesi | Yüksek | Nonce için Redis authoritative; `SET NX` yarışı sonrası re-read ve güvenli retry | ✅ Giderildi |
| Zayıf / placeholder JWT secret ile token sahteciliği riski | Kritik | Minimum 64 karakter, placeholder yasağı, entropy kontrolü, startup fail-fast | ✅ Giderildi |
| Replay worker'ın başlangıç bloğunu bilmeden ayağa kalkması | Yüksek | Readiness içinde checkpoint veya deployment/start block zorunluluğu | ✅ Giderildi |
| Liveness başarılı görünürken bağımlılıkların aslında hazır olmaması | Orta | Ayrı readiness kontrolleri: mongo, redis, worker, provider, config, replay bootstrap | ✅ Giderildi |

| Hayalet config / backend'de sahte ekonomik parametre fallback'i | Yüksek | On-chain config loader + Redis cache + `CONFIG_UNAVAILABLE` ile bilinçli 503 | ✅ Giderildi |
| Log dosyalarının web root yakınında tutulup yanlış sunulması | Yüksek | Varsayılan log dizinini backend içi izole `logs/` altına taşıma + `LOG_DIR` ile sistem log dizini desteği | ✅ Giderildi |
| Production'da gevşek CORS / wildcard origin ile cookie auth sızması | Kritik | Startup fail-fast: `*` yasak, boş origin yasak, şema doğrulaması ve allowlist zorunluluğu | ✅ Giderildi |
| Fatal durumda süreçlerin yarım kapanıp zombi timer/bağlantı bırakması | Orta | Ortak shutdown orkestrasyonu + scheduler temizliği + `server.close()` + force-exit timeout | ✅ Giderildi |
| Kur Manipülasyonu (Rate Manipulation) | Kritik | Sistem fiat limitlerini kullanmaz. Tier kısıtlamaları doğrudan mutlak kripto miktarı (USDT/USDC) üzerinden on-chain limitlere dayanır. | ✅ Giderildi |
| `reportPayment()` tarafında on-chain CID doğrulaması olmaması | Orta | Kontrat yalnız boş string'i reddeder; hash biçimi/CID hijyeni backend route ve mirror katmanında ayrıca doğrulanmalıdır. Tek başına kontrat bu garantiyi vermez. | ⚠️ Açık Not |
| Kontrat ile backend mirror arasında `CHALLENGED -> releaseFunds()` itibar atfı sapması | Yüksek | Kontratta maker dispute açıp sonra `releaseFunds()` ile kapatırsa başarısız uyuşmazlık maker'a yazılır. Backend yorum katmanları farklı işaretlerse UI/analitik/operasyon kararları drift eder. Otorite kontrattır; mirror düzenli mutabakat kontrolünden geçmelidir. | ⚠️ Açık Not |
| Backend yorum katmanının kontrat otoritesinin önüne geçmesi | Kritik | Event adları, Mongo cache alanları, route response'ları veya dashboard türevleri kontrat storage/fonksiyon gerçekliğinin yerine geçirildiğinde mimari drift oluşur. Tüm ekonomik ve state yorumları düzenli contract-authoritative review ile doğrulanmalıdır. | ⚠️ Açık Not |
| Mutual cancel anlatısının kontrat batch-modeli sanılması | Yüksek | Mevcut kontrat iki imzayı tek tx içinde üçüncü tarafın submit ettiği bir yol sağlamaz; her taraf kendi hesabıyla `proposeOrApproveCancel()` çağırmalıdır. Off-chain imza biriktirme yalnız koordinasyon amaçlıdır. | ⚠️ Açık Not |
| `EscrowReleased` / `EscrowCanceled` event adlarının ekonomik bağlamı tekil sanılması | Orta | Aynı event adı farklı kapanış yollarında yeniden kullanılır; backend analitiği state ve çağrı bağlamını da dikkate almalıdır. | ⚠️ Açık Not |
| Yasaklı cüzdanın tamamen protokolden men edildiğinin varsayılması | Orta | Kontrattaki ban kapısı yalnız taker-side `lockEscrow()` girişinde uygulanır; maker rolü ve mevcut trade kapanışları ayrı değerlendirilmelidir. | ⚠️ Açık Not |
| `ReputationUpdated` event'inden tüm ban/tier ceza state'inin çıkarılabileceğinin varsayılması | Orta | Event payload'ı sınırlıdır; `consecutiveBans`, `hasTierPenalty` ve `maxAllowedTier` için storage/read-model mutabakatı gerekir. | ⚠️ Açık Not |
| `decayReputation()` fonksiyonunun tam itibar affı sağladığının varsayılması | Yüksek | Fonksiyon yalnız `consecutiveBans` ve tier ceiling cezasını sıfırlar; `failedDisputes` ve tarihsel `bannedUntil` izi kalır. Bond fiyatlaması üzerindeki bazı etkiler devam eder. | ⚠️ Açık Not |
| Off-chain saklanan mutual-cancel imzalarının her zaman geçerli kalacağının varsayılması | Orta | `sigNonces` cüzdan başına globaldir; başka bir cancel çağrısı imzayı bayatlatabilir. On-chain submit öncesi nonce mutabakatı gerekir. | ⚠️ Açık Not |
| `burnExpired()` fonksiyonunun yalnız taraflarca çağrılabildiğinin varsayılması | Orta | Kontrat bu fonksiyonu `onlyOwner` veya trade taraflarıyla sınırlamaz; `MAX_BLEEDING` dolduğunda herhangi bir üçüncü taraf burn finalizasyonunu tetikleyebilir. Operasyonel runbook ve UI beklentisi buna göre kurulmalıdır. | ⚠️ Açık Not |
| Treasury adresinin deploy sonrası immutable olduğunun varsayılması | Orta | Kontrat sahibi `setTreasury()` ile hazine adresini döndürebilir; güven modeli deploy-time sabit adres varsayımı üzerine kurulmamalıdır. | ⚠️ Açık Not |
| Desteklenen token setinin statik olduğunun varsayılması | Orta | `supportedTokens` owner tarafından runtime'da açılıp kapatılabilir; frontend/backend allowlist'leri kontrat otoritesiyle mutabık tutulmalıdır. | ⚠️ Açık Not |
| `failedDisputes >= 2` sonrası cezaların yalnız bir kez tetiklendiğinin varsayılması | Yüksek | Eşik aşıldıktan sonra her yeni başarısızlık `consecutiveBans`'i tekrar artırır, ban süresini büyütür ve tier ceiling cezalarını derinleştirebilir. | ⚠️ Açık Not |
| `getReputation()` çıktısının tüm reputation state'i kapsadığının varsayılması | Orta | Bu view yalnız özet döndürür; `hasTierPenalty`, `maxAllowedTier` ve `firstSuccessfulTradeAt` gibi ilişkili alanlar için ek kontrat state'i okunmalıdır. Backend/UI bunu tam özet sanarsa tier ve ceza yorumları eksik kalır. | ⚠️ Açık Not |
| Helper/view fonksiyonlarının bağlayıcı enforcement yaptığı varsayımı | Orta | `antiSybilCheck()`, `getCooldownRemaining()`, `getCurrentAmounts()` ve `domainSeparator()` açıklayıcı/yardımcı yüzeylerdir; nihai kural zorlaması state-changing fonksiyonlardadır. UX katmanı bu helper'ları "izin verdi" gibi yorumlamamalıdır. | ⚠️ Açık Not |
| Owner governance yüzeyinin küçümsenmesi | Yüksek | `setTreasury`, `setSupportedToken`, `pause` ve `unpause` doğrudan ekonomik akış, erişilebilir token seti ve yeni trade girişi üzerinde etkilidir. Owner anahtarı operasyonel merkeziyet ve yönetişim riski taşır. | ⚠️ Açık Not |
| Supported token aktivasyonu zincir üstünde doğrulanmadan ownership devri yapılması | Yüksek | Güvenli deploy akışında `setSupportedToken()` sonrası `supportedTokens()` zincir üstünde yeniden okunmalı; doğrulama başarısızsa ownership devri yapılmamalıdır. Aksi halde eksik kurulum kalıcı owner devriyle birleşir. | ⚠️ Açık Not |
| Production deploy'unda gerçek token adresleri yerine eksik / zero-address / yanlış ENV kullanılması | Kritik | Deploy script production'da `MAINNET_USDT_ADDRESS` ve `MAINNET_USDC_ADDRESS` alanlarını zorunlu ve checksum'lı adres olarak beklemelidir; eksikse hard fail doğru davranıştır. | ⚠️ Açık Not |
| Test / non-production deploy yardımcılarının production güven modeli sanılması | Orta | ABI kopyalama, frontend `.env` auto-write veya mock token deploy adımları mimari çekirdek değildir; yanlışlıkla production süreçlerinin parçası sanılırsa yanlış operasyon runbook'ları oluşur. | ⚠️ Açık Not |
| Hardhat toolchain / ağ konfigürasyonunun üretim gerçekliğiyle uyumsuz olması | Orta | Yanlış `chainId`, farklı derleme profili (`viaIR`, optimizer, `evmVersion`) veya explorer doğrulama ayarları; beklenen bytecode ile yayımlanan bytecode arasında drift yaratabilir. Resmi derleme profili ve ağ hedefleri runbook'ta sabit tutulmalıdır. | ⚠️ Açık Not |
| Pause'un mevcut işlemleri yanlışlıkla dondurduğunun varsayılması | Orta | `pause()` yalnız yeni create/lock çağrılarını durdurur; kapanış yolları açık kalır | ✅ Giderildi |

| Bleeding decay'in tek yönlü / tek kalemli sanılması | Orta | Treasury tahmini, dispute simülasyonu, UI açıklamaları ve analytics yanlış hesaplanır. Kontratta decay yalnız escrowed crypto üzerinde değil; maker bond, taker bond ve escrowed crypto üzerinde farklı oranlarla çalışır. | ⚠️ Açık Not |

---


## 13. Kesinleşmiş Protokol Parametreleri

Aşağıdaki tüm değerler Solidity `public constant` olarak deploy edilmiştir — **backend tarafından değiştirilemez.** Backend bu değerler için hard-code fallback kullanmaz; `protocolConfig` servisi bunları on-chain'den okuyup Redis'te kısa ömürlü cache'ler. Kontrat adresi / RPC eksikse sistem sahte varsayılan üretmek yerine `CONFIG_UNAVAILABLE` durumuna geçer ve ilgili route'lar `503 Service Unavailable` döndürür.

| Parametre | Değer | Sözleşme Sabiti |
|---|---|---|
| Ağ | Base (Chain ID 8453) | — |
| Protokol ücreti | %0,2 (her iki taraftan %0,1) | `TAKER_FEE_BPS = 10`, `MAKER_FEE_BPS = 10` |
| Grace period | 48 saat | `GRACE_PERIOD` |
| Escrowed crypto decay başlangıcı | Kanama'dan 96 saat sonra (itirazdaki 144. saat) | `USDT_DECAY_START` |
| Maksimum kanama süresi | 240 saat (10 gün) → YAKILIR | `MAX_BLEEDING` |
| Taker teminat çürüme hızı | 42 BPS / saat | `TAKER_BOND_DECAY_BPS_H` |
| Maker teminat çürüme hızı | 26 BPS / saat | `MAKER_BOND_DECAY_BPS_H` |
| Escrowed kripto çürüme hızı | 34 BPS / saat | `CRYPTO_DECAY_BPS_H` |
| Minimum cüzdan yaşı | 7 gün | `WALLET_AGE_MIN` |
| Native bakiye eşiği (dust limiti) | `0.001 ether` | `DUST_LIMIT` |
| Minimum aktif süre | 15 gün | `MIN_ACTIVE_PERIOD` |
| Tier 0 / 1 cooldown | 4 saat / işlem | `TIER0_TRADE_COOLDOWN`, `TIER1_TRADE_COOLDOWN` |
| Challenge ping bekleme süresi | `PAID`'den sonra 24 saat | `pingTakerForChallenge()` ön koşulu |
| Auto-release ping bekleme süresi | `GRACE_PERIOD` sonrası 24 saat cevap penceresi | `pingMaker()` + `autoRelease()` |
| Karşılıklı iptal son tarih tavanı | 7 gün | `MAX_CANCEL_DEADLINE` |
| EIP-712 domain | `ArafEscrow` / version `1` | `EIP712("ArafEscrow", "1")` |
| Auto-release ihmal cezası | Her iki teminattan %2 | `AUTO_RELEASE_PENALTY_BPS = 200` |
| Tier 0 max miktar | 150 USDT/USDC | `TIER_MAX_AMOUNT_TIER0` |
| Tier 1 max miktar | 1.500 USDT/USDC | `TIER_MAX_AMOUNT_TIER1` |
| Tier 2 max miktar | 7.500 USDT/USDC | `TIER_MAX_AMOUNT_TIER2` |
| Tier 3 max miktar | 30.000 USDT/USDC | `TIER_MAX_AMOUNT_TIER3` |
| Tier 4 max miktar | Limitsiz | `_getTierMaxAmount(4) -> 0` |
| Dust limiti | 0,001 ETH (Base'de ~2$) | `DUST_LIMIT` |
| Temiz itibar indirimi | −%1 | `GOOD_REP_DISCOUNT_BPS = 100` |
| Kötü itibar cezası | +%3 | `BAD_REP_PENALTY_BPS = 300` |
| Yasak tetikleyici | 2+ başarısız uyuşmazlık | `_updateReputation()` |
| 1. yasak süresi | 30 gün | Eskalasyon: `30 × 2^(N−1)` gün |
| Maksimum yasak süresi | 365 gün | Sözleşmede üst sınır zorunlu |
| Treasury ilk adresi | Deploy sırasında verilir ama owner tarafından güncellenebilir | `treasury` + `setTreasury()` |
| Desteklenen token listesi | Statik değil, owner yönetimli | `supportedTokens` + `setSupportedToken()` |

### Derleme ve Ağ Toolchain Varsayımları

- Resmi sözleşme derleme hattı `Solidity 0.8.24 + optimizer(runs=200) + viaIR + evmVersion=cancun` kombinasyonuna dayanır. ABI/bytecode, doğrulama ve yeniden derleme işlemleri bu profile sadık kalmalıdır.
- Hedef ağlar `Base Sepolia (84532)` ve `Base Mainnet (8453)` olarak tanımlıdır; yerel geliştirme için `hardhat` / `localhost` ağları `31337` kullanır.
- Basescan doğrulama altyapısı toolchain'in parçasıdır; explorer doğrulaması bağımsız bir güvenlik garantisi değildir fakat deploy edilen bytecode'un gözden geçirilebilir olmasını sağlar.
- `viaIR` veya `evmVersion` ayarlarının sessizce değiştirilmesi, derleme çıktısının farklılaşmasına ve yanlış bytecode/doğrulama beklentilerine yol açabilir.

### Deploy ve Kurulum Güvenliği

- Production deploy akışında `TREASURY_ADDRESS`, `MAINNET_USDT_ADDRESS` ve `MAINNET_USDC_ADDRESS` geçerli adres olarak sağlanmadan kurulum tamamlanmış sayılmaz.
- Supported token kurulumu yalnız owner çağrısı ile yapılır; ancak güvenli deploy semantiğinde bu çağrıların zincir üstünde yeniden doğrulanması gerekir.
- Ownership devri, desteklenen token seti doğrulanmadan tamamlanmamalıdır.

### Diğer Yönetici Fonksiyonları

Aşağıdaki fonksiyonlar sadece kontrat sahibi (`Owner`) tarafından çağrılabilir ve protokolün temel işleyişini yönetir.

| Fonksiyon | Açıklama |
|---|---|
| `setSupportedToken(address, bool)` | Protokolde alım-satım için desteklenen ERC20 token'larını (örn: USDT, USDC) ekler veya kaldırır. |
| `setTreasury(address)` | Protokol ücretlerinin ve yakılan fonların gönderileceği Hazine (Treasury) adresini günceller. |
| `pause()` | Yeni `createEscrow()` ve `lockEscrow()` girişlerini durdurur; mevcut trade kapanışları açık kalır. |
| `unpause()` | Pause sonrası yeni create/lock akışlarını yeniden açar. |

### Bilgi Amaçlı View / Helper Fonksiyonları

Aşağıdaki fonksiyonlar on-chain gerçekliği **değiştirmez**; görünür kılar. Frontend, analytics ve üçüncü taraf doğrulama katmanları için önemlidir.

| Fonksiyon | Amaç |
|---|---|
| `antiSybilCheck(address)` | Cüzdanın yaş/bakiye/cooldown uygunluğunu hızlı özetler; bağlayıcı enforcement değildir. |
| `getCooldownRemaining(address)` | Cooldown kalan süresini UX için görünür kılar. |
| `getCurrentAmounts(uint256)` | Bleeding sonrası anlık ekonomik durumu doğrudan kontrattan verir. |
| `getFirstSuccessfulTradeAt(address)` | Tier yükselişinin zaman bileşenini açıklamak için ilk başarılı işlemi gösterir. |
| `getReputation(address)` | Özet reputation görünümü sağlar; tüm ilişkili storage alanlarını kapsamaz. |
| `domainSeparator()` | EIP-712 imza akışlarının doğru domain'e bağlandığını doğrulamaya yarar. |


---

## 14. Gelecek Evrim Yolu

Araf Protokolü'nün gelişimi, teknik olgunluk ve ekosistem büyümesine paralel olarak aşağıdaki dört ana aşamada gerçekleşecektir:

| Faz | Odak Noktası | Temel Özellikler & Kilometre Taşları |
| :--- | :--- | :--- |
| **Faz 1** | **Güvenlik & Lansman** | • Akıllı Sözleşme Audit (Bağımsız Denetim)<br>• Base Sepolia Public Beta<br>• Gnosis Safe (3/5) Hazine Geçişi<br>• AWS KMS / Vault Entegrasyonu |
| **Faz 2** | **Mainnet & UX** | • Base Mainnet Resmi Lansman<br>• Base Smart Wallet (Passkey) Desteği<br>• Paymaster (Gasless) Uygulaması<br>• PWA Mobil Arayüz |
| **Faz 3** | **Genişleme & Likidite** | • Order Book & Subgraph İndeksleme<br>• Multi-Asset Swap (ETH, cbBTC vb.)<br>• Retroactive Staking & Ödül Mekanizması<br>• Kurumsal Maker API Desteği |
| **Faz 4** | **Gizlilik & Vizyon** | • ZK-Proof ile Anonim IBAN Doğrulama<br>• OP Superchain Cross-Chain Escrow<br>• Küresel Fiat-Kripto Likidite Katmanı |

---


## 15. Frontend UX Koruma Katmanı (Mart 2026)

Bu sürümde UI katmanı; **hakemlik yapmadan**, kullanıcıyı yüksek maliyetli hata akışlarından uzaklaştıracak biçimde güncellenmiştir. Kritik ilke korunur: **karar mercii daima kontrattır**, frontend yalnızca yönlendirir.

### 15.1 Geri Bildirim Akışı (TR/EN)

- Geri bildirim modalı iki dilde daha açıklayıcı hale getirildi.
- Kategori + yıldız zorunluluğu korunurken minimum açıklama uzunluğu (12 karakter) eklendi.
- Amaç: yüzeysel raporları azaltıp gerçek TX/revert kök nedenlerini daha hızlı yakalamak.
- Başarısız API çağrılarında artık yanlışlıkla “başarılı” toast gösterilmez; hata kullanıcıya net biçimde yansıtılır.

### 15.2 Ana Sayfa Bilgilendirme Katmanı

- Responsive bir **"P2P Nasıl Çalışır?"** bölümü eklendi.
- Uyuşmazlık çözümünün backend veya insan hakem değil, on-chain oyun teorisi ile yürüdüğü açık biçimde anlatıldı.
- Buna ek olarak FAQ bloğu ile sık sorulan sorulara kısa, iki dilli açıklamalar eklendi.

### 15.3 Footer ve Kamusal Yönlendirme

- Tüm görünümlerde modern bir footer standardı tanımlandı: `Araf © 2026`.
- GitHub / Twitter / Farcaster yönlendirmeleri tek satırda sunularak protokolün kamusal varlığı görünür kılındı.
- Linkler env değişkenleri ile (`VITE_SOCIAL_*`) override edilebilir; bu yaklaşım farklı dağıtımlarda kod değişimi gerektirmez.

### 15.4 Mimari Sonuç

Bu katman, protokol güvenlik modelini değiştirmez; yalnızca kullanıcı hatalarını ve gereksiz işlem maliyetini azaltır:

- ✅ On-chain state machine değişmedi.
- ✅ Hakemlik ve backend takdiri eklenmedi.
- ✅ Revert'e yol açan eksik kullanıcı girdileri önceden yakalanıyor.
- ✅ UX iyileştirmesi = daha düşük operasyonel sürtünme, daha az destek yükü.

---

### Hibrit Neden Dürüsttür

**Merkeziyetsizleştirdiğimiz (kritik kısımlar):**
- ✅ Fon emaneti — emanet tutmayan akıllı sözleşme
- ✅ Uyuşmazlık çözümü — zaman bazlı, insan kararı yok
- ✅ İtibar bütünlüğü — değiştirilemez on-chain kayıtlar
- ✅ Anti-Sybil zorunluluğu — on-chain kontroller

**Merkezileştirdiğimiz (gizlilik / performans):**
- ⚠️ PII depolama — GDPR, silme yeteneği gerektiriyor
- ⚠️ Emir defteri indekslemesi — UX için saniye altı sorgular
- ⚠️ Rate limit / nonce / checkpoint koordinasyonu — kısa ömürlü operasyonel state

**Backend ASLA kontrol etmez:**
- ❌ Fon emaneti | ❌ Uyuşmazlık sonuçları | ❌ İtibar puanları | ❌ İşlem durum geçişleri

---

*Araf Protokolü — "Sistem yargılamaz. Dürüstsüzlüğü pahalıya mal eder."*
