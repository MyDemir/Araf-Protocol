# Repository Tree — Üst Seviye Harita

> Bu doküman hızlı yön bulmak için üst seviye repo haritasıdır. UX rehberi değildir; frontend UX guardrail'leri `ARCHITECTURE.md` içinde dokümante edilir.
>
> `node_modules`, `artifacts`, `cache`, coverage çıktıları, loglar ve lokal env dosyaları gibi generated/büyük klasörler özellikle dışarıda bırakılmıştır.

```text
Araf-Protokol/
├── .github/
│   └── workflows/
│       └── ci.yml
├── backend/
│   ├── scripts/
│   │   ├── config/
│   │   │   ├── db.js
│   │   │   ├── paymentRailRiskConfig.js
│   │   │   └── redis.js
│   │   ├── jobs/
│   │   │   ├── cleanupSensitiveData.js
│   │   │   ├── cleanupUserBankRiskMetadata.js
│   │   │   ├── reputationDecay.js
│   │   │   └── statsSnapshot.js
│   │   ├── middleware/
│   │   │   ├── auth.js
│   │   │   ├── errorHandler.js
│   │   │   └── rateLimiter.js
│   │   ├── migrations/
│   │   │   └── normalizeIdentityFields.js
│   │   ├── models/
│   │   │   ├── Feedback.js
│   │   │   ├── HistoricalStat.js
│   │   │   ├── Order.js
│   │   │   ├── RevenueEvent.js
│   │   │   ├── RewardClaim.js
│   │   │   ├── RewardEpoch.js
│   │   │   ├── RewardEpochAllocationEvent.js
│   │   │   ├── RewardFunding.js
│   │   │   ├── Trade.js
│   │   │   └── User.js
│   │   ├── routes/
│   │   │   ├── admin.js
│   │   │   ├── auth.js
│   │   │   ├── feedback.js
│   │   │   ├── logs.js
│   │   │   ├── orders.js
│   │   │   ├── pii.js
│   │   │   ├── receipts.js
│   │   │   ├── referenceRates.js
│   │   │   ├── rewards.js
│   │   │   ├── stats.js
│   │   │   ├── tradeRisk.js
│   │   │   └── trades.js
│   │   ├── services/
│   │   │   ├── dlqProcessor.js
│   │   │   ├── encryption.js
│   │   │   ├── eventListener.js
│   │   │   ├── expectedChain.js
│   │   │   ├── health.js
│   │   │   ├── identityNormalizationGuard.js
│   │   │   ├── protocolConfig.js
│   │   │   ├── referenceTicker.js
│   │   │   ├── siwe.js
│   │   │   └── tokenEnv.js
│   │   ├── utils/
│   │   │   ├── logRedaction.js
│   │   │   ├── logger.js
│   │   │   ├── schedulerSuccess.js
│   │   │   └── timeEnv.js
│   │   └── app.js
│   ├── test/
│   │   └── *.test.js
│   ├── Dockerfile
│   ├── fly.toml
│   ├── package-lock.json
│   └── package.json
├── contracts/
│   ├── scripts/
│   │   ├── checkAbiDrift.js
│   │   ├── deploy.js
│   │   ├── deployRewards.js
│   │   ├── gasBaseline.js
│   │   ├── rewardsOps.js        (configure | verify | switch-treasury)
│   │   └── smokeRewards.js
│   ├── src/
│   │   ├── ArafEscrow.sol
│   │   ├── ArafRevenueVault.sol
│   │   ├── ArafRewards.sol
│   │   └── Mock*.sol
│   ├── test/
│   │   └── *.test.js
│   ├── hardhat.config.js
│   ├── package-lock.json
│   └── package.json
├── docs/
│   ├── EN/
│   │   ├── API.md
│   │   ├── ARCHITECTURE.md
│   │   ├── ARCHITECTURE_INCENTIVES.md
│   │   ├── GAME_THEORY.md
│   │   ├── GOVERNANCE_READINESS.md
│   │   ├── DEPLOYMENT_GUIDE.md
│   │   ├── PII_ENCRYPTION_MIGRATION.md
│   │   ├── REPOSITORY_TREE.md
│   │   ├── REWARDS_ABUSE_OBSERVABILITY.md
│   │   ├── REWARDS_ROLLOUT.md
│   │   └── V3_TERMINOLOGY_AUDIT.md
│   ├── Plan/
│   │   └── *.md
│   └── TR/
│       ├── API.md
│       ├── ARCHITECTURE.md
│       ├── ARCHITECTURE_INCENTIVES.md
│       ├── GAME_THEORY.md
│       ├── GOVERNANCE_READINESS.md
│       ├── DEPLOYMENT_GUIDE.md
│       ├── MAINNET_READINESS_CHECKLIST.md
│       ├── PII_ENCRYPTION_MIGRATION.md
│       ├── REPOSITORY_TREE.md
│       ├── REWARDS_ABUSE_OBSERVABILITY.md
│       ├── REWARDS_ROLLOUT.md
│       └── V3_TERMINOLOGY_AUDIT.md
├── frontend/
│   ├── scripts/
│   │   └── run-vitest.js
│   ├── src/
│   │   ├── app/
│   │   │   ├── actions/
│   │   │   ├── contexts/
│   │   │   ├── providers/
│   │   │   ├── AppModals.jsx
│   │   │   ├── AppViews.jsx
│   │   │   └── useAppSessionData.jsx
│   │   ├── components/
│   │   │   ├── ErrorBoundary.jsx
│   │   │   ├── PaymentRiskBadge.jsx
│   │   │   ├── PIIDisplay.jsx
│   │   │   ├── ReferenceRateTicker.jsx
│   │   │   └── SettlementProposalCard.jsx
│   │   ├── hooks/
│   │   │   ├── useArafContract.js
│   │   │   ├── useCountdown.js
│   │   │   ├── usePII.js
│   │   │   └── useRewardsContract.js
│   │   ├── App.jsx
│   │   ├── index.css
│   │   └── main.jsx
│   ├── index.html
│   ├── package-lock.json
│   ├── package.json
│   ├── postcss.config.js
│   ├── tailwind.config.js
│   ├── vercel.json
│   └── vite.config.js
├── test/
│   ├── backend/          (jest)
│   ├── contracts/        (hardhat)
│   ├── frontend/         (vitest)
│   └── ui-lab/           (UI Lab: fixtures, mocks, controller; lazy-loaded only in dev)
├── README.md
├── package.json
└── LICENSE
```
