# Araf Protokol: Ortam Değişkenleri (env) Başvuru Belgesi

> Bu belge koddan çıkarılmıştır (commit `7407cb4` tabanı). Her değişkenin en az bir kullanım yeri açılıp okunmuştur.
> Gerçek değer/sır yazılmaz; yalnız biçim örnekleri verilir. Emin olunamayan yerler "doğrulanmadı" diye işaretlidir.
> Kaynaklar: `contracts/hardhat.config.js`, `contracts/scripts/*`, `backend/scripts/**`, `frontend/src/**`,
> `.github/workflows/ci.yml`, `backend/fly.toml`, `backend/Dockerfile`, `frontend/vercel.json`, `*/.env.example`,
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

Değişkenler 4 yere girilir. Hangi paketin değişkeni olduğuna göre yer değişir:

| Nereye | Ne için | Nasıl |
|---|---|---|
| **Yerel geliştirme** | `contracts/.env`, `backend/.env`, `frontend/.env` | Her biri kendi `.env.example` dosyasından kopyalanır (`cp .env.example .env`). |
| **GitHub** (Secrets / Variables) | Deploy workflow'u için | **Repoda deploy workflow'u YOK** (bkz. 7 ve 8.1). Elle girilmesi gerekenler aşağıdaki kutuda. |
| **Fly.io** (backend production) | Backend'in tüm değişkenleri | Bugün elle: `fly secrets set KEY=VALUE`. `PORT` ve `NODE_ENV` zaten `backend/fly.toml [env]` içinden gelir. |
| **Vercel** (frontend build) | Yalnız `VITE_*` | Bugün elle: Vercel Dashboard > Settings > Environment Variables. Build sırasında tarayıcı paketine gömülür. |

Kısaltmalar (tablolardaki "Nereye girilir" sütunu):
`C/.env` = `contracts/.env` · `B/.env` = `backend/.env` · `F/.env` = `frontend/.env` · `Fly` = `fly secrets set` ·
`Vercel` = Vercel env · `terminal` = komut satırında geçici (`CONFIRM_...=yes npx hardhat ...`).

> **Base Sepolia demosu için senin elle girmen gereken liste** (deploy workflow'u olmadığı için hepsi elle; kaynak: kod + `docs/TR/DEPLOYMENT_GUIDE.md` Adım 1-4)
>
> **A) Kontrat deploy'u: `contracts/.env` (7 zorunlu)**
> `DEPLOYER_PRIVATE_KEY`, `BASE_SEPOLIA_RPC_URL`, `TREASURY_ADDRESS`, `FINAL_OWNER_ADDRESS` (treasury'den farklı),
> `BASE_SEPOLIA_USDT_ADDRESS`, `BASE_SEPOLIA_USDC_ADDRESS`, `CONFIRM_PUBLIC_DEPLOY=yes`. (Opsiyonel: `BASESCAN_API_KEY`.)
>
> **B) Backend: Fly secrets (15 zorunlu)**
> `MONGODB_URI`, `REDIS_URL` (`rediss://`), `JWT_SECRET`, `KMS_PROVIDER=aws`, `AWS_ENCRYPTED_DATA_KEY`, `BASE_RPC_URL`,
> `EXPECTED_CHAIN_ID=84532`, `ARAF_ESCROW_ADDRESS`, `BASE_SEPOLIA_USDT_ADDRESS`, `BASE_SEPOLIA_USDC_ADDRESS`,
> `SIWE_DOMAIN`, `SIWE_URI`, `ALLOWED_ORIGINS`, `ARAF_DEPLOYMENT_BLOCK` (Redis'te checkpoint yoksa).
> Önerilen: `BASE_WS_RPC_URL`, `RELAYER_PRIVATE_KEY`, `ADMIN_WALLETS`, `ARAF_REVENUE_VAULT_ADDRESS`, `ARAF_REWARDS_ADDRESS`, `AWS_REGION` (varsayılan `eu-west-1`).
> Not: AWS KMS'i çözmek için AWS kimlik bilgileri de gerekir; kodda geçmez, SDK'nın varsayılan zincirinden okunur (**doğrulanmadı**, bkz. 8.2).
>
> **C) Frontend: Vercel (4 zorunlu)**
> `VITE_TARGET_CHAIN=base-sepolia`, `VITE_ESCROW_ADDRESS`, `VITE_USDT_ADDRESS`, `VITE_USDC_ADDRESS`.
> `VITE_API_URL` **boş bırakılmalı** (production'da mutlak URL build'i bozar). Opsiyonel: `VITE_RPC_URL`, `VITE_REVENUE_VAULT_ADDRESS`, `VITE_REWARDS_ADDRESS`.
>
> Toplam: 7 + 15 + 4 = **26 zorunlu giriş**.

