# Base Sepolia Deploy (GitHub Actions)

İki workflow: `deploy-base-sepolia.yml` (kontrat + Fly backend + opsiyonel Vercel frontend) ve
`deploy-runtime-base-sepolia.yml` (kontrat deploy etmeden backend/frontend yeniden deploy).
Tam deploy, `deploy_rewards=true` ile revenue vault + rewards'ı da deploy edebilir (varsayılan kapalı; aşağıda güvenlik kilidi). Elle yol hâlâ geçerli: `npm --prefix contracts run deploy:rewards:base-sepolia`.

## Hangi workflow ne zaman?

| | `deploy-base-sepolia.yml` (tam deploy) | `deploy-runtime-base-sepolia.yml` (runtime) |
|---|---|---|
| Ne zaman | İlk kurulum; yeni escrow gerektiğinde (kontrat değişti); ilk kez ya da bilinçli olarak yeniden vault/rewards (`deploy_rewards=true`) | Kontrat aynı; backend/frontend kodu, secret ya da ayar değişti; vault/rewards adresini elle bağlamak |
| Kontrat | Library'ler + `ArafEscrow` (+ opsiyonel tUSDT, + opsiyonel vault/rewards) deploy eder | Deploy ETMEZ |
| Adres kaynağı | Bu çalıştırmanın manifest'leri (`deployments/base-sepolia*.json`); `deploy_rewards=false` iken vault/rewards için variable yedeği | Repo variable'ları (`ARAF_ESCROW_ADDRESS`, `ARAF_DEPLOYMENT_BLOCK`, `BASE_SEPOLIA_USDT/USDC_ADDRESS`, `ARAF_REVENUE_VAULT_ADDRESS`, `ARAF_REWARDS_ADDRESS`); dolu input override'ı önceliklidir |
| Fly secret / Vercel env | Ortak betik `.github/scripts/stage-runtime-env.sh` (aynı liste) | Aynı betik |
| Health | `/health` 200 zorunlu; `/ready` 503 `degraded:true` ise yalnız uyarı | Aynı |
| Geri alınamaz adım | Yeni escrow (eski adres terk edilir); `deploy_rewards=true` ise `vault.setRewards` (tek sefer) | Yok |

## Secrets (`gh secret set`)

| Ad | Ne | Nereden | Örnek format |
|---|---|---|---|
| `DEPLOYER_PRIVATE_KEY` | Kontratı deploy eden cüzdan (Base Sepolia ETH gerekir) | Yeni cüzdan; faucet'ten ETH | `0x` + 64 hex |
| `BASE_SEPOLIA_RPC_URL` | Alchemy HTTP RPC | Alchemy > Base Sepolia | `https://base-sepolia.g.alchemy.com/v2/KEY` |
| `BASE_SEPOLIA_WS_RPC_URL` | Alchemy WebSocket RPC (event worker) | Aynı Alchemy app | `wss://base-sepolia.g.alchemy.com/v2/KEY` |
| `ETHERSCAN_API_KEY` | Opsiyonel; yalnız tam deploy'da `verify_contracts=true` iken kullanılır (deneysel). `BASESCAN_API_KEY` yerine geçer (yedek olarak hâlâ okunur). etherscan.io hesabından alınan tek anahtar tüm zincirlerde geçerlidir | etherscan.io > API Keys | rastgele string |
| `GH_VARIABLES_TOKEN` | Opsiyonel; tam deploy sonrası `ARAF_ESCROW_ADDRESS`/`ARAF_DEPLOYMENT_BLOCK` variable'larını otomatik yazar. Fine-grained PAT, yalnız bu repo, izin: Variables: read and write. Yoksa workflow uyarı verir, özetteki komutlar elle çalıştırılır | GitHub > Settings > Developer settings > Fine-grained tokens | `github_pat_...` |
| `FLY_API_TOKEN` | Fly token. Org/kişisel token (dashboard > Tokens) eksik app'i workflow'un oluşturmasını sağlar; app-scoped deploy token yalnız app zaten varsa çalışır | `fly tokens create org` / `fly tokens create deploy -a <app>` | `FlyV1 ...` |
| `MONGODB_URI` | MongoDB Atlas bağlantısı | Atlas > Connect (IP allowlist: Fly çıkışı veya 0.0.0.0/0) | `mongodb+srv://u:p@cluster.mongodb.net/araf_protocol` |
| `REDIS_URL` | Redis, TLS ZORUNLU (`rediss://`) | Upstash > TLS endpoint | `rediss://default:PASS@host.upstash.io:6379` |
| `JWT_SECRET` | >= 64 karakter | `node -e "console.log(require('crypto').randomBytes(64).toString('hex'))"` | 128 hex |
| `MASTER_ENCRYPTION_KEY` | PII şifreleme anahtarı, tam 64 hex (testnet KMS istisnası) | `node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"` | 64 hex |
| `BASE_SEPOLIA_RPC_URL_FALLBACKS` | Opsiyonel; virgüllü yedek HTTPS RPC'ler (API anahtarı içerebilir, bu yüzden secret). Fly'a `BASE_RPC_URL_FALLBACKS` olarak yazılır; boşsa Fly'daki değer korunur | 2. sağlayıcı | `https://sepolia.base.org` |
| `RELAYER_PRIVATE_KEY` | Opsiyonel; reputation decay / reward recorder için AYRI düşük bakiyeli cüzdan. Boşsa o işler pasif | Yeni cüzdan | `0x` + 64 hex |
| `VERCEL_TOKEN` | Yalnız `deploy_frontend=true` | Vercel > Account > Tokens | string |
| `VERCEL_ORG_ID` | Yalnız frontend | `.vercel/project.json` > `orgId` | `team_...` |
| `VERCEL_PROJECT_ID` | Yalnız frontend | `.vercel/project.json` > `projectId` | `prj_...` |

