# Araf — Katman Uyumluluk Puanı ve Mainnet Hazırlık Raporu (Eylül 2026)

> Kaynak: güncel `main` (`053013f`, PR #112 merge), `docs/Plan/*` (Optimasyon PDF dahil), CI geçmişi.
> Doğrulama: kontrat testleri 211/211, backend testleri 237/237, frontend testleri 350/350 geçiyor. `main` üzerindeki son CI koşusu (#117) yeşil.

---

## 1. Özet puan tablosu

| Eksen | Puan | Gerekçe |
|---|---|---|
| Kontrat ↔ Frontend | **9.5 / 10** | ABI eşleşmesi tam. Kullanıcıya açık tüm yazma fonksiyonları bağlı. Hata mesajı çözümlemede eksik kalan 5 hata bu turda eklendi. |
| Kontrat ↔ Backend | **8.5 / 10** | Trade/order yaşam döngüsünün tüm event'leri mirror'lanıyor. Governance ve bazı ödül event'leri mirror'lanmıyor (ayrıntı §2). |
| Backend ↔ Frontend | **9 / 10** | API sözleşmeleri testli. İmzalı iptal rotası kaldırıldı ve iptal on-chain'e taşındı. Canlı UI akışları testle korunuyor. |
| Plan ↔ Kod | **7 / 10** | Ürün planının Faz 0–2 ve Faz 3 (rewards) maddeleri büyük ölçüde kodda. `paymentRiskLevel` fiyatlaması, Optimasyon PDF'inin bir kısmı ve Spot planı henüz yok (§3). |
| **Mainnet hazırlığı** | **5.5 / 10** | Kod ve test tarafı hazır. Blokerler operasyonel ve güvenlik süreçlerinde: dış audit, sahiplik modeli, USDT seçimi, anahtar yönetimi, hukuk (§4). |

**Genel uyumluluk (ilk üç eksenin ortalaması): 9.0 / 10.** Katmanlar arası uyum mainnet için yeterli. Asıl açık, kod dışındaki mainnet hazırlığında.

---

## 2. Uyumluluk ayrıntısı (ölçüme dayalı)

### Otomatik ölçümler
- **ABI parçaları:** Backend, frontend ve script'lerdeki 113 `function`/`event` tanımı derlenmiş ABI ile karşılaştırıldı; **0 uyumsuzluk**. Bu kontrol `test/contracts/abiCompat.offchain.test.js` ile CI'da kalıcı.
- **Escrow yazma fonksiyonları:** Kullanıcıya açık 22 fonksiyonun hepsi frontend hook'unda tanımlı. Yalnız owner/governance fonksiyonları (`set*`, `pause`, `transferOwnership`) frontend'de yok; bu tasarım gereği, doğru.
- **Event mirror kapsamı:**

| Kontrat | Event sayısı | Mirror'lanmayan | Etki |
|---|---|---|---|
| ArafEscrow | 29 | `Paused/Unpaused`, `TreasuryUpdated`, `ReputationPolicyUpdated`, `ReputationTierThresholdsUpdated`, `OwnershipTransferred` | Düşük. Frontend `paused()` değerini doğrudan okuyor; backend policy değerlerini canlı okuyor. Governance değişiklikleri admin panelinde görünmüyor. |
| ArafRewards | 8 | `EpochTokenFinalizedEvent`, `EpochDustRolledOver` | Orta-düşük. Ödül analitiğinde "dönem kapandı / devredilen tutar" bilgisi eksik. |
| ArafRevenueVault | 13 | `RewardBpsUpdated`, `TreasuryShareWithdrawn`, `SupportedTokenUpdated`, `FinalTreasuryUpdated` vb. | Orta. Hazine çekimleri ve bölüşüm oranı değişiklikleri backend read-model'de iz bırakmıyor. Şeffaflık panelinde görünür olmalı. |

- **Hata çözümleme:** Kullanıcının karşılaşabileceği tüm custom error'lar için kısa TR/EN mesaj var. `OrderSideMismatch`, `InvalidOrderRef`, `InvalidListingRef`, `InvalidTier` ve `OwnableUnauthorizedAccount` bu turda eklendi. Kalan eksikler yalnız owner fonksiyonlarına ait hatalar.

### Önerilen küçük uyumluluk işleri
1. Vault'un governance ve hazine event'lerini (`TreasuryShareWithdrawn`, `RewardBpsUpdated`) mirror'la ve admin paneline "hazine hareketleri" listesi ekle. Bu, "şeffaflık" ilkesinin gereği.
2. `EpochTokenFinalizedEvent` ve `EpochDustRolledOver` event'lerini ödül read-model'ine ekle.
3. Escrow'un `Paused/Unpaused` event'lerini mirror'la; backend readiness'te pause durumu görünsün.

---

## 3. Plan dosyaları ↔ kod durumu

| Plan | Madde | Durum |
|---|---|---|
| Ürün Planı (Yeniden Kurgulanmış) | A. 90 günlük clean period | ✅ On-chain `cleanPeriod = 90 days`; job değeri kontrattan okuyor |
| | B. Payout profili ↔ ray uyumu | ✅ TR_IBAN / SEPA_IBAN / US_ACH; IBAN mod-97 kontrolü |
| | C/G. Snapshot + health sinyalleri | ✅ `buildTradeHealthSignals`, `tradeRisk.js` |
| | D. Admin gözlem paneli | ✅ `routes/admin.js` (read-only) |
| | E. Referans kur widget'ı | ✅ `referenceRates.js` + `ReferenceRateTicker` |
| | F. Tier'a duyarlı rate limit | ✅ `rateLimiter.js` |
| | H. Ayrıştırılmış itibar sinyalleri | ✅ Kontrat seviyesinde de var (burn, auto-release, mutual cancel vb. sayaçlar) |
| | I. Partial settlement | ✅ |
| | **J. `paymentRiskLevel` fiyatlaması** | ❌ Zincirde saklanıyor, ekonomik etkisi yok |
| Faz 3 Proof of Peace Planı | Vault + Rewards + outcome view | ✅ Bu turda sertleştirildi: pause, sweep, kayıt penceresi, relayer |
| REWARDS_ROLLOUT | Aşama A→E | ✅ Kod hazır. Aşamalar operasyonel olarak sırayla açılmalı (§5) |
| Optimasyon (PDF) | `/orders/my` sayfalama | ✅ Var |
| | Mongo `maxPoolSize=100` | ⚠️ Hâlâ 100; gerçek yüke göre düşürülmeli |
| | Dekontların Mongo'da şifreli saklanması (~5 MB) | ⚠️ Hâlâ Mongo'da; nesne depolamaya (S3/R2) taşınması önerilir |
| | `statsSnapshot` tam tarama | ⚠️ Hâlâ tam tarama; artımlı sayaç önerilir |
| | Frontend polling (15/30/60 sn) | ⚠️ Var; WebSocket/SSE sonraki aşama |
| Spot Liquidity Peace Tier | ArafSpot | ⏳ Başlanmadı. Mainnet kapsamı dışında tutulmalı (blast radius ilkesi) |
| Frontend Global UI v2 | Tema token'ları, responsive, trade room | ✅ Büyük ölçüde uygulandı |

---

## 4. Mainnet hazırlığı — blokerler ve riskler

### 🔴 Bloker (çözülmeden mainnet açılmamalı)

| # | Konu | Neden | Öneri |
|---|---|---|---|
| B1 | **Bağımsız güvenlik denetimi yok** | Kontrat bu turda önemli ölçüde değişti: yeni `expirePaymentWindow`, iptal modeli, ödül mekaniği. İç test kapsamı iyi ama dış göz şart. | En az bir bağımsız audit, ardından bug bounty. |
| B2 | **Sahiplik modeli** | `deploy.js` sahipliği `FINAL_OWNER_ADDRESS`'e devrediyor; timelock yok. Ücret tavanı %20 ve değişiklik anında geçerli. | Owner = Safe multisig (en az 3/5) → 48 saatlik `TimelockController`. Kontrat kodu değişmez. |
| B3 | **USDT seçimi** | Base'deki USDT (`0xfde4…bb2`) [köprülenmiş bir token; Tether tarafından çıkarılmıyor ve Tether'e karşı itfa edilemiyor](https://basescan.org/token/0xfde4C96c8593536E31F229EA8f37b2ADa2699bb2). | İlk açılışı **yalnız USDC** ile yap. USDT'yi bilinçli bir risk kararıyla sonra ekle. |
| B4 | **Relayer anahtarı** | `RELAYER_PRIVATE_KEY` sunucuda duran bir hot key. Fon yetkisi yok ama gaz bakiyesi ve itibar ile ödül tetikleme işlevi taşıyor. | Ayrı, düşük bakiyeli bir cüzdan + bakiye alarmı. Orta vadede Gelato/Chainlink Automation. |
| B5 | **Hukuki çerçeve (TR)** | 7518 sayılı Kanun: kripto hizmet sağlayıcıları SPK denetimine girdi. MASAK kaynaklı IBAN blokeleri yaygın. Backend order book ve PII tutuyor. | Operatör yapısı için yazılı hukuki görüş. Kullanım koşulları ve "kendi hesabından, kendi adına" uyarısı. |

### 🟠 Yüksek risk (açılışta izlenmeli)

| # | Konu | Açıklama |
|---|---|---|
| R1 | **USDC blacklist ve "push" ödeme modeli** | Escrow ödemeleri doğrudan transferle yapılıyor. Taraflardan biri Circle tarafından kara listeye alınırsa, o tarafa transfer içeren her kapanış (release, auto-release, iptal) revert eder. Trade yalnız burn veya karşı tarafa %100 settlement ile kapanabilir. Nadir ama gerçek bir durum. Orta vadede "pull" (claim) yedeği değerlendirilmeli. |
| R2 | **Kontrat boyut payı ~270 bayt** | Mainnet sonrası düzeltme için kod ekleme alanı yok. Kontrat upgrade edilemiyor; yeni sürüm yeni deploy demek. Migration runbook'u hazır olmalı. |
| R3 | **Ödül bütçesi ve wash trading** | `rewardBps = 4000` ile başlanmalı. İlk epoch'larda harici fon açılmamalı, analitik izlenmeli (REWARDS_ROLLOUT Aşama A–C). |
| R4 | **KMS** | Production'da `KMS_PROVIDER=env` kod tarafından zaten engelleniyor. AWS KMS veya Vault kurulumu ve key rotation runbook'u hazır olmalı. |

### 🟢 Hazır olanlar
- EIP-170 uyumu (24.309 bayt) ve yerel sınır zorlaması.
- Chain fail-closed: backend `EXPECTED_CHAIN_ID`, frontend prod'da yalnız 8453.
- Deploy guard'ları: `CONFIRM_PUBLIC_DEPLOY`; `FINAL_OWNER ≠ TREASURY`; treasury switch ayrı script'te.
- Worker checkpoint, finality depth ve DLQ.
- CI: backend, frontend, ABI drift ve kontrat testleri.

---

## 5. Önerilen mainnet açılış sırası

1. **Dondurma:** Kontrat kodunu dondur; audit için etiketle (örn. `v3.0.0-rc1`).
2. **Audit ve düzeltmeler:** Audit yapılır. Düzeltmeler olursa ABI drift testi ve tüm testler yeniden koşulur.
3. **Sepolia prova:** Birebir aynı deploy sırası:
   - `deploy.js` → `deployRewards.js` → `configureRewards.js` → `verifyRewardsDeployment.js` → `smokeRewards.js`
   - En az bir haftalık gerçek akış: LOCKED → PAID → RESOLVED, ödeme penceresi aşımı, settlement, kayıt → finalize → claim.
4. **Mainnet deploy (USDC only):**
   - Owner = Safe multisig → Timelock.
   - `TREASURY_ADDRESS` multisig, `FINAL_OWNER ≠ TREASURY`.
   - Tier limitleri düşük başlar (Tier 0–1 dar tutulur).
5. **Backend/frontend env:** Kontrat adresleri, `EXPECTED_CHAIN_ID=8453`, `WORKER_START_BLOCK`, `WORKER_FINALITY_DEPTH≥6`, KMS, `RELAYER_PRIVATE_KEY` (ayrı cüzdan).
6. **Gözlem dönemi:** 1–2 hafta, treasury switch yapılmadan. Rewards Aşama A (yalnız analitik).
7. **Treasury → Vault switch:** Ayrı bir değişiklik penceresinde, `EXPECTED_CURRENT_TREASURY_ADDRESS` guard'ıyla. Ardından Aşama C (kayıt) ve D (claim).
8. **Sonra:** USDT kararı, `paymentRiskLevel` fiyatlaması, Spot planı.
