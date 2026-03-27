# Araf Protocol — Geliştirici Ekibi İçin Nihai Güvenlik Düzeltme Raporu

**Tarih:** 27 Mart 2026  
**Hedef kitle:** Geliştirici ekip / maintainer’lar  
**Karar:** **NO-GO**  
**Amaç:** Dört ayrı agent çıktısını tek bir teknik düzeltme planında birleştirmek ve doğrudan kod incelemesinden çıkan ek notları eklemek.

---

## 1. Bu rapor nasıl okunmalı

Bu belge iki kaynağı birleştirir:

1. **Paylaşılan agent çıktıları**  
   Bunlar Tur 1–8 denetimlerinden türetilmiş konsolide bulguları içeriyor.

2. **Doğrudan GitHub kod incelemesi ile yaptığım ek spot-check’ler**  
   Özellikle şu dosyalar yeniden açılıp kontrol edildi:
   - `backend/scripts/routes/pii.js`
   - `backend/scripts/middleware/rateLimiter.js`
   - `backend/scripts/routes/trades.js`
   - `backend/scripts/routes/receipts.js`
   - `backend/scripts/services/siwe.js`
   - `backend/scripts/app.js`
   - `backend/scripts/services/eventListener.js`
   - `backend/scripts/models/Trade.js`
   - `backend/scripts/routes/feedback.js`
   - `backend/scripts/routes/logs.js`
   - `frontend/src/hooks/usePII.js`
   - `frontend/src/components/PIIDisplay.jsx`
   - `frontend/src/hooks/useArafContract.js`

### Güven seviyesi notu
- **Yüksek güven:** Birden fazla agent tarafından işaretlenmiş ve kod spot-check ile desteklenmiş bulgular
- **Orta güven:** Agent çıktılarında geçen ama burada sadece kısmi doğrulanan bulgular
- **Metodoloji çekincesi:** 2. agent, tur kapanışlarının ve kanıt zincirinin tamamlanma kalitesine itiraz ediyor. Bu itiraz önemlidir; fakat teknik riskleri ortadan kaldırmaz.

---

## 2. Yönetici özeti

Dört agent çıktısı ve ek kod spot-check’ler birlikte değerlendirildiğinde sonuç nettir:

**Araf Protocol şu an mainnet için hazır değil.**

En kritik risk alanları:
- auth/session/wallet senkronu
- 409 mismatch sonrası forced invalidation eksikliği
- `realTradeId` çözülemeyince yanlış kimlikle devam edilmesi
- zero `listingRef` yüzünden on-chain/off-chain bağ kopması
- Redis kesintisinde auth limiter fail-open davranışı
- frontend restore mantığının backend session güvenliğinden daha baskın hale gelmesi

---

## 3. Nihai mainnet kararı

## Karar
**NO-GO**

## Mainnet’i durduran çekirdek blocker’lar
1. **ARAF-01** — zero `listingRef` ile authoritative bağ kopması
2. **ARAF-02** — 409 mismatch sonrası forced backend invalidation eksikliği
3. **ARAF-03** — `realTradeId` fallback ile ID drift
4. **ARAF-04** — auth limiter Redis down durumunda fail-open
5. **ARAF-05** — nonce atomikliği kalıntısı
6. **ARAF-06** — auth restore zincirinin frontend doğruluğuna aşırı bağımlı olması

---

## 4. Konsolide bulgu özeti

| Yeni ID | Başlık | Ciddiyet | Blocker | Kaynak Gücü |
|---|---|---:|---:|---|
| ARAF-01 | Zero `listingRef` / authoritative bağ kopması | YÜKSEK | Evet | Güçlü |
| ARAF-02 | 409 mismatch sonrası forced invalidation eksikliği | YÜKSEK | Evet | Güçlü |
| ARAF-03 | `realTradeId` fallback / ID drift | YÜKSEK | Evet | Güçlü |
| ARAF-04 | Auth limiter Redis kesintisinde fail-open | YÜKSEK | Evet | Güçlü |
| ARAF-05 | Nonce atomikliği kalıntısı | YÜKSEK | Evet | Orta-Güçlü |
| ARAF-06 | Auth restore mimarisi frontend’e aşırı bağımlı | YÜKSEK | Evet | Güçlü |
| ARAF-07 | `requireSessionWalletMatch` politikasının parçalı uygulanması | ORTA | Hayır | Güçlü |
| ARAF-08 | PII token / PII read zincirinde residual risk | ORTA | Hayır | Orta |
| ARAF-09 | Backend relay / on-chain truth split | ORTA | Hayır | Güçlü |
| ARAF-10 | Receipt hash / evidence integrity drift | ORTA | Hayır | Orta |
| ARAF-11 | Listener / DLQ / replay operasyonel riskleri | ORTA | Hayır | Orta |
| ARAF-12 | Docs / test / checklist / runbook drift | ORTA | Hayır | Güçlü |
| ARAF-13 | Frontend contract hook production log fallback riski | ORTA | Hayır | Doğrudan kod gözlemi |
| ARAF-14 | `feedback` route session-wallet guard eksikliği + backend min-length boşluğu | DÜŞÜK | Hayır | Doğrudan kod gözlemi |
| ARAF-15 | `logs` route yorum/kod drift’i ve multi-instance rate-limit belirsizliği | DÜŞÜK | Hayır | Doğrudan kod gözlemi |