Önemli: `MASTER_ENCRYPTION_KEY` bir kez üretilip DEĞİŞTİRİLMEMELİ (mevcut şifreli PII çözülemez olur). `JWT_SECRET` ve `MASTER_ENCRYPTION_KEY` aynı değer olmasın.

## Variables (`gh variable set`)

| Ad | Ne | Örnek |
|---|---|---|
| `FRONTEND_DOMAIN` | Vercel production host'u (https:// ve path YOK); SIWE_DOMAIN/ALLOWED_ORIGINS buradan türer | `araf-demo.vercel.app` |
| `TREASURY_ADDRESS` | Fee treasury adresi | `0x...` |
| `FINAL_OWNER_ADDRESS` | Deploy sonrası ownership devri; TREASURY'den FARKLI olmalı (deploy.js reddeder) | `0x...` |
| `BASE_SEPOLIA_USDT_ADDRESS` | Test USDT (6 decimals); yalnız `deploy_test_usdt=true` ile tam deploy'da BOŞ olabilir | `0x...` |
| `BASE_SEPOLIA_USDC_ADDRESS` | Test USDC (Circle) | `0x036CbD53842c5426634e7929541eC2318f3dCF7e` |
| `FLY_APP_NAME` | Opsiyonel; varsayılan `araf-protocol-backend` | `araf-protocol-backend` |
| `FLY_ORG` | Opsiyonel; workflow app'i oluşturmak zorunda kalırsa kullanılan Fly org'u; varsayılan `personal` | `personal` |
| `ADMIN_WALLETS` | Opsiyonel; admin paneli cüzdanları (virgüllü, her biri adres olarak doğrulanır). Boşsa Fly'daki değer korunur | `0xabc...,0xdef...` |
| `FINAL_TREASURY_ADDRESS` | Yalnız `deploy_rewards=true`: vault'un final treasury'si | `0x...` |
| `LIVE_POLL_INTERVAL_MS` | Opsiyonel backend ayarı [2000-300000]; boşsa Fly'daki değer korunur | `15000` |
| `WORKER_BLOCK_BATCH_SIZE` | Opsiyonel [1-2000] (Alchemy ücretsiz: 10) | `10` |
| `WORKER_REPLAY_BATCH_DELAY_MS` | Opsiyonel [0-10000] | `250` |
| `EXPECTED_CHAIN_ID` | Opsiyonel; boş ya da `84532` olmalı (workflow her zaman 84532 yazar) | `84532` |
| `VITE_RPC_URL` | Opsiyonel; frontend birincil RPC (PUBLIC olur, kısıtlı/ayrı key kullanın) | `https://...` |
| `ARAF_ESCROW_ADDRESS` | Deploy SONRASI yazılır (runtime workflow için); `GH_VARIABLES_TOKEN` varsa tam deploy kendisi yazar | `0x...` |
| `ARAF_DEPLOYMENT_BLOCK` | Deploy SONRASI yazılır (aynı şekilde) | `12345678` |
| `ARAF_REVENUE_VAULT_ADDRESS` | `deploy_rewards=true` sonrası (`GH_VARIABLES_TOKEN` varsa) otomatik yazılır; elle de girilebilir. İki workflow da Fly secret (`ARAF_REVENUE_VAULT_ADDRESS`) ve Vercel build-env (`VITE_REVENUE_VAULT_ADDRESS`) olarak geçirir. Doğrulama: 0x+40 hex, sıfır değil, karışık harfliyse EIP-55 checksum; `ARAF_REWARDS_ADDRESS` ile birlikte verilmeli. Tanımsızsa hiçbir şey yazılmaz | `0x...` |
| `ARAF_REWARDS_ADDRESS` | Opsiyonel; yukarıdakiyle aynı (`ARAF_REWARDS_ADDRESS` / `VITE_REWARDS_ADDRESS`) | `0x...` |

