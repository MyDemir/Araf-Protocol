# Repository Tree — High-Level Map

> Top-level map; for details, read the code. Not UX guidance (frontend UX guardrails are in `ARCHITECTURE.md`).
>
> Only top-level folders and each package's key files are listed. Generated/large folders (`node_modules`, `artifacts`, `cache`, `deployments`, `abi`, coverage, logs, `.env`) are omitted.

```text
Araf-Protocol/
├── .github/
│   ├── workflows/
│   │   ├── ci.yml
│   │   ├── deploy-base-sepolia.yml                 # contracts + Fly + optional Vercel (workflow_dispatch)
│   │   ├── deploy-runtime-base-sepolia.yml         # backend/frontend deploy without redeploying contracts
│   │   ├── escrow-registry-adopt.yml               # writes the current escrow to the Mongo escrow_registry (dry-run by default)
│   │   ├── rotate-escrow.yml                       # escrow rotation / archive restore (precheck, rotate, restore)
│   │   └── release.yml                             # GitHub release from a v* tag (docs/releases/<tag>.md)
│   ├── scripts/                                    # workflow helpers (stage-runtime-env, rotate-escrow, escrow-registry, ...)
│   └── CODEOWNERS                                  # required review for .github, contracts/src and encryption.js
├── backend/
│   ├── scripts/
│   │   ├── app.js                                  # Express app entry
│   │   ├── config/                                 # db, redis, terms, paymentRailRiskConfig, runtimeSettingDefs
│   │   ├── jobs/                                   # scheduled jobs (reputation decay, reward outcome recorder, stats, cleanup, archive retention)
│   │   ├── middleware/                             # auth, errorHandler, rateLimiter, requireFullService
│   │   ├── migrations/                             # manual one-off migrations
│   │   ├── models/                                 # Mongoose models
│   │   ├── routes/                                 # REST routes
│   │   ├── services/                               # eventListener, dlqProcessor, encryption, siwe, escrowRegistryGuard, health, rpcProvider, ...
│   │   └── utils/
│   ├── Dockerfile
│   ├── .dockerignore
│   ├── fly.toml
│   ├── eslint.config.js
│   ├── jest.config.cjs
│   └── .env.example
├── contracts/
│   ├── src/
│   │   ├── ArafEscrow.sol                          # core escrow, linked against the two libraries
│   │   ├── ArafReputationLib.sol
│   │   ├── ArafSettlementLib.sol
│   │   ├── ArafErrors.sol
│   │   ├── ArafRevenueVault.sol
│   │   ├── ArafRewards.sol
│   │   └── Mock*.sol                               # test-only mocks
│   ├── scripts/                                    # deploy, deployRewards, deployTestToken, verify, rewardsOps, smokeRewards, gasBaseline, checkAbiDrift, lib/
│   ├── hardhat.config.js
│   └── .env.example
├── frontend/
│   ├── src/
│   │   ├── main.jsx, App.jsx, AdminPanel.jsx
│   │   ├── app/                                    # actions, contexts, copy, providers, shell, config modules
│   │   ├── components/
│   │   └── hooks/                                  # useArafContract, usePII, useRewardsContract, useTokenBalances, useOwnerWalletAge
│   ├── scripts/run-vitest.js
│   ├── build/                                      # Vite plugin (miniappMeta.js)
│   ├── vite.config.js
│   ├── vercel.json
│   └── .env.example
├── test/
│   ├── backend/                                    # jest
│   ├── contracts/                                  # hardhat
│   ├── frontend/                                   # vitest
│   └── ui-lab/                                     # UI Lab fixtures/mocks (dev / VITE_ENABLE_UI_LAB only)
├── scripts/init-env.js                             # generates local .env files
├── docs/
│   ├── README.md                                   # documentation index
│   ├── EN/                                         # English docs (API, ARCHITECTURE, DEPLOYMENT_GUIDE, ENV, DEPLOY_BASE_SEPOLIA, BACKLOG, ...)
│   ├── TR/                                         # Turkish docs (same set + MAINNET_READINESS_CHECKLIST)
│   ├── releases/                                   # release notes (v3.0.0.md) and the release procedure
│   ├── Plan/                                       # planned work (Spot tier, UI scenario lab)
│   └── GAS_BASELINE.md
├── CLAUDE.md
├── .nvmrc                                          # Node 22
├── package.json
└── README.md
```

## Notes

- **Tests live at the repository root** under `test/<package>/`; `contracts/hardhat.config.js` points `paths.tests` at `../test/contracts`.
- **Contracts:** `ArafEscrow` links the external libraries `ArafReputationLib` and `ArafSettlementLib`; `ArafErrors.sol` holds shared custom errors; `Mock*.sol` are test-only.
- **Backend migrations** are run by hand from `backend/` (see `DEPLOYMENT_GUIDE.md`, section 8).
- **Env templates:** `*/.env.example` list every variable the code reads; see `docs/EN/ENV.md`.
- `docs/Plan/` holds planned (not yet implemented) work; `docs/EN/` and `docs/TR/` are the maintained documentation set.
