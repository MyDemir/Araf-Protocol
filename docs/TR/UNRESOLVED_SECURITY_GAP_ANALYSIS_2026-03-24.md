# Araf Protokolü — Çözülmemiş Güvenlik/Bütünlük Bulguları Taraması

**Tarih:** 2026-03-24  
**Kaynak Dokümanlar:**
- `docs/TR/ARCHITECTURE.md`
- `docs/ARAF_SECURITY_AUDIT_ADDENDUM.md`
- `docs/Hatalar ve Düzeltilmesi gerekenler.md`

## 1) Mimari İnceleme Özeti (ARCHITECTURE.md)

Mimari doküman; **hibrit Web2.5** yaklaşımını, kritik state/varlık akışlarının on-chain, PII ve sorgu-performans katmanının off-chain tutulduğu bir model olarak tanımlıyor. Temel güvenlik iddiaları:
- On-chain tarafın uyuşmazlık ve fon hareketinde belirleyici olması,
- Backend'in fon taşıyamayan “zero private key relayer” olması,
- Anti-Sybil ve tier sınırlarının sözleşmede zorunlu tutulması.

Bu iddialar, UI/Backend uygulamasında karşılık bulmadığında “mimari doküman doğru, implementasyon eksik” sınıfında risk oluşuyor.

## 2) Güvenlik Raporlarından Taranıp **Hâlâ Açık** Kalan Bulgular

Aşağıdaki maddeler, kod tabanı taramasında (2026-03-24) hâlâ açık görünen bulgulardır.

### A) Addendum (18 yeni bulgu) içinden açık kalanlar

1. **EK-KRİT-01** — Maker için PAID aşamasında challenge/ping aksiyonu UI’da görünmüyor.  
2. **EK-KRİT-02** — Polling `activeTrade.state` güncellese de `tradeState` senkron güncellenmiyor (state ayrışması riski).  
3. **EK-YÜKS-01** — Maker’ın `pingTakerForChallenge` için `paidAt + 24h` ön-zamanlayıcısı yok.  
4. **EK-YÜKS-02** — `challengeCountdown` ve `makerChallengeTimer` aynı zaman için çift countdown çalıştırıyor.  
5. **EK-YÜKS-03** — Kontrattaki `getCooldownRemaining()` UI’da kullanılmıyor; kalan süre gösterilmiyor.  
6. **EK-YÜKS-04** — `taker-name` fetch sadece `LOCKED` durumda; `PAID/CHALLENGED` sonrası boş kalabiliyor.  
7. **EK-YÜKS-05** — `handleCreateEscrow` içinde token decimal hâlâ hardcoded `6`.  
8. **EK-YÜKS-06** — `chargebackAccepted` yalnızca local state; sayfa yenilenince resetleniyor.  
9. **EK-YÜKS-07** — `handleDeleteOrder` için `OPEN` state ön doğrulaması yok.  
10. **EK-ORTA-02** — `ConflictingPingPath` için özel, kullanıcı-dostu hata eşlemesi yok.  
11. **EK-ORTA-06** — `handleChallenge` içinde ping öncesi zaman guard’ı yok (kontrat revert’üne bırakılıyor).  
12. **EK-ORTA-09** — `handleRelease` sonrası `activeTrade` temizlenmiyor (`setActiveTrade(null)` yok).

### B) “Hatalar ve Düzeltilmesi Gerekenler” raporundan açık kalan önemli maddeler

13. **KRİT-04** — `handleStartTrade` hâlâ `order.max * 1e6` ile hesaplıyor; fiat/crypto dönüşümü ve dinamik decimal problemi sürüyor.  
14. **KRİT-05 (kısmi)** — `trust proxy` yalnızca production’da set ediliyor; kod yorumlarıyla çelişki var ve ortam-bağımlı kırılma riski sürüyor.  
15. **ORTA-02** — `approve` sonrası işlem başarısızlığında `approve(0)` sıfırlama/cleanup akışı yok.  
16. **ORTA-04** — Maker ilan iptalinde sadece local state filtreleniyor; backend listing silme/senkron çağrısı görünmüyor.

## 3) Not: Çözülmüş Görünen Örnek Maddeler

Aşağıdaki örnekler kodda giderilmiş görünüyor (tam liste değil):
- Refresh token wallet bağlama doğrulaması (`siwe.js`)  
- SIWE nonce üretiminde yarış durumuna karşı `SET NX` yaklaşımı  
- `PUT /profile` için auth rate limiting  
- `usePII` içinde authenticated fetch + AbortController

## 4) Önceliklendirme (Hızlı Yol Haritası)

**P0 (hemen):** 1,2,13  
**P1 (yüksek):** 3,6,7,8,14  
**P2 (orta):** 4,5,9,10,11,12,15,16

---

## 5) Doğrulama için taranan ana kod alanları

- `frontend/src/App.jsx`
- `frontend/src/hooks/usePII.js`
- `backend/scripts/app.js`
- `backend/scripts/services/siwe.js`
- `backend/scripts/routes/auth.js`
- `backend/scripts/middleware/rateLimiter.js`