## Yalnız web arayüzüyle (mobil) deploy

Bilgisayar ya da yerel CLI gerekmez; her şey tarayıcıdan yapılır.

1. **GitHub secret/variable**: repo > Settings > Secrets and variables > Actions. Secret'lar için "Secrets" sekmesi > New repository secret; variable'lar için "Variables" sekmesi > New repository variable (yukarıdaki tablolar). Workflow'un test USDT'yi deploy etmesini istiyorsan `BASE_SEPOLIA_USDT_ADDRESS`'i BOŞ bırak (tanımlama).
2. **Fly.io**: Fly dashboard'da Tokens sayfasını aç (dashboard > Tokens) ve bir **org token** üret (app-scoped deploy token app oluşturamaz). `FLY_API_TOKEN`'a yaz. App yoksa workflow kendisi oluşturur (`FLY_APP_NAME`; org opsiyonel `FLY_ORG` variable'ından, varsayılan `personal`). Deploy token kullanırsan app'i dashboard'dan (Launch an app / Create app) `FLY_APP_NAME` ile birebir aynı adla kendin oluştur.
3. **Vercel**: dashboard > projeyi oluştur (Root Directory boş). `VERCEL_PROJECT_ID`: Project > Settings > General > Project ID. `VERCEL_ORG_ID`: Team Settings > General > Team ID (kişisel hesapta: Account Settings > General > Your ID). Token: Account Settings > Tokens.
4. **Alchemy** (dashboard.alchemy.com): Base Sepolia app oluştur; HTTPS ve WSS URL'lerini kopyala. **Upstash** (console.upstash.com): TLS'li Redis DB oluştur, `rediss://` URL'sini kopyala. **MongoDB Atlas** (cloud.mongodb.com): ücretsiz cluster, veritabanı kullanıcısı, Network Access > `0.0.0.0/0` izni, Connect > Drivers'tan `mongodb+srv://` URL'si.
5. **Çalıştır**: GitHub > Actions > "Deploy Base Sepolia" > Run workflow. `deploy_frontend=true` ve `deploy_test_usdt=true` seç, Run.
6. **Test USDT davranışı**: `deploy_test_usdt=true` ve `BASE_SEPOLIA_USDT_ADDRESS` variable'ı boşsa workflow kontratlardan önce `tUSDT` (MockERC20) deploy eder, adresi doğrular ve kullanır. Variable zaten doluysa girdi yok sayılır (log'a not düşer). Opsiyonel `GH_VARIABLES_TOKEN` secret'ı varsa adres variable'a yazılır; yoksa job özetinde `gh variable set` komutu çıkar (ya da web arayüzünden variable'ı elle ekle).

## Tek seferlik hazırlık

1. **Fly**: `fly apps create araf-protocol-backend` (ad farklıysa `FLY_APP_NAME` ayarla). `fly.toml` zaten `backend/` içinde. Volume/secret elle gerekmez; workflow secrets'ı yükler.
2. **Vercel**: frontend için proje oluştur; Project Settings > Root Directory BOŞ bırak (CLI `frontend/` içinden çalışır). Proje env'lerinde `VITE_API_URL` TANIMLAMA (prod mutlak URL'i reddeder). `frontend/vercel.json` `/api` rewrite'ı repo'da `https://araf-protocol-backend.fly.dev` adresine gider; workflow Vercel deploy'undan hemen önce runner üzerindeki kopyada hedefi `https://${FLY_APP_NAME}.fly.dev/api/$1` olarak yeniden yazar (`FLY_APP_NAME` `^[a-z0-9-]+$` doğrulanır; repo dosyası değişmez, sonuç log'a basılır). Vercel CLI sürümü workflow'da sabittir (`vercel@62.7.0`).
3. **MongoDB Atlas**: ücretsiz cluster, DB kullanıcısı, network access.
4. **Upstash Redis**: TLS endpoint'i (`rediss://`).
5. **Alchemy**: Base Sepolia app; HTTP ve WSS URL.
6. **Etherscan**: etherscan.io hesabından API key (opsiyonel; `verify_contracts` için; Base'de de geçerli).
7. **Test USDC**: https://faucet.circle.com/ (Base Sepolia, USDC). Adres yukarıdaki örnek, doğrula.
8. **Test USDT**: Circle faucet USDT vermez. `contracts/scripts/deployTestToken.js` 6 decimals'lı `MockERC20` deploy eder (yalnız chainId 84532 ve 31337; mainnet'te hata verir). deploy.js public ağda mock deploy ETMEZ; bu ayrı bir test aracıdır.
   ```bash
   cd contracts
   CONFIRM_TEST_TOKEN_DEPLOY=yes TEST_TOKEN_SYMBOL=tUSDT TEST_TOKEN_NAME="Test Tether USD" \
     npm run deploy:test-token:base-sepolia
   ```
   Gerekli env: `BASE_SEPOLIA_RPC_URL`, `DEPLOYER_PRIVATE_KEY`, `CONFIRM_TEST_TOKEN_DEPLOY=yes`; opsiyonel `TEST_TOKEN_SYMBOL` (varsayılan `tUSDT`), `TEST_TOKEN_NAME` (varsayılan `Test Tether USD`). Çıktı: token adresi ve sonraki adım; kayıt `contracts/deployments/base-sepolia-test-tokens.json`'a (`symbol, address, decimals, txHash, deployedAt`) eklenir. Sonra: `gh variable set BASE_SEPOLIA_USDT_ADDRESS --body <adres>`. Token basmak için `mint()` (saatte 1000) veya owner `mint(to, amount)`.
