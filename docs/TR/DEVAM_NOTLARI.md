# Devam notları: açık, durdurulmuş ve yarım kalan işler

Tarih: 2026-10-20. Bu dosya, Claude Code oturumunun (session_01XJZfYJwUeXEYR28yiSKHaS) kapanışında yazıldı. Yeni oturum buradan devam etmeli.

**Durum:** Kullanıcının "durdur tüm işlemleri" talimatıyla bütün işler durduruldu. Çalışan ajan ya da zamanlanmış görev yok. Canlı sistemlere (Mongo, Redis, Fly, kontrat) dokunulmadı.

---

## 1. Çalışma kuralları (yeni oturum önce bunları okumalı)

### Orkestra kuralları (`CLAUDE.md`)
- Şef işi böler, brif yazar ve ajanı ve modeli seçer.
- Kodu, tasarımı ya da metni kendisi üretmez; kendi işini kendisi onaylamaz.
- **Model seçimi:**
  - mekanik iş: haiku;
  - araştırma, tarif edilmiş kod ve denetim: sonnet;
  - tasarım ve riskli denetim (`contracts/src`): opus.
- Dosya değiştiren her ajan kendi worktree'sinde ve kendi dalında çalışır.
- Ana dala yalnız şef, testler geçtikten sonra `merge --no-ff` ile birleştirir.
- DÜZELT en fazla 3 tur yapılır; sonra kullanıcıya sorulur.

### Kullanıcının kalıcı kuralları
- İşler **teker teker** yapılır.
- Kanıtsız ve artı/eksisi gösterilmemiş öneri getirilmez. Varsayımla ilerlenmez; kesin cümle kurmadan önce kodda doğrulanır.
- **Felsefe:** karar mercii kontrattır; backend ve frontend hakem değildir. Sisteme yük bindirilmez. Mimari dokümanlar (`docs/TR/ARCHITECTURE.md`, `GAME_THEORY.md`) referans alınır.
- Kontrat dışı işler yapılıp push edilebilir. **Kontrat değişikliği kullanıcı onayı gerektirir.**
- PR açmadan ya da push etmeden önce PR'ın birleşip birleşmediği kontrol edilir. Birleştiyse yeni PR açılır.

### Güvenlik kısıtları (pazarlıksız)
- Oyun teorisine aykırı admin, hakem ya da oracle özelliği eklenmez.
- Payout snapshot'ına işlem sırasında değişen ödeme bilgisi giremez.
- Kritik uyarılar (ESCROW_MISMATCH, BACKEND_CHAIN_UNSUPPORTED, ESCROW_ADDRESS_MISSING, API_POLICY_VIOLATION) kapatılamaz.
- SEC-01/KMS fail-closed asla zayıflatılmaz.
- Şunlar admin panelinden değiştirilemez: RPC URL'leri, secret'lar, adresler, zincir, finality, CORS, ADMIN_WALLETS, KMS.
- CSP'de `'unsafe-eval'` ve `*` kullanılmaz.

---

## 2. Canlı ortam (Base Sepolia, herkese açık bilgiler)

