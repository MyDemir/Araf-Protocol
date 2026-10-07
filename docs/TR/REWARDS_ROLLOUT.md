# Proof of Peace Rewards — Rollout Planı (TR)

Bu doküman, Proof of Peace Rewards açılışını **güvenli, aşamalı ve oyun teorisiyle uyumlu** biçimde yönetmek için hazırlanmıştır.

Proof of Peace, dispute sisteminin pozitif teşvik ayağıdır. Bleeding Escrow kötü stratejiyi pahalılaştırırken, Proof of Peace hızlı ve temiz çözümü gelecekteki reward epoch'larında daha değerli hale getirir.

> Kanonik ilke: **Rewards cashback değildir; hızlı clean resolution için pro-rata barış primidir.**

## 1) Ekonomik ve Authority Sınırları (Net Kurallar)

- Rewards, **trade cashback değildir**; kullanıcıya işlem ücreti iadesi/vergi indirimi mekanizması değildir.
- Eligibility yalnızca **ArafEscrow terminal outcome** verisinden üretilir.
- Backend yalnızca **mirror/read-model** katmanıdır; reward recipient, eligibility, weight veya claimable amount üretemez.
- Admin paneli reward recipient seçemez; yalnız gözlem/operasyonel doğrulama yapar.
- Sponsor/funder recipient seçemez; sadece global/epoch veya product pool fonlaması yapar.
- `paymentRiskLevel` bir **reward multiplier değildir**.
- MVP'de aşağıdaki terminal outcome sınıfları **zero-weight** kabul edilir (kodda clean release ve partial settlement dışındaki her outcome sıfır ağırlık taşır):
  - auto-release
  - burn
  - mutual cancel
  - disputed release
  - ödeme penceresi dolması (`PAYMENT_WINDOW_EXPIRED`)
- MVP'de **Tier 0 reward eligibility dışıdır**; doğrudan (order child olmayan) escrow trade'leri de rewardable değildir.
- `rewardBps` (escrow gelirinin `ArafRevenueVault` içindeki reward payı) başlangıçta **4000**'dir ve owner onu yalnız **4000–7000** aralığında değiştirebilir (`MIN_REWARD_BPS` / `MAX_REWARD_BPS`).

## 2) Oyun Teorisi Guardrail'leri

Reward sistemi yalnız pozitif teşvik değildir; aynı zamanda farming ve kötü stratejilere karşı sınırlı bir ekonomik savunma katmanıdır.

| Davranış | Reward duruşu | Neden |
|---|---|---|
| Hızlı clean release | En yüksek pozitif weight | En iyi iş birliği dengesini teşvik eder |
| Yavaş clean release | Daha düşük pozitif weight | Gecikmeyi opportunity cost ile fiyatlandırır |
| Partial settlement | Düşük pozitif weight | Dispute içi barışı ödüllendirir ama dispute'u kârlı hale getirmez |
| Auto-release | Zero weight | Maker inaktivitesi ödüllendirilmez |
| Mutual cancel | Zero weight | Cancel-loop farming yüzeyi açılmaz |
| Disputed release | Zero weight | Challenge-sonra-release farming engellenir |
| Burn | Zero weight | Deadlock hiçbir koşulda rewardable değildir |

Operasyonel kural:

> **Beklenen reward, sentetik hacim / wash trading maliyetinden düşük kalmalıdır.**

Bu nedenle sponsor kampanyaları, external funding ve `rewardBps` artışları küçük adımlarla, gözlemlenebilir metrikler eşliğinde yapılmalıdır.

## 3) Aşamalı Rollout (Staged)

### Phase A — Read-only reward analytics
- Yalnız gözlem dashboard'ları / raporlar açılır.
- On-chain claim veya treasury switch yapılmaz.
- Outcome dağılımı, clean release hızı, partial settlement oranı, zero-weight outcome oranı ve olası wash-trade kümeleri izlenir.

### Phase B — External funding enabled, claim disabled
- Harici reward funding akışı (`fundGlobalRewards` / `fundProductRewards`) açılır; product pool'un önce owner tarafından `setProductPool` ile etkinleştirilmesi gerekir.
- Claim ürün seviyesinde kapalı tutulur (aşağıdaki nota bakın: on-chain claim anahtarı yoktur).
- Sponsor/funder'ın recipient, weight veya multiplier seçemediği doğrulanır.

### Phase C — Revenue split enabled, recordTradeOutcome enabled
- Escrow gelir bölüşümü (vault reserve accounting) aktif edilir (escrow treasury'si ancak ayrı treasury-switch adımından sonra vault'u gösterir).
- `recordTradeOutcome` akışı aktif edilir. `recordTradeOutcome(tradeId)` / `recordTradeOutcomes(tradeIds)` permissionless'tır; backend `rewardOutcomeRecorder` işi (saatlik, `JOB_REWARD_RECORDER_INTERVAL_MS`) `ARAF_REWARDS_ADDRESS` ve `RELAYER_PRIVATE_KEY` tanımlıysa batch varyantını çağırır, aksi halde pasif kalır. Relayer yalnız kaydı tetikler; weight'i etkileyemez.
- Kayıt akışının yalnız `ArafEscrow.getRewardableTrade` kaynağına dayandığı doğrulanır.

