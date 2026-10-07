# Colosseum (Crypto World's Fair) Başvuru Rehberi

**Kaynak:** `llms-full.txt` (Superteam Türkiye rehberi)  
**Son güncelleme:** Ekim 2026

---

## Ekosistem Track'leri (8 Adet)

Kayıt sırasında en fazla **3 track** seçebilirsiniz. Her gönderim **genel ödüllere de** girer. Track ödülleri genel ödüllere ektir. (llms-full.txt:71-110)

### Yüksek Ödüllü Track'ler ($100K each)

- **Solana:** 10 ürün × $10K = $100K
- **Tempo:** 10 ürün × $10K = $100K
- **Hyperliquid:** 10 ürün × $10K (Hypercore veya HyperEVM)
- **Zcash:** 10 ürün × $10K (chain veya asset)

### Düşük Ödüllü Track'ler ($25K each)

- **Ethereum L1:** 5 ürün × $5K = $25K
- **Base:** 5 ürün × $5K = $25K
- **Arbitrum:** 5 ürün × $5K = $25K
- **Robinhood Chain:** 5 ürün × $5K = $25K

**Önemli:** Colosseum'un accelerator ve venture fonu **hala Solana kurucularını** destekliyor. Başka chain'de inşa ederseniz genel ödüllere ve kendi track'inize girersiniz ama accelerator'e giremezsiniz. (llms-full.txt:73-75)

---

## Colosseum Nedir?

Colosseum, Solana ekosisteminin en büyük startup yarışması ve ön-tohumlama fonu işletmesidir. İlk kez tüm blockchain'lere açıldı, ancak başarılı accelerator (hızlandırma programı) parası Solana kurucularının arkasında kalıyor. Colosseum Org LLC şirketi tarafından bağımsız olarak yönetiliyor. (llms-full.txt:12)

