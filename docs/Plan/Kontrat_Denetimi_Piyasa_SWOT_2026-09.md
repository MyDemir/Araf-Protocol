# Araf — Kontrat Denetimi, Piyasa Karşılaştırması ve SWOT (Eylül 2026)

> Kapsam: `ArafEscrow.sol`, `ArafRewards.sol` ve `ArafRevenueVault.sol` satır satır incelendi. Backend/frontend ABI uyumu otomatik test ile doğrulandı. Piyasa taraması eklendi.
> Düzeltmeler `ccr-7dccb0fb-r4mo04` dalında, commit `f4a3298` ile yapıldı.

---

## 1. Kontrat denetimi — bulunan ve düzeltilenler

| # | Önem | Bulgu | Etki | Düzeltme |
|---|---|---|---|---|
| 1 | **Kritik** | LOCKED durumdan tek çıkış karşılıklı iptaldi; zaman aşımı yoktu. | Bond'suz Tier 0 taker emri doldurup ödeme yapmadan maker fonunu süresiz kilitleyebiliyor ve "iptali imzalamam için öde" şantajı yapabiliyordu. İptal maker'a da −20 itibar puanı yazıyordu (5 griefing = ban). | `expirePaymentWindow` eklendi: 48 saat sonra kilit çözülür. Maker tam iade alır; taker bond'unun %2'si kesilir ve taker'a negatif sinyal yazılır. |
| 2 | **Yüksek** | İptal onayı state değişince sıfırlanmıyordu. | Taker LOCKED iken iptal önerip sonra fiat gönderir ve ödemeyi bildirirse, maker bu eski onayı kullanarak hem kriptoyu geri alıp hem fiat'ı tutabiliyordu. | `reportPayment` ve `challengeTrade` onay bayraklarını sıfırlıyor. Mirror da aynı şekilde temizleniyor. |
| 3 | **Yüksek** | Owner `claim`'i pause edebiliyordu, claim penceresi ise pause sırasında da işliyordu. `sweepEpochDust` alıcıyı serbest seçiyordu. | Admin, pause → pencerenin kapanmasını bekle → süpür yoluyla kullanıcı ödüllerini istediği adrese aktarabiliyordu. Bu, "admin alıcı seçemez" ilkesini ihlal ediyordu. | `claim`, kayıt ve finalize pause edilemez. Dust alıcı seçilmeden cari epoch havuzuna devrediliyor. |
| 4 | **Yüksek** | `recordTradeOutcome`'u ne backend ne frontend çağırıyordu. | Proof of Peace canlıda hiç ağırlık üretmezdi, ödüller fiilen ölüydü. | Saatlik relayer job (`rewardOutcomeRecorder.js`) eklendi. Toplu, atlamalı `recordTradeOutcomes` kullanıyor. |
| 5 | **Yüksek** | Kayıt dondurma "ilk claim"e bağlıydı. | İlk claim'i yapan herkes, henüz kaydedilmemiş trade'leri o epoch'tan kalıcı olarak dışlayabiliyordu (front-run). | Kayıt penceresi artık zamanla kapanıyor: epoch sonu + `claimDelay`. Claim de ancak bundan sonra açılıyor. |
| 6 | **Yüksek** | `fundProductRewards` ile gelen fonu hiçbir yol harcamıyordu. | Sponsor fonu vault'ta sonsuza kadar kilitli kalıyordu. | Ürün fonu da epoch havuzuna akıyor. Geçmiş epoch'a fon gönderimi reddediliyor. |
| 7 | **Yüksek** | `finalizeEpochToken` yalnız owner'daydı. | Owner claim'leri süresiz geciktirebiliyordu. | Kayıt penceresi kapanınca herkes finalize edebiliyor; o epoch'un sponsor fonu da bu anda havuza çekiliyor. |
| 8 | Orta | Ban yalnız taker girişinde uygulanıyordu. | Banlı cüzdan maker olarak işlem yapmaya devam edebiliyordu; simetrik koruma ilkesine aykırıydı. | `createSellOrder` ve `fillBuyOrder` artık `MakerBanActive` ile engelliyor. |
| 9 | Orta | Bytecode 31.762 bayttı (EIP-170 sınırı 24.576); test ortamı sınırı kapatıyordu. | Kontrat Base mainnet'e deploy edilemezdi. | **24.309 bayt.** Hardhat artık sınırı yerelde de zorluyor. |
| 10 | Düşük | Partial settlement `firstSuccessfulTradeAt` değerini başlatmıyordu. | Yalnız uzlaşmayla işlem yapan kullanıcı tier atlayamıyordu. | Sıfır puanlı pozitif sinyal eklendi. |
| 11 | Düşük | `reputationDecay.js` kısaltılmış `getReputation` ABI'si kullanıyordu. | Tesadüfen çalışıyordu ama ABI kaymasını gizliyordu. | Tam imza kullanılıyor. Yeni test tüm off-chain ABI parçalarını derlenmiş ABI ile karşılaştırıyor (113 parça, 0 uyumsuzluk). |