---

## 5. Detaylı bulgular

## [ARAF-01] Zero `listingRef` ile on-chain escrow / off-chain trade bağının kopması
**Ciddiyet:** YÜKSEK  
**Mainnet Blocker:** Evet

### Teknik açıklama
Kontrat tarafında `listingRef` zorunlu değilse zincirde escrow oluşabiliyor; event listener ise authoritative bağ kuramadığında trade kaydı oluşturmuyor. Bu, zincirde var olan bir işlemin backend/UI tarafında görünmemesine yol açıyor.

### Etki
- on-chain / backend truth split
- trade room erişilemezliği
- operasyonel takip ve kullanıcı desteği zorluğu
- future multi-listing senaryolarında daha büyük veri sapması

### Etkilenen alanlar
- contract create path
- `backend/scripts/services/eventListener.js`

### Çözüm
- Kontratta `listingRef` zorunlu hale getirilmeli
- zero `listingRef` path’i revert etmeli
- listener authoritative olmayan create event’lerini “recover edilebilir ama geçerli değil” yerine “invalid contract API usage” olarak ele almalı

### Fix sonrası test
- zero `listingRef` ile revert testi
- listener tarafında trade üretmeme + alarm testi
- frontend’in her zaman authoritative ref gönderdiği integration testi

---

## [ARAF-02] 409 mismatch sonrası forced backend invalidation eksikliği
**Ciddiyet:** YÜKSEK  
**Mainnet Blocker:** Evet

### Teknik açıklama
Wallet mismatch halinde 409 dönüyor; ancak session invalidation her durumda backend tarafından zorunlu yapılmıyor. Sistem, frontend’in logout endpoint’ini doğru çağıracağı varsayımına fazla yaslanıyor.

### Etki
- stale cookie / stale session
- UI çıkmış görünürken backend session canlı kalabilir
- eski wallet bağlamında hassas read/write denemeleri mümkün olabilir

### Etkilenen alanlar
- `frontend/src/App.jsx`
- `backend/scripts/routes/auth.js`
- `backend/scripts/middleware/auth.js`

### Çözüm
- mismatch response sonrası forced revoke/clear-cookie modeli değerlendirilmeli
- frontend `authenticatedFetch` 409 dalı best-effort değil, zorunlu logout yoluna bağlanmalı
- restore zinciri mismatch sonrası kesin olarak kırılmalı

### Fix sonrası test
- Wallet A → Wallet B geçişi
- 409 sonrası cookie yaşam döngüsü
- 409 sonrası `/api/auth/me`, `/api/pii/my`, `/api/trades/my` davranışı

---

## [ARAF-03] `realTradeId` fallback ile ID drift
**Ciddiyet:** YÜKSEK  
**Mainnet Blocker:** Evet

### Teknik açıklama
Gerçek backend trade `_id` bulunamadığında listing ID veya başka bir fallback kimlikle akışa devam edilmesi, trade kimlik modelini bozuyor.

### Etki
- yanlış trade room
- `chargeback-ack`, `propose-cancel`, PII ve detail fetch zincirinin yanlış resource ile çalışması
- sessiz 404/403
- audit kaybı
- kullanıcıya yanlış başarı hissi

### Etkilenen alanlar
- `frontend/src/App.jsx`
- `backend/scripts/routes/trades.js`
- `backend/scripts/routes/pii.js`

### Çözüm
- `realTradeId` bulunamazsa trade room açılmamalı
- listing id / trade `_id` / onchain id tipleri karıştırılmamalı
- listener gecikmesini fallback ile maskelemek yerine açık retry / bekleme state’i oluşturulmalı

