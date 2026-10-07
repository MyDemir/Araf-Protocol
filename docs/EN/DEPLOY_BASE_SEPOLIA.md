Türkçe: [../TR/DEPLOY_BASE_SEPOLIA.md](../TR/DEPLOY_BASE_SEPOLIA.md)

# Base Sepolia Deploy (GitHub Actions)

Two workflows: `deploy-base-sepolia.yml` (contract + Fly backend + optional Vercel frontend) and
`deploy-runtime-base-sepolia.yml` (redeploys backend/frontend without deploying the contract).
`deployRewards.js` is NOT included in the workflows; rewards is a separate operation (`npm --prefix contracts run deploy:rewards:base-sepolia`).

## Secrets (`gh secret set`)

| Name | What | Where from | Example format |
|---|---|---|---|
| `DEPLOYER_PRIVATE_KEY` | Wallet that deploys the contract (needs Base Sepolia ETH) | New wallet; ETH from a faucet | `0x` + 64 hex |
| `BASE_SEPOLIA_RPC_URL` | Alchemy HTTP RPC | Alchemy > Base Sepolia | `https://base-sepolia.g.alchemy.com/v2/KEY` |
| `BASE_SEPOLIA_WS_RPC_URL` | Alchemy WebSocket RPC (event worker) | Same Alchemy app | `wss://base-sepolia.g.alchemy.com/v2/KEY` |
| `BASESCAN_API_KEY` | Optional; used only in a full deploy with `verify_contracts=true` (experimental) | basescan.org | random string |
| `GH_VARIABLES_TOKEN` | Optional; after a full deploy, automatically writes the `ARAF_ESCROW_ADDRESS`/`ARAF_DEPLOYMENT_BLOCK` variables. Fine-grained PAT, this repo only, permission: Variables: read and write. If missing, the workflow warns and the commands in the summary are run manually | GitHub > Settings > Developer settings > Fine-grained tokens | `github_pat_...` |
| `FLY_API_TOKEN` | Fly deploy token | `fly tokens create deploy -a <app>` | `FlyV1 ...` |
| `MONGODB_URI` | MongoDB Atlas connection | Atlas > Connect (IP allowlist: Fly egress or 0.0.0.0/0) | `mongodb+srv://u:p@cluster.mongodb.net/araf_protocol` |
| `REDIS_URL` | Redis, TLS REQUIRED (`rediss://`) | Upstash > TLS endpoint | `rediss://default:PASS@host.upstash.io:6379` |
| `JWT_SECRET` | >= 64 characters | `node -e "console.log(require('crypto').randomBytes(64).toString('hex'))"` | 128 hex |
| `MASTER_ENCRYPTION_KEY` | PII encryption key, exactly 64 hex (testnet KMS exception) | `node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"` | 64 hex |
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
| `BASE_SEPOLIA_USDT_ADDRESS` | Test USDT (6 decimals) | `0x...` |
| `BASE_SEPOLIA_USDC_ADDRESS` | Test USDC (Circle) | `0x036CbD53842c5426634e7929541eC2318f3dCF7e` |
| `FLY_APP_NAME` | Optional; default `araf-protocol-backend` | `araf-protocol-backend` |
| `ADMIN_WALLETS` | Optional; admin panel wallets (comma-separated) | `0xabc...,0xdef...` |
| `VITE_RPC_URL` | Optional; frontend primary RPC (becomes PUBLIC, use a restricted/separate key) | `https://...` |
| `ARAF_ESCROW_ADDRESS` | Written AFTER deploy (for the runtime workflow); if `GH_VARIABLES_TOKEN` exists, the full deploy writes it itself | `0x...` |
| `ARAF_DEPLOYMENT_BLOCK` | Written AFTER deploy (same way) | `12345678` |
| `ARAF_REVENUE_VAULT_ADDRESS` | Optional; if rewards was deployed separately. If defined, both workflows pass it as a Fly secret (`ARAF_REVENUE_VAULT_ADDRESS`) and a Vercel build-env (`VITE_REVENUE_VAULT_ADDRESS`); validated with an address regex, and if undefined nothing is written | `0x...` |
| `ARAF_REWARDS_ADDRESS` | Optional; same as above (`ARAF_REWARDS_ADDRESS` / `VITE_REWARDS_ADDRESS`) | `0x...` |

