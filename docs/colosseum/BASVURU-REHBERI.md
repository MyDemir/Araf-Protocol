# Colosseum (Crypto World's Fair) Başvuru Rehberi

**Kaynak:** `llms-full.txt` (Superteam Türkiye rehberi)  
**Son güncelleme:** Ekim 2026

---

## Colosseum Nedir?

Colosseum, Solana ekosisteminin en büyük startup yarışması ve ön-tohumlama fon hava girişidir. İlk kez tüm blockchain'lere açıldı, ancak başarılı vergi (accelerator) parası Solana kurucularının arkasında kalıyor.

**Temel rakamlar:**
- **Ödül havuzu:** $840,000 (genel ödüller + ekosistem trackları)
- **Accelerator fonu:** $2,5M, başarılı takımlar $250K ön-tohumlama + 12 hafta San Francisco'da
- **Türkiye havuzu:** 10,000 USDG (Superteam Earn üzerinden, Colosseum'un üstüne)
- **Geçmiş katılım:** 9,000+ ürün (tüm Colosseum tarihinde)

**Amaç:** Bu bir hackathon değil, ön-tohumlama hunisi. Jüriler startup yatırımcıları gibi puan veriyor; 7 kriterden 5'i iş kriterleri. (llms-full.txt:65-85, 87)

---

## Başvuru Aşamaları

### Aşama 1: Kayıt ve Ekip Oluşturma

**Zamanı:** Yarışma açılışından Deadline'a kadar. Geç başlayanlar da 12 Ekim 23:59 PT'ye kadar kaydolabilir.

Adımlar (llms-full.txt:183-192):
1. **Superteam Türkiye referral linki ile kaydol**  
   https://colosseum.com?ref=superteamtr-2026

2. **Arena hesabını oluştur** - Email, Google, GitHub veya X ile giriş yap

3. **Resmi olarak yarışmaya kayıt ol** - "Register" düğmesine tıkla (hesap ≠ kayıt)

4. **Lokasyonu Türkiye olarak ayarla** - Türkiye havuzuna katılmanın şartı

5. **Tüm ekip üyelerini kaydet** - Her üye kendi hesabıyla kaydolmalı; eksik üyelerin yer alması saçık diskalifikasyon (llms-full.txt:247)

6. **Superteam Türkiye orientation formunu doldur**  
   https://forms.gle/EELv1S3eD1nEytrq7  
   → Office hours, mentoring, kickoff sessions için listeye girer (llms-full.txt:52, 191)

7. **Ideyen yoksa bul:** Cofounder Matching veya Telegram grubunu kullan

**Takım büyüklüğü:** Solo katılışa izin var ama jüriler 3+ üyeli takımları tercih ediyor (llms-full.txt:191).

**Uygunluk kontrolü:** Yarışma yeni startuplar için, önemli dış sermaye almamış olanlar için. Daha önce fon topladıysan kuralları oku. (llms-full.txt:299)

---

### Aşama 2: Fikir Doğrulama ve İnşaat (Hafta 1-3)

**Süre:** 14 Eylül - 5 Ekim (3 hafta)

#### Hafta 1: En Dar MVP (llms-full.txt:194-200)

**Hedef:** Bir kullanıcı, bir iş, bir ekran. Devnet'te çalışan chain entegrasyonu.

Yapılacaklar:
- [ ] Kapsam kes: çok geniş proje = başlıca başarısızlık sebebi
- [ ] Wallet connect + gerçek işlem: chain entegrasyonu erken ve gerçek olmalı
- [ ] Var olan stack'i kullan (yeniden yazma): Helius/Triton (RPC), Privy (auth), Jupiter (swaplar), Squads (multisig), Pyth (fiyatlar)
- [ ] İlk "build in public" postu: Gün 1 başından iyisi var (llms-full.txt:200)

#### Hafta 2: İnsanlara Göster (llms-full.txt:202-208)

**Hedef:** 10 gerçek kullanıcı test etti, alıntı var.

Yapılacaklar:
- [ ] Public URL'ye koy: GitHub linki ≠ demo
- [ ] Hedef müşteri profili içindeki 10 insana göster, sessiz gözlemle
- [ ] Ne kırıldığını yaz. Adopsiyon kesen hataları düzelt.
- [ ] Pitch malzemelerine başla: Deck outline + kamera için anlatacağın hikaye  
  **Format:** Problem → Solution → Demo → Team (llms-full.txt:208)

#### Hafta 3: Traction ve Hikaye (llms-full.txt:210-217)

**Hedef:** Slayt üzerindeki rakamlar + açıklayan hikaye.

Yapılacaklar:
- [ ] Ürünü instrument et: kullanıcılar, retained kullanıcılar, işlemler, hacim. İkisini savun.
- [ ] Hikayeyi rakamların etrafında inşa et, vizyon etrafında değil.
- [ ] Rough pitch kaydı yap, 1x hızda izle. Hook ilk 10 saniyede yoksa yeniden yaz (llms-full.txt:215)
- [ ] Superteam Türkiye'den milestone amplifiye etmesini iste (launch duyurusu değil, sonuç)

---

### Aşama 3: Teslim Hazırlığı (Hafta 4, 6 Ekim - 12 Ekim)

**Zamanı:** 6 Ekim 4:00 PT'den 12 Ekim 23:59 PT'ye (llms-full.txt:218-228)

**⚠️ TAKVIM UYARISI:** Colosseum California saati kullanıyor, Türkiye 10 saat öncede. 12 Ekim 23:59 PT = **13 Ekim 09:59 Türkiye saati** (llms-full.txt:16, 226)

Yapılacaklar:
- [ ] Pitch video (max 2 min): Problem, solution, team, traction. Founder sesi (voiceover değil). Public project page'de.
- [ ] Demo video (max 3 min): Ürün çalışırken. Technical. İkinci pitch değil. Ayrı upload.
- [ ] Repo publish et: Private kalırsa `hackathon@colosseum.com`'e erişim ver
- [ ] **Superteam Türkiye havuzuna da gönder** - Aynı proje, iki ayrı gönderim (Colosseum portal + Earn listing) (llms-full.txt:225, 249)
- [ ] **2 gün erken gönder** - Son gece platform yavaş, temyizi yok (llms-full.txt:227)

---

## Teslimde İstenenler (Kontrol Listesi)

Aşağıda dokuz madde; her biri daha önce bir takımın başvurusunu düşürmüş. (llms-full.txt:237-249)

### Temel Materyaller

- [ ] **One-liner ve açıklama yazılı ve incelendi** (llms-full.txt:244)
  - Bir cümle: Yabancı takip etmeden anlaşılmalı
  - Örnek format: "Stablecoin neobank SMB'ler için"
  - Adres: Superteam Türkiye'ye gönder incelemesi için

- [ ] **MVP canlı public domaine** (llms-full.txt:244)
  - Public erişim, localhost screenshot ≠ ürün
  - Public URL gerekli

- [ ] **İş ve gelir modeli yazılı** (llms-full.txt:244)
  - 3 cümle: Bu nasıl para kazanır
  - Jüriler açıkça puan veriyor
  - Adres: Superteam Türkiye'ye gönder incelemesi için

- [ ] **Chain entegrasyonu gerçekten çalışıyor** (llms-full.txt:246)
  - Min: Wallet connect + gerçek işlem
  - Tüm ekosistemler uygun (bu kez ilk kez)
  - Ama accelerator parası Solana'da kal: bunu seçmeden önce oku (llms-full.txt:74-75)

- [ ] **Kod published veya judge erişimi verildi** (llms-full.txt:246)
  - Private repo = en yaygın kendi gol
  - Private Google Docs da kapat
  - Adres: `hackathon@colosseum.com`
  - Commit öncesi: takım dışından birinin tüm linkler açabileceğini kontrol et

### Sosyal ve Ekip

- [ ] **Verified X hesabı, günlük post, judge panel takip** (llms-full.txt:246)
  - Panel: 5 Colosseum + 15 track judge (Phantom, Base, Anza, Arcium, Drift, Ellipsis, MetaDAO)
  - Sessiz takımlar abandoned görünüyor
  - Build-in-public: Sonuçlar (intention değil), hafta sonu gemi kaydı (announcement ≠)

- [ ] **Tüm ekip üyeleri Colosseum'da kayıtlı** (llms-full.txt:248)
  - Project page'de eksik üye = saçık diskalifikasyon

- [ ] **Her takım üyesi yalnızca bir takımda** (llms-full.txt:1342)
  - Bir proje per takım, bir proje per kişi
  - Eski kodunuz varsa bildirin (gizleme = ceza ban + revoke) (llms-full.txt:540-545)

### Pitch ve Demo Videoları

- [ ] **Pitch video taslağı ve incelendi** (llms-full.txt:247)
  - Format: Problem → Solution → Demo → Team (llms-full.txt:308)
  - Max 2 dakika, public project page'de
  - İlk 10 saniye kapat - hook yoksa yazı yeniden yaz (llms-full.txt:305)
  - Founder sesi (voiceover artist değil), teleprompter değil
  - Adres: Incelemesi için Superteam Türkiye'ye gönder

- [ ] **Demo video (ayrı upload)** (llms-full.txt:500)
  - Max 3 dakika
  - Teknik: Ürün live çalışırken
  - Not slide deck, not code walkthrough
  - Judge izleyebileceği gerçek ürün

- [ ] **Superteam Türkiye havuzuna gönder** (llms-full.txt:249)
  - Aynı proje, iki yerde
  - Colosseum portal ≠ Earn listing (her ikisini yap)

---

## Teslim Formu Alanları (Forma Hazırlık)

**⚠️ Not:** Tüm cevapları önceden bir dokümanda yazı, karakter limitlerine uydu, sonra yapıştır. Forma birinci kez cevap yazma hızını düşürüyor. (llms-full.txt:621-622)

**Submit butonu:** 6 Ekim 4:00 PT'de açılıyor. Taslak kaydedilebilir ama beklemene gerek yok - hemen başla. (llms-full.txt:221)

### Tier 1: Public Sayfada Görülür (llms-full.txt:600-616)

- Project name
- Brief description (max 500 char) - one-liner değişmeden
- Project website (optional)
- Category
- Team primary location - **Türkiye seç**
- Logo/graphic (JPEG/PNG/WEBP/GIF, max 20MB)
- GitHub link - **Org/profile değil, direct repo**
- **Pitch video** (max 2 min)
- X profile

### Tier 2: Jürilerle Paylaşılır, Public Değil (llms-full.txt:618-642)

- Neyi inşa ediyorsun, kimin için? (max 1000 char)
- Neden bunu karar verdin, neden şimdi? (max 1000 char)
- Hangi teknolojiler? (developer tools, AI tools dahil)
- Hangi chain'ler? (Claim değil, gerçekten entegre olanlar)
- **Bu chain'leri nasıl kullanıyorsun?** (max 500 char) - ZORLU entegrasyonlar burada yakalanır
- Mobile-focused dApp mı?
- Team Telegram contact (prize/accelerator için)
- Ekipte olmayan ama katkı yapan? (max 600 char)
- Başka? (max 500 char, optional ama yararlı)
- **Demo video** (max 3 min, ayrı upload)
- Live product link + erişim talimatları

### Tier 3: Accelerator Screening (Private, llms-full.txt:643-663)

Accelerator'u istemiyor da olsan cevapla (required ve dönem değil).

- İnsanlar bunu gerçekten istediğini nasıl biliyorsun? (max 1000 char)
- Ne kadar ilerledin? Kullanıcı var mı? (max 1000 char)
- Bu alanda başka kimler inşa ediyor, onlar neyi yanlış yapıyor? (max 1000 char)
- Para modeli nedir? (max 500 char)
- Her üye ne kadar süredir bunun üzerinde, full-time mi? (max 500 char)
- Her üyenin konumu, yüz yüze çalışıyor mu? (Post-funding değişir mi?)
- Yes/no: Legal entity kurmuş mu?
- Yes/no: Yatırım almış mı?
- Yes/no: Şu anda fundraising yapıyor mu?
- Yes/no: Live token var mı?

---

## Jüri Değerlendirme Kriterleri

### Resmi 7 Kriter (llms-full.txt:263-279)

1. **Founder-market fit ve motivasyon** - Neden sen, özel olarak, bu soruna?
2. **Unique insight ve teknoloji** - Odada başka kimsenin bilmediği ne?
3. **Ürün yürütme kalitesi** - Çalışıyor mı, built hissi veriyor mi?
4. **Market büyüklüğü** - Tavan yatırımcının zamanına değer mi?
5. **Founder iletişimi** - 2 dakikada açıklayabiliyor musun?
6. **İş viability** - Nasıl para kazanıyor?
7. **Traction ve talep** - İspatı var mı birisi isteyeceğini?

**Oku:** Beşi iş kriterleri. Startup yarışması hackathon kıyafetinde. (llms-full.txt:281)

### Resmi Kurallar'da Listelenmiş 6 Kriter (llms-full.txt:288-298)

- Functionality
- Potential impact
- Novelty
- UX
- Open-source and composability
- Business plan

**Çatışma:** Kod hakkında. FAQ: stil/best practices derecelendirilmez. Rules: "Kod kalitesi nedir?" Mantık: İşlev gerekli, jüri repo aç ve inşaatı görüp mantıklı ön seçim yap. Ekstra refactor = sıfır puan. (llms-full.txt:291-297)

### AI Ön Filtreleme (llms-full.txt:282-286)

Jürilerden önce internal AI engine filter ve flag'ler. Değerlendiriyor:
- Founder-market fit
- Product velocity
- User demand
- Market timing
- "Evidence of grit" (geçmiş track record)

**Sonuç:** Track record önemli; 4 hafta içinde inşa edilemiyor. Başvur mevcut track record'unla, temiz slateden değil.

**Panel stage:** 15 dakika call (yeni demo değil). Sorulan: "Geçen hafta ne gönderde?" "Full-time misin?"

---

## Pitch ve Demo Video Taktikleri

### Video > Deck (llms-full.txt:506-510)

Superteam Balkan 139 kazanan submission analiz etti:
- **88% video:** 63 Loom, 49 YouTube, 8 Vimeo
- **12% PDF/slide:** ~16 deck

Grand Champion: YouTube video.

**Neden:** Jüri 100+ submission'u solo review ediyor. Video deck rolünü oynatıyor. (llms-full.txt:510)

### İlk 10 Saniye Kapat (llms-full.txt:305)

"First ten seconds decide the rest" - Origin story değil, **problem + solution** ile aç. Jüri yüzlerce submission'ı review ediyor. (llms-full.txt:305)

### Yapı: Problem → Solution → Demo → Team (llms-full.txt:308)

Bundan sapma = açıklık kaybı + kazanç yok. İçin 2 dakika, business model formu sorduğu yere yazı (video padding değil). (llms-full.txt:309)

### One-Liner Güçlüdür (llms-full.txt:514-519)

Sağlam one-liner shortlist'e kendi başına geçebilir.
- Jüri 1 saat sonra hatırlıyor.
- Investor partnerlerine tekrarlamıyor.
- Örnek: "Stablecoin neobank SMB'ler için" (revolutionary saçmalığı yerine)

**5 slayt kuralı:**
1. Başlıkta takeaway - "Problem" değil, "Users $4M/year wallet drain'de kaybediyor"
2. Slayt başına 1 puan
3. Max 40 kelime; üzeri skim yapılıyor
4. Superlative'leri kes; kanıtla: "15 saniye start-to-finish", "$400/user/ay tasarruf"
5. Her slayt 15 saniyede okunur; toplam ~90 saniye deck

(llms-full.txt:527-538)

### Kaybetme Yolları (4 Tane) (llms-full.txt:527-538)

- **Geleceği satış:** Grand vision, track record yok = pitch, product değil. MVP göster.
- **Zorlu crypto entegrasyonu:** Ürün chain olmadan var olabilirse, kullanımı justify et ya da talep etme.
- **Zayıf demo:** GitHub linki ≠ demo. Judge'ın izleyeceği çalışan şey gerek.
- **Eksik permission:** Private repo/Google Doc judge açamıyor. **En yaygın fatal hata.** Private kalıyorsa `hackathon@colosseum.com`'e erişim ver, test et.

(llms-full.txt:531-538)

---

## Diskalifikasyon Kuralları (2 Tane)

**Bu stil kuralı değil; iki takım zaten kapısı kapatılmış.** (llms-full.txt:540)

1. **Bir ürün per takım, bir ürün per kişi** (llms-full.txt:540)
   - İki proje gönderemezsin
   - İki submission'a görünemezsin

2. **Eski kod açıklamamak** (llms-full.txt:541-545)
   - Window'dan önce başlayabilir, kendi kodunu yeniden kullanabilirsin
   - **Ama eski geliştirmeyi bildirmelisin form'da**
   - Gizleme cezası: diskalifikasyon + future hackathon ban + prize revoke
   - Açıklama = sıfır maliyet; running start takımlar iyi yerleşmiş

---

## Önemli Tarihler

| Tarih | Olay | Saat (PT) | Saat (TR) |
|-------|------|-----------|----------|
| 14 Eylül | Kayıt + proje/ekip alanları açılır | - | - |
| 16-7 Ekim | Colosseum Community Calls (X Spaces, Wednesdays 19:00 TR) | - | - |
| 6 Ekim | **Submit butonu açılır** | 4:00 AM | ~2:00 PM |
| 12 Ekim | **DEADLINE: 23:59 PT** | 23:59 | 13 Ekim 09:59 |
| (File) | Judges panel ve AI eval | - | - |
| 28 Ekim | Possible results announcement | - | - |

**⚠️ TIMEZONE:** Colosseum = California (UTC-7 veya -8). Türkiye = UTC+3. Fark: 10 saat. Türkiye midnight = 10 saat geç. (llms-full.txt:32)

---

## Pitch ve Demo Videosu Yapmak İçin İpuçları

### Ön Hazırlık (llms-full.txt:621-627)

1. Her cevabı doc'da yaz, karakter limitine uydu - form'da canlı yazma yok
2. Pitch video + demo video + GitHub linkini takım dışından biriyle test et (accessibility check)
3. Chain listeyi karar ver: "Bu chain'leri nasıl kullanıyorsun?" cevabından önce
4. Tier 3 (accelerator screen) cevapla, accelerator'ü istemiyor da olsan

### Pitch Video Konusu (llms-full.txt:499)

Max 2 dakika. Açıkla *neden*: kim, ne, neden başladın, market, müşteri kaynağı, working demo.

### Demo Video Konusu (llms-full.txt:500)

Max 3 dakika. Teknik *nasıl*. Slide deck değil, code walkthrough değil. Canlı ürün judge'ın izleyebileceği.

---

## Sonrası: Hedefiniz Başarıdan Sonra

### Kazanmazsan da (llms-full.txt:556-592)

- **Momentum:** Deadline sonrası 2 hafta jüriler ve investor'ler bakar. Prize hunters durur, builders devam eder.
- **İlk defada kazanış nadir** - Unruggable 4 Colosseum hackathon'a katıldı (honor mention → track win → Grand Championship)
- **Top group placement = accelerator decision** - Tek top spot değil

### Accelerator ve Hibeler (llms-full.txt:573-592)

**Accelerators:**
- Colosseum Accelerator: $250K founder-friendly (sadece hackathon yolu)
- Alliance DAO: $500K ~7%
- Orange DAO: $100K MFN SAFE

**Grants:**
- Solana Foundation
- Solana Mobile builder grants
- Circle developer grants
- Superteam Earn

**Membership:** Hackathon'da gerçek şey gönderdiysen, Superteam Türkiye membership açısından kredibil - yerel hibeler + perks kapısı.

---

## Kontrol Listesi

Teslim öncesi, başvurunuzu gözden geçirin:

### Fikir ve Doğrulama
- [ ] One-liner yazılı (iki cümlü değil, maksimum açık)
- [ ] Market sorunu 10 gerçek insanla doğrulandı
- [ ] Coloseum Copilot ile gap-check yapıldı
- [ ] İş modeli 3 cümle = 500 karakter (form'ı planla)

### Ürün
- [ ] MVP public domain'de live (localhost screenshot değil)
- [ ] Wallet connect + gerçek işlem lansman etmiş
- [ ] UI basit ve mantıklı (ekstra feature değil)
- [ ] Ürün teknik spec'te chain entegrasyonunu gerektirir (forced değil)
- [ ] Repo public veya `hackathon@colosseum.com` erişimli
- [ ] README/docs takım dışından biri için açık

### Track Record / Social
- [ ] X account verified
- [ ] Günlük post yapılıyor (son 4 hafta minimum haftada 5x)
- [ ] Judge panel (5 Colosseum + 15 track) takip ediliyor
- [ ] 1-2 milestone Superteam Türkiye'den amplifikasyon istendi

### Videolar ve Malzeme
- [ ] Pitch video (max 2 min): Problem → Solution → Demo → Team, founder sesi, ilk 10s hook'ü açık
- [ ] Demo video (max 3 min): Technical, ürün canlı, not slide, not code walkthrough
- [ ] Logo/graphic (JPEG/PNG/WEBP/GIF, 20MB)
- [ ] Videoları takım dışından birinin izleyebileceğini test ettiniz

### Form Hazırlığı
- [ ] Tüm Tier 1 cevapları doc'da yazılı ve karakter limiti kontrol edilmiş
- [ ] Tüm Tier 2 cevapları yazılı (1000 char, 500 char alanları)
- [ ] Tier 3 (accelerator) cevapları yazılı ve gözden geçirilmiş
- [ ] Chain integration kuralını oku: "Bu chain'leri nasıl kullanıyorsun?"

### Ekip
- [ ] Her üye Colosseum Arena'da kendi hesabıyla kaydolmuş
- [ ] Project page'de tüm üyeler görülüyor
- [ ] Hiçbir üye başka takımda değil
- [ ] Telegram kontağı vermiş (prize/accelerator iletişim)

### Superteam Türkiye Havuzu
- [ ] Superteam Türkiye orientation formu doldurulmuş
- [ ] Türkiye lokasyonu Arena'da ayarlanmış
- [ ] Earn listing'e gönderme planlandı (aynı proje, iki yerde)

### Gönderme
- [ ] 12 Ekim 23:59 PT'den 2+ gün önce gönder (platform geç)
- [ ] **Deadline'ı Türkiye saatinde biliyor (13 Ekim 09:59, değil midnight)**
- [ ] Tüm linkler (GitHub, video, product) erişilebilir test edilmiş
- [ ] Private repo erişimi `hackathon@colosseum.com` ile test edilmiş

---

## Kaynaklar ve Linkler

- **Kayıt (Superteam Türkiye referral):** https://colosseum.com?ref=superteamtr-2026
- **Orientation form:** https://forms.gle/EELv1S3eD1nEytrq7
- **Superteam Türkiye Earn listing:** https://superteam.fun/earn/listing/submit-crypto-worlds-fair-project-for-turkish-builders/
- **Cofounder Matching:** https://colosseum.com/cofounder-matching
- **Telegram grup:** https://t.me/+3sWAzL4fgPViMjU8
- **Colosseum hakikat kontrol:** https://blog.colosseum.com/how-to-win-a-colosseum-hackathon
- **Resmi kurallar:** https://colosseum.com/legal/ (PDF)
- **Luma Calendar (Office Hours, Community Calls):** https://luma.com/superteamtr
- **Superteam Türkiye Colosseum hub:** https://tr.superteam.fun/colosseum/

---

**Hazırladı:** Superteam Türkiye  
**Kaynaklar:** Colosseum Hacathon Rules & How to Win Guide, Superteam Balkan analysis  
**Son güncelleme:** Ekim 2026
