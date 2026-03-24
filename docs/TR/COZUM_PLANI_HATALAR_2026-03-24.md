# Araf Protokolü — "Hatalar ve Düzeltilmesi Gerekenler" için Çözüm Planı

**Tarih:** 24 Mart 2026  
**Amaç:** `docs/Hatalar ve Düzeltilmesi gerekenler.md` içindeki tekrar eden/dağınık bulguları tek bir uygulanabilir plana dönüştürmek.

---

## 1) Hızlı Teşhis (Dokümandan çıkarım)

Dokümandaki ana risk kümeleri:
1. **UI ↔ On-chain state drift** (yanlış buton / yanlış zamanlama).
2. **Decimal ve hesaplama doğruluğu** (fiat→crypto dönüşüm hatası).
3. **Challenge/ping akışında zaman penceresi yönetimi**.
4. **Proxy/rate-limit ve operasyonel dayanıklılık**.
5. **Test ve runbook eksikliği** (mainnet gate için kanıt eksikliği).

---

## 2) Çözüm Stratejisi (Önceliklendirilmiş)

## P0 — Mainnet öncesi zorunlu (bloklayıcı)

### P0-1) Tek Kaynaktan Durum Modeli (State Machine Adapter)
- `App.jsx` içindeki local state + polling state ikiliğini azaltın.
- `deriveUiState(onchainState, timestamps, now)` adlı **tek fonksiyon** ile tüm buton görünürlüğü/disabled mantığını üretin.
- UI hiçbir yerde ham string karşılaştırmasıyla kritik izin vermesin.

**Kabul kriteri:**
- LOCKED/PAID/CHALLENGED/RELEASED/BURNED için snapshot testleri geçiyor.
- Aynı on-chain input, her render’da aynı UI çıktısını üretiyor (deterministik).

### P0-2) Zaman Pencereleri için Guard + Sunum Ayrımı
- `canPing`, `canChallenge`, `canRelease` gibi saf fonksiyonlar oluşturun.
- Button `disabled` ve tooltip/hata mesajı bu fonksiyonların çıktısından beslensin.
- Revert’e güvenmek yerine kullanıcıya önceden net sebep gösterin.

**Kabul kriteri:**
- `paidAt+24h-1s`, `paidAt+24h`, `+24h+1s` sınır testleri.
- Kullanıcı "neden basamıyorum" sorusunun tek satır açıklamasını görüyor.

### P0-3) Decimal ve Tutar Hesabını Merkezi Yardımcıya Taşıma
- `getTokenDecimals()` sonucu cache’lenerek tüm hesaplarda aynı yardımcı kullanılsın.
- `fiatToTokenAmount(maxFiat, rate, decimals)` ve `tokenToFiat(...)` yardımcıları yazın.
- Frontend’de hardcoded `1e6`, `1e18` kullanımını lint kuralı ile yasaklayın (utils hariç).

**Kabul kriteri:**
- 6/8/18 decimal token test matrisi.
- Aynı input için backend/frontend/contract expectation farkı sıfır.

---

## P1 — Yüksek öncelik (GO/NO-GO etkiler)

### P1-1) İşlem Sırasında Polling Backoff
- Tx pending iken ilgili trade için polling’i geçici yavaşlatın (örn. 5s→20s), onaydan sonra eski aralığa dönün.
- Race condition olasılığını ve RPC maliyetini azaltır.

### P1-2) Chargeback ve Kritik UX Bayraklarını Kalıcılaştırma
- `chargebackAccepted` gibi trade-bağımlı bayrakları local state yerine trade payload’dan derive edin.
- Yenileme sonrası davranış aynı kalmalı.

### P1-3) Listing İptalinde Çift Taraflı Senkron
- On-chain cancel başarısı sonrası backend delete çağrısını idempotent yapın.
- Başarısız delete için retry queue veya kısa süreli re-try ekleyin.

---

## P2 — Operasyonel Sertleştirme

### P2-1) Trust Proxy Güvenli Konfig
- `app.set('trust proxy', ...)` değerini deploy topolojisine göre açıkça belirleyin:
  - Tek reverse proxy: `1`
  - Bilinen proxy subnet listesi: fonksiyon bazlı doğrulama
- Blind `true` yerine mimariye göre net kural tercih edin.

### P2-2) Runbook ve Alarm Eşikleri
- RPC throttle, Redis down, DLQ birikmesi için net alarm eşikleri belirleyin.
- "kim, ne zaman, hangi adımı" oynatacak runbook tablosu ekleyin.

---

## 3) Teknik Uygulama Taslağı (Dosya bazında)

- `frontend/src/App.jsx`
  - Saf guard fonksiyonları (`canPing/canChallenge/canRelease`) ve merkezi `deriveUiState` kullanımı.
- `frontend/src/hooks/useArafContract.js`
  - `getTokenDecimals`, `getCooldownRemaining` cache + hata fallback stratejisi.
- `frontend/src/utils/amounts.js` (yeni)
  - Decimal-safe dönüşüm fonksiyonları (bigint tabanlı).
- `backend/scripts/app.js`
  - trust proxy değerinin ortam-topoloji uyumlu explicit ayarlanması.
