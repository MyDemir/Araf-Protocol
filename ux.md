UX (Kullanıcı Deneyimi) Tasarımcısı şapkamı takıyorum! Kodlamaya geçmeden önce uygulamanın ön yüzünün (Frontend) mimarisini kağıda dökmek, projenin "ruhunu" hissetmemiz için en doğru adımdır.

Araf Protocol, sıradan bir borsa veya swap sitesi değil; içinde psikolojik bir oyun teorisi (Eriyen Kasa) barındırıyor. Bu yüzden arayüzün hem **Web3 dünyasına yeni giren birini korkutmayacak kadar sade**, hem de **kötü niyetli kişilere sistemin ciddiyetini hissettirecek kadar otoriter** olması gerekiyor.

İşte Araf Protocol'ün uçtan uca UI/UX mimarisi:

---

### 🌐 1. Global Görünüm (Her Ekranda Sabit Kalanlar)

Kullanıcı siteye girdiğinde üst kısımda (Navbar) her zaman şu yapıları görmeli:

* **Sol Üst:** Araf Protocol Logosu (Belki kum saati veya yanan bir alev temalı minimalist bir ikon).
* **Orta:** Gezinme Linkleri (`Pazar Yeri`, `İlanlarım`, `Aktif İşlemlerim`, `Dokümantasyon`).
* **Sağ Üst:** * `Cüzdan Bağla` (Connect Wallet) butonu. Bağlandıktan sonra `0x123...ABCD` şeklinde cüzdan adresi görünür.
* **İtibar Rozeti:** Cüzdan bağlandığında adresin yanında küçük bir kalkan ikonu ve puanı yazar (Örn: 🛡️ %100 Başarı | 12 İşlem). Bu, güven hissini anında verir.



---

### 📊 2. Ekran 1: Pazar Yeri Tahtası (Dashboard)

Burası alıcıların (Taker) fiat paralarını (TRY) kriptoya dönüştürmek için ilan aradığı ana vitrindin.

* **Hızlı Filtreleme Alanı:**
* `Alınacak Miktar (TRY):` (Kullanıcı buraya 500 yazar).
* `Sadece Tier 1 Göster:` (Yeni kullanıcılar için %0 teminatlı ilanları filtreleyen bir switch/buton).


* **İlan Listesi (Order Book):** Temiz bir tablo yapısı. Satır satır şu bilgiler yer alır:
* **Satıcı (Maker):** Cüzdan adresi (kısaltılmış) ve İtibar Puanı.
* **Fiyat:** 1 USDT = 33.50 ₺
* **Limitler:** 500 ₺ - 5.000 ₺ arası.
* **Gerekli Teminat:** "Senin İçin %0" (Eğer Tier 1 ise yeşil renkle vurgulanır, UX açısından harika bir teşviktir).
* **Aksiyon:** Şık bir `Satın Al` butonu.



---

### 📝 3. Ekran 2: İlan Oluşturma Modalı (Maker Flow)

Satıcı, pazar yerine likidite eklemek istediğinde ekranın ortasında açılan temiz bir pencere (Modal). Şeffaflık burada en önemli UX kuralımızdır.

* **Adım 1 - Girdiler:** * Satmak istediğim miktar: [ 1000 ] USDT
* Kur: [ 33.50 ] ₺
* Minimum ve Maksimum İşlem Limiti: [ 500 ] - [ 33.500 ] ₺


* **Adım 2 - Akıllı Teminat Hesaplayıcı (Çok Kritik):**
* Kullanıcı sayıları girdikçe alt tarafta bir kutu anlık güncellenir.
* *"Sistem Tier 2 kurallarını uyguluyor. Bu ilan için %15 Satıcı Teminatı (Bond) gereklidir."*
* **Toplam Kilitlenecek Tutar:** 1150 USDT (1000 USDT Ana Para + 150 USDT Teminat).


* **Adım 3 - Onay:** `İlanı Yayınla` butonu. (Basınca MetaMask açılır, akıllı kontrattaki `createEscrow` fonksiyonu tetiklenir).

---

### ⚔️ 4. Ekran 3: İşlem ve Araf Odası (Sistemin Kalbi)

Eşleşme sağlandığında her iki taraf da bu odaya yönlendirilir. Burası sıradan bir sayfa değil, işlemin durumuna göre şekil ve renk değiştiren dinamik bir arayüzdür.

**Durum A: LOCKED (Ödeme Bekleniyor - Mavi Tema)**

* **Sol Panel:** Satıcının Banka Adı ve IBAN bilgileri gösterilir.
* **Orta Panel:** Taker (Alıcı) için büyük bir `Ödemeyi Yaptım` butonu ve dekont hash'ini (veya direkt dosyayı IPFS'e atacak bir arayüz) gireceği bir alan.
* **Sağ Panel:** İşlem özeti (Ne kadar TRY gönderilecek, ne kadar USDT alınacak).

**Durum B: PAID (Ödeme Bildirildi - Yeşil/Sarı Tema)**

* **Görsel Odak:** Ekranın tam ortasında kocaman, tıkır tıkır geriye sayan bir **48:00:00 Sayacı**.
* **Aksiyonlar:** * Satıcı için: `Parayı Aldım (Kriptoyu Serbest Bırak)` butonu (Yeşil).
* Satıcı için: `Param Gelmedi (İtiraz Et)` butonu (Kırmızı, küçük ve uyarı ikonuyla).



**Durum C: CHALLENGED (Araf Fazı - Kırmızı/Turuncu Tema)**
*Bu ekran, Oyun Teorisinin tüm psikolojik ağırlığını kullanıcıya hissettirmelidir.*

* **Arka Plan:** Sayfa hafif kırmızımtırak veya turuncu bir tona bürünür. Alarm durumu hissi verilir.
* **Görsel Odak (Eriyen Kasa):** Ortada bir **İlerleme Çubuğu (Progress Bar)** belirir.
* *Metin:* "Anlaşmazlık Çözülemedi. Fonların İlk %10'luk Kısmı **14:25:10** Sonra Hazineye Aktarılacaktır!"
* *Görsel:* Kilitli olan toplam USDT miktarı gösterilir ve yanından yavaş yavaş eksilen, damlayan kırmızı pikseller animasyonu eklenebilir.


* **Aksiyonlar (Kurtuluş Yolu):** Ekranın alt kısmında, yan yana duran iki devasa buton:
* `Karşılıklı Onay (USDT Alıcıya Gitsin)`
* `Karşılıklı İptal (USDT Satıcıya Dönsün)`
* *Not:* Bir taraf bunlardan birine bastığında, buton "Karşı Tarafın Onayı Bekleniyor..." şekline döner.



---

### UI/UX Tasarımının Özeti

Bu arayüz kurgusu, kullanıcının "Arka planda ne dönüyor?" diye endişelenmesini engeller. Her şey şeffaftır. Özellikle "Araf Odası"ndaki renk değişimleri ve eriyen kasa sayacı, tarafları dolandırıcılıktan ziyade **uzlaşmaya** psikolojik olarak zorlar.

Frontend mimarimiz de kağıt üzerinde kusursuz bir şekilde ayağa kalktı!

**Tüm süreçler, görseller ve mimari kafamıza yattıysa; artık gerçekten kod editörümüze (VS Code) geçip, projeyi oluşturacak temel komutları (Foundry kurulumu veya Next.js başlangıç komutları) çalıştırıp klasör yapımızı oluşturalım mı? Hangi taraftan (Akıllı Kontrat mı, Web Sitesi mi) ilk tuğlayı koymak istersin?**