---

## 2. Contracts (`contracts/.env`)

Hardhat `contracts/.env` dosyasını yükler. Ağ, env ile değil `--network <hardhat|localhost|base-sepolia|base>` ile seçilir.
Bu paketteki hiçbir değişken Fly/Vercel'e girmez. **37 değişken okunuyor** (+ 2 yalnız örnekte/belgede: bkz. 6).

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
değerler Fly secrets'tan gelir. **88 değişken okunuyor.** Hiçbir backend değişkeni `VITE_*` olarak frontend'e konmaz.

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

Prod'da `KMS_PROVIDER=env` **reddedilir, testnet dahil** (`encryption.js:70`, `:205-207`). Açılışta KMS self-test çalışır (`app.js:360`).

| Değişken | Ne işe yarar | Zorunlu mu? | Y | S | M | Nereye | Kullanıldığı yer |
|---|---|---|---|---|---|---|---|
| `KMS_PROVIDER` | `env` (yalnız dev) / `aws` / `vault` | Prod'da `aws` ya da `vault`; varsayılan `env` | `env` | `aws` | `aws` | B/.env, Fly | `encryption.js:65`, `:203` |
| 🔒 `MASTER_ENCRYPTION_KEY` | Ana şifreleme anahtarı (64 hex; ilk 64 karakter) | `KMS_PROVIDER=env` iken (yalnız dev) | `randomBytes(32)` hex | **konma** | **konma** | B/.env | `encryption.js:77` |
| 🔒 `AWS_ENCRYPTED_DATA_KEY` | AWS KMS ile şifreli data key (base64 CiphertextBlob) | `KMS_PROVIDER=aws` iken | gerekmez | base64 | base64 | Fly | `encryption.js:104`, `:213` |
| `AWS_REGION` | AWS bölgesi | Opsiyonel (`eu-west-1`) | boş | `eu-west-1` | `eu-west-1` | Fly | `encryption.js:103` |
| `VAULT_ADDR` | Vault adresi | `KMS_PROVIDER=vault` iken | gerekmez | `https://vault…:8200` | aynı | Fly | `encryption.js:145`, `:218` |
| 🔒 `VAULT_TOKEN` | Vault erişim token'ı | `KMS_PROVIDER=vault` iken | gerekmez | token | token | Fly | `encryption.js:146`, `:218` |
| `VAULT_KEY_NAME` | Transit anahtar adı | Opsiyonel (`araf-master-key`) | gerekmez | boş | boş | Fly | `encryption.js:147` |
| 🔒 `VAULT_ENCRYPTED_DATA_KEY` | Sabit wrapped data key (`vault:v1:…`) | `KMS_PROVIDER=vault` iken (yoksa fail-closed) | gerekmez | `vault:v1:…` | aynı | Fly | `encryption.js:148`, `:221` |

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

Kodda testnet'e özel bir env istisnası **yoktur**. Backend `fly.toml` yüzünden Sepolia'da da `NODE_ENV=production` çalışır;
dolayısıyla Sepolia için de: gerçek KMS (`aws`/`vault`), `rediss://`, gerçek `SIWE_DOMAIN` ve `ARAF_DEPLOYMENT_BLOCK` gerekir.
Sepolia'ya özgü olan yalnız değerlerdir: `EXPECTED_CHAIN_ID=84532` ve `BASE_SEPOLIA_*` token adresleri. Bkz. 8.2.

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

Yerelde `contracts/scripts/deploy.js` yalnız local ağda `VITE_ESCROW_ADDRESS`, `VITE_USDT_ADDRESS`, `VITE_USDC_ADDRESS` değerlerini `frontend/.env`'e kendisi yazar (`deploy.js:274-299`, `:440-441`). Public ağda yazmaz.

---

## 5. Gizli mi? (🔒)

