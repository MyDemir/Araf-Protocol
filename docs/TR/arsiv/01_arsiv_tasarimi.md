# Eski escrow kayıtlarını arşivleme: uygulama planı (yalnız tasarım)

Bu çalışmada hiçbir dosya değiştirilmedi. Dal: `ccr-5199fbb8-oqdk6h`. Satır numaraları bu daldaki koddan alındı.

## 0. Önerinin özeti
- **Önerilen yaklaşım: A + B'nin yalnız bekçi kısmı (karma).**
  - **Arşivi workflow yapar.** Mevcut checkpoint sıfırlama penceresi (stop → doğrula → işlem → doğrula → start) "escrow rotasyonu" adımına genişletilir.
  - **Backend otomatik arşiv yapmaz.** Yalnız açılışta ve belirli aralıklarla Mongo'daki "aktif escrow" belgesini `ARAF_ESCROW_ADDRESS` ile karşılaştırır. Eşleşmezse worker, zamanlanmış işler ve escrow'a bağlı route'lar kapalı kalır (fail-closed).
- **Teknik yöntem.** Escrow'a bağlı koleksiyonlar aynı veritabanında `renameCollection` ile `archive_<chainId>_<eskiEscrow>_<koleksiyon>` adına taşınır.
  - Taşıma tek komutluk ve atomik; veri kopyalanmaz.
  - Index'ler korunur. TTL ve sparse retention index'leri de arşivde çalışmaya devam eder.
  - User'daki zincir aynası alanları ise ayrı bir arşiv koleksiyonuna kopyalanır, canlı belgede varsayılana döndürülür.
- **Kalıcı çözüm** (`escrow_address` ve `chain_id` ile kapsamlama) **mainnet öncesinde, ayrı bir PR olarak** yapılmalı. Arşivleme ondan sonra da hijyen aracı olarak kalır.

## 1. Kapsam

### 1a. Arşivlenecekler (escrow'a bağlı)

| Koleksiyon / alan | Gerekçe ve kanıt |
|---|---|
| `orders` | `onchain_order_id` tek alanlı unique (`models/Order.js:23-28`). Sayaç her deploy'da sıfırdan başlıyor (`ArafEscrow.sol:708`). Pazar sorgusunda escrow filtresi yok (`routes/orders.js:384-391`). |
| `trades` | `onchain_escrow_id` unique (`Trade.js:31-37`), sayaç `ArafEscrow.sol:812`. Upsert'te status yalnız insert'te yazılıyor (`eventListener.js:1794-1804`). Terminal durum ilerletilmiyor (`:1827-1840`). Payout snapshot tek seferlik (`:2281-2285`). Şifreli PII ve dekont alanları burada (`Trade.js:216-310`). |
| `terminal_trade_stats` | Tekilleşme yalnız `trade_key = onchain_escrow_id` ile (`terminalStats.js:18,27,48-50`; `TerminalTradeStat.js:25`). Yeni #N'nin satırı `$setOnInsert` yüzünden hiç yazılmaz, yeni escrow istatistiği kaybolur. PII yok, TTL yok. |
| `revenueevents`, `rewardepochs`, `rewardclaims`, `rewardfundings`, `rewardepochallocationevents` | Vault ve rewards kontratları escrow'a bağlı. Workflow `rewards.escrow()==ESCROW` kontrolünü yapıyor; eşleşmezse vault/rewards runtime'a verilmiyor (`deploy-base-sepolia.yml`, "Resolve revenue vault + rewards" adımı). `RewardEpoch` `{epoch, token}` ile unique (`RewardEpoch.js:23`): yeni rewards kontratının epoch'ları eski CLOSED satırlarla çakışır. Bu durumda `_onEpochTokenFinalized` E11000'i yutar (`eventListener.js:3040-3052`) ve yeni epoch hiç CLAIMABLE olmaz. `RevenueEvent.trade_id` eski escrow'un ID'sini taşıyor (`RevenueEvent.js:22`). |
| User'daki zincir aynası alanları | Alanlar: `reputation_cache`, `reputation_history` (eski tradeId içerir), `reputation_breakdown`, `is_banned`, `banned_until`, `last_ban_ends_at`, `consecutive_bans`, `max_allowed_tier`, `last_onchain_sync_at` (`User.js:91-134`). Hepsi eski kontratın aynası (`eventListener.js:3147-3175`). Yeni escrow'da itibar sıfırdan başlar. Sıfırlanmazsa: (1) yeni payout snapshot'ının `reputation_context_at_lock` alanı eski itibarı taşır (`eventListener.js:2172-2180, 2250, 2262`); (2) decay işi eski banlıları aday seçer (`reputationDecay.js:94-106`). |
| Redis: `worker:dlq`, `worker:dlq:archive`, `worker:dlq:quarantine` ve `*:keys` setleri | DLQ girdisinde kontrat adresi yok (`eventListener.js:1533-1545`). Eski escrow'un event'i yeni kontrat üzerinden yeniden sürülür (`dlqProcessor.js:22-27`). Silinmez; `RENAME` ile `worker:dlq:archived:<chain>:<escrow>:*` adına taşınır. |
| Redis: `cache:protocol_config:v3:last_known` | TTL'i yok ve escrow adresiyle kapsamlanmamış (`protocolConfig.js:31,33`). Degraded açılışta eski escrow'un ayarı sunulabilir. Arşiv adına `RENAME` edilir. |