| Ne | Değer |
|---|---|
| ArafEscrow | `0x8763Fac6f8F7974Ea8D0A4fDbC13C0cE84da8B73` |
| tUSDT (mint edilebilir test token'ı, 6 ondalık) | `0x1D03b9f2B1846a35bf03Aaadc009aA49c0A602f2` |
| USDC (Circle Base Sepolia, mint edilemez; faucet.circle.com) | `0x036CbD53842c5426634e7929541eC2318f3dCF7e` |
| Deploy bloğu | 48101694 |
| Revenue vault | `0x2F476A505eB4B733E369dD2311835e0aFb2cBADB` |
| Rewards | `0xA09e6678782e6E3C0C489D717a7865623Fd066cB` |
| Final owner | `0x6aF039202534B0ED68270954852655f81e266aCE` |
| Frontend | https://araf-protocol.vercel.app |

**Kaynak:** Deploy Base Sepolia run #19 (38545702408) ve Deploy Runtime run #4 (38685214661) logları. Bu değerler repoda yalnız GitHub repo variable'larında duruyor.

---

## 3. Kullanıcının yapması gereken operasyon adımları (açık)

1. **Anahtarlar:** Infura anahtarını yenile; loglarda ve sohbette sızdı. Eski Alchemy anahtarını iptal et.
2. **WalletConnect:**
   - `VITE_WALLETCONNECT_PROJECT_ID` değerini GitHub → Settings → Secrets and variables → Actions → **Variables** sekmesine *repository variable* olarak ekle. Secret ya da Environment değişkeni olarak eklenirse workflow onu okumaz.
   - Reown panelinde Allowed Domains listesine `araf-protocol.vercel.app` ekle.
   - Ardından Deploy Runtime'ı çalıştır. Değer hâlâ boşsa deploy logunda `::warning::` çıkar.
3. **Yedek RPC:**
   - GitHub'da `BASE_SEPOLIA_RPC_URL_FALLBACKS` ve Fly'da `BASE_RPC_URL_FALLBACKS` değerini `https://sepolia.base.org` yap.
4. **Vercel:** Ignored Build Step `exit 0` olmalı. Deploy'u workflow yapıyor.
5. **PR #145 sonrası kurulum** (#145 birleşti; deploy yapılmadıysa):
   1. Deploy Runtime'ı çalıştır; bekçi `warn` modunda gelir.
   2. **Escrow Registry Adopt** workflow'unu önce `dry_run=true` ile çalıştır. Çıktıda escrow `0x8763…8B73` olmalı. Sonra `dry_run=false` ile tekrar çalıştır. Gerçek Mongo'ya yazma yolu burada ilk kez denenir.
   3. `/ready` yanıtında `escrowRegistry.ok: true` görülmeli.
   4. `enforce` moduna geçmek isteğe bağlıdır: `flyctl secrets set ESCROW_REGISTRY_GUARD_MODE=enforce`.
6. **Relayer:** Ödül ve decay işleri test edilecekse ayrı, düşük bakiyeli bir cüzdanla `RELAYER_PRIVATE_KEY` gerekir. Anahtar yokken bu işler artık pasif kalıyor ve hata logu yazmıyor.
7. **Cüzdan:**
   - Yeni escrow'da yeniden kayıt ol.
   - Cüzdana Base Sepolia ETH ekle. ETH yoksa MetaMask "Gas Station / EIP-7702" hatası veriyor.
   - OKX ve MetaMask'ta Base Sepolia RPC'sini `https://sepolia.base.org` yap. Varsayılan RPC'leri (`lb.routeme.sh` ve MetaMask'ın Infura'sı) hız limitine takılıyor.
   - USDC'yi cüzdanda görmek için token'ı elle içe aktar.
8. **Arşiv:** Arşivleme (Faz 2b) bitene kadar eskiyle yeni escrow arasında ID çakışması riski var.

---

## 4. Durdurulmuş ya da yarım kalan işler (öncelik sırasıyla)

### 4.1 Cüzdan iletişimi ve kontrat onay akışı — KULLANICININ ÖNCELİĞİ, başlanmadı

Kullanıcı: "Cüzdan bağlama olaylarını ve kontrat işlem onaylarını detaylıca incele (cüzdan kayıtta bile sürekli hata alıyorum)."

**Belirtiler (kullanıcı ve Fly logları):**
- **WalletConnect mobil akışı:** onayla → web yönlendirme ekranı → uygulama seçimi → en sonda uygulamaya yönlendirme. Cüzdan uygulaması açılınca son işlemin bildirimini gösteriyor ama işlemi yaptırmıyor.
- **`registerWallet` sürekli hata veriyor:**
  - MetaMask mobil: `Request exceeds defined limit` (RPC limiti, -32005).
  - `Gas Station … Chain must support EIP-7702 for sponsored or gas included transaction`.
- **`createSellOrder`:** Chrome Android, büyük olasılıkla WalletConnect üzerinden. Hata `İşlem parametreleri geçersiz…` (OKX'in kendi mesajı), `diag=wallet-rpc`, `rpcCode=-32603`. Bizim RPC'deki simülasyon geçti, yani kontrat kabul ediyor; ret cüzdan tarafında.
- **Kullanıcı reddi hata olarak loglanıyor:** `[FRONTEND-CRASH] [FAUCET-REVERT] User rejected the request.` ve `[TOKEN-APPROVE-REVERT] User rejected…`. Bunlar hata olarak loglanmamalı. Kod: `frontend/src/hooks/useArafContract.js` (mint ve approve catch blokları).

**İlk hipotezler (DOĞRULANMADI; kanıtla incelenmeli):**
- Cüzdanların kendi Base Sepolia RPC'leri hız limitine takılıyor. Gas tahmini cüzdana bırakıldığı için hata cüzdanda oluşuyor.
- "Gas Station" hatası cüzdanda native ETH olmamasından kaynaklanıyor olabilir.
- WalletConnect isteğinden sonra cüzdana yönlendirme native şema (`metamask://`, `okx://`) yerine universal link üzerinden yapılıyor. Bu yüzden ara web sayfası ve seçim ekranı çıkıyor. Bildirimin işlem yaptırmamasının nedeni bilinmiyor: süresi dolmuş istek, oturum namespace'inde zincir eksikliği ya da istek relay'e ulaşmadan cüzdanın açılması olabilir.

**Önerilecek işler (her biri kanıt ve artı/eksi ile, onay alınarak):**
- (a) İşlemden önce native ETH bakiye kontrolü: "Base Sepolia ETH yok" mesajı ve faucet bağlantısı.
- (b) Gas limiti ve ücretleri bizim RPC'den hesaplanıp `writeContract`'a verilsin; cüzdanın kendi RPC'sine bağımlılık azalır.
- (c) Kullanıcı reddi (4001 / "User rejected") crash olarak loglanmasın.
- (d) WalletConnect mobil yönlendirmesi için wagmi/Reown davranışı araştırılsın (deep link, `session.peer.metadata.redirect`).
- Önce bir araştırma ajanıyla (sonnet, salt okuma + web) kök neden raporu çıkarılsın.

### 4.2 Arşiv Faz 2b: escrow rotasyonu — DURDURULDU, commit yok

Ajan kota sınırında kesildi; worktree'de commit yok. Sıfırdan başlanmalı.

**Onaylı tasarım:**
- `docs/TR/arsiv/01_arsiv_tasarimi.md`
- `docs/TR/arsiv/02_mimari_denetim_ve_kararlar.md`

**Mimari denetimin tasarımı değiştirdiği noktalar (kullanıcı onayladı):**
- Boşaltma kapısı açık **trade'lere ek olarak açık order'ları** da sayar (order rezervleri `ArafEscrow.sol:717-718`). Okumalar Multicall ile yapılır.
- Açık işlem 0'a inmeyebilir; LOCKED durumunu yalnız taraflar kapatabilir. Kapı kalan trade ve order id'lerini raporlar, ancak açık sahip onayıyla (`confirm_archive_active_trades=YES`) devam eder. Kalan işlemler için çıkış yolu P4 yedek görünümüdür (PR #145'te var).
- Redis tarafı:
  - `worker:last_block` ve `worker:last_safe_block` checkpoint'leri manifeste yazılır;
  - checkpoint **asla ileri alınmaz**;
  - DLQ ve `cache:protocol_config:v3:last_known` yeniden adlandırılır;
  - geri alma bunların hepsini kapsar.
- Trade'lerdeki 365 günlük TTL arşivde **devam eder**.
- `archiveRetention` işi:
  - PII alanlarını mevcut `delete_at` tarihleriyle temizler;
  - en geç `archived_at + 30 gün` uygulanır;
  - status filtresi yoktur;
  - şifreli alanlar asla çözülmez.
- Aynı veritabanı ve mevcut `MONGODB_URI` kullanılır; ayrı arşiv DB'si yoktur. `renameCollection` aynı DB içinde çalışır.
- Workflow kontratı **pause etmez**; owner anahtarı workflow'da yok. Pause durumunu yalnız okur, kontrat pause değilse durur.
- `GOVERNANCE_READINESS.md:26-32` adımları runbook'a eklenir: ön duyuru, öncesi ve sonrası kontrol, kayıt.

**Kapsam:**
- `rotate-escrow.js`:
  - durum makinesi: PLANNED → MONGO_DONE → USERS_DONE → REDIS_DONE → ACTIVE_SWITCHED → VERIFIED;
  - varsayılan dry-run, yazma için `--apply`;
  - geri alma için `--restore`.
- `archiveRetention` job'u.
- `rotate-escrow.yml` workflow'u.
- `deploy-base-sepolia.yml` içine ön kontrol eklenir. Faz 1'deki `--force-switch` adımıyla uyumlu olmalı.
- TR/EN runbook ve testler (sahte Mongo/Redis/RPC/flyctl).

### 4.3 USDC bakiyesi görünmüyor — kullanıcıdan cevap bekleniyor

Kullanıcı "20 USDC çektim ama görünmüyor" dedi. Site token bakiyesini hiçbir yerde göstermiyor; `balanceOf` yalnız approve öncesi kontrolde kullanılıyor.

**Kullanıcıdan istenenler:**
- BaseScan sonucu: `https://sepolia.basescan.org/token/0x036CbD53842c5426634e7929541eC2318f3dCF7e?a=<cüzdan>`;
- sitedeki hata mesajının tam metni.

Circle faucet'inde **Base Sepolia** seçili olmalı.

**Onay bekleyen öneriler:**
- profilde USDT ve USDC bakiyelerinin gösterilmesi;
- "Cüzdana ekle" butonu (`wallet_watchAsset`).

### 4.4 Onay bekleyen ürün kararı: yedek modda ödeme bildirimi

Kontrat `reportPayment` için boş olmayan bir `_ipfsHash` istiyor (`ArafEscrow.sol:843-855`). Dekont backend'e yüklendiği için backend kapalıyken taker ödeme bildiremiyor. 48 saatlik pencere dolarsa:
- işlem CANCELED olur;
- taker'ın teminatından ceza kesilir ve itibarına olumsuz kayıt düşer.

**Şu anki çözüm (2):** bildirim kapalı ve açık bir uyarı gösteriliyor ("ödeme yaptıysanız karşılıklı iptali onaylayın").

**Seçenek (1):** dekont hash'i cihazda hesaplanır.
- Artı: ceza önlenir.
- Eksi: maker dekontu göremez ve sahte bildirim zahmetsizleşir.

Kullanıcı kararı gerekiyor.

### 4.5 Doğrulanmamış ya da açık kalan küçük başlıklar

1. **Rate limit IP'si: tüm kullanıcılar tek kullanıcı sayılıyor olabilir.**
   - Bir crash logunda istemci IP'si `66.241.125.182` görünüyordu. Bu adres Fly'ın ağ aralığına benziyor.
   - Backend `trust proxy = 1` kullanıyor (`backend/scripts/app.js:122`). `req.ip` istemcinin değil, proxy'nin adresini veriyorsa IP tabanlı rate limit herkesi tek kullanıcı gibi sayar.
   - DOĞRULANMADI. Kontrol: kendi IP'ni bir istek logundaki IP ile karşılaştır, ya da Fly'ın `Fly-Client-IP` header'ını incele.
   - Not: IP artık loglara yazılmıyor (#143). Doğrulamak için geçici ve gizlilik dostu bir yöntem gerekir.
2. **Tier tutar limitleri zincirden okunamadı.**
   - Beklenen: USDT ve USDC için 150 / 1.500 / 7.500 / 30.000.
   - Dolaylı kanıt: deploy betiği limitleri yazdıktan sonra zincirden okuyup birebir karşılaştırıyor, tutmazsa duruyor (`contracts/scripts/deploy.js:248-264`). Run #19 başarılı bitti.
   - Owner sonradan `setTokenConfig` ile değiştirdiyse bu görülmez. Bu oturum `sepolia.base.org`'a erişemedi.
   - Teyit: BaseScan → escrow → Read Contract → `getTokenConfig(token)`.
   - Önemi: limit 0 olursa o tier için tutar sınırı uygulanmaz (`ArafEscrow.sol:705-706`).
3. **Faz 1 bekçisinin `enforce` moduna geçmeden önceki kararları** (denetçi bulguları):
   - `enforce` modunda `/api/admin` da kapanıyor. Güvenli taraf, ama kriz anında admin panele erişilemez.
   - Deploy workflow'u `--force-switch` ile ROTATING durumundaki kaydı da ezer. Faz 2b rotasyonu sürerken yanlışlıkla bir deploy çalışırsa koruma atlanır. Faz 2b'de deploy adımına ROTATING için ayrı kural düşünülmeli.
   - Yeni deploy ile registry yazımı arasında, `enforce` açıksa, en fazla ~60 sn route'lar kapalı kalır. Kendiliğinden toparlanır.
4. **P4 yedek görünümünün bilinen sınırları:**
   - Bilinen tradeId listesi cihaza bağlı. Başka cihazda ya da P4'ten önce açılmış işlemler yalnız elle girişle bulunur; tasarım gereği tarama yok.
   - Yedek modda `#/trade/<id>` bağlantısı odayı kendiliğinden açmıyor.
   - Elle tradeId girişinde hız sınırı yok. Her giriş tek bir `getTrade` çağrısı; denetçi riski düşük buldu.
5. **Küçük temizlik:** `frontend/src/app/walletRpcDiagnosis.js` içindeki `formatDiagnosisForLog` artık kullanılmıyor (#144'ten sonra). Silinebilir.
6. **Bekleyen istek:** sitede alınan hata mesajının tam metni. USDC sorunu (4.3) için kullanıcıdan istenmişti.

---

## 5. Mainnet öncesi kontrat işleri (HER BİRİ kullanıcı onayı gerektirir)

1. **Alış emrinde yaş kontrolü:**
   - Kullanıcının isteği: emir yayınlanabilsin, işleme giriş engellensin.
   - Değişiklik: `createBuyOrder` içindeki `_enforceTakerEntry` (satır ~631) kaldırılır. Doldurma anında kontrol (`fillBuyOrder` satır 656) zaten var.
   - Eksi 1: yaşı dolmamış birinin emrini dolduran satıcının işlemi reddedilir. Pazar yerinde "henüz doldurulamaz" etiketi gerekir.
   - Eksi 2: yeniden deploy gerekir.
2. **Solidity derleyici yükseltmesi:**
   - Mevcut ayarlar: 0.8.24, viaIR açık, optimizer 200. BaseScan beş bilinen derleyici hatasını listeliyor.
   - İnceleme sonucu:
     - MemoryByteArrayElementDeleteClearsWholeWord: koşul yok; viaIR açık ve `delete` kullanılmıyor.
     - LostStorageArrayWriteOnSlotOverflow: koşul yok; dinamik storage dizisi yok.
     - SpillSlotCollisionAcrossMutualRecursion ve UnsoundSpillInMutualRecursion: büyük olasılıkla koşul yok; karşılıklı özyineleme bulunmadı. OpenZeppelin kütüphaneleri ayrıca taranmadı.
     - YulOptimizerKnowledgeBaseStaleBookkeeping: belirlenemedi.
   - Öneri: 0.8.37'ye ya da yayımlanmışsa 0.8.38'e geçilsin; ardından tam test, ABI drift ve gas ölçümü. Kaynak: `github.com/ethereum/solidity/docs/bugs.json`.
3. **P5:** kalıcı escrow kapsamı (escrow_address/chain_id alanları ya da escrow başına ayrı DB). Faz 2b ile birlikte tasarlanmalı.
4. **Bounty işleri (B1 vb.):** beklemede.

---

## 6. Tamamlanan PR'lar (bu oturum)

| PR | İçerik |
|---|---|
| #139–#141 | log redaksiyonu, worker checkpoint sıfırlama, rewards binding kontrolü |
| #142 | pazar yeniden tasarımı, RPC hız sınırı, SIWE nonce TTL |
| #143 | scheduler başarı sözleşmesi, cüzdan kayıt yeniden deneme, admin ipucu kaldırıldı, WalletConnect + 3 seçenekli seçici, IP loglanmıyor, risk kartı, tier/yaş/bakiye ön kontrolleri, cüzdan hatası simülasyon teşhisi |
| #144 | relayer pasif modu, ağ değiştir butonu, Circle USDC faucet bağlantısı, gas-station/RPC-limit teşhisi, beyaz listeli log alanları, admin sağlık renkleri |
| #145 | Arşiv Faz 1 (`escrow_registry` + bekçi, varsayılan warn), backend ESCROW_MISMATCH bandı, P4 zincirden yedek işlem görünümü, odakta yeniden doğrulama |

---

## 7. Ortam notları (Claude Code bulut oturumu)

- **Hardhat derleyicisi:** derleyici indirilemiyor (HH502). Çözüm: `~/.cache/hardhat-nodejs/compilers-v2/` altına npm'den solcjs 0.8.24 tohumlanır (wasm `list.json` + `soljson-v0.8.24+commit.e11b9ed9.js`).
- **Ağ politikası:** oturum `sepolia.base.org` ve `araf-protocol.vercel.app` adreslerine erişemiyor (proxy 403). Zincir okuması yapılamıyor; adresler Actions loglarından okunuyor.
- **GitHub variable'ları:** Actions variable'ları API'den okunamıyor (403). Job logları GitHub MCP `get_job_logs` ile okunabiliyor.
- **Workflow script testleri:** `cd contracts && NODE_PATH=$PWD/node_modules node_modules/.bin/mocha ../test/contracts/<dosya>`.