### Fix sonrası test
- `by-escrow` gecikme simülasyonu
- wrong-ID ile propose-cancel / chargeback-ack / PII request testleri
- UI fallback davranışı

---

## [ARAF-04] Auth limiter Redis kesintisinde fail-open
**Ciddiyet:** YÜKSEK  
**Mainnet Blocker:** Evet

### Teknik açıklama
`backend/scripts/middleware/rateLimiter.js` içinde Redis hazır değilse auth limiter skip ediyor. Bu davranış availability’yi koruyor, ama auth abuse yüzeyini büyütüyor.

### Etki
- `/nonce`, `/verify`, `/refresh` koruması zayıflar
- brute-force / spam maliyeti düşer
- auth limiter’ın güvenlik önemi diğer limiter’lardan daha yüksektir

### Doğrudan kod notu
Bu davranış `piiLimiter`, `tradesLimiter`, `feedbackLimiter` gibi limiter’larda da aynı aileye ait; ama auth tarafındaki etkisi daha kritik.

### Çözüm
- auth için ayrı degraded mode
- Redis yoksa in-memory fallback veya fail-closed stratejisi
- auth ve non-auth limiter stratejilerini ayır

### Fix sonrası test
- Redis kapalıyken auth route rate-limit testi
- çoklu instance ortamında limiter davranışı
- chaos test

---

## [ARAF-05] Nonce atomikliği kalıntısı
**Ciddiyet:** YÜKSEK  
**Mainnet Blocker:** Evet

### Teknik açıklama
`siwe.js` içinde `SET NX` ile nonce üretimi iyileştirilmiş olsa da agent çıktıları, bu sonucun tam güvenli biçimde yönetilmediğini işaretliyor. Bu residual race ihtimali bırakıyor.

### Etki
- nondeterministic auth davranışı
- aynı wallet için edge-case nonce sapması
- nadir ama kritik SIWE kırığı

### Çözüm
- `SET NX` sonucu kesin kontrol edilmeli
- başarısız yazım durumunda tekrar okuma veya hata dönüşü yapılmalı
- nonce üretim akışı tek bir güvenli karar noktasına indirilmeli

### Fix sonrası test
- paralel nonce istekleri
- paralel verify denemeleri
- Redis gecikmeli yanıt simülasyonu

---

## [ARAF-06] Auth restore zincirinin frontend doğruluğuna aşırı bağımlı olması
**Ciddiyet:** YÜKSEK  
**Mainnet Blocker:** Evet

### Teknik açıklama
Auth restore modeli, backend strict binding yerine frontend’in aktif wallet ile session wallet’i doğru yorumlayacağı varsayımına dayanıyor.

### Etki
- yanlış account restore
- stale session ile eski trade verisini bağlama
- auto-resume ile yanlış odaya dönüş
- session güvenliğinin UI davranışına emanet edilmesi

### Çözüm
- `/api/auth/me` politikasını sertleştir
- strict wallet-binding gerektiren read endpoint’leri sınıflandır
- restore mantığını “connected wallet hazır + signed session geçerli” şartlarına bağla

### Fix sonrası test
- page refresh
- wallet switch
- disconnect/reconnect
- çoklu tab senaryosu

---

## [ARAF-07] `requireSessionWalletMatch` politikasının parçalı uygulanması
**Ciddiyet:** ORTA  
**Mainnet Blocker:** Hayır

### Teknik açıklama
Bazı route’larda guard var, bazılarında yok. Bu, güvenlik modelini açık bir kurala değil, endpoint bazlı yamaya dönüştürüyor.

### Etki
- yeni endpoint’lerde guard unutma riski
- read-only sanılan endpoint’lerde stale session veri sızıntısı
- güvenlik modelinin bakım maliyeti artar

### Çözüm
- endpoint policy matrix çıkar
- endpoint’leri şu şekilde sınıfla:
  1. strict wallet binding zorunlu
  2. ownership check yeterli
  3. public/read-safe
- testleri buna göre yeniden yaz

---

## [ARAF-08] PII token ve read zincirinde residual risk
**Ciddiyet:** ORTA  
**Mainnet Blocker:** Hayır

### Teknik açıklama
`request-token` ile final `GET /api/pii/:tradeId` ayrı güven katmanları. Final read güçlü olsa bile issuance zayıflığı zinciri zayıflatabiliyor.