## One-time setup

1. **Fly**: `fly apps create araf-protocol-backend` (if the name differs, set `FLY_APP_NAME`). `fly.toml` is already in `backend/`. No manual volume/secret needed; the workflow loads the secrets.
2. **Vercel**: create a project for the frontend; leave Project Settings > Root Directory EMPTY (the CLI runs from inside `frontend/`). Do NOT define `VITE_API_URL` in the project env (prod rejects an absolute URL). The `/api` rewrite in `frontend/vercel.json` points to `https://araf-protocol-backend.fly.dev` in the repo; right before the Vercel deploy, the workflow rewrites the target in the runner's copy to `https://${FLY_APP_NAME}.fly.dev/api/$1` (`FLY_APP_NAME` is validated against `^[a-z0-9-]+$`; the repo file does not change, and the result is printed to the log). The Vercel CLI version is pinned in the workflow (`vercel@62.7.0`).
3. **MongoDB Atlas**: free cluster, DB user, network access.
4. **Upstash Redis**: TLS endpoint (`rediss://`).
5. **Alchemy**: Base Sepolia app; HTTP and WSS URLs.
6. **Basescan**: API key (optional; for `verify_contracts`).
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
# optional (experimental) Basescan verification: -f verify_contracts=true  (requires the BASESCAN_API_KEY secret)
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

Input overrides: `araf_escrow_address`, `usdt_address`, `usdc_address`, `deployment_block`.

## Farcaster / Base mini app

- The workflow passes `VITE_PUBLIC_URL=https://$FRONTEND_DOMAIN` to the Vercel build; the build generates the `fc:miniapp` meta tags and `/.well-known/farcaster.json` from it.
- The `accountAssociation` signature is bound to the domain, so it must be regenerated for every new `FRONTEND_DOMAIN`: deploy once, open the Farcaster developer tools (Manifest tool) or the Base Build manifest tool, enter the domain, sign with the Farcaster account, and copy the three values.
- Store them as GitHub variables `FARCASTER_ACCOUNT_ASSOCIATION_HEADER`, `FARCASTER_ACCOUNT_ASSOCIATION_PAYLOAD`, `FARCASTER_ACCOUNT_ASSOCIATION_SIGNATURE` (all three or none), optionally `VITE_BASE_APP_ID`, then re-run the frontend deploy. Without them farcaster.json is emitted without `accountAssociation` (the app still works; mini app verification will not pass).

## Notes

- Testnet KMS exception: with `NODE_ENV=production` + `EXPECTED_CHAIN_ID=84532` + `ALLOW_ENV_KMS_ON_TESTNET=yes`, `KMS_PROVIDER=env` is accepted (the backend exception exists on the main branch: `backend/scripts/services/encryption.js`; the RPC is also verified to be 84532). Mainnet requires AWS/Vault KMS.
- The frontend requires the `VITE_TARGET_CHAIN=base-sepolia` flag (exists on the main branch: `frontend/src/app/chainPolicy.js`; the workflow supplies it as a Vercel build-env); without it, a prod build connects only to Base Mainnet.
- The deployment block is not in the `deploy.js` output; the workflow reads it from the `deployTxHash` receipt.
- Secret values must not contain spaces/quotes/`#` (`flyctl secrets import` dotenv format).
- Contract verify (Basescan) is **experimental**: in a full deploy, `hardhat verify` runs with `verify_contracts=true` (default false) + `BASESCAN_API_KEY`; the constructor argument (`treasuryAddress`) and linked libraries (`ArafReputationLib`, `ArafSettlementLib`) are generated from the deploy manifest. The step is `continue-on-error: true`, so if it fails the deploy is unaffected; in that case verify manually. The libraries themselves are not verified.
- Rewards deploy is not part of the workflow (separate operation); if you enter the addresses as the `ARAF_REVENUE_VAULT_ADDRESS`/`ARAF_REWARDS_ADDRESS` variables, the workflows pass them to the backend and frontend.