### Phase D — Claim enabled
- Epoch finalize + claim süreci kontrollü şekilde açılır.
- Operasyonel monitoring ve reserve-liability kontrolleri sıklaştırılır.
- Claim penceresi, claimDelay ve dust sweep kuralları kullanıcıya açık anlatılır (parametreler için 5. bölüme bakın).

### Phase E — Product pool enabled
- Ürün/kampanya bazlı pool metadata + funding yüzeyi açılır.
- Recipient seçimi yine kontrat formülüne bağlıdır; sponsor/admin seçimi yoktur.
- Product pool, eligibility üretmez; yalnız funding/metadata bucket olarak kalır.

## 4) Operasyonel Güvenlik Notları

- Public ağda production adresleri **env üzerinden** verilir; hardcode yapılmaz.
- Treasury switch deployment adımından ayrıdır; tek başına ve onaylı bakım penceresinde yapılır.
- Oracle-free dispute modeli ve settlement authority daima kontratta kalır.
- Reward bütçesi hiçbir zaman kullanıcıyı riskli release yapmaya ekonomik olarak teşvik edecek büyüklüğe taşınmamalıdır.
- Reward dili kullanıcıya "getiri garantisi" veya "işlem başına cashback" olarak sunulmamalıdır.

## 5) Kontrat Parametreleri (`ArafRewards` / `ArafRevenueVault` kodundan doğrulanmıştır)

Rollout fazları ürün ve operasyon aşamalarıdır. On-chain'de kayıt, finalize, claim ve dust sweep **permissionless'tır ve owner tarafından pause edilemez**; tek kapılar zaman pencereleri ve finalize'dır. Yukarıdaki "claim kapalı/açık" ifadesi bu yüzden on-chain bir anahtar değil, ürünün onu gösterip göstermediği ve operasyonun hazır olup olmadığı demektir.

| Parametre | Değer |
|---|---|
| Epoch süresi (`epochDuration`) | 30 gün (`block.timestamp / epochDuration`) |
| `claimDelay` | epoch bitişinden 24 saat sonra |
| Kayıt penceresi | epoch bitişi + `claimDelay`'de kapanır; ondan sonra `finalizeEpochToken` herkese açıktır |
| `claimWindow` | `claimDelay`'den sonra 7 gün |
| Clean release weight (`terminalAt - paidAt`'e göre) | ≤ 1 sa: 2.5× · ≤ 24 sa: 1.5× · ≤ 72 sa: 1.0× · daha yavaş ya da `paidAt` yok: 0.5× |
| Partial settlement weight | 0.3× |
| Tier çarpanları | Tier 1: 1.0× · Tier 2: 1.1× · Tier 3: 1.2× · Tier 4: 1.3× · Tier 0: eligible değil |
| Weight formülü | `stableNotional × outcome × tier`; maker ve taker aynı weight'i alır |
| Claim tutarı | `epochRewardPool × userWeight / totalWeight` |
| Dust | claim penceresi bittikten sonra (ya da tüm weight claim edildiyse) `sweepEpochDust` talep edilmeyen kalanı **içinde bulunulan** epoch'un havuzuna devreder; alıcı seçilemez |
| Funding | sponsor fonu mevcut ya da gelecek bir epoch'u hedefler; epoch havuzu = o epoch için sponsor fonu + owner'ın tetiklediği, reward reserve'den `allocateEpochRewards` |
| Owner yetkileri | `setRewardBps` (4000–7000), `allocateEpochRewards`, `setProductPool`, `withdrawTreasuryShare*` (yalnız treasury reserve; reward reserve çekilemez), `setSupportedToken`, `setFinalTreasury`; `setRewards` tek seferliktir |

Backend/frontend yüzeyleri: `/api/rewards/*` altında public read-only mirror ve admin `/api/admin/revenue`, `/api/admin/rewards/health`; `claimable` backend tarafından asla tahmin edilmez (on-chain getter'ı kullanın). `.env.example` dosyalarındaki rewards bayrakları (`REWARDS_READ_ONLY`, `REWARDS_SOURCE`) belge amaçlı sabitlerdir ve kod tarafından okunmaz.

## Go-Live Öncesi Doğrulama
- Vault kontrat adresi deployment manifest/config üzerinden doğrulanmalıdır.
- Rewards kontrat adresi deployment manifest/config üzerinden doğrulanmalıdır.
- Supported token seti USDT/USDC olmalıdır.
- `rewardBps` başlangıcı 4000 olmalıdır.
- Backend/frontend read-only / mirror-only kalmalıdır.
- Backend/frontend reward eligibility, weight, outcome, recipient veya claimable authority tanımlamamalıdır.
- Treasury switch deployment sürecinin parçası değildir.
- Treasury switch doğrulama sonrası ayrı ve açık bir operasyon olarak yürütülmelidir.
- Production adresleri hardcode edilmemelidir.
- Treasury switch öncesi smoke ve verify komutları başarılı olmalıdır (`npm run smoke:rewards` yerel Hardhat ağında çalışır; `npm run verify:rewards` salt okunur wiring kontrolüdür; `npm run switch:rewards:treasury` `CONFIRM_TREASURY_SWITCH=true` ve `EXPECTED_CURRENT_TREASURY_ADDRESS` ister).
- Fast clean release / partial settlement / zero-weight outcome kayıtları staging'de doğrulanmalıdır.
- Sponsor/funder recipient seçemiyor olmalıdır.
- Admin reward reserve'i treasury gibi çekemiyor olmalıdır.