### Doğrudan kod notu
`backend/scripts/routes/pii.js` içinde:
- `POST /request-token/:tradeId` → `requireAuth` var, `requireSessionWalletMatch` yok
- `GET /my` → `requireAuth`, `piiLimiter`
- `GET /taker-name/:onchainId` → `requireAuth`, ownership check
Bu yapı stale session koşulunda değerlendirilmeli.

### Çözüm
- `request-token` için session-wallet guard ekle
- `/pii/my` ve maker-only read akışlarını strict binding açısından gözden geçir
- PII token yaşam döngüsünü session invalidation ile hizala

---

## [ARAF-09] Backend relay / on-chain truth split
**Ciddiyet:** ORTA  
**Mainnet Blocker:** Hayır

### Teknik açıklama
`propose-cancel` ve `chargeback-ack` gibi akışlarda on-chain işlem ile backend audit trail farklı hızlarda veya farklı resource kimlikleriyle ilerleyebiliyor.

### Etki
- hukuki/audit kayıt zayıflar
- destek ve inceleme süreçleri zorlaşır
- kullanıcıya yanlış operasyonel gerçeklik gösterilebilir

### Çözüm
- on-chain fallback başarısını backend audit başarısından ayır
- swallow edilen hata noktalarını kapat
- UI başarı sinyalini audit kaydı ile karıştırma

---

## [ARAF-10] Receipt hash / evidence integrity drift
**Ciddiyet:** ORTA  
**Mainnet Blocker:** Hayır

### Teknik açıklama
`receipts.js` atomik upload korumaları açısından güçlü görünüyor; ancak agent çıktılarında ve akış analizinde, kontrata giden payment hash ile backend’de tutulan gerçek encrypted receipt arasında drift ihtimali var.

### Etki
- dispute anında kanıt zinciri bozulur
- on-chain ve backend evidence aynı şeyi temsil etmeyebilir

### Çözüm
- reportPayment öncesi hash köken doğrulaması
- frontend’de hash format ve kaynak kontrolü
- mümkünse backend-issued hash dışındaki değerleri reddet

---

## [ARAF-11] Listener / DLQ / replay operasyonel riskleri
**Ciddiyet:** ORTA  
**Mainnet Blocker:** Hayır

### Teknik açıklama
`eventListener.js` güçlü savunmalar içerse de, DLQ poison entry, synthetic event tipi ve replay operasyonelliği alanlarında residual risk var.

### Doğrudan kod notu
`eventListener.js` içinde:
- `_addToDLQ` argümanları string’e çeviriyor
- `buildSyntheticEventFromDLQEntry` bunları named args’a map ediyor
- BigInt alanlarda tip normalizasyonunun eksik kaldığı senaryolar operasyonel veri sapması üretebilir

### Çözüm
- synthetic event reconstruction’da tip normalizasyonu
- DLQ poison retention/runbook
- replay E2E testleri

---

## [ARAF-12] Docs / test / checklist / runbook drift
**Ciddiyet:** ORTA  
**Mainnet Blocker:** Hayır

### Teknik açıklama
Kod ve güvenlik fix’leri ilerlemiş; ancak docs, readiness checklist ve bazı test fixture’ları aynı hızda güncellenmemiş.

### Etki
- yanlış operasyonel karar
- güvenlik modeli yanlış anlaşılır
- testlerin güvenilirliği düşer

### Çözüm
- docs/test/code senkron güncelleme
- readiness checklist canonical anahtarlarla hizalanmalı
- kırık test fixture’lar düzeltilmeli

---

## [ARAF-13] Frontend contract hook production log fallback riski
**Ciddiyet:** ORTA  
**Mainnet Blocker:** Hayır

### Doğrudan kod gözlemi
`frontend/src/hooks/useArafContract.js` içinde contract/approve/mint hata logları için:
- `VITE_API_URL` yoksa fallback `http://localhost:4000/api`
- production build’de env eksikse browser localhost’a log göndermeye çalışır

### Etki
- production’da hata telemetrisi sessizce başarısız olur
- kullanıcı tarafında güvenlik kırığı değil, ama operasyonel görünürlük zayıflar
- localhost fallback production’da yanlış network davranışı yaratır

### Çözüm
- production’da `VITE_API_URL` yoksa log gönderimini tamamen kapat
- localhost fallback yalnız development için geçerli olsun

### Not
4. agent bunu blocker olarak sınıflamış. Benim değerlendirmem: **önemli ama release blocker değil**.

---

## [ARAF-14] `feedback` route session-wallet guard eksikliği ve backend min-length boşluğu
**Ciddiyet:** DÜŞÜK  
**Mainnet Blocker:** Hayır

