# Codex P0 Hardening Brief — Araf Protocol

Bu belge, repo public yapılmadan önce uygulanması önerilen P0 güvenlik ve tutarlılık düzeltmelerini Codex tarafından doğrudan çalışılabilir hale getirmek için hazırlanmıştır.

## Amaç

Aşağıdaki maddeler, public release öncesi auth/session yüzeyini sıkılaştırmak, yanlış trade-room algısı üretimini engellemek ve kontrat entegrasyonunu daha kanonik hale getirmek içindir.

## Uygulama Sırası

1. ARAF-05 — Nonce race fix
2. ARAF-04 — Auth rate limiter Redis fallback (in-memory, fail-closed-ish for auth)
3. ARAF-06 — Strict /auth/me + frontend session restore
4. ARAF-02 — Backend-enforced session invalidation on wallet mismatch
5. ARAF-03 — Remove fake/fallback trade room identity
6. ARAF-01 — Require non-zero listingRef on contract side (separate rollout; ABI/deploy impact)

---

## ARAF-05 — Nonce Race Fix

### Hedef dosya
- `backend/scripts/services/siwe.js`

### Sorun
Aynı cüzdan için eşzamanlı nonce üretim isteklerinde, uygulamanın döndürdüğü nonce ile Redis'te gerçekten yaşayan nonce farklılaşabiliyor. Sistem local olarak ürettiği değeri authoritative varsaymamalı.

### Beklenen davranış
- Nonce üretim yazımı atomik olmalı.
- Yarış halinde, kazanan nonce Redis'ten tekrar okunmalı ve o döndürülmeli.
- "Ürettim" ile "sistemde yaşayan gerçek nonce" aynı şey kabul edilmemeli.

### Kabul kriterleri
- Aynı wallet için eşzamanlı iki `GET /api/auth/nonce` çağrısında sistem tek geçerli nonce üzerinde uzlaşmalı.
- Verify aşamasında sadece Redis'teki authoritative nonce kabul edilmeli.
- Bu fix yeni auth akışını kırmamalı.

---

## ARAF-04 — Auth Rate Limiter Fallback

### Hedef dosya
- `backend/scripts/middleware/rateLimiter.js`

### Sorun
Mevcut limiter mantığında Redis erişilemezse bazı limiter'lar skip oluyor. Public release öncesi auth yüzeyinde tam fail-open istemiyoruz.

### Beklenen davranış
- `authLimiter` için Redis yoksa bellek bazlı fallback devreye girmeli.
- Auth yüzeyi Redis kesintisinde tamamen korumasız kalmamalı.
- `logs` endpoint'inde kullanılan hafif in-memory fallback yaklaşımı auth tarafına taşınabilir, ama ayrı sayaç/prefix ile uygulanmalı.
- Listings read gibi düşük riskli yüzeylerde mevcut davranış korunabilir; auth için sıkı davran.

### Kabul kriterleri
- Redis down iken `/api/auth/nonce`, `/api/auth/verify`, `/api/auth/refresh` brute-force'a tamamen açık olmamalı.
- Redis up iken mevcut RedisStore davranışı bozulmamalı.
- Log spam yaratmadan sınırlı uyarı üretmeli.

---

## ARAF-06 — Strict `/api/auth/me` ve Session Restore Zinciri

### Hedef dosyalar
- `backend/scripts/routes/auth.js`
- `frontend/src/App.jsx`

### Sorun
Session restore akışı yalnız "cookie var mı" sorusuna dayanırsa, wallet authority drift yaşanabilir. Kullanıcının aktif cüzdanı ile backend session wallet'ı strict biçimde uzlaşmalı.

### Beklenen backend davranışı
- `GET /api/auth/me` yalnız authenticated true dönmesin; authoritative wallet döndürmeye devam etsin.
- Gerekirse mevcut auth cookie wallet'ı ile frontend'in bildirdiği aktif wallet arasında mismatch durumuna açık hata kodu üret.
- `/me` akışı "gevşek restore" üretmemeli.

### Beklenen frontend davranışı
- App yüklenirken session restore zinciri şu sırayı izlemeli:
  1. wallet provider'dan aktif bağlı cüzdanı öğren
  2. `/api/auth/me` çağrısını yap
  3. backend wallet ile aktif bağlı wallet birebir eşleşmiyorsa session'ı authenticated kabul etme
  4. kullanıcıya net yeniden giriş / reconnect akışı göster
- Yaklaşık eşleşme, stale local state veya eski UI cache ile auth restore yapılmamalı.

### Kabul kriterleri
- Wallet A cookie'si açıkken kullanıcı Wallet B'ye geçtiğinde uygulama oturumu restore etmemeli.
- Session state yalnız backend authority + aktif wallet eşleşmesi ile kurulmalı.
- Yanlış cüzdanda "logged in görünüyorum" hissi oluşmamalı.

---

## ARAF-02 — Backend-Enforced Session Invalidation on Wallet Mismatch

