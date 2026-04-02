

# Araf V3: Kademe Uyumlu (Tier-Aware) Sağlık Skoru Teknik Raporu

## 1. Felsefe ve Esneklik İhtiyacı
Araf Sağlık Skoru (Health Score), kullanıcıların güvenilirliğini ölçerken **"Rütbeye Göre Tolerans"** ilkesini benimser. 

Yeni (Tier 0-1) bir kullanıcının banka hesabını sık değiştirmesi yüksek ihtimalle dolandırıcılık (Money Mule / Triangulation) sinyalidir ve sert cezalandırılır. Ancak platformun belkemiği olan Elit Piyasa Yapıcıların (Tier 3-4) banka hesabı değiştirmesi bir likidite yönetimi (hesap limiti dolması) zorunluluğudur. Bu nedenle üst kademeler, profil güncellemelerindeki şüphe cezalarından matematiksel olarak muaf tutulur. Adalet (uyuşmazlık) ve Hız (liveness) konusunda ise sistem herkese eşit derecede acımasızdır.

---

## 2. Puanlama Matrisi ve Kademeli (Tier) Ağırlıklar

Skor hesaplaması şu formüle dayanır:
`Health Score = clamp(BAZ_PUAN + POZİTİFLER - NEGATİFLER, 0, 100)`

### A. Sisteme Giriş ve Pozitifler
* **Baz Puan:** `+40 Puan` (Sisteme giren herkes bu nötr puanla başlar).
* **İstikrar Bonusu:** Son 30 gündür IBAN değiştirmeyenlere `+20 Puan`.
* **Deneyim Primi:** Başarılı her işlem için `+2 Puan` (Maksimum `+40 Puan` alınabilir).

### B. Kademe Uyumlu (Tier-Aware) Negatif Cezalar
Baskıyı azaltmak için cezalar, kullanıcının `reputation_cache.effective_tier` değerine göre dinamik olarak tırpanlanır.

**1. Taze IBAN Riski (Son 24 Saatte Değişim)**
* **Tier 0 ve Tier 1:** `-20 Puan` *(Sert ceza, risk yüksek)*
* **Tier 2:** `-10 Puan` *(Hafif uyarı)*
* **Tier 3 ve Tier 4:** `0 Puan` *(Muafiyet: Elit satıcılar likidite için IBAN değiştirmekte özgürdür).*