### İşlevsiz veya tekrarlanan kodlar (temizlendi)

- **EIP-712 iptal imzası:** Kontrat zaten `msg.sender == imzalayan` şartını koyuyordu, dolayısıyla imza hiçbir güvenlik katmıyordu. Kullanıcıya yalnız fazladan bir cüzdan onayı ve bir backend rotası yüklüyordu. İmza, `sigNonces`, `domainSeparator` ve `/api/trades/propose-cancel` kaldırıldı.
- **Legacy 5 parametreli `createSellOrder/createBuyOrder` overload'ları:** Risk sınıfını sessizce MEDIUM varsayıyordu; kaldırıldı.
- **Kullanılmayan tanımlar:** `ReputationOutcome` enum'u, `transferRewardAllocation`, `getTierMaxAmount` ve ölü `_getCurrent*FeeBps` yardımcıları kaldırıldı. Ayrıca `SettlementAlreadyFinalized` kontrolleri ulaşılamaz durumdaydı; bunlar da temizlendi.
- **Kopya getter'lar:** `takerFeeBps`, `firstSuccessfulTradeAt`, politika puanları ve benzerleri hem public değişken hem named getter olarak iki kez sunuluyordu.
  - Tek yüzeye indirildi.
  - Politika değerleri event'lerle şeffaf kalıyor; constructor başlangıç değerlerini de yayınlıyor.
- **Tekrar eden bloklar ortak yardımcılara taşındı:**
  - Sell ve buy akışlarındaki doğrulama, struct kurulumu ve iptal kodu → `_createOrder`, `_validateFill`, `_spawnTrade`, `_cancelOrder`.
  - Beş terminal yoldaki ödeme dağıtımı → `_payout`.
  - Settlement kontrolleri → `_liveProposal`, `_counterpartyProposal`.
- **`autoRelease` içindeki bleeding hesabı:** PAID state'te bleeding olmadığı için hesap hep sıfır dönüyordu; kaldırıldı.

### Açık kalanlar (karar gerekiyor)

| Konu | Neden açık |
|---|---|
| `paymentRiskLevel` zincirde saklanıyor ama ekonomik etkisi yok | Ürün planındaki J maddesi (bond surcharge / min-tier) ekonomik karar ister. Bytecode payı ~250 bayt. |
| Ücret tavanı %20 (2000 bps) ve anında yürürlüğe giriyor | "Zamana güven" ilkesine uygun çözüm: owner'ı OpenZeppelin `TimelockController`'a devretmek. Kontrata kod eklemez. |
| Tier 0/1 buy emirlerinde cooldown | Kısmi dolan bir buy emri 4 saat boyunca doldurulamıyor. Kural tutarlı, ancak UI bu emri "bekliyor" olarak göstermeli. |
| Ödül ağırlığı token'dan bağımsız | USDT ve USDC ikisi de 6 decimals olduğu için sorun yok. Farklı decimals'lı bir token eklenirse ağırlık normalize edilmeli. |
| Bytecode payı ~270 bayt | Yeni özellikler için modül/library ayrımı gerekecek. |

---

## 2. Piyasa karşılaştırması

| Platform | Varlık / Zincir | Emanet modeli | Anlaşmazlık çözümü | KYC | Not |
|---|---|---|---|---|---|
| Binance P2P | Çoklu (CEX içi) | Custodial | İnsan destek ekibi, e-posta ile appeal | Var | TR'de en derin USDT/TRY likiditesi; taker %0, maker %0,15–0,35 |
| Noones | BTC / USDT | Custodial (platform escrow) | Moderatör | Var | Paxful'un Kasım 2025'teki kapanışından sonra kullanıcıları devraldı |
| Bisq | BTC | 2-of-2 multisig + ~%2 teminat | Arabulucu / hakem | Yok | Masaüstü, 2026'dan itibaren Android; en merkeziyetsiz eski oyuncu |
| RoboSats | BTC (Lightning) | Hold invoice | Koordinatör hakem | Yok | 0,03 BTC sipariş tavanı |
| HodlHodl | BTC | Trade başına multisig | Platform hakemi | Yok | Web tabanlı |
| Peach | BTC | Multisig | Platform hakemi | Yok | Mobil öncelikli |
| **Peer (ZKP2P)** | USDC, **Base** + çok zincir | Akıllı kontrat | **Kanıt tabanlı:** zkTLS/zkEmail ödeme kanıtı, hakem yok | Yok | Araf'a en yakın rakip; Venmo, Revolut, Wise gibi kanıt üretilebilen raylarla sınırlı |
| **Araf** | USDT/USDC, Base | Akıllı kontrat | **Hakem de kanıt da yok:** zaman + bond + bleeding | Yok (PII yalnız trade kapsamlı) | TR_IBAN, SEPA, ACH |