### Hedef dosyalar
- `backend/scripts/middleware/auth.js`
- `backend/scripts/routes/auth.js` (gerekirse yardımcı clear/revoke akışı)
- `frontend/src/App.jsx`

### Sorun
Mevcut mismatch davranışı yalnız client-side temizlikle sınırlıysa yetersizdir. Authority backend'de kalmalı.

### Beklenen davranış
- `requireSessionWalletMatch` mismatch gördüğünde sadece 409 dönmekle kalmasın; mümkün olan en güvenli şekilde session invalidation tetiklenebilsin.
- Refresh token aile kaydı revoke edilmeli.
- JWT cookie ve refresh cookie temizlenmeli veya frontend'e bunun yapılması için kesin hata semantiği verilmeli.
- Frontend 409/SESSION_WALLET_MISMATCH aldığında sessiz toparlama yapmasın; bilinçli logout akışı çalıştırsın.

### Kabul kriterleri
- Session wallet mismatch sonrası kullanıcı aynı bozuk oturumla devam edememeli.
- Hem backend hem frontend tarafında state reset yaşanmalı.
- Bu akış auth bypass veya sonsuz refresh loop üretmemeli.

---

## ARAF-03 — Remove Fake / Fallback Trade Identity

### Hedef dosya
- `frontend/src/App.jsx`

### Sorun
Gerçek `Trade._id` henüz materialize olmadan fallback/fake ID ile trade room açmak epistemik olarak yanlış. Zincirde oluşmuş escrow ile backend kaydı arasındaki gecikme dürüstçe temsil edilmeli.

### Beklenen davranış
- `realTradeId` yoksa fallback/local/generated ID ile trade room açılmamalı.
- Bunun yerine ayrı bir `pending-sync` / `awaiting-backend-materialization` UI durumu olmalı.
- Kullanıcıya net mesaj verilmeli: zincire yazıldı, backend kaydı henüz hazır değil.

### Kabul kriterleri
- Yanlış trade room veya sahte ID ile route oluşmamalı.
- Gerçek trade kaydı oluşunca UI oraya geçmeli.
- Bu durum hata gibi değil, dürüst bir ara durum gibi temsil edilmeli.

---

## ARAF-01 — Require Non-Zero `listingRef` on Contract Side

> Bu madde ayrı rollout olarak düşünülmeli. ABI, test ve deploy etkisi vardır.

### Hedef dosyalar
- `contracts/src/ArafEscrow.sol` (veya sözleşmenin gerçek yolu)
- `frontend/src/App.jsx` (create akışı guard)
- `backend/scripts/services/eventListener.js` (veya eşdeğer listener)
- ilgili test dosyaları

### Sorun
Zero `listingRef` ile escrow oluşturulabilmesi, on-chain truth ile off-chain listing linkage arasında ontolojik kopukluk yaratıyor.

### Beklenen contract davranışı
- `createEscrow` veya ilgili giriş fonksiyonu, zero `listingRef` geldiğinde revert etmeli.
- Tercihen açık custom error kullanılmalı (`InvalidListingRef()` gibi).

### Beklenen frontend davranışı
- Escrow create çağrısından önce authoritative listingRef mevcut değilse kullanıcı on-chain işleme gönderilmemeli.
- UI "eksik linkage" durumunu açıkça göstermeli.

### Beklenen backend/listener davranışı
- Zero/missing listing linkage recoverable gecikme gibi görülmemeli.
- Kritik veri bütünlüğü ihlali olarak ele alınmalı.

### Kabul kriterleri
- Zero listingRef ile kontrat çağrısı revert eder.
- Frontend preflight guard kullanıcıyı gereksiz gas maliyetinden korur.
- Event listener gevşek bağ varsayımıyla sistemi yamamaya çalışmaz.

---

## Codex Uygulama Notları

- Değişiklikleri küçük commit'lere böl.
- Önce backend auth/session fix'lerini tamamla, ardından frontend restore/trade-room düzeltmelerini yap.
- Contract fix'ini en sona bırak.
- Mevcut yorum/fix notlarını koru; yeni fix'leri aynı disiplinle belgeleyerek ekle.
- Mümkün olduğunda regression test ekle.

## Önerilen Commit Sırası

1. `fix(auth): make nonce issuance authoritative under race`
2. `fix(auth): add in-memory fallback limiter when redis is unavailable`
3. `fix(auth): make session restore strict to active wallet authority`
4. `fix(auth): invalidate backend session on wallet mismatch`
5. `fix(frontend): remove fallback trade room identity and add pending-sync state`
6. `fix(contract): reject zero listingRef and enforce canonical linkage`

## Release Notu

Public açılış öncesi minimum güvenli eşik:
- ARAF-05 tamam
- ARAF-04 tamam
- ARAF-06 tamam
- ARAF-02 tamam
- ARAF-03 tamam

ARAF-01 önerilir ama ayrı deploy penceresinde yürütülmelidir.