**2. Sık Değişim Riski (Son 7 Günde 3'ten Fazla Değişim)**
* **Tier 0 ve Tier 1:** `-30 Puan` *(Money Mule şüphesi, çok sert ceza)*
* **Tier 2:** `-15 Puan` *(Orta riskli esneklik)*
* **Tier 3 ve Tier 4:** `0 Puan` *(Muafiyet: Kurumsal MM davranışı).*

**3. Evrensel Cezalar (Kimseye Muafiyet Yoktur!)**
Suçun niteliği dürüstlük ve hıza dayandığında Tier'ın hiçbir önemi yoktur:
* **Haksız Uyuşmazlık (Failed Dispute):** Kaybedilen her itiraz için `-30 Puan`. (Sistem yalanı affetmez).
* **Zaman Aşımı / Oyalama (Ping Yeme):** Alınan her Ping için `-10 Puan`. (İster Tier 4 ol ister Tier 1, işlemi yavaşlatamazsın).
* **Trol (Flake) Oranı:** İşlemlerin %30'undan fazlası İptal/Yanma ile bitiyorsa `-20 Puan`.

---

## 3. Senaryo Modellemesi (Gerçek Hayat Simülasyonu)

| Kullanıcı Profili | Davranış | Çarpan Hesabı | Sonuç Skor | UI Rengi |
| :--- | :--- | :--- | :--- | :--- |
| **Sıradan Kullanıcı (Tier 1)** | 1 saat önce IBAN değiştirdi. | 40 (Baz) + 10 (Deneyim) - **20 (Taze IBAN)** | **30 Puan** | 🔴 Yüksek Risk |
| **Düzenli Satıcı (Tier 2)** | 1 saat önce IBAN değiştirdi. | 40 (Baz) + 40 (Deneyim) - **10 (Hafif Ceza)** | **70 Puan** | 🟢 Güvenilir |
| **Elit Piyasa Yapıcı (Tier 4)** | 1 saat önce IBAN değiştirdi. (Sıfır Ceza) | 40 (Baz) + 40 (Deneyim) - **0 (Muaf)** | **80 Puan** | 🟢 Çok Güvenilir |
| **Elit Piyasa Yapıcı (Tier 4)** | Uyuşmazlık kaybetti (Yalan Söyledi) | 40 (Baz) + 40 (Deneyim) - **30 (Dispute)** | **50 Puan** | 🟡 Nötr / Uyarı |

*Analiz Çıktısı:* Görüldüğü üzere bir Tier 4 satıcısı, sürekli banka hesabı değiştirse bile sistemi sömürmediği ve hızlı/dürüst olduğu sürece her zaman "Yeşil/Güvenilir" bölgede kalır. Baskı tamamen sıfırlanmıştır.

---

## 4. Backend Mantığı (`trades.js` Önerisi)

Algoritmanın sunucu tarafındaki esnek ve hızlı hesaplama fonksiyonu:

```javascript
function _calculateTierAwareHealthScore(trade, makerUser) {
  let score = 40; // Baz Puan

  const now = Date.now();
  const lastChangeTime = makerUser?.lastBankChangeAt ? new Date(makerUser.lastBankChangeAt).getTime() : now;
  const hoursSinceChange = (now - lastChangeTime) / (1000 * 60 * 60);
  const count7d = makerUser?.bankChangeCount7d || 0;
  
  const tier = makerUser?.reputation_cache?.effective_tier || 0;
  const successfulTrades = makerUser?.reputation_cache?.successful_trades || 0;
  const failedDisputes = makerUser?.reputation_cache?.failed_disputes || 0;

  // 1. Pozitif Primi Ekle
  if (hoursSinceChange > (30 * 24)) score += 20; // İstikrar
  score += Math.min(successfulTrades * 2, 40);   // Deneyim Tavanı

  // 2. Kademe Uyumlu (Tier-Aware) Cezalar
  if (hoursSinceChange <= 24) {
    if (tier <= 1) score -= 20;
    else if (tier === 2) score -= 10;
    // Tier 3 ve 4 muaf
  }

  if (count7d >= 3) {
    if (tier <= 1) score -= 30;
    else if (tier === 2) score -= 15;
    // Tier 3 ve 4 muaf
  }

  // 3. Evrensel Cezalar (Adalet ve Hız)
  score -= (failedDisputes * 30);
  // (Not: Ping cezaları eklenecek)

  // 4. Clamping & UI Renk Çıktısı
  score = Math.max(0, Math.min(score, 100));
  
  let uiColor = "YELLOW";
  if (score >= 70) uiColor = "GREEN";
  if (score <= 39) uiColor = "RED";

  return { score, uiColor };
}
```

---

## 5. Alıcı ve Satıcıyı Ortada Buluşturan UX

1. **Satıcı (Maker) Açısından:** "Platform benim Tier 4 bir şirket/MM olduğumu ve limitlerim dolduğu için hesap değiştirdiğimi biliyor. Sırf dün IBAN ekledim diye tahtamı kırmızıya boyayıp müşterilerimi kaçırmıyor. Araf adil bir sistem."
2. **Alıcı (Taker) Açısından:** "Sistem bana IP sorunu, coğrafya, detaylı log gibi karmaşık veriler sunmuyor. Sadece net bir 'Güven Skoru' gösteriyor. Eğer karşımda Tier 4 bir balina varsa, onun banka hesabının yeni olması dolandırıcı olduğu anlamına gelmez, sistem bunu benim yerime hesaplayıp 'Yeşil' onayı vermiş."

***
