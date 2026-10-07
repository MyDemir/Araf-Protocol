# Repository Tree — High-Level Map

> Top-level map; for details, read the code. Not UX guidance (frontend UX guardrails are in `ARCHITECTURE.md`).
>
> Only top-level folders and each package's key files are listed. Generated/large folders (`node_modules`, `artifacts`, `cache`, `deployments`, `abi`, coverage, logs, `.env`) are omitted.

```text
Araf-Protokol/
├── .github/workflows/
│   ├── ci.yml
│   ├── deploy-base-sepolia.yml           # contracts + Fly + optional Vercel (workflow_dispatch)
│   └── deploy-runtime-base-sepolia.yml   # backend/frontend deploy without redeploying contracts
├── backend/
│   ├── scripts/
│   │   ├── app.js                        # Express app entry
│   │   ├── config/                       # db, redis, terms, paymentRailRiskConfig
│   │   ├── jobs/                         # scheduled jobs (reputation decay, reward outcome recorder, stats, cleanup)
│   │   ├── middleware/                   # auth, errorHandler, rateLimiter
│   │   ├── migrations/                   # manual one-off migrations
│   │   ├── models/                       # Mongoose models
│   │   ├── routes/                       # REST routes
│   │   ├── services/                     # eventListener, dlqProcessor, encryption, siwe, ...
│   │   └── utils/
│   ├── Dockerfile
│   ├── fly.toml
│   ├── jest.config.cjs
│   └── .env.example
├── contracts/
│   ├── src/
│   │   ├── ArafEscrow.sol                # core escrow, linked against the two libraries
│   │   ├── ArafReputationLib.sol
│   │   ├── ArafSettlementLib.sol
│   │   ├── ArafErrors.sol
│   │   ├── ArafRevenueVault.sol
│   │   ├── ArafRewards.sol
│   │   └── Mock*.sol                     # test-only mocks
│   ├── scripts/                          # deploy, deployRewards, rewardsOps, smokeRewards, gasBaseline, checkAbiDrift
│   ├── hardhat.config.js
│   └── .env.example
├── frontend/
│   ├── src/
│   │   ├── main.jsx, App.jsx, AdminPanel.jsx
│   │   ├── app/                          # actions, contexts, copy, providers, shell, config modules
│   │   ├── components/
│   │   └── hooks/                        # useArafContract, usePII, useRewardsContract
│   ├── vite.config.js
│   ├── vercel.json
│   └── .env.example
├── test/
│   ├── backend/                          # jest
│   ├── contracts/                        # hardhat
│   ├── frontend/                         # vitest
│   └── ui-lab/                           # UI Lab fixtures/mocks (dev / VITE_ENABLE_UI_LAB only)
├── scripts/init-env.js                   # generates local .env files
├── docs/
│   ├── README.md                         # documentation index
│   ├── EN/                               # English docs (API, ARCHITECTURE, DEPLOYMENT_GUIDE, ENV, DEPLOY_BASE_SEPOLIA, BACKLOG, ...)
│   ├── TR/                               # Turkish docs (same set + MAINNET_READINESS_CHECKLIST)
│   ├── Plan/                             # planned work (Spot tier, UI scenario lab)
│   ├── colosseum/                        # hackathon submission material
│   └── GAS_BASELINE.md
├── CLAUDE.md
├── package.json
└── README.md
```

## Notes

- **Tests live at the repository root** under `test/<package>/`; `contracts/hardhat.config.js` points `paths.tests` at `../test/contracts`.
- **Contracts:** `ArafEscrow` links the external libraries `ArafReputationLib` and `ArafSettlementLib`; `ArafErrors.sol` holds shared custom errors; `Mock*.sol` are test-only.
- **Backend migrations** are run by hand from `backend/` (see `DEPLOYMENT_GUIDE.md`, section 8).
- **Env templates:** `*/.env.example` list every variable the code reads; see `docs/EN/ENV.md`.
- `docs/Plan/` holds planned (not yet implemented) work; `docs/EN/` and `docs/TR/` are the maintained documentation set.
