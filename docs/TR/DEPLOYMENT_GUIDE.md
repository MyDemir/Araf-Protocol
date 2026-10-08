# Araf Protocol — Deployment Guide

> **Versiyon:** 2.1 | **Son Güncelleme:** Ekim 2026
>
> Bu rehber üç ortamı kapsar: Yerel Geliştirme · Public Testnet (Base Sepolia) · Mainnet (Base)
>
> Doğruluk kaynağı koddur (`backend/scripts`, `frontend/src`, `contracts/scripts`, `contracts/hardhat.config.js`, `backend/fly.toml`). Ortam değişkenlerinin tam listesi [6. bölümdedir](#6-ortam-değişkenleri-referansı).

---

## İçindekiler

1. [Yerel Geliştirme (Local)](#1-yerel-geliştirme)
2. [Sık Karşılaşılan Yerel Sorunlar (Troubleshooting)](#2-sık-karşılaşılan-yerel-sorunlar-troubleshooting)
3. [Public Testnet — Base Sepolia](#3-public-testnet--base-sepolia)
4. [Mainnet — Base](#4-mainnet--base)
5. [Ortam Farkları Özeti](#5-ortam-farkları-özeti)
6. [Ortam Değişkenleri Referansı](#6-ortam-değişkenleri-referansı)
7. [Kontrat Deploy Sırası](#7-kontrat-deploy-sırası)
8. [Migration'lar ve MongoDB Notları](#8-migrationlar-ve-mongodb-notları)
9. [Fly.io Çalışma Zamanı ve Health Check](#9-flyio-çalışma-zamanı-ve-health-check)
10. [Deployment hardening baseline (Production)](#deployment-hardening-baseline-production)

---

## 1. Yerel Geliştirme

### Ön Gereksinimler
- Node.js 22 LTS (backend imajı `node:22-alpine`, CI Node 22 çalıştırır)
- Docker Desktop (MongoDB ve Redis için en kolay yöntem)
- MetaMask — Hardhat ağı eklenecek

### Adım 1 — Veritabanı ve Önbellek (Docker İle Kurulum)
Backend'in çalışabilmesi için MongoDB ve Redis'in ayakta olması şarttır. Docker yüklüyse terminalde şu komutları çalıştırarak arka planda başlatabilirsiniz:

```bash
# MongoDB'yi başlat
docker run -d --name araf-mongo -p 27017:27017 mongo:latest

# Redis'i başlat
docker run -d --name araf-redis -p 6379:6379 redis:latest
```
*(Durdurmak için: `docker stop araf-mongo araf-redis`)*

### Adım 2 — Bağımlılıkları Kur

```bash
nvm use          # Node 22 (.nvmrc)
npm run setup    # npm ci: contracts + backend + frontend
```

README "Kurulum / Setup" bölümüyle aynı yol; kök script üç pakette `npm ci` çalıştırır. Node 22 (`nvm use`), env dosyası kopyaları ve komut listesi için bkz. [README → Kurulum](../../README.md#-kurulum--setup).

### Adım 3 — Terminal 1: Hardhat Node

```bash
cd contracts
npx hardhat node
```

Çıktıda 20 test cüzdanı ve private key'leri listelenir. `Account #0` deployer, `Account #1` treasury olarak kullanılacak.

### Adım 4 — Terminal 2: Kontratları Deploy Et

```bash
# contracts/.env dosyası oluştur
cat > contracts/.env << 'EOF'
# Account #1 adresini buraya yaz (yerel deploy node'un kendi hesaplarını kullanır; DEPLOYER_PRIVATE_KEY gerekmez)
TREASURY_ADDRESS=0x70997970C51812dc3A010C7d01b50e0d17dc79C8
EOF

# `localhost` Adım 3'teki node'u hedefler (`--network hardhat` tek kullanımlık, süreç içi bir ağdır)
npx hardhat run scripts/deploy.js --network localhost
```

Script sırasıyla `ArafReputationLib`, `ArafSettlementLib`, library'lere linkli `ArafEscrow` ve iki `MockERC20` token deploy eder, USDT/USDC token config'lerini ayarlayıp doğrular ve `contracts/deployments/localhost.json` manifest'ini yazar (escrow, library'ler, token'lar). Yerel ağlarda ayrıca `VITE_ESCROW_ADDRESS`, `VITE_USDT_ADDRESS` ve `VITE_USDC_ADDRESS` değerlerini `frontend/.env` içine yazar (dosya yoksa `frontend/.env.example`'dan oluşturulur). Çıktıdaki adresleri not edin:

```text
Escrow        : 0x...
USDT          : 0x...
USDC          : 0x...
```

### Adım 5 — Terminal 2: Backend Yapılandırması

```bash
# backend/.env dosyası oluştur
cat > backend/.env << 'EOF'
PORT=4000
NODE_ENV=development

MONGODB_URI=mongodb://127.0.0.1:27017/araf_dev
REDIS_URL=redis://127.0.0.1:6379

# En az 64 karakterlik bir string üret (entropy kontrol edilir, placeholder reddedilir):
# node -e "console.log(require('crypto').randomBytes(64).toString('hex'))"
JWT_SECRET=kendi_64_karakterlik_stringini_buraya_uret
JWT_EXPIRES_IN=15m
PII_TOKEN_EXPIRES_IN=15m

KMS_PROVIDER=env
# 64 hex karakter:
# node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
MASTER_ENCRYPTION_KEY=kendi_64_hex_karakterini_buraya_uret

BASE_RPC_URL=http://127.0.0.1:8545
# BASE_RPC_URL tanımlıysa zorunludur (31337 = Hardhat)
EXPECTED_CHAIN_ID=31337
ARAF_ESCROW_ADDRESS=<deploy_çıktısındaki_adres>
# Yerel zincir ne 8453 ne 84532 olduğundan izlenen token seti açıkça verilir
ARAF_TRACKED_TOKENS=<deploy_çıktısındaki_usdt_adresi>,<deploy_çıktısındaki_usdc_adresi>

# Relayer için Hardhat Account #2 private key'ini kullan (opsiyonel: yoksa itibar-temizleme ve
# reward-outcome görevleri pasif kalır). Yalnız yerel: bu anahtarlar herkese açıktır; mainnet'te ASLA kullanma.
RELAYER_PRIVATE_KEY=<hardhat_account_2_private_key>

SIWE_DOMAIN=localhost
ALLOWED_ORIGINS=http://localhost:5173
EOF

cd backend && npm run dev
```

> Güvenlik notu: `BASE_RPC_URL` açıkça zorunludur; worker public mainnet RPC'sine fallback yapmaz. `BASE_RPC_URL` tanımlıyken `EXPECTED_CHAIN_ID` de zorunludur (yerel denemeler için tek kaçış yolu `ALLOW_UNSAFE_CHAIN_ID_BYPASS=true`'dur; production'da yok sayılır).

### Adım 6 — Terminal 3: Frontend Yapılandırması

`deploy.js` üç kontrat adresini Adım 4'te zaten `frontend/.env` içine yazdı. Kontrol edin, gerekirse elle düzeltin:

```bash
# frontend/.env
VITE_API_URL=http://localhost:4000
VITE_ESCROW_ADDRESS=<deploy_çıktısındaki_adres>
VITE_USDT_ADDRESS=<deploy_çıktısındaki_usdt_adresi>
VITE_USDC_ADDRESS=<deploy_çıktısındaki_usdc_adresi>

cd frontend && npm run dev
```

### Adım 7 — MetaMask'a Hardhat Ağını Ekle

| Alan | Değer |
|------|-------|
| Ağ Adı | Hardhat Local |
| RPC URL | `http://127.0.0.1:8545` |
| Chain ID | `31337` |
| Para Birimi | ETH |

Hardhat'in verdiği test private key'lerini MetaMask'a import edin.

### Adım 8 — Testleri Çalıştır

```bash
cd contracts

# K-04/K-05 düzeltmeleri dahil — tüm testler geçmeli
npx hardhat test

# Coverage raporu (opsiyonel)
npx hardhat coverage
```

Kontrat testleri repo kökündeki `test/contracts/` altındadır (`contracts/hardhat.config.js` içindeki `paths.tests`); backend ve frontend testleri `test/backend/` ve `test/frontend/` altındadır.

#### Root-level local test komutları

Root `package.json` yalnız ince bir developer runner'dır. Testleri taşımaz ve package-local CI komutlarının yerine geçmez; her script ilgili package dizinine delegate eder.

```bash
# Repo root'tan, package bağımlılıkları kurulduktan sonra
npm run test:backend
npm run test:frontend
npm run test:contracts
npm run test:abi-drift

# Deterministic aggregate sıra:
# backend → frontend → contracts → ABI drift
npm run test:all
```

Tek package içinde çalışırken package-local komutlar kullanılmaya devam eder:

```bash
cd backend && npm test
cd ../frontend && npm test
cd ../contracts && npm test
```

### Yerel Test Kontrol Listesi

- [ ] `npx hardhat node` — 20 hesap görünüyor
- [ ] `npx hardhat test` — tüm testler ✅
- [ ] Backend liveness `http://localhost:4000/health` → `{"status":"ok", ...}` (worker blok görmeyi bıraktıysa `"stale"` ile HTTP `503`)
- [ ] Backend readiness `http://localhost:4000/ready` → Bağımlılıklar hazırsa HTTP `200` (`x-internal-token` gönderilmedikçe redakte gövde)
- [ ] Frontend `http://localhost:5173` — açılıyor
- [ ] MetaMask Hardhat ağında — `chainId: 31337`
- [ ] Test USDT Al butonu — mock faucet çalışıyor (yalnız production olmayan build'lerde)
- [ ] Tam işlem döngüsü: create → lock → pay → release

---

## 2. Sık Karşılaşılan Yerel Sorunlar (Troubleshooting)

Yerel ortamda (veya Codespace'te) geliştirme yaparken en sık karşılaşılan sorunlar ve çözümleri:

### ❌ Port Zaten Kullanımda (EADDRINUSE)
Backend (`4000`) veya Frontend (`5173`) başlatılırken bu hatayı alırsanız, arka planda açık kalmış ve "zombi" olmuş bir Node.js süreci vardır. 

**Çözüm (Portu Serbest Bırakmak):**
```bash
# Mac ve Linux için (Tüm node süreçlerini sonlandırır):
killall -9 node

# Windows için (PowerShell):
taskkill /F /IM node.exe
```
Eğer sadece belirli bir portu (örneğin 4000) öldürmek isterseniz:
```bash
# Mac/Linux:
lsof -i :4000
kill -9 <PID_NUMARASI>
```

### ❌ MetaMask Nonce Hatası (İşlem Askıda Kalıyor)
Hardhat node'unu (Terminal 1) kapatıp tekrar açtığınızda blockchain "sıfırlanır". Ancak MetaMask cüzdanınız eski işlemlerin sırasını (Nonce) hatırlar. Bu yüzden yeni işlem göndermek istediğinizde cüzdan kilitlenir.

**Çözüm (Cüzdanı Sıfırlamak):**
1. MetaMask uzantısını açın.
2. Sağ üstteki üç noktadan (veya profil resminden) **Ayarlar**'a girin.
3. **Gelişmiş** sekmesine tıklayın.
4. **"Hesap Etkinliğini Temizle"** (Clear Activity Data) butonuna basın. (Bu işlem bakiyenizi veya hesaplarınızı silmez, sadece işlem geçmişini sıfırlar).

### ❌ Codespaces Kaynak Limitleri (Resource Pressure)
GitHub Codespaces (Ücretsiz sürüm), MongoDB, Redis, Hardhat, Backend ve Frontend'i aynı anda çalıştırırken RAM (Bellek) sınırlarını hızla zorlayabilir. Codespace kilitlenir veya terminal donarsa:

**Çözüm:**
1. Geçici Olarak Docker'ları Durdurun: Eğer sadece Frontend tasarlıyorsanız backend/veritabanı ikilisini kapatın: `docker stop araf-mongo araf-redis`.
2. Projeyi Bilgisayarınıza Alın (Önerilen): Eğer tam entegrasyon testleri yapacaksanız, projeyi `git clone` ile doğrudan kendi bilgisayarınıza çekip (Docker Desktop ile) kısıtlama olmadan çalışın.

### 🔎 Hataları Merkezi Olarak İzlemek
Backend log satırları (`POST /api/logs/client-error` ile gelen frontend çökme raporları dahil) konsola ve dönen bir dosyaya (`araf.log`, 25 MB × 5 dosya) yazılır. Varsayılan dizin `backend/logs/`'tur; değiştirmek için `LOG_DIR` kullanın. Geliştirme yaparken bir terminal sekmesinde açık tutun:

```bash
tail -f backend/logs/araf.log
```

---

## 3. Public Testnet — Base Sepolia

> **Önerilen yol: GitHub Actions workflow'u** ([DEPLOY_BASE_SEPOLIA.md](./DEPLOY_BASE_SEPOLIA.md)). Kontrat, Fly backend ve Vercel frontend deploy'u; Fly secrets ve Vercel build-env dahil, secrets/variables girilerek otomatik yapılır.
> Bu bölümdeki Adım 1–5 (elle `fly secrets set`, `.env.production` vb.) **alternatif/elle** akıştır; workflow kullanılmayacaksa izlenir.

### Ön Gereksinimler
- MetaMask'ta Base Sepolia ağı yapılandırılmış
- Base Sepolia ETH (Faucet: `faucet.quicknode.com` veya `sepoliafaucet.com`)
- Base Sepolia USDT/USDC token adresleri (public ağ deploy'ları `MockERC20` deploy etmez)
- Alchemy/Infura hesabı (RPC için)
- MongoDB Atlas hesabı (ücretsiz M0)
- Upstash Redis hesabı (ücretsiz; URL `rediss://` olmalı)
- Fly.io hesabı (backend için)
- Vercel hesabı (frontend için)
- BaseScan API anahtarı (`basescan.org/myapikey`)
- AWS KMS veya HashiCorp Vault (backend `fly.toml` gereği `NODE_ENV=production` ile çalışır ve production'da `KMS_PROVIDER=env` reddedilir; tek istisna Base Sepolia demosudur: `NODE_ENV=production` + `EXPECTED_CHAIN_ID=84532` + `ALLOW_ENV_KMS_ON_TESTNET=yes` (RPC'nin 84532 olduğu doğrulanır; mainnet'te asla). Workflow'lu akış için bkz. [DEPLOY_BASE_SEPOLIA.md](./DEPLOY_BASE_SEPOLIA.md))

### Adım 1 — Kontratları Deploy Et (Base Sepolia)

```bash
# contracts/.env dosyasını güncelle
cat > contracts/.env << 'EOF'
DEPLOYER_PRIVATE_KEY=0x<testnet_deployer_private_key>
TREASURY_ADDRESS=0x<testnet_treasury_wallet>
# Public ağlarda TREASURY_ADDRESS'ten farklı olmalı
FINAL_OWNER_ADDRESS=0x<testnet_final_owner>
BASE_SEPOLIA_RPC_URL=https://base-sepolia.g.alchemy.com/v2/<API_KEY>
BASE_SEPOLIA_USDT_ADDRESS=0x<sepolia_usdt>
BASE_SEPOLIA_USDC_ADDRESS=0x<sepolia_usdc>
BASESCAN_API_KEY=<basescan_api_key>
CONFIRM_PUBLIC_DEPLOY=yes
REPORT_GAS=true
EOF

cd contracts

# Derle
npx hardhat compile

# Deploy (kesin sıra için 7. bölüme bakın)
npx hardhat run scripts/deploy.js --network base-sepolia
```

Çıktıdan (ve `contracts/deployments/base-sepolia.json` dosyasından) not edin:
```text
✅ ArafReputationLib: 0x...
✅ ArafSettlementLib: 0x...
✅ ArafEscrow deploy edildi: 0x...
✅ USDT token config doğrulandı (supported=true, ...)
✅ USDC token config doğrulandı (supported=true, ...)
✅ Ownership devredildi: 0x<final_owner>
```

### Adım 2 — Kontratları Doğrula (BaseScan)

`ArafEscrow` iki harici library'ye linklidir; önce library'leri, sonra library adresleriyle escrow'u doğrulayın (adresler deployment manifest'inde):

```bash
cd contracts

# Library'leri doğrula (constructor argümanı yok)
npx hardhat verify --network base-sepolia <ARAF_REPUTATION_LIB_ADDRESS>
npx hardhat verify --network base-sepolia <ARAF_SETTLEMENT_LIB_ADDRESS>

# ArafEscrow'u doğrula (constructor argümanı = treasury). Library adreslerini hardhat-verify'ın
# --libraries seçeneğiyle verin ({ ArafReputationLib, ArafSettlementLib } export eden küçük bir modül).
npx hardhat verify --network base-sepolia \
  --libraries <path/to/libraries.js> \
  <ARAF_ESCROW_ADDRESS> \
  <TREASURY_ADDRESS>
```

### Adım 3 — Backend: Fly.io'ya Deploy Et

```bash
# Fly.io CLI kur (macOS/Linux)
curl -L https://fly.io/install.sh | sh

# Giriş yap
fly auth login

# Backend dizinine git
cd backend

# Uygulama oluştur (ilk kez)
fly apps create araf-protocol-backend

# Secret'ları ayarla (hepsi birden). NODE_ENV ve PORT zaten fly.toml [env] içinden gelir.
# Tüm değişkenler için 6. bölüme bakın; Mainnet yalnız zincir/token değerlerinde farklıdır.
# Not: Base Sepolia demosunda KMS_PROVIDER=env + ALLOW_ENV_KMS_ON_TESTNET=yes istisnası da kullanılabilir (bkz. ./DEPLOY_BASE_SEPOLIA.md); mainnet'te aws/vault şarttır.
fly secrets set \
  MONGODB_URI="mongodb+srv://<user>:<pass>@cluster.mongodb.net/araf_testnet" \
  REDIS_URL="rediss://:<token>@<host>.upstash.io:6379" \
  JWT_SECRET="<64_karakter_hex>" \
  KMS_PROVIDER="aws" \
  AWS_ENCRYPTED_DATA_KEY="<base64_CiphertextBlob>" \
  AWS_REGION="eu-west-1" \
  BASE_RPC_URL="https://base-sepolia.g.alchemy.com/v2/<API_KEY>" \
  BASE_WS_RPC_URL="wss://base-sepolia.g.alchemy.com/v2/<API_KEY>" \
  EXPECTED_CHAIN_ID="84532" \
  ARAF_ESCROW_ADDRESS="<DEPLOY_ADRESI>" \
  BASE_SEPOLIA_USDT_ADDRESS="<SEPOLIA_USDT>" \
  BASE_SEPOLIA_USDC_ADDRESS="<SEPOLIA_USDC>" \
  RELAYER_PRIVATE_KEY="0x<relayer_private_key>" \
  SIWE_DOMAIN="araf-protocol.vercel.app" \
  SIWE_URI="https://araf-protocol.vercel.app" \
  ALLOWED_ORIGINS="https://araf-protocol.vercel.app" \
  ARAF_DEPLOYMENT_BLOCK="<DEPLOY_BLOK_NUMARASI>" \
  ADMIN_WALLETS="0x<admin_cuzdan>"

# Deploy et
fly deploy

# Logları izle
fly logs --app araf-protocol-backend
```

> **Worker başlangıç bloğu:** production'da worker'ın ya mevcut bir Redis checkpoint'ine ya da `ARAF_DEPLOYMENT_BLOCK`'a (veya `WORKER_START_BLOCK`) ihtiyacı vardır; aksi halde `/ready` `ARAF_DEPLOYMENT_BLOCK_OR_WORKER_START_BLOCK_OR_CHECKPOINT` eksiği raporlar. Checkpoint varsa env değeri yok sayılır. İlk kurulumda `ARAF_DEPLOYMENT_BLOCK` vermek yeterlidir; `worker:last_block`'u elle tohumlamak gerekmez.

> **Not:** `fly.toml` dosyasındaki `auto_stop_machines = false` ayarı event listener'ın sürekli çalışması için zorunludur. Değiştirmeyin.

### Adım 4 — Frontend: Vercel'e Deploy Et

```bash
# Vercel CLI kur
npm install -g vercel

# Frontend dizinine git
cd frontend

# vercel.json'daki proxy URL'sini güncelle
# "destination" → "https://araf-protocol-backend.fly.dev/api/$1"

# Production env dosyası oluştur (tüm VITE_* değerleri public'tir; bkz. 6. bölüm)
cat > .env.production << 'EOF'
# Production build'lerde VITE_API_URL'i boş bırakın: mutlak URL reddedilir, /api'yi vercel.json proxy'ler
VITE_ESCROW_ADDRESS=<DEPLOY_ADRESI>
VITE_USDT_ADDRESS=<USDT_ADRESI>
VITE_USDC_ADDRESS=<USDC_ADRESI>
EOF

# Deploy et
vercel --prod

# veya GitHub entegrasyonuyla otomatik deploy için:
# vercel link → GitHub repo'yu bağla → her main push'ta otomatik deploy
```

Vercel'de Environment Variables de ayarlanmalıdır (Dashboard → Settings → Environment Variables).

> **Zincir politikası:** frontend production build'lerde (`import.meta.env.PROD`) varsayılan olarak yalnız Base Mainnet'i açar; `VITE_TARGET_CHAIN=base-sepolia` verilirse production build yalnız Base Sepolia'yı açar (`frontend/src/app/chainPolicy.js`). Hardhat zinciri yalnız production olmayan build'lere bağlanır. `main.jsx` üzerinde yapılacak bir düzenleme yoktur; barındırılan Sepolia frontend'i için aşağıdaki `VITE_TARGET_CHAIN` notuna ve [DEPLOY_BASE_SEPOLIA.md](./DEPLOY_BASE_SEPOLIA.md)'ye bakın.

### Adım 5 — SIWE Domain'i ve Origin

SIWE domain/URI ve CORS origin'i **frontend** origin'i olmalıdır (kullanıcının imzayı attığı sayfa). Production'da backend, `SIWE_URI`'nin `https://` olmasını ve host'unun `SIWE_DOMAIN`'e eşit olmasını zorunlu tutar:

```bash
fly secrets set SIWE_DOMAIN="araf-protocol.vercel.app" SIWE_URI="https://araf-protocol.vercel.app"
```

### Testnet Kontrol Listesi

- [ ] `https://sepolia.basescan.org/address/<ESCROW_ADDRESS>` — kontrat ve library'ler doğrulandı ✅
- [ ] `https://araf-protocol-backend.fly.dev/health` → yalnız liveness (`{"status":"ok", ...}`)
- [ ] `https://araf-protocol-backend.fly.dev/ready` → readiness kapısı (`200` hazır / `503` hazır değil)
- [ ] `https://araf-protocol.vercel.app` — site açılıyor
- [ ] MetaMask Base Sepolia'ya bağlı
- [ ] SIWE login başarılı
- [ ] Tam işlem döngüsü: create → lock → pay → release
- [ ] Dispute → bleeding → cancel
- [ ] Event listener logları temiz (`fly logs`)

### Testnet build (Vercel)

Herkese açık testnet sitesi için frontend production build'i `VITE_TARGET_CHAIN=base-sepolia` ile alınır (Vercel → Environment Variables). Bu durumda yalnız Base Sepolia (84532) desteklenir; mainnet karışmaz. Varsayılan `base` (8453) davranışı değişmez; bilinmeyen değer konsola uyarı yazar ve `base`'e düşer. Production build'lerde mint/faucet testnet'te de kapalıdır. `VITE_ESCROW_ADDRESS`/`VITE_USDT_ADDRESS`/`VITE_USDC_ADDRESS` Sepolia deploy değerleri olmalı.

---

## 4. Mainnet — Base

> ⚠️ **Mainnet Öncesi Zorunlu:** Profesyonel bir akıllı kontrat güvenlik denetimi tamamlanmalıdır.

### Testnet vs Mainnet Farkları

| Alan | Testnet | Mainnet |
|------|---------|---------|
| MockERC20 | Deploy edilmez (public ağ) | **Deploy Edilmez** (public ağ) |
| Token adresleri | `BASE_SEPOLIA_USDT/USDC_ADDRESS` | `BASE_MAINNET_USDT/USDC_ADDRESS` |
| KMS | AWS KMS veya Vault (`NODE_ENV=production` iken `env` engellenir) | AWS KMS veya HashiCorp Vault |
| Treasury | Test cüzdanı | **Gnosis Safe multisig** (min 3/5) |
| RPC | Alchemy Sepolia | Alchemy/Infura Base Mainnet |
| Chain ID | 84532 | 8453 |
| Relayer | Ayrı, düşük bakiyeli test cüzdanı | Aynı backend görevleri (`RELAYER_PRIVATE_KEY`); harici otomasyon planlı, kodda yok |
| Denetim | Opsiyonel | **Zorunlu** |

### Adım 1 — Gnosis Safe Hazırlığı

1. `safe.global` → Base Mainnet → New Safe
2. En az 3/5 imzalayıcı yapılandır
3. Safe adresini `TREASURY_ADDRESS` olarak kullan (ve ayrı bir adresi `FINAL_OWNER_ADDRESS` olarak)
4. **Tek EOA treasury kullanmayın** — private key sızarsa tüm protokol fonları risktedir.

### Adım 2 — AWS KMS Kurulumu (Production Şifreleme)

```bash
# AWS CLI ile KMS anahtarı oluştur
aws kms create-key \
  --description "Araf Protocol PII Master Key" \
  --region eu-west-1

# Data key üret (plaintext + encrypted)
aws kms generate-data-key \
  --key-id <KMS_KEY_ARN> \
  --key-spec AES_256 \
  --region eu-west-1

# Çıktıdaki şifreli data key'i al (CiphertextBlob → base64)
# AWS_ENCRYPTED_DATA_KEY değişkenine kaydet
```

`AWS_KMS_KEY_ARN` backend tarafından **okunmaz**; anahtar kimliği `CiphertextBlob` içinde gömülüdür. Backend data key'i açılışta bir kez çözer (`kms:Decrypt`) ve HKDF ile cüzdan başına anahtar türetir. Çözülen anahtar tam 32 bayt olmalıdır. Vault alternatifi (`KMS_PROVIDER=vault`), `VAULT_ADDR`, `VAULT_TOKEN` ve opsiyonel `VAULT_KEY_NAME` ile birlikte `VAULT_ENCRYPTED_DATA_KEY` içinde **sabit** bir wrapped data key ister (bir kez `vault write transit/datakey/wrapped/<key>` ile üretilir); eksikse açılış fail-closed durur. Wrapped key'i saklayın: o olmadan restart sonrası PII çözülemez.

### Adım 3 — Kontratları Deploy Et (Base Mainnet)

```bash
# contracts/.env dosyasını güncelle
cat > contracts/.env << 'EOF'
DEPLOYER_PRIVATE_KEY=0x<mainnet_deployer_private_key>
TREASURY_ADDRESS=0x<gnosis_safe_adresi>
# Public ağlarda TREASURY_ADDRESS'ten farklı olmalı
FINAL_OWNER_ADDRESS=0x<final_owner_adresi>
BASE_RPC_URL=https://base-mainnet.g.alchemy.com/v2/<API_KEY>
BASESCAN_API_KEY=<basescan_api_key>
BASE_MAINNET_USDT_ADDRESS=0xfde4C96c8593536E31F229EA8f37b2ADa2699bb2
BASE_MAINNET_USDC_ADDRESS=0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913
CONFIRM_PUBLIC_DEPLOY=yes
EOF

# Public ağlar (8453 / 84532) MockERC20 deploy etmez; NODE_ENV=production önerilen açık ayardır
# Not: Base Mainnet deploy için BASE_MAINNET_USDT_ADDRESS / BASE_MAINNET_USDC_ADDRESS zorunludur.
# Not: Base Sepolia deploy için BASE_SEPOLIA_USDT_ADDRESS / BASE_SEPOLIA_USDC_ADDRESS zorunludur.
# Not: MAINNET_* alias'ları yalnız Base Mainnet için legacy'dir; Base Sepolia için kullanılmamalıdır.
NODE_ENV=production npx hardhat run scripts/deploy.js --network base

# Library'leri ve linkli escrow'u doğrula (bkz. Testnet Adım 2)
npx hardhat verify --network base <ARAF_REPUTATION_LIB_ADDRESS>
npx hardhat verify --network base <ARAF_SETTLEMENT_LIB_ADDRESS>
npx hardhat verify --network base --libraries <path/to/libraries.js> <ESCROW_ADDRESS> <GNOSIS_SAFE_ADDRESS>
```

> Not: `contracts/hardhat.config.js` içinde `base` için `BASE_RPC_URL`, `base-sepolia` için `BASE_SEPOLIA_RPC_URL` zorunludur; public RPC default fallback tanımlı değildir.

#### Local/custom + harici token adresleri (opsiyonel)

`USE_EXTERNAL_TOKEN_ADDRESSES=true` ile mock token yerine harici token adresleri kullanmak isterseniz:

```bash
EXTERNAL_USDT_ADDRESS=0x<external_usdt>
EXTERNAL_USDC_ADDRESS=0x<external_usdc>
USE_EXTERNAL_TOKEN_ADDRESSES=true npx hardhat run scripts/deploy.js --network localhost
```

Bu yol `EXTERNAL_*` değerlerini yalnız local/custom zincirlerde kullanır; Base Sepolia/public yollar chain-aware `BASE_*` env'lerini kullanmaya devam eder.

### Adım 4 — Backend: Production Secret'ları

```bash
# Fly.io production secret'ları (NODE_ENV ve PORT zaten fly.toml [env] içinden gelir)
fly secrets set \
  MONGODB_URI="mongodb+srv://<user>:<pass>@cluster.mongodb.net/araf" \
  REDIS_URL="rediss://:<token>@<host>:6379" \
  JWT_SECRET="<64_karakter_hex>" \
  KMS_PROVIDER="aws" \
  AWS_ENCRYPTED_DATA_KEY="<base64_CiphertextBlob>" \
  AWS_REGION="eu-west-1" \
  BASE_RPC_URL="https://base-mainnet.g.alchemy.com/v2/<API_KEY>" \
  BASE_WS_RPC_URL="wss://base-mainnet.g.alchemy.com/v2/<API_KEY>" \
  EXPECTED_CHAIN_ID="8453" \
  ARAF_ESCROW_ADDRESS="<MAINNET_ESCROW>" \
  BASE_MAINNET_USDT_ADDRESS="0xfde4C96c8593536E31F229EA8f37b2ADa2699bb2" \
  BASE_MAINNET_USDC_ADDRESS="0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913" \
  ARAF_DEPLOYMENT_BLOCK="<MAINNET_DEPLOY_BLOK>" \
  SIWE_DOMAIN="app.araf.xyz" \
  SIWE_URI="https://app.araf.xyz" \
  ALLOWED_ORIGINS="https://app.araf.xyz" \
  ADMIN_WALLETS="0x<admin_cuzdan>" \
  READY_INTERNAL_TOKEN="<uzun_rastgele_string>"
  # RELAYER_PRIVATE_KEY (opsiyonel): yoksa itibar-temizleme ve reward-outcome görevleri pasif kalır.
  # İki kontrat fonksiyonu da permissionless'tır; kodda Gelato/Chainlink entegrasyonu yoktur.

fly deploy
```

### Adım 5 — Frontend Production Yapılandırması

```bash
# .env.production (zincir listesi politika ile belirlenir; production build'ler yalnız Base Mainnet'i açar)
# VITE_API_URL'i boş bırakın: production vercel.json rewrite'ı ile same-origin /api kullanır
VITE_ESCROW_ADDRESS=<MAINNET_ESCROW>
# VITE_USDT_ADDRESS ve VITE_USDC_ADDRESS → gerçek Base USDT/USDC adresleri
# Base USDT: 0xfde4C96c8593536E31F229EA8f37b2ADa2699bb2
# Base USDC: 0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913
# Opsiyonel: VITE_RPC_URL (birincil RPC, public RPC yedek kalır)

vercel --prod
```

### Mainnet Kontrol Listesi

- [ ] Güvenlik denetim raporu hazır ve bulgular çözüldü
- [ ] Gnosis Safe multisig yapılandırıldı (min 3/5)
- [ ] AWS KMS aktif ve şifreli data key test edildi
- [ ] `NODE_ENV=production` — MockERC20 deploy edilmedi ✅
- [ ] `BASE_MAINNET_USDT_ADDRESS` ve `BASE_MAINNET_USDC_ADDRESS` tanımlı (Base Mainnet için zorunlu)
- [ ] `setTokenConfig` sonrası zincir üstü doğrulamaları loglarda gördün (`getTokenConfig(token).supported == true`)
- [ ] Kontrat ve iki library BaseScan'de doğrulandı
- [ ] Ownership final owner'a devredildi ✅
- [ ] `pause()` / `unpause()` owner'dan (Gnosis Safe) çalışıyor
- [ ] Event listener WSS RPC'de stabil (yalnız HTTP çalışır ama uyarı loglar; `/ready` `wsConfigured` raporlar)
- [ ] DLQ derinliği `GET /api/admin/summary` (`dlq`) ile izleniyor; yerleşik alarm webhook'u yoktur
- [ ] `GET /health` => yalnız liveness (process ayakta; worker bayatsa `503`)
- [ ] `GET /ready` => readiness/startup kapısı (Mongo/Redis/provider/config/worker kontrolleri)
- [ ] Frontend'de gerçek USDT/USDC adresleri doğru
- [ ] Frontend `.env` auto-write production'da atlandı (beklenen davranış)
- [ ] SIWE domain production domain'iyle eşleşiyor
- [ ] Rate limit testleri geçti

---

## 5. Ortam Farkları Özeti

| Parametre | Local | Testnet | Mainnet |
|-----------|-------|---------|---------|
| `NODE_ENV` | `development` | `production` | `production` |
| `KMS_PROVIDER` | `env` | `aws` / `vault` (veya `env` + `ALLOW_ENV_KMS_ON_TESTNET=yes` istisnası) | `aws` / `vault` |
| `MockERC20` | ✅ Deploy edilir | ❌ Deploy edilmez (Sepolia token'ları) | ❌ Deploy edilmez |
| `EXPECTED_CHAIN_ID` | `31337` | `84532` | `8453` |
| `SIWE_DOMAIN` | `localhost` | frontend host'u (örn. `*.vercel.app`) | gerçek domain |
| Treasury | Test cüzdanı | Test cüzdanı | Gnosis Safe |
| Relayer | Hardhat cüzdanı | Ayrı test cüzdanı | `RELAYER_PRIVATE_KEY` (opsiyonel; harici otomasyon planlı) |
| RPC | `http://localhost:8545` | Alchemy Sepolia | Alchemy/Infura Base |
| WSS RPC | Gerekli değil | Önerilir | Önerilir (kod yalnız uyarır) |
| Redis TLS | opsiyonel | **Zorunlu** (`rediss://`) | **Zorunlu** |
| Denetim | Hayır | Hayır | **Zorunlu** |

### Hızlı Komut Referansı

```bash
# Testler
cd contracts && npx hardhat test

# Local deploy (`npx hardhat node` ile açılan node)
npx hardhat run scripts/deploy.js --network localhost

# Testnet deploy
CONFIRM_PUBLIC_DEPLOY=yes npx hardhat run scripts/deploy.js --network base-sepolia

# Mainnet deploy
CONFIRM_PUBLIC_DEPLOY=yes NODE_ENV=production npx hardhat run scripts/deploy.js --network base

# Migration'lar (backend/ dizininden; bkz. 8. bölüm)
npm run migrate:identity:dry
node scripts/migrations/backfillTerminalTradeStats.js            # dry-run
node scripts/migrations/dedupeRevenueEvents.js                   # dry-run

# Fly.io backend logları
fly logs --app araf-protocol-backend

# Fly.io secret güncelle
fly secrets set KEY=VALUE

# Vercel production deploy
cd frontend && vercel --prod
```

### Faydalı Linkler

| Servis | Link |
|--------|------|
| Base Sepolia Faucet | `faucet.quicknode.com` |
| BaseScan Testnet | `sepolia.basescan.org` |
| BaseScan Mainnet | `basescan.org` |
| Alchemy | `dashboard.alchemy.com` |
| Fly.io Dashboard | `fly.io/dashboard` |
| Vercel Dashboard | `vercel.com/dashboard` |
| Gnosis Safe | `app.safe.global` |
| AWS KMS | `console.aws.amazon.com/kms` |

---

## 6. Ortam Değişkenleri Referansı

Koddaki her `process.env` / `import.meta.env` kullanımından çıkarılmıştır. *Zorunlu*, belirtilen ortamda servisin başlaması ya da hazır olması için gerekli demektir; `—` varsayılan yok demektir. Opsiyonel tamsayı değişkenler katı bir parser kullanır: pozitif olmayan, tamsayı olmayan ya da boş değer sessizce varsayılana düşer. `backend/`, `frontend/` ve `contracts/` altındaki `.env.example` dosyaları bu listeyi yansıtır.

### 6.1 Backend — çekirdek, Mongo, Redis

| Değişken | Zorunlu | Varsayılan | Not |
|---|---|---|---|
| `NODE_ENV` | prod: `production` | — | Production aşağıdaki fail-closed korumaları açar (KMS, CORS, SIWE, Redis TLS, chain id). `fly.toml` set eder. |
| `PORT` | hayır | `4000` | `fly.toml` `4000` verir. |
| `LOG_DIR` | hayır | `backend/logs` | Log dosyası `araf.log` (25 MB × 5 rotasyon). |
| `MONGODB_URI` | **evet** | — | Migration script'leri `MONGO_URI`'yi de kabul eder. |
| `REDIS_URL` | prod: **evet** | `redis://127.0.0.1:6379` (yalnız prod dışı) | Production TLS ister. |
| `REDIS_TLS` | hayır | `false` | `true` ya da `rediss://` URL'si TLS açar; production'da zorunlu. |
| `REDIS_TLS_SKIP_VERIFY` | hayır | `false` | Yalnız self-signed geliştirme Redis'i için; production'da `true` açılışı durdurur. |
| `REDIS_READY_WAIT_MS` | hayır | `5000` | Redis'in hazır olmasını bekleme süresi. |

### 6.2 Backend — auth, oturum, CORS

| Değişken | Zorunlu | Varsayılan | Not |
|---|---|---|---|
| `JWT_SECRET` | **evet** | — | ≥ 64 karakter, entropy ≥ 3.5, placeholder reddedilir. |
| `JWT_EXPIRES_IN` | hayır | `15m` | Auth JWT ömrü (cookie `maxAge` sabit 15 dk'dır). |
| `PII_TOKEN_EXPIRES_IN` | hayır | `15m` | Trade-scoped PII token ömrü. |
| `JWT_BLACKLIST_TIMEOUT_MS` | hayır | `1500` | Redis blacklist okuma zaman aşımı. |
| `JWT_BLACKLIST_FAIL_MODE` | hayır | production'da `closed`, diğerlerinde `open` | Blacklist okunamazsa davranış (`closed` isteği reddeder). |
| `REFRESH_ABSOLUTE_TTL_SECS` | hayır | `2592000` (30 g) | Mutlak oturum ömrü; rotasyonlar uzatamaz (kayan refresh penceresi sabit 7 g'dür). |
| `REFRESH_REUSE_GRACE_MS` | hayır | `10000` | Aynı refresh token'ın bu pencerede ikinci kez gelmesi iki-sekme yarışı sayılır. |
| `REFRESH_LEGACY_SCAN` | hayır | açık | Oturum indeksinden önce açılmış oturumlar için tek seferlik SCAN'ı kapatmak için `false` (bunu getiren deploy'dan ~7 gün sonra önerilir). |
| `SIWE_DOMAIN` | prod: **evet** | `localhost` (prod dışı) | Production'da `localhost` olamaz; yalnız host, şema yok. |
| `SIWE_URI` | prod: **evet** | `https://<SIWE_DOMAIN>` (prod dışı) | Production'da `https://` olmalı ve host'u `SIWE_DOMAIN`'e eşit olmalı. |
| `ALLOWED_ORIGINS` | prod: **evet** | `http://localhost:5173` (prod dışı) | Virgülle ayrılmış; her biri yalın http(s) origin'i; production'da wildcard ve yalnız-localhost fallback yok. |
| `ADMIN_WALLETS` | hayır | boş (kimse) | `/api/admin/*` ve `/api/auth/me` içindeki `isAdmin` için virgülle ayrılmış cüzdanlar. |

### 6.3 Backend — şifreleme (KMS)

| Değişken | Zorunlu | Varsayılan | Not |
|---|---|---|---|
| `KMS_PROVIDER` | production'da **evet** | `env` | `env` (yalnız geliştirme) · `aws` · `vault`. Başka değer hata verir. |
| `MASTER_ENCRYPTION_KEY` | `KMS_PROVIDER=env` | — | 64 hex karakter (ilk 64 kullanılır). Production'da asla. |
| `AWS_ENCRYPTED_DATA_KEY` | `KMS_PROVIDER=aws` | — | Base64 `CiphertextBlob`. |
| `AWS_REGION` | hayır | `eu-west-1` | |
| `VAULT_ADDR` | `KMS_PROVIDER=vault` | — | |
| `VAULT_TOKEN` | `KMS_PROVIDER=vault` | — | |
| `VAULT_KEY_NAME` | hayır | `araf-master-key` | Transit anahtar adı. |
| `VAULT_ENCRYPTED_DATA_KEY` | `KMS_PROVIDER=vault` | — | Sabit `vault:v1:…` wrapped data key; eksikse fail-closed. |

Production açılışta KMS self-test çalıştırır (`runProductionKmsStartupSelfTest`). HKDF türetimi için `PII_ENCRYPTION_MIGRATION.md` dosyasına bakın.

### 6.4 Backend — zincir, kontratlar, token'lar, relayer

| Değişken | Zorunlu | Varsayılan | Not |
|---|---|---|---|
| `BASE_RPC_URL` | prod: **evet** | — | Public fallback yok. |
| `BASE_WS_RPC_URL` | hayır (önerilir) | — | `wss://` ile başlamalı, aksi halde HTTP provider kullanılır. |
| `EXPECTED_CHAIN_ID` | prod: **evet** (`BASE_RPC_URL` tanımlıyken de) | — | Her pozitif tamsayı kabul edilir (`expectedChain.js`); production'daki `8453` / `84532` kısıtı token env çözümlemesinden (`tokenEnv.js`) gelir. Provider'lar worker, config, preview ve `/ready` yüzeylerinde buna karşı doğrulanır. |
| `ALLOW_UNSAFE_CHAIN_ID_BYPASS` | hayır | `false` | Yalnız prod dışı: `EXPECTED_CHAIN_ID` boşken zincir kontrolünü atlar. |
| `ARAF_ESCROW_ADDRESS` | prod: **evet** | — | Zero address tanımsız sayılır (production çıkar). |
| `ARAF_REVENUE_VAULT_ADDRESS` | hayır | — | Reward mirror event'leri; bu (veya `ARAF_REWARDS_ADDRESS`) yoksa reward mirror izlenmez. |
| `ARAF_REWARDS_ADDRESS` | hayır | — | Ayrıca `rewardOutcomeRecorder`'ı etkinleştirir. |
| `BASE_MAINNET_USDT_ADDRESS`, `BASE_MAINNET_USDC_ADDRESS` | prod, 8453'te (`ARAF_TRACKED_TOKENS` yoksa) | — | Kanonik token env'leri; production'da zero address reddedilir. |
| `BASE_SEPOLIA_USDT_ADDRESS`, `BASE_SEPOLIA_USDC_ADDRESS` | prod, 84532'de (`ARAF_TRACKED_TOKENS` yoksa) | — | |
| `MAINNET_USDT_ADDRESS`, `MAINNET_USDC_ADDRESS` | hayır | — | Yalnız 8453 için legacy alias'lar; production'da 84532'de reddedilir. |
| `USDT_ADDRESS`, `USDC_ADDRESS` | hayır | — | Legacy fallback, yalnız prod dışı (uyarı loglar). |
| `ARAF_TRACKED_TOKENS` | hayır | yukarıdaki çiftten türetilir | Virgülle ayrılmış token adresleri; önceliklidir; production'da geçersiz/zero giriş açılışı durdurur. |
| `RELAYER_PRIVATE_KEY` | hayır | — | `reputationDecay` ve `rewardOutcomeRecorder`'ı etkinleştirir; yoksa görevler hata loglayıp pasif kalır. |
| `REPUTATION_DECAY_CANDIDATE_LIMIT` | hayır | `250` | |
| `REPUTATION_DECAY_TX_LIMIT` | hayır | `50` | |
| `REWARD_RECORDER_CANDIDATE_LIMIT` | hayır | `200` | |
| `REWARD_RECORDER_BATCH_LIMIT` | hayır | `50` | |

### 6.5 Backend — event worker ve health

| Değişken | Zorunlu | Varsayılan | Not |
|---|---|---|---|
| `ARAF_DEPLOYMENT_BLOCK` | prod: evet, Redis checkpoint yoksa | — | Replay başlangıç bloğu (`WORKER_START_BLOCK`'a göre önceliklidir). `/ready` tarafından da kontrol edilir. |
| `WORKER_START_BLOCK` | yukarıdakine alternatif | — | |
| `WORKER_DISABLED` | hayır | `false` | `true` = worker hiç başlamaz (yalnız API). |
| `WORKER_FINALITY_DEPTH` | hayır | prod `6` / diğer `1` | Safe-checkpoint derinliği. |
| `WORKER_BLOCK_BATCH_SIZE` | hayır | `1000` | Replay batch boyutu. |
| `WORKER_CHECKPOINT_INTERVAL_BLOCKS` | hayır | `50` | |
| `WORKER_REPLAY_BACKOFF_BASE_MS` | hayır | `5000` | Replay yeniden deneme backoff tabanı. |
| `WORKER_REPLAY_BACKOFF_MAX_MS` | hayır | `300000` | Replay yeniden deneme backoff tavanı. |
| `WORKER_BLOCK_STALE_MS` | hayır | `75000` | Bu süre yeni blok yoksa watchdog reconnect dener; hâlâ yoksa süreç çıkar. |
| `WORKER_WATCHDOG_INTERVAL_MS` | hayır | `15000` | |
| `WORKER_LIVENESS_STALE_MS` | hayır | `BLOCK_STALE*2 + 30000` (= 180000) | `/health` bunu aşınca `503 "stale"` döner. |
| `WORKER_MAX_LAG_BLOCKS` | hayır | `25` | `/ready` bu gecikmeyi (safe checkpoint ile provider başı arası) aşınca `503` olur. |
| `READY_INTERNAL_TOKEN` | hayır | tanımsız (özellik kapalı) | `/ready`'nin tam gövdesini açan `x-internal-token` header değeri. Secret. |
| `READY_CACHE_TTL_MS` | hayır | `7000` | 5000–10000 aralığına sıkıştırılır. |

### 6.6 Backend — identity migration guard

| Değişken | Zorunlu | Varsayılan | Not |
|---|---|---|---|
| `IDENTITY_NORMALIZATION_GUARD` | hayır | production'da `enforce`, diğerlerinde `warn` | `off` · `warn` · `enforce`. Legacy numeric id varken `enforce` açılışı durdurur. |
| `PII_IDENTITY_NORMALIZATION_GUARD` | hayır | yukarıdaki değişkene, o da yoksa `enforce`'a düşer | PII route'larının tembel (lazy) kullandığı mod (`503 IDENTITY_NORMALIZATION_REQUIRED`). |
| `IDENTITY_MIGRATION_BATCH_SIZE` | hayır | `1000` | `migrate:identity` batch boyutu. |

### 6.7 Backend — zamanlanmış işler (aksi belirtilmedikçe ms; en çok 2 147 483 647)

| Değişken | Varsayılan |
|---|---|
| `JOB_DLQ_INTERVAL_MS` | `60000` |
| `JOB_REPUTATION_DECAY_DELAY_MS` / `JOB_REPUTATION_DECAY_INTERVAL_MS` | `30000` / `86400000` |
| `JOB_REWARD_RECORDER_INTERVAL_MS` | `3600000` |
| `JOB_STATS_SNAPSHOT_DELAY_MS` / `JOB_STATS_SNAPSHOT_INTERVAL_MS` | `60000` / `86400000` |
| `JOB_SENSITIVE_CLEANUP_DELAY_MS` / `JOB_SENSITIVE_CLEANUP_INTERVAL_MS` | `120000` / `1800000` |
| `JOB_USER_BANK_RISK_CLEANUP_DELAY_MS` / `JOB_USER_BANK_RISK_CLEANUP_INTERVAL_MS` | `150000` / `21600000` |
| `JOB_RECONCILIATION_ENABLED` | production: `false` verilmedikçe açık; diğerlerinde `true` verilmedikçe kapalı |
| `JOB_RECONCILIATION_INTERVAL_MS` | `600000` |
| `USER_BANK_RISK_CLEANUP_CURSOR_BATCH_SIZE` | `200` |

### 6.8 Backend — önbellekler, limitler, referans kur

| Değişken | Varsayılan | Not |
|---|---|---|
| `CONFIG_CACHE_TTL_SECONDS` | `3600` | Protokol config mirror önbelleği. |
| `MARKET_CACHE_TTL_MS` | `10000` (`NODE_ENV=test` iken `0`) | `GET /api/orders` yanıt önbelleği; `0` kapatır. |
| `RATE_LIMIT_TIER_CACHE_TTL_SECONDS` | `120` | Tier'lı limiter'lar için tier sorgu önbelleği. |
| `REFERENCE_TICKER_REFRESH_INTERVAL_MS` | `120000` | Scheduler aralığı. |
| `REFERENCE_TICKER_CRYPTO_TTL_SECONDS` | `120` | |
| `REFERENCE_TICKER_FIAT_TTL_SECONDS` | `21600` | |
| `REFERENCE_TICKER_LAST_GOOD_TTL_SECONDS` | `604800` | |
| `REFERENCE_TICKER_MAX_STALE_SECONDS` | `86400` | Bundan eski satırlar son-iyi birleştirmesinden düşürülür. |

### 6.9 Frontend (`VITE_*` — tarayıcı bundle'ında hepsi public)

| Değişken | Zorunlu | Varsayılan | Not |
|---|---|---|---|
| `VITE_API_URL` | hayır | dev: `http://localhost:4000/api`; prod: `/api` | Production build'de mutlak URL reddedilir (cookie modeli same-origin `/api` ister). Eksik `/api` soneki eklenir. |
| `VITE_ESCROW_ADDRESS` | **evet** | — | Sıfır/boş adres kontrat aksiyonlarını kapatır ve env hatası gösterir. Backend'in `deployment.escrowAddress` değeriyle karşılaştırılır. |
| `VITE_USDT_ADDRESS`, `VITE_USDC_ADDRESS` | **evet** | — | Token adresleri. |
| `VITE_REVENUE_VAULT_ADDRESS` | rewards için | — | `VITE_REWARDS_VAULT_ADDRESS` legacy alias'tır (yalnız `App.jsx`'te kullanılır). |
| `VITE_REWARDS_ADDRESS` | rewards için | — | |
| `VITE_RPC_URL` | hayır | — | Birincil RPC (public RPC yedek kalır); http(s) olmayan değerler yok sayılır. Production'da Base'e, geliştirmede Base Sepolia'ya uygulanır. |
| `VITE_ENABLE_UI_LAB` | hayır | `false` | `true`, UI Lab senaryo kontrolcüsünü production-mode build'e bile koyar; public'te `false` bırakın. |
| `VITE_SOCIAL_GITHUB` | hayır | proje repo URL'si | |
| `VITE_SOCIAL_TWITTER`, `VITE_SOCIAL_FARCASTER` | hayır | boş (link gizlenir) | |

`import.meta.env.PROD` / `DEV` Vite'ın yerleşik değerleridir; zincir listesini (production = yalnız Base) ve mint faucet'ini (yalnız production olmayan) seçerler. `VITE_ADMIN_WALLETS` artık yoktur: admin durumu `/api/auth/me` içindeki `isAdmin`'den gelir.

### 6.10 Kontratlar (Hardhat ve script'ler)

| Değişken | Kullanan | Not |
|---|---|---|
| `BASE_RPC_URL` / `BASE_SEPOLIA_RPC_URL` | `hardhat.config.js` | Sırasıyla `--network base` / `base-sepolia` için zorunlu (fail-closed; public RPC yok). |
| `DEPLOYER_PRIVATE_KEY` | `hardhat.config.js` | Public ağlar için imzalayıcı. Asla commit etmeyin. |
| `BASESCAN_API_KEY` | `hardhat.config.js` | `hardhat verify`. |
| `REPORT_GAS`, `CMC_API_KEY` | `hardhat.config.js` | Gas reporter. |
| `ARAF_SOLCJS_PATH` | `hardhat.config.js` | Opsiyonel: native derleyicinin indirilemediği ortamlar için `solc@0.8.24` paketinin `soljson.js` yolu. Tanımsızsa etkisizdir. |
| `TREASURY_ADDRESS` | `deploy.js` | Her deploy için zorunlu; `deployRewards.js` yerelde yeni escrow deploy etmesi gerekiyorsa da ister. |
| `FINAL_OWNER_ADDRESS` | `deploy.js`, `deployRewards.js` | Public/custom zincirlerde zorunlu ve `TREASURY_ADDRESS`'ten farklı olmalı; local varsayılan = treasury; rewards owner varsayılanı = deployer. |
| `CONFIRM_PUBLIC_DEPLOY` | `deploy.js` | `base` / `base-sepolia` üzerinde `yes` olmalı. |
| `BASE_MAINNET_USDT_ADDRESS`, `BASE_MAINNET_USDC_ADDRESS` (+ legacy `MAINNET_*`) | `deploy.js`, `deployRewards.js` | Zincir 8453. |
| `BASE_SEPOLIA_USDT_ADDRESS`, `BASE_SEPOLIA_USDC_ADDRESS` | `deploy.js`, `deployRewards.js` | Zincir 84532 (`MAINNET_*` reddedilir). |
| `USE_EXTERNAL_TOKEN_ADDRESSES`, `EXTERNAL_USDT_ADDRESS`, `EXTERNAL_USDC_ADDRESS` | `deploy.js` | Yalnız local/custom zincirler. |
| `NODE_ENV` | `deploy.js` | `production` yapılandırılmış token adreslerini zorunlu kılar. |
| `CODESPACE_NAME` | `deploy.js` | Yalnız local: Codespaces için `frontend/.env` içindeki `VITE_API_URL`'i de yeniden yazar. |
| `ARAF_ESCROW_ADDRESS` | `deployRewards.js`, `rewardsOps.js` | Mevcut escrow (public zincirlerde zorunlu). |
| `FINAL_TREASURY_ADDRESS` | `deployRewards.js` | Public zincirlerde zorunlu; local varsayılan = deployer. |
| `CONFIRM_FRESH_ESCROW_DEPLOY` | `deployRewards.js` | Yalnız hata metnini değiştirir; bu script public zincirde yeni escrow deploy etmez. |
| `CONFIRM_OVERWRITE_REWARDS_MANIFEST` | `deployRewards.js` | Mevcut `<network>-rewards.json` içindeki kritik adresleri ezmek için `yes` gerekir. |
| `ARAF_REVENUE_VAULT_ADDRESS`, `ARAF_REWARDS_ADDRESS`, `USDT_ADDRESS`, `USDC_ADDRESS` | `rewardsOps.js` | Önce env, sonra `deployments/<network>-rewards.json`. |
| `REWARDS_OP` | `rewardsOps.js` | `configure` · `verify` · `switch-treasury` (ya da npm script adından çıkarılır). |
| `CONFIRM_TREASURY_SWITCH`, `EXPECTED_CURRENT_TREASURY_ADDRESS` | `rewardsOps.js` | Escrow treasury'sini vault'a geçirmek için ikisi de gerekir. |
| `EXPECT_ESCROW_TREASURY_ADDRESS` | `rewardsOps.js` | `verify` için opsiyonel ek kontrol. |
| `ALLOW_NON_4000_REWARD_BPS` | `rewardsOps.js` | `true`, `switch-treasury`'deki "`rewardBps` 4000 olmalı" go-live kontrolünü atlar. |
| `CONFIRM_PUBLIC_SMOKE` | `smokeRewards.js` | Local olmayan ağlarda `yes` gerekir. |
| `GAS_BASELINE_OUT` | `gasBaseline.js` | JSON tablosunun opsiyonel çıktı yolu. |

> `verify:rewards`, `configure:rewards` ve `switch:rewards:treasury` aynı `rewardsOps.js`'i çalıştırır; işlem npm script adından seçilir, bu yüzden `npm run` ile çağırın (ya da `REWARDS_OP` verin).

`REWARD_BPS`, `CONFIRM_CONFIGURE_REWARDS`, `REWARDS_READ_ONLY` ve `REWARDS_SOURCE` `.env.example` dosyalarında geçer ama hiçbir kod tarafından okunmaz; belge amaçlı sabitlerdir.

---

## 7. Kontrat Deploy Sırası

`ArafEscrow` iki harici library'ye linklenir (EIP-170 boyut bütçesi); library adresleri escrow bytecode'una gömülür ve sonradan değiştirilemez.

**Escrow (`contracts/scripts/deploy.js`)**
1. Korumalar: public zincirler (8453/84532) `CONFIRM_PUBLIC_DEPLOY=yes` ister; deployer bakiyesi > 0 olmalı; `TREASURY_ADDRESS` zorunlu; public/custom zincirlerde `FINAL_OWNER_ADDRESS` zorunlu (treasury'den farklı).
2. Token'lar: public zincirler `BASE_*_USDT/USDC_ADDRESS` okur; `USE_EXTERNAL_TOKEN_ADDRESSES=true` değilse local iki `MockERC20` (6 ondalık) deploy eder.
3. `ArafReputationLib` → `ArafSettlementLib` (birbirinden bağımsız) → ikisine linkli `ArafEscrow` (`constructor(treasury)`).
4. USDT ve USDC için `setTokenConfig` (supported, sell/buy açık, 6 ondalık, varsayılan tier limitleri); her biri `getTokenConfig` ile yeniden okunup karşılaştırılır, uyuşmazlık deploy'u durdurur.
5. Yapılandırma doğrulandıktan sonra `transferOwnership(FINAL_OWNER_ADDRESS)`.
6. Manifest `contracts/deployments/<network>.json` (escrow, `libraries`, `libraryDeployTxHashes`, token'lar, fee/cooldown snapshot'ı). Yalnız local: `frontend/.env` güncellenir.

**Rewards (`contracts/scripts/deployRewards.js`)** — escrow var olduktan sonra çalıştırılır (public zincirler `ARAF_ESCROW_ADDRESS` ister; boşsa local linkli bir escrow deploy eder):
1. `ArafRevenueVault(escrow, finalTreasury, owner)` → `ArafRewards(escrow, vault, owner)`.
2. `vault.setRewards(rewards)` — **tek seferlik**: ikinci çağrı revert eder (`RewardsAlreadySet`); yanlış adres vault'u yeniden deploy etmek demektir.
3. `vault.setSupportedToken(usdt|usdc, true)`; `rewardBps` `4000` okunmalı (izinli aralık 4000–7000).
4. `deployments/<network>-rewards.json` yazılır ve ABI'ler `contracts/abi/`'ya aktarılır. Değişmiş kritik adreslerin ezilmesi `CONFIRM_OVERWRITE_REWARDS_MANIFEST=yes` ister.
5. npm kısayolları `base-sepolia`'yı hedefler (`deploy:rewards:base-sepolia`); Base Mainnet için `npx hardhat run scripts/deployRewards.js --network base` çalıştırın.

**Rewards operasyonları (`contracts/scripts/rewardsOps.js`)** — `configure:rewards` (yalnız idempotent wiring), `verify:rewards` (salt okunur go-live kontrolleri), `switch:rewards:treasury` (`escrow.setTreasury(vault)`; `CONFIRM_TREASURY_SWITCH=true` ve `EXPECTED_CURRENT_TREASURY_ADDRESS` ister; imzalayıcı escrow owner'ı olmalı). Treasury switch bilinçli olarak deploy'dan ve `configure`'dan ayrıdır.

**Sonrasında backend bağlantısı:** `ARAF_ESCROW_ADDRESS`, `ARAF_REVENUE_VAULT_ADDRESS`, `ARAF_REWARDS_ADDRESS` ve `ARAF_DEPLOYMENT_BLOCK` ayarlanır, sonra backend deploy edilir; frontend: `VITE_ESCROW_ADDRESS`, `VITE_REVENUE_VAULT_ADDRESS`, `VITE_REWARDS_ADDRESS`.

**solc-js yedeği:** native derleyici indirilemiyorsa `ARAF_SOLCJS_PATH`'i `solc@0.8.24` paketinin `soljson.js` yoluna ayarlayın; Hardhat 0.8.24 için onu kullanır (derleyici ayarları: optimizer 200 run, `viaIR`, `evmVersion: cancun`).

---

## 8. Migration'lar ve MongoDB Notları

Script'leri `backend/` dizininden çalıştırın (`node scripts/migrations/<ad>.js`). `MONGODB_URI` (ya da `MONGO_URI`) değerini ortamdan/`.env`'den okurlar. Fly'da: `fly ssh console -C "node scripts/migrations/<ad>.js"`.

| Script | Varsayılan mod | Anahtar | Amaç |
|---|---|---|---|
| `normalizeIdentityFields.js` (`npm run migrate:identity`) | **yazar** | varsayılan dry-run; yazmak için `--apply` (`npm run migrate:identity:dry` = dry-run, `npm run migrate:identity` = `--apply`; `--dry-run` geriye dönük kabul, uyarı verir) | Legacy numeric `Order.onchain_order_id`, `Trade.onchain_escrow_id`, `Trade.parent_order_id` değerlerini kanonik string'e çevirir. |
| `backfillTerminalTradeStats.js` | dry-run | `--apply` | Kalıcı `TerminalTradeStat` sayaçlarını mevcut terminal trade'lerden doldurur. Idempotent (`trade_key` üzerinde `$setOnInsert`). |
| `backfillLastBanEndsAt.js` (`npm run migrate:last-ban-ends-at`; `:dry` = dry-run) | dry-run | `--apply` | `banned_until`'i daha önce null'lanmış kullanıcılar için `User.last_ban_ends_at` alanını zincirden (`getReputation().bannedUntil`) doldurur; ban affı işi bu kullanıcıları aday görsün diye. Idempotent, salt-okunur RPC (`BASE_RPC_URL`, `ARAF_ESCROW_ADDRESS`). |
| `dedupeRevenueEvents.js` | dry-run | `--apply` | Eski worker'ın yazdığı mükerrer `RevenueEvent` satırlarını siler (aynı tx/token/amount/kind/trade için vault satırını tekrarlayan escrow satırı). Idempotent. |

Yükseltme için işlem sırası:
1. Yeni backend'den **önce**: `npm run migrate:identity:dry`, numeric id raporlarsa ardından `npm run migrate:identity`. `IDENTITY_NORMALIZATION_GUARD` production'da varsayılan `enforce`'tur; legacy id varken backend başlamaz.
2. Yeni backend'i deploy edin.
3. Yeni backend yayına girdikten **sonra** `backfillTerminalTradeStats.js` çalıştırın (önce dry-run, sonra `--apply`). Sıra önemlidir: eski backend sayaç yazmaz, bu yüzden sayaç ancak yeni backend çalışırken kayıpsız dolar; backfill idempotent olduğundan rollout sırasında yeni backend'in yazdığı satırlarla çakışmaz ve tekrar çalıştırmak güvenlidir.
4. `dedupeRevenueEvents.js` düzeltilmiş worker deploy edildikten sonra bir kez (önce dry-run, sonra `--apply`); 3. adımdan bağımsızdır.

HKDF değişikliği sonrası PII'ın yeniden şifrelenmesi için repoda bir araç yoktur; bkz. `PII_ENCRYPTION_MIGRATION.md`.

**MongoDB indeks notları**
- Mongoose, modellerde tanımlı indeksleri açılışta kurar (`autoIndex` kapatılmamıştır); `syncIndexes` çağrısı yoktur, bu yüzden bir indeksi modelden silmek veritabanından düşürmez.
- Unique indeksler: `Trade.onchain_escrow_id` (sparse), `Order.onchain_order_id`, `Order.refs.order_ref`, `User.wallet_address`, `TermsAcceptance(wallet_address, terms_version)`, `HistoricalStat.date`, `TerminalTradeStat.trade_key`, ve `RevenueEvent`, `RewardClaim`, `RewardFunding` ile allocation event'leri üzerinde `(tx_hash, log_index)`; `RewardEpoch(epoch, token)`.
- TTL indeksleri: `Trade.timers.resolved_at` (365 gün, yalnız terminal durumlar), `User.last_login` (2 yıl), `Feedback.created_at` (365 gün). `TerminalTradeStat`'ta bilinçli olarak TTL yoktur; böylece kümülatif istatistikler Trade süresi dolunca geri gitmez.
- `Trade.evidence.receipt_delete_at` ve `Trade.payout_snapshot.snapshot_delete_at` üzerindeki sparse retention indeksleri cleanup job'larınca taranır (dekont 30 gün, payout snapshot terminal olduktan sonra kilitten itibaren 30 gün).
- Redis nonce'ları, refresh ailelerini, JWT blacklist'ini, rate-limit sayaçlarını, DLQ'yu ve worker checkpoint'lerini (`worker:last_block`, `worker:last_safe_block`) tutar. Checkpoint'ler kaybolursa worker `ARAF_DEPLOYMENT_BLOCK` / `WORKER_START_BLOCK`'tan yeniden başlar.

---

## 9. Fly.io Çalışma Zamanı ve Health Check

`backend/fly.toml` (uygulama `araf-protocol-backend`, bölge `ams`):
- `[env]`: `PORT=4000`, `NODE_ENV=production`; geri kalan her şey secret'tır (`fly secrets set`).
- `auto_stop_machines = false`, `min_machines_running = 1`: event listener sürekli çalışmalıdır.
- Concurrency `connections`, soft 80 / hard 100; VM `shared` 1 CPU, 512 MB.
- Health check: `GET /health`, 30 sn'de bir, 15 sn grace period, 5 sn timeout; konteyner içinde HTTP (dışarıda `force_https = true`).
- `/health`, worker'a bağlı **liveness** sinyalidir: `WORKER_LIVENESS_STALE_MS` boyunca blok görülmediyse `503 "stale"` döner; bağımsız olarak worker watchdog'u `WORKER_BLOCK_STALE_MS` sonra reconnect dener, bloklar hâlâ gelmiyorsa süreçten çıkar (platform yeniden başlatır). `/ready` (readiness) `fly.toml`'a bağlı değildir; deploy kapıları ve izleme için kullanın (tam ayrıntı `x-internal-token: $READY_INTERNAL_TOKEN` ile).
- İmaj (`backend/Dockerfile`) `node:22-alpine`'dir, `npm ci --omit=dev` ile kurar, root olmayan `nodeapp` kullanıcısıyla çalışır ve `node scripts/app.js` başlatır.

---

*Araf Protocol — "Trust the Time, Not the Oracle."*

## Deployment hardening baseline (Production)

### Runtime / image policy
- Backend container base image: **Node 22 LTS Alpine**.
- İmajda dependency kurulumu lockfile yolunu kullanmalıdır: `npm ci --omit=dev`.
- Container runtime kullanıcısı **non-root** olmalıdır (`USER nodeapp` veya eşdeğeri).

### Frontend build policy
- Vite production build sourcemap politikası açıkça belirlidir: `build.sourcemap=false`.
- `VITE_*` değişkenleri tarayıcıda build/runtime'da **public**'tir. API key, private key, JWT secret, DB URL veya herhangi bir secret'ı asla `VITE_*` değişkenlerine koymayın.

### Gerekli / yasak ortam matrisi (production)
- Zorunlu: `NODE_ENV=production`, `MONGODB_URI`, `REDIS_URL` (TLS), `JWT_SECRET`, `SIWE_DOMAIN`, `SIWE_URI`, `ARAF_ESCROW_ADDRESS`, `BASE_RPC_URL`, `ALLOWED_ORIGINS`, `EXPECTED_CHAIN_ID` (her pozitif tamsayı kabul edilir ama production'da token çözümlemesi yalnız `8453` / `84532` destekler), anahtar değişkenleriyle birlikte `KMS_PROVIDER` (`aws` veya `vault`) ve zincire uygun token adresleri (`BASE_MAINNET_*` / `BASE_SEPOLIA_*` ya da `ARAF_TRACKED_TOKENS`).
- Worker bootstrap için zorunlu: `ARAF_DEPLOYMENT_BLOCK` veya `WORKER_START_BLOCK` (veya mevcut redis checkpoint).
- Production'da yasak/güvensiz: `KMS_PROVIDER=env` (tek istisna: `EXPECTED_CHAIN_ID=84532` + `ALLOW_ENV_KMS_ON_TESTNET=yes`), `REDIS_TLS_SKIP_VERIFY=true`, wildcard `ALLOWED_ORIGINS=*`, yalnız-localhost fallback origin'leri, `SIWE_DOMAIN=localhost` ve eksik `BASE_RPC_URL`.
- Güvenli geliştirme varsayılanları (yalnız local): localhost `ALLOWED_ORIGINS`, opsiyonel TLS'siz Redis ve mock/token local adresleri.

### Frontend hosting güvenlik header'ları
Frontend hosting için önerilen asgari response header'ları (Nginx/Cloudflare/Vercel eşdeğerleri; `frontend/vercel.json` bunları içerir):
- `Content-Security-Policy` (sıkı allowlist; nonce/hash kontrollü değilse unsafe-inline yok)
- `Strict-Transport-Security: max-age=31536000; includeSubDomains; preload`
- `X-Content-Type-Options: nosniff`
- `Referrer-Policy: strict-origin-when-cross-origin`
- `Permissions-Policy: geolocation=(), microphone=(), camera=()` (yalnız gerekirse genişletin)

### Cache policy
- `index.html`: `Cache-Control: no-cache, no-store, must-revalidate`
- versiyonlu statik asset'ler (`/assets/*`): `Cache-Control: public, max-age=31536000, immutable`
- `/health` (liveness) ve `/ready` (readiness) önbelleklenmeyen health endpoint'leri olarak kalmalıdır.
