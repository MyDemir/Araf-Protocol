Türkçe: [../TR/DEPLOY_BASE_SEPOLIA.md](../TR/DEPLOY_BASE_SEPOLIA.md)

# Base Sepolia Deploy (GitHub Actions)

Two workflows: `deploy-base-sepolia.yml` (contract + Fly backend + optional Vercel frontend) and
`deploy-runtime-base-sepolia.yml` (redeploys backend/frontend without deploying the contract).
The full deploy can also deploy the revenue vault + rewards with `deploy_rewards=true` (off by default; safety lock below). The manual path still works: `npm --prefix contracts run deploy:rewards:base-sepolia`.

## Which workflow when?

| | `deploy-base-sepolia.yml` (full deploy) | `deploy-runtime-base-sepolia.yml` (runtime) |
|---|---|---|
| When | First setup; whenever a new escrow is needed (contract changed); first or deliberate vault/rewards redeploy (`deploy_rewards=true`) | Contracts unchanged; backend/frontend code, secrets or settings changed; wiring vault/rewards addresses manually |
| Contracts | Deploys the libraries + `ArafEscrow` (+ optional tUSDT, + optional vault/rewards) | Deploys NOTHING |
| Address source | This run's manifests (`deployments/base-sepolia*.json`); with `deploy_rewards=false` the vault/rewards variables are the fallback | Repository variables (`ARAF_ESCROW_ADDRESS`, `ARAF_DEPLOYMENT_BLOCK`, `BASE_SEPOLIA_USDT/USDC_ADDRESS`, `ARAF_REVENUE_VAULT_ADDRESS`, `ARAF_REWARDS_ADDRESS`); a non-empty input override wins |
| Fly secrets / Vercel env | Shared script `.github/scripts/stage-runtime-env.sh` (same list) | Same script |
| Health | `/health` must be 200; `/ready` 503 `degraded:true` is only a warning | Same |
| Irreversible step | New escrow (the old address is abandoned); with `deploy_rewards=true`, `vault.setRewards` (one-shot) | None |

## Secrets (`gh secret set`)

| Name | What | Where from | Example format |
|---|---|---|---|
| `DEPLOYER_PRIVATE_KEY` | Wallet that deploys the contract (needs Base Sepolia ETH) | New wallet; ETH from a faucet | `0x` + 64 hex |
| `BASE_SEPOLIA_RPC_URL` | Alchemy HTTP RPC | Alchemy > Base Sepolia | `https://base-sepolia.g.alchemy.com/v2/KEY` |
| `BASE_SEPOLIA_WS_RPC_URL` | Alchemy WebSocket RPC (event worker) | Same Alchemy app | `wss://base-sepolia.g.alchemy.com/v2/KEY` |
| `ETHERSCAN_API_KEY` | Optional; used only in a full deploy with `verify_contracts=true` (experimental). Replaces `BASESCAN_API_KEY` (still read as a fallback). One key from an etherscan.io account works for all chains | etherscan.io > API Keys | random string |
| `GH_VARIABLES_TOKEN` | Optional; after a full deploy, automatically writes the `ARAF_ESCROW_ADDRESS`/`ARAF_DEPLOYMENT_BLOCK` variables. Fine-grained PAT, this repo only, permission: Variables: read and write. If missing, the workflow warns and the commands in the summary are run manually | GitHub > Settings > Developer settings > Fine-grained tokens | `github_pat_...` |
| `FLY_API_TOKEN` | Fly token. Org/personal token (dashboard > Tokens) lets the workflow create a missing app; an app-scoped deploy token only works if the app already exists | `fly tokens create org` / `fly tokens create deploy -a <app>` | `FlyV1 ...` |
| `MONGODB_URI` | MongoDB Atlas connection | Atlas > Connect (IP allowlist: Fly egress or 0.0.0.0/0) | `mongodb+srv://u:p@cluster.mongodb.net/araf_protocol` |
| `REDIS_URL` | Redis, TLS REQUIRED (`rediss://`) | Upstash > TLS endpoint | `rediss://default:PASS@host.upstash.io:6379` |
| `JWT_SECRET` | >= 64 characters | `node -e "console.log(require('crypto').randomBytes(64).toString('hex'))"` | 128 hex |
| `MASTER_ENCRYPTION_KEY` | PII encryption key, exactly 64 hex (testnet KMS exception) | `node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"` | 64 hex |
| `BASE_SEPOLIA_RPC_URL_FALLBACKS` | Optional; comma-separated backup HTTPS RPCs (may contain API keys, hence a secret). Written to Fly as `BASE_RPC_URL_FALLBACKS`; when empty the Fly value is kept | 2nd provider | `https://sepolia.base.org` |
| `RELAYER_PRIVATE_KEY` | Optional; a SEPARATE low-balance wallet for reputation decay / reward recorder. If empty, those jobs stay inactive | New wallet | `0x` + 64 hex |
| `VERCEL_TOKEN` | Only `deploy_frontend=true` | Vercel > Account > Tokens | string |
| `VERCEL_ORG_ID` | Frontend only | `.vercel/project.json` > `orgId` | `team_...` |
| `VERCEL_PROJECT_ID` | Frontend only | `.vercel/project.json` > `projectId` | `prj_...` |