**Temel rakamlar:**
- **Ödül havuzu:** $840,000 (genel ödüller + 8 ekosistem track'i)
- **Venture fonu:** $2,5M, Colosseum'un kendi yatırım fonu
- **Accelerator:** Başarılı takımlar $250K ön-tohumlama + 12 hafta San Francisco'da (ilk 2 hafta şehirde, kalan 10 hafta uzaktan olabilir) (llms-full.txt:90)
- **Türkiye havuzu:** 10,000 USDG (Superteam Earn üzerinden, Colosseum ödüllerine ek)
- **Geçmiş katılım:** 9,000+ ürün (tüm Colosseum tarihinde)
- **Geçmiş yatırımlar:** 74 portfolio startup, $60M Fund I (llms-full.txt:59-62)

**Amaç:** Bu bir hackathon değil, ön-tohumlama hunisi. Jüriler startup yatırımcıları gibi puan veriyor; 7 kriterden 5'i iş kriterleri. (llms-full.txt:55-87)

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
- [ ] Pitch video (max 2 min): Problem, solution, team, traction. Founder sesi (voiceover değil). Public project page'de. ⚠️ Colosseum pitch videoları max 2 dakika ile sınırlıdır; Superteam Türkiye Earn listesi 3 dakikaya kadar kabul eder (llms-full.txt:136, 780). Her iki yere de aynı videoyu yüklersen 2 dakika ile kalıyor.
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

**⚠️ Not:** Tüm cevapları önceden bir dokümanda yaz, karakter limitlerine uydu, sonra yapıştır. Forma ilk kez cevap yazma hızını düşürüyor; önceden hazırlamak çok daha hızlıdır. (llms-full.txt:592-598)

**Submit butonu:** 6 Ekim 4:00 PT'de açılıyor. Taslak kaydedilebilir ama beklemene gerek yok - hemen başla. (llms-full.txt:221)

### Tier 1: Public Sayfada Görülür (llms-full.txt:599-611)

Her yer linki olan kişi görür. Yabancı için yaz, jüri için değil.

- **Project name** - Ürün adı
- **Brief description** (max 500 char) - Kendi one-liner'ın, değiştirilmeden
- **Project website** (optional)
- **Product category** - Birden fazla fit ederse en yakını seç
- **Team primary location** - **TÜRKIYE seç** (Türkiye havuzuna girmenin koşulu)
- **Logo/graphic** (JPEG/PNG/WEBP/GIF, max 20MB) - Sıkıştırmadan önce
- **GitHub link** - Doğrudan repo linki (org/profile sayfası değil). Private kalabilir ama `hackathon@colosseum.com`'e erişim ver.
- **Pitch video** (max 2 min) - Kendi sesin ve yüzün; Loom veya YouTube
- **X profile** - Doğrulanmış hesap

### Tier 2: Jürilerle Paylaşılır, Public Değil (llms-full.txt:613-627)

Takımı, jüriyi ve Colosseum'u görür. Jüri her şeyi izlemeden önce bunu oku.

- **Ne inşa ediyorsun ve kimin için?** (max 1000 char)
- **Neden bunu karar verdin ve neden şimdi?** (max 1000 char)
- **Hangi teknolojileri ve AI araçlarını kullanıyorsun?** - Developer tools de saydığın gibi AI tools'ı da saydığınızı belirt
- **Hangi chain'leri kullanıyorsun?** - Claim değil, gerçekten entegre olanlar
- **Bu chain'leri nasıl kullanıyorsun?** (max 500 char) - **ZORLAMA entegrasyonlar burada yakalanır. Ürün zincir olmadan var olabiliyorsa bunu derinlemesine savunmanız gerekir.**
- **Mobile-focused dApp mı?** (Evet/Hayır)
- **Takım Telegram iletişim bilgisi** - Prize dağıtımı ve accelerator görüşmeleri buradan yapılır; kontrol eden biri olsun
- **Ekipte olmayan ama önemli iş yapan var mı?** (max 600 char, dürüst cevapla)
- **Jürinin bilmesi gereken başka şey?** (max 500 char, optional ama yardımcı olabilir)
- **Demo video** (max 3 min, Pitch'ten ayrı upload) - Canlı ürün; slide deck değil, code walkthrough değil
- **Live product link** + erişim talimatları (gerekli ise)

### Tier 3: Accelerator Screening (Private, llms-full.txt:629-640)

Sadece Colosseum ve organizatörler görür. Accelerator'ü istemiyor da olsan zorunlu; bu tabda Colosseum kime bakacağına karar veriyor.

- **İnsanlar bunu gerçekten ihtiyaç duydukları için mi, yoksa gelecekte mi isteyecekler?** (max 1000 char)
- **Ne kadar ilerledin? Kullanıcın var mı?** Mümkün kadar spesifik ol. (max 1000 char)
- **Bu alanda başka kim inşa ediyor ve onlar neyi yanlış yapıyorlar?** (max 1000 char)
- **Nasıl para kazanıyorsun veya kazanmayı planlıyorsun?** (max 500 char)
- **Her biriniz bunun üzerinde ne kadar zamandır çalışıyorsunuz? Full-time mi?** (max 500 char)
- **Takım üyeleri nerede yaşıyor ve yüz yüze çalışıyor musunuz?** Funding sonrası değişir mi? (max 500 char)
- **Evet/Hayır:** Legal entity (şirket) kurdunuz mu?
- **Evet/Hayır:** Yatırım aldınız mı?
- **Evet/Hayır:** Şu an fundraising yapıyor musunuz?
- **Evet/Hayır:** Canlı bir token'ınız var mı?

**Not:** "Hayır" demek sorun değil. Açık uçlu soruları boş bırakmak daha kötü okunur. Accelerator screening'e basit cevaplar en iyi göstergedir.

---

## Diskalifikasyon Kuralları (2 Tane)

**Bu stil kuralı değil. İki takım zaten kapısı kapatılmış.** (llms-full.txt:537-548)

### 1. Bir Ürün Per Takım, Bir Ürün Per Kişi

- **Bir takım yalnızca bir ürün gönderebilir**
- **Bir kişi yalnızca bir gönderimde yer alabilir**
- İki proje gönderemezsin
- İki submission'a görünemezsin

### 2. Eski Kod Açıklamak (Zorunlu)

- Yarışma penceresinden **önce** başlayabilir ve kendi kodunuzu yeniden kullanabilirsiniz
- **FAKAT** sadece pencere **içinde** yapılan iş puanlanır
- **Tüm önceki geliştirmeyi gönderim formunda beyan ETMELISINIZ**

**Gizleme cezası:** Diskalifikasyon + gelecek hackathon'lardan ban + ödül revoke

**Açıklama cezası:** Sıfır. Başlayan takımlar iyi performans gösterebilir. Açıklamak risk değil.

**Not:** Başka insanların açık kaynağını kullanmak izin veriliyor ve teşvik ediliyor. Bu kural sadece kendi önceki kodunuz hakkında. (llms-full.txt:547)

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

## Sonrası: Jüri Süreci ve Kazandıktan Sonra

### Jüri Süreci (llms-full.txt:555-567)

- **Deadline:** 12 Ekim 23:59 PT
- **Sonuçlar:** 5 Aralık civarında (7 hafta)
- **Momentum dönemi:** Deadline sonrası 2 hafta, jüriler ve yatırımcılar takip ediyor. Prize hunters durur, builders devam eder.
- **Panel çağrısı:** Shortlist'e girenler 15 dakikalık görüşmeye çağrılır. Yeni demo değil; "Geçen hafta ne ship ettiniz?" "Full-time misiniz?" sorularıyla velocity ve commitment kontrol edilir. (llms-full.txt:285-286)

### İlk Defada Kazanış Nadirdir (llms-full.txt:563-567)

- Unruggable 4 Colosseum hackathon'a katıldı: honor mention → track win → Grand Championship
- **Top group placement = accelerator seçimi** - Sadece Grand Champion değil, top 20 de accelerator alimenter'dir
- Colosseum bu başlı web sitesinin "Hall of Fame" bölümünde bulabilirsiniz

### Accelerator Kanalları (llms-full.txt:569-575)

**Colosseum Accelerator (Tek yol: hackathon yoluyla)**
- $250K ön-tohumlama (founder-friendly şartlar)
- 12 hafta program (ilk 2 hafta San Francisco, kalan 10 hafta uzaktan)

**Diğer Accelerator'ler**
- Alliance DAO: $500K (~7% equity)
- Orange DAO: $100K (MFN SAFE)
- Monke Foundry
- Colosseum Eternal: $25K USDC (self-paced 4 hafta sprint, şu anda paused, Kasım civarı açılması bekleniyor)

### Grant Kanalları (llms-full.txt:577-584)

- Solana Foundation grants
- Solana Mobile builder grants
- Circle developer grants
- Superteam Earn

### Superteam Türkiye Membership (llms-full.txt:584)

Hackathon'da gerçek bir şey gönderdiğin takdirde, **Superteam Türkiye membership** için kredibil sayılırsın:
- Yerel hibeler
- Perks ve networking
- Post-hackathon desteği

---

## Superteam Türkiye Desteği

Yarışmada yalnız değilsin. (llms-full.txt:1210-1236)

### Haftalık Etkinlikler (Tüm ücretsiz, hiçbiri zorunlu değil)

- **Çarşamba 19:00** - Colosseum Community Call (X Spaces): Haftanın teması burada belirlenir, takımlar birbirini bulur
- **Cuma 10:00** - Coworking Fridays (Kolektif House Levent, İstanbul): Tüm gün, takıldığınız şeyi getirin
- **Cuma 19:00** - Colosseum Office Hours (Google Meet): Bire bir - Fikir doğrulama, mimari, sunum ve video geri bildirimi
- **Cumartesi 14:00** - Shipyard (Nişantaşı + livestream): Dikey derinlemesine (AI/compute, payments/corridors, consumer GTM)

[Takvim: https://luma.com/superteamtr](https://luma.com/superteamtr)

### Üç Destek Seviyesi

**Orientation (3-21 Eylül):** Orientation formu doldur
- Kickoff ve workshop davetleri
- Fikir doğrulama slotu
- Cofounder matching
- Form: https://forms.gle/EELv1S3eD1nEytrq7

**Acceleration (22 Eylül - 6 Ekim):** Yoğun destek iste
- One-liner ve blurb iterasyonu
- Kamera ve ses kayıt desteği
- Jüriye tanıtım
- Telegram: @trench_survivor

**Post-hackathon (6 Ekim sonrası):** Sonrası destek iste
- Grant ve accelerator desteği
- Launch amplifikasyon
- Membership gözden geçirmesi
- Telegram: @trench_survivor

### Neler Beklemeli

- Fikir doğrulama ve gap analizi
- Teknik yönlendirme (mimari, stack seçimi, ne kesecek)
- Pitch malzeme geri bildirimi (deck, video, demo - birden fazla tur)
- Upload öncesi demo ve pitch video feedback

### Soru Sor (Herkes Yarar)

Telegram grubunda soru sor. Bir takımın cevapı tüm takımlara yardımcı olur.

[Telegram: https://t.me/+3sWAzL4fgPViMjU8](https://t.me/+3sWAzL4fgPViMjU8)

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
- [ ] Pitch video (max 2 min): Problem → Solution → Demo → Team yapısı, founder sesi (voiceover değil), ilk 10 saniyede hook açık
- [ ] Demo video (max 3 min): Technical, ürün canlı çalışırken, değil slide, değil code walkthrough
- [ ] Logo/graphic (JPEG/PNG/WEBP/GIF, max 20MB)
- [ ] Tüm videoları takım dışından birinin izleyebileceğini test ettiniz
- [ ] Pitch video linkini doğru yerde (public project page'de) upload ettiniz

### Form Hazırlığı
- [ ] Tüm Tier 1 cevapları doc'da yazılı ve karakter limiti kontrol edilmiş
- [ ] Tüm Tier 2 cevapları yazılı (1000 char, 500 char alanları)
- [ ] Tier 3 (accelerator) cevapları yazılı ve gözden geçirilmiş
- [ ] Chain integration kuralını oku: "Bu chain'leri nasıl kullanıyorsun?"

### Ekip ve Kurallar
- [ ] Her üye Colosseum Arena'da kendi hesabıyla kaydolmuş (eksik üye = diskalifikasyon)
- [ ] Project page'de tüm üyeler görülüyor (kontrol et: hiç biri eksik mı?)
- [ ] Hiçbir üye başka takımda yer almıyor (bir kişi = bir takım kuralı)
- [ ] Telegram kontağı vermiş (prize/accelerator iletişim için kontrol eden biri olsun)
- [ ] Daha önceki kod varsa gönderim formunda açıklanmış (gizleme = diskalifikasyon)

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

### Resmi Colosseum Kaynakları
- **Resmi web sitesi:** https://colosseum.com/worldsfair
- **Resmi kurallar (PDF):** https://colosseum.com/legal/Crypto%20World's%20Fair%20Hackathon%20Rules.pdf
- **Developer kaynakları:** https://colosseum.com/worldsfair/resources
- **Colosseum FAQ:** https://colosseum.com/hackathon#faqs
- **Cofounder Matching:** https://colosseum.com/cofounder-matching
- **Hall of Fame (geçmiş kazananlar):** https://colosseum.com/arena/hackathon/hall-of-fame
- **Colosseum Discord (workshop canlı yayın):** https://colosseum.com/discord
- **Colosseum Copilot (5,400+ projeye karşı gap analizi):** https://colosseum.com/copilot

### Superteam Türkiye Kaynakları
- **Kayıt (Superteam referral linki):** https://colosseum.com?ref=superteamtr-2026
- **Orientation form:** https://forms.gle/EELv1S3eD1nEytrq7
- **Türkiye Earn listing:** https://superteam.fun/earn/listing/submit-crypto-worlds-fair-project-for-turkish-builders/
- **Telegram grup:** https://t.me/+3sWAzL4fgPViMjU8
- **Luma Calendar (Office Hours + Community Calls):** https://luma.com/superteamtr
- **Superteam Türkiye hub:** https://tr.superteam.fun/colosseum/

### Eğitim Kaynakları
- **How to Win a Colosseum Hackathon** (Colosseum resmi): https://blog.colosseum.com/how-to-win-a-colosseum-hackathon
- **Perfecting Your Submission** (Colosseum): https://blog.colosseum.com/perfecting-your-hackathon-submission
- **Superteam Balkan en kapsamlı rehberi:** https://stblkn.notion.site/colosseum-hackathon
- **Superteam Idea Bank:** https://superteam.fun/build/ideas
- **Superteam developer araçları:** https://superteam.fun/build/developer-tools
- **solana.new (AI skills ve MCP):** https://www.solana.new/
- **Superteam hackathon headquarters:** https://superteam.fun/hackathon

---

**Hazırladı:** Superteam Türkiye  
**Kaynaklar:** Colosseum Hacathon Rules & How to Win Guide, Superteam Balkan analysis  
**Son güncelleme:** Ekim 2026