9. Deployer cüzdanına Base Sepolia ETH yükle (Coinbase/Alchemy faucet).

## Komutlar

Tam deploy girdileri: `deploy_frontend` (Vercel), `deploy_test_usdt` (variable boşsa otomatik test USDT; varsayılan false), `deploy_rewards` (vault + rewards; varsayılan false), `confirm_redeploy_rewards` (`YES` = mevcut rewards kurulumunu bilerek değiştir), `verify_contracts` (deneysel; rewards deploy edildiyse vault ve rewards'ı da doğrular).

```bash
gh secret set DEPLOYER_PRIVATE_KEY < key.txt        # veya --body "..."
gh secret set BASE_SEPOLIA_RPC_URL --body "https://base-sepolia.g.alchemy.com/v2/KEY"
gh secret set BASE_SEPOLIA_WS_RPC_URL --body "wss://base-sepolia.g.alchemy.com/v2/KEY"
gh secret set FLY_API_TOKEN --body "FlyV1 ..."
gh secret set MONGODB_URI --body "mongodb+srv://..."
gh secret set REDIS_URL --body "rediss://default:PASS@host:6379"
gh secret set JWT_SECRET --body "$(node -e "console.log(require('crypto').randomBytes(64).toString('hex'))")"
gh secret set MASTER_ENCRYPTION_KEY --body "$(node -e "console.log(require('crypto').randomBytes(32).toString('hex'))")"
gh secret set VERCEL_TOKEN; gh secret set VERCEL_ORG_ID; gh secret set VERCEL_PROJECT_ID

gh variable set FRONTEND_DOMAIN --body "araf-demo.vercel.app"
gh variable set TREASURY_ADDRESS --body "0x..."
gh variable set FINAL_OWNER_ADDRESS --body "0x..."
gh variable set BASE_SEPOLIA_USDC_ADDRESS --body "0x036CbD53842c5426634e7929541eC2318f3dCF7e"
gh variable set BASE_SEPOLIA_USDT_ADDRESS --body "0x..."
```

Deploy:

```bash
gh workflow run deploy-base-sepolia.yml -f deploy_frontend=true
# opsiyonel (deneysel) Basescan doğrulama: -f verify_contracts=true  (ETHERSCAN_API_KEY secret opsiyonel; eski BASESCAN_API_KEY hâlâ okunur; Sourcify + Blockscout anahtarsız çalışır)
gh run watch
```

`GH_VARIABLES_TOKEN` (opsiyonel): `gh secret set GH_VARIABLES_TOKEN` (fine-grained PAT, yalnız bu repo, Variables: read and write).

## Deploy sonrası

`GH_VARIABLES_TOKEN` tanımlıysa tam deploy workflow'u aşağıdaki iki variable'ı kendisi yazar (token log'a basılmaz). Tanımlı değilse workflow "token tanımlı değil" uyarısı verir; run summary'deki adresleri elle yaz. Sonraki backend/frontend güncellemeleri kontratı yeniden deploy etmez:

```bash
gh variable set ARAF_ESCROW_ADDRESS --body "0x..."
gh variable set ARAF_DEPLOYMENT_BLOCK --body "12345678"
gh workflow run deploy-runtime-base-sepolia.yml -f deploy_backend=true -f deploy_frontend=true
gh run watch
```

Girdi override'ları: `araf_escrow_address`, `usdt_address`, `usdc_address`, `deployment_block`, `revenue_vault_address` + `rewards_address` (ikisi birlikte).

Health: `/health` 200 dönmezse deploy başarısızdır. Backend RPC'ye ulaşamadan açıldıysa `/ready` 503 `degraded:true` döner; bu durumda iş başarılı sayılır ama `::warning::` yazar (RPC secret'larını ve Fly loglarını kontrol edin).

## Revenue vault + rewards (`deploy_rewards`)

Varsayılan `false`: rewards bir go-live kararıdır (bkz. `REWARDS_ROLLOUT.md`) ve `vault.setRewards` tek seferliktir; her tam deploy'da otomatik yeni vault/rewards üretmek eskilerini sessizce terk ederdi. `true` seçilince aynı job'da escrow'dan sonra `deployRewards.js` çalışır:

1. `ArafRevenueVault(escrow, FINAL_TREASURY_ADDRESS, deployer)` → `ArafRewards(escrow, vault, deployer)`.
2. `vault.setRewards(rewards)` (**geri alınamaz**, `RewardsAlreadySet`), `setSupportedToken(USDT/USDC)`, `rewardBps == 4000` kontrolü.
3. Vault ve rewards ownership'i `FINAL_OWNER_ADDRESS`'e devredilir; zincirden tekrar okunup doğrulanır. Ownable **tek adımlıdır** (Ownable2Step değil): yanlış adrese devir geri alınamaz. Log, final owner'da kod olup olmadığını (multisig mi EOA mı) yazar. Wiring yarıda kalırsa manifest `status: "pending"` kalır ve hata çıktısı adresleri ve "deployer hâlâ owner" bilgisini basar.
4. Manifest `deployments/base-sepolia-rewards.json`; adresler buradan okunur, Fly (`ARAF_REVENUE_VAULT_ADDRESS`, `ARAF_REWARDS_ADDRESS`) ve Vercel (`VITE_REVENUE_VAULT_ADDRESS`, `VITE_REWARDS_ADDRESS`) env'ine yazılır; `GH_VARIABLES_TOKEN` varsa repo variable'larına da kaydedilir.

**Güvenlik kilidi** (hiçbir tx gönderilmeden). CI runner her çalışmada temiz checkout'tur, manifest taşınmaz; bu yüzden CI'da **asıl dayanak repo variable'larıdır** (`ARAF_REVENUE_VAULT_ADDRESS`/`ARAF_REWARDS_ADDRESS`). `GH_VARIABLES_TOKEN` tanımlı değilse workflow bu variable'ları yazamaz ve bir sonraki çalıştırmadaki kilit önceki rewards deploy'unu GÖREMEZ: ya token'ı tanımlayın ya da özetteki `gh variable set` satırlarını hemen elle çalıştırın. Zincir üstü kontroller yalnız variable'larda (ya da yerel manifest'te) adres varsa ek güvence sağlar.
- "Validate required config": `deploy_rewards=true` iken `ARAF_REVENUE_VAULT_ADDRESS`/`ARAF_REWARDS_ADDRESS` variable'larından biri doluysa iş, escrow deploy'undan ÖNCE durur. `FINAL_TREASURY_ADDRESS` zorunludur.
- `deployRewards.js`: aynı ağın rewards manifest'i varsa (`pending` dahil; yerelde), variable'daki vault'un `rewards()`'ı doluysa (staticcall), variable'daki rewards adresinde kod varsa ya da `escrow.treasury()` rewards'ı bağlı bir vault ise durur.
- Bilinçli yeniden deploy yalnız `confirm_redeploy_rewards=YES` (büyük harf, birebir) ile. Eski vault/rewards terk edilir; içlerindeki bakiye eski owner'da kalır.
- Manifest ile variable'lar çelişirse (onaysız) adres çözümü hata verir.

