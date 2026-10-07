# Başvuru TODO Listesi (Araf Protocol · Crypto World's Fair)

> Son teslim: **12 Ekim 23:59 PT = 13 Ekim 09:59 Türkiye**. Rehber 2 gün erken göndermeyi
> öneriyor (platform son gece yavaşlıyor, itiraz yok): hedef **10 Ekim**.
>
> Bu listedeki her madde, diğer dosyalardaki bir `[[TODO: ...]]` yer tutucusuna ya da senin
> vermen gereken bir karara karşılık gelir. Kodda/belgede olmayan hiçbir bilgi uydurulmadı.
> Sıra önceliğe göre. Toplam: **45 madde** (45. madde sonradan eklendi, 0. bölümde).

---

## 0. EN ÜSTTE: Önceden yazılmış kodun beyanı (diskalifiye kuralı)

Kural (llms-full.txt 540-545): pencere açılmadan önce yazılmış kendi kodunu kullanabilirsin, ama
**formda beyan etmek zorundasın**. Gizlemek = diskalifiye + gelecek hackathon'lardan men + ödül
iadesi. Beyan etmenin cezası yok. Yalnız pencere içindeki iş değerlendirilir.

Git'ten çıkan gerçekler (`git log`):
- İlk commit: **2 Mayıs 2026** (`d70c55f`). Bu tek commit 240 dosya / ~77 bin satır ekliyor, yani
  kontrat, backend ve frontend o gün zaten hazırdı; proje repodan da eski.