| Grup | Değişkenler | Kural |
|---|---|---|
| Özel anahtar | `DEPLOYER_PRIVATE_KEY`, `RELAYER_PRIVATE_KEY` | Asla repoya, log'a ya da frontend'e. Deployer ve relayer farklı, düşük bakiyeli cüzdan olsun. |
| Sır / token | `JWT_SECRET`, `MASTER_ENCRYPTION_KEY`, `AWS_ENCRYPTED_DATA_KEY`, `VAULT_TOKEN`, `VAULT_ENCRYPTED_DATA_KEY`, `READY_INTERNAL_TOKEN` | Fly secrets / `.env`; repoya girmez. |
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

**Doğrulanan gerçek: repoda deploy workflow'u yoktur.** `.github/workflows/` altında yalnız `ci.yml` var; o da sadece test çalıştırır
(backend/frontend/contracts `npm test`, ABI drift), `secrets.*`, `vars.*`, Fly ya da Vercel adımı **içermez**. `docs/DEPLOY_BASE_SEPOLIA.md` dosyası da mevcut değildir.
Bu yüzden aşağıdaki "workflow otomatik hesaplar" listesi bugün **boştur**; her şey elle girilir:

| Değişken | Beklenen otomatik kaynak | Bugünkü gerçek durum |
|---|---|---|
| `ARAF_ESCROW_ADDRESS` | `contracts/deployments/base-sepolia.json` -> `escrowAddress` | Elle: deploy çıktısından Fly'a (guide Adım 3) |
| `ARAF_DEPLOYMENT_BLOCK` | Deploy blok numarası | Elle (guide Adım 3: `<DEPLOY_BLOK_NUMARASI>`) |
| `EXPECTED_CHAIN_ID` | `84532` / `8453` | Elle |
| `VITE_TARGET_CHAIN` | `base-sepolia` | Elle (Vercel env; `docs/TR/DEPLOYMENT_GUIDE.md:417`) |
| `ALLOW_ENV_KMS_ON_TESTNET` | Testnet'te `KMS_PROVIDER=env`'e izin | **Kodda yok**; hiçbir yerde okunmaz (bkz. 8.2) |

Otomatik olan tek şey `backend/fly.toml [env]` içindeki `PORT=4000` ve `NODE_ENV=production` ile yerelde `deploy.js`'in `frontend/.env`'e yazdığı 3 `VITE_*` adrestir.
`backend/Dockerfile` hiçbir env tanımlamaz. `frontend/vercel.json` env içermez (yalnız rewrite ve güvenlik başlıkları).

---

## 8. Tutarsızlıklar

Yalnız listelenmiştir; düzeltilmemiştir.

