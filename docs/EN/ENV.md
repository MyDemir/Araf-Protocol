Türkçe: [../TR/ENV.md](../TR/ENV.md)

# Araf Protocol: Environment Variables (env) Reference

> This document is derived from the code (re-verified against the main branch). At least one usage site of every variable was opened and read.
> No real values or secrets are written here; only format examples are given. Anything that could not be confirmed is marked "not verified".
> Sources: `contracts/hardhat.config.js`, `contracts/scripts/*`, `backend/scripts/**`, `frontend/src/**`,
> `.github/workflows/{ci,deploy-base-sepolia,deploy-runtime-base-sepolia}.yml`, `docs/EN/DEPLOY_BASE_SEPOLIA.md`, `backend/fly.toml`, `backend/Dockerfile`, `frontend/vercel.json`, `*/.env.example`,
> `docs/TR/DEPLOYMENT_GUIDE.md`, `docs/TR/MAINNET_READINESS_CHECKLIST.md`.

## Contents
1. [Read this first](#1-read-this-first)
2. [Contracts](#2-contracts-contractsenv)
3. [Backend](#3-backend-backendenv--fly-secrets)
4. [Frontend](#4-frontend-frontendenv--vercel-build-env)
5. [Is it secret? (🔒)](#5-is-it-secret-)
6. [Legacy / unused / aliases](#6-legacy--unused--aliases)
7. [What the workflow sets automatically](#7-what-the-workflow-sets-automatically)
8. [Inconsistencies](#8-inconsistencies)

---

## 1. Read this first

Variables are entered in 4 places:

| Where | What for | How |
|---|---|---|
| **Local development** | `contracts/.env`, `backend/.env`, `frontend/.env` | `npm run init:env` (also runs at the end of `npm run setup`) creates missing `.env` files from `.env.example` and generates `JWT_SECRET`/`MASTER_ENCRYPTION_KEY` for `backend/.env`; it does not touch an existing `.env` (it warns if a placeholder is present, and `--fix-secrets` regenerates them). Manually: `cp .env.example .env`. |
| **GitHub** Secrets and Variables | Single entry point for the Base Sepolia deploy workflows | `gh secret set` / `gh variable set` (`docs/EN/DEPLOY_BASE_SEPOLIA.md`). This is the only place you enter values. |
| **Fly.io** (backend production) | All production variables of the backend | **The workflow writes them** (`flyctl secrets import --stage`, then `flyctl deploy`). No manual `fly secrets set` needed. `PORT`/`NODE_ENV` are already in `backend/fly.toml [env]`. |
| **Vercel** (frontend build) | `VITE_*` | **The workflow supplies them** (`vercel deploy --build-env ...`; only when `deploy_frontend=true`). Not entered manually. |

Abbreviations: `C/.env` = `contracts/.env` · `B/.env` = `backend/.env` · `F/.env` = `frontend/.env` · `GH` = GitHub secret/variable ·
`Fly` = Fly secret (written by the workflow) · `Vercel` = Vercel build-env (supplied by the workflow) · `terminal` = set temporarily on the command line.
The "Where to set" column in the tables shows the **target location** for Base Sepolia/Mainnet; on Sepolia the workflow writes the `Fly`/`Vercel` values (see 7).

> **The list you must enter manually for the Base Sepolia demo**
> (source: the validation step at `deploy-base-sepolia.yml:43-76` and `docs/EN/DEPLOY_BASE_SEPOLIA.md:7-40`; deploy: `gh workflow run deploy-base-sepolia.yml -f deploy_frontend=true`)
>
> **GitHub Secrets, required (8):** `DEPLOYER_PRIVATE_KEY`, `BASE_SEPOLIA_RPC_URL`, `BASE_SEPOLIA_WS_RPC_URL`, `FLY_API_TOKEN`,
> `MONGODB_URI`, `REDIS_URL` (must be `rediss://`), `JWT_SECRET` (≥64 characters), `MASTER_ENCRYPTION_KEY` (exactly 64 hex).
>
> **GitHub Variables, required (5):** `FRONTEND_DOMAIN` (host only, no `https://`), `TREASURY_ADDRESS`, `FINAL_OWNER_ADDRESS` (different from treasury),
> `BASE_SEPOLIA_USDT_ADDRESS`, `BASE_SEPOLIA_USDC_ADDRESS`.
>
> **If the frontend is also deployed, 3 extra secrets:** `VERCEL_TOKEN`, `VERCEL_ORG_ID`, `VERCEL_PROJECT_ID`.
>
> **Optional:** secrets `RELAYER_PRIVATE_KEY`, `GH_VARIABLES_TOKEN` (fine-grained PAT, this repo only, "Variables: read and write"; makes the full-deploy addresses variables automatically), `BASESCAN_API_KEY` (only for `verify_contracts=true`); variables `FLY_APP_NAME` (default `araf-protocol-backend`), `ADMIN_WALLETS`, `VITE_RPC_URL`, `ARAF_REVENUE_VAULT_ADDRESS`, `ARAF_REWARDS_ADDRESS` (if rewards was deployed separately; when defined they are passed to Fly and Vercel).
>
> **AFTER deploy (2 variables):** `ARAF_ESCROW_ADDRESS`, `ARAF_DEPLOYMENT_BLOCK`; needed only for later runs of `deploy-runtime-base-sepolia.yml`.
> If the `GH_VARIABLES_TOKEN` secret is defined, the full-deploy workflow writes these itself; if not, it prints a warning and puts the `gh variable set` lines to run manually on the summary page.
>
> Total: **13 required entries** (8 secrets + 5 variables), **16** with the frontend. There is **no** manual entry for `contracts/.env`, `fly secrets set`, or the Vercel dashboard.
> The Fly app (`fly apps create`) and the Vercel project must be created manually once (`DEPLOY_BASE_SEPOLIA.md:44-45`).

---

## 2. Contracts (`contracts/.env`)

Hardhat loads `contracts/.env`. The network is selected with `--network <hardhat|localhost|base-sepolia|base>`, not with env.
Variables in this package do not go to Fly/Vercel; the workflow passes them only to the deploy step's environment without writing `contracts/.env` (`deploy-base-sepolia.yml:87-100`, see 7.3). **37 variables are read** (+ those that exist only in the example/docs: see 6).

Columns: L = Local, S = Base Sepolia, M = Mainnet. "Required": always / for the relevant job / optional (default).

### 2.1 Network and signer

| Variable | What it does | Required? | L | S | M | Where | Used at |
|---|---|---|---|---|---|---|---|
| `BASE_SEPOLIA_RPC_URL` | Base Sepolia RPC URL | With `--network base-sepolia`; errors if missing | not needed | `https://…alchemy…/v2/KEY` | not needed | C/.env | `hardhat.config.js:35`, `:96` |
| `BASE_RPC_URL` | Base Mainnet RPC URL | With `--network base`; errors if missing | not needed | not needed | `https://…/v2/KEY` | C/.env | `hardhat.config.js:32` |
| 🔒 `DEPLOYER_PRIVATE_KEY` | Private key of the signing wallet on public networks | On public networks (if missing, the account list is empty) | not needed | `0x…64 hex` | `0x…64 hex` | C/.env | `hardhat.config.js:90`, `:98` |
| 🔒 `BASESCAN_API_KEY` | API key for BaseScan verification | Optional (`""`) | not needed | optional | optional | C/.env | `hardhat.config.js:106` |
| `REPORT_GAS` | Gas report if `true` | Optional (off) | `false` | `false` | `false` | C/.env | `hardhat.config.js:129` |
| 🔒 `CMC_API_KEY` | CoinMarketCap key for prices in the gas report | Optional | not needed | not needed | not needed | C/.env | `hardhat.config.js:131` |
| `ARAF_SOLCJS_PATH` | Path to `soljson.js` in environments where the native compiler cannot be downloaded | Optional (no effect) | rarely | rarely | rarely | C/.env | `hardhat.config.js:48` |
| `NODE_ENV` | If `production`, makes deploy token addresses mandatory | Optional | empty | empty | empty | C/.env, terminal | `scripts/deploy.js:108` |

### 2.2 Escrow deploy (`scripts/deploy.js`)

| Variable | What it does | Required? | L | S | M | Where | Used at |
|---|---|---|---|---|---|---|---|
| `CONFIRM_PUBLIC_DEPLOY` | Confirmation for deploying to a public chain (must be `yes`) | Required on public networks | not needed | `yes` | `yes` | C/.env, terminal | `deploy.js:319` |
| `TREASURY_ADDRESS` | Protocol treasury (escrow constructor argument) | Every deploy | `0x…40 hex` | `0x…40 hex` | Gnosis Safe | C/.env | `deploy.js:341` |
| `FINAL_OWNER_ADDRESS` | Ownership transfer at the end of deploy | Public/custom: required and different from treasury; local: defaults to treasury | optional | required | required | C/.env | `deploy.js:148`, `:151` |
| `BASE_SEPOLIA_USDT_ADDRESS` / `_USDC_` | Sepolia token addresses | Required for a 84532 deploy (`MAINNET_*` is rejected) | not needed | `0x…40 hex` | not needed | C/.env | `deploy.js:130-131` |
| `BASE_MAINNET_USDT_ADDRESS` / `_USDC_` | Mainnet token addresses | Required for a 8453 deploy | not needed | not needed | `0x…40 hex` | C/.env | `deploy.js:115-116` |
| `USE_EXTERNAL_TOKEN_ADDRESSES` | If `true`, uses external tokens instead of mocks on local/custom | Optional (`false`) | `false` | not needed | not needed | C/.env | `deploy.js:357` |
| `EXTERNAL_USDT_ADDRESS` / `_USDC_` | External token addresses in the case above (non-Base chain) | `USE_EXTERNAL…=true` and not a Base chain | optional | not needed | not needed | C/.env | `deploy.js:140-141` |
| `CODESPACE_NAME` | Codespaces name; rewrites `VITE_API_URL` in `frontend/.env` | Optional; local only | automatic | not needed | not needed | Codespaces environment | `deploy.js:301` |
| `TEST_TOKEN_SYMBOL` / `TEST_TOKEN_NAME` | Token symbol/name for `deployTestToken.js` (defaults `tUSDT` / `Test Tether USD`) | Optional | not needed | optional | not needed | C/.env, terminal | `deployTestToken.js` |
| `CONFIRM_TEST_TOKEN_DEPLOY` | Confirmation (`yes`) for test token deploy on a public (84532) network; only 84532/31337 work | Required on Sepolia | not needed | `yes` | forbidden (errors on 8453) | C/.env, terminal | `deployTestToken.js` |

### 2.3 Rewards deploy / operations (`deployRewards.js`, `rewardsOps.js`, `smokeRewards.js`, `gasBaseline.js`)

| Variable | What it does | Required? | L | S | M | Where | Used at |
|---|---|---|---|---|---|---|---|
| `ARAF_ESCROW_ADDRESS` | Existing escrow address | Required on public; on local, deploys a fresh escrow if missing | optional | `0x…40 hex` | `0x…40 hex` | C/.env | `deployRewards.js:53`, `rewardsOps.js:27` |
| `FINAL_TREASURY_ADDRESS` | Final treasury for rewards | Required on public; local defaults to the deployer | optional | required | required | C/.env | `deployRewards.js:54` |
| `CONFIRM_FRESH_ESCROW_DEPLOY` | Only changes the error message; does NOT deploy a new escrow on public | Optional | not needed | not needed | not needed | terminal | `deployRewards.js:73` |
| `CONFIRM_OVERWRITE_REWARDS_MANIFEST` | `yes` to overwrite the critical addresses of an existing `<network>-rewards.json` | Only when overwriting | not needed | when needed | when needed | terminal | `deployRewards.js:42` |
| `ARAF_REVENUE_VAULT_ADDRESS` | Revenue vault address (env first, then manifest) | For `configure`/`verify`/`switch` jobs | optional | from manifest | from manifest | C/.env | `rewardsOps.js:28` |
| `ARAF_REWARDS_ADDRESS` | Rewards contract address (env first, then manifest) | Same | optional | from manifest | from manifest | C/.env | `rewardsOps.js:29` |
| `USDT_ADDRESS` / `USDC_ADDRESS` | Token address in rewards jobs (env first, then manifest) | Same | optional | from manifest | from manifest | C/.env | `rewardsOps.js:30-31` |
| `REWARDS_OP` | `configure`/`verify`/`switch-treasury`; if empty, derived from the npm script name | Optional | not needed | optional | optional | terminal | `rewardsOps.js:106` |
| `CONFIRM_TREASURY_SWITCH` | `true` to switch the treasury to the vault | Only `switch-treasury` | not needed | when needed | when needed | terminal | `rewardsOps.js:77` |
| `EXPECTED_CURRENT_TREASURY_ADDRESS` | Current treasury address for `switch-treasury` | Only `switch-treasury` | not needed | when needed | when needed | terminal | `rewardsOps.js:95` |
| `EXPECT_ESCROW_TREASURY_ADDRESS` | Extra `escrow.treasury()` check in `verify` | Optional | not needed | optional | optional | terminal | `rewardsOps.js:63` |
| `ALLOW_NON_4000_REWARD_BPS` | If `true`, deliberately skips the rewardBps≠4000 check | Optional (off) | not needed | not needed | not needed | terminal | `rewardsOps.js:88` |
| `CONFIRM_SWITCH_TREASURY_TO_VAULT` | Old flag: if set during `configure`, the operation is rejected | Do not use | not needed | not needed | not needed | (not in example) | `rewardsOps.js:38` |
| `CONFIRM_PUBLIC_SMOKE` | Confirmation (`yes`) for the smoke test on a public network | For smoke on public | not needed | `yes` | `yes` | terminal | `smokeRewards.js:7` |
| `GAS_BASELINE_OUT` | JSON output path for the gas table | Optional | optional | not needed | not needed | terminal | `gasBaseline.js:173` |

---

## 3. Backend (`backend/.env` / Fly secrets)

`app.js:3` and the migration scripts load `backend/.env` via `dotenv`. In production (`NODE_ENV=production`, `fly.toml:11-12`)
values come from Fly secrets; on Sepolia the workflow writes them (see 7.1). **89 variables are read.** No backend variable is exposed to the frontend as `VITE_*`.

Shared reading: L = Local, S = Base Sepolia (still runs with `NODE_ENV=production` on Fly), M = Mainnet.
"In prod" = required when `NODE_ENV=production` (otherwise the process exits or `/ready` returns 503).

### 3.1 Server / Network

| Variable | What it does | Required? | L | S | M | Where | Used at |
|---|---|---|---|---|---|---|---|
| `NODE_ENV` | `production` enables all fail-fast rules | Optional (`development`); fixed to `production` on Fly | `development` | `production` | `production` | B/.env; Fly: `fly.toml [env]` | `app.js:145`, `fly.toml:12` |
| `PORT` | HTTP listen port | Optional (`4000`) | `4000` | `4000` | `4000` | B/.env; Fly: `fly.toml [env]` | `app.js:548`, `fly.toml:11` |
| `LOG_DIR` | Log directory (file `araf.log`) | Optional (`backend/logs`) | empty | empty | empty | B/.env, Fly | `utils/logger.js:28` |

### 3.2 Database and Redis

| Variable | What it does | Required? | L | S | M | Where | Used at |
|---|---|---|---|---|---|---|---|
| `MONGODB_URI` | MongoDB connection URL | Always (`connectDB` errors if missing) | `mongodb://127.0.0.1:27017/araf_protocol` | `mongodb+srv://…` | `mongodb+srv://…` | B/.env, Fly | `config/db.js:34`, `health.js:96` |
| 🔒 `REDIS_URL` | Redis connection URL (may contain a password) | In prod; in dev `redis://127.0.0.1:6379` | `redis://127.0.0.1:6379` | `rediss://…` | `rediss://…` | B/.env, Fly | `config/redis.js:89` |
| `REDIS_TLS` | If `true`, TLS even with `redis://` | Optional; TLS is mandatory in prod (`rediss://` or this) | empty | `rediss://` is enough | `rediss://` is enough | B/.env, Fly | `config/redis.js:96` |
| `REDIS_TLS_SKIP_VERIFY` | Disables certificate verification for a self-signed dev Redis | Optional (`false`); if `true` in prod the backend will not start | `false` | never | never | B/.env | `config/redis.js:97` |
| `REDIS_READY_WAIT_MS` | Redis readiness wait time (ms) | Optional (`5000`) | empty | empty | empty | B/.env, Fly | `config/redis.js:10` |

### 3.3 Identity / SIWE / JWT / CORS

| Variable | What it does | Required? | L | S | M | Where | Used at |
|---|---|---|---|---|---|---|---|
| 🔒 `JWT_SECRET` | JWT signing secret (≥64 characters, entropy ≥3.5, placeholders rejected) | **Always** (throws when the module loads) | `crypto.randomBytes(64)` hex | same method | same method | B/.env, Fly | `services/siwe.js:19`, `:67-78` |
| `JWT_EXPIRES_IN` | Auth JWT lifetime | Optional (`15m`) | `15m` | `15m` | `15m` | B/.env, Fly | `siwe.js:20` |
| `PII_TOKEN_EXPIRES_IN` | Trade-scoped PII token lifetime | Optional (`15m`) | `15m` | `15m` | `15m` | B/.env, Fly | `siwe.js:21` |
| `JWT_BLACKLIST_TIMEOUT_MS` | Redis blacklist read timeout | Optional (`1500`) | empty | empty | empty | B/.env, Fly | `siwe.js:34` |
| `JWT_BLACKLIST_FAIL_MODE` | If the blacklist cannot be read: `closed` rejects, `open` lets through | Optional (`closed` in prod, `open` otherwise) | empty | empty | empty | B/.env, Fly | `siwe.js:315` |
| `REFRESH_ABSOLUTE_TTL_SECS` | Absolute lifetime of a refresh session (s) | Optional (`2592000`) | empty | empty | empty | B/.env, Fly | `siwe.js:31` |
| `REFRESH_REUSE_GRACE_MS` | Tolerance for the two-tab race (ms) | Optional (`10000`) | empty | empty | empty | B/.env, Fly | `siwe.js:33` |
| `REFRESH_LEGACY_SCAN` | If `false`, the one-time SCAN for legacy sessions is disabled | Optional (on) | empty | empty | empty | B/.env, Fly | `siwe.js:606` |
| `SIWE_DOMAIN` | SIWE domain: host only, no `https://` | In prod (cannot be `localhost`); in dev `localhost` | `localhost` | frontend host (`app.vercel.app`) | real domain | B/.env, Fly | `siwe.js:42`, `app.js:353` |
| `SIWE_URI` | SIWE URI: must be `https://`, host must equal `SIWE_DOMAIN` | In prod; in dev `https://<SIWE_DOMAIN>` | empty | `https://app.vercel.app` | `https://app.example.xyz` | B/.env, Fly | `siwe.js:43`, `health.js:124-135` |
| `ALLOWED_ORIGINS` | CORS origin list (comma-separated, no path) | In prod (`*` and localhost-only are forbidden); in dev `http://localhost:5173` | `http://localhost:5173` | `https://app.vercel.app` | `https://app.example.xyz` | B/.env, Fly | `app.js:117`, `:145-167` |

### 3.4 Chain and contract addresses

| Variable | What it does | Required? | L | S | M | Where | Used at |
|---|---|---|---|---|---|---|---|
| 🔒 `BASE_RPC_URL` | Chain RPC URL (the key is in the URL) | In prod (no public fallback) | `https://…/v2/KEY` | Sepolia RPC | Mainnet RPC | B/.env, Fly | `eventListener.js:589`, `health.js:103` |
| 🔒 `BASE_WS_RPC_URL` | WebSocket RPC; if missing, HTTP is used (must be `wss://`) | Recommended (optional) | empty | `wss://…` | `wss://…` | B/.env, Fly | `eventListener.js:619` |
| `EXPECTED_CHAIN_ID` | Expected chain: `8453` Base, `84532` Sepolia | In prod; also in dev if `BASE_RPC_URL` is set | `84532` or `31337` | `84532` | `8453` | B/.env, Fly | `expectedChain.js:19`, `tokenEnv.js:35` |
| `ALLOW_UNSAFE_CHAIN_ID_BYPASS` | Dev only: skips the chain check when `EXPECTED_CHAIN_ID` is empty | Optional (`false`); no effect in prod | optional | never | never | B/.env | `expectedChain.js:20` |
| `ARAF_ESCROW_ADDRESS` | ArafEscrow address | In prod (worker exits if missing); in dev the worker runs "dry-run" | `0x…40 hex` | deploy output | deploy output | B/.env, Fly | `eventListener.js:590`, `protocolConfig.js:107` |
| `ARAF_REVENUE_VAULT_ADDRESS` | Rewards mirror: for vault events | Optional (if missing, the mirror is not tracked) | empty | `0x…40 hex` | `0x…40 hex` | B/.env, Fly | `eventListener.js:644` |
| `ARAF_REWARDS_ADDRESS` | Rewards contract; also enables `rewardOutcomeRecorder` | Optional (if missing, mirror/recorder are inactive) | empty | `0x…40 hex` | `0x…40 hex` | B/.env, Fly | `eventListener.js:645`, `jobs/rewardOutcomeRecorder.js:50` |

### 3.5 Tokens

Selection depends on `EXPECTED_CHAIN_ID` (`services/tokenEnv.js:61-109`): 8453 → `BASE_MAINNET_*`, 84532 → `BASE_SEPOLIA_*`.

| Variable | What it does | Required? | L | S | M | Where | Used at |
|---|---|---|---|---|---|---|---|
| `BASE_MAINNET_USDT_ADDRESS` / `_USDC_` | Mainnet token addresses (canonical) | In prod when 8453 and `ARAF_TRACKED_TOKENS` is missing; zero address is not accepted | optional | not needed | `0x…40 hex` | B/.env, Fly | `tokenEnv.js:64` |
| `BASE_SEPOLIA_USDT_ADDRESS` / `_USDC_` | Sepolia token addresses (canonical) | In prod when 84532 and `ARAF_TRACKED_TOKENS` is missing | optional | `0x…40 hex` | not needed | B/.env, Fly | `tokenEnv.js:65` |
| `ARAF_TRACKED_TOKENS` | List of tokens to track (comma-separated); if given, takes precedence over the pairs | Optional | empty | empty | empty | B/.env, Fly | `tokenEnv.js:136` |
| `MAINNET_USDT_ADDRESS` / `_USDC_` | Legacy alias (8453 only); errors on 84532 in prod | Not recommended | empty | **do not use** | empty | (see 6) | `tokenEnv.js:66`, `:84-92` |
| `USDT_ADDRESS` / `USDC_ADDRESS` | Legacy fallback; only outside prod (logs a warning) | Not recommended | empty | **do not use** | **do not use** | (see 6) | `tokenEnv.js:67`, `:74-76`, `:94-96` |

### 3.6 Encryption / KMS

In prod `KMS_PROVIDER=env` is **rejected**; the only exception is a narrow testnet rule: `NODE_ENV=production` + `EXPECTED_CHAIN_ID=84532` + `ALLOW_ENV_KMS_ON_TESTNET=yes` (`encryption.js:57-79`, see 3.12). Mainnet requires `aws`/`vault`. A KMS self-test runs at startup (`app.js:360`, `encryption.js:270-282`).

| Variable | What it does | Required? | L | S | M | Where | Used at |
|---|---|---|---|---|---|---|---|
| `KMS_PROVIDER` | `env` / `aws` / `vault` | In prod `aws`/`vault`; `env` under the testnet exception; default `env` | `env` | `env` (written by the workflow) | `aws` | B/.env; Sepolia: Fly (workflow) | `encryption.js:102`, `:271` |
| 🔒 `MASTER_ENCRYPTION_KEY` | Master encryption key (64 hex; first 64 characters) | When `KMS_PROVIDER=env`: dev and the testnet exception | `randomBytes(32)` hex | GH secret → Fly (workflow) | **do not set** | B/.env; GH secret | `encryption.js:113` |
| 🔒 `AWS_ENCRYPTED_DATA_KEY` | Data key encrypted with AWS KMS (base64 CiphertextBlob) | When `KMS_PROVIDER=aws` | not needed | not needed | base64 | Fly | `encryption.js:144`, `:285` |
| `ALLOW_ENV_KMS_ON_TESTNET` | Flag (`yes`) that allows `KMS_PROVIDER=env` in prod on Base Sepolia only; has no effect on mainnet and causes an error | Optional; only with `NODE_ENV=production` + `EXPECTED_CHAIN_ID=84532` | not needed | `yes` (written by the workflow) | **never** | Fly (workflow `:164`) | `encryption.js:58-63`, `:279` |
| `AWS_REGION` | AWS region | Optional (`eu-west-1`) | empty | not written by the workflow | `eu-west-1` | Fly | `encryption.js:143` |
| `VAULT_ADDR` | Vault address | When `KMS_PROVIDER=vault` | not needed | not needed | `https://vault…:8200` | Fly | `encryption.js:185`, `:290` |
| 🔒 `VAULT_TOKEN` | Vault access token | When `KMS_PROVIDER=vault` | not needed | not needed | token | Fly | `encryption.js:186`, `:290` |
| `VAULT_KEY_NAME` | Transit key name | Optional (`araf-master-key`) | not needed | not needed | empty | Fly | `encryption.js:187` |
| 🔒 `VAULT_ENCRYPTED_DATA_KEY` | Fixed wrapped data key (`vault:v1:…`) | When `KMS_PROVIDER=vault` (fail-closed if missing) | not needed | not needed | `vault:v1:…` | Fly | `encryption.js:188`, `:293` |

### 3.7 Worker / event listener / health

| Variable | What it does | Required? | L | S | M | Where | Used at |
|---|---|---|---|---|---|---|---|
| `ARAF_DEPLOYMENT_BLOCK` | Replay start block on first startup (takes precedence over `WORKER_START_BLOCK`) | In prod, if there is no checkpoint in Redis | empty (starts from 0) | deploy block | deploy block | B/.env, Fly | `eventListener.js:1095`, `health.js:146` |
| `WORKER_START_BLOCK` | Alternative to the above | Same (one of the two) | empty | alternative | alternative | B/.env, Fly | `eventListener.js:1095` |
| `WORKER_DISABLED` | If `true`, the worker never starts (API only) | Optional (`false`) | empty | empty | empty | B/.env, Fly | `eventListener.js:591` |
| `WORKER_FINALITY_DEPTH` | Block depth for the safe checkpoint | Optional (`6` in prod, `1` otherwise) | empty | empty | empty | B/.env, Fly | `eventListener.js:80-81` |
| `WORKER_BLOCK_BATCH_SIZE` | Replay batch size | Optional (`1000`) | empty | empty | empty | B/.env, Fly | `eventListener.js:78` |
| `WORKER_CHECKPOINT_INTERVAL_BLOCKS` | Checkpoint interval (blocks) | Optional (`50`) | empty | empty | empty | B/.env, Fly | `eventListener.js:79` |
| `WORKER_REPLAY_BACKOFF_BASE_MS` / `_MAX_MS` | Floor/ceiling of the replay error backoff | Optional (`5000` / `300000`) | empty | empty | empty | B/.env, Fly | `eventListener.js:83-84` |
| `WORKER_BLOCK_STALE_MS` | If no new block for this many ms, reconnect; if still none, the process exits | Optional (`75000`) | empty | empty | empty | B/.env, Fly | `eventListener.js:87` |
| `WORKER_WATCHDOG_INTERVAL_MS` | Watchdog check interval | Optional (`15000`) | empty | empty | empty | B/.env, Fly | `eventListener.js:88` |
| `WORKER_LIVENESS_STALE_MS` | `/health` 503 "stale" threshold | Optional (`BLOCK_STALE*2+30000`) | empty | empty | empty | B/.env, Fly | `eventListener.js:91` |
| `WORKER_MAX_LAG_BLOCKS` | Maximum block lag for `/ready` | Optional (`25`) | empty | empty | empty | B/.env, Fly | `health.js:20` |
| 🔒 `READY_INTERNAL_TOKEN` | `x-internal-token` value for the full `/ready` body | Optional (feature is off if missing) | empty | long random | long random | B/.env, Fly | `health.js:348` |
| `READY_CACHE_TTL_MS` | `/ready` cache duration (clamped to 5000-10000) | Optional (`7000`) | empty | empty | empty | B/.env, Fly | `health.js:291` |

### 3.8 Relayer / rewards

| Variable | What it does | Required? | L | S | M | Where | Used at |
|---|---|---|---|---|---|---|---|
| 🔒 `RELAYER_PRIVATE_KEY` | Separate, low-balance wallet that calls `decayReputation` and `recordTradeOutcomes` | Optional (if missing, the two jobs log and stay inactive) | empty | `0x…64 hex` | `0x…64 hex` | B/.env, Fly | `jobs/reputationDecay.js:45`, `jobs/rewardOutcomeRecorder.js:49` |
| `REPUTATION_DECAY_CANDIDATE_LIMIT` | Number of decay candidates | Optional (`250`) | empty | empty | empty | B/.env, Fly | `reputationDecay.js:35` |
| `REPUTATION_DECAY_TX_LIMIT` | Number of txs per round | Optional (`50`) | empty | empty | empty | B/.env, Fly | `reputationDecay.js:36` |
| `REWARD_RECORDER_CANDIDATE_LIMIT` | Number of recorder candidates | Optional (`200`) | empty | empty | empty | B/.env, Fly | `rewardOutcomeRecorder.js:36` |
| `REWARD_RECORDER_BATCH_LIMIT` | Recorder batch size | Optional (`50`) | empty | empty | empty | B/.env, Fly | `rewardOutcomeRecorder.js:37` |

### 3.9 Admin / observability and identity normalization

| Variable | What it does | Required? | L | S | M | Where | Used at |
|---|---|---|---|---|---|---|---|
| `ADMIN_WALLETS` | Wallets for `/api/admin/*` and `isAdmin` (comma-separated) | Optional (if empty, nobody is admin) | your own wallet | `0x…40 hex` | `0x…40 hex` | B/.env, Fly | `utils/adminWallets.js:6` |
| `IDENTITY_NORMALIZATION_GUARD` | `off` / `warn` / `enforce` (mixed numeric id guard) | Optional (`enforce` in prod, `warn` otherwise) | empty | empty | empty | B/.env, Fly | `app.js:88-94` |
| `PII_IDENTITY_NORMALIZATION_GUARD` | Separate mode for PII routes | Optional (falls back to the previous variable, then `enforce`) | empty | empty | empty | B/.env, Fly | `routes/pii.js:80` |
| `IDENTITY_MIGRATION_BATCH_SIZE` | Batch size for `migrate:identity` | Optional (`1000`) | empty | empty | empty | B/.env | `migrations/normalizeIdentityFields.js:170` |

### 3.10 Scheduled jobs (ms; positive integers only, otherwise the default; upper limit 2 147 483 647)

All are optional; set in `B/.env` or Fly; used at `app.js:84` (`_envMs`) and `app.js:385-395`.

| Variable | Default | Note |
|---|---|---|
| `JOB_DLQ_INTERVAL_MS` | `60000` | DLQ monitoring |
| `JOB_REPUTATION_DECAY_DELAY_MS` / `_INTERVAL_MS` | `30000` / `86400000` | |
| `JOB_REWARD_RECORDER_INTERVAL_MS` | `3600000` | |
| `JOB_STATS_SNAPSHOT_DELAY_MS` / `_INTERVAL_MS` | `60000` / `86400000` | |
| `JOB_SENSITIVE_CLEANUP_DELAY_MS` / `_INTERVAL_MS` | `120000` / `1800000` | |
| `JOB_USER_BANK_RISK_CLEANUP_DELAY_MS` / `_INTERVAL_MS` | `150000` / `21600000` | |
| `JOB_RECONCILIATION_ENABLED` | prod: on (`false` disables); otherwise: off (`true` enables) | `app.js:493-494` |
| `JOB_RECONCILIATION_INTERVAL_MS` | `600000` | |
| `USER_BANK_RISK_CLEANUP_CURSOR_BATCH_SIZE` | `200` | `jobs/cleanupUserBankRiskMetadata.js:25` |

### 3.11 Cache / limits / reference rates (all optional)

| Variable | Default | What it does | Used at |
|---|---|---|---|
| `CONFIG_CACHE_TTL_SECONDS` | `3600` | Protocol config mirror cache | `services/protocolConfig.js:31` |
| `MARKET_CACHE_TTL_MS` | `10000` (`0` when `NODE_ENV=test`) | `GET /api/orders` response cache; `0` disables | `routes/orders.js:298` |
| `RATE_LIMIT_TIER_CACHE_TTL_SECONDS` | `120` | Rate limiter tier cache | `middleware/rateLimiter.js:167` |
| `REFERENCE_TICKER_REFRESH_INTERVAL_MS` | `120000` | Reference rate refresh interval | `app.js:479` |
| `REFERENCE_TICKER_CRYPTO_TTL_SECONDS` | `120` | Crypto rate cache | `services/referenceTicker.js:20` |
| `REFERENCE_TICKER_FIAT_TTL_SECONDS` | `21600` | Fiat rate cache | `referenceTicker.js:21` |
| `REFERENCE_TICKER_LAST_GOOD_TTL_SECONDS` | `604800` | Last-good cache lifetime | `referenceTicker.js:22` |
| `REFERENCE_TICKER_MAX_STALE_SECONDS` | `86400` | Rows older than this are dropped from last-good too | `referenceTicker.js:28` |

### 3.12 Testnet exceptions

The only exception is `ALLOW_ENV_KMS_ON_TESTNET` (`encryption.js:57-63`). Three conditions must be true **together**: `NODE_ENV=production` + `EXPECTED_CHAIN_ID=84532` +
`ALLOW_ENV_KMS_ON_TESTNET=yes`; then `KMS_PROVIDER=env` + `MASTER_ENCRYPTION_KEY` is accepted in prod. At startup the RPC is verified to really be 84532
(`encryption.js:247-268`, `:279`) and a large warning is logged on every start. On mainnet (8453) startup fails even if set to `yes`. Real PII must not be entered.
The workflow writes this triple itself (see 7.1). Apart from this, all other prod rules apply unchanged to Sepolia: `rediss://`, a real `SIWE_DOMAIN`, `ARAF_DEPLOYMENT_BLOCK`.

---

## 4. Frontend (`frontend/.env` / Vercel build-env)

Vite embeds only `VITE_*` variables into the browser bundle. **13 variables are read** (+ Vite's built-in `import.meta.env.PROD` / `DEV` values).
Values are fixed **at build time**; on Vercel a change requires a rebuild.

| Variable | What it does | Required? | L | S | M | Where | Used at |
|---|---|---|---|---|---|---|---|
| `VITE_API_URL` | Backend API base (`/api` is appended) | Optional. If empty in dev, `http://localhost:4000/api`; **in prod an absolute URL breaks the build**, leave empty (`/api` → `vercel.json` rewrite) | `http://localhost:4000` | **empty** | **empty** | F/.env (local); do not set on Vercel | `app/apiConfig.js:22-32`, `App.jsx:29` |
| `VITE_ESCROW_ADDRESS` | Escrow contract address; if zero/empty, contract actions are disabled | Always (otherwise an env error banner) | deploy output | Sepolia escrow | Mainnet escrow | F/.env, Vercel | `App.jsx:31`, `hooks/useArafContract.js:117` |
| `VITE_USDT_ADDRESS` | USDT token address | Always | mock USDT | Sepolia USDT | Base USDT | F/.env, Vercel | `App.jsx:39`, `contexts/profile/RewardsPanel.jsx:10` |
| `VITE_USDC_ADDRESS` | USDC token address | Always | mock USDC | Sepolia USDC | Base USDC | F/.env, Vercel | `App.jsx:40`, `RewardsPanel.jsx:11` |
| `VITE_REVENUE_VAULT_ADDRESS` | Rewards vault address (mirror/read-only) | For the rewards screen; disabled if missing | empty | `0x…40 hex` | `0x…40 hex` | F/.env, Vercel | `app/envConfig.js` (`resolveRevenueVaultAddress`), `hooks/useRewardsContract.js`, `App.jsx` |
| `VITE_REWARDS_ADDRESS` | Rewards contract address | For the rewards screen | empty | `0x…40 hex` | `0x…40 hex` | F/.env, Vercel | `useRewardsContract.js:8`, `App.jsx:403` |
| `VITE_REWARDS_VAULT_ADDRESS` | Legacy alias used when `VITE_REVENUE_VAULT_ADDRESS` is empty | Not recommended | empty | **do not use** | **do not use** | (see 6) | `app/envConfig.js` (single helper; `console.warn` if read) |
| `VITE_TARGET_CHAIN` | Chain of the production build: `base` / `base-sepolia`; an unknown value warns and falls back to `base`; no effect in dev | Optional (`base`) | not needed | `base-sepolia` | `base` (or empty) | Vercel (build) | `app/chainPolicy.js:21`, `main.jsx:62` |
| `VITE_RPC_URL` | Primary RPC (public RPC remains as fallback); a non-http(s) value is ignored | Optional (public RPC) | empty | optional | optional | F/.env, Vercel | `main.jsx:61`, `app/rpcTransport.js` |
| `VITE_ENABLE_UI_LAB` | If `true`, the UI Lab scenario screen is included in the production build too | Optional (`false`); `false` on the public site | `false` | `false` | `false` | F/.env, Vercel | `app/uiLab.js:6-7`, `:13` |
| `VITE_SOCIAL_GITHUB` | Social link: GitHub | Optional (project repo URL) | empty | empty | empty | F/.env, Vercel | `app/AppViews.jsx:79` |
| `VITE_SOCIAL_TWITTER` | Social link: X/Twitter | Optional (hidden if empty) | empty | empty | empty | F/.env, Vercel | `AppViews.jsx:80` |
| `VITE_SOCIAL_FARCASTER` | Social link: Farcaster | Optional (hidden if empty) | empty | empty | empty | F/.env, Vercel | `AppViews.jsx:81` |
| `VITE_PUBLIC_URL` | Public https origin (no trailing `/`); source of all absolute meta URLs and `dist/.well-known/farcaster.json` | Optional (fc:*/farcaster.json skipped + build warning if empty) | empty | empty | `https://$FRONTEND_DOMAIN` (workflow) | F/.env, Vercel build | `frontend/build/miniappMeta.js` |
| `VITE_BASE_APP_ID` | `base:app_id` meta tag value | Optional | project id | project id | optional (variable) | F/.env, Vercel build | `frontend/build/miniappMeta.js` |
| `FARCASTER_ACCOUNT_ASSOCIATION_HEADER` / `_PAYLOAD` / `_SIGNATURE` | Signed domain association for farcaster.json (public but bound to the domain); all three or none | Optional | empty | empty | optional (variables) | F/.env, Vercel build | `frontend/build/miniappMeta.js` |

For a local Sepolia build, `npm run build:frontend:testnet` (`package.json:12`) sets `VITE_TARGET_CHAIN=base-sepolia`. `contracts/scripts/deploy.js` writes `VITE_ESCROW_ADDRESS`, `VITE_USDT_ADDRESS`, `VITE_USDC_ADDRESS` to `frontend/.env` itself only on the local network (`deploy.js:274-299`, `:440-441`). It does not write them on a public network.

---

## 5. Is it secret? (🔒)

| Group | Variables | Rule |
|---|---|---|
| Private key / token | `DEPLOYER_PRIVATE_KEY`, `RELAYER_PRIVATE_KEY`, `FLY_API_TOKEN`, `VERCEL_TOKEN` | Never in the repo, logs, or frontend. Deployer and relayer should be different, low-balance wallets. |
| Secret / token | `JWT_SECRET`, `MASTER_ENCRYPTION_KEY` (on Sepolia it sits as a plain Fly secret; testnet only, no real PII), `AWS_ENCRYPTED_DATA_KEY`, `VAULT_TOKEN`, `VAULT_ENCRYPTED_DATA_KEY`, `READY_INTERNAL_TOKEN` | Fly secrets / `.env`; never committed to the repo. |
| Key/password inside a URL | `MONGODB_URI`, `REDIS_URL`, `BASE_RPC_URL`, `BASE_WS_RPC_URL`, `BASE_SEPOLIA_RPC_URL` | The Alchemy key and DB/Redis password sit in the URL; treat them as secrets. |
| API key | `BASESCAN_API_KEY`, `CMC_API_KEY` | Low risk, but do not share them. |

**None of them may be set as `VITE_*` in the frontend.** `VITE_*` values are **embedded as plain text** in the JavaScript bundle at build time; anyone who opens the site can
see them (even with source maps disabled, `frontend/vite.config.js:28` only disables source maps; it does not prevent value embedding). So `VITE_*` must contain only public information
(contract address, public RPC, social link). For the same reason the admin wallet list is not put in the frontend; `VITE_ADMIN_WALLETS` has been removed
(`app/AppViews.jsx:206`), and admin status comes from `isAdmin` in `/api/auth/me`.
Addresses (`ARAF_ESCROW_ADDRESS`, token addresses) are not secrets.

---

## 6. Legacy / unused / aliases

### 6.1 Present in examples or docs but NOT read by the code

| Variable | Where it appears | Status |
|---|---|---|
| `REWARD_BPS`, `CONFIRM_CONFIGURE_REWARDS` | `contracts/.env.example:71-72`; `docs/TR/DEPLOYMENT_GUIDE.md` | No script reads them. Kept only for docs/regression tests (`test/contracts/rewards.goLive.readiness.test.js:103-104`). Do not delete, but they change nothing. |
| `REWARDS_READ_ONLY`, `REWARDS_SOURCE` | `backend/.env.example:157-158` | Not read; the rewards surface is always a read-only mirror. Kept for a regression test. |
| `AWS_KMS_KEY_ARN` (`KMS_KEY_ARN`) | `docs/TR/MAINNET_READINESS_CHECKLIST.md:54`; `backend/.env.example:66` (says it is not read) | Not read; the key ID is inside the `CiphertextBlob`. Do not set it. |
| `MIN_REWARD_BPS`, `MAX_REWARD_BPS` | `docs/TR/REWARDS_ROLLOUT.md` | Not read as env in code (contract constant; **not verified**, only seen via grep that it is not read as env). |
| `VITE_ADMIN_WALLETS` | Old docs | Removed (`AppViews.jsx:206`). |
| `BASESCAN_API_KEY` (as a GitHub secret) | `docs/EN/DEPLOY_BASE_SEPOLIA.md:14` | No workflow reads it; meaningful only in `contracts/.env` for a manual `hardhat verify`. |
| `NODE_PATH` | `contracts/hardhat.config.js:9-10` | Not read; the script sets it itself; you do not need to set it. |

### 6.2 Aliases (which one to prefer)

| Preferred (canonical) | Alias | Behavior |
|---|---|---|
| `MONGODB_URI` | `MONGO_URI` | Deprecated. Only 3 migration scripts read it as a fallback via the `migrations/_mongoUri.js` helper and print a warning; **the application (`config/db.js:34`) reads only `MONGODB_URI`.** Always use `MONGODB_URI`. |
| `BASE_MAINNET_USDT/USDC_ADDRESS` | `MAINNET_USDT/USDC_ADDRESS` | Accepted only on 8453 (backend `tokenEnv.js:66`; contracts `deploy.js:115-116`). Errors on Base Sepolia in prod (`tokenEnv.js:84-92`, `deploy.js:125`). Use `BASE_MAINNET_*`. |
| `BASE_<CHAIN>_USDT/USDC_ADDRESS` | `USDT_ADDRESS` / `USDC_ADDRESS` | In the backend only outside prod, with a warning (`tokenEnv.js:74-76`). In contracts, `rewardsOps.js:30-31` reads these separately for rewards jobs (a distinct meaning; fallback if there is no manifest). |
| `VITE_REVENUE_VAULT_ADDRESS` | `VITE_REWARDS_VAULT_ADDRESS` | Deprecated; `app/envConfig.js` reads it as a fallback only when the new name is empty and prints a `console.warn` (App.jsx and useRewardsContract.js use the same helper). Use `VITE_REVENUE_VAULT_ADDRESS`. |
| `ARAF_DEPLOYMENT_BLOCK` | `WORKER_START_BLOCK` | Both do the same thing; `ARAF_DEPLOYMENT_BLOCK` takes precedence via `??` (`eventListener.js:1095`, `health.js:146`). |
| `IDENTITY_NORMALIZATION_GUARD` | `PII_IDENTITY_NORMALIZATION_GUARD` | The second is for PII routes; if missing it falls back to the first (`routes/pii.js:80`). |

---

## 7. What the workflow sets automatically

There are two workflows: `deploy-base-sepolia.yml` (contract + Fly + optional Vercel) and `deploy-runtime-base-sepolia.yml` (Fly and/or Vercel without redeploying the contract).
`deployRewards.js` is not part of the workflows (deliberately). The user does **not** enter the values below manually. Line numbers in this section are approximate; the workflow files have been updated, so check the file for current lines.

### 7.1 Fly secrets: what the workflow writes (`flyctl secrets import --stage`, then `flyctl deploy`)

Full deploy: `deploy-base-sepolia.yml:141-178` · runtime: `deploy-runtime-base-sepolia.yml:128-166`. Both have the same 19 fixed lines + 2 conditional lines.

| Fly variable | Value source | Line (full / runtime) |
|---|---|---|
| `NODE_ENV` | fixed `production` | 157 / 145 |
| `JWT_EXPIRES_IN`, `PII_TOKEN_EXPIRES_IN` | fixed `15m` | 161-162 / 149-150 |
| `KMS_PROVIDER` | fixed `env` | 163 / 151 |
| `ALLOW_ENV_KMS_ON_TESTNET` | fixed `yes` | 164 / 152 |
| `EXPECTED_CHAIN_ID` | fixed `84532` | 166 / 154 |
| `ARAF_ESCROW_ADDRESS` | full: from the deploy manifest (`escrowAddress`); runtime: variable/input | 169 / 157 |
| `BASE_SEPOLIA_USDT_ADDRESS`, `BASE_SEPOLIA_USDC_ADDRESS` | full: manifest `tokens[]`; runtime: variable/input | 170-171 / 158-159 |
| `ARAF_DEPLOYMENT_BLOCK` | full: block of the `deployTxHash` receipt; runtime: variable/input (cannot be 0) | 172 / 160 |
| `SIWE_DOMAIN` | `FRONTEND_DOMAIN` variable | 173 / 161 |
| `SIWE_URI`, `ALLOWED_ORIGINS` | `https://$FRONTEND_DOMAIN` | 174-175 / 162-163 |
| `BASE_RPC_URL` | GitHub secret `BASE_SEPOLIA_RPC_URL` (name changes) | 167 / 155 |
| `BASE_WS_RPC_URL` | GitHub secret `BASE_SEPOLIA_WS_RPC_URL` (name changes) | 168 / 156 |
| `MONGODB_URI`, `REDIS_URL`, `JWT_SECRET`, `MASTER_ENCRYPTION_KEY` | GitHub secret of the same name | 158-160, 165 / 146-148, 153 |
| `RELAYER_PRIVATE_KEY`, `ADMIN_WALLETS` | GitHub secret / variable; **not written if empty** | 176-177 / 164-165 |

Conditional (in both workflows): if the repo variable `ARAF_REVENUE_VAULT_ADDRESS` / `ARAF_REWARDS_ADDRESS` is defined (validated with an address regex), it is written to Fly secrets under the same names; if not defined, nothing is written and the reward mirror/recorder stay inactive.

Backend variables the workflow does not write (all optional/with defaults):
`ARAF_TRACKED_TOKENS`, `WORKER_*`, `JOB_*`, `READY_INTERNAL_TOKEN`, `AWS_*`, `VAULT_*` and other tuning variables.

### 7.2 Vercel build-env: what the workflow supplies (`vercel deploy --prod --build-env ...`)

Full: `deploy-base-sepolia.yml:211-228` · runtime: `deploy-runtime-base-sepolia.yml:207-224` (only `deploy_frontend=true`).

| Vercel variable | Value | Line (full / runtime) |
|---|---|---|
| `VITE_TARGET_CHAIN` | fixed `base-sepolia` | 222 / 218 |
| `VITE_ESCROW_ADDRESS` | deploy manifest or variable/input | 223 / 219 |
| `VITE_USDT_ADDRESS`, `VITE_USDC_ADDRESS` | same source | 224-225 / 220-221 |
| `VITE_RPC_URL` | GitHub variable `VITE_RPC_URL`; not supplied if empty | 227 / 223 |

`VITE_REVENUE_VAULT_ADDRESS` / `VITE_REWARDS_ADDRESS`: supplied only if the repo variable `ARAF_REVENUE_VAULT_ADDRESS` / `ARAF_REWARDS_ADDRESS` is defined (address regex).

`VITE_API_URL` is deliberately not supplied (an absolute URL is rejected in production; `/api` goes through the `vercel.json` rewrite). Right before the Vercel deploy, the workflow rewrites the `/api/(.*)` rewrite target in the runner's copy of `frontend/vercel.json` to `https://${FLY_APP_NAME}.fly.dev/api/$1` (`FLY_APP_NAME` is validated against `^[a-z0-9-]+$`; the repo file does not change). The Vercel CLI version is pinned (`vercel@62.7.0`).

### 7.3 Contracts: what is passed as env to the deploy step (`contracts/.env` is not written)

`deploy-base-sepolia.yml:87-100`: `CONFIRM_PUBLIC_DEPLOY=yes` (fixed), `DEPLOYER_PRIVATE_KEY`, `BASE_SEPOLIA_RPC_URL` (secrets), `TREASURY_ADDRESS`, `FINAL_OWNER_ADDRESS`,
`BASE_SEPOLIA_USDT_ADDRESS`, `BASE_SEPOLIA_USDC_ADDRESS` (variables). `BASESCAN_API_KEY` is passed in a separate step only when `verify_contracts=true` (experimental, `continue-on-error`); it is not passed to the `deploy.js` step.

### 7.4 Names meaningful only in GitHub (not read by code)

| Name | Type | What |
|---|---|---|
| `FLY_API_TOKEN` | secret | Fly deploy token (`deploy-base-sepolia.yml:145`, `:183`) |
| `FLY_ORG` | variable (optional) | Fly org used when the workflow creates a missing app; default `personal`. Needs an org/personal `FLY_API_TOKEN` |
| `FLY_APP_NAME` | variable | Fly app name; default `araf-protocol-backend`. During the Vercel deploy, the `vercel.json` rewrite target is rewritten on the runner according to this name (does not stop on a mismatch) |
| `FRONTEND_DOMAIN` | variable | `SIWE_DOMAIN`, `SIWE_URI`, `ALLOWED_ORIGINS` are derived from it (`:30`, `:173-175`) |
| `BASE_SEPOLIA_WS_RPC_URL` | secret | Becomes `BASE_WS_RPC_URL` on Fly |
| `VERCEL_TOKEN`, `VERCEL_ORG_ID`, `VERCEL_PROJECT_ID` | secret | Vercel CLI identity (`:31-32`, `:197-202`) |
| `GH_VARIABLES_TOKEN` | secret (optional) | Fine-grained PAT (this repo only, Variables: read and write) for `gh variable set ARAF_ESCROW_ADDRESS/ARAF_DEPLOYMENT_BLOCK` after a full deploy. Not printed in logs |
| `deploy_test_usdt` | workflow input (full deploy) | If true and the `BASE_SEPOLIA_USDT_ADDRESS` variable is empty, deploys tUSDT first; ignored if the variable is set |
| `BASESCAN_API_KEY` | secret (optional) | Only `verify_contracts=true` (experimental) |
| `ARAF_REVENUE_VAULT_ADDRESS`, `ARAF_REWARDS_ADDRESS` | variable (optional) | If defined, passed as Fly secrets and Vercel `VITE_*` build-env |

---

## 8. Inconsistencies

Fixed items are marked "fixed"; the others are open. (The earlier draft's items "there is no deploy workflow" and "`ALLOW_ENV_KMS_ON_TESTNET` is not in the code" are invalid on the current main branch and were removed.)

1. **[fixed]** **The docs do not know about the new testnet KMS exception.** `backend/.env.example:55` and `:10-11` say `KMS_PROVIDER=env` is rejected in prod "including testnet"; `docs/TR/DEPLOYMENT_GUIDE.md:261`, `:339` (aws example) and the environment table (`KMS_PROVIDER` testnet = `aws`/`vault`) and `docs/EN/DEPLOYMENT_GUIDE.md:339` do not mention the exception. Yet the code (`encryption.js:57-63`) and the workflows (`deploy-base-sepolia.yml:163-164`) use `env` + `ALLOW_ENV_KMS_ON_TESTNET=yes` on Sepolia. `ALLOW_ENV_KMS_ON_TESTNET` appears only in `backend/.env.example:77` (a comment line) and `DEPLOY_BASE_SEPOLIA.md:96`.
2. **[fixed: the Validate step of both workflows]** **Workflow validation is looser than the code.** `deploy-base-sepolia.yml:75` checks only length (≥64) for `JWT_SECRET`; the backend also enforces entropy ≥3.5 and placeholder rejection (`siwe.js:94-103`), so the workflow can pass and the backend can crash at startup. `BASE_SEPOLIA_WS_RPC_URL` is required in the workflow and `ws*` is accepted (`:65`, `:72`); in the backend `BASE_WS_RPC_URL` is optional and only `wss://` is used, `ws://` silently falls back to HTTP (`eventListener.js:619-621`).
3. **[fixed: if the optional `GH_VARIABLES_TOKEN` secret exists, the full-deploy workflow writes the `ARAF_ESCROW_ADDRESS`/`ARAF_DEPLOYMENT_BLOCK` variables itself; if there is no token it warns and the summary page prints copyable `gh variable set` lines]** **The full-deploy workflow did not persist the addresses.** Since `GITHUB_TOKEN` cannot write repo variables, a separate fine-grained PAT is needed (this repo only, "Variables: read and write"). If the token is not defined, a manual step remains.
4. **[fixed: `migrations/_mongoUri.js` single helper; MONGODB_URI primary, MONGO_URI warned fallback]** **`MONGO_URI` is valid only in migrations.** `config/db.js:34` reads only `MONGODB_URI`; `MONGO_URI` is a fallback only in `migrations/normalizeIdentityFields.js:166`, `dedupeRevenueEvents.js:98`, `backfillTerminalTradeStats.js:78`.
5. **[fixed: `app/envConfig.js` single helper; old name backward compatible with `console.warn`]** **The frontend alias was half-done.** `VITE_REWARDS_VAULT_ADDRESS` was read only in `App.jsx:402`; `hooks/useRewardsContract.js:9` looked only at `VITE_REVENUE_VAULT_ADDRESS`.
6. **[fixed: a local-only warning was added to the example; the Vercel deploy step rewrites the `/api` rewrite target in the runner's copy of `vercel.json` according to `FLY_APP_NAME`, the repo file does not change and it does not stop on a mismatch]** **`frontend/.env.example:11` contains `VITE_API_URL=http://localhost:4000`; in production an absolute URL is an error** (`app/apiConfig.js:27-32`, `App.jsx:29`). The example must not be carried to Vercel as is (the workflow does not supply it anyway). The backend address stays fixed in the repo's `frontend/vercel.json:5` as `araf-protocol-backend`; during deploy the workflow converts the runner copy to `FLY_APP_NAME`. In a Vercel deploy outside the workflow (manual), the file still has to be updated by hand.
7. **[fixed]** **`docs/EN/DEPLOY_BASE_SEPOLIA.md:96-97` was outdated.** It said the backend exception and `VITE_TARGET_CHAIN` were "a separate job" and that otherwise the backend would not start; both now exist in the code (`encryption.js:57-63`, `app/chainPolicy.js:21`). The same doc at `:14` lists `BASESCAN_API_KEY` as a GitHub secret, but no workflow reads it.
8. **[fixed: the chain policy note was updated; a "Recommended path: GitHub Actions workflow" note was added at the top of the TR/EN DEPLOYMENT_GUIDE Base Sepolia section, and the manual `fly secrets`/`.env.production` flow was marked "alternative/manual"]** **`docs/TR/DEPLOYMENT_GUIDE.md:395` is still outdated.** It says "A production build enables only Base Mainnet; a hosted Sepolia frontend requires a non-production build"; yet `app/chainPolicy.js:34-39` and `main.jsx:62` enable only Sepolia in a production build with `VITE_TARGET_CHAIN=base-sepolia` (`:417` describes it correctly, `:395` contradicts it). The guide also describes the manual `fly secrets set`/`.env.production` flow and does not mention the workflow.
9. **[fixed: contracts part; the `contracts/.env.example` comment was clarified as "only for the go-live checklist test"]** **In the example but not read by the code:** `REWARD_BPS`, `CONFIRM_CONFIGURE_REWARDS` (`contracts/.env.example:71-72`), `REWARDS_READ_ONLY`, `REWARDS_SOURCE` (`backend/.env.example:157-158`) have no effect and exist only for tests. `docs/TR/MAINNET_READINESS_CHECKLIST.md:54` lists `AWS_KMS_KEY_ARN` as if it were a required env; `backend/.env.example:66` says it is not read.
10. **[fixed: contracts part; `CONFIRM_SWITCH_TREASURY_TO_VAULT` was added with an explanation, the `CONFIRM_FRESH_ESCROW_DEPLOY` comment was clarified, a NODE_ENV/CODESPACE_NAME note was added]** **Read in code but not in the example:** `CONFIRM_SWITCH_TREASURY_TO_VAULT` (`rewardsOps.js:38`, only to reject), `NODE_ENV` and `CODESPACE_NAME` on the contracts side (`deploy.js:108`, `:301`). `contracts/.env.example:56` presents `CONFIRM_FRESH_ESCROW_DEPLOY` as a confirmation; the code never deploys a new escrow on public, it only changes the error message (`deployRewards.js:73-77`).
11. **[fixed: `scripts/init-env.js` / `npm run init:env` generates the secrets; a local `EXPECTED_CHAIN_ID=31337` note was added to `.env.example`, the example value stayed 8453]** **`backend/.env.example` does not work as is when copied with a plain `cp` (deliberate):** the `JWT_SECRET` example is 60 characters (`:30`), the code requires at least 64 (`siwe.js:95`); the `MASTER_ENCRYPTION_KEY` example (`:75`) is not 64 hex (`encryption.js:114`); the `EXPECTED_CHAIN_ID=8453` example (`:83`) gives a mismatch error locally if the RPC is different (`expectedChain.js:55-58`).
12. **[fixed: backend/.env.example comments were clarified]** **Fail-fast in prod but under-emphasized in the example:** `JWT_SECRET` is not prod-specific; it is required in **every environment** (`siwe.js:94`, at module load; `/ready` also requires it via `health.js:96-99`). A localhost-only `ALLOWED_ORIGINS` stops the process at startup (`app.js:161-163`). If `ARAF_DEPLOYMENT_BLOCK`/`WORKER_START_BLOCK` and the Redis checkpoint are both missing, the worker `throw`s in prod (`eventListener.js:1098-1100`).
13. **[fixed: rewards deploy is deliberately kept outside the workflow; however, if the repo variable `ARAF_REVENUE_VAULT_ADDRESS`/`ARAF_REWARDS_ADDRESS` is defined (validated with an address regex), both workflows pass them as Fly secrets (same names) and Vercel build-env (`VITE_REVENUE_VAULT_ADDRESS`, `VITE_REWARDS_ADDRESS`); if not defined, nothing is written]** **Rewards is outside the workflow.** Rewards is a separate operation (`DEPLOY_BASE_SEPOLIA.md`); until the addresses are entered as variables, the reward mirror and recorder stay inactive in the Sepolia demo.
