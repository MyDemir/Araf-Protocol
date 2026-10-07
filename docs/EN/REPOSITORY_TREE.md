# Repository Tree — High-Level Map

> This document is a high-level repository map for orientation. It is not UX guidance; frontend UX guardrails are documented in `ARCHITECTURE.md`.
>
> The tree lists the files tracked by git. Generated/large folders such as `node_modules`, `artifacts`, `cache`, `deployments`, `abi`, coverage output, logs, and local env files (`.env`) are intentionally omitted; test files are summarised per folder.

```text
Araf-Protokol/
├── .claude/
│   └── agents/
│       ├── arastirmaci.md
│       ├── denetci.md
│       ├── gelistirici.md
│       ├── tasarimci.md
│       └── yukleyici.md
├── .github/
│   └── workflows/
│       └── ci.yml
├── backend/
│   ├── scripts/
│   │   ├── config/
│   │   │   ├── db.js
│   │   │   ├── paymentRailRiskConfig.js
│   │   │   ├── redis.js
│   │   │   └── terms.js   # current terms version
│   │   ├── jobs/
│   │   │   ├── cleanupSensitiveData.js
│   │   │   ├── cleanupUserBankRiskMetadata.js
│   │   │   ├── reputationDecay.js
│   │   │   ├── rewardOutcomeRecorder.js   # hourly ArafRewards.recordTradeOutcomes relayer job
│   │   │   └── statsSnapshot.js
│   │   ├── middleware/
│   │   │   ├── auth.js
│   │   │   ├── errorHandler.js
│   │   │   └── rateLimiter.js
│   │   ├── migrations/
│   │   │   ├── backfillTerminalTradeStats.js   # fills TerminalTradeStat (dry-run default; --apply)
│   │   │   ├── dedupeRevenueEvents.js   # removes duplicate RevenueEvent rows (dry-run default; --apply)
│   │   │   └── normalizeIdentityFields.js   # numeric ids -> canonical strings (default WRITES; --dry-run)
│   │   ├── models/
│   │   │   ├── Feedback.js
│   │   │   ├── HistoricalStat.js
│   │   │   ├── Order.js
│   │   │   ├── RevenueEvent.js
│   │   │   ├── RewardClaim.js
│   │   │   ├── RewardEpoch.js
│   │   │   ├── RewardEpochAllocationEvent.js
│   │   │   ├── RewardFunding.js
│   │   │   ├── TerminalTradeStat.js   # permanent per-terminal-trade counter (no TTL)
│   │   │   ├── TermsAcceptance.js   # signed terms acceptance evidence
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
│   │   │   ├── onchainTradeState.js   # on-chain 'trade still active' check for PII
│   │   │   ├── orderMarketMeta.js   # off-chain fiat/rate meta for orders
│   │   │   ├── protocolConfig.js
│   │   │   ├── referenceTicker.js
│   │   │   ├── siwe.js
│   │   │   ├── terminalStats.js   # TerminalTradeStat row builder
│   │   │   └── tokenEnv.js
│   │   ├── utils/
│   │   │   ├── adminWallets.js   # ADMIN_WALLETS single source
│   │   │   ├── logger.js
│   │   │   ├── logRedaction.js
│   │   │   ├── onchain.js   # on-chain id parsing helpers
│   │   │   ├── schedulerSuccess.js
│   │   │   └── timeEnv.js
│   │   └── app.js
│   ├── .dockerignore
│   ├── .env.example
│   ├── Dockerfile
│   ├── eslint.config.js
│   ├── fly.toml   # Fly.io app + /health check
│   ├── jest.config.cjs
│   ├── package-lock.json
│   └── package.json
├── contracts/
│   ├── scripts/
│   │   ├── checkAbiDrift.js
│   │   ├── deploy.js
│   │   ├── deployRewards.js
│   │   ├── gasBaseline.js
│   │   ├── rewardsOps.js   # configure | verify | switch-treasury
│   │   └── smokeRewards.js
│   ├── src/
│   │   ├── ArafErrors.sol   # shared custom errors
│   │   ├── ArafEscrow.sol   # core escrow (linked against the two libraries)
│   │   ├── ArafReputationLib.sol   # external library: reputation logic
│   │   ├── ArafRevenueVault.sol
│   │   ├── ArafRewards.sol
│   │   ├── ArafSettlementLib.sol   # external library: partial settlement logic
│   │   ├── MockERC20.sol
│   │   ├── MockERC20FalseTransfer.sol
│   │   ├── MockEscrowRewardView.sol
│   │   ├── MockFeeOnTransferERC20.sol
│   │   ├── MockRevenueEscrow.sol
│   │   ├── MockRevenueEscrowDoubleHook.sol   # test mock: escrow firing the revenue hook twice
│   │   ├── MockRevenueReceiver.sol
│   │   └── MockRevenueReceiverReverter.sol
│   ├── .env.example
│   ├── hardhat.config.js
│   ├── package-lock.json
│   └── package.json
├── docs/
│   ├── EN/
│   │   ├── API.md
│   │   ├── ARCHITECTURE.md
│   │   ├── ARCHITECTURE_INCENTIVES.md
│   │   ├── BACKLOG.md
│   │   ├── DEPLOYMENT_GUIDE.md
│   │   ├── GAME_THEORY.md
│   │   ├── GOVERNANCE_READINESS.md
│   │   ├── PII_ENCRYPTION_MIGRATION.md
│   │   ├── REPOSITORY_TREE.md
│   │   ├── REWARDS_ABUSE_OBSERVABILITY.md
│   │   ├── REWARDS_ROLLOUT.md
│   │   └── V3_TERMINOLOGY_AUDIT.md
│   ├── Plan/
│   │   ├── araf_frontend_global_ui_repo_teyitli_kapsamli_plan_v2.md
│   │   ├── Araf_Spot_Liquidity_Peace_Tier_Plan.md
│   │   ├── Araf_V3_Faz3_Proof_of_Peace_Global_Rewards_Plan.md
│   │   ├── Araf_V3_Urun_Planı_Yeniden_Kurgulanmis.md
│   │   ├── Kontrat_Denetimi_Piyasa_SWOT_2026-09.md
│   │   ├── Optimasyon.pdf
│   │   ├── REWARDS_ROLLOUT.md
│   │   ├── ui_scenario_lab.md
│   │   └── Uyumluluk_ve_Mainnet_Hazirlik_Raporu_2026-09.md
│   ├── TR/
│   │   ├── API.md
│   │   ├── ARCHITECTURE.md
│   │   ├── ARCHITECTURE_INCENTIVES.md
│   │   ├── DEPLOYMENT_GUIDE.md
│   │   ├── GAME_THEORY.md
│   │   ├── GOVERNANCE_READINESS.md
│   │   ├── MAINNET_READINESS_CHECKLIST.md
│   │   ├── PII_ENCRYPTION_MIGRATION.md
│   │   ├── REPOSITORY_TREE.md
│   │   ├── REWARDS_ABUSE_OBSERVABILITY.md
│   │   ├── REWARDS_ROLLOUT.md
│   │   ├── V3_TERMINOLOGY_AUDIT.md
│   │   └── YAPILACAKLAR.md
│   ├── FUNDRAISING_STRATEGY.md
│   ├── GAS_BASELINE.md
│   ├── OUTREACH_TEMPLATE.md
│   ├── PITCH_EN.md
│   └── PITCH_TR.md
├── frontend/
│   ├── public/
│   │   ├── apple-touch-icon.png
│   │   ├── icon-192.png
│   │   ├── icon-512.png
│   │   ├── icon-maskable-512.png
│   │   ├── icon.svg
│   │   └── manifest.webmanifest
│   ├── scripts/
│   │   └── run-vitest.js
│   ├── src/
│   │   ├── app/
│   │   │   ├── actions/
│   │   │   │   ├── allowanceMath.js
│   │   │   │   ├── contractLifecycleActions.js
│   │   │   │   ├── decimalUnits.js
│   │   │   │   ├── orderCreationActions.js
│   │   │   │   └── tradeNavigationActions.js
│   │   │   ├── contexts/
│   │   │   │   ├── admin/
│   │   │   │   │   ├── adminChainConfig.js
│   │   │   │   │   ├── AdminChainPanel.jsx
│   │   │   │   │   └── AdminRevenuePanel.jsx
│   │   │   │   ├── marketplace/
│   │   │   │   │   ├── marketFilters.js
│   │   │   │   │   └── useMakerOrderForm.js
│   │   │   │   ├── operations/
│   │   │   │   │   ├── OperationLaneTabs.jsx
│   │   │   │   │   ├── OperationsCenterPage.jsx
│   │   │   │   │   ├── operationsContextModel.js
│   │   │   │   │   ├── OperationsPanels.jsx
│   │   │   │   │   └── OperationTradeCard.jsx
│   │   │   │   ├── profile/
│   │   │   │   │   ├── ActiveTradesPanel.jsx
│   │   │   │   │   ├── MyOrdersPanel.jsx
│   │   │   │   │   ├── PaymentProfilePanel.jsx
│   │   │   │   │   ├── ProfileContextPage.jsx
│   │   │   │   │   ├── ProfileContextPanel.jsx
│   │   │   │   │   ├── ProfilePanels.jsx
│   │   │   │   │   ├── reputationModel.js
│   │   │   │   │   ├── rewardsModel.js
│   │   │   │   │   └── RewardsPanel.jsx
│   │   │   │   ├── settlement/
│   │   │   │   │   ├── settlementActionModel.js
│   │   │   │   │   └── useSettlementActions.js
│   │   │   │   └── trade-room/
│   │   │   │       ├── PrimaryActionPanel.jsx
│   │   │   │       ├── SecondaryActionsPanel.jsx
│   │   │   │       ├── tradeDecisionModel.js
│   │   │   │       ├── TradeRoomPage.jsx
│   │   │   │       ├── tradeRoomPanelActions.js
│   │   │   │       ├── TradeRoomPanels.jsx
│   │   │   │       └── tradeTimeline.js
│   │   │   ├── copy/
│   │   │   │   ├── index.js
│   │   │   │   ├── orderSide.js
│   │   │   │   ├── paymentRisk.js
│   │   │   │   ├── pii.js
│   │   │   │   ├── states.js
│   │   │   │   └── tradeTerms.js
│   │   │   ├── legal/
│   │   │   │   └── terms.js
│   │   │   ├── providers/
│   │   │   │   ├── AppProviders.jsx
│   │   │   │   ├── SessionProvider.jsx
│   │   │   │   └── ThemeProvider.jsx
│   │   │   ├── shell/
│   │   │   │   ├── AppShell.jsx
│   │   │   │   ├── NowBoundary.jsx   # clock boundary component
│   │   │   │   ├── SystemStatusBar.jsx
│   │   │   │   ├── ThemeToggle.jsx
│   │   │   │   └── useFullscreen.js
│   │   │   ├── apiConfig.js   # API base URL policy
│   │   │   ├── AppModals.jsx
│   │   │   ├── AppViews.jsx
│   │   │   ├── bootstrapState.js
│   │   │   ├── chainPolicy.js   # chain / faucet policy
│   │   │   ├── clock.js   # single time source
│   │   │   ├── connectorsLoader.js   # safe lazy wallet-connector loader
│   │   │   ├── contractErrors.js
│   │   │   ├── fillAmountPolicy.js
│   │   │   ├── orderUiModel.js
│   │   │   ├── payoutProfileGate.js   # fail-closed payout-profile gate (create/fill)
│   │   │   ├── rpcTransport.js   # VITE_RPC_URL primary + public fallback transport
│   │   │   ├── tradeStateSync.js
│   │   │   ├── uiLab.js   # UI Lab gate (dev / VITE_ENABLE_UI_LAB)
│   │   │   ├── useAppSessionData.jsx
│   │   │   ├── viewRegistry.js
│   │   │   └── walletAge.js
│   │   ├── components/
│   │   │   ├── ErrorBoundary.jsx
│   │   │   ├── PaymentRiskBadge.jsx
│   │   │   ├── PIIDisplay.jsx
│   │   │   ├── ReferenceRateTicker.jsx
│   │   │   ├── SettlementPreviewModal.jsx
│   │   │   └── SettlementProposalCard.jsx
│   │   ├── hooks/
│   │   │   ├── useArafContract.js
│   │   │   ├── usePII.js
│   │   │   └── useRewardsContract.js
│   │   ├── AdminPanel.jsx   # admin read-only panel
│   │   ├── App.jsx
│   │   ├── index.css
│   │   └── main.jsx
│   ├── .env.example
│   ├── eslint.config.js
│   ├── index.html
│   ├── package-lock.json
│   ├── package.json
│   ├── postcss.config.js
│   ├── tailwind.config.js
│   ├── vercel.json   # /api rewrite + security headers
│   └── vite.config.js
├── test/
│   ├── backend/   # jest
│   ├── contracts/   # hardhat
│   ├── frontend/   # vitest
│   └── ui-lab/   # UI Lab: fixtures, mocks, controller; lazy-loaded only in dev / VITE_ENABLE_UI_LAB
├── .gitignore
├── CLAUDE.md
├── LICENSE
├── package.json
└── README.md
```

## Notes

- **Tests live at the repository root** under `test/<package>/` (`test/backend` jest, `test/contracts` hardhat, `test/frontend` vitest, `test/ui-lab` UI Lab fixtures). `backend/` and `contracts/` have no `test/` folder of their own; `contracts/hardhat.config.js` points `paths.tests` at `../test/contracts`.
- **Contracts:** `ArafEscrow` links the external libraries `ArafReputationLib` and `ArafSettlementLib`; `ArafErrors.sol` holds shared custom errors; `Mock*.sol` files are test-only.
- **Backend migrations** (`backend/scripts/migrations/`) are run by hand from `backend/` (see `DEPLOYMENT_GUIDE.md`, section 8). `models/TerminalTradeStat.js` + `services/terminalStats.js` back the permanent cumulative-statistics counter.
- **Env templates:** `backend/.env.example`, `frontend/.env.example` and `contracts/.env.example` list every variable the code reads.
- `docs/Plan/` holds planning documents; `docs/EN/` and `docs/TR/` are the maintained documentation set.