1. **Deploy workflow'u yok.** `.github/workflows/ci.yml` (tüm dosya) yalnız test çalıştırır. Bu belgenin görev tanımındaki "GitHub Secrets/Variables -> Fly/Vercel otomatik" modeli repoda uygulanmış değildir; ilgili deploy akışı `docs/TR/DEPLOYMENT_GUIDE.md:335-393` ile elle yapılıyor.
2. **`ALLOW_ENV_KMS_ON_TESTNET` kodda yok; Sepolia için `KMS_PROVIDER=env` çalışmaz.** `backend/fly.toml:12` `NODE_ENV=production` sabitler; `services/encryption.js:70` ve `:205-207` prod'da `env` sağlayıcıyı reddeder, `app.js:360` açılışta self-test çalıştırır. Yani Sepolia demosu da AWS KMS ya da Vault ister (`DEPLOYMENT_GUIDE.md:261`, `:575`). Ayrıca AWS KMS çözümlemesi için AWS erişim kimlik bilgileri (`AWS_ACCESS_KEY_ID`/`AWS_SECRET_ACCESS_KEY` ya da rol) gerekir; ne `.env.example`'da, ne `fly secrets set` örneğinde (`DEPLOYMENT_GUIDE.md:335-357`), ne kodda geçer (SDK varsayılan zinciri; **doğrulanmadı**).
3. **`MONGO_URI` yalnız migration'larda geçerli.** `config/db.js:34` yalnız `MONGODB_URI` okur; `MONGO_URI` yalnız `migrations/*.js:166/98/78` içinde yedek. Sadece `MONGO_URI` tanımlarsanız uygulama açılmaz, migration çalışır.
4. **Frontend takma adı yarım.** `VITE_REWARDS_VAULT_ADDRESS` yalnız `App.jsx:402`'de okunur; `hooks/useRewardsContract.js:9` yalnız `VITE_REVENUE_VAULT_ADDRESS`'e bakar. Yalnız takma ad girilirse arayüzün iki parçası farklı davranır.
5. **`frontend/.env.example:11` `VITE_API_URL=http://localhost:4000` içerir; production'da mutlak URL build/çalışma hatasıdır** (`app/apiConfig.js:27-32`, `App.jsx:29`). Örneği olduğu gibi Vercel'e taşımak siteyi bozar; Vercel'de boş bırakılmalı (`DEPLOYMENT_GUIDE.md:380`). Ayrıca backend adresi env değil, `frontend/vercel.json:5` içine sabit yazılıdır (`araf-protocol-backend.fly.dev`); Fly uygulaması yeniden adlandırılırsa dosya elle değişmelidir.
6. **`docs/TR/DEPLOYMENT_GUIDE.md:395` eskimiş.** "Production build yalnız Base Mainnet'i açar, hosted Sepolia frontend'i production olmayan build ister" der; ama `app/chainPolicy.js:34-39` ve `main.jsx:62` `VITE_TARGET_CHAIN=base-sepolia` ile production build'de yalnız Sepolia'yı açar (aynı belgenin `:417` satırı bunu doğru anlatır; `:395` ile çelişir).
7. **Örnekte olup kodda okunmayanlar:** `REWARD_BPS`, `CONFIRM_CONFIGURE_REWARDS` (`contracts/.env.example:71-72`), `REWARDS_READ_ONLY`, `REWARDS_SOURCE` (`backend/.env.example:157-158`) hiçbir kod yolunda etkili değil; yalnız test için duruyorlar. `docs/TR/MAINNET_READINESS_CHECKLIST.md:54` ise `AWS_KMS_KEY_ARN`'ı AWS için gerekli env gibi listeler; `backend/.env.example:66` ve `DEPLOYMENT_GUIDE.md:465` bunun okunmadığını söyler.
8. **Kodda okunup örnekte olmayan:** `CONFIRM_SWITCH_TREASURY_TO_VAULT` (`contracts/scripts/rewardsOps.js:38`, yalnız reddetmek için); `CODESPACE_NAME` (`deploy.js:301`, `.env.example`'da yok ama ortam tarafından verilir); `NODE_ENV` contracts tarafında (`deploy.js:108`) `contracts/.env.example`'da yok. `contracts/.env.example:56` `CONFIRM_FRESH_ESCROW_DEPLOY`'u bir onay gibi sunar; kod ise public'te asla yeni escrow deploy etmez, yalnız hata metnini değiştirir (`deployRewards.js:73-77`).
9. **`backend/.env.example` kopyalanınca olduğu gibi çalışmaz (bilinçli):** `JWT_SECRET` örneği 60 karakter (`:30`) ama kod en az 64 ister (`siwe.js:95`); `MASTER_ENCRYPTION_KEY` örneği (`:75`) 64 hex değil (`encryption.js:78`). Ayrıca `EXPECTED_CHAIN_ID=8453` örneği (`:83`) yerelde (31337 ya da Sepolia RPC) uyuşmazlık hatası verir (`expectedChain.js:55-58`); yerel için değeri RPC'nize göre değiştirin.
10. **Prod'da fail-fast olup örnek/belgede zayıf anlatılanlar:** `JWT_SECRET` prod'a özel değil, **her ortamda** zorunlu (`siwe.js:94`, modül yüklenirken; `/ready` de `health.js:96-99` ile her zaman ister). `ALLOWED_ORIGINS` yalnız-localhost kontrolü `/ready`'de değil, açılışta da süreci durdurur (`app.js:161-163`). `ARAF_DEPLOYMENT_BLOCK`/`WORKER_START_BLOCK` yokken Redis'te checkpoint de yoksa prod'da worker `throw` eder (`eventListener.js:1098-1100`); ilk kurulumda bu ikiliden biri mutlaka verilmeli, ama `fly.toml` ya da örnekte "PROD ZORUNLU" etiketi yalnız `backend/.env.example:105`'te var.
