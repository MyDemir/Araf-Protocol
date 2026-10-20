Mimari doküman denetimi bitti. Sonuç: WalletConnect ve bekçi dokümanlarına uygun. Boşaltma planı ve zincirden okuma yedeği değişmeli. Kalıcı çözüm, arşivle birlikte tek bir tasarım olarak ele alınmalı. Her bulgu senin dokümanlarından alıntıyla kanıtlandı.

## Özet

| Plan | Karar | Kısa gerekçe |
|---|---|---|
| WalletConnect | **Devam** | Frontend "kontrata erişim katmanı" (ARCHITECTURE.md:71, 134). Yük sadece kullanıcının tarayıcısında. Tek ek iş: DEPLOYMENT_GUIDE.md:918'deki CSP açıklaması güncellenecek. |
| Bekçi (arşiv 1. aşama) | **Devam (iki koşulla)** | Güvenlik sınırında kendini kapatma (fail-closed) ve backend'in hakem olmaması ilkesiyle uyumlu (ARCHITECTURE.md:75, 585-586). Açılışta tek bir veritabanı okuması; yük ihmal edilebilir. |
| Önce boşalt, sonra geç (arşiv 2. aşama) | **Değiştir** | Aşağıda dört eksik var. |
| Zincirden okuma yedeği | **Değiştir** | Olay taraması ölçeklenmiyor. |
| Kalıcı çözüm (kontrat adresi) | **Ertele** | Arşivle birlikte tek tasarım olmalı. |

## Bekçinin koşulları
1. "Aktif kontrat" kaydını **sadece deploy workflow'u** yazabilecek. Admin paneline yazma yetkisi verilmeyecek; admin protokol yetkisi taşımamalı (ARCHITECTURE.md:903, MAINNET_READINESS_CHECKLIST.md:32).
2. Kendine yeni mekanizma kurmayacak; sistemde zaten olanları kullanacak: `ESCROW_MISMATCH` kontrolü ve `requireFullService` deseni (ARCHITECTURE.md:1090, 1099).

## Boşaltma planındaki eksikler (kanıtlı)
1. **Açık emirler de sayılmalı.** Açık emirler teminat rezervi tutuyor (`ArafEscrow.sol:717-718`). Kontrol, açık işlemlere ek olarak açık emirleri de saymalı.
2. **Açık işlem sayısı hiç 0'a inmeyebilir.** Kilitli (LOCKED) bir işlemi sadece taraflar kapatabiliyor (ARCHITECTURE.md:315, GAME_THEORY.md:100). Taraflar ortadan kaybolursa sayaç sıfıra inmez. Felsefen de işlemi zorla kapatmaya izin vermiyor (ARCHITECTURE.md:75).
   - **Öneri:** Kontrol, kalan işlemlerin sayısını ve numaralarını raporlasın. Geçiş için senden açık onay istesin. Kalan işlemler için çıkış yolu, zincirden okuma yedeği ya da eski site olsun.
   - Önceki sorunun cevabı da bu: açık onay sadece bu durumda gerçekten gerekli.
3. **Arşiv aslında bazı kayıtları siliyor.** İşlem kayıtlarında 365 günlük otomatik silme index'i var (ARCHITECTURE.md:879). Koleksiyon taşınınca bu index de taşınıyor, yani arşivdeki kayıtlar 365 gün sonra kendiliğinden silinmeye devam eder. "Arşiv hiçbir şey silmez" ifadem tam doğru değildi.
4. **Kişisel veri saklama süresi.** Mevcut kurallar daha sıkı: dekont tamamlanan ya da iptal edilen işlemde 24 saat, yakılan işlemde 30 gün sonra siliniyor (ARCHITECTURE.md:865). Arşiv bu tarihleri aynen uygulayacak; 30 gün sadece üst sınır olacak.

Ek olarak:
- Planlı geçişte `pause` kullanılacağı için GOVERNANCE_READINESS.md:26-32'deki adımlar runbook'a eklenmeli: ön duyuru, öncesi ve sonrası kontroller, kayıt.
- Kontrat okumaları toplu yapılmalı (Multicall), tek tek değil.

## Zincirden okuma yedeği: tarama yerine bilinen işlem numarası
- **Sorun:** Bir kullanıcının işlemlerini olay taramasıyla bulmak, kullanıcı başına çok sayıda `eth_getLogs` gerektirir. Kontratın olay yapısı bunu zorlaştırıyor (`ArafEscrow.sol:396-416`) ve herkese açık RPC'yi hız sınırına takar.
- **Öneri:** Frontend işlem numarasını zaten biliyor (ARCHITECTURE.md:964-965, 987-988). İşlem durumu bu numarayla doğrudan okunsun (`getTrade`). Ek olarak elle işlem numarası girme alanı ve isteğe bağlı, sadece son N bloğu tarayan bir arama olsun. Yük neredeyse sıfır.

## Kalıcı çözüm için dokümanında olmayan daha hafif bir seçenek
**Her kontrat için ayrı bir Mongo veritabanı.**
- **Artı:** Sorgu değişikliği gerekmez.
- **Eksi:** Kontrattan bağımsız veriler (ödeme profili, şartlar kabulü) ortak bir veritabanında kalmalı.

Bu karar mainnet öncesine kalabilir.

## Senden üç karar
1. Açık işlem 0'a inmezse, işlem numaraları raporlanarak senin açık onayınla geçişe izin verilsin mi? Önerim evet.
2. Arşivdeki kayıtlarda 365 günlük otomatik silme devam etsin mi (mevcut veri saklama politikasıyla uyumlu), yoksa arşivde kapatılsın mı?
3. Zincirden okuma yedeği "bilinen işlem numarası" yöntemiyle mi olsun? Önerim evet.

**WalletConnect** için de cevabını bekliyorum: görünümü onaylıyor musun, mobildeki satır adı değişsin mi? Onay gelirse CSP güvenlik denetimini ve doküman güncellemesini yaptırıp admin metni düzeltmesiyle birlikte PR açacağım. Admin metni düzeltmesi şu an ajanda çalışıyor.