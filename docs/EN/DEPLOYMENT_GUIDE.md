# Araf Protocol — Deployment Guide

> **Version:** 2.1 | **Last Updated:** October 2026 (last verified: 2026-10-22)
>
> This guide covers three environments: Local Development · Public Testnet (Base Sepolia) · Mainnet (Base)
>
> The source of truth is the code (`backend/scripts`, `frontend/src`, `contracts/scripts`, `contracts/hardhat.config.js`, `backend/fly.toml`). The complete environment variable list is in [section 6](#6-environment-variable-reference).

---

## Table of Contents

1. [Local Development](#1-local-development)
2. [Common Local Issues (Troubleshooting)](#2-common-local-issues-troubleshooting)
3. [Public Testnet — Base Sepolia](#3-public-testnet--base-sepolia)
4. [Mainnet — Base](#4-mainnet--base)
5. [Environment Differences Summary](#5-environment-differences-summary)
6. [Environment Variable Reference](#6-environment-variable-reference)
7. [Contract Deploy Order](#7-contract-deploy-order)
8. [Migrations and MongoDB Notes](#8-migrations-and-mongodb-notes)
9. [Fly.io Runtime and Health Check](#9-flyio-runtime-and-health-check)
10. [Deployment hardening baseline (Production)](#deployment-hardening-baseline-production)

---

## 1. Local Development

### Prerequisites
- Node.js 22 LTS (the backend image is `node:22-alpine` and CI runs Node 22)
- Docker Desktop (easiest way for MongoDB and Redis)
- MetaMask — Hardhat network will be added

### Step 1 — Database & Cache (Setup via Docker)
MongoDB and Redis must be running for the backend to function. If Docker is installed, you can start them in the background by running these commands in your terminal:

```bash
# Start MongoDB
docker run -d --name araf-mongo -p 27017:27017 mongo:latest

# Start Redis
docker run -d --name araf-redis -p 6379:6379 redis:latest
```
*(To stop: `docker stop araf-mongo araf-redis`)*

### Step 2 — Install Dependencies

```bash
nvm use          # Node 22 (.nvmrc)
npm run setup    # npm ci: contracts + backend + frontend
```

Same install path as the README "Setup" section; the root script runs `npm ci` in all three packages. For the Node 22 toolchain (`nvm use`), env file copies and the full command list, see [README → Setup](../../README.md#-kurulum--setup).

### Step 3 — Terminal 1: Hardhat Node

```bash
cd contracts
npx hardhat node
```

The output will list 20 test wallets and their private keys. `Account #0` will be used as the deployer, and `Account #1` as the treasury.

### Step 4 — Terminal 2: Deploy Contracts

```bash
# Create contracts/.env file
cat > contracts/.env << 'EOF'
# Enter Account #1 address here (local deploys use the node's own accounts; DEPLOYER_PRIVATE_KEY is not needed)
TREASURY_ADDRESS=0x70997970C51812dc3A010C7d01b50e0d17dc79C8
EOF

# `localhost` targets the node from Step 3 (`--network hardhat` is a throw-away in-process network)
npx hardhat run scripts/deploy.js --network localhost
```

The script deploys, in order, `ArafReputationLib`, `ArafSettlementLib`, the library-linked `ArafEscrow` and two `MockERC20` tokens, configures and verifies the USDT/USDC token configs, and writes a manifest to `contracts/deployments/localhost.json` (escrow, libraries, tokens). On local networks it also writes `VITE_ESCROW_ADDRESS`, `VITE_USDT_ADDRESS` and `VITE_USDC_ADDRESS` into `frontend/.env` (created from `frontend/.env.example` when missing). Note the printed addresses:

```text
Escrow        : 0x...
USDT          : 0x...
USDC          : 0x...
```

### Step 5 — Terminal 2: Backend Configuration

```bash
# Create backend/.env file
cat > backend/.env << 'EOF'
PORT=4000
NODE_ENV=development

MONGODB_URI=mongodb://127.0.0.1:27017/araf_dev
REDIS_URL=redis://127.0.0.1:6379

# Generate a minimum 64-character string (entropy is checked, placeholders are rejected):
# node -e "console.log(require('crypto').randomBytes(64).toString('hex'))"
JWT_SECRET=generate_your_own_64_character_string_here
JWT_EXPIRES_IN=15m
PII_TOKEN_EXPIRES_IN=15m

KMS_PROVIDER=env
# 64 hex characters:
# node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
MASTER_ENCRYPTION_KEY=generate_your_own_64_hex_characters_here

BASE_RPC_URL=http://127.0.0.1:8545
# Required whenever BASE_RPC_URL is set (31337 = Hardhat)
EXPECTED_CHAIN_ID=31337
ARAF_ESCROW_ADDRESS=<address_from_deploy_output>
# Local chain is neither 8453 nor 84532, so the tracked token set is given explicitly
ARAF_TRACKED_TOKENS=<usdt_address_from_deploy_output>,<usdc_address_from_deploy_output>

# Use the Hardhat Account #2 private key for Relayer (optional: without it the reputation-decay and
# reward-outcome jobs stay inactive). Local only: these keys are public; NEVER use them on mainnet.
RELAYER_PRIVATE_KEY=<hardhat_account_2_private_key>

SIWE_DOMAIN=localhost
ALLOWED_ORIGINS=http://localhost:5173
EOF

cd backend && npm run dev
```

> Security note: `BASE_RPC_URL` is explicitly required; the worker does not fall back to a public mainnet RPC. With `BASE_RPC_URL` set, `EXPECTED_CHAIN_ID` is required too (the only escape hatch for local experiments is `ALLOW_UNSAFE_CHAIN_ID_BYPASS=true`, which is ignored in production).

### Step 6 — Terminal 3: Frontend Configuration

`deploy.js` already wrote the three contract addresses into `frontend/.env` in Step 4. Check it and, if needed, adjust it by hand:

```bash
# frontend/.env
VITE_API_URL=http://localhost:4000
VITE_ESCROW_ADDRESS=<address_from_deploy_output>
VITE_USDT_ADDRESS=<usdt_address_from_deploy_output>
VITE_USDC_ADDRESS=<usdc_address_from_deploy_output>

cd frontend && npm run dev
```

### Step 7 — Add MetaMask Hardhat Network

| Field | Value |
|------|-------|
| Network Name | Hardhat Local |
| RPC URL | `http://127.0.0.1:8545` |
| Chain ID | `31337` |
| Currency | ETH |

Import the test private keys provided by Hardhat into your MetaMask.

### Step 8 — Run Tests

```bash
cd contracts

# Including K-04/K-05 fixes — all tests should pass
npx hardhat test

# Coverage report (optional)
npx hardhat coverage
```

Contract tests live in the repository-root `test/contracts/` (see `paths.tests` in `contracts/hardhat.config.js`); backend and frontend tests live in `test/backend/` and `test/frontend/`.

#### Root-level local test commands

The root `package.json` is a thin developer runner. It does not move tests or replace package-local CI commands; each script delegates to the relevant package directory.

```bash
# From the repository root, after package dependencies are installed
npm run test:backend
npm run test:frontend
npm run test:contracts
npm run test:abi-drift

# Deterministic aggregate order:
# backend → frontend → contracts → ABI drift
npm run test:all
```

Package-local commands remain available when you are working inside one package:

```bash
cd backend && npm test
cd ../frontend && npm test
cd ../contracts && npm test
```

### Local Test Checklist

- [ ] `npx hardhat node` — 20 accounts visible
- [ ] `npx hardhat test` — all tests ✅
- [ ] Backend liveness `http://localhost:4000/health` → `{"status":"ok", ...}` (HTTP `503` with `"stale"` if the worker stopped seeing blocks)
- [ ] Backend readiness `http://localhost:4000/ready` → HTTP `200` only when dependencies are ready (redacted body unless `x-internal-token` is sent)
- [ ] Frontend `http://localhost:5173` — opens successfully
- [ ] MetaMask on Hardhat network — `chainId: 31337`
- [ ] Get Test USDT button — mock faucet works (non-production builds only)
- [ ] Full trade lifecycle: create → lock → pay → release

---

## 2. Common Local Issues (Troubleshooting)

The most common issues encountered when developing locally (or in Codespaces) and their solutions:

### ❌ Port Already in Use (EADDRINUSE)
If you get this error when starting the Backend (`4000`) or Frontend (`5173`), there is a "zombie" Node.js process left open in the background.

**Solution (Free up the port):**
```bash
# For Mac and Linux (Kills all node processes):
killall -9 node

# For Windows (PowerShell):
taskkill /F /IM node.exe
```
If you want to kill only a specific port (e.g., 4000):
```bash
# Mac/Linux:
lsof -i :4000
kill -9 <PID_NUMBER>
```

### ❌ MetaMask Nonce Error (Transaction Pending/Stuck)
When you restart the Hardhat node (Terminal 1), the blockchain is "reset". However, your MetaMask wallet remembers the transaction sequence (Nonce) from the old sessions. This locks up the wallet when you try to send a new transaction.

**Solution (Reset Account):**
1. Open the MetaMask extension.
2. Go to **Settings** from the three dots (or profile picture) in the top right.
3. Click the **Advanced** tab.
4. Click the **"Clear Activity Data"** button. (This does not delete your balance or accounts, it only resets the transaction history).

### ❌ Codespaces Resource Limits (Resource Pressure)
GitHub Codespaces (Free tier) can quickly hit RAM limits when running MongoDB, Redis, Hardhat, Backend, and Frontend simultaneously. If your Codespace crashes or the terminal freezes:

**Solution:**
1. Temporarily Stop Docker Containers: If you are only designing the Frontend, shut down the backend/database duo: `docker stop araf-mongo araf-redis`.
2. Clone Locally (Recommended): If you are going to run full integration tests, pull the project directly to your own computer using `git clone` and work without limitations (using Docker Desktop).

### 🔎 Centralized Error Monitoring
Backend log lines (including the frontend crash reports sent to `POST /api/logs/client-error`) go to the console and to a rotating file (`araf.log`, 25 MB × 5 files). The default directory is `backend/logs/`; set `LOG_DIR` to change it. Keep it open in a terminal tab while developing:

```bash
tail -f backend/logs/araf.log
```

---

## 3. Public Testnet — Base Sepolia

> **Recommended path: the GitHub Actions workflow** ([DEPLOY_BASE_SEPOLIA.md](./DEPLOY_BASE_SEPOLIA.md)). It deploys contracts, the Fly backend and the Vercel frontend (including Fly secrets and Vercel build-env) from GitHub secrets/variables.
> Steps 1-5 in this section (manual `fly secrets set`, `.env.production`, etc.) are the **alternative/manual** flow, to be used only when not using the workflow.

### Prerequisites
- Base Sepolia network configured in MetaMask
- Base Sepolia ETH (Faucet: `faucet.quicknode.com` or `sepoliafaucet.com`)
- Base Sepolia USDT/USDC token addresses (public-chain deploys never deploy `MockERC20`)
- Alchemy/Infura account (for RPC)
- MongoDB Atlas account (free M0)
- Upstash Redis account (free; the URL must be `rediss://`)
- Fly.io account (for backend)
- Vercel account (for frontend)
- Etherscan API key (`etherscan.io/myapikey`; optional, one key works for all chains incl. Base; see Testnet Step 2 for the keyless fallback)
- AWS KMS or HashiCorp Vault (the backend runs with `NODE_ENV=production` per `fly.toml`, and `KMS_PROVIDER=env` is rejected in production; the only exception is the Base Sepolia demo: `NODE_ENV=production` + `EXPECTED_CHAIN_ID=84532` + `ALLOW_ENV_KMS_ON_TESTNET=yes` (the RPC is verified to be chain 84532; never on mainnet). For the workflow-driven path see [DEPLOY_BASE_SEPOLIA.md](./DEPLOY_BASE_SEPOLIA.md))

### Step 1 — Deploy Contracts (Base Sepolia)

```bash
# Update contracts/.env
cat > contracts/.env << 'EOF'
DEPLOYER_PRIVATE_KEY=0x<testnet_deployer_private_key>
TREASURY_ADDRESS=0x<testnet_treasury_wallet>
# Must differ from TREASURY_ADDRESS on public chains
FINAL_OWNER_ADDRESS=0x<testnet_final_owner>
BASE_SEPOLIA_RPC_URL=https://base-sepolia.g.alchemy.com/v2/<API_KEY>
BASE_SEPOLIA_USDT_ADDRESS=0x<sepolia_usdt>
BASE_SEPOLIA_USDC_ADDRESS=0x<sepolia_usdc>
ETHERSCAN_API_KEY=<etherscan_api_key>
CONFIRM_PUBLIC_DEPLOY=yes
REPORT_GAS=true
EOF

cd contracts

# Compile
npx hardhat compile

# Deploy (see section 7 for the exact order)
npx hardhat run scripts/deploy.js --network base-sepolia
```

Take note from the output (and from `contracts/deployments/base-sepolia.json`):
```text
✅ ArafReputationLib: 0x...
✅ ArafSettlementLib: 0x...
✅ ArafEscrow deploy edildi: 0x...
✅ USDT token config doğrulandı (supported=true, ...)
✅ USDC token config doğrulandı (supported=true, ...)
✅ Ownership devredildi: 0x<final_owner>
```

### Step 2 — Verify Contracts (BaseScan)

> **Migration (BaseScan V1 shut down):** `BASESCAN_API_KEY` is replaced by `ETHERSCAN_API_KEY`. Create the key in an **etherscan.io** account (one key is valid for all chains, including Base and Base Sepolia); `hardhat.config.js` passes it as a single string so hardhat-verify uses the Etherscan V2 API (`https://api.etherscan.io/v2/api` + `chainid`). `BASESCAN_API_KEY` is still read as a fallback, but a basescan.org V1 key no longer verifies anything.
>
> **Free-plan recommendation:** Etherscan's free API plan may not cover Base / Base Sepolia (V2 then answers with a plan/unsupported-chain/invalid-key error). `verify.js` therefore tries, per contract, Etherscan V2, then Sourcify and Blockscout (`base(-sepolia).blockscout.com`), both keyless. A plan/key rejection from Etherscan is reported as a `skipped` warning, not a failure; a contract counts as verified if **any** verifier succeeds, and the final table shows each verifier's result per contract. The exit code is 1 only if a contract could not be verified anywhere. Without an Etherscan key, leave `ETHERSCAN_API_KEY` empty: Sourcify + Blockscout are used.

`ArafEscrow` is linked against two external libraries, so verify the libraries first, then the escrow with the library addresses (they are in the deployment manifest):

```bash
# Reads deployments/<network>.json (+ <network>-rewards.json) and verifies, in order:
# ArafReputationLib, ArafSettlementLib, ArafEscrow (linked), vault, rewards.
# "Already Verified" counts as success; "no bytecode yet" is retried.
npm --prefix contracts run verify:base-sepolia     # or: verify:base
VERIFY_DRY_RUN=true npm --prefix contracts run verify:base-sepolia   # print the plan, no network calls

# Optional: verify automatically right after deploy (waits 5 confirmations; a failure never fails the deploy)
VERIFY_AFTER_DEPLOY=true npx hardhat run scripts/deploy.js --network base-sepolia
```

Raw hardhat-verify (manual) for a single contract:

```bash
cd contracts
npx hardhat verify --network base-sepolia <LIB_ADDRESS>
npx hardhat verify --network base-sepolia --libraries <path/to/libraries.js> <ESCROW_ADDRESS> <TREASURY_ADDRESS>
```

### Step 3 — Backend: Deploy to Fly.io

```bash
# Install Fly.io CLI (macOS/Linux)
curl -L https://fly.io/install.sh | sh

# Login
fly auth login

# Go to backend directory
cd backend

# Create app (first time)
fly apps create araf-protocol-backend

# Set secrets (all at once). NODE_ENV and PORT already come from fly.toml [env].
# See section 6 for every variable; Mainnet differs only in the chain/token values.
# Note: for the Base Sepolia demo the KMS_PROVIDER=env + ALLOW_ENV_KMS_ON_TESTNET=yes exception may also be used (see ./DEPLOY_BASE_SEPOLIA.md); mainnet requires aws/vault.
fly secrets set \
  MONGODB_URI="mongodb+srv://<user>:<pass>@cluster.mongodb.net/araf_testnet" \
  REDIS_URL="rediss://:<token>@<host>.upstash.io:6379" \
  JWT_SECRET="<64_character_hex>" \
  KMS_PROVIDER="aws" \
  AWS_ENCRYPTED_DATA_KEY="<base64_CiphertextBlob>" \
  AWS_REGION="eu-west-1" \
  BASE_RPC_URL="https://base-sepolia.g.alchemy.com/v2/<API_KEY>" \
  BASE_WS_RPC_URL="wss://base-sepolia.g.alchemy.com/v2/<API_KEY>" \
  EXPECTED_CHAIN_ID="84532" \
  ARAF_ESCROW_ADDRESS="<DEPLOY_ADDRESS>" \
  BASE_SEPOLIA_USDT_ADDRESS="<SEPOLIA_USDT>" \
  BASE_SEPOLIA_USDC_ADDRESS="<SEPOLIA_USDC>" \
  RELAYER_PRIVATE_KEY="0x<relayer_private_key>" \
  SIWE_DOMAIN="araf-protocol.vercel.app" \
  SIWE_URI="https://araf-protocol.vercel.app" \
  ALLOWED_ORIGINS="https://araf-protocol.vercel.app" \
  ARAF_DEPLOYMENT_BLOCK="<DEPLOY_BLOCK_NUMBER>" \
  ADMIN_WALLETS="0x<admin_wallet>"

# Deploy
fly deploy

# Watch logs
fly logs --app araf-protocol-backend
```

> **Worker start block:** in production the worker needs either an existing Redis checkpoint or `ARAF_DEPLOYMENT_BLOCK` (or `WORKER_START_BLOCK`); otherwise `/ready` reports `ARAF_DEPLOYMENT_BLOCK_OR_WORKER_START_BLOCK_OR_CHECKPOINT` missing. When a checkpoint exists the env value is ignored. Setting `ARAF_DEPLOYMENT_BLOCK` is enough; manually seeding `worker:last_block` is not needed on a first install.

> **Registry (manual path):** in production `ESCROW_REGISTRY_GUARD_MODE` defaults to `enforce`; without an `escrow_registry` record the backend starts blocked with `registry_missing`. If you do not use the workflows, write the record once by hand (from the repo root, after `npm ci --omit=dev --prefix backend`): `MONGODB_URI=... ARAF_ESCROW_ADDRESS=0x... ARAF_DEPLOYMENT_BLOCK=<block> EXPECTED_CHAIN_ID=84532 node .github/scripts/escrow-registry.js --adopt` (dry-run), then the same command with `--apply`. See 6.6a.

> **Note:** The `auto_stop_machines = false` setting in the `fly.toml` file is mandatory for the event listener to run continuously. Do not change it.

### Step 4 — Frontend: Deploy to Vercel

```bash
# Install Vercel CLI
npm install -g vercel

# Go to frontend directory
cd frontend

# Update the proxy URL in vercel.json
# "destination" → "https://araf-protocol-backend.fly.dev/api/$1"

# Create Production env file (all VITE_* values are public; see section 6)
cat > .env.production << 'EOF'
# Leave VITE_API_URL empty in production builds: an absolute URL is rejected and /api is proxied by vercel.json
VITE_ESCROW_ADDRESS=<DEPLOY_ADDRESS>
VITE_USDT_ADDRESS=<USDT_ADDRESS>
VITE_USDC_ADDRESS=<USDC_ADDRESS>
EOF

# Deploy
vercel --prod

# or for automatic deploy with GitHub integration:
# vercel link → connect GitHub repo → auto deploy on every main push
```

Environment Variables must also be set in Vercel (Dashboard → Settings → Environment Variables).

> **Chain policy:** production builds (`import.meta.env.PROD`) enable only Base Mainnet by default; with `VITE_TARGET_CHAIN=base-sepolia` a production build enables only Base Sepolia (`frontend/src/app/chainPolicy.js`). The Hardhat chain is wired only into non-production builds. There is no `main.jsx` edit to make; for a hosted Sepolia frontend see the `VITE_TARGET_CHAIN` note below and [DEPLOY_BASE_SEPOLIA.md](./DEPLOY_BASE_SEPOLIA.md).

### Step 5 — SIWE Domain and Origin

The SIWE domain/URI and the CORS origin must be the **frontend** origin (the page the user signs from). In production the backend requires `SIWE_URI` to be `https://` and its host to equal `SIWE_DOMAIN`:

```bash
fly secrets set SIWE_DOMAIN="araf-protocol.vercel.app" SIWE_URI="https://araf-protocol.vercel.app"
```

### GitHub `base-sepolia` environment and CODEOWNERS (deploy approval gate)

The `deploy-base-sepolia`, `deploy-runtime-base-sepolia`, `escrow-registry-adopt` and `rotate-escrow` jobs use `environment: base-sepolia`. Per GitHub's documentation, a workflow that references a missing environment creates it, and the new environment "will not have any protection rules or secrets configured" (so without rules it runs unapproved, as before). You set up the gate:

1. Repo → **Settings → Environments → `base-sepolia`** (it appears after a workflow run, or use **New environment**).
2. **Required reviewers**: add at least one person (up to 6; one approval is enough). On a one-person team keep **Prevent self-review** off, otherwise you cannot approve your own run.
3. **Deployment branches and tags** → *Selected branches and tags* → add only `main`, so a workflow edited on another branch cannot reach this environment.
4. (Optional) Move secrets to **Environment secrets** (DEPLOYER_PRIVATE_KEY, FLY_API_TOKEN, MONGODB_URI, REDIS_URL, JWT_SECRET, MASTER_ENCRYPTION_KEY, GH_VARIABLES_TOKEN, etc.). Per the docs, environment secrets are available only to jobs that use the environment, after reviewer approval. A same-named repository-level secret is not protected by the branch rule, so delete the repository copy after moving it. (That repository secrets stay reachable in environment jobs, and the same-name precedence, could not be found stated in the official docs; verify on the first run.)
5. **Settings → Branches → rule for main → Require a pull request before merging → Require review from Code Owners**. `.github/CODEOWNERS` requires `@MyDemir` for `.github/`, `contracts/src/`, `encryption.js`, `siwe.js` and `frontend/vercel.json`; without this setting CODEOWNERS is not enforced.

`release.yml` uses no secrets and does not touch live systems, so it carries no environment; neither does `ci.yml`.

### Testnet Checklist

- [ ] `https://sepolia.basescan.org/address/<ESCROW_ADDRESS>` — contract and libraries verified ✅
- [ ] `https://araf-protocol-backend.fly.dev/health` → liveness only (`{"status":"ok", ...}`)
- [ ] `https://araf-protocol-backend.fly.dev/ready` → readiness gate (`200` ready / `503` not ready); the body shows `escrowRegistry.mode` = `enforce` and `escrowRegistry.ok` = `true`
- [ ] `https://araf-protocol.vercel.app` — site opens
- [ ] MetaMask connected to Base Sepolia
- [ ] SIWE login successful
- [ ] Full trade lifecycle: create → lock → pay → release
- [ ] Dispute → bleeding → cancel
- [ ] Event listener logs are clean (`fly logs`)

---

## 4. Mainnet — Base

> ⚠️ **Mandatory before Mainnet:** A professional smart contract security audit must be completed.

### Testnet vs Mainnet Differences

| Field | Testnet | Mainnet |
|------|---------|---------|
| MockERC20 | Not deployed (public chain) | **Not Deployed** (public chain) |
| Token addresses | `BASE_SEPOLIA_USDT/USDC_ADDRESS` | `BASE_MAINNET_USDT/USDC_ADDRESS` |
| KMS | AWS KMS or Vault (`env` is blocked when `NODE_ENV=production`) | AWS KMS or HashiCorp Vault |
| Treasury | Test wallet | **Gnosis Safe multisig** (min 3/5) |
| RPC | Alchemy Sepolia | Alchemy/Infura Base Mainnet |
| Chain ID | 84532 | 8453 |
| Relayer | Separate low-balance test wallet | Same backend jobs (`RELAYER_PRIVATE_KEY`); external automation is planned, not in code |
| Audit | Optional | **Mandatory** |

### Step 1 — Gnosis Safe Preparation

1. `safe.global` → Base Mainnet → New Safe
2. Configure a minimum of 3/5 signers
3. Use the Safe address as the `TREASURY_ADDRESS` (and, as a separate address, `FINAL_OWNER_ADDRESS`)
4. **Do not use a single EOA treasury** — if the private key leaks, all protocol funds are at risk.

### Step 2 — AWS KMS Setup (Production Encryption)

```bash
# Create KMS key via AWS CLI
aws kms create-key \
  --description "Araf Protocol PII Master Key" \
  --region eu-west-1

# Generate data key (plaintext + encrypted)
aws kms generate-data-key \
  --key-id <KMS_KEY_ARN> \
  --key-spec AES_256 \
  --region eu-west-1

# Take the encrypted data key from the output (CiphertextBlob → base64)
# Save it to the AWS_ENCRYPTED_DATA_KEY variable
```

`AWS_KMS_KEY_ARN` is **not** read by the backend; the key identity is embedded in the `CiphertextBlob`. The backend decrypts the data key once at startup (`kms:Decrypt`) and derives a per-wallet key with HKDF. The decrypted key must be exactly 32 bytes. The Vault alternative (`KMS_PROVIDER=vault`) requires a **fixed** wrapped data key in `VAULT_ENCRYPTED_DATA_KEY` (generated once with `vault write transit/datakey/wrapped/<key>`), together with `VAULT_ADDR`, `VAULT_TOKEN` and optionally `VAULT_KEY_NAME`; startup fails closed if it is missing. Keep the wrapped key: without it PII cannot be decrypted after a restart.

### Step 3 — Deploy Contracts (Base Mainnet)

```bash
# Update contracts/.env
cat > contracts/.env << 'EOF'
DEPLOYER_PRIVATE_KEY=0x<mainnet_deployer_private_key>
TREASURY_ADDRESS=0x<gnosis_safe_address>
# Must differ from TREASURY_ADDRESS on public chains
FINAL_OWNER_ADDRESS=0x<final_owner_address>
BASE_RPC_URL=https://base-mainnet.g.alchemy.com/v2/<API_KEY>
ETHERSCAN_API_KEY=<etherscan_api_key>
BASE_MAINNET_USDT_ADDRESS=0xfde4C96c8593536E31F229EA8f37b2ADa2699bb2
BASE_MAINNET_USDC_ADDRESS=0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913
CONFIRM_PUBLIC_DEPLOY=yes
EOF

# Public chains (8453 / 84532) never deploy MockERC20; NODE_ENV=production is the recommended explicit setting
# Note: Base Mainnet deploy requires BASE_MAINNET_USDT_ADDRESS / BASE_MAINNET_USDC_ADDRESS.
# Note: Base Sepolia deploy requires BASE_SEPOLIA_USDT_ADDRESS / BASE_SEPOLIA_USDC_ADDRESS.
# Note: MAINNET_* aliases are legacy for Base Mainnet only and must not be used for Base Sepolia.
NODE_ENV=production npx hardhat run scripts/deploy.js --network base

# Verify the libraries and the linked escrow (see the migration / free-plan notes in Testnet Step 2)
npm --prefix contracts run verify:base
```

> Note: In `contracts/hardhat.config.js`, `BASE_RPC_URL` is required for `base` and `BASE_SEPOLIA_RPC_URL` is required for `base-sepolia`; no public RPC default fallback is configured.

#### Local/custom + external token addresses (optional)

If you want external token addresses instead of mock tokens with `USE_EXTERNAL_TOKEN_ADDRESSES=true`:

```bash
EXTERNAL_USDT_ADDRESS=0x<external_usdt>
EXTERNAL_USDC_ADDRESS=0x<external_usdc>
USE_EXTERNAL_TOKEN_ADDRESSES=true npx hardhat run scripts/deploy.js --network localhost
```

This path uses `EXTERNAL_*` only on local/custom chains; Base Sepolia/public paths continue to use chain-aware `BASE_*` envs.

### Step 4 — Backend: Production Secrets

```bash
# Fly.io production secrets (NODE_ENV and PORT already come from fly.toml [env])
fly secrets set \
  MONGODB_URI="mongodb+srv://<user>:<pass>@cluster.mongodb.net/araf" \
  REDIS_URL="rediss://:<token>@<host>:6379" \
  JWT_SECRET="<64_character_hex>" \
  KMS_PROVIDER="aws" \
  AWS_ENCRYPTED_DATA_KEY="<base64_CiphertextBlob>" \
  AWS_REGION="eu-west-1" \
  BASE_RPC_URL="https://base-mainnet.g.alchemy.com/v2/<API_KEY>" \
  BASE_WS_RPC_URL="wss://base-mainnet.g.alchemy.com/v2/<API_KEY>" \
  EXPECTED_CHAIN_ID="8453" \
  ARAF_ESCROW_ADDRESS="<MAINNET_ESCROW>" \
  BASE_MAINNET_USDT_ADDRESS="0xfde4C96c8593536E31F229EA8f37b2ADa2699bb2" \
  BASE_MAINNET_USDC_ADDRESS="0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913" \
  ARAF_DEPLOYMENT_BLOCK="<MAINNET_DEPLOY_BLOCK>" \
  SIWE_DOMAIN="app.araf.xyz" \
  SIWE_URI="https://app.araf.xyz" \
  ALLOWED_ORIGINS="https://app.araf.xyz" \
  ADMIN_WALLETS="0x<admin_wallet>" \
  READY_INTERNAL_TOKEN="<long_random_string>"
  # RELAYER_PRIVATE_KEY (optional): without it the reputation-decay and reward-outcome jobs stay
  # inactive. Both contract functions are permissionless; no Gelato/Chainlink integration exists in the code.

fly deploy
```

### Step 5 — Frontend Production Configuration

```bash
# .env.production (the chain list is policy-driven; production builds enable Base Mainnet only)
# Leave VITE_API_URL empty: production uses same-origin /api through the vercel.json rewrite
VITE_ESCROW_ADDRESS=<MAINNET_ESCROW>
# VITE_USDT_ADDRESS and VITE_USDC_ADDRESS → real Base USDT/USDC addresses
# Base USDT: 0xfde4C96c8593536E31F229EA8f37b2ADa2699bb2
# Base USDC: 0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913
# Optional: VITE_RPC_URL (primary RPC, public RPC stays as fallback)

vercel --prod
```

### Mainnet Checklist

- [ ] Security audit report is ready and findings are resolved
- [ ] Gnosis Safe multisig is configured (min 3/5)
- [ ] AWS KMS is active and encrypted data key is tested
- [ ] `NODE_ENV=production` — MockERC20 was not deployed ✅
- [ ] `BASE_MAINNET_USDT_ADDRESS` and `BASE_MAINNET_USDC_ADDRESS` are set (required for Base Mainnet)
- [ ] You saw post-`setTokenConfig` on-chain checks in logs (`getTokenConfig(token).supported == true`)
- [ ] Contract and both libraries verified on BaseScan
- [ ] Ownership transferred to the final owner ✅
- [ ] `pause()` / `unpause()` is operational from the owner (Gnosis Safe)
- [ ] Event listener is stable on WSS RPC (HTTP-only works but logs a warning; `/ready` reports `wsConfigured`)
- [ ] DLQ depth is watched through `GET /api/admin/summary` (`dlq`); there is no built-in alert webhook
- [ ] `GET /health` => liveness only (process alive; `503` when the worker is stale)
- [ ] `GET /ready` => readiness/startup gate (Mongo/Redis/provider/config/worker checks)
- [ ] Real USDT/USDC addresses are correct on the frontend
- [ ] Frontend `.env` auto-write was skipped in production (expected behavior)
- [ ] SIWE domain matches the production domain
- [ ] Rate limit tests passed

---

## 5. Environment Differences Summary

| Parameter | Local | Testnet | Mainnet |
|-----------|-------|---------|---------|
| `NODE_ENV` | `development` | `production` | `production` |
| `KMS_PROVIDER` | `env` | `aws` / `vault` (or `env` + `ALLOW_ENV_KMS_ON_TESTNET=yes` exception) | `aws` / `vault` |
| `MockERC20` | ✅ Deployed | ❌ Not Deployed (use Sepolia tokens) | ❌ Not Deployed |
| `EXPECTED_CHAIN_ID` | `31337` | `84532` | `8453` |
| `SIWE_DOMAIN` | `localhost` | frontend host (e.g. `*.vercel.app`) | real domain |
| Treasury | Test wallet | Test wallet | Gnosis Safe |
| Relayer | Hardhat wallet | Separate test wallet | `RELAYER_PRIVATE_KEY` (optional; external automation planned) |
| RPC | `http://localhost:8545` | Alchemy Sepolia | Alchemy/Infura Base |
| WSS RPC | Not Required | Recommended | Recommended (code only warns) |
| Redis TLS | optional | **Mandatory** (`rediss://`) | **Mandatory** |
| Audit | No | No | **Mandatory** |

### Quick Command Reference

```bash
# Tests
cd contracts && npx hardhat test

# Local deploy (node from `npx hardhat node`)
npx hardhat run scripts/deploy.js --network localhost

# Testnet deploy
CONFIRM_PUBLIC_DEPLOY=yes npx hardhat run scripts/deploy.js --network base-sepolia

# Mainnet deploy
CONFIRM_PUBLIC_DEPLOY=yes NODE_ENV=production npx hardhat run scripts/deploy.js --network base

# Migrations (run from backend/; see section 8)
npm run migrate:identity:dry
node scripts/migrations/backfillTerminalTradeStats.js            # dry-run
node scripts/migrations/dedupeRevenueEvents.js                   # dry-run
node scripts/migrations/dropRedundantIndexes.js                  # dry-run; --apply drops the indexes
# back up before --apply: dedupeRevenueEvents.js --apply --backup=<file>
# (the backup file contains wallet addresses and transaction data; store it securely, keep it out of the repo)

# GitHub Actions workflows (Base Sepolia; details: DEPLOY_BASE_SEPOLIA.md)
gh workflow run escrow-registry-adopt.yml                        # dry-run; -f dry_run=false writes
gh workflow run deploy-base-sepolia.yml -f deploy_frontend=true  # contracts + backend (+ frontend)
gh workflow run deploy-runtime-base-sepolia.yml                  # backend/frontend only
gh workflow run rotate-escrow.yml -f mode=precheck               # read-only rotation precheck

# Fly.io backend logs
fly logs --app araf-protocol-backend

# Fly.io update secret
fly secrets set KEY=VALUE

# Vercel production deploy
cd frontend && vercel --prod
```

### Useful Links

| Service | Link |
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

## 6. Environment Variable Reference

Extracted from every `process.env` / `import.meta.env` use in the code. *Required* means required for the service to start or be ready in the stated environment; `—` means no default. Optional integer variables use a strict parser: a non-positive, non-integer or empty value silently falls back to the default. `.env.example` files in `backend/`, `frontend/` and `contracts/` mirror this list.

### 6.1 Backend — core, Mongo, Redis

| Variable | Required | Default | Notes |
|---|---|---|---|
| `NODE_ENV` | prod: `production` | — | Production turns on the fail-closed guards below (KMS, CORS, SIWE, Redis TLS, chain id). `fly.toml` sets it. |
| `PORT` | no | `4000` | `fly.toml` sets `4000`. |
| `LOG_DIR` | no | `backend/logs` | Log file `araf.log` (25 MB × 5 rotation). |
| `MONGODB_URI` | **yes** | — | Migration scripts also accept `MONGO_URI` (deprecated fallback; logs a warning). |
| `REDIS_URL` | prod: **yes** | `redis://127.0.0.1:6379` (non-prod only) | Production requires TLS. |
| `REDIS_TLS` | no | `false` | `true` or a `rediss://` URL enables TLS; mandatory in production. |
| `REDIS_TLS_SKIP_VERIFY` | no | `false` | Self-signed dev Redis only; `true` in production aborts startup. |
| `REDIS_READY_WAIT_MS` | no | `5000` | Wait for Redis to become ready. |
| `REDIS_CONNECT_TIMEOUT_MS` | no | `10000` | Redis connect timeout, ms. |
| `JOB_LOCK_TTL_MS` | no | `120000` | Distributed job-lock lifetime (ms); renewed every ttl/3. |
| `JOB_LOCK_COMMAND_TIMEOUT_MS` | no | `5000` | Timeout of a single lock command (Redis), ms. |

### 6.2 Backend — auth, session, CORS

| Variable | Required | Default | Notes |
|---|---|---|---|
| `JWT_SECRET` | **yes** | — | ≥ 64 chars, entropy ≥ 3.5, placeholders rejected. |
| `JWT_EXPIRES_IN` | no | `15m` | Auth JWT lifetime (the cookie `maxAge` is a fixed 15 min). |
| `PII_TOKEN_EXPIRES_IN` | no | `15m` | Trade-scoped PII token lifetime. |
| `JWT_BLACKLIST_TIMEOUT_MS` | no | `1500` | Redis blacklist read timeout. |
| `JWT_BLACKLIST_FAIL_MODE` | no | `closed` in production, `open` otherwise | What to do when the blacklist cannot be read (`closed` rejects the request). |
| `REFRESH_ABSOLUTE_TTL_SECS` | no | `2592000` (30 d) | Absolute session lifetime; rotations cannot extend it (the sliding refresh window is a fixed 7 d). |
| `REFRESH_REUSE_GRACE_MS` | no | `10000` | A second use of the same refresh token inside this window is treated as a two-tab race. |
| `REFRESH_LEGACY_SCAN` | no | enabled | Set `false` to disable the one-off SCAN for sessions created before the session index (recommended ~7 days after the deploy that introduced it). |
| `SIWE_DOMAIN` | prod: **yes** | `localhost` (non-prod) | Not `localhost` in production; host only, no scheme. |
| `SIWE_URI` | prod: **yes** | `https://<SIWE_DOMAIN>` (non-prod) | Must be `https://` and its host must equal `SIWE_DOMAIN` in production. |
| `ALLOWED_ORIGINS` | prod: **yes** | `http://localhost:5173` (non-prod) | Comma separated; each a bare http(s) origin; no wildcard, no localhost-only fallback in production. |
| `ADMIN_WALLETS` | no | empty (nobody) | Comma separated wallets for `/api/admin/*` and `isAdmin` in `/api/auth/me`. |

### 6.3 Backend — encryption (KMS)

| Variable | Required | Default | Notes |
|---|---|---|---|
| `KMS_PROVIDER` | **yes** in production | `env` | `env` (development only) · `aws` · `vault`. Anything else fails. |
| `MASTER_ENCRYPTION_KEY` | `KMS_PROVIDER=env` | — | 64 hex chars (first 64 are used). Never in production. |
| `AWS_ENCRYPTED_DATA_KEY` | `KMS_PROVIDER=aws` | — | Base64 `CiphertextBlob`. |
| `AWS_REGION` | no | `eu-west-1` | |
| `VAULT_ADDR` | `KMS_PROVIDER=vault` | — | |
| `VAULT_TOKEN` | `KMS_PROVIDER=vault` | — | |
| `VAULT_KEY_NAME` | no | `araf-master-key` | Transit key name. |
| `VAULT_ENCRYPTED_DATA_KEY` | `KMS_PROVIDER=vault` | — | Fixed `vault:v1:…` wrapped data key; missing = fail-closed. |

Production runs a KMS self-test at startup (`runProductionKmsStartupSelfTest`). See `PII_ENCRYPTION_MIGRATION.md` for the HKDF derivation.

### 6.4 Backend — chain, contracts, tokens, relayer

| Variable | Required | Default | Notes |
|---|---|---|---|
| `BASE_RPC_URL` | prod: **yes** | — | No public fallback. |
| `BASE_WS_RPC_URL` | no (recommended) | — | Must start with `wss://`, otherwise the HTTP provider is used. |
| `EXPECTED_CHAIN_ID` | prod: **yes** (also when `BASE_RPC_URL` is set) | — | Any positive integer is accepted (`expectedChain.js`); the `8453` / `84532` restriction in production comes from the token env resolution (`tokenEnv.js`). Providers are checked against it at the worker, config, preview and `/ready` surfaces. |
| `ALLOW_UNSAFE_CHAIN_ID_BYPASS` | no | `false` | Non-production only: skips the chain check when `EXPECTED_CHAIN_ID` is empty. |
| `ARAF_ESCROW_ADDRESS` | prod: **yes** | — | Zero address counts as unset (production exits). |
| `ARAF_REVENUE_VAULT_ADDRESS` | no | — | Reward mirror events; without it (or `ARAF_REWARDS_ADDRESS`) the reward mirror is not watched. |
| `ARAF_REWARDS_ADDRESS` | no | — | Also enables `rewardOutcomeRecorder`. |
| `BASE_MAINNET_USDT_ADDRESS`, `BASE_MAINNET_USDC_ADDRESS` | prod on 8453 (unless `ARAF_TRACKED_TOKENS`) | — | Canonical token envs; zero address rejected in production. |
| `BASE_SEPOLIA_USDT_ADDRESS`, `BASE_SEPOLIA_USDC_ADDRESS` | prod on 84532 (unless `ARAF_TRACKED_TOKENS`) | — | |
| `MAINNET_USDT_ADDRESS`, `MAINNET_USDC_ADDRESS` | no | — | Legacy aliases for 8453 only; rejected on 84532 in production. |
| `USDT_ADDRESS`, `USDC_ADDRESS` | no | — | Legacy fallback, non-production only (logs a warning). |
| `ARAF_TRACKED_TOKENS` | no | derived from the pair above | Comma separated token addresses; takes priority; invalid/zero entries abort in production. |
| `RELAYER_PRIVATE_KEY` | no | — | Enables `reputationDecay` and `rewardOutcomeRecorder`; unset = jobs log an error and stay inactive. |
| `REPUTATION_DECAY_CANDIDATE_LIMIT` | no | `250` | |
| `REPUTATION_DECAY_TX_LIMIT` | no | `50` | |
| `REWARD_RECORDER_CANDIDATE_LIMIT` | no | `200` | |
| `REWARD_RECORDER_BATCH_LIMIT` | no | `50` | |

### 6.5 Backend — event worker and health

| Variable | Required | Default | Notes |
|---|---|---|---|
| `ARAF_DEPLOYMENT_BLOCK` | prod: yes, unless a Redis checkpoint exists | — | Replay start block (takes priority over `WORKER_START_BLOCK`). Also checked by `/ready`. |
| `WORKER_START_BLOCK` | alternative to the above | — | |
| `WORKER_DISABLED` | no | `false` | `true` = the worker never starts (API-only). |
| `WORKER_FINALITY_DEPTH` | no | `6` prod / `1` otherwise | Safe-checkpoint depth. |
| `WORKER_BLOCK_BATCH_SIZE` | no | `1000` | Replay batch size (range 1–2000; 10 on the Alchemy free plan). |
| `WORKER_REPLAY_BATCH_DELAY_MS` | no | `250` | Delay between replay/live chunks (range 0–10000). |
| `LIVE_POLL_INTERVAL_MS` | no | `15000` | Live polling interval (allowed range 2000–300000 for the workflow variable). |
| `WORKER_CHECKPOINT_INTERVAL_BLOCKS` | no | `50` | |
| `WORKER_REPLAY_BACKOFF_BASE_MS` | no | `5000` | Replay retry backoff base. |
| `WORKER_REPLAY_BACKOFF_MAX_MS` | no | `300000` | Replay retry backoff cap. |
| `WORKER_BLOCK_STALE_MS` | no | `75000` | No new block for this long → the watchdog reconnects; still nothing → the process exits. |
| `WORKER_WATCHDOG_INTERVAL_MS` | no | `15000` | |
| `WORKER_LIVENESS_STALE_MS` | no | `BLOCK_STALE*2 + 30000` (= 180000) | `/health` returns `503 "stale"` beyond this. |
| `WORKER_MAX_LAG_BLOCKS` | no | `25` | `/ready` turns `503` beyond this lag (safe checkpoint vs. provider head). |
| `READY_INTERNAL_TOKEN` | no | unset (feature off) | Value of the `x-internal-token` header that unlocks the full `/ready` body. Secret. |
| `READY_CACHE_TTL_MS` | no | `7000` | Clamped to 5000–10000. |

### 6.6 Backend — identity migration guard

| Variable | Required | Default | Notes |
|---|---|---|---|
| `IDENTITY_NORMALIZATION_GUARD` | no | `enforce` in production, `warn` otherwise | `off` · `warn` · `enforce`. `enforce` aborts startup while legacy numeric ids exist. |
| `PII_IDENTITY_NORMALIZATION_GUARD` | no | falls back to the variable above, then `enforce` | Mode used lazily by the PII routes (`503 IDENTITY_NORMALIZATION_REQUIRED`). |
| `IDENTITY_MIGRATION_BATCH_SIZE` | no | `1000` | `migrate:identity` batch size. |

### 6.6a Backend — escrow registry guard

In the `escrow_registry` Mongo collection the active record is the `_id: "active"` document: `escrow_address` (lowercase), `chain_id`, `deploy_block`, `state` (`ACTIVE` | `ROTATING`), `since`, `updated_by` (`github-run-<run id>`, or `manual` outside a workflow). The same collection also holds the rotation manifests (`_id: "<chainId>:<oldEscrow>"`, see 6.6b). **Only the deploy workflow writes it** (`.github/scripts/escrow-registry.js`); the backend only reads it, and no admin route or panel can change it. The guard compares it with `ARAF_ESCROW_ADDRESS` and `EXPECTED_CHAIN_ID` at startup and every 60 s (one Mongo read) and reports a mismatch reason: `registry_missing`, `escrow_mismatch`, `chain_mismatch`, `rotating` (or `registry_unreadable` when the read fails).

| Variable | Required | Default | Notes |
|---|---|---|---|
| `ESCROW_REGISTRY_GUARD_MODE` | no | `warn` (`enforce` in production) | `off` · `warn` · `enforce`. In production, if ESCROW_REGISTRY_GUARD_MODE is unset it is enforce. Invalid value = the default (`warn`, `enforce` in production) plus a warning log. `warn`: log only (once and on change) and an `escrowRegistry` info field in `/ready`; nothing is closed and no HTTP status changes. `enforce`: on a mismatch (or an unreadable registry, fail-closed) the worker is not started (or is stopped), chain-bound scheduled jobs are skipped, and escrow-bound routes (orders, trades, pii, receipts, stats, rewards, admin) return `503 ESCROW_MISMATCH` with the reason. Auth, client logs, social links, reference ticker, feedback and `/health` stay open; `/ready` returns 503 with the reason. Exits are not blocked: users send exit transactions straight to the contract. |
| `ESCROW_REGISTRY_GUARD_INTERVAL_MS` | no | `60000` | Re-check interval. |

**First-time setup order**
1. Deploy the guard code. In production the default is `enforce`; the registry document must be adopted first (`escrow-registry-adopt.yml`, step 2), otherwise the backend starts blocked with `registry_missing`. To deploy without blocking temporarily, set the mode explicitly to `warn`.
2. Run the **Escrow Registry Adopt** workflow (`escrow-registry-adopt.yml`) with `dry_run=true` and read the output, then run it again with `dry_run=false`. It writes the live escrow (`ARAF_ESCROW_ADDRESS` / `ARAF_DEPLOYMENT_BLOCK` repository variables, chain 84532) as `active`.
3. If the backend log shows no `[EscrowRegistryGuard] UYUMSUZ` line and `/ready` reports `escrowRegistry.ok: true`, switch on enforcement: `flyctl secrets set ESCROW_REGISTRY_GUARD_MODE=enforce -a <app>`.

**Status: enforce is on for Base Sepolia.** The code default is `enforce` in production and `warn` elsewhere (local development is unaffected); the Base Sepolia workflows set and verify the mode themselves:
- `stage-runtime-env.sh fly-secrets` (used by both `deploy-base-sepolia.yml` and `deploy-runtime-base-sepolia.yml`) writes `ESCROW_REGISTRY_GUARD_MODE=enforce` on every run; no manual `flyctl secrets set` is needed.
- `stage-runtime-env.sh guard-mode` reads `escrowRegistry.mode` from the live `/ready`; if it is not `enforce` (or cannot be read) the job fails with `::error::`. It runs after the health step following the Fly deploy (both deploy workflows), before the rotation (stopping machines and archiving) in the full deploy (registry ACTIVE path), and after an applied rotate/restore in `rotate-escrow.yml` (recovery paths are not blocked beforehand). The mode is retried until `enforce` is seen (during a rolling deploy an old machine may briefly report `warn`).
- Expected side effect: under enforce, a backend that does not match the registry (`registry_missing`, `escrow_mismatch`, `chain_mismatch`, `rotating`, `registry_unreadable`) starts without the worker and with escrow routes returning 503; the process does not exit, `/health` stays 200, and the guard re-checks every 60 s. On a first install the registry is written after the Fly deploy (checkpoint reset and `--adopt --apply`), so the backend starts blocked and unblocks itself within about 60 s after the registry is written. For an existing install whose registry was never written, run Escrow Registry Adopt before `deploy-runtime`; otherwise the backend stays blocked.

A full contract deploy (`deploy-base-sepolia.yml`) writes the registry in one of two ways: if **no registry exists** (first install) the old behaviour is kept (the "first install" steps: checkpoint reset + `--adopt --apply`, no `--force-switch` because there is nothing to overwrite); if the registry is **ACTIVE**, the escrow rotation runs (see 6.6b). If it is **ROTATING**, the deploy stops before deploying a contract; `--force-switch` never overwrites a ROTATING record. The runtime deploy does not change the escrow and never writes the registry; if its `araf_escrow_address` override differs from the registry, the guard reports `escrow_mismatch`.

### 6.6b Escrow rotation (Phase 2b)

On a new contract deploy the Mongo collections bound to the old escrow are renamed inside the same database to `archive_<chainId>_<oldEscrow>_<collection>`, the User mirror is written to the archive, the Redis DLQ and `last_known` keys are renamed, and the worker checkpoints (`worker:last_block`, `worker:last_safe_block`) are written to the manifest and deleted. The registry `ROTATING` → `ACTIVE` switch is the **commit point**; until it is written the guard keeps the worker closed. The core is `.github/scripts/rotate-escrow.js`; the machine-stopping wrapper is `rotate-escrow-state.sh`. The workflow does **not** pause the contract (the owner key is not in the workflow); it only reads the pause state.

**Before (steps of `GOVERNANCE_READINESS.md` §2)**
1. **Announcement:** purpose (new escrow), date/time, expected impact (short downtime, P4 fallback view for open trades).
2. **Pre-check (on-chain):** `pause()` the old escrow through the owner/multisig and confirm `paused()==true`. Check open trades (LOCKED/PAID/CHALLENGED) and open orders. If not zero, the deploy stops unless `confirm_archive_active_trades=YES`; the remaining ids are reported.
3. Run `rotate-escrow.yml` with `mode=precheck` (read-only): registry == `ARAF_ESCROW_ADDRESS` variable, chain 84532, pause, open trades/orders. The precheck does not need the new escrow (it is not deployed yet; the output says `new escrow not yet known; skipped`); `RPC_URL` is mandatory (pause is read on-chain).

**Run**
- Normal path: `deploy-base-sepolia.yml`. "Read escrow registry state" → "Precheck escrow rotation (read-only)" run **before** the contract deploy; if they fail no contract is deployed. After the Fly deploy, "Rotate escrow state" (before the health check) stops and verifies the machines (3 attempts), runs the core with `--apply`, and restarts the machines (even on error, only those that were running).
- If interrupted: the registry stays `ROTATING`; a new deploy stops without deploying a contract. Run `rotate-escrow.yml` with `mode=rotate`, `dry_run=false`, `old_escrow_address=<old>`; the core resumes where it stopped. (The deploy workflow writes the repository variables even on failure, so `ARAF_ESCROW_ADDRESS` already shows the new escrow; pass the old address as an input.)
- Read first with `dry_run=true` (the default).

**After**
1. `/ready` → `escrowRegistry.ok: true`; registry `ACTIVE` with the new address; `archive_<chainId>_<old>_*` counts match the manifest.
2. Smoke: create/fill an order on the new escrow; the worker started from `ARAF_DEPLOYMENT_BLOCK`.
3. **Log:** run id, actor, old/new escrow, archive_id, remaining open trade ids, approvers.

**Rollback:** `rotate-escrow.yml` with `mode=restore`, `archive_id=<chainId>:<0x oldEscrow>` (the rotation manifest `_id`, e.g. `84532:0xabc...`), `confirm=RESTORE <0x oldEscrow>` (must match the address in archive_id), `dry_run=false`. The current escrow comes from the `ARAF_ESCROW_ADDRESS` variable (it must equal the manifest's new escrow); the escrow being restored is derived from archive_id and its deploy block from the manifest's `old_deploy_block` (if null/invalid the restore stops without writing anything). Machines stop; live collections move to their own archive, the archive returns to live names, the registry points back to the old escrow. On success the core prints `RESTORE_TARGET_ESCROW=0x...` and `RESTORE_TARGET_DEPLOY_BLOCK=<n>`; Fly `ARAF_ESCROW_ADDRESS`/`ARAF_DEPLOYMENT_BLOCK` and (if `GH_VARIABLES_TOKEN` exists) the repository variables are set to ONLY those two values (machines re-verified stopped), then the machines start. There is no `restore_deployment_block` input.

Security: these steps have no `JWT_SECRET`/`MASTER_ENCRYPTION_KEY` in their environment (the wrapper rejects them); encrypted fields are never decrypted. The 365-day TTL on archived trades and the PII `delete_at` cleanup continue.

### 6.7 Backend — scheduled jobs (all in ms unless noted; max 2 147 483 647)

| Variable | Default |
|---|---|
| `JOB_DLQ_INTERVAL_MS` | `60000` |
| `JOB_REPUTATION_DECAY_DELAY_MS` / `JOB_REPUTATION_DECAY_INTERVAL_MS` | `30000` / `86400000` |
| `JOB_REWARD_RECORDER_INTERVAL_MS` | `3600000` |
| `JOB_STATS_SNAPSHOT_DELAY_MS` / `JOB_STATS_SNAPSHOT_INTERVAL_MS` | `60000` / `86400000` |
| `JOB_SENSITIVE_CLEANUP_DELAY_MS` / `JOB_SENSITIVE_CLEANUP_INTERVAL_MS` | `120000` / `1800000` |
| `JOB_USER_BANK_RISK_CLEANUP_DELAY_MS` / `JOB_USER_BANK_RISK_CLEANUP_INTERVAL_MS` | `150000` / `21600000` |
| `JOB_RECONCILIATION_ENABLED` | production: enabled unless `false`; otherwise disabled unless `true` |
| `JOB_RECONCILIATION_INTERVAL_MS` | `600000` |
| `USER_BANK_RISK_CLEANUP_CURSOR_BATCH_SIZE` | `200` |

### 6.8 Backend — caches, limits, reference ticker

| Variable | Default | Notes |
|---|---|---|
| `CONFIG_CACHE_TTL_SECONDS` | `3600` | Protocol config mirror cache. |
| `MARKET_CACHE_TTL_MS` | `10000` (`0` when `NODE_ENV=test`) | `GET /api/orders` response cache; `0` disables. |
| `RATE_LIMIT_TIER_CACHE_TTL_SECONDS` | `120` | Tier lookup cache for tiered limiters. |
| `REFERENCE_TICKER_REFRESH_INTERVAL_MS` | `120000` | Scheduler interval. |
| `REFERENCE_TICKER_CRYPTO_TTL_SECONDS` | `120` | |
| `REFERENCE_TICKER_FIAT_TTL_SECONDS` | `21600` | |
| `REFERENCE_TICKER_LAST_GOOD_TTL_SECONDS` | `604800` | |
| `REFERENCE_TICKER_MAX_STALE_SECONDS` | `86400` | Rows older than this are dropped from the last-good merge. |

### 6.9 Frontend (`VITE_*` — all public in the browser bundle)

| Variable | Required | Default | Notes |
|---|---|---|---|
| `VITE_API_URL` | no | dev: `http://localhost:4000/api`; prod: `/api` | An absolute URL in a production build is rejected (cookie model needs same-origin `/api`). A missing `/api` suffix is appended. |
| `VITE_ESCROW_ADDRESS` | **yes** | — | Zero/empty address disables contract actions and shows an env error. Compared with the backend's `deployment.escrowAddress`. |
| `VITE_USDT_ADDRESS`, `VITE_USDC_ADDRESS` | **yes** | — | Token addresses. |
| `VITE_REVENUE_VAULT_ADDRESS` | for rewards | — | `VITE_REWARDS_VAULT_ADDRESS` is a legacy alias (used only in `App.jsx`). |
| `VITE_REWARDS_ADDRESS` | for rewards | — | |
| `VITE_RPC_URL` | no | — | Primary RPC (public RPC stays as fallback); non-http(s) values are ignored. Applied to Base in production and to Base Sepolia in development. |
| `VITE_ENABLE_UI_LAB` | no | `false` | `true` ships the UI Lab scenario controller even in a production-mode build; keep `false` publicly. |
| `VITE_SOCIAL_GITHUB` | no | project repo URL | |
| `VITE_SOCIAL_TWITTER`, `VITE_SOCIAL_FARCASTER` | no | empty (link hidden) | |

`import.meta.env.PROD` / `DEV` are Vite built-ins; they select the chain list (production = Base only) and the mint faucet (non-production only). `VITE_ADMIN_WALLETS` no longer exists: admin status comes from `isAdmin` in `/api/auth/me`.

### 6.10 Contracts (Hardhat and scripts)

| Variable | Used by | Notes |
|---|---|---|
| `BASE_RPC_URL` / `BASE_SEPOLIA_RPC_URL` | `hardhat.config.js` | Required for `--network base` / `base-sepolia` respectively (fail-closed; no public RPC). |
| `DEPLOYER_PRIVATE_KEY` | `hardhat.config.js` | Signer for public networks. Never commit. |
| `ETHERSCAN_API_KEY` | `hardhat.config.js` | Etherscan V2 key for `verify.js` / `hardhat verify` (legacy `BASESCAN_API_KEY` is a fallback). |
| `VERIFY_AFTER_DEPLOY` | `deploy.js` | `true` = verify after 5 confirmations; failure only warns. |
| `VERIFY_DRY_RUN` | `verify.js` | `true` = print plan, no network calls. |
| `REPORT_GAS`, `CMC_API_KEY` | `hardhat.config.js` | Gas reporter. |
| `ARAF_SOLCJS_PATH` | `hardhat.config.js` | Optional: path to the `soljson.js` of `solc@0.8.24` for environments that cannot download the native compiler. No-op when unset. |
| `TREASURY_ADDRESS` | `deploy.js` | Required for every deploy; also needed by `deployRewards.js` on local when it must deploy a fresh escrow. |
| `FINAL_OWNER_ADDRESS` | `deploy.js`, `deployRewards.js` | Required on public/custom chains and must differ from `TREASURY_ADDRESS`; local default = treasury; rewards owner default = deployer. |
| `CONFIRM_PUBLIC_DEPLOY` | `deploy.js` | Must be `yes` on `base` / `base-sepolia`. |
| `BASE_MAINNET_USDT_ADDRESS`, `BASE_MAINNET_USDC_ADDRESS` (+ legacy `MAINNET_*`) | `deploy.js`, `deployRewards.js` | Chain 8453. |
| `BASE_SEPOLIA_USDT_ADDRESS`, `BASE_SEPOLIA_USDC_ADDRESS` | `deploy.js`, `deployRewards.js` | Chain 84532 (`MAINNET_*` rejected). |
| `USE_EXTERNAL_TOKEN_ADDRESSES`, `EXTERNAL_USDT_ADDRESS`, `EXTERNAL_USDC_ADDRESS` | `deploy.js` | Local/custom chains only. |
| `NODE_ENV` | `deploy.js` | `production` forces configured token addresses. |
| `CODESPACE_NAME` | `deploy.js` | Local only: also rewrites `VITE_API_URL` in `frontend/.env` for Codespaces. |
| `ARAF_ESCROW_ADDRESS` | `deployRewards.js`, `rewardsOps.js` | Existing escrow (required on public chains). |
| `FINAL_TREASURY_ADDRESS` | `deployRewards.js` | Required on public chains; local default = deployer. |
| `CONFIRM_FRESH_ESCROW_DEPLOY` | `deployRewards.js` | Only changes the error text; a fresh escrow on a public chain is never deployed by this script. |
| `CONFIRM_OVERWRITE_REWARDS_MANIFEST` | `deployRewards.js` | `yes` is required to overwrite critical addresses of an existing `<network>-rewards.json`. |
| `CONFIRM_REDEPLOY_REWARDS` | `deployRewards.js` | Exactly `YES` to redeploy when an existing rewards setup is detected. |
| `EXISTING_REVENUE_VAULT_ADDRESS`, `EXISTING_REWARDS_ADDRESS` | `deployRewards.js` | On-chain pre-check addresses for the lock (the workflow passes the repository variables). |
| `ARAF_DEPLOYMENTS_DIR`, `SKIP_ABI_EXPORT`, `SKIP_FRONTEND_ENV_WRITE` | `deploy.js`, `deployRewards.js` | Tests/tooling: manifest directory, skip ABI export and the local `frontend/.env` write. |
| `ARAF_REVENUE_VAULT_ADDRESS`, `ARAF_REWARDS_ADDRESS`, `USDT_ADDRESS`, `USDC_ADDRESS` | `rewardsOps.js` | Env first, then `deployments/<network>-rewards.json`. |
| `REWARDS_OP` | `rewardsOps.js` | `configure` · `verify` · `switch-treasury` (or implied by the npm script name). |
| `CONFIRM_TREASURY_SWITCH`, `EXPECTED_CURRENT_TREASURY_ADDRESS` | `rewardsOps.js` | Both required to switch the escrow treasury to the vault. |
| `EXPECT_ESCROW_TREASURY_ADDRESS` | `rewardsOps.js` | Optional extra `verify` check. |
| `ALLOW_NON_4000_REWARD_BPS` | `rewardsOps.js` | `true` bypasses the "`rewardBps` must be 4000" go-live check in `switch-treasury`. |
| `CONFIRM_PUBLIC_SMOKE` | `smokeRewards.js` | `yes` required on non-local networks. |
| `GAS_BASELINE_OUT` | `gasBaseline.js` | Optional output path of the JSON table. |

> `verify:rewards`, `configure:rewards` and `switch:rewards:treasury` all run the same `rewardsOps.js`; the operation is chosen by the npm script name, so call them via `npm run` (or set `REWARDS_OP`).

`REWARD_BPS`, `CONFIRM_CONFIGURE_REWARDS`, `REWARDS_READ_ONLY` and `REWARDS_SOURCE` appear in the `.env.example` files but are not read by any code; they are documented constants.

---

## 7. Contract Deploy Order

`ArafEscrow` links two external libraries (EIP-170 size budget); the library addresses are baked into the escrow bytecode and cannot change afterwards.

**Escrow (`contracts/scripts/deploy.js`)**
1. Guards: public chains (8453/84532) require `CONFIRM_PUBLIC_DEPLOY=yes`; deployer balance must be > 0; `TREASURY_ADDRESS` required; `FINAL_OWNER_ADDRESS` required (≠ treasury) on public/custom chains.
2. Tokens: public chains read `BASE_*_USDT/USDC_ADDRESS`; local deploys two `MockERC20` (6 decimals) unless `USE_EXTERNAL_TOKEN_ADDRESSES=true`.
3. `ArafReputationLib` → `ArafSettlementLib` (independent of each other) → `ArafEscrow` linked to both (`constructor(treasury)`).
4. `setTokenConfig` for USDT and USDC (supported, sell/buy allowed, 6 decimals, default tier limits), each re-read with `getTokenConfig` and compared; mismatch aborts.
5. `transferOwnership(FINAL_OWNER_ADDRESS)` after the configuration is verified.
6. Manifest `contracts/deployments/<network>.json` (escrow, `libraries`, `libraryDeployTxHashes`, tokens, fee/cooldown snapshot). Local only: `frontend/.env` is updated.

**Rewards (`contracts/scripts/deployRewards.js`)** — run after the escrow exists (public chains require `ARAF_ESCROW_ADDRESS`; local deploys a linked escrow if it is empty):
0. Safety lock (no tx sent): stops without `CONFIRM_REDEPLOY_REWARDS=YES` if this network's `<network>-rewards.json` exists, `EXISTING_REVENUE_VAULT_ADDRESS` already has `rewards()` set, `EXISTING_REWARDS_ADDRESS` has code, or `escrow.treasury()` is a vault already wired to rewards.
1. `ArafRevenueVault(escrow, finalTreasury, deployer)` → `ArafRewards(escrow, vault, deployer)` (constructor owner = deployer because the wiring is `onlyOwner`).
2. `vault.setRewards(rewards)` — **single use**: a second call reverts (`RewardsAlreadySet`), so a wrong address means redeploying the vault.
3. `vault.setSupportedToken(usdt|usdc, true)`; `rewardBps` must read `4000` (allowed range 4000–7000).
4. Right after the vault and rewards are deployed a `status: "pending"` manifest is written (addresses survive a failed wiring and the lock sees them; the error output says "deployer still owner"). Vault and rewards ownership is transferred to `FINAL_OWNER_ADDRESS` (if different; Ownable is single-step, a wrong address cannot be undone) and the wiring is verified on chain. Writes `deployments/<network>-rewards.json` with `status: "complete"` (`owner` = constructor arg, `finalOwner` = post-handoff owner) and exports ABIs to `contracts/abi/`. Overwriting changed critical addresses needs `CONFIRM_OVERWRITE_REWARDS_MANIFEST=yes`.
5. The npm shortcuts target `base-sepolia` (`deploy:rewards:base-sepolia`); for Base Mainnet run `npx hardhat run scripts/deployRewards.js --network base`.

**Rewards operations (`contracts/scripts/rewardsOps.js`)** — `configure:rewards` (idempotent wiring only), `verify:rewards` (read-only go-live checks), `switch:rewards:treasury` (`escrow.setTreasury(vault)`; needs `CONFIRM_TREASURY_SWITCH=true` and `EXPECTED_CURRENT_TREASURY_ADDRESS`; the signer must be the escrow owner). The treasury switch is deliberately separate from deployment and from `configure`.

**GitHub Actions:** `deploy-base-sepolia.yml` runs this script right after the escrow when `deploy_rewards=true`; it is off by default, a redeploy needs `confirm_redeploy_rewards=YES`, and `escrow.setTreasury(vault)` is NOT done by the workflow (separate multisig owner op). Workflow comparison and required secrets/variables: `DEPLOY_BASE_SEPOLIA.md`.

**Backend wiring afterwards:** set `ARAF_ESCROW_ADDRESS`, `ARAF_REVENUE_VAULT_ADDRESS`, `ARAF_REWARDS_ADDRESS` and `ARAF_DEPLOYMENT_BLOCK`, then deploy the backend; frontend: `VITE_ESCROW_ADDRESS`, `VITE_REVENUE_VAULT_ADDRESS`, `VITE_REWARDS_ADDRESS`.

**solc-js fallback:** when the native compiler cannot be downloaded, set `ARAF_SOLCJS_PATH` to the `soljson.js` of the `solc@0.8.24` package; Hardhat then uses it for 0.8.24 (compiler settings: optimizer 200 runs, `viaIR`, `evmVersion: cancun`).

---

## 8. Migrations and MongoDB Notes

Run the scripts from `backend/` (`node scripts/migrations/<name>.js`). They read `MONGODB_URI` from the environment/`.env` (`MONGO_URI` is read only as a deprecated fallback and logs a warning). On Fly: `fly ssh console -C "node scripts/migrations/<name>.js"`.

| Script | Default mode | Switch | Purpose |
|---|---|---|---|
| `normalizeIdentityFields.js` (`npm run migrate:identity`) | dry-run (the `migrate:identity` npm shortcut passes `--apply` and **writes**) | writes only with `--apply` (`npm run migrate:identity:dry` = dry-run, `npm run migrate:identity` = `--apply`; `--dry-run` still accepted with a warning) | Converts legacy numeric `Order.onchain_order_id`, `Trade.onchain_escrow_id`, `Trade.parent_order_id` to canonical strings. |
| `backfillTerminalTradeStats.js` | dry-run | `--apply` | Fills the permanent `TerminalTradeStat` counters from existing terminal trades. Idempotent (`$setOnInsert` on `trade_key`). |
| `backfillLastBanEndsAt.js` (`npm run migrate:last-ban-ends-at`; `:dry` = dry-run) | dry-run | `--apply` | Fills `User.last_ban_ends_at` from chain (`getReputation().bannedUntil`) for users whose `banned_until` was nulled earlier, so the reputation-decay job can pick them up. Idempotent, read-only RPC (`BASE_RPC_URL`, `ARAF_ESCROW_ADDRESS`). |
| `dedupeRevenueEvents.js` | dry-run | `--apply` (recommended: `--apply --backup=<file>`; rows to delete are written to JSON first) | Removes duplicate `RevenueEvent` rows written by the old worker (escrow row duplicating the vault row for the same tx/token/amount/kind/trade). Idempotent. |
| `dropRedundantIndexes.js` | dry-run | `--apply` | B4-17: drops the non-unique single-field indexes that are prefixes of a unique compound index (`tx_hash`, `epoch`, `date_-1`) from live collections. Never drops a unique index and drops one only if its covering unique index exists. Idempotent; run once after the backend deploy. |

Order of operations for an upgrade:
1. **Before** the new backend: `npm run migrate:identity:dry`, then `npm run migrate:identity` if it reports numeric ids. `IDENTITY_NORMALIZATION_GUARD` defaults to `enforce` in production, so the backend refuses to start while legacy ids exist.
2. Deploy the new backend.
3. **After** the new backend is live: run `backfillTerminalTradeStats.js` (dry-run first, then `--apply`). The order matters: the old backend never writes the counter, so it only fills without gaps once the new backend is running; because the backfill is idempotent it does not collide with rows the new backend writes during the rollout, and re-running is safe.
4. `dedupeRevenueEvents.js` once, after the fixed worker is deployed (dry-run first, then `--apply`); independent of step 3.

PII re-encryption after the HKDF change has no tool in the repository; see `PII_ENCRYPTION_MIGRATION.md`.

**MongoDB index notes**
- Mongoose builds the indexes defined in the models on startup (`autoIndex` is not disabled); there is no `syncIndexes` call, so removing an index from a model does not drop it in the database.
- Unique indexes: `Trade.onchain_escrow_id` (sparse), `Order.onchain_order_id`, `Order.refs.order_ref`, `User.wallet_address`, `TermsAcceptance(wallet_address, terms_version)`, `HistoricalStat.date`, `TerminalTradeStat.trade_key`, and `(tx_hash, log_index)` on `RevenueEvent`, `RewardClaim`, `RewardFunding` and the allocation events; `RewardEpoch(epoch, token)`.
- TTL indexes: `Trade.timers.resolved_at` (365 days, only terminal statuses), `User.last_login` (2 years), `Feedback.created_at` (365 days). `TerminalTradeStat` has no TTL on purpose, so cumulative stats survive Trade expiry.
- Sparse retention indexes on `Trade.evidence.receipt_delete_at` and `Trade.payout_snapshot.snapshot_delete_at` are scanned by the cleanup jobs (receipts 30 days, payout snapshots 30 days after lock once terminal).
- Redis holds nonces, refresh families, the JWT blacklist, rate-limit counters, the DLQ and the worker checkpoints (`worker:last_block`, `worker:last_safe_block`). If the checkpoints are lost the worker restarts from `ARAF_DEPLOYMENT_BLOCK` / `WORKER_START_BLOCK`.

---

## 9. Fly.io Runtime and Health Check

`backend/fly.toml` (app `araf-protocol-backend`, region `ams`):
- `[env]`: `PORT=4000`, `NODE_ENV=production`; everything else is a secret (`fly secrets set`).
- `auto_stop_machines = false`, `min_machines_running = 1`: the event listener must run continuously.
- `[deploy] strategy = "rolling"`: the old machine is stopped before the new one starts, so two workers never run at once; do not pick `bluegreen` with more than one machine until the worker leader lock is verified. `kill_signal = "SIGTERM"`, `kill_timeout = "15s"` (app.js forces exit after 8 s of graceful shutdown).
- Concurrency `connections`, soft 80 / hard 100; VM `shared` 1 CPU, 512 MB.
- Health check: `GET /health` every 30 s, 15 s grace period, 5 s timeout, HTTP inside the container (`force_https = true` outside).
- `/health` is the **liveness** signal tied to the worker: it returns `503 "stale"` when no block was seen for `WORKER_LIVENESS_STALE_MS`; independently the worker watchdog reconnects after `WORKER_BLOCK_STALE_MS` and exits the process if blocks still do not arrive (the platform then restarts it). `/ready` (readiness) is not wired into `fly.toml`; use it for deploy gates and monitoring (full detail with `x-internal-token: $READY_INTERNAL_TOKEN`). The unauthenticated view carries `ok`, `checks`, a `worker` summary, `escrowRegistry` (`mode`, `checked`, `ok`, `reason`), `configIssueCount`, `degraded`, `degradedReasons` and `relayer` (`configured` | `disabled`). The deploy workflows require `/health` 200, only warn for `/ready` 503 `degraded:true`, and additionally verify `escrowRegistry.mode == enforce` (see 6.6a).
- The Fly CLI version is pinned in the workflows (`flyctl 0.4.120`); Vercel CLI is `vercel@62.7.0`.
- The image (`backend/Dockerfile`) is `node:22-alpine` pinned by index digest (to update, put the new index digest of the Docker Hub `library/node` `22-alpine` tag into the `FROM` line), installs with `npm ci --omit=dev`, runs as the non-root `nodeapp` user and starts `node scripts/app.js`.

---

*Araf Protocol — "Trust the Time, Not the Oracle."*

## Deployment hardening baseline (Production)

### Runtime / image policy
- Backend container base image: **Node 22 LTS Alpine**.
- Dependency install in image must use lockfile path: `npm ci --omit=dev`.
- Container runtime user must be **non-root** (`USER nodeapp` or equivalent).

### Frontend build policy
- Vite production build sourcemap policy is explicit: `build.sourcemap=false`.
- `VITE_*` variables are **public at build/runtime in browser**. Never place API keys, private keys, JWT secrets, DB URLs, or any secret in `VITE_*` vars.

### Required / forbidden environment matrix (production)
- Required: `NODE_ENV=production`, `MONGODB_URI`, `REDIS_URL` (TLS), `JWT_SECRET`, `SIWE_DOMAIN`, `SIWE_URI`, `ARAF_ESCROW_ADDRESS`, `BASE_RPC_URL`, `ALLOWED_ORIGINS`, `EXPECTED_CHAIN_ID` (any positive integer is accepted, but token resolution only supports `8453` / `84532` in production), `KMS_PROVIDER` (`aws` or `vault`) with its key variables, and the chain-matching token addresses (`BASE_MAINNET_*` / `BASE_SEPOLIA_*` or `ARAF_TRACKED_TOKENS`).
- Required for worker bootstrap: `ARAF_DEPLOYMENT_BLOCK` or `WORKER_START_BLOCK` (or existing redis checkpoint).
- Forbidden/insecure in production: `KMS_PROVIDER=env` (sole exception: `EXPECTED_CHAIN_ID=84532` + `ALLOW_ENV_KMS_ON_TESTNET=yes`), `REDIS_TLS_SKIP_VERIFY=true`, wildcard `ALLOWED_ORIGINS=*`, localhost-only fallback origins, `SIWE_DOMAIN=localhost`, and missing `BASE_RPC_URL`.
- Safe development defaults (local only): localhost `ALLOWED_ORIGINS`, optional non-TLS Redis, and mock/token local addresses.

### Frontend hosting security headers
Minimum recommended response headers for frontend hosting (Nginx/Cloudflare/Vercel equivalents; `frontend/vercel.json` ships them):
- `Content-Security-Policy` (strict allowlist, no unsafe-inline unless nonce/hash controlled)
- Mobile wallets: `connect-src` adds only two sockets: `wss://www.walletlink.org` (Coinbase WalletLink) and `wss://relay.walletconnect.org` (WalletConnect relay). No `frame-src`/`child-src` is added. WalletConnect loads lazily and only when `VITE_WALLETCONNECT_PROJECT_ID` (32 hex, public value; GitHub repo variable) is set; when empty the option is hidden. The production domain must be listed under Allowed Domains in the Reown dashboard. On mobile without an injected wallet the connect modal also offers deeplinks that open the site in the wallet app browser (`frontend/src/app/mobileWallet.js`; link formats must be verified against official docs).
- `Strict-Transport-Security: max-age=31536000; includeSubDomains; preload`
- `X-Content-Type-Options: nosniff`
- `X-Frame-Options: DENY` (together with CSP `frame-ancestors 'none'`; iframe embedding is closed)
- `Referrer-Policy: strict-origin-when-cross-origin`
- `Permissions-Policy: geolocation=(), microphone=(), camera=()` (expand only if needed)

### Cache policy
In `frontend/vercel.json`, `Cache-Control` is defined only for `/.well-known/farcaster.json` (`public, max-age=300`, plus `Content-Type: application/json; charset=utf-8`); no other path has `Cache-Control` configured (the security headers apply to all paths separately); the `index.html` and `/assets/*` `Cache-Control` values below are the recommended policy and are not configured in `vercel.json`.
- `index.html`: `Cache-Control: no-cache, no-store, must-revalidate`
- versioned static assets (`/assets/*`): `Cache-Control: public, max-age=31536000, immutable`
- keep `/health` (liveness) and `/ready` (readiness) as non-cached health endpoints.