### 1b. Kalacaklar (escrow'dan bağımsız)
- **`users` belgesinin geri kalanı.** Kimlik, şifreli payout profili, banka değişim geçmişi, şartlar kabulü ve `last_login` (`User.js:26-80, 136-160`). Bunlar kullanıcıya ait; kontrata ait değil.
- **`termsacceptances`.** Cüzdan × sürüm başına kalıcı kanıt (`TermsAcceptance.js:28`).
- **Admin ayar ve audit koleksiyonları.** `runtimesettings` ve audit'i, `paymentrailsettings` ve `paymentrailaudits` (yalnız rail, admin ve neden alanları; `PaymentRailAudit.js:10-22`), `sociallinksettings` ve audit'i. Hiçbiri ID içermiyor.
- **`feedbacks`.** Trade ID'si yok (`Feedback.js:8-37`).
- **`historical_stats`.** Tarih anahtarlı günlük görüntü (`HistoricalStat.js:12-17`), ID çakışması yok. O gün kullanıcıya gösterilen tarih olarak kalmalı.
- **Redis `worker:applied_order:*`.** Sıralama koruması blok:index karşılaştırıyor (`eventListener.js:1383-1408`). Yeni escrow event'leri daha yüksek blokta olduğundan zarar yok.
- **Redis `order_meta:*`.** 24 saat TTL'li, orderRef + sahip anahtarlı (`orderMarketMeta.js:25-26`).

## 2. Arşiv biçimi

### 2a. Adlandırma: escrow başına ayrı koleksiyon