Important: `MASTER_ENCRYPTION_KEY` must be generated once and NEVER CHANGED (existing encrypted PII would become undecryptable). `JWT_SECRET` and `MASTER_ENCRYPTION_KEY` must not be the same value.

## Variables (`gh variable set`)

| Name | What | Example |
|---|---|---|
| `FRONTEND_DOMAIN` | Vercel production host (NO https:// and no path); SIWE_DOMAIN/ALLOWED_ORIGINS are derived from it | `araf-demo.vercel.app` |
| `TREASURY_ADDRESS` | Fee treasury address | `0x...` |
| `FINAL_OWNER_ADDRESS` | Ownership transfer after deploy; must be DIFFERENT from TREASURY (deploy.js rejects it) | `0x...` |
| `BASE_SEPOLIA_USDT_ADDRESS` | Test USDT (6 decimals); may be EMPTY only when running the full deploy with `deploy_test_usdt=true` | `0x...` |
| `BASE_SEPOLIA_USDC_ADDRESS` | Test USDC (Circle) | `0x036CbD53842c5426634e7929541eC2318f3dCF7e` |
| `FLY_APP_NAME` | Optional; default `araf-protocol-backend` | `araf-protocol-backend` |
| `FLY_ORG` | Optional; Fly org used when the workflow has to create the app; default `personal` | `personal` |
| `ADMIN_WALLETS` | Optional; admin panel wallets (comma-separated, each validated as an address). When empty the Fly value is kept | `0xabc...,0xdef...` |
| `FINAL_TREASURY_ADDRESS` | Only with `deploy_rewards=true`: the vault's final treasury | `0x...` |
| `LIVE_POLL_INTERVAL_MS` | Optional backend setting [2000-300000]; when empty the Fly value is kept | `15000` |
| `WORKER_BLOCK_BATCH_SIZE` | Optional [1-2000] (Alchemy free: 10) | `10` |
| `WORKER_REPLAY_BATCH_DELAY_MS` | Optional [0-10000] | `250` |
| `EXPECTED_CHAIN_ID` | Optional; must be empty or `84532` (the workflow always writes 84532) | `84532` |
| `VITE_RPC_URL` | Optional; frontend primary RPC (becomes PUBLIC, use a restricted/separate key) | `https://...` |
| `ARAF_ESCROW_ADDRESS` | Written AFTER deploy (for the runtime workflow); if `GH_VARIABLES_TOKEN` exists, the full deploy writes it itself | `0x...` |
| `ARAF_DEPLOYMENT_BLOCK` | Written AFTER deploy (same way) | `12345678` |
| `ARAF_REVENUE_VAULT_ADDRESS` | Written automatically after `deploy_rewards=true` (with `GH_VARIABLES_TOKEN`); can also be set manually. Both workflows pass it as a Fly secret (`ARAF_REVENUE_VAULT_ADDRESS`) and a Vercel build-env (`VITE_REVENUE_VAULT_ADDRESS`). Validation: 0x+40 hex, non-zero, valid EIP-55 checksum if mixed case; must be set together with `ARAF_REWARDS_ADDRESS`. If undefined nothing is written | `0x...` |
| `ARAF_REWARDS_ADDRESS` | Optional; same as above (`ARAF_REWARDS_ADDRESS` / `VITE_REWARDS_ADDRESS`) | `0x...` |

## Web-only (mobile) deploy

No computer or local CLI needed; everything is done from the browser.

1. **GitHub secrets/variables**: repo > Settings > Secrets and variables > Actions. "Secrets" tab > New repository secret for secrets; "Variables" tab > New repository variable for variables (tables above). Leave `BASE_SEPOLIA_USDT_ADDRESS` EMPTY (or undefined) if you want the workflow to deploy the test USDT.
2. **Fly.io**: in the Fly dashboard open Tokens (dashboard > Tokens) and create an **org token** (an app-scoped deploy token cannot create the app). Put it in `FLY_API_TOKEN`. The workflow creates the app itself if it does not exist (`FLY_APP_NAME`, org from the optional `FLY_ORG` variable, default `personal`). If you use a deploy token instead, create the app yourself in the dashboard (Launch an app / Create app) with the exact `FLY_APP_NAME`.
3. **Vercel**: dashboard > create the project (Root Directory empty). `VERCEL_PROJECT_ID`: Project > Settings > General > Project ID. `VERCEL_ORG_ID`: Team Settings > General > Team ID (for a personal account: Account Settings > General > Your ID). Token: Account Settings > Tokens.
4. **Alchemy** (dashboard.alchemy.com): create a Base Sepolia app; copy the HTTPS URL and the WSS URL. **Upstash** (console.upstash.com): create a Redis DB with TLS, copy the `rediss://` URL. **MongoDB Atlas** (cloud.mongodb.com): free cluster, database user, Network Access > allow `0.0.0.0/0`, Connect > Drivers for the `mongodb+srv://` URL.
5. **Run**: GitHub > Actions > "Deploy Base Sepolia" > Run workflow. Set `deploy_frontend=true` and `deploy_test_usdt=true`, then Run.
6. **Test USDT behavior**: with `deploy_test_usdt=true` and an empty `BASE_SEPOLIA_USDT_ADDRESS` variable, the workflow deploys `tUSDT` (MockERC20) before the contracts, validates the address, and uses it. If the variable is already set the input is ignored (a log note is written). With the optional `GH_VARIABLES_TOKEN` secret the address is saved to the variable; otherwise the job summary shows the `gh variable set` command (or add the variable by hand in the web UI).

## One-time setup

1. **Fly**: `fly apps create araf-protocol-backend` (if the name differs, set `FLY_APP_NAME`). `fly.toml` is already in `backend/`. No manual volume/secret needed; the workflow loads the secrets.
2. **Vercel**: create a project for the frontend; leave Project Settings > Root Directory EMPTY (the CLI runs from inside `frontend/`). Do NOT define `VITE_API_URL` in the project env (prod rejects an absolute URL). The `/api` rewrite in `frontend/vercel.json` points to `https://araf-protocol-backend.fly.dev` in the repo; right before the Vercel deploy, the workflow rewrites the target in the runner's copy to `https://${FLY_APP_NAME}.fly.dev/api/$1` (`FLY_APP_NAME` is validated against `^[a-z0-9-]+$`; the repo file does not change, and the result is printed to the log). The Vercel CLI version is pinned in the workflow (`vercel@62.7.0`).
3. **MongoDB Atlas**: free cluster, DB user, network access.
4. **Upstash Redis**: TLS endpoint (`rediss://`).
5. **Alchemy**: Base Sepolia app; HTTP and WSS URLs.
6. **Etherscan**: API key from an etherscan.io account (optional; for `verify_contracts`; valid on Base too).
7. **Test USDC**: https://faucet.circle.com/ (Base Sepolia, USDC). The address is the example above, verify it.
8. **Test USDT**: The Circle faucet does not give USDT. `contracts/scripts/deployTestToken.js` deploys a `MockERC20` with 6 decimals (only chainId 84532 and 31337; errors on mainnet). deploy.js does NOT deploy mocks on a public network; this is a separate test tool.
   ```bash
   cd contracts
   CONFIRM_TEST_TOKEN_DEPLOY=yes TEST_TOKEN_SYMBOL=tUSDT TEST_TOKEN_NAME="Test Tether USD" \
     npm run deploy:test-token:base-sepolia
   ```
   Required env: `BASE_SEPOLIA_RPC_URL`, `DEPLOYER_PRIVATE_KEY`, `CONFIRM_TEST_TOKEN_DEPLOY=yes`; optional `TEST_TOKEN_SYMBOL` (default `tUSDT`), `TEST_TOKEN_NAME` (default `Test Tether USD`). Output: the token address and the next step; the record is appended to `contracts/deployments/base-sepolia-test-tokens.json` (`symbol, address, decimals, txHash, deployedAt`). Then: `gh variable set BASE_SEPOLIA_USDT_ADDRESS --body <address>`. To mint tokens use `mint()` (1000 per hour) or the owner's `mint(to, amount)`.
9. Fund the deployer wallet with Base Sepolia ETH (Coinbase/Alchemy faucet).

## Commands

Full-deploy inputs: `deploy_frontend` (Vercel), `deploy_test_usdt` (auto test USDT when the variable is empty; default false), `deploy_rewards` (vault + rewards; default false), `confirm_redeploy_rewards` (`YES` = deliberately replace an existing rewards setup), `verify_contracts` (experimental; also verifies vault and rewards when deployed).

```bash
gh secret set DEPLOYER_PRIVATE_KEY < key.txt        # or --body "..."
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
# optional (experimental) Basescan verification: -f verify_contracts=true  (ETHERSCAN_API_KEY secret optional; legacy BASESCAN_API_KEY still read; Sourcify + Blockscout work without a key)
gh run watch
```

`GH_VARIABLES_TOKEN` (optional): `gh secret set GH_VARIABLES_TOKEN` (fine-grained PAT, this repo only, Variables: read and write).

## After deploy

If `GH_VARIABLES_TOKEN` is defined, the full-deploy workflow writes the two variables below itself (the token is not printed to the log). If it is not defined, the workflow warns "token is not defined"; enter the addresses from the run summary manually. Later backend/frontend updates do not redeploy the contract:

```bash
gh variable set ARAF_ESCROW_ADDRESS --body "0x..."
gh variable set ARAF_DEPLOYMENT_BLOCK --body "12345678"
gh workflow run deploy-runtime-base-sepolia.yml -f deploy_backend=true -f deploy_frontend=true
gh run watch
```

Input overrides: `araf_escrow_address`, `usdt_address`, `usdc_address`, `deployment_block`, `revenue_vault_address` + `rewards_address` (together).

Health: the deploy fails if `/health` is not 200. If the backend started without reaching the RPC, `/ready` returns 503 `degraded:true`; the job still succeeds but emits a `::warning::` (check the RPC secrets and Fly logs).

## Revenue vault + rewards (`deploy_rewards`)

Default `false`: rewards is a go-live decision (see `REWARDS_ROLLOUT.md`) and `vault.setRewards` is one-shot; creating a new vault/rewards on every full deploy would silently orphan the old ones. With `true`, `deployRewards.js` runs in the same job after the escrow:

1. `ArafRevenueVault(escrow, FINAL_TREASURY_ADDRESS, deployer)` → `ArafRewards(escrow, vault, deployer)`.
2. `vault.setRewards(rewards)` (**irreversible**, `RewardsAlreadySet`), `setSupportedToken(USDT/USDC)`, `rewardBps == 4000` check.
3. Vault and rewards ownership is transferred to `FINAL_OWNER_ADDRESS` and re-read on chain.
4. Manifest `deployments/base-sepolia-rewards.json`; the addresses are read from it and written to Fly (`ARAF_REVENUE_VAULT_ADDRESS`, `ARAF_REWARDS_ADDRESS`) and Vercel (`VITE_REVENUE_VAULT_ADDRESS`, `VITE_REWARDS_ADDRESS`); with `GH_VARIABLES_TOKEN` they are also saved as repository variables.

**Safety lock** (before any tx):
- "Validate required config": with `deploy_rewards=true`, if `ARAF_REVENUE_VAULT_ADDRESS`/`ARAF_REWARDS_ADDRESS` is set, the job stops BEFORE the escrow deploy. `FINAL_TREASURY_ADDRESS` is required.
- `deployRewards.js` stops if this network's rewards manifest exists, the existing vault's `rewards()` is set (staticcall), the existing rewards address has code, or `escrow.treasury()` is a vault already wired to rewards.
- A deliberate redeploy needs `confirm_redeploy_rewards=YES` (exact, uppercase). The old vault/rewards are orphaned; their balances stay with the old owner.
- If the manifest and the variables conflict (without confirmation) address resolution fails.

**Manual steps** (NOT done by the workflow): the escrow is owned by `FINAL_OWNER_ADDRESS` (multisig), so only the owner can call `escrow.setTreasury(vault)`. Run `REWARDS_OP=verify`, then `CONFIRM_TREASURY_SWITCH=true EXPECTED_CURRENT_TREASURY_ADDRESS=<treasury> REWARDS_OP=switch-treasury` (see `DEPLOYMENT_GUIDE.md` §7). The owner can bypass the vault with `setTreasury` (K8, documented owner power).


## Farcaster / Base mini app

- The workflow passes `VITE_PUBLIC_URL=https://$FRONTEND_DOMAIN` to the Vercel build; the build generates the `fc:miniapp` meta tags and `/.well-known/farcaster.json` from it.
- The `accountAssociation` signature is bound to the domain, so it must be regenerated for every new `FRONTEND_DOMAIN`: deploy once, open the Farcaster developer tools (Manifest tool) or the Base Build manifest tool, enter the domain, sign with the Farcaster account, and copy the three values.
- Store them as GitHub variables `FARCASTER_ACCOUNT_ASSOCIATION_HEADER`, `FARCASTER_ACCOUNT_ASSOCIATION_PAYLOAD`, `FARCASTER_ACCOUNT_ASSOCIATION_SIGNATURE` (all three or none), optionally `VITE_BASE_APP_ID`, then re-run the frontend deploy. Without them farcaster.json is emitted without `accountAssociation` (the app still works; mini app verification will not pass).

## Notes

- Testnet KMS exception: with `NODE_ENV=production` + `EXPECTED_CHAIN_ID=84532` + `ALLOW_ENV_KMS_ON_TESTNET=yes`, `KMS_PROVIDER=env` is accepted (the backend exception exists on the main branch: `backend/scripts/services/encryption.js`; the RPC is also verified to be 84532). Mainnet requires AWS/Vault KMS.
- The frontend requires the `VITE_TARGET_CHAIN=base-sepolia` flag (exists on the main branch: `frontend/src/app/chainPolicy.js`; the workflow supplies it as a Vercel build-env); without it, a prod build connects only to Base Mainnet.
- The deployment block is not in the `deploy.js` output; the workflow reads it from the `deployTxHash` receipt.
- Secret values must not contain spaces/quotes/`#` (`flyctl secrets import` dotenv format).
- Contract verify (Basescan) is **experimental**: in a full deploy, `contracts/scripts/verify.js` runs with `verify_contracts=true` (default false) + `ETHERSCAN_API_KEY` (Etherscan V2, plus Sourcify fallback); it verifies the libraries (`ArafReputationLib`, `ArafSettlementLib`) and the linked `ArafEscrow`, with constructor arguments read from the deploy manifest. The step is `continue-on-error: true`, so if it fails the deploy is unaffected; in that case verify manually: `npm --prefix contracts run verify:base-sepolia` (needs `BASE_SEPOLIA_RPC_URL` and `ETHERSCAN_API_KEY` in `contracts/.env`).
- Rewards: use `deploy_rewards=true` in the full deploy (see above) or deploy manually and set the `ARAF_REVENUE_VAULT_ADDRESS`/`ARAF_REWARDS_ADDRESS` variables; the workflows pass them to the backend and frontend. With `deploy_rewards=false` the full deploy creates a new escrow while the variable's vault stays bound to the old escrow (`vault.escrow` is immutable); the workflow emits a warning.
- `ETHERSCAN_API_KEY` is only used by the verify step and never sent to the backend.