**Bağlılık kontrolü** (`.github/scripts/check-rewards-binding.js`, `eth_call`): `vault.escrow() == ESCROW`, `rewards.escrow() == ESCROW`, `rewards.revenueVault() == vault`. Okuma hatası da uyumsuzluk sayılır.
- Tam deploy, `deploy_rewards=true`: uyumsuzluk `::error::`.
- Tam deploy, `deploy_rewards=false`: her çalıştırma YENİ escrow ürettiği için variable'daki vault/rewards neredeyse her zaman eski escrow'a bağlıdır. Uyumsuzlukta iş DURMAZ (escrow deploy'u tamamlandı, yarım kalmasın); vault/rewards Fly'a ve Vercel'e verilmez, Fly'daki `ARAF_REVENUE_VAULT_ADDRESS`/`ARAF_REWARDS_ADDRESS` silinir (unset), Vercel build'ine boş `VITE_REVENUE_VAULT_ADDRESS`/`VITE_REWARDS_ADDRESS` verilir ve özet "vault/rewards bu escrow'a bağlı değil, runtime'a verilmedi; deploy_rewards=true ile yeniden çalıştırın" yazar.
- Runtime workflow: uyumsuzluk `::error::` (kontrat deploy'u yok, durmak güvenli); `araf_escrow_address` override'ı ile variable'daki vault'un karışması da burada yakalanır.

**Elle yapılması gerekenler** (workflow YAPMAZ): escrow `FINAL_OWNER_ADDRESS`'e (multisig) devredildiği için `escrow.setTreasury(vault)` yalnız owner tarafından yapılabilir. Önce `REWARDS_OP=verify`, sonra `CONFIRM_TREASURY_SWITCH=true EXPECTED_CURRENT_TREASURY_ADDRESS=<treasury> REWARDS_OP=switch-treasury` (bkz. `DEPLOYMENT_GUIDE.md` §7). Owner, `setTreasury` ile vault'u atlayabilir (K8, belgelenmiş owner yetkisi).


## Farcaster / Base mini app

- Workflow, Vercel build'ine `VITE_PUBLIC_URL=https://$FRONTEND_DOMAIN` geçirir; build bundan `fc:miniapp` meta etiketlerini ve `/.well-known/farcaster.json` dosyasını üretir.
- `accountAssociation` imzası alan adına bağlıdır; her yeni `FRONTEND_DOMAIN` için yeniden üretilmelidir: bir kez deploy edin, Farcaster developer tools (Manifest tool) ya da Base Build manifest aracını açın, alan adını girin, Farcaster hesabıyla imzalayın ve üç değeri kopyalayın.
- Bunları GitHub variable olarak `FARCASTER_ACCOUNT_ASSOCIATION_HEADER`, `FARCASTER_ACCOUNT_ASSOCIATION_PAYLOAD`, `FARCASTER_ACCOUNT_ASSOCIATION_SIGNATURE` (üçü birlikte ya da hiçbiri) ve istenirse `VITE_BASE_APP_ID` olarak kaydedip frontend deploy'unu yeniden çalıştırın. Yoksa farcaster.json `accountAssociation`'sız üretilir (uygulama çalışır; mini app doğrulaması geçmez).

## Notlar

- Testnet KMS istisnası: `NODE_ENV=production` + `EXPECTED_CHAIN_ID=84532` + `ALLOW_ENV_KMS_ON_TESTNET=yes` ile `KMS_PROVIDER=env` kabul edilir (backend istisnası ana dalda mevcut: `backend/scripts/services/encryption.js`; RPC'nin 84532 olduğu da doğrulanır). Mainnet için AWS/Vault KMS gerekir.
- Frontend `VITE_TARGET_CHAIN=base-sepolia` bayrağını gerektirir (ana dalda mevcut: `frontend/src/app/chainPolicy.js`; workflow bunu Vercel build-env olarak verir); onsuz prod build yalnız Base Mainnet'e bağlıdır.
- Deployment bloğu `deploy.js` çıktısında yoktur; workflow `deployTxHash` receipt'inden okur.
- Secret değerlerinde boşluk/tırnak/`#` olmasın (`flyctl secrets import` dotenv biçimi).
- Contract verify (Basescan) **deneysel**: tam deploy'da `verify_contracts=true` (varsayılan false) + `ETHERSCAN_API_KEY` ile `contracts/scripts/verify.js` çalışır (Etherscan V2 + Sourcify yedek); library'leri (`ArafReputationLib`, `ArafSettlementLib`) ve linkli `ArafEscrow`'u doğrular, constructor argümanları deploy manifestinden okunur. Adım `continue-on-error: true`'dur, başarısız olursa deploy etkilenmez; o durumda elle doğrula: `npm --prefix contracts run verify:base-sepolia` (`contracts/.env`'de `BASE_SEPOLIA_RPC_URL` ve `ETHERSCAN_API_KEY` gerekir).
- Rewards: tam deploy'da `deploy_rewards=true` (yukarı bakın) ya da elle deploy edip `ARAF_REVENUE_VAULT_ADDRESS`/`ARAF_REWARDS_ADDRESS` variable'larını girin; workflow'lar backend ve frontend'e geçirir. `deploy_rewards=false` iken tam deploy yeni escrow üretir ama variable'daki vault eski escrow'a bağlıdır (`vault.escrow` değişmez); bağlılık kontrolü bunu yakalar ve runtime değerlerini boşaltır (yukarıya bakın).
- `ETHERSCAN_API_KEY` yalnız verify adımında kullanılır, backend'e gönderilmez.
- Worker checkpoint sıfırlama: backend olay checkpoint'ini Redis'te escrow adresine bağlı olmayan sabit anahtarlarda (`worker:last_block`, `worker:last_safe_block`) tutar ve mevcut checkpoint `ARAF_DEPLOYMENT_BLOCK`'u geçersiz kılar. Bu yüzden tam deploy, `flyctl deploy` sonrası tüm Fly makinelerini durdurur, `stopped` olduklarını doğrular, YALNIZ bu iki anahtarı siler (`.github/scripts/reset-worker-checkpoint.sh`, TLS üzerinden `REDIS_URL`; log'a yalnız silinen anahtar sayısı yazılır) ve makineleri tekrar başlatır (hata olsa da). Yeni süreç `ARAF_DEPLOYMENT_BLOCK`'tan başlar. Yalnız runtime workflow'u bunu yapmaz.