- 14 Eylül 2026 öncesi **59 merge olmayan commit** (merge'ler dahil 68; son: 10 Ağustos, `afb20f6`).
- Pencere içi: **28 Eylül'den bu yana 137 merge olmayan commit**: 132'si Claude Code, 5'i senin
  (escrow'un kütüphanelere bölünmesi, ödeme penceresi, düşen challenge ping'i, iptal geri alma,
  ödeme profili kapısı, dokümantasyon hizalaması). Ölçüm tarihi: 7 Ekim 2026.
- Commit yazarları yalnız "MyD" ve "Claude".

- [ ] **1.** FORM.md → "Anything else judges should know" alanındaki beyan taslağını oku, doğruysa
      onayla. `[[TODO: real start date]]` yerine projenin gerçek başlangıç tarihini yaz (repo öncesi
      çalışma dahil). 500 karakter sınırı: şu an 460, ~40 karakter payın var.
- [ ] **2.** Önceki iş başka bir hackathon'a / programa / yarışmaya gönderildi mi? Gönderildiyse
      bunu da beyana ekle `[[TODO]]`.
- [ ] **3.** AI aracı beyanı: FORM.md "technologies" ve "Did anyone not on the team..." alanlarında
      Claude Code kullanımını açıkça yazdım. Başka AI aracı kullandıysan ekle.
- [ ] **4.** "Did anyone not on the team do meaningful work?" → başka bir insan katkısı olmadığını
      teyit et (git'te yalnız MyD + Claude görünüyor).
- [ ] **45.** Göndermeden hemen önce commit sayılarını yeniden ölç (yeni commit'ler sayıları
      değiştirir) ve FORM.md'deki "Anything else", "How long have you..." alanları ile buradaki
      rakamları güncelle:
      ```bash
      git log --reverse --format='%ad %h' | head -1                       # ilk commit
      git rev-list --count --no-merges --until=2026-09-14 HEAD            # pencere öncesi
      git rev-list --count --no-merges --since=2026-09-28 HEAD            # pencere içi
      git rev-list --count --no-merges --since=2026-09-28 --author=Claude HEAD
      git rev-list --count --no-merges --since=2026-09-28 --author=MyD HEAD
      ```

## 1. Base Sepolia deploy + canlı frontend URL (en kritik teknik iş)

Rehber şartı: "MVP live on public domain" + "wallet connect + real transaction". Şu an repoda
deploy kaydı yok (`contracts/deployments/` yok) ve `araf-protocol.vercel.app` /
`araf-protocol-backend.fly.dev` bu ortamdan doğrulanamadı.

- [ ] **5. BUGÜN: kontratları Base Sepolia'ya deploy et** (`docs/EN/DEPLOYMENT_GUIDE.md` §3) ve
      BaseScan'de doğrula (kütüphaneler + escrow). Adresleri yaz:
      `[[TODO: Base Sepolia escrow adresi]]`, `[[TODO: ArafReputationLib adresi]]`,
      `[[TODO: ArafSettlementLib adresi]]`, `[[TODO: deploy blok numarası]]`, `[[TODO: treasury adresi]]`.
- [ ] **6. BUGÜN: alıcı (taker) cüzdanlarını `registerWallet()` ile kaydet.** Kontrat 2 günden genç
      cüzdanın emir almasını reddediyor (`WALLET_AGE_MIN = 2 days`). 7 Ekim kayıt → 9 Ekim'den
      itibaren demo çekilebilir. En az 2 alıcı cüzdanı (Tier 0'da aynı alıcı için 4 saat bekleme var).
- [ ] **7. Test token kararı:** `deploy.js` public ağda mock token deploy etmiyor; iki token adresi
      (`BASE_SEPOLIA_USDT_ADDRESS`, `BASE_SEPOLIA_USDC_ADDRESS`) vermen lazım. Seçenek: kendi
      `MockERC20`'ni Base Sepolia'ya deploy et (herkes saatte 1000 basabilir) ya da mevcut bir test
      USDC kullan (adresini doğrula). `[[TODO: test USDT adresi]]`, `[[TODO: test USDC adresi]]`.
- [ ] **8. ENGEL: frontend production build'i yalnız Base mainnet'e izin veriyor**
      (`frontend/src/app/chainPolicy.js`: `isProd ? [8453] : [...]`; DEPLOYMENT_GUIDE da aynısını
      söylüyor, "a hosted Sepolia frontend needs a non-production build, which this guide does not
      define"). Uygulama faucet butonu da production'da kapalı. Base Sepolia'da canlı site için kod
      değişikliği ya da production-dışı build gerekiyor. Bu, `docs/colosseum/submission/` dışında bir
      iş; ayrı bir görev olarak planla.
- [ ] **9.** Backend'i Fly.io'ya kur: `EXPECTED_CHAIN_ID=84532`, adresler, `ARAF_DEPLOYMENT_BLOCK`.
      Production modunda AWS KMS veya Vault zorunlu (`KMS_PROVIDER=env` reddediliyor), MongoDB +
      Redis (`rediss://`) gerekli. `[[TODO: backend URL]]`, `/health` ve `/ready` 200 dönmeli.
- [ ] **10.** Frontend'i yayınla (Vercel config var): `[[TODO: canlı frontend URL]]`. SIWE domain/URI
      ve CORS origin bu domain ile birebir aynı olmalı.
- [ ] **11.** Dışarıdan biri (ekip dışı) siteyi açıp cüzdan bağlayabiliyor mu? Test et.
- [ ] **12.** Base Sepolia ETH faucet'i: belgede `faucet.quicknode.com` geçiyor; kullandığın ve
      çalıştığını gördüğün faucet linkini FORM.md "access instructions"a yaz `[[TODO]]`.
- [ ] **13.** Jüri için erişim talimatı: 2 günlük cüzdan yaşı kuralı yüzünden jüri alıcı rolünü hemen
      deneyemez. İstersen önceden kaydedilmiş bir "judge test wallet" hazırla `[[TODO: karar]]`.
      (Özel anahtarı paylaşmak riskli; yalnız test cüzdanı, gerçek fon yok.)

## 2. Track seçimi (en fazla 3) · karar senin

Kaynaklar `docs/colosseum/llms-full.txt` (satır numaralarıyla). Aşağıdakiler bilgi, öneri değil.

**Base track** (satır 108): 5 ürün × 5.000 $ = 25.000 $. Araf zaten Base için yazılmış
(`hardhat.config.js`: `base-sepolia` 84532, `base` 8453). Track ödülleri genel ödüllere ek;
her gönderim genel ödüllere (Grand Champion 30.000 $, sonraki 20 takım 15.000 $) de girer (satır 98-113).

**Accelerator** (satır 73-75, 113, 377): "Colosseum's accelerator and venture fund keep investing in
Solana founders." Base'te kalan takım 250.000 $ accelerator yatırımı için değerlendirilmez.

**Superteam Türkiye havuzu (10.000 USDG)** (satır 138-147, 881): dört kriterin üçü açıkça Solana'yı
anıyor; rehberin kendi notu: "a team building elsewhere can still win Colosseum's general awards and
its own ecosystem track, but not this one." Yani Base projesi bu havuzda kazanamaz (rehberin yorumu).

**Solana'ya geçiş ne demek** (koddan): kontratlar Solidity/EVM (`contracts/src` ~3.700 satır, mock'lar dahil), frontend
wagmi/viem, backend event worker ethers v6. Solana'da hepsinin Rust/Anchor + Solana cüzdan/RPC yığını
ile yeniden yazılması gerekir. Rehber de "pick the chain your product actually needs" diyor (satır 379)
ve yalnız pencere içindeki işin değerlendirildiğini hatırlatıyor. Kalan süre: ~5 gün.

**Diğer EVM track'leri** (Ethereum L1, Arbitrum, Robinhood Chain; satır 107-110): kod EVM olduğu için
teknik olarak oraya da deploy edilebilir, ama form "only chains actually integrated" istiyor (satır 620).
Deploy etmediğin zinciri seçmek "forced/claimed integration" riski.

- [ ] **14.** Track'leri seç (en fazla 3) `[[TODO]]`.
- [ ] **15.** Türkiye havuzuna (Earn listing) yine de gönderecek misin? Gönderim kredisi harcamıyor
      (satır 147), ama kriterler Solana odaklı `[[TODO: karar]]`. Gönderirsen pitch videosu orada 3 dk'ya
      kadar olabilir, Colosseum'da 2 dk; tek video yükleyeceksen 2 dk'da tut.

## 3. Ekip bilgileri

- [ ] **16.** Kurucu adı, rolü, "neden sen" cümlesi (PITCH_SCRIPT Team bölümü, FORM "Did anyone..." alanı).
- [ ] **17.** Diğer ekip üyeleri var mı? Varsa her biri ayrı Colosseum hesabıyla **kayıt olmalı**
      (eksik üye = sessiz diskalifiye) ve kimse başka bir takımda olmamalı.
- [ ] **18.** "Why did you decide to build this" alanının ilk paragrafı: kendi hikâyen (2-3 cümle).
- [ ] **19.** "How long have you each been working on this? Full-time?" kişi kişi.
- [ ] **20.** "Where is each team member based, in person?" kişi kişi + fonlamadan sonra değişir mi.
- [ ] **21.** Team Telegram kontağı (her gün bakan biri).

## 4. Traction ve talep kanıtı (uydurma yok)

- [ ] **22.** Kaç kişiyle konuştun, kimler, 1-2 kısa alıntı (FORM Tier 3 "How do you know people need this").
- [ ] **23.** Hedef pazar için kaynağı belli tek bir olgu/rakam (P2P hacmi ya da anlaşmazlık sorunu)
      `[[TODO]]`. Kaynaksız rakam koyma.
- [ ] **24.** Kullanıcı sayısı: dürüst rakam ("henüz harici kullanıcı yok" da kabul) ve varsa testnet
      işlem sayısı (FORM "How far along", PITCH kapanış).
- [ ] **25.** İlk hedef kullanıcı grubu (FORM "who is it for" son cümlesi).
- [ ] **26.** Rakip açıklamalarını doğrula (Bisq, Hodl Hodl, RoboSats, zkp2p). Taslaktaki tarifler
      genel bilgiye dayanıyor, repoda kaynak yok.

## 5. Form alanları ve hesaplar

- [ ] **27.** One-liner: FORM.md'de 3 alternatif var, önerilen A. Superteam Türkiye'ye gözden geçirt.
- [ ] **28.** Product category (formdaki listeden).
- [ ] **29.** Logo dosyası (repoda yok). JPEG/PNG/WEBP/GIF, en fazla 20 MB.
- [ ] **30.** X profili: doğrulanmış hesap, günlük paylaşım, jüri takibi `[[TODO: X URL]]`.
      Frontend'de `VITE_SOCIAL_TWITTER` boş.
- [ ] **31.** Evet/Hayır soruları: şirket kuruldu mu, yatırım alındı mı, şu an fon arıyor musun
      (repoda aktif tur bilgisi yok). Canlı token:
      kodda token yok, "No" yazdım, teyit et.
- [ ] **32.** "Is it mobile-focused?" → "No" yazdım (duyarlı web uygulaması), teyit et.
- [ ] **33.** Hosting satırı: Fly.io + Vercel gerçekten kullanılıyor mu, teyit et.
- [ ] **34.** Colosseum kaydı: referral linki, "Register" butonu (hesap ≠ kayıt), konum Türkiye,
      Superteam Türkiye oryantasyon formu, Telegram grubu.

## 6. Repo erişimi

- [ ] **35.** Repo `https://github.com/MyDemir/Araf-Protocol` herkese açık mı? Değilse
      `hackathon@colosseum.com`'a erişim ver ve ekip dışından biri açabildiğini doğrulasın.
- [ ] **36.** README'nin ilk ekranı: canlı URL, Base Sepolia adresleri ve demo videosu linkini ekle
      (jüri repoyu açınca ilk bunu görmeli). Bu da `submission/` dışında bir değişiklik.

## 7. Videolar

- [ ] **37.** Pitch videosu (≤ 2:00, kendi sesin ve yüzün): PITCH_SCRIPT.md'deki TODO'ları doldur,
      kronometreyle oku, YouTube/Loom'a yükle, çıkış yapmış tarayıcıda test et.
- [ ] **38.** Demo videosu (≤ 3:00): DEMO_SCRIPT.md Part A hazırlık listesini bitir, prova yap, çek.
- [ ] **39.** Demo'da "dispute" bölümü için Versiyon 1 (önceden hazırlanmış challenge'lı işlem) mi,
      Versiyon 2 (BaseScan'de sabitler) mi? Versiyon 1 en erken ~11 Ekim'de çekilebilir.
- [ ] **40.** Videoda gerçek banka bilgisi, gerçek IBAN, seed phrase görünmesin; yalnız test verisi.
- [ ] **41.** Frontend buton etiketlerini prova sırasında teyit et (senaryodaki adlar copy
      dosyalarından alındı, canlı build'de tıklanmadı).

## 8. Belgede yazıp kodda olmayan / kodla çelişen iddialar (doğrula, başvuruda kullanma)

Eski pitch belgesi (silindi) şu iddiaları taşıyordu ve kodla uyuşmuyordu. Başvuru taslaklarında
bunların hiçbirini kullanmadım; doğru değerler koddan:

- [ ] **42.** Ücret: eski pitch "0.2% success fee" diyordu. Kod: varsayılan **taraf başına 15 bps (%0,15)**
      (`contracts/src/ArafEscrow.sol:261-262`), owner değiştirebilir, taraf başına en fazla 2000 bps (`:307`); Tier 0'da maker bond'u 0 olduğu için
      maker ücreti fiilen 0 (`releaseFunds`, `actualMakerFee`).
- [ ] **43.** "Mainnet Ready" ve "100% decentralized / zero operational cost / free from human
      intervention": deploy yok, harici denetim (audit) kaydı yok, owner yönetişim yetkileri var
      (pause, ücret, token ayarı, treasury), backend PII/dekont için gerekli. "Backend holds no private
      keys" da tam doğru değil: `RELAYER_PRIVATE_KEY` itibar çürümesi ve ödül kaydı işleri için var
      (bu fonksiyonlar herkese açık; escrow fonunu taşıyamaz). Mainnet'i yalnız "next" olarak ve
      `docs/TR/MAINNET_READINESS_CHECKLIST.md` kapsamıyla an; checklist'te audit maddesi yok,
      audit planın varsa ekle `[[TODO: karar]]`.
- [ ] **44.** Bleeding anlatımı: eski pitch "all locked funds ... begin to decay" diyordu. Kod
      (`contracts/src/ArafEscrow.sol:266-271`, `:289-291`): 48 saat grace sonrası önce iki tarafın **bond'u** erir (taker %0,42/saat, maker %0,26/saat), kilitli
      kripto ancak 96 saat bleeding'den sonra erimeye başlar, 240. saatte (10 gün) `burnExpired`
      kalanı treasury'ye yollar. Tier 0'da bond yok. Yol haritası maddeleri (ZK IBAN doğrulama,
      The Graph) kodda yok; yalnız "gelecek" olarak anılabilir.

Jürinin sorabileceği bir soru (not): eriyen fonlar ve cezalar treasury'ye gidiyor ve treasury'yi
owner belirliyor; "protokol anlaşmazlıktan kazanıyor" eleştirisine hazır bir cevabın olsun
(ör. ArafRevenueVault gelirin %40-70'ini temiz kapanan işlemlere Proof of Peace ödülü olarak ayırıyor).
