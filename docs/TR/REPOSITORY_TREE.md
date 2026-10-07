# Repository Tree — Üst Seviye Harita

> Bu doküman hızlı yön bulmak için üst seviye repo haritasıdır. UX rehberi değildir; frontend UX guardrail'leri `ARCHITECTURE.md` içinde dokümante edilir.
>
> Ağaç, git'in takip ettiği dosyaları listeler. `node_modules`, `artifacts`, `cache`, `deployments`, `abi`, coverage çıktıları, loglar ve lokal env dosyaları (`.env`) gibi generated/büyük klasörler özellikle dışarıda bırakılmıştır; test dosyaları klasör başına özetlenmiştir.

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
│   │   │   └── terms.js   # güncel koşul sürümü
│   │   ├── jobs/
│   │   │   ├── cleanupSensitiveData.js
│   │   │   ├── cleanupUserBankRiskMetadata.js
│   │   │   ├── reputationDecay.js
│   │   │   ├── rewardOutcomeRecorder.js   # saatlik ArafRewards.recordTradeOutcomes relayer işi
│   │   │   └── statsSnapshot.js
│   │   ├── middleware/
│   │   │   ├── auth.js
│   │   │   ├── errorHandler.js
│   │   │   └── rateLimiter.js
│   │   ├── migrations/
│   │   │   ├── backfillTerminalTradeStats.js   # TerminalTradeStat'ı doldurur (varsayılan dry-run; --apply)
│   │   │   ├── dedupeRevenueEvents.js   # mükerrer RevenueEvent satırlarını siler (varsayılan dry-run; --apply)
│   │   │   └── normalizeIdentityFields.js   # numeric id -> kanonik string (varsayılan YAZAR; --dry-run)
│   │   ├── models/
│   │   │   ├── Feedback.js
│   │   │   ├── HistoricalStat.js
│   │   │   ├── Order.js
│   │   │   ├── RevenueEvent.js
│   │   │   ├── RewardClaim.js
│   │   │   ├── RewardEpoch.js
│   │   │   ├── RewardEpochAllocationEvent.js
│   │   │   ├── RewardFunding.js
│   │   │   ├── TerminalTradeStat.js   # terminal trade başına kalıcı sayaç (TTL yok)
│   │   │   ├── TermsAcceptance.js   # imzalı koşul kabul kanıtı
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
│   │   │   ├── onchainTradeState.js   # PII için zincirde 'trade hâlâ aktif mi' kontrolü
│   │   │   ├── orderMarketMeta.js   # emirler için zincir dışı fiat/kur meta'sı
│   │   │   ├── protocolConfig.js
│   │   │   ├── referenceTicker.js
│   │   │   ├── siwe.js
│   │   │   ├── terminalStats.js   # TerminalTradeStat satır üreticisi
│   │   │   └── tokenEnv.js
│   │   ├── utils/
│   │   │   ├── adminWallets.js   # ADMIN_WALLETS tek kaynağı
│   │   │   ├── logger.js
│   │   │   ├── logRedaction.js
│   │   │   ├── onchain.js   # on-chain id ayrıştırma yardımcıları
│   │   │   ├── schedulerSuccess.js
│   │   │   └── timeEnv.js
│   │   └── app.js
│   ├── .dockerignore
│   ├── .env.example
│   ├── Dockerfile
│   ├── eslint.config.js
│   ├── fly.toml   # Fly.io uygulaması + /health check
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
│   │   ├── ArafErrors.sol   # ortak custom error'lar
│   │   ├── ArafEscrow.sol   # çekirdek escrow (iki library'ye linkli)
│   │   ├── ArafReputationLib.sol   # harici library: itibar mantığı
│   │   ├── ArafRevenueVault.sol
│   │   ├── ArafRewards.sol
│   │   ├── ArafSettlementLib.sol   # harici library: partial settlement mantığı
│   │   ├── MockERC20.sol
│   │   ├── MockERC20FalseTransfer.sol
│   │   ├── MockEscrowRewardView.sol
│   │   ├── MockFeeOnTransferERC20.sol
│   │   ├── MockRevenueEscrow.sol
│   │   ├── MockRevenueEscrowDoubleHook.sol   # test mock'u: gelir hook'unu iki kez tetikleyen escrow
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
│   │   │   │   ├── NowBoundary.jsx   # saat sınırı bileşeni
│   │   │   │   ├── SystemStatusBar.jsx
│   │   │   │   ├── ThemeToggle.jsx
│   │   │   │   └── useFullscreen.js
│   │   │   ├── apiConfig.js   # API base URL politikası
│   │   │   ├── AppModals.jsx
│   │   │   ├── AppViews.jsx
│   │   │   ├── bootstrapState.js
│   │   │   ├── chainPolicy.js   # zincir / faucet politikası
│   │   │   ├── clock.js   # tek zaman kaynağı
│   │   │   ├── connectorsLoader.js   # güvenli tembel cüzdan bağlayıcı yükleyici
│   │   │   ├── contractErrors.js
│   │   │   ├── fillAmountPolicy.js
│   │   │   ├── orderUiModel.js
│   │   │   ├── payoutProfileGate.js   # fail-closed ödeme profili kapısı (create/fill)
│   │   │   ├── rpcTransport.js   # VITE_RPC_URL birincil + public yedek transport
│   │   │   ├── tradeStateSync.js
│   │   │   ├── uiLab.js   # UI Lab kapısı (dev / VITE_ENABLE_UI_LAB)
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
│   │   ├── AdminPanel.jsx   # admin salt-okunur paneli
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
│   ├── vercel.json   # /api rewrite + güvenlik header'ları
│   └── vite.config.js
├── test/
│   ├── backend/   # jest
│   ├── contracts/   # hardhat
│   ├── frontend/   # vitest
│   └── ui-lab/   # UI Lab: fixture, mock, controller; yalnız dev / VITE_ENABLE_UI_LAB ile tembel yüklenir
├── .gitignore
├── CLAUDE.md
├── LICENSE
├── package.json
└── README.md
```

## Notlar

- **Testler repo kökünde** `test/<paket>/` altındadır (`test/backend` jest, `test/contracts` hardhat, `test/frontend` vitest, `test/ui-lab` UI Lab fixture'ları). `backend/` ve `contracts/` altında kendi `test/` klasörleri yoktur; `contracts/hardhat.config.js` `paths.tests` değerini `../test/contracts`'a yöneltir.
- **Kontratlar:** `ArafEscrow`, `ArafReputationLib` ve `ArafSettlementLib` harici library'lerine linklenir; `ArafErrors.sol` ortak custom error'ları tutar; `Mock*.sol` dosyaları yalnız test içindir.
- **Backend migration'ları** (`backend/scripts/migrations/`) `backend/` dizininden elle çalıştırılır (bkz. `DEPLOYMENT_GUIDE.md`, bölüm 8). `models/TerminalTradeStat.js` + `services/terminalStats.js` kalıcı kümülatif istatistik sayacını besler.
- **Env şablonları:** `backend/.env.example`, `frontend/.env.example` ve `contracts/.env.example` kodun okuduğu her değişkeni listeler.
- `docs/Plan/` planlama belgelerini tutar; `docs/EN/` ve `docs/TR/` bakımı yapılan dokümantasyon setidir.
