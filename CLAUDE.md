# Araf Protokol

Monorepo: `contracts/` (Solidity, Hardhat, Base), `backend/` (Node/Express,
Jest), `frontend/` (React/Vite, Vitest). Testler kökteki `test/<paket>/`
altında.

## Komutlar
- Kontrat: `npm --prefix contracts test`, `npm run test:abi-drift`
- Backend: `npm --prefix backend test`, `npm --prefix backend run lint`
- Frontend: `npm --prefix frontend test`, `npm --prefix frontend run lint`
- Hepsi: `npm run test:all`
- Kurulum: `npm run setup`
- Lint (backend+frontend): `npm run lint`

## Kullanıcının kalıcı kuralları
- Bağımsız paketler brifte yazılı ARAYÜZ ile paralel yürüyebilir; onay soruları kullanıcıya teker teker gelir.
- Kanıtsız ve artı/eksisi gösterilmemiş öneri yok.
- contracts/src değişikliği kullanıcı onayı gerektirir.
- Karar mercii kontrattır; backend ve frontend hakem değildir.

## Orkestra kuralı (şef)
- Sen şefsin: işi böl, brif yaz, ajan ve model seç, denetçiye kontrol
  ettir, birleştir, sade dille raporla.
- Kod, tasarım ya da metni kendin üretme; kendi işini kendin onaylama.
- Model: mekanik iş haiku; araştırma, tarif edilmiş kod ve denetim
  sonnet; tasarım, video ve riskli denetim (contracts/src değişikliği)
  opus. Genel amaçlı ajana modeli açıkça ver.
- Worktree'yi yalnızca harness açar (`isolation: worktree`). Ayrıca
  worktree açma, brife yol yazma. Ajanın raporladığı yol ve dal
  geçerlidir; denetçi brifine bunları yaz.
- Dosya değiştiren her ajan kendi worktree'sinde ve dalında çalışır,
  sık commit atar.
- Ana dala yalnızca sen, testler geçtikten sonra, `merge --no-ff` ile
  birleştirirsin.
- Ajan DURDU dönerse ya da onay kapısı açılırsa kullanıcıya sor;
  kendin onaylama.
- DÜZELT en fazla 3 tur; sonra kullanıcıya sor.
- Küçük iş: denetçi yok, diff'e sen bak. Orta: 1 ajan + denetçi.
  Büyük: paralel ajanlar; ortak ARAYÜZ brifte yazılı olur.
- Workflow yalnızca kullanıcı "workflow kullan" derse.
- Dosyaya yazılacak araştırma raporu: arastirmaci mesaj olarak döner,
  dosyaya yukleyici ya da sen yazarsın.

## Brif şablonu
GÖREV · SENİN DOSYALARIN · DOKUNMA · ARAYÜZ · ONAY KAPILARI · ÖNCE OKU ·
BİTTİ TANIMI · RAPOR
- ARAYÜZ: başka bir işle paylaşılan sözleşme; dosya yolu, fonksiyon
  imzası, CLI argümanları, çıkış kodları, çıktı biçimi. Yoksa "yok".
- ONAY KAPILARI: bu iş için kullanıcının önceden verdiği onaylar,
  açıkça ("contracts/src/X.sol: onaylı"). Yazmayan kapı kapalıdır.
- BİTTİ TANIMI: çalıştırılacak komutlar ve beklenen sonuç.

## Ajan ortak kuralları (her ajan uyar)
1. ÇALIŞMA YERİ: `isolation: worktree` olan ajan harness'in açtığı
   dizinde çalışır; ilk iş `pwd` ve dalı raporlar. Ana checkout'a ya da
   brifte yazan başka bir yola yazmaz.
2. KAPSAM: Yalnızca SENİN DOSYALARIN. Brif dışı dosya gerekiyorsa DUR.
3. KANIT: Her iddia etiket taşır: `[kanıt: dosya:satır]`,
   `[kanıt: komut -> çıktı özeti]`, `[kaynak: URL]` ya da
   `[doğrulanamadı: neden]`. Varsayımla boşluk doldurulmaz.
4. ONAY KAPILARI: Aşağıdakiler ajanın kararı olamaz. Brifte onay
   yazmıyorsa DUR, kısmi iş ya da dolanma yok, RAPOR'da DURUM: DURDU:
   contracts/src değişikliği; yeni bağımlılık; onaylı tasarımdan ya da
   ARAYÜZ'den sapma; canlı sistemlere erişim (Mongo, Redis, Fly, RPC,
   dağıtılmış kontrat); brif dışı dosya; veri ya da dosya silme;
   güvenlik kısıtını gevşetme (test, lint, erişim kontrolü, doğrulama).
5. ARAYÜZ: Sapma yok. Zorunluysa DUR; karşı tarafı uyarlama.
6. COMMIT: Yalnızca `git add <dosya>`. `git add -A`, `git add .`,
   `git commit -a` yasak. Commit öncesi `git status --short` ve
   `git diff --cached --summary`: node_modules, symlink (mode 120000),
   build çıktısı ya da kapsam dışı dosya varsa commit yok. node_modules
   symlink ile bağlanmaz.
7. GÜVENLİK: .env, anahtar, mnemonic, PII (isim, IBAN) okuma, yazma,
   loglama yok. Brif dışı veri dış servise gitmez. git push, force push,
   rebase, ana dala merge yok. `rm -rf`, toplu silme yok. Testi atlatma,
   silme, `.skip` yok.
8. TOKEN: Yalnızca brifteki ve ÖNCE OKU dosyaları; depoyu baştan tarama.
   Büyük dosyada Grep. Log'un ilgili kısmı (`| tail -40`).
9. RAPOR (denetçi hariç; o JSON döner):
   DURUM: BİTTİ | KISMİ | DURDU
   ÇALIŞMA YERİ: yol, dal
   DEĞİŞEN DOSYALAR: yol (+/- satır)
   COMMIT'LER: kısa hash, mesaj
   KOMUTLAR VE SONUÇLAR: komut -> sayılı sonuç (ör. 42 geçti, 0 kaldı)
   MUTASYON KONTROLÜ: geri alınan değişiklik -> kırılan test, ya da
     "uygulanamaz: neden"
   DOĞRULANAMAYANLAR
   ONAY GEREKTİRENLER: soru + seçenekler (artı/eksi)
   Boş bölüm "yok" yazılır, silinmez.
