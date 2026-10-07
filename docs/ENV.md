# Araf Protokol: Ortam Değişkenleri (env) Başvuru Belgesi

> Bu belge koddan çıkarılmıştır (güncel ana dal `ccr-ddc7ecdc-5j36yk` üzerinde yeniden doğrulandı). Her değişkenin en az bir kullanım yeri açılıp okunmuştur.
> Gerçek değer/sır yazılmaz; yalnız biçim örnekleri verilir. Emin olunamayan yerler "doğrulanmadı" diye işaretlidir.
> Kaynaklar: `contracts/hardhat.config.js`, `contracts/scripts/*`, `backend/scripts/**`, `frontend/src/**`,
> `.github/workflows/{ci,deploy-base-sepolia,deploy-runtime-base-sepolia}.yml`, `docs/DEPLOY_BASE_SEPOLIA.md`, `backend/fly.toml`, `backend/Dockerfile`, `frontend/vercel.json`, `*/.env.example`,
> `docs/TR/DEPLOYMENT_GUIDE.md`, `docs/TR/MAINNET_READINESS_CHECKLIST.md`.

## İçindekiler
1. [Önce bunu oku](#1-önce-bunu-oku)
2. [Contracts](#2-contracts-contractsenv)
3. [Backend](#3-backend-backendenv--fly-secrets)
4. [Frontend](#4-frontend-frontendenv--vercel-build-env)
5. [Gizli mi? (🔒)](#5-gizli-mi-)
6. [Eski / kullanılmayan / takma adlar](#6-eski--kullanılmayan--takma-adlar)
7. [Workflow'un otomatik ayarladıkları](#7-workflowun-otomatik-ayarladıkları)
8. [Tutarsızlıklar](#8-tutarsızlıklar)

---

## 1. Önce bunu oku

Değişkenler 4 yere girilir:

| Nereye | Ne için | Nasıl |
|---|---|---|
| **Yerel geliştirme** | `contracts/.env`, `backend/.env`, `frontend/.env` | Her biri kendi `.env.example` dosyasından kopyalanır (`cp .env.example .env`). |
| **GitHub** Secrets ve Variables | Base Sepolia deploy workflow'ları için tek giriş noktası | `gh secret set` / `gh variable set` (`docs/DEPLOY_BASE_SEPOLIA.md`). Sen yalnız buraya girersin. |
| **Fly.io** (backend production) | Backend'in tüm production değişkenleri | **Workflow yazar** (`flyctl secrets import --stage`, sonra `flyctl deploy`). Elle `fly secrets set` gerekmez. `PORT`/`NODE_ENV` zaten `backend/fly.toml [env]`'de. |
| **Vercel** (frontend build) | `VITE_*` | **Workflow verir** (`vercel deploy --build-env ...`; yalnız `deploy_frontend=true` iken). Elle girilmez. |

Kısaltmalar: `C/.env` = `contracts/.env` · `B/.env` = `backend/.env` · `F/.env` = `frontend/.env` · `GH` = GitHub secret/variable ·
`Fly` = Fly secret (workflow yazar) · `Vercel` = Vercel build-env (workflow verir) · `terminal` = komut satırında geçici.
Tablolardaki "Nereye girilir" sütunu Base Sepolia/Mainnet için **hedef yeri** gösterir; Sepolia'da `Fly`/`Vercel` değerlerini workflow yazar (bkz. 7).

> **Base Sepolia demosu için senin elle girmen gereken liste**
> (kaynak: `deploy-base-sepolia.yml:43-76` doğrulama adımı ve `docs/DEPLOY_BASE_SEPOLIA.md:7-40`; deploy: `gh workflow run deploy-base-sepolia.yml -f deploy_frontend=true`)
>
> **GitHub Secrets, zorunlu (8):** `DEPLOYER_PRIVATE_KEY`, `BASE_SEPOLIA_RPC_URL`, `BASE_SEPOLIA_WS_RPC_URL`, `FLY_API_TOKEN`,
> `MONGODB_URI`, `REDIS_URL` (`rediss://` olmalı), `JWT_SECRET` (≥64 karakter), `MASTER_ENCRYPTION_KEY` (tam 64 hex).
>
> **GitHub Variables, zorunlu (5):** `FRONTEND_DOMAIN` (yalnız host, `https://` yok), `TREASURY_ADDRESS`, `FINAL_OWNER_ADDRESS` (treasury'den farklı),
> `BASE_SEPOLIA_USDT_ADDRESS`, `BASE_SEPOLIA_USDC_ADDRESS`.
>
> **Frontend de deploy edilecekse ek 3 secret:** `VERCEL_TOKEN`, `VERCEL_ORG_ID`, `VERCEL_PROJECT_ID`.
>
> **Opsiyonel:** secret `RELAYER_PRIVATE_KEY`; variable `FLY_APP_NAME` (varsayılan `araf-protocol-backend`), `ADMIN_WALLETS`, `VITE_RPC_URL`.
>
> **Deploy SONRASI (2 variable, elle):** `ARAF_ESCROW_ADDRESS`, `ARAF_DEPLOYMENT_BLOCK`; yalnız sonraki `deploy-runtime-base-sepolia.yml` çalıştırmaları için gerekir
> (tam deploy workflow'u bunları yalnız özet sayfasına yazar, variable olarak kaydetmez: `deploy-base-sepolia.yml:243`).
>
> Toplam: **13 zorunlu giriş** (8 secret + 5 variable), frontend ile **16**. `contracts/.env`, `fly secrets set` ve Vercel paneli için elle giriş **yok**.
> Fly uygulaması (`fly apps create`) ve Vercel projesi bir kez elle oluşturulmalı (`DEPLOY_BASE_SEPOLIA.md:44-45`).

---

## 2. Contracts (`contracts/.env`)

Hardhat `contracts/.env` dosyasını yükler. Ağ, env ile değil `--network <hardhat|localhost|base-sepolia|base>` ile seçilir.
Bu paketteki değişkenler Fly/Vercel'e girmez; workflow bunları `contracts/.env` yazmadan, yalnız deploy adımının ortamına verir (`deploy-base-sepolia.yml:87-100`, bkz. 7.3). **37 değişken okunuyor** (+ yalnız örnekte/belgede olanlar: bkz. 6).

Sütunlar: Y = Yerel, S = Base Sepolia, M = Mainnet. "Zorunlu": her zaman / ilgili işte / opsiyonel (varsayılan).

### 2.1 Ağ ve imzalayıcı

| Değişken | Ne işe yarar | Zorunlu mu? | Y | S | M | Nereye | Kullanıldığı yer |
|---|---|---|---|---|---|---|---|
| `BASE_SEPOLIA_RPC_URL` | Base Sepolia RPC adresi | `--network base-sepolia` iken; yoksa hata | gerekmez | `https://…alchemy…/v2/KEY` | gerekmez | C/.env | `hardhat.config.js:35`, `:96` |
| `BASE_RPC_URL` | Base Mainnet RPC adresi | `--network base` iken; yoksa hata | gerekmez | gerekmez | `https://…/v2/KEY` | C/.env | `hardhat.config.js:32` |
| 🔒 `DEPLOYER_PRIVATE_KEY` | Public ağlarda imzalayan cüzdanın özel anahtarı | Public ağlarda (yoksa hesap listesi boş kalır) | gerekmez | `0x…64 hex` | `0x…64 hex` | C/.env | `hardhat.config.js:90`, `:98` |
| 🔒 `BASESCAN_API_KEY` | BaseScan doğrulaması için API anahtarı | Opsiyonel (`""`) | gerekmez | opsiyonel | opsiyonel | C/.env | `hardhat.config.js:106` |
| `REPORT_GAS` | `true` ise gas raporu | Opsiyonel (kapalı) | `false` | `false` | `false` | C/.env | `hardhat.config.js:129` |
| 🔒 `CMC_API_KEY` | Gas raporunda fiyat için CoinMarketCap anahtarı | Opsiyonel | gerekmez | gerekmez | gerekmez | C/.env | `hardhat.config.js:131` |
| `ARAF_SOLCJS_PATH` | Native derleyici indirilemeyen ortamda `soljson.js` yolu | Opsiyonel (etkisiz) | nadiren | nadiren | nadiren | C/.env | `hardhat.config.js:48` |
| `NODE_ENV` | `production` ise deploy token adreslerini zorunlu kılar | Opsiyonel | boş | boş | boş | C/.env, terminal | `scripts/deploy.js:108` |

### 2.2 Escrow deploy (`scripts/deploy.js`)

| Değişken | Ne işe yarar | Zorunlu mu? | Y | S | M | Nereye | Kullanıldığı yer |
|---|---|---|---|---|---|---|---|
| `CONFIRM_PUBLIC_DEPLOY` | Public zincir deploy onayı (`yes` olmalı) | Public ağda zorunlu | gerekmez | `yes` | `yes` | C/.env, terminal | `deploy.js:319` |
| `TREASURY_ADDRESS` | Protokol kasası (escrow constructor argümanı) | Her deploy'da | `0x…40 hex` | `0x…40 hex` | Gnosis Safe | C/.env | `deploy.js:341` |
| `FINAL_OWNER_ADDRESS` | Deploy sonu sahiplik devri | Public/custom: zorunlu ve treasury'den farklı; local: varsayılan treasury | opsiyonel | zorunlu | zorunlu | C/.env | `deploy.js:148`, `:151` |
| `BASE_SEPOLIA_USDT_ADDRESS` / `_USDC_` | Sepolia token adresleri | 84532 deploy'unda zorunlu (`MAINNET_*` reddedilir) | gerekmez | `0x…40 hex` | gerekmez | C/.env | `deploy.js:130-131` |
| `BASE_MAINNET_USDT_ADDRESS` / `_USDC_` | Mainnet token adresleri | 8453 deploy'unda zorunlu | gerekmez | gerekmez | `0x…40 hex` | C/.env | `deploy.js:115-116` |
| `USE_EXTERNAL_TOKEN_ADDRESSES` | `true` ise local/custom'da mock yerine harici token | Opsiyonel (`false`) | `false` | gerekmez | gerekmez | C/.env | `deploy.js:357` |
| `EXTERNAL_USDT_ADDRESS` / `_USDC_` | Yukarıdaki durumda harici token adresleri (Base dışı zincir) | `USE_EXTERNAL…=true` ve Base zinciri değilse | opsiyonel | gerekmez | gerekmez | C/.env | `deploy.js:140-141` |
| `CODESPACE_NAME` | Codespaces adı; `frontend/.env`'deki `VITE_API_URL`'i yeniden yazar | Opsiyonel; yalnız local | otomatik | gerekmez | gerekmez | Codespaces ortamı | `deploy.js:301` |
| `TEST_TOKEN_SYMBOL` / `TEST_TOKEN_NAME` | `deployTestToken.js` token sembolü/adı (varsayılan `tUSDT` / `Test Tether USD`) | Opsiyonel | gerekmez | opsiyonel | gerekmez | C/.env, terminal | `deployTestToken.js` |
| `CONFIRM_TEST_TOKEN_DEPLOY` | Public (84532) ağda test token deploy onayı (`yes`); yalnız 84532/31337 çalışır | Sepolia'da zorunlu | gerekmez | `yes` | yasak (8453'te hata) | C/.env, terminal | `deployTestToken.js` |

### 2.3 Rewards deploy / işletme (`deployRewards.js`, `rewardsOps.js`, `smokeRewards.js`, `gasBaseline.js`)

| Değişken | Ne işe yarar | Zorunlu mu? | Y | S | M | Nereye | Kullanıldığı yer |
|---|---|---|---|---|---|---|---|
| `ARAF_ESCROW_ADDRESS` | Var olan escrow adresi | Public'te zorunlu; local'de yoksa taze escrow deploy eder | opsiyonel | `0x…40 hex` | `0x…40 hex` | C/.env | `deployRewards.js:53`, `rewardsOps.js:27` |
| `FINAL_TREASURY_ADDRESS` | Rewards için nihai treasury | Public'te zorunlu; local varsayılan deployer | opsiyonel | zorunlu | zorunlu | C/.env | `deployRewards.js:54` |
| `CONFIRM_FRESH_ESCROW_DEPLOY` | Yalnız hata metnini değiştirir; public'te yeni escrow deploy ETMEZ | Opsiyonel | gerekmez | gerekmez | gerekmez | terminal | `deployRewards.js:73` |
| `CONFIRM_OVERWRITE_REWARDS_MANIFEST` | Mevcut `<ağ>-rewards.json` kritik adreslerini ezmek için `yes` | Yalnız ezerken | gerekmez | gerektiğinde | gerektiğinde | terminal | `deployRewards.js:42` |
| `ARAF_REVENUE_VAULT_ADDRESS` | Revenue vault adresi (önce env, sonra manifest) | `configure`/`verify`/`switch` işlerinde | opsiyonel | manifestten | manifestten | C/.env | `rewardsOps.js:28` |
| `ARAF_REWARDS_ADDRESS` | Rewards kontratı adresi (önce env, sonra manifest) | Aynı | opsiyonel | manifestten | manifestten | C/.env | `rewardsOps.js:29` |
| `USDT_ADDRESS` / `USDC_ADDRESS` | Rewards işlerinde token adresi (önce env, sonra manifest) | Aynı | opsiyonel | manifestten | manifestten | C/.env | `rewardsOps.js:30-31` |
| `REWARDS_OP` | `configure`/`verify`/`switch-treasury`; boşsa npm script adından çıkar | Opsiyonel | gerekmez | opsiyonel | opsiyonel | terminal | `rewardsOps.js:106` |
| `CONFIRM_TREASURY_SWITCH` | Treasury'yi vault'a geçirmek için `true` | Yalnız `switch-treasury` | gerekmez | gerektiğinde | gerektiğinde | terminal | `rewardsOps.js:77` |
| `EXPECTED_CURRENT_TREASURY_ADDRESS` | `switch-treasury` için mevcut treasury adresi | Yalnız `switch-treasury` | gerekmez | gerektiğinde | gerektiğinde | terminal | `rewardsOps.js:95` |
| `EXPECT_ESCROW_TREASURY_ADDRESS` | `verify`'da `escrow.treasury()` ek kontrolü | Opsiyonel | gerekmez | opsiyonel | opsiyonel | terminal | `rewardsOps.js:63` |
| `ALLOW_NON_4000_REWARD_BPS` | `true` ise rewardBps≠4000 kontrolünü bilerek atlar | Opsiyonel (kapalı) | gerekmez | gerekmez | gerekmez | terminal | `rewardsOps.js:88` |
| `CONFIRM_SWITCH_TREASURY_TO_VAULT` | Eski bayrak: `configure`'da set edilirse işlemi reddeder | Kullanmayın | gerekmez | gerekmez | gerekmez | (örnekte yok) | `rewardsOps.js:38` |
| `CONFIRM_PUBLIC_SMOKE` | Public ağda smoke testi onayı (`yes`) | Public'te smoke için | gerekmez | `yes` | `yes` | terminal | `smokeRewards.js:7` |
| `GAS_BASELINE_OUT` | Gas tablosunun JSON çıktı yolu | Opsiyonel | opsiyonel | gerekmez | gerekmez | terminal | `gasBaseline.js:173` |

---

## 3. Backend (`backend/.env` / Fly secrets)

`app.js:3` ve migration script'leri `dotenv` ile `backend/.env`'i yükler. Production'da (`NODE_ENV=production`, `fly.toml:11-12`)
değerler Fly secrets'tan gelir; Sepolia'da bunları workflow yazar (bkz. 7.1). **89 değişken okunuyor.** Hiçbir backend değişkeni `VITE_*` olarak frontend'e konmaz.

Ortak okuma: Y = Yerel, S = Base Sepolia (Fly'da yine `NODE_ENV=production` çalışır), M = Mainnet.
"Prod'da" = `NODE_ENV=production` iken zorunlu (yoksa süreç çıkar ya da `/ready` 503 olur).

### 3.1 Sunucu / Ağ

| Değişken | Ne işe yarar | Zorunlu mu? | Y | S | M | Nereye | Kullanıldığı yer |
|---|---|---|---|---|---|---|---|
| `NODE_ENV` | `production` tüm fail-fast kurallarını açar | Opsiyonel (`development`); Fly'da sabit `production` | `development` | `production` | `production` | B/.env; Fly: `fly.toml [env]` | `app.js:145`, `fly.toml:12` |
| `PORT` | HTTP dinleme portu | Opsiyonel (`4000`) | `4000` | `4000` | `4000` | B/.env; Fly: `fly.toml [env]` | `app.js:548`, `fly.toml:11` |
| `LOG_DIR` | Log klasörü (dosya `araf.log`) | Opsiyonel (`backend/logs`) | boş | boş | boş | B/.env, Fly | `utils/logger.js:28` |

### 3.2 Veritabanı ve Redis

| Değişken | Ne işe yarar | Zorunlu mu? | Y | S | M | Nereye | Kullanıldığı yer |
|---|---|---|---|---|---|---|---|
| `MONGODB_URI` | MongoDB bağlantı adresi | Her zaman (yoksa `connectDB` hata verir) | `mongodb://127.0.0.1:27017/araf_protocol` | `mongodb+srv://…` | `mongodb+srv://…` | B/.env, Fly | `config/db.js:34`, `health.js:96` |
| 🔒 `REDIS_URL` | Redis bağlantı adresi (şifre içerebilir) | Prod'da; dev'de `redis://127.0.0.1:6379` | `redis://127.0.0.1:6379` | `rediss://…` | `rediss://…` | B/.env, Fly | `config/redis.js:89` |
| `REDIS_TLS` | `true` ise `redis://` ile de TLS | Opsiyonel; prod'da TLS şart (`rediss://` ya da bu) | boş | `rediss://` yeter | `rediss://` yeter | B/.env, Fly | `config/redis.js:96` |
| `REDIS_TLS_SKIP_VERIFY` | Self-signed dev Redis için sertifika doğrulamayı kapatır | Opsiyonel (`false`); prod'da `true` ise backend başlamaz | `false` | asla | asla | B/.env | `config/redis.js:97` |
| `REDIS_READY_WAIT_MS` | Redis hazır olma bekleme süresi (ms) | Opsiyonel (`5000`) | boş | boş | boş | B/.env, Fly | `config/redis.js:10` |

### 3.3 Kimlik / SIWE / JWT / CORS

| Değişken | Ne işe yarar | Zorunlu mu? | Y | S | M | Nereye | Kullanıldığı yer |
|---|---|---|---|---|---|---|---|
| 🔒 `JWT_SECRET` | JWT imza sırrı (≥64 karakter, entropi ≥3.5, placeholder reddedilir) | **Her zaman** (modül yüklenirken throw) | `crypto.randomBytes(64)` hex | aynı yöntem | aynı yöntem | B/.env, Fly | `services/siwe.js:19`, `:67-78` |
| `JWT_EXPIRES_IN` | Auth JWT ömrü | Opsiyonel (`15m`) | `15m` | `15m` | `15m` | B/.env, Fly | `siwe.js:20` |
| `PII_TOKEN_EXPIRES_IN` | Trade-scoped PII token ömrü | Opsiyonel (`15m`) | `15m` | `15m` | `15m` | B/.env, Fly | `siwe.js:21` |
| `JWT_BLACKLIST_TIMEOUT_MS` | Redis blacklist okuma zaman aşımı | Opsiyonel (`1500`) | boş | boş | boş | B/.env, Fly | `siwe.js:34` |
| `JWT_BLACKLIST_FAIL_MODE` | Blacklist okunamazsa: `closed` reddeder, `open` geçirir | Opsiyonel (prod `closed`, diğer `open`) | boş | boş | boş | B/.env, Fly | `siwe.js:315` |
| `REFRESH_ABSOLUTE_TTL_SECS` | Refresh oturumunun mutlak ömrü (sn) | Opsiyonel (`2592000`) | boş | boş | boş | B/.env, Fly | `siwe.js:31` |
| `REFRESH_REUSE_GRACE_MS` | İki-sekme yarışı toleransı (ms) | Opsiyonel (`10000`) | boş | boş | boş | B/.env, Fly | `siwe.js:33` |
| `REFRESH_LEGACY_SCAN` | `false` ise eski oturumlar için tek seferlik SCAN kapanır | Opsiyonel (açık) | boş | boş | boş | B/.env, Fly | `siwe.js:606` |
| `SIWE_DOMAIN` | SIWE alan adı: yalnız host, `https://` yok | Prod'da (`localhost` olamaz); dev'de `localhost` | `localhost` | frontend host'u (`app.vercel.app`) | gerçek domain | B/.env, Fly | `siwe.js:42`, `app.js:353` |
| `SIWE_URI` | SIWE URI: `https://` olmalı, host'u `SIWE_DOMAIN` ile aynı | Prod'da; dev'de `https://<SIWE_DOMAIN>` | boş | `https://app.vercel.app` | `https://app.example.xyz` | B/.env, Fly | `siwe.js:43`, `health.js:124-135` |
| `ALLOWED_ORIGINS` | CORS origin listesi (virgüllü, path'siz) | Prod'da (`*` ve yalnız-localhost yasak); dev'de `http://localhost:5173` | `http://localhost:5173` | `https://app.vercel.app` | `https://app.example.xyz` | B/.env, Fly | `app.js:117`, `:145-167` |

### 3.4 Zincir ve kontrat adresleri

| Değişken | Ne işe yarar | Zorunlu mu? | Y | S | M | Nereye | Kullanıldığı yer |
|---|---|---|---|---|---|---|---|
| 🔒 `BASE_RPC_URL` | Zincir RPC adresi (anahtar URL'de olur) | Prod'da (public fallback yok) | `https://…/v2/KEY` | Sepolia RPC | Mainnet RPC | B/.env, Fly | `eventListener.js:589`, `health.js:103` |
| 🔒 `BASE_WS_RPC_URL` | WebSocket RPC; yoksa HTTP kullanılır (`wss://` olmalı) | Önerilir (opsiyonel) | boş | `wss://…` | `wss://…` | B/.env, Fly | `eventListener.js:619` |
| `EXPECTED_CHAIN_ID` | Beklenen zincir: `8453` Base, `84532` Sepolia | Prod'da; `BASE_RPC_URL` varsa dev'de de | `84532` ya da `31337` | `84532` | `8453` | B/.env, Fly | `expectedChain.js:19`, `tokenEnv.js:35` |
| `ALLOW_UNSAFE_CHAIN_ID_BYPASS` | Yalnız dev: `EXPECTED_CHAIN_ID` boşken zincir kontrolünü atlar | Opsiyonel (`false`); prod'da etkisiz | opsiyonel | asla | asla | B/.env | `expectedChain.js:20` |
| `ARAF_ESCROW_ADDRESS` | ArafEscrow adresi | Prod'da (yoksa worker çıkar); dev'de worker "dry-run" | `0x…40 hex` | deploy çıktısı | deploy çıktısı | B/.env, Fly | `eventListener.js:590`, `protocolConfig.js:107` |
| `ARAF_REVENUE_VAULT_ADDRESS` | Rewards mirror: vault event'leri için | Opsiyonel (yoksa mirror izlenmez) | boş | `0x…40 hex` | `0x…40 hex` | B/.env, Fly | `eventListener.js:644` |
| `ARAF_REWARDS_ADDRESS` | Rewards kontratı; ayrıca `rewardOutcomeRecorder`'ı açar | Opsiyonel (yoksa mirror/recorder pasif) | boş | `0x…40 hex` | `0x…40 hex` | B/.env, Fly | `eventListener.js:645`, `jobs/rewardOutcomeRecorder.js:50` |

### 3.5 Tokenlar

Seçim `EXPECTED_CHAIN_ID`'ye bağlıdır (`services/tokenEnv.js:61-109`): 8453 → `BASE_MAINNET_*`, 84532 → `BASE_SEPOLIA_*`.

| Değişken | Ne işe yarar | Zorunlu mu? | Y | S | M | Nereye | Kullanıldığı yer |
|---|---|---|---|---|---|---|---|
| `BASE_MAINNET_USDT_ADDRESS` / `_USDC_` | Mainnet token adresleri (kanonik) | Prod'da 8453 ve `ARAF_TRACKED_TOKENS` yoksa; sıfır adres kabul edilmez | opsiyonel | gerekmez | `0x…40 hex` | B/.env, Fly | `tokenEnv.js:64` |
| `BASE_SEPOLIA_USDT_ADDRESS` / `_USDC_` | Sepolia token adresleri (kanonik) | Prod'da 84532 ve `ARAF_TRACKED_TOKENS` yoksa | opsiyonel | `0x…40 hex` | gerekmez | B/.env, Fly | `tokenEnv.js:65` |
| `ARAF_TRACKED_TOKENS` | İzlenecek token listesi (virgüllü); verilirse çiftlerden önceliklidir | Opsiyonel | boş | boş | boş | B/.env, Fly | `tokenEnv.js:136` |
| `MAINNET_USDT_ADDRESS` / `_USDC_` | Eski takma ad (yalnız 8453); prod'da 84532'de hata | Önerilmez | boş | **kullanma** | boş | (bkz. 6) | `tokenEnv.js:66`, `:84-92` |
| `USDT_ADDRESS` / `USDC_ADDRESS` | Eski yedek; yalnız prod dışında (uyarı loglar) | Önerilmez | boş | **kullanma** | **kullanma** | (bkz. 6) | `tokenEnv.js:67`, `:74-76`, `:94-96` |

### 3.6 Şifreleme / KMS

Prod'da `KMS_PROVIDER=env` **reddedilir**; tek istisna dar testnet kuralıdır: `NODE_ENV=production` + `EXPECTED_CHAIN_ID=84532` + `ALLOW_ENV_KMS_ON_TESTNET=yes` (`encryption.js:57-79`, bkz. 3.12). Mainnet için `aws`/`vault` şart. Açılışta KMS self-test çalışır (`app.js:360`, `encryption.js:270-282`).

| Değişken | Ne işe yarar | Zorunlu mu? | Y | S | M | Nereye | Kullanıldığı yer |
|---|---|---|---|---|---|---|---|
| `KMS_PROVIDER` | `env` / `aws` / `vault` | Prod'da `aws`/`vault`; testnet istisnasında `env`; varsayılan `env` | `env` | `env` (workflow yazar) | `aws` | B/.env; Sepolia: Fly (workflow) | `encryption.js:102`, `:271` |
| 🔒 `MASTER_ENCRYPTION_KEY` | Ana şifreleme anahtarı (64 hex; ilk 64 karakter) | `KMS_PROVIDER=env` iken: dev ve testnet istisnası | `randomBytes(32)` hex | GH secret → Fly (workflow) | **konma** | B/.env; GH secret | `encryption.js:113` |
| 🔒 `AWS_ENCRYPTED_DATA_KEY` | AWS KMS ile şifreli data key (base64 CiphertextBlob) | `KMS_PROVIDER=aws` iken | gerekmez | gerekmez | base64 | Fly | `encryption.js:144`, `:285` |
| `ALLOW_ENV_KMS_ON_TESTNET` | Yalnız Base Sepolia'da prod'da `KMS_PROVIDER=env`'e izin veren bayrak (`yes`); mainnet'te etkisiz ve hata verir | Opsiyonel; yalnız `NODE_ENV=production` + `EXPECTED_CHAIN_ID=84532` ile | gerekmez | `yes` (workflow yazar) | **asla** | Fly (workflow `:164`) | `encryption.js:58-63`, `:279` |
| `AWS_REGION` | AWS bölgesi | Opsiyonel (`eu-west-1`) | boş | workflow yazmaz | `eu-west-1` | Fly | `encryption.js:143` |
| `VAULT_ADDR` | Vault adresi | `KMS_PROVIDER=vault` iken | gerekmez | gerekmez | `https://vault…:8200` | Fly | `encryption.js:185`, `:290` |
| 🔒 `VAULT_TOKEN` | Vault erişim token'ı | `KMS_PROVIDER=vault` iken | gerekmez | gerekmez | token | Fly | `encryption.js:186`, `:290` |
| `VAULT_KEY_NAME` | Transit anahtar adı | Opsiyonel (`araf-master-key`) | gerekmez | gerekmez | boş | Fly | `encryption.js:187` |
| 🔒 `VAULT_ENCRYPTED_DATA_KEY` | Sabit wrapped data key (`vault:v1:…`) | `KMS_PROVIDER=vault` iken (yoksa fail-closed) | gerekmez | gerekmez | `vault:v1:…` | Fly | `encryption.js:188`, `:293` |

### 3.7 Worker / event listener / health

| Değişken | Ne işe yarar | Zorunlu mu? | Y | S | M | Nereye | Kullanıldığı yer |
|---|---|---|---|---|---|---|---|
| `ARAF_DEPLOYMENT_BLOCK` | İlk açılışta replay başlangıç bloğu (`WORKER_START_BLOCK`'tan öncelikli) | Prod'da, Redis'te checkpoint yoksa | boş (0'dan başlar) | deploy bloğu | deploy bloğu | B/.env, Fly | `eventListener.js:1095`, `health.js:146` |
| `WORKER_START_BLOCK` | Yukarıdakine alternatif | Aynı (ikisinden biri) | boş | alternatif | alternatif | B/.env, Fly | `eventListener.js:1095` |
| `WORKER_DISABLED` | `true` ise worker hiç başlamaz (yalnız API) | Opsiyonel (`false`) | boş | boş | boş | B/.env, Fly | `eventListener.js:591` |
| `WORKER_FINALITY_DEPTH` | Safe checkpoint için blok derinliği | Opsiyonel (prod `6`, diğer `1`) | boş | boş | boş | B/.env, Fly | `eventListener.js:80-81` |
| `WORKER_BLOCK_BATCH_SIZE` | Replay batch boyutu | Opsiyonel (`1000`) | boş | boş | boş | B/.env, Fly | `eventListener.js:78` |
| `WORKER_CHECKPOINT_INTERVAL_BLOCKS` | Checkpoint aralığı (blok) | Opsiyonel (`50`) | boş | boş | boş | B/.env, Fly | `eventListener.js:79` |
| `WORKER_REPLAY_BACKOFF_BASE_MS` / `_MAX_MS` | Replay hata backoff'u taban/tavan | Opsiyonel (`5000` / `300000`) | boş | boş | boş | B/.env, Fly | `eventListener.js:83-84` |
| `WORKER_BLOCK_STALE_MS` | Bu kadar ms yeni blok yoksa reconnect, hâlâ yoksa süreç çıkar | Opsiyonel (`75000`) | boş | boş | boş | B/.env, Fly | `eventListener.js:87` |
| `WORKER_WATCHDOG_INTERVAL_MS` | Watchdog kontrol aralığı | Opsiyonel (`15000`) | boş | boş | boş | B/.env, Fly | `eventListener.js:88` |
| `WORKER_LIVENESS_STALE_MS` | `/health` 503 "stale" eşiği | Opsiyonel (`BLOCK_STALE*2+30000`) | boş | boş | boş | B/.env, Fly | `eventListener.js:91` |
| `WORKER_MAX_LAG_BLOCKS` | `/ready` için en büyük blok gecikmesi | Opsiyonel (`25`) | boş | boş | boş | B/.env, Fly | `health.js:20` |
| 🔒 `READY_INTERNAL_TOKEN` | `/ready` tam gövdesi için `x-internal-token` değeri | Opsiyonel (yoksa özellik kapalı) | boş | uzun rastgele | uzun rastgele | B/.env, Fly | `health.js:348` |
| `READY_CACHE_TTL_MS` | `/ready` önbellek süresi (5000-10000'e sıkıştırılır) | Opsiyonel (`7000`) | boş | boş | boş | B/.env, Fly | `health.js:291` |

### 3.8 Relayer / ödüller

| Değişken | Ne işe yarar | Zorunlu mu? | Y | S | M | Nereye | Kullanıldığı yer |
|---|---|---|---|---|---|---|---|
| 🔒 `RELAYER_PRIVATE_KEY` | `decayReputation` ve `recordTradeOutcomes` çağıran ayrı, düşük bakiyeli cüzdan | Opsiyonel (yoksa iki görev log yazıp pasif kalır) | boş | `0x…64 hex` | `0x…64 hex` | B/.env, Fly | `jobs/reputationDecay.js:45`, `jobs/rewardOutcomeRecorder.js:49` |
| `REPUTATION_DECAY_CANDIDATE_LIMIT` | Decay aday sayısı | Opsiyonel (`250`) | boş | boş | boş | B/.env, Fly | `reputationDecay.js:35` |
| `REPUTATION_DECAY_TX_LIMIT` | Tur başına tx sayısı | Opsiyonel (`50`) | boş | boş | boş | B/.env, Fly | `reputationDecay.js:36` |
| `REWARD_RECORDER_CANDIDATE_LIMIT` | Recorder aday sayısı | Opsiyonel (`200`) | boş | boş | boş | B/.env, Fly | `rewardOutcomeRecorder.js:36` |
| `REWARD_RECORDER_BATCH_LIMIT` | Recorder batch boyutu | Opsiyonel (`50`) | boş | boş | boş | B/.env, Fly | `rewardOutcomeRecorder.js:37` |

### 3.9 Admin / gözlem ve kimlik normalizasyonu

| Değişken | Ne işe yarar | Zorunlu mu? | Y | S | M | Nereye | Kullanıldığı yer |
|---|---|---|---|---|---|---|---|
| `ADMIN_WALLETS` | `/api/admin/*` ve `isAdmin` için cüzdanlar (virgüllü) | Opsiyonel (boşsa kimse admin değil) | kendi cüzdanın | `0x…40 hex` | `0x…40 hex` | B/.env, Fly | `utils/adminWallets.js:6` |
| `IDENTITY_NORMALIZATION_GUARD` | `off` / `warn` / `enforce` (karışık numeric id guard'ı) | Opsiyonel (prod `enforce`, diğer `warn`) | boş | boş | boş | B/.env, Fly | `app.js:88-94` |
| `PII_IDENTITY_NORMALIZATION_GUARD` | PII route'ları için ayrı mod | Opsiyonel (önceki değişken, o da yoksa `enforce`) | boş | boş | boş | B/.env, Fly | `routes/pii.js:80` |
| `IDENTITY_MIGRATION_BATCH_SIZE` | `migrate:identity` batch boyutu | Opsiyonel (`1000`) | boş | boş | boş | B/.env | `migrations/normalizeIdentityFields.js:170` |

### 3.10 Zamanlanmış işler (ms; yalnız pozitif tam sayı, aksi halde varsayılan; üst sınır 2 147 483 647)

Hepsi opsiyoneldir; `B/.env` ya da Fly'a girilir; kullanıldığı yer `app.js:84` (`_envMs`) ve `app.js:385-395`.

| Değişken | Varsayılan | Not |
|---|---|---|
| `JOB_DLQ_INTERVAL_MS` | `60000` | DLQ izleme |
| `JOB_REPUTATION_DECAY_DELAY_MS` / `_INTERVAL_MS` | `30000` / `86400000` | |
| `JOB_REWARD_RECORDER_INTERVAL_MS` | `3600000` | |
| `JOB_STATS_SNAPSHOT_DELAY_MS` / `_INTERVAL_MS` | `60000` / `86400000` | |
| `JOB_SENSITIVE_CLEANUP_DELAY_MS` / `_INTERVAL_MS` | `120000` / `1800000` | |
| `JOB_USER_BANK_RISK_CLEANUP_DELAY_MS` / `_INTERVAL_MS` | `150000` / `21600000` | |
| `JOB_RECONCILIATION_ENABLED` | prod: açık (`false` kapatır); diğer: kapalı (`true` açar) | `app.js:493-494` |
| `JOB_RECONCILIATION_INTERVAL_MS` | `600000` | |
| `USER_BANK_RISK_CLEANUP_CURSOR_BATCH_SIZE` | `200` | `jobs/cleanupUserBankRiskMetadata.js:25` |

### 3.11 Önbellek / limit / referans kur (hepsi opsiyonel)

| Değişken | Varsayılan | Ne işe yarar | Kullanıldığı yer |
|---|---|---|---|
| `CONFIG_CACHE_TTL_SECONDS` | `3600` | Protokol config mirror önbelleği | `services/protocolConfig.js:31` |
| `MARKET_CACHE_TTL_MS` | `10000` (`NODE_ENV=test` iken `0`) | `GET /api/orders` yanıt önbelleği; `0` kapatır | `routes/orders.js:298` |
| `RATE_LIMIT_TIER_CACHE_TTL_SECONDS` | `120` | Rate limiter tier önbelleği | `middleware/rateLimiter.js:167` |
| `REFERENCE_TICKER_REFRESH_INTERVAL_MS` | `120000` | Referans kur yenileme aralığı | `app.js:479` |
| `REFERENCE_TICKER_CRYPTO_TTL_SECONDS` | `120` | Kripto kur önbelleği | `services/referenceTicker.js:20` |
| `REFERENCE_TICKER_FIAT_TTL_SECONDS` | `21600` | Fiat kur önbelleği | `referenceTicker.js:21` |
| `REFERENCE_TICKER_LAST_GOOD_TTL_SECONDS` | `604800` | Son-iyi önbellek ömrü | `referenceTicker.js:22` |
| `REFERENCE_TICKER_MAX_STALE_SECONDS` | `86400` | Bundan eski satırlar son-iyiden de düşer | `referenceTicker.js:28` |

### 3.12 Testnet istisnaları

Tek istisna `ALLOW_ENV_KMS_ON_TESTNET` (`encryption.js:57-63`). Üç koşul **birlikte** doğru olmalı: `NODE_ENV=production` + `EXPECTED_CHAIN_ID=84532` +
`ALLOW_ENV_KMS_ON_TESTNET=yes`; o zaman prod'da `KMS_PROVIDER=env` + `MASTER_ENCRYPTION_KEY` kabul edilir. Açılışta RPC'nin gerçekten 84532 olduğu doğrulanır
(`encryption.js:247-268`, `:279`) ve her başlatmada büyük uyarı loglanır. Mainnet'te (8453) `yes` olsa bile başlatma hata verir. Gerçek PII girilmemeli.
Workflow bu üçlüyü kendisi yazar (bkz. 7.1). Sepolia için bunun dışındaki prod kuralları aynen geçerlidir: `rediss://`, gerçek `SIWE_DOMAIN`, `ARAF_DEPLOYMENT_BLOCK`.

---

## 4. Frontend (`frontend/.env` / Vercel build-env)

Vite yalnız `VITE_*` değişkenlerini tarayıcı paketine gömer. **13 değişken okunuyor** (+ Vite'ın yerleşik `import.meta.env.PROD` / `DEV` değerleri).
Değerler **build sırasında** sabitlenir; Vercel'de değişiklik için yeniden build gerekir.

| Değişken | Ne işe yarar | Zorunlu mu? | Y | S | M | Nereye | Kullanıldığı yer |
|---|---|---|---|---|---|---|---|
| `VITE_API_URL` | Backend API tabanı (`/api` eklenir) | Opsiyonel. Dev boşsa `http://localhost:4000/api`; **prod'da mutlak URL build'i bozar**, boş bırakın (`/api` → `vercel.json` rewrite) | `http://localhost:4000` | **boş** | **boş** | F/.env (yerel); Vercel'de girmeyin | `app/apiConfig.js:22-32`, `App.jsx:29` |
| `VITE_ESCROW_ADDRESS` | Escrow kontrat adresi; sıfır/boş ise kontrat aksiyonları kapanır | Her zaman (yoksa env hata bandı) | deploy çıktısı | Sepolia escrow | Mainnet escrow | F/.env, Vercel | `App.jsx:31`, `hooks/useArafContract.js:117` |
| `VITE_USDT_ADDRESS` | USDT token adresi | Her zaman | mock USDT | Sepolia USDT | Base USDT | F/.env, Vercel | `App.jsx:39`, `contexts/profile/RewardsPanel.jsx:10` |
| `VITE_USDC_ADDRESS` | USDC token adresi | Her zaman | mock USDC | Sepolia USDC | Base USDC | F/.env, Vercel | `App.jsx:40`, `RewardsPanel.jsx:11` |
| `VITE_REVENUE_VAULT_ADDRESS` | Rewards vault adresi (mirror/salt-okunur) | Rewards ekranı için; yoksa kapalı | boş | `0x…40 hex` | `0x…40 hex` | F/.env, Vercel | `hooks/useRewardsContract.js:9`, `App.jsx:402` |
| `VITE_REWARDS_ADDRESS` | Rewards kontratı adresi | Rewards ekranı için | boş | `0x…40 hex` | `0x…40 hex` | F/.env, Vercel | `useRewardsContract.js:8`, `App.jsx:403` |
| `VITE_REWARDS_VAULT_ADDRESS` | `VITE_REVENUE_VAULT_ADDRESS` boşsa kullanılan eski takma ad | Önerilmez | boş | **kullanma** | **kullanma** | (bkz. 6) | `App.jsx:402` (yalnız burada) |
| `VITE_TARGET_CHAIN` | Production build'in zinciri: `base` / `base-sepolia`; bilinmeyen değer uyarı verir ve `base`'e düşer; dev'de etkisiz | Opsiyonel (`base`) | gerekmez | `base-sepolia` | `base` (ya da boş) | Vercel (build) | `app/chainPolicy.js:21`, `main.jsx:62` |
| `VITE_RPC_URL` | Birincil RPC (public RPC yedek kalır); http(s) olmayan değer yok sayılır | Opsiyonel (public RPC) | boş | opsiyonel | opsiyonel | F/.env, Vercel | `main.jsx:61`, `app/rpcTransport.js` |
| `VITE_ENABLE_UI_LAB` | `true` ise UI Lab senaryo ekranı production build'e de girer | Opsiyonel (`false`); public sitede `false` | `false` | `false` | `false` | F/.env, Vercel | `app/uiLab.js:6-7`, `:13` |
| `VITE_SOCIAL_GITHUB` | Sosyal bağlantı: GitHub | Opsiyonel (proje repo URL'si) | boş | boş | boş | F/.env, Vercel | `app/AppViews.jsx:79` |
| `VITE_SOCIAL_TWITTER` | Sosyal bağlantı: X/Twitter | Opsiyonel (boşsa gizli) | boş | boş | boş | F/.env, Vercel | `AppViews.jsx:80` |
| `VITE_SOCIAL_FARCASTER` | Sosyal bağlantı: Farcaster | Opsiyonel (boşsa gizli) | boş | boş | boş | F/.env, Vercel | `AppViews.jsx:81` |

Yerelde Sepolia build'i için `npm run build:frontend:testnet` (`package.json:12`) `VITE_TARGET_CHAIN=base-sepolia` verir. `contracts/scripts/deploy.js` yalnız local ağda `VITE_ESCROW_ADDRESS`, `VITE_USDT_ADDRESS`, `VITE_USDC_ADDRESS` değerlerini `frontend/.env`'e kendisi yazar (`deploy.js:274-299`, `:440-441`). Public ağda yazmaz.

---

## 5. Gizli mi? (🔒)

| Grup | Değişkenler | Kural |
|---|---|---|
| Özel anahtar / token | `DEPLOYER_PRIVATE_KEY`, `RELAYER_PRIVATE_KEY`, `FLY_API_TOKEN`, `VERCEL_TOKEN` | Asla repoya, log'a ya da frontend'e. Deployer ve relayer farklı, düşük bakiyeli cüzdan olsun. |
| Sır / token | `JWT_SECRET`, `MASTER_ENCRYPTION_KEY` (Sepolia'da düz Fly secret olarak durur; yalnız testnet, gerçek PII yok), `AWS_ENCRYPTED_DATA_KEY`, `VAULT_TOKEN`, `VAULT_ENCRYPTED_DATA_KEY`, `READY_INTERNAL_TOKEN` | Fly secrets / `.env`; repoya girmez. |
| URL içinde anahtar/şifre | `MONGODB_URI`, `REDIS_URL`, `BASE_RPC_URL`, `BASE_WS_RPC_URL`, `BASE_SEPOLIA_RPC_URL` | Alchemy anahtarı ve DB/Redis şifresi URL'de durur; sır gibi davranın. |
| API anahtarı | `BASESCAN_API_KEY`, `CMC_API_KEY` | Düşük risk ama paylaşmayın. |

**Hiçbiri `VITE_*` olarak frontend'e konmamalıdır.** `VITE_*` değerleri build sırasında JavaScript paketine **düz metin olarak gömülür**; siteyi açan herkes
görebilir (kaynak haritası kapalı olsa da `frontend/vite.config.js:28` yalnız kaynak haritasını kapatır, değer gömülmesini engellemez). Bu yüzden `VITE_*` içinde yalnız herkese açık bilgi
(kontrat adresi, public RPC, sosyal link) olmalı. Admin cüzdan listesi de bu yüzden frontend'e konmaz; `VITE_ADMIN_WALLETS` kaldırılmıştır
(`app/AppViews.jsx:206`), admin bilgisi `/api/auth/me` içindeki `isAdmin`'den gelir.
Adresler (`ARAF_ESCROW_ADDRESS`, token adresleri) sır değildir.

---

## 6. Eski / kullanılmayan / takma adlar

### 6.1 Örnekte ya da belgede olup kodda OKUNMAYANLAR

| Değişken | Nerede geçiyor | Durum |
|---|---|---|
| `REWARD_BPS`, `CONFIRM_CONFIGURE_REWARDS` | `contracts/.env.example:71-72`; `docs/TR/DEPLOYMENT_GUIDE.md` | Hiçbir script okumaz. Yalnız belge/regresyon testi için tutulur (`test/contracts/rewards.goLive.readiness.test.js:103-104`). Silmeyin ama bir şeyi değiştirmez. |
| `REWARDS_READ_ONLY`, `REWARDS_SOURCE` | `backend/.env.example:157-158` | Okunmaz; rewards yüzeyi her zaman salt-okunur mirror'dır. Regresyon testi için tutulur. |
| `AWS_KMS_KEY_ARN` (`KMS_KEY_ARN`) | `docs/TR/MAINNET_READINESS_CHECKLIST.md:54`; `backend/.env.example:66` (okunmaz der) | Okunmaz; anahtar kimliği `CiphertextBlob` içindedir. Girmeyin. |
| `MIN_REWARD_BPS`, `MAX_REWARD_BPS` | `docs/TR/REWARDS_ROLLOUT.md` | Kodda env olarak okunmaz (kontrat sabiti; **doğrulanmadı**, env olarak okunmadığı grep ile görüldü). |
| `VITE_ADMIN_WALLETS` | Eski belgeler | Kaldırıldı (`AppViews.jsx:206`). |
| `BASESCAN_API_KEY` (GitHub secret olarak) | `docs/DEPLOY_BASE_SEPOLIA.md:14` | Hiçbir workflow okumaz; yalnız elle `hardhat verify` için `contracts/.env`'de anlamlı. |
| `NODE_PATH` | `contracts/hardhat.config.js:9-10` | Okunmaz, script kendisi ayarlar; sizin girmeniz gerekmez. |

### 6.2 Takma adlar (hangisi tercih edilir)

| Tercih edilen (kanonik) | Takma ad | Davranış |
|---|---|---|
| `MONGODB_URI` | `MONGO_URI` | Yalnız 3 migration script'i ikisine de bakar (`normalizeIdentityFields.js:166`, `dedupeRevenueEvents.js:98`, `backfillTerminalTradeStats.js:78`). **Uygulama (`config/db.js:34`) yalnız `MONGODB_URI` okur.** Hep `MONGODB_URI` kullanın. |
| `BASE_MAINNET_USDT/USDC_ADDRESS` | `MAINNET_USDT/USDC_ADDRESS` | Yalnız 8453'te kabul edilir (backend `tokenEnv.js:66`; contracts `deploy.js:115-116`). Base Sepolia'da prod'da hata (`tokenEnv.js:84-92`, `deploy.js:125`). `BASE_MAINNET_*` kullanın. |
| `BASE_<ZİNCİR>_USDT/USDC_ADDRESS` | `USDT_ADDRESS` / `USDC_ADDRESS` | Backend'de yalnız prod dışında, uyarıyla (`tokenEnv.js:74-76`). Contracts'ta `rewardsOps.js:30-31` rewards işleri için bunları ayrıca okur (ayrı bir anlam; manifest yoksa yedek). |
| `VITE_REVENUE_VAULT_ADDRESS` | `VITE_REWARDS_VAULT_ADDRESS` | Yalnız `App.jsx:402` yedek olarak okur; `useRewardsContract.js:9` okumaz. `VITE_REVENUE_VAULT_ADDRESS` kullanın. |
| `ARAF_DEPLOYMENT_BLOCK` | `WORKER_START_BLOCK` | İkisi de aynı iş; `??` ile `ARAF_DEPLOYMENT_BLOCK` öncelikli (`eventListener.js:1095`, `health.js:146`). |
| `IDENTITY_NORMALIZATION_GUARD` | `PII_IDENTITY_NORMALIZATION_GUARD` | İkincisi PII route'ları içindir; yoksa birinciye düşer (`routes/pii.js:80`). |

---

## 7. Workflow'un otomatik ayarladıkları

İki workflow var: `deploy-base-sepolia.yml` (kontrat + Fly + opsiyonel Vercel) ve `deploy-runtime-base-sepolia.yml` (kontratı yeniden deploy etmeden Fly ve/veya Vercel).
`deployRewards.js` workflow'lara dahil değildir. Kullanıcı aşağıdaki değerleri **elle girmez**.

### 7.1 Fly secrets: workflow'un yazdıkları (`flyctl secrets import --stage`, sonra `flyctl deploy`)

Tam deploy: `deploy-base-sepolia.yml:141-178` · runtime: `deploy-runtime-base-sepolia.yml:128-166`. İkisinde aynı 19 sabit satır + 2 koşullu satır.

| Fly değişkeni | Değer nereden | Satır (tam / runtime) |
|---|---|---|
| `NODE_ENV` | sabit `production` | 157 / 145 |
| `JWT_EXPIRES_IN`, `PII_TOKEN_EXPIRES_IN` | sabit `15m` | 161-162 / 149-150 |
| `KMS_PROVIDER` | sabit `env` | 163 / 151 |
| `ALLOW_ENV_KMS_ON_TESTNET` | sabit `yes` | 164 / 152 |
| `EXPECTED_CHAIN_ID` | sabit `84532` | 166 / 154 |
| `ARAF_ESCROW_ADDRESS` | tam: deploy manifestinden (`escrowAddress`); runtime: variable/girdi | 169 / 157 |
| `BASE_SEPOLIA_USDT_ADDRESS`, `BASE_SEPOLIA_USDC_ADDRESS` | tam: manifest `tokens[]`; runtime: variable/girdi | 170-171 / 158-159 |
| `ARAF_DEPLOYMENT_BLOCK` | tam: `deployTxHash` receipt bloğu; runtime: variable/girdi (0 olamaz) | 172 / 160 |
| `SIWE_DOMAIN` | `FRONTEND_DOMAIN` variable | 173 / 161 |
| `SIWE_URI`, `ALLOWED_ORIGINS` | `https://$FRONTEND_DOMAIN` | 174-175 / 162-163 |
| `BASE_RPC_URL` | GitHub secret `BASE_SEPOLIA_RPC_URL` (ad değişir) | 167 / 155 |
| `BASE_WS_RPC_URL` | GitHub secret `BASE_SEPOLIA_WS_RPC_URL` (ad değişir) | 168 / 156 |
| `MONGODB_URI`, `REDIS_URL`, `JWT_SECRET`, `MASTER_ENCRYPTION_KEY` | aynı adlı GitHub secret | 158-160, 165 / 146-148, 153 |
| `RELAYER_PRIVATE_KEY`, `ADMIN_WALLETS` | GitHub secret / variable; **boşsa yazılmaz** | 176-177 / 164-165 |

Workflow'un yazmadığı backend değişkenleri (hepsi opsiyonel/varsayılanlı): `ARAF_REVENUE_VAULT_ADDRESS`, `ARAF_REWARDS_ADDRESS` (rewards workflow dışı, bu yüzden reward mirror ve recorder pasif kalır),
`ARAF_TRACKED_TOKENS`, `WORKER_*`, `JOB_*`, `READY_INTERNAL_TOKEN`, `AWS_*`, `VAULT_*` ve diğer ayar değişkenleri.

### 7.2 Vercel build-env: workflow'un verdikleri (`vercel deploy --prod --build-env ...`)

Tam: `deploy-base-sepolia.yml:211-228` · runtime: `deploy-runtime-base-sepolia.yml:207-224` (yalnız `deploy_frontend=true`).

| Vercel değişkeni | Değer | Satır (tam / runtime) |
|---|---|---|
| `VITE_TARGET_CHAIN` | sabit `base-sepolia` | 222 / 218 |
| `VITE_ESCROW_ADDRESS` | deploy manifesti ya da variable/girdi | 223 / 219 |
| `VITE_USDT_ADDRESS`, `VITE_USDC_ADDRESS` | aynı kaynak | 224-225 / 220-221 |
| `VITE_RPC_URL` | GitHub variable `VITE_RPC_URL`; boşsa verilmez | 227 / 223 |

`VITE_API_URL` bilerek verilmez (production'da mutlak URL reddedilir; `/api` `vercel.json` rewrite'ından gider). `VITE_REVENUE_VAULT_ADDRESS`/`VITE_REWARDS_ADDRESS` de verilmez.

### 7.3 Contracts: deploy adımına env olarak verilenler (`contracts/.env` yazılmaz)

`deploy-base-sepolia.yml:87-100`: `CONFIRM_PUBLIC_DEPLOY=yes` (sabit), `DEPLOYER_PRIVATE_KEY`, `BASE_SEPOLIA_RPC_URL` (secret), `TREASURY_ADDRESS`, `FINAL_OWNER_ADDRESS`,
`BASE_SEPOLIA_USDT_ADDRESS`, `BASE_SEPOLIA_USDC_ADDRESS` (variable). Verilmeyen: `BASESCAN_API_KEY` (workflow verify yapmaz).

### 7.4 Yalnız GitHub'da anlamı olan adlar (kodda okunmaz)

| Ad | Tür | Ne |
|---|---|---|
| `FLY_API_TOKEN` | secret | Fly deploy token'ı (`deploy-base-sepolia.yml:145`, `:183`) |
| `FLY_APP_NAME` | variable | Fly uygulama adı; varsayılan `araf-protocol-backend` (`:29`). `frontend/vercel.json:5` ile uyuşmazsa workflow durur (`:204`) |
| `FRONTEND_DOMAIN` | variable | `SIWE_DOMAIN`, `SIWE_URI`, `ALLOWED_ORIGINS` buradan türer (`:30`, `:173-175`) |
| `BASE_SEPOLIA_WS_RPC_URL` | secret | Fly'da `BASE_WS_RPC_URL` olur |
| `VERCEL_TOKEN`, `VERCEL_ORG_ID`, `VERCEL_PROJECT_ID` | secret | Vercel CLI kimliği (`:31-32`, `:197-202`) |

---

## 8. Tutarsızlıklar

Düzeltilenler "düzeltildi" ile işaretlidir; diğerleri açıktır. (Önceki taslaktaki "deploy workflow'u yok" ve "`ALLOW_ENV_KMS_ON_TESTNET` kodda yok" maddeleri güncel ana dalda geçersizdir ve kaldırıldı.)

1. **[düzeltildi: bkz. bu dalın commit'i]** **Belgeler yeni testnet KMS istisnasını bilmiyor.** `backend/.env.example:55` ve `:10-11` prod'da `KMS_PROVIDER=env`'in "testnet dahil" reddedildiğini söyler; `docs/TR/DEPLOYMENT_GUIDE.md:261`, `:339` (aws örneği) ve ortam tablosu (`KMS_PROVIDER` testnet = `aws`/`vault`) ile `docs/EN/DEPLOYMENT_GUIDE.md:339` istisnayı anmaz. Oysa kod (`encryption.js:57-63`) ve workflow'lar (`deploy-base-sepolia.yml:163-164`) Sepolia'da `env` + `ALLOW_ENV_KMS_ON_TESTNET=yes` kullanır. `ALLOW_ENV_KMS_ON_TESTNET` yalnız `backend/.env.example:77` (yorum satırı) ve `DEPLOY_BASE_SEPOLIA.md:96`'da geçer.
2. **[düzeltildi: iki workflow'un Validate adımı]** **Workflow doğrulaması koddan gevşek.** `deploy-base-sepolia.yml:75` `JWT_SECRET` için yalnız uzunluk (≥64) bakar; backend ayrıca entropi ≥3.5 ve placeholder reddi uygular (`siwe.js:94-103`), yani workflow geçip backend açılışta çökebilir. `BASE_SEPOLIA_WS_RPC_URL` workflow'da zorunlu ve `ws*` kabul (`:65`, `:72`); backend'de `BASE_WS_RPC_URL` opsiyonel ve yalnız `wss://` kullanır, `ws://` sessizce HTTP'ye düşer (`eventListener.js:619-621`).
3. **[kısmen düzeltildi: özet artık kopyalanabilir `gh variable set` satırları yazar; otomatik yazım yok, çünkü GITHUB_TOKEN repo variable yazamaz]** **Tam deploy workflow'u adresleri kalıcı yapmıyor.** `ARAF_ESCROW_ADDRESS` ve `ARAF_DEPLOYMENT_BLOCK` yalnız özet sayfasına yazılır (`deploy-base-sepolia.yml:238-243`); runtime workflow bunları variable olarak ister ve yoksa durur (`deploy-runtime-base-sepolia.yml:85-89`). Aradaki elle adım unutulabilir.
4. **`MONGO_URI` yalnız migration'larda geçerli.** `config/db.js:34` yalnız `MONGODB_URI` okur; `MONGO_URI` yalnız `migrations/normalizeIdentityFields.js:166`, `dedupeRevenueEvents.js:98`, `backfillTerminalTradeStats.js:78`'de yedek.
5. **Frontend takma adı yarım.** `VITE_REWARDS_VAULT_ADDRESS` yalnız `App.jsx:402`'de okunur; `hooks/useRewardsContract.js:9` yalnız `VITE_REVENUE_VAULT_ADDRESS`'e bakar.
6. **[düzeltildi: örnekte yalnız-yerel uyarısı eklendi; vercel.json'un elle güncellenmesi açık]** **`frontend/.env.example:11` `VITE_API_URL=http://localhost:4000` içerir; production'da mutlak URL hatadır** (`app/apiConfig.js:27-32`, `App.jsx:29`). Örnek olduğu gibi Vercel'e taşınmamalı (workflow zaten vermez). Backend adresi hâlâ `frontend/vercel.json:5`'e sabit; workflow bunu `FLY_APP_NAME` ile karşılaştırıp uyuşmazlıkta durur (`deploy-base-sepolia.yml:204`), ama dosya elle güncellenmeli.
7. **[düzeltildi]** **`docs/DEPLOY_BASE_SEPOLIA.md:96-97` eskimiş.** Backend istisnasının ve `VITE_TARGET_CHAIN`'in "ayrı iş" olduğunu, yoksa backend'in başlamayacağını söyler; ikisi de artık kodda var (`encryption.js:57-63`, `app/chainPolicy.js:21`). Aynı belge `:14` `BASESCAN_API_KEY`'i GitHub secret olarak listeler ama hiçbir workflow okumaz.
8. **[kısmen düzeltildi: zincir politikası notu güncellendi; rehberin workflow'dan söz etmemesi açık]** **`docs/TR/DEPLOYMENT_GUIDE.md:395` hâlâ eskimiş.** "Production build yalnız Base Mainnet'i açar, hosted Sepolia frontend'i production olmayan build ister" der; oysa `app/chainPolicy.js:34-39` ve `main.jsx:62` `VITE_TARGET_CHAIN=base-sepolia` ile production build'de yalnız Sepolia'yı açar (`:417` doğru anlatır, `:395` çelişir). Rehber ayrıca elle `fly secrets set`/`.env.production` akışını anlatır, workflow'dan söz etmez.
9. **[düzeltildi: contracts kısmı; `contracts/.env.example` yorumu "yalnız go-live checklist testi için" olarak netleştirildi]** **Örnekte olup kodda okunmayanlar:** `REWARD_BPS`, `CONFIRM_CONFIGURE_REWARDS` (`contracts/.env.example:71-72`), `REWARDS_READ_ONLY`, `REWARDS_SOURCE` (`backend/.env.example:157-158`) etkisiz, yalnız testler için duruyor. `docs/TR/MAINNET_READINESS_CHECKLIST.md:54` `AWS_KMS_KEY_ARN`'ı gerekli env gibi listeler; `backend/.env.example:66` okunmadığını söyler.
10. **[düzeltildi: contracts kısmı; `CONFIRM_SWITCH_TREASURY_TO_VAULT` açıklamalı eklendi, `CONFIRM_FRESH_ESCROW_DEPLOY` yorumu netleşti, NODE_ENV/CODESPACE_NAME notu eklendi]** **Kodda okunup örnekte olmayan:** `CONFIRM_SWITCH_TREASURY_TO_VAULT` (`rewardsOps.js:38`, yalnız reddetmek için), `NODE_ENV` ve `CODESPACE_NAME` contracts tarafında (`deploy.js:108`, `:301`). `contracts/.env.example:56` `CONFIRM_FRESH_ESCROW_DEPLOY`'u bir onay gibi sunar; kod public'te asla yeni escrow deploy etmez, yalnız hata metnini değiştirir (`deployRewards.js:73-77`).
11. **`backend/.env.example` kopyalanınca olduğu gibi çalışmaz (bilinçli):** `JWT_SECRET` örneği 60 karakter (`:30`), kod en az 64 ister (`siwe.js:95`); `MASTER_ENCRYPTION_KEY` örneği (`:75`) 64 hex değil (`encryption.js:114`); `EXPECTED_CHAIN_ID=8453` örneği (`:83`) yerelde RPC farklıysa uyuşmazlık hatası verir (`expectedChain.js:55-58`).
12. **Prod'da fail-fast olup örnekte az vurgulananlar:** `JWT_SECRET` prod'a özel değil, **her ortamda** zorunlu (`siwe.js:94`, modül yüklenirken; `/ready` de `health.js:96-99` ile ister). Yalnız-localhost `ALLOWED_ORIGINS` açılışta süreci durdurur (`app.js:161-163`). `ARAF_DEPLOYMENT_BLOCK`/`WORKER_START_BLOCK` ve Redis checkpoint yoksa prod'da worker `throw` eder (`eventListener.js:1098-1100`).
13. **Rewards workflow dışı.** Workflow'lar `ARAF_REVENUE_VAULT_ADDRESS`/`ARAF_REWARDS_ADDRESS` (Fly) ve `VITE_REVENUE_VAULT_ADDRESS`/`VITE_REWARDS_ADDRESS` (Vercel) yazmaz; rewards ayrı operasyon (`DEPLOY_BASE_SEPOLIA.md:5`). Sepolia demosunda reward mirror ve recorder, bu değişkenler elle eklenene kadar pasif kalır.