### Doğrudan kod gözlemi
`backend/scripts/routes/feedback.js` içinde:
- `POST /api/feedback` yalnız `requireAuth` + `feedbackLimiter` kullanıyor
- `requireSessionWalletMatch` yok
- `comment` alanında backend minimum uzunluk kontrolü yok; boş string kabul ediliyor

### Etki
- stale session penceresinde yanlış wallet adına feedback yazılabilir
- veri kalitesi düşer
- düşük etkili ama güvenlik modeliyle tutarsız

### Çözüm
- `requireSessionWalletMatch` ekle
- backend comment min length belirle
- frontend ve backend validasyonu hizala

---

## [ARAF-15] `logs` route yorum/kod drift’i ve multi-instance belirsizliği
**Ciddiyet:** DÜŞÜK  
**Mainnet Blocker:** Hayır

### Doğrudan kod gözlemi
`backend/scripts/routes/logs.js` içinde:
- yorumlar Redis yoksa in-memory fallback anlatıyor
- `inMemoryRateLimit` fonksiyonu tanımlı ama kullanılmıyor
- `logRateLimiter` için ayrı Redis store tanımlı değil; express-rate-limit’in default davranışına dayanıyor

### Etki
- yorum ile gerçek davranış uyumsuz
- multi-instance ortamda limiter semantiği belirsizleşir
- log endpoint koruması beklendiği kadar net değil

### Çözüm
- ya yorumu düzelt
- ya da gerçekten fallback/store stratejisini açıkça uygula
- log rate limit davranışını test ve docs ile hizala

---

## 6. Öncelikli iş paketleri

## P0 — Release blocker kapatma
1. `listingRef` zorunluluğu
2. 409 mismatch sonrası forced backend invalidation
3. `realTradeId` bulunmadan trade room açmama
4. Auth limiter için Redis-down güvenli mod
5. Nonce atomikliği düzeltmesi
6. Auth restore strict binding

## P1 — Güvenlik modelini standartlaştırma
7. `requireSessionWalletMatch` policy matrix
8. `request-token`, `/pii/my`, `taker-name` hardening
9. Backend relay / on-chain truth split azaltımı
10. Receipt hash integrity sabitleme

## P2 — Operasyon ve gözlemlenebilirlik
11. Docs/test/readiness drift temizliği
12. DLQ poison / replay runbook
13. Production log fallback temizliği
14. logs route yorum/kod uyumu
15. Wallet-switch ve stale-session E2E suite

---

## 7. İlk düzeltilecek 10 konu

1. `createEscrow` için `listingRef` zorunlu hale getir  
2. 409 mismatch yolunda server-side revoke + clear-cookie uygula  
3. `realTradeId` olmadan trade room açılmasını engelle  
4. Auth limiter için Redis-down degraded/fail-closed stratejisi yaz  
5. `generateNonce` atomik sonucunu güvenli yönet  
6. `/api/auth/me` ve restore akışı için strict binding standardı belirle  
7. Endpoint bazlı `requireSessionWalletMatch` policy matrix çıkar  
8. `/api/pii/request-token`, `/api/pii/my`, `/api/pii/taker-name` için hardening yap  
9. Kırık test ve docs drift’ini temizle  
10. Wallet-switch regression + stale-session E2E testlerini ekle  

---

## 8. Metodoloji çekincesi

2. agent’in itirazı kayda değerdir:

- tüm turların “tamamlandı” kapanışı aynı sertlikte görünmeyebilir
- bazı final hükümler için kanıt zinciri standardizasyonu eksik olabilir

Bu nedenle bu raporun teknik karar mantığı şu şekildedir:

- **“Risk yok” denemez**
- **“Bütün inceleme kusursuz kapandı” da denemez**
- Fakat **NO-GO** kararı için teknik risk seti yeterince güçlüdür

---

## 9. Son karar

**Nihai karar: NO-GO**

### Mainnet açılışı için asgari koşullar
Aşağıdaki 6 bulgu kapanmadan açılış önerilmez:

- ARAF-01
- ARAF-02
- ARAF-03
- ARAF-04
- ARAF-05
- ARAF-06

### Son not
ARAF-07 ila ARAF-15 aralığındaki bulgular blocker değil; ancak blocker’lar kapandıktan sonra kısa sürede ele alınmalıdır. Aksi halde audit, operasyon, kullanıcı güveni ve veri bütünlüğü riski büyür.
