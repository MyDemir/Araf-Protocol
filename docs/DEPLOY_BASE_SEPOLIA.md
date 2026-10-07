# Base Sepolia Deploy (GitHub Actions)

İki workflow: `deploy-base-sepolia.yml` (kontrat + Fly backend + opsiyonel Vercel frontend) ve
`deploy-runtime-base-sepolia.yml` (kontrat deploy etmeden backend/frontend yeniden deploy).
`deployRewards.js` workflow'lara DAHİL DEĞİL; rewards ayrı operasyondur (`npm --prefix contracts run deploy:rewards:base-sepolia`).

## Secrets (`gh secret set`)

| Ad | Ne | Nereden | Örnek format |
|---|---|---|---|
| `DEPLOYER_PRIVATE_KEY` | Kontratı deploy eden cüzdan (Base Sepolia ETH gerekir) | Yeni cüzdan; faucet'ten ETH | `0x` + 64 hex |
| `BASE_SEPOLIA_RPC_URL` | Alchemy HTTP RPC | Alchemy > Base Sepolia | `https://base-sepolia.g.alchemy.com/v2/KEY` |
| `BASE_SEPOLIA_WS_RPC_URL` | Alchemy WebSocket RPC (event worker) | Aynı Alchemy app | `wss://base-sepolia.g.alchemy.com/v2/KEY` |
| `BASESCAN_API_KEY` | Opsiyonel; hardhat verify için (workflow şu an verify yapmaz) | basescan.org | rastgele string |
| `FLY_API_TOKEN` | Fly deploy token | `fly tokens create deploy -a <app>` | `FlyV1 ...` |
| `MONGODB_URI` | MongoDB Atlas bağlantısı | Atlas > Connect (IP allowlist: Fly çıkışı veya 0.0.0.0/0) | `mongodb+srv://u:p@cluster.mongodb.net/araf_protocol` |
| `REDIS_URL` | Redis, TLS ZORUNLU (`rediss://`) | Upstash > TLS endpoint | `rediss://default:PASS@host.upstash.io:6379` |
| `JWT_SECRET` | >= 64 karakter | `node -e "console.log(require('crypto').randomBytes(64).toString('hex'))"` | 128 hex |
| `MASTER_ENCRYPTION_KEY` | PII şifreleme anahtarı, tam 64 hex (testnet KMS istisnası) | `node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"` | 64 hex |
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
| `BASE_SEPOLIA_USDT_ADDRESS` | Test USDT (6 decimals) | `0x...` |
| `BASE_SEPOLIA_USDC_ADDRESS` | Test USDC (Circle) | `0x036CbD53842c5426634e7929541eC2318f3dCF7e` |
| `FLY_APP_NAME` | Opsiyonel; varsayılan `araf-protocol-backend` | `araf-protocol-backend` |
| `ADMIN_WALLETS` | Opsiyonel; admin paneli cüzdanları (virgüllü) | `0xabc...,0xdef...` |
| `VITE_RPC_URL` | Opsiyonel; frontend birincil RPC (PUBLIC olur, kısıtlı/ayrı key kullanın) | `https://...` |
| `ARAF_ESCROW_ADDRESS` | Deploy SONRASI yazılır (runtime workflow için) | `0x...` |
| `ARAF_DEPLOYMENT_BLOCK` | Deploy SONRASI yazılır | `12345678` |

## Tek seferlik hazırlık

1. **Fly**: `fly apps create araf-protocol-backend` (ad farklıysa `FLY_APP_NAME` ayarla). `fly.toml` zaten `backend/` içinde. Volume/secret elle gerekmez; workflow secrets'ı yükler.
2. **Vercel**: frontend için proje oluştur; Project Settings > Root Directory BOŞ bırak (CLI `frontend/` içinden çalışır). Proje env'lerinde `VITE_API_URL` TANIMLAMA (prod mutlak URL'i reddeder). `frontend/vercel.json` `/api` rewrite'ı `https://araf-protocol-backend.fly.dev` adresine gider; `FLY_APP_NAME` farklıysa `vercel.json` güncellenmeli (workflow uyuşmazlıkta durur).
3. **MongoDB Atlas**: ücretsiz cluster, DB kullanıcısı, network access.
4. **Upstash Redis**: TLS endpoint'i (`rediss://`).
5. **Alchemy**: Base Sepolia app; HTTP ve WSS URL.
6. **Basescan**: API key (opsiyonel).
7. **Test USDC**: https://faucet.circle.com/ (Base Sepolia, USDC). Adres yukarıdaki örnek, doğrula.
8. **Test USDT**: Circle faucet USDT vermez. Seçenek: 6 decimals'lı bir ERC20 kullan veya `contracts/src/MockERC20.sol`'u (`MockERC20(name,symbol,6)`, herkese açık `mint()`) Base Sepolia'ya elle deploy edip adresini `BASE_SEPOLIA_USDT_ADDRESS` yap. deploy.js public ağda mock deploy ETMEZ.
9. Deployer cüzdanına Base Sepolia ETH yükle (Coinbase/Alchemy faucet).

## Komutlar

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
gh run watch
```

## Deploy sonrası

Run summary'deki (veya log) adresleri variables'a yaz; sonraki backend/frontend güncellemeleri kontratı yeniden deploy etmez:

```bash
gh variable set ARAF_ESCROW_ADDRESS --body "0x..."
gh variable set ARAF_DEPLOYMENT_BLOCK --body "12345678"
gh workflow run deploy-runtime-base-sepolia.yml -f deploy_backend=true -f deploy_frontend=true
gh run watch
```

Girdi override'ları: `araf_escrow_address`, `usdt_address`, `usdc_address`, `deployment_block`.

## Notlar

- Testnet KMS istisnası: `NODE_ENV=production` + `EXPECTED_CHAIN_ID=84532` + `ALLOW_ENV_KMS_ON_TESTNET=yes` ile `KMS_PROVIDER=env` kabul edilir (backend istisnası ayrı iş; bu değişiklik backend'de yoksa backend production'da başlamaz). Mainnet için AWS/Vault KMS gerekir.
- Frontend `VITE_TARGET_CHAIN=base-sepolia` bayrağını gerektirir (ayrı iş); onsuz prod build yalnız Base Mainnet'e bağlıdır.
- Deployment bloğu `deploy.js` çıktısında yoktur; workflow `deployTxHash` receipt'inden okur.
- Secret değerlerinde boşluk/tırnak/`#` olmasın (`flyctl secrets import` dotenv biçimi).
- Contract verify (Basescan) workflow'da yok; ArafEscrow iki library'ye linkli olduğundan elle yapılır.