**Konumlanma:**
- Bisq, RoboSats, HodlHodl ve Peach BTC odaklı ve **insan hakeme** dayanıyor.
- Peer, hakemi **kriptografik kanıtla** değiştiriyor; ancak kanıt üretilemeyen raylarda (TR IBAN/FAST gibi) çalışamaz.
- Araf bu boşluğu dolduran tek model: kanıt üretilemeyen raylarda, stablecoin ile, hakemsiz uzlaşma.
- Türkiye'de USDT/TRY hacmi büyük ve FAST baskın ray.

---

## 3. SWOT

### Güçlü yönler (Strengths)
- **Hakemsiz, kanıtsız çözüm.** Bleeding Escrow, kanıt üretilemeyen banka raylarında da çalışır. Bu, Peer'in kapsayamadığı bir alan.
- **Kontrat tek otorite.** Backend yalnız mirror; admin alıcı veya ağırlık seçemiyor. Bu ilke artık kodda da zorlanıyor (pause, sweep, finalize).
- **Pozitif + negatif teşvik birlikte.** Proof of Peace ödülleri gelir payından fonlanıyor; cashback değil, pro-rata.
- **Base L2.** Düşük gaz maliyeti; USDC'nin yerel zinciri.
- **Kapsamlı test disiplini.** Kontrat 211, backend 237, frontend 350 test; ABI kayması CI'da yakalanıyor.

### Zayıf yönler (Weaknesses)
- **Soğuk başlangıç likiditesi.** Order-book modeli, Binance P2P'nin TR derinliğiyle ilk günden yarışamaz.
- **Onboarding sürtünmesi.** 7 günlük cüzdan yaşı, 0,001 ETH dust şartı, Tier 0 limitleri ve 4 saatlik cooldown sybil'e karşı doğru ama yeni kullanıcıyı yavaşlatıyor.
- **Chargeback riski maker'da kalıyor.** Protokol bu riski fiyatlıyor ama ortadan kaldırmıyor.
- **Bytecode tavanı dolu.** Yeni kontrat özelliği için modülerleşme şart.
- **Tek zincir ve iki stablecoin.** BTC P2P kitlesine hitap etmiyor.

### Fırsatlar (Opportunities)
- **Paxful'un kapanması.** Kasım 2025'te kapandı; custodial P2P'ye güven sarsıldı ve self-custody anlatısı güçlendi.
- **Peer'in bıraktığı boşluk.** Kanıt üretilemeyen raylar (TR FAST/IBAN, birçok SEPA bankası) açık alan.
- **AI agent ve SDK entegrasyonları.** Peer MCP/SDK ile bu yöne gidiyor. Araf'ın permissionless kontratları wallet ve aggregator entegrasyonuna uygun.
- **Sponsor / ürün havuzları.** Cüzdan ve fintech kampanyaları için hazır altyapı; artık fonlar gerçekten kullanıcıya ulaşıyor.

### Tehditler (Threats)
- **Türkiye düzenleme ortamı.**
  - 7518 sayılı Kanun kripto hizmet sağlayıcılarını SPK denetimine aldı.
  - "Başkası adına veya meslek olarak P2P" işlemler yasak kapsamında.
  - MASAK kaynaklı **banka hesabı blokeleri** yaygın. Kontrat bunu çözemez; kullanıcı riski gerçek.
  - Backend'i işleten tarafın hukuki statüsü için **profesyonel hukuki görüş şart.**
- **CEX rekabeti.** Binance P2P'de taker ücreti %0 (Araf'ta taker ücreti %0,15).
- **Kanıt tabanlı rakiplerin genişlemesi.** zkTLS yeni rayları kapsadıkça hakemsiz-kanıtsız modelin avantaj alanı daralabilir.
- **Wash trading.** Ödül bütçesi sentetik hacim maliyetini aşarsa sybil çiftçiliği başlar (belgede de belirtildiği gibi).

---

## 4. Önerilen sonraki adımlar (felsefeye göre sıralı)

1. **Governance'a da zamana güven:** Deploy script'inde ownership'i `TimelockController`'a devret (48 saat). Kontrat kodu değişmez.
2. **Ücret konumlandırması:** Taker ücretini Tier 0'da 0'a çekmeyi değerlendir (Binance ile eşitlik). Maker ücreti ve bleeding zaten gelir üretiyor.
3. **`paymentRiskLevel` fiyatlaması:** HIGH seçildiğinde min Tier 1 ve küçük bir bond ek ücreti; RESTRICTED seçildiğinde revert.
4. **Hukuki çerçeve (TR):** Backend operatörünün SPK/MASAK karşısındaki statüsünü netleştir. Kullanıcıya "kendi hesabından, kendi adına" uyarısını tek satırlık bir UI bildirimi olarak göster.
5. **Onboarding:** Cüzdan yaşı sayacını ve dust şartını tek bir "hazırlık" kartında göster. Kural değişmez, yalnız görünürlük artar.