- `contracts/test/*.test.js`
  - challenge/ping boundary testleri (özellikle +24h sınırları).

---

## 4) 7 Günlük Sprint Planı

1. **Gün 1-2:** P0-1 & P0-2 (state + time guards), birim testler.
2. **Gün 3:** P0-3 decimal helper konsolidasyonu + test matrisi.
3. **Gün 4:** P1-1 polling backoff + P1-2 kalıcılık.
4. **Gün 5:** P1-3 listing idempotency.
5. **Gün 6:** P2-1 proxy hardening + güvenlik doğrulaması.
6. **Gün 7:** E2E smoke + runbook + GO/NO-GO toplantısı.

---

## 5) Mainnet GO Kriterleri (Öneri)

- Challenge/ping/release akışında sınır-zaman testleri yeşil.
- Decimal test matrisi (6/8/18) yeşil.
- UI state snapshot/regresyon testleri yeşil.
- Proxy + rate-limit entegrasyon testi yeşil.
- 24 saatlik testnet soak’ta kritik hata yok.

---

## 6) Kısa Sonuç

Dokümandaki bulguların büyük kısmı **tek bir kök probleme** işaret ediyor: UI’nin on-chain state machine’i tam ve deterministik temsil etmemesi. Çözüm, yeni özellik eklemekten çok; state/timing/amount mantığını merkezileştirip testlenebilir hale getirmektir.

---

## 7) `BackLog.md` + Kod Taraması Sonucu **Hâlâ Açık** Kalanlar

Aşağıdaki maddeler, `docs/BackLog.md` ile birebir karşılaştırma yapılıp kod üzerinde doğrulanan **çözülmemiş** kalemlerdir.

### A) Frontend akışında açık kalan kritikler

1. **`handleStartTrade` hâlâ 6-decimal varsayıyor ve fiat→crypto dönüşümü yapmıyor.**
   - Kodda `order.max * 1e6` yaklaşımı sürüyor; token decimal dinamik okunmuyor.
   - Bu durum 18-decimal token veya farklı quote mantığında finansal sapma üretir.

2. **`handleCreateEscrow` içinde hardcoded `decimals = 6` devam ediyor.**
   - Dinamik decimal helper yerine sabit 6 kullanımı var.

3. **Approve sonrası başarısız işlemde allowance cleanup (`approve(...,0)`) yok.**
   - `handleStartTrade` ve `handleCreateEscrow` catch bloklarında sıfırlama adımı görünmüyor.

4. **On-chain listing iptalinden sonra backend listing delete senkronu eksik.**
   - `handleDeleteOrder` sadece on-chain iptal + local state güncelliyor; backend delete çağrısı yok.

5. **Polling hâlâ sabit 15 saniye, write sırasında pause/backoff mekanizması yok.**
   - Bu durum tx gönderimi sırasında stale state overwrite riskini açık bırakıyor.

6. **Test faucet butonları market ekranında koşulsuz render ediliyor.**
   - Mainnet modunda gizleme/feature-flag kontrolü eklenmemiş.

### B) Backend / model katmanında açık kalanlar

7. **`trust proxy` sadece production için set ediliyor.**
   - Dokümanlarda “tüm ortamlarda aktif” ifadesiyle uyumsuz; staging/topoloji varyasyonlarında tekrar risk doğurur.

8. **PII snapshot mimarisi henüz model/route seviyesinde yok.**
   - `Trade` modelinde `pii_snapshot` ve `snapshot_delete_at` alanları bulunmuyor.
   - `LOCKED` anında snapshot alma akışı henüz uygulanmamış.

### C) Kontrat/tooling tarafında açık kalanlar

9. **Hardhat `evmVersion: "cancun"` sabit kalmış.**
   - Hedef ağların EVM uyumluluğuna göre profil bazlı ayar (veya deploy-time override) yapılmadığı için L2 uyumluluk riski açık.

---

## 8) Bu yeni açıklar için hızlı aksiyon listesi

- **P0-AC-1:** `frontend/src/App.jsx` içinde `order.max * 1e6` ve `const decimals = 6` kullanımını kaldır; `getTokenDecimals()` + bigint helper ile değiştir.
- **P0-AC-2:** `approve` sonrası ana işlem fail olursa `approveToken(token, 0n)` cleanup akışını ekle (taker/maker iki yol için).
- **P0-AC-3:** `handleDeleteOrder` sonrasında `DELETE /api/listings/:id` çağrısı + idempotent retry ekle.
- **P1-AC-1:** TradeRoom polling’i `isContractLoading === true` iken pause et, sonra manuel `fetchMyTrades()` ile resume et.
- **P1-AC-2:** Faucet butonlarını `import.meta.env.DEV || VITE_ENABLE_FAUCET === 'true'` koşuluna bağla.
- **P1-AC-3:** `backend/scripts/app.js` için `trust proxy` değerini topolojiye göre explicit hale getir (`1` / subnet function).
- **P1-AC-4:** `backend/scripts/models/Trade.js` + `routes/pii.js` + `routes/trades.js` için on-lock PII snapshot tasarımını uygula.
- **P2-AC-1:** `contracts/hardhat.config.js` için ağ bazlı `evmVersion` profilini çevresel değişkenle yönet (`EVM_VERSION`).