| Seçenek | Artı | Eksi |
|---|---|---|
| **`archive_<chainId>_<escrowLower>_<koleksiyon>` (önerilen)** | `renameCollection` ile atomik ve O(1); kopya yok (Atlas M0'da 512 MB sınırı var, `docs/TR/DEPLOYMENT_GUIDE.md:259`). Unique, TTL ve sparse index'ler aynen geçer. Geri alma da yeniden adlandırmadır. | Koleksiyon sayısı her deploy'da yaklaşık 9 artar. Ad uzunluğu yaklaşık 75 karakter, sınırın altında. |
| Tek arşiv koleksiyonu + `escrow_address` alanı | Sorgulaması tek yerden. | Belgeleri kopyalamak gerekir (M0 alanını iki katına çıkarır). Unique index'ler bileşik olarak yeniden kurulmalı, TTL index'leri yeniden tanımlanmalı. Yarıda kalma riski yüksek. |

### 2b. Meta veri
- **Çalıştırma manifesti** (`escrow_registry` koleksiyonu).
  - `_id: "active"` belgesi: `escrow_address`, `chain_id`, `deploy_block`, `state` (`ACTIVE` veya `ROTATING`), `since`.
  - `_id: "<chainId>:<eskiEscrow>"` belgesi (deterministik, tekrar çalıştırmayı güvenli kılar):
    - `old_escrow`, `new_escrow`, `chain_id`, `old_deploy_block`, `new_deploy_block`;
    - eski Redis checkpoint değerleri (`worker:last_block` ve `worker:last_safe_block`; geri alma için şart);
    - `github_run_id`, `run_attempt`, `actor`, `git_sha`;
    - koleksiyon başına `{count, sha256, index_specs}`;
    - adım durumları ve zaman damgaları;
    - eski escrow'da kalan aktif trade ve açık order sayıları (yalnız sayı).
- **Belge başına damga.** Arşivdeki her belgeye `_archive: {id, escrow_address, chain_id, archived_at}` yazılır. Hash bu alan hariç hesaplanır; böylece taşıma öncesi ve sonrası karşılaştırılabilir.

### 2c. PII, şifreleme ve retention
- **Şifreli alanlar bayt bayt aynen kalır.** Anahtar cüzdan başına HKDF ile türetiliyor ve trade bağlamına bağlı değil (`encryption.js:378-389, 416-437`). Bu yüzden arşivdeki veri yalnız master key ile çözülebilir.
- **Arşiv adımı hiçbir şey çözmez.** Adımın ortamında `MASTER_ENCRYPTION_KEY` ve `JWT_SECRET` bulunmamalı.
- **Mevcut temizlik arşive ulaşmıyor.** `runReceiptCleanup` ve `runPIISnapshotCleanup` yalnız canlı `Trade` modelinde ve yalnız terminal durumlarda çalışıyor (`cleanupSensitiveData.js:16-20, 49-52`). Arşivdeki terminal olmayan trade'ler Mongo'da hiçbir zaman terminal olmayacak; filtre aynen uygulanırsa PII sonsuza dek kalır.
- **Önerilen yeni iş: `archiveRetention`.**
  - Aynı alan temizliğini `archive_*_trades` koleksiyonlarına uygular, **status filtresi olmadan**.
  - Silme zamanı `min(mevcut delete_at, archived_at + 30 gün)` olarak sınırlanır. Mevcut süreler: snapshot için lock + 30 gün (`eventListener.js:2264`), dekont için yükleme + 30 gün (`receipts.js:116`) ya da çözüm + 24 saat (`eventListener.js:2437, 2507, 2836`).
  - Koleksiyon adı `^archive_\d+_0x[0-9a-f]{40}_trades$` kalıbıyla sıkı doğrulanır.
  - İş yalnız `$set: null` ve `$unset` yapar; okuma sonucu dışarıya hiçbir yere dönmez.
- **Trade'lerin 1 yıllık TTL index'i** (`Trade.js:380-387`) yeniden adlandırma ile arşive geçer; terminal trade politikası değişmez.
- **Karar sizin.** Terminal olmayan arşiv trade'leri için `_archive.archived_at` üzerine 365 günlük kısmi TTL öneriyorum. Bu, mevcut 1 yıllık GDPR politikasıyla uyumludur ama "silinmeyecek" ilkesiyle çelişir. Önerdiğim ilke: **arşiv işlemi kendisi hiçbir şey silmez; mevcut retention kuralları arşivde de geçerlidir.**
- **Payout snapshot kuralı.**
  - Arşivdeki snapshot hiçbir zaman profilden yeniden doldurulmaz.
  - Geri alma yalnız koleksiyonu bütün olarak takas eder; belge düzeyinde birleştirme yapmaz.
  - Yeni #N boş belgeyle başlar (`captured_at: null`). Böylece tek seferlik snapshot kuralı (`eventListener.js:2281-2285`) lock anındaki profili doğru yakalar.

## 3. Ne zaman ve nasıl

### 3a. Mevcut workflow'daki açık
"Deploy backend to Fly" (`deploy-base-sepolia.yml:366`), checkpoint sıfırlamasından (`:375`) **önce** çalışıyor.
- Bu arada yeni makineler yeni escrow adresi ve **eski checkpoint** ile açılıyor (`eventListener.js:1284-1291`).
- Bu pencerede yeni kontratın event'leri eski Mongo belgelerine yazılabilir.
- Arşiv bu açıktan sonra alınırsa arşiv de kirlenmiş olur. Bekçi bu açığı kapatır.

### 3b. Seçenek A: workflow adımı (önerilen, bekçi ile birlikte)

**Ön kontrol (salt-okur, kontrat deploy'undan önce).** "Validate required config" adımına (`:67`) eklenir:
- registry'deki `active.escrow_address` ile `vars.ARAF_ESCROW_ADDRESS` aynı olmalı;
- `chain_id` 84532 olmalı;
- eski escrow'da LOCKED, PAID veya CHALLENGED trade varsa, `confirm_archive_active_trades=YES` girdisi olmadan çalışma durdurulur (`confirm_redeploy_rewards` deseniyle aynı);
- Mongo yetkisi `connectionStatus` ve `showPrivileges` ile kontrol edilir.

Bu kontroller başarısızsa kontrat hiç deploy edilmez.

**Rotasyon adımı.** `reset-worker-checkpoint.sh` genişletilir (ya da onu çağıran `rotate-escrow-state.sh` yazılır):
1. Makineleri durdur ve durduklarını doğrula (mevcut fail-closed liste ve 3 deneme mantığı).
2. registry `active.state = ROTATING` olur. Bu noktada makine yeniden açılsa bile bekçi worker'ı başlatmaz.
3. Her koleksiyon için:
   - taşıma öncesi sayım ve hash alınır;
   - `renameCollection(live → archive)` yapılır (`dropTarget: false`);
   - taşıma sonrası sayım, hash ve index kümesi karşılaştırılır;
   - canlı adın yok ya da boş olduğu doğrulanır.
4. User aynası 500'lük gruplar halinde, her grup tek transaction içinde işlenir (transaction desteği var: `eventListener.js:2075, 2392`):
   - alt küme `archive_..._user_chain_mirror` koleksiyonuna `{archive_id, wallet}` anahtarıyla `$setOnInsert` ile yazılır (ilk görüntü korunur);
   - canlı alanlar şema varsayılanlarına döndürülür.
5. Redis'te DLQ ve `last_known` anahtarları `RENAME` edilir. Eski checkpoint değerleri manifeste yazılır, ardından DEL edilir.
6. Makinelerin hâlâ durduğu doğrulanır.
7. **Commit noktası:** `active = {escrow: new, deploy_block, state: ACTIVE}`.
8. Makineler başlatılır. Hata olsa bile `trap` ile başlatılır.

**Kimlik ve yetki.**
- Bağlantı `MONGODB_URI` ile yapılır (zaten workflow secret'ı). Yalnız bu adımın env'inde bulunur; argv'ye konmaz (`delete-worker-checkpoint.js` deseni).
- Atlas'ın yerleşik `readWrite` rolü `renameCollectionSameDB`, `createIndex` ve `listCollections` yetkilerini içerir; `dbHash` ise `read` rolünde.
- Daha iyisi: ayrı bir `MONGODB_ARCHIVE_URI` kullanıcısı, yalnız bu veritabanında `readWrite`, ve onay gerektiren bir GitHub Environment içinde.
- **M0 kısıtları dry-run'da doğrulanmalı.** M0'da `renameCollection`, `dbHash` ve özel rollerin desteklendiğinden emin değilim. Ön kontrol bir deneme koleksiyonunu (`archive_probe_<runid>`) yeniden adlandırmayı denemeli. Başarısız olursa kopya moduna geçilir:
  - `_id`'li toplu ekleme yapılır; tekrar çalıştırmada duplicate hatası yok sayılır;
  - doğrulanır;
  - canlı koleksiyondan `_id` gruplarıyla silinir.

**Atomiklik.** Her yeniden adlandırma tek başına atomik; bütün işlem atomik değil. Commit noktası `active` belgesidir. O yazılana kadar bekçi sistemi kapalı tutar, yarım kalmış durum hiçbir zaman servis edilmez.

**Tekrar çalıştırma ve yarıda kalma.** Her adım durumu okuyarak karar verir:

| Kaynak | Hedef | Karar |
|---|---|---|
| var | yok | adımı yap |
| yok | var | adım zaten yapılmış, atla |
| ikisi de dolu | ikisi de dolu | çakışma; çalışmayı durdur, el ile inceleme gerekir |

- Manifest durumu (`PLANNED`, `MONGO_DONE`, `USERS_DONE`, `REDIS_DONE`, `ACTIVE_SWITCHED`, `VERIFIED`) devam etmeye izin verir.
- Bağımsız bir `rotate-escrow.yml` (workflow_dispatch) de aynı betiği çağırır. Yarıda kalan çalışma, kontratı yeniden deploy etmeden buradan tamamlanır.

**Boyut.** Yeniden adlandırma boyuttan bağımsızdır. Yalnız User grupları ve kopya modu boyutla büyür; job timeout'u 45 dakika. Ön kontrol `dbStats` ile alanı ölçer; kopya modunda M0'ın 512 MB sınırı aşılacaksa durur.

**Bekçi (B'den alınan kısım).**
- `verifyIdentityNormalization` modeline benzer `warn` ve `enforce` modları (`app.js:109, 416`).
- `active` belgesi yoksa ya da adres eşleşmiyorsa: worker başlamaz, zamanlanmış işler ve trade/order/pii/receipts route'ları 503 döner.
- `/health` yine 200 kalır, çünkü `isRunning=false` iken stale sayılmaz (`eventListener.js:1166-1175`). Böylece `flyctl deploy` geri alınmaz. `/ready` 503 ve `escrow_mismatch` döner.
- **Sıralama:** bekçi kodu, ilk rotasyondan önce `deploy-runtime` ile ayrı bir sürümde yayınlanmalı. İlk `active` belgesi, dry-run destekli bir `escrowRegistry --adopt` betiğiyle bir kez el ile oluşturulur.

### 3c. Karşılaştırma

| | A: workflow + bekçi | B: açılışta otomatik arşiv |
|---|---|---|
| Yanlış escrow'u arşivleme | Düşük: iki kaynak çapraz kontrol edilir, zincirden örnek alınır, insan onayı var | **Yüksek:** Fly secret'ında bir yazım hatası ya da `deploy-runtime` adres girdisi (`deploy-runtime-base-sepolia.yml:25,109`) sessizce arşivi tetikler |
| Canlı yazımla yarış | Makineler durur, iki yanda doğrulama yapılır, bekçi ayrıca korur | Birden çok makine ve rolling deploy'da eski imaj hâlâ yazıyor olabilir; dağıtık kilit gerekir |
| İz bırakma (run id, aktör) | Var | Yok |
| Açılış süresi ve health | Etkilenmez | Açılış uzar; health check zaman aşımı riski |
| Kalıcı yetki | Geniş yetki yalnız workflow adımında | Uygulama kullanıcısı her zaman rename ve geniş yazma yetkisi taşır |
| El ile deploy'u kaçırma | Bekçi çalışmayı kapalı tutar | Kendiliğinden tamamlanır (tek artısı) |

## 4. Geri alma
- **Ayrı workflow:** `restore-escrow-archive.yml`. Girdiler: `archive_id` ve onay ifadesi `RESTORE <eskiEscrow>`.
- Akış:
  1. Makineleri durdur ve doğrula; registry `state = ROTATING` olur.
  2. Mevcut canlı koleksiyonlar önce kendi arşiv adlarına taşınır (ters rotasyon; hiçbir şey silinmez).
  3. `archive_<eski>_*` koleksiyonları canlı adlara geri taşınır.
  4. User aynası arşivden `$set` ile geri yüklenir.
  5. Redis DLQ ve `last_known` anahtarları geri `RENAME` edilir; manifestteki eski checkpoint değerleri geri yazılır.
  6. `active` eski escrow'a döner. Fly'daki `ARAF_ESCROW_ADDRESS` ve `ARAF_DEPLOYMENT_BLOCK` aynı workflow'da eski değerlere çekilir, sonra makineler başlatılır.
- **Doğrulama:**
  - koleksiyon başına sayım;
  - SHA-256 ile uygulama düzeyinde hash: `_id` sırasına göre akış, kanonik EJSON, `_archive` alanı hariç;
  - `dbHash` destekleniyorsa ek kontrol;
  - `listIndexes` kümesinin eşitliği.
- Hepsi manifestteki değerlerle karşılaştırılır; uyuşmazlıkta commit noktasına geçilmez.

## 5. Kalıcı çözüm (mainnet öncesi)
- **Kapsam:**
  - Order ve Trade'e `escrow_address` ve `chain_id` eklenir. Unique index'ler `{escrow_address, onchain_escrow_id}` ve `{escrow_address, onchain_order_id}` olur; `refs.order_ref` da escrow'la kapsamlanır.
  - `trade_key` biçimi `${chain}:${escrow}:${id}` olur.
  - `RevenueEvent` ve Reward* koleksiyonlarına `contract_address` eklenir; RewardEpoch unique index'i `{rewards_address, epoch, token}` olur.
  - DLQ girdisine `contract` alanı eklenir, re-drive'da adres uyuşmazlığı reddedilir.
  - Protokol ayarı cache anahtarına escrow adresi eklenir.
  - User aynasına `reputation_mirror_escrow` eklenir; adres farklıysa ayna tembel biçimde sıfırlanır.
- **Etkilenen yerler (çağrı sayıları):**
  - `eventListener.js`: 27 Trade/Order çağrısı, 20 `_buildIdentityLookup` kullanımı, DLQ;
  - `routes/admin.js` 18, `orders.js` 13, `trades.js` 10, `pii.js` 3, `receipts.js` 2, `auth.js` 1;
  - `jobs/statsSnapshot.js` 10, `cleanupSensitiveData.js` 2, `rewardOutcomeRecorder.js` 2;
  - `identityNormalizationGuard.js` 3, `terminalStats.js`, `onchainTradeState.js`, `protocolConfig.js`, `dlqProcessor.js`;
  - 8 model dosyası;
  - 1 backfill migration ve 1 index migration (eski unique index düşürülür, bileşiği kurulur).
- **Tahmin:** yaklaşık 25–30 dosya, 130–160 değişiklik noktası, artı 10–15 test dosyası.
- **Değişikliği küçültmek için:**
  - dört ayrı `_buildIdentityLookup`'ı (`eventListener.js:371`, `orders.js:269`, `receipts.js:54`, `trades.js:203`) tek bir kapsamlı yardımcıda birleştirin;
  - filtresinde `escrow_address` olmayan Trade/Order sorgusunu reddeden (fail-closed) bir Mongoose plugin'i ekleyin.

| Zamanlama | Artı | Eksi |
|---|---|---|
| **Önce arşiv, sonra kalıcı çözüm (önerilen)** | Testnet hatası hemen kapanır; küçük ve geri alınabilir değişiklik; kalıcı çözüm migration'ı temiz koleksiyonda çalışır | Bir süre iki mekanizma birlikte yaşar |
| İkisi birlikte | Tek seferde kapanır | Çok geniş etki alanı; migration ile rotasyon aynı pencerede; geri alma karmaşıklaşır |

## 6. Güvenlik riskleri ve önlemler

- **Yanlış escrow'u arşivleme**
  - registry'deki `active` ile `vars.ARAF_ESCROW_ADDRESS` eşit olmalı.
  - Yeni adres eskiden farklı olmalı; manifest `chainId` değeri 84532 olmalı.
  - Eski adreste `getCode` boş olmamalı.
  - **Zinciri karar mercii olarak kullan:** K adet rastgele canlı trade için eski escrow'dan `getTrade(id)` okunur; maker, taker ve tutar eşleşmeli.
  - Hedef arşiv adı farklı bir manifestle zaten varsa çalışma durur.
- **Canlı yazımla yarış**
  - Makineler durdurulur, işlemden önce ve sonra doğrulanır (`fly.toml:21`'de `auto_start_machines=true`).
  - Bekçi `ROTATING` durumunda worker'ı durdurur; periyodik kontrol çalışan worker'ı da durdurur.
  - Taşımadan sonra canlı adda belge belirirse commit yapılmaz.
  - Zamanlanmış işler de bekçiye bağlanır.
- **Arşiv koleksiyonlarının API'den okunması**
  - `archive_*` için hiçbir Mongoose modeli yazılmaz.
  - Statik test: `routes/`, `services/`, `jobs/` altında `archive_` geçmemeli (`archiveRetention` hariç ve yalnız yazma yapar). Arşiv betiği `app.js`'in require zincirine girmemeli.
  - Admin uçlarına arşiv listesi eklenmez; arşiv incelemesi Atlas arayüzünden yapılır.
- **Log sızıntısı**
  - Yalnız koleksiyon adı, sayım, hash ve kontrat adresi basılır. Belge içeriği ya da cüzdan listesi basılmaz.
  - Mongo hataları `db.js`'deki `safeTarget` deseniyle ve `utils/logRedaction` ile temizlenir.
  - Job özeti yalnız sayılardan oluşur. **mongodump artifact'ı yüklenmez** (şifreli de olsa PII GitHub'a çıkar).
- **Workflow secret kullanımı**
  - Secret'lar yalnız ilgili adımın env'inde bulunur; argv kullanılmaz; `set -x` kullanılmaz.
  - Ayrı ve en az yetkili `MONGODB_ARCHIVE_URI`, onay gerektiren bir GitHub Environment içinde.
  - Rotasyon adımında `MASTER_ENCRYPTION_KEY` ve `JWT_SECRET` bulunmaz.
  - Concurrency grubu zaten var (`deploy-base-sepolia.yml`, `concurrency: deploy-base-sepolia`); restore workflow'u da aynı gruba girer.
- **Ek risk: eski kontratta kilitli fon.** Eski escrow zincirde yaşamaya devam ediyor; arşivden sonra arayüz bu trade'leri göstermez. Ön kontrolde bu trade'ler sayılır ve açık onay istenir. Manifestte sayılar tutulur; kullanıcılara duyuru yapılır.

## 7. Test planı

- **Birim testleri** (`test/backend`, mock'larla, mevcut jest yapılandırması):
  - adlandırma ve sıkı regex;
  - hash'in kanonik olması: `_archive` alanından bağımsız, alan sırasından bağımsız;
  - adım durum makinesi: kaynak/hedef karar tablosundaki dört durum ve çakışmada durma;
  - User alt küme projeksiyonu: `payout_profile` alt kümeye **girmemeli**;
  - bekçinin `warn` ve `enforce` modları; `active` belgesinin eksik, eşleşmeyen ve `ROTATING` halleri; `/health` 200 ve `/ready` 503;
  - `archiveRetention`: terminal olmayan trade de temizlenir; `min(delete_at, archived_at + 30 gün)`; şifreli alanlar çözülmez.
- **Regresyon testleri:**
  - eski #N RESOLVED iken arşiv sonrası yeni #N OPEN olarak yazılır;
  - PII ve dekont uçları yeni trade'i kabul eder;
  - yeni trade'in snapshot'ı boştan yakalanır, `reputation_context` varsayılan değerlerle gelir.
- **Workflow ve betik testleri** (`test/contracts/resetWorkerCheckpoint.test.js` deseni: sahte `flyctl` ve sahte Redis):
  - makine işlemden önce ya da sonra açılırsa 3 deneme ve sonunda hata;
  - liste hatasında fail-closed;
  - DLQ ve `last_known` RENAME edilir, checkpoint manifeste yazılır;
  - secret'lar çıktıya basılmaz;
  - `deploy.hardening.static.test.js` yeni adımın yerini doğrular: deploy'dan sonra, health kontrolünden önce; ön kontrol kontrat deploy'undan önce.
- **Entegrasyon testi.** Repoda `mongodb-memory-server` yok. Önerim: CI'da tek düğümlü replica set servis konteyneri ile seed, rotasyon, doğrulama ve geri yükleme turu; ayrıca yarıda bırakıp yeniden çalıştırma ve kopya modu.
- **Canlı doğrulama (dry-run):**
  1. `rotate-escrow.yml --dry-run`: yetki ve rename denemesi, `dbStats`, sayım ve hash, zincir örnek kontrolü, aktif trade sayısı; hiçbir yazma yapılmaz.
  2. Önce bekçiyi `warn` modunda yayınla; logda `escrow_mismatch` olmadığını gör; sonra `enforce`.
  3. Gerçek rotasyon; ardından manifest sayım ve hash eşitliği, canlı koleksiyonların boş olduğu ve `/ready` 200.
  4. Ayrı bir test cluster'ında restore provası.

### Kritik dosyalar
- `/home/user/Araf-Protokol/.github/workflows/deploy-base-sepolia.yml`
- `/home/user/Araf-Protokol/.github/scripts/reset-worker-checkpoint.sh` (ve yanındaki `/home/user/Araf-Protokol/.github/scripts/delete-worker-checkpoint.js`)
- `/home/user/Araf-Protokol/backend/scripts/services/eventListener.js`
- `/home/user/Araf-Protokol/backend/scripts/app.js`
- `/home/user/Araf-Protokol/backend/scripts/jobs/cleanupSensitiveData.js`
- `/home/user/Araf-Protokol/backend/scripts/models/Trade.js`
- `/home/user/Araf-Protokol/backend/scripts/models/User.js`
- `/home/user/Araf-Protokol/test/contracts/resetWorkerCheckpoint.test.js`