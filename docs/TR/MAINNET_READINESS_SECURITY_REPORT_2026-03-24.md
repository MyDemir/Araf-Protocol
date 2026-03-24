# 🛡️ Araf Protocol — Mainnet Hazırlık Güvenlik Raporu (Detaylı)

**Tarih:** 24 Mart 2026  
**Kapsam:** Smart Contract + Backend + Frontend + Operasyonel Altyapı  
**Prensip:** _Kod kanundur_ — Backend/Frontend hakem veya sonuç belirleyici olamaz.

---

## 1) Yönetici Özeti

### Mainnet Hazır mı?

**Kısa cevap: Hayır, henüz tam hazır değil.**

Sözleşme tabanlı uyuşmazlık felsefesi doğru yönde olsa da, UI/Backend katmanında bazı kritik akışlar (özellikle challenge başlatma, state senkronu, miktar/decimal hesapları) kullanıcıyı yanlış eyleme sürükleyebilecek durumdaydı. Bu raporla birlikte P0/P1 seviyesinde ilk düzeltmeler atıldı.

### Bu turda atılan somut adımlar

- Maker challenge akışı PAID ekranında görünür/işler hale getirildi.
- Polling sırasında `tradeState` senkron eksikliği giderildi.
- Fiat/crypto dönüşüm ve token decimal hesapları dinamikleştirildi.
- Cooldown kalan süresi on-chain `getCooldownRemaining` ile UI’da gösterilmeye başlandı.
- Listing iptalinde DB senkron silme çağrısı eklendi.
- `trust proxy` tüm ortamlarda aktif edilerek IP tabanlı kontrol tutarlılığı artırıldı.

---

## 2) Felsefe Uyum Değerlendirmesi (Kod Kanundur)

### Güçlü Yanlar

- Uyuşmazlık çözümünün on-chain zamanlayıcılara dayanması.
- Backend'in fon serbest bırakma yetkisi olmaması.
- Anti-Sybil/Tier mantığının sözleşmede bulunması.

### Riskli Alanlar (Felsefeyi Zayıflatan)

1. **UI eksik akışları** kullanıcıyı yanlış karar noktasına itebiliyor (ör. challenge butonu yoksa maker fiilen çaresiz kalıyor).
2. **State ayrışması** (local vs polling) kullanıcıya yanlış state göstererek “off-chain hakemlik hissi” doğuruyor.
3. **Hatalı miktar hesapları** (fiat/decimal) ekonomik olarak kullanıcıyı cezalandırabiliyor.

---

## 3) Kritik Bulgular ve Durum

## P0 — Mainnet Öncesi Zorunlu

1. **Challenge başlatma yolu görünürlüğü (Maker, PAID):**
   - Durum: **DÜZELTİLDİ (bu tur)**
   - Not: `pingTakerForChallenge` ve ardından `challengeTrade` için ayrı buton/timer akışı eklendi.

2. **`tradeState` polling senkronu:**
   - Durum: **DÜZELTİLDİ (bu tur)**
   - Not: Polling güncellemesinde `setTradeState(updated.status)` tetikleniyor.

3. **Fiat/crypto + decimal hesaplama hatası (`handleStartTrade`, `handleCreateEscrow`):**
   - Durum: **DÜZELTİLDİ (bu tur)**
   - Not: Token decimal on-chain okunuyor; startTrade tarafında fiat/rate -> crypto dönüşümü uygulanıyor.

## P1 — Mainnet Öncesi Kuvvetle Önerilen

4. **Cooldown kalan süresinin kullanıcıya gösterilmesi:**
   - Durum: **DÜZELTİLDİ (bu tur)**
   - Not: `getCooldownRemaining` eklendi ve buton etiketinde süre gösteriliyor.

5. **Listing iptali sonrası DB senkronu:**
   - Durum: **DÜZELTİLDİ (bu tur)**
   - Not: On-chain cancel sonrası `DELETE /api/listings/:id` çağrısı eklendi.

6. **Chargeback ack state geri yükleme:**
   - Durum: **KISMEN DÜZELTİLDİ (bu tur)**
   - Not: trade verisinden `chargebackAck` okunup checkbox state restore ediliyor.

7. **Proxy/IP tutarlılığı (`trust proxy`):**
   - Durum: **DÜZELTİLDİ (bu tur)**
   - Not: `app.set('trust proxy', true)` tüm ortamlarda aktif.

## P2 — Takip Turunda

8. **`approve` başarısızlık sonrası allowance cleanup (`approve(0)`):**
   - Durum: **AÇIK**
9. **İleri seviye idempotency / replay korumaları (event listener):**
   - Durum: **AÇIK/KISMİ**
10. **Operasyonel alarm/observability standardizasyonu:**
   - Durum: **AÇIK**

---

## 4) Altyapı ve Maliyet (Free Plan Odaklı)

Yeni proje + free plan kısıtı için önerilen azaltımlar:

1. **Polling maliyeti azaltma**
   - Trade room polling’i sabit 15 sn yerine _state-aware adaptive_ yap:
     - LOCKED/PAID: 20–30 sn
     - CHALLENGED son 24 saat: 10–15 sn
     - Arka plan sekmede: 45–60 sn

2. **Log yazım maliyeti**
   - Client error logları için sampling (%10/%20) + dedup key.
   - Aynı hata mesajını kısa pencerede tek kayıtla birleştir.

3. **Mongo indeks optimizasyonu**
   - `trades`: `(maker_address,status,created_at)`, `(taker_address,status,created_at)`
   - `listings`: `(status,exchange_rate,_id)`
   - `events`: idempotency için `(tx_hash,log_index)` unique

4. **Redis fail-open + memory guard**
   - Zaten fail-open yaklaşımı var; ek olarak key TTL disiplini ve per-route quota metrikleri tutulmalı.

5. **Receipt upload maliyeti**
   - Büyük dosyalarda memory yerine stream/disk tabanlı akışa geçiş (CPU/RAM piklerini azaltır).

---

## 5) Kod Bazlı Uygulama Adımları (Bu rapor sonrası)

### Aşama-1 (hemen)
- [x] Frontend challenge UI + timer guard
- [x] Frontend state senkronu
- [x] Dynamic decimals + fiat/crypto dönüşümü
- [x] Cooldown remaining gösterimi
- [x] Listing delete DB senkronu
- [x] trust proxy tutarlılığı

### Aşama-2 (sonraki PR)
- [ ] `approve(0)` rollback akışı
- [ ] Event replay idempotency standart tablosu
- [ ] Adaptive polling ve sekme görünürlüğü optimizasyonu
- [ ] Client log sampling/dedup

### Aşama-3 (mainnet check)
- [ ] Dry-run incident drill (RPC kesintisi, Redis kesintisi, Mongo yavaşlatma)
- [ ] 72 saat soak test (memory leak, reconnect, DLQ davranışı)
- [ ] Ekonomik saldırı senaryoları (spam, cooldown abuse, cancellation abuse)

---

## 6) Nihai Karar

**Mainnet’e geçiş için henüz “GO” verilmemeli.**

Bu turdaki düzeltmeler kritik riskleri önemli ölçüde düşürdü; ancak P2 açıkları ve operasyonel dayanıklılık testleri tamamlanmadan mainnet riski gereksiz yüksek kalır. 

**Öneri:** En az 1 ek hardening turu + soak test tamamlandıktan sonra Go/No-Go kararı.

