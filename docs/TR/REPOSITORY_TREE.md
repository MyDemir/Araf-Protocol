# Repository Tree — Üst Seviye Harita

> Üst düzey harita; ayrıntı için kod. UX rehberi değildir (frontend UX guardrail'leri `ARCHITECTURE.md` içindedir).
>
> Yalnız üst düzey klasörler ve her paketin kritik dosyaları listelenir. Generated/büyük klasörler (`node_modules`, `artifacts`, `cache`, `deployments`, `abi`, coverage, log, `.env`) dışarıda bırakılmıştır.

```text
Araf-Protocol/
├── .github/
│   ├── workflows/
│   │   ├── ci.yml
│   │   ├── deploy-base-sepolia.yml                 # kontrat + Fly + opsiyonel Vercel (workflow_dispatch)
│   │   ├── deploy-runtime-base-sepolia.yml         # kontratı yeniden deploy etmeden backend/frontend deploy
│   │   ├── escrow-registry-adopt.yml               # mevcut escrow'u Mongo escrow_registry'ye yazar (varsayılan dry-run)
│   │   ├── rotate-escrow.yml                       # escrow rotasyonu/arşiv geri yükleme (precheck, rotate, restore)
│   │   └── release.yml                             # v* etiketinden GitHub release (docs/releases/<etiket>.md)
│   ├── scripts/                                    # workflow yardımcıları (stage-runtime-env, rotate-escrow, escrow-registry, ...)
│   └── CODEOWNERS                                  # .github, contracts/src ve encryption.js için zorunlu inceleme
├── backend/
│   ├── scripts/
│   │   ├── app.js                                  # Express uygulama girişi
│   │   ├── config/                                 # db, redis, terms, paymentRailRiskConfig, runtimeSettingDefs
│   │   ├── jobs/                                   # zamanlanmış işler (itibar çürümesi, ödül sonucu kaydı, istatistik, temizlik, arşiv saklama)
│   │   ├── middleware/                             # auth, errorHandler, rateLimiter, requireFullService
│   │   ├── migrations/                             # elle çalıştırılan tek seferlik migration'lar
│   │   ├── models/                                 # Mongoose modelleri
│   │   ├── routes/                                 # REST route'ları
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
│   │   ├── ArafEscrow.sol                          # çekirdek escrow, iki library'ye linklenir
│   │   ├── ArafReputationLib.sol
│   │   ├── ArafSettlementLib.sol
│   │   ├── ArafErrors.sol
│   │   ├── ArafRevenueVault.sol
│   │   ├── ArafRewards.sol
│   │   └── Mock*.sol                               # yalnız test mock'ları
│   ├── scripts/                                    # deploy, deployRewards, deployTestToken, verify, rewardsOps, smokeRewards, gasBaseline, checkAbiDrift, lib/
│   ├── hardhat.config.js
│   └── .env.example
├── frontend/
│   ├── src/
│   │   ├── main.jsx, App.jsx, AdminPanel.jsx
│   │   ├── app/                                    # actions, contexts, copy, providers, shell, config modülleri
│   │   ├── components/
│   │   └── hooks/                                  # useArafContract, usePII, useRewardsContract, useTokenBalances, useOwnerWalletAge
│   ├── scripts/run-vitest.js
│   ├── build/                                      # Vite eklentisi (miniappMeta.js)
│   ├── vite.config.js
│   ├── vercel.json
│   └── .env.example
├── test/
│   ├── backend/                                    # jest
│   ├── contracts/                                  # hardhat
│   ├── frontend/                                   # vitest
│   └── ui-lab/                                     # UI Lab fixture/mock'ları (yalnız dev / VITE_ENABLE_UI_LAB)
├── scripts/init-env.js                             # yerel .env dosyalarını üretir
├── docs/
│   ├── README.md                                   # belge indeksi
│   ├── EN/                                         # İngilizce belgeler (API, ARCHITECTURE, DEPLOYMENT_GUIDE, ENV, DEPLOY_BASE_SEPOLIA, BACKLOG, ...)
│   ├── TR/                                         # Türkçe belgeler (aynı set + MAINNET_READINESS_CHECKLIST)
│   ├── releases/                                   # sürüm notları (v3.0.0.md) ve sürüm çıkarma adımları
│   ├── Plan/                                       # planlanan işler (Spot tier, UI scenario lab)
│   └── GAS_BASELINE.md
├── CLAUDE.md
├── .nvmrc                                          # Node 22
├── package.json
└── README.md
```

## Notlar

- **Testler repo kökünde** `test/<paket>/` altındadır; `contracts/hardhat.config.js` `paths.tests` değerini `../test/contracts`'a yöneltir.
- **Kontratlar:** `ArafEscrow`, `ArafReputationLib` ve `ArafSettlementLib` harici library'lerine linklenir; `ArafErrors.sol` ortak custom error'ları tutar; `Mock*.sol` yalnız test içindir.
- **Backend migration'ları** `backend/` dizininden elle çalıştırılır (bkz. `DEPLOYMENT_GUIDE.md`, bölüm 8).
- **Env şablonları:** `*/.env.example` kodun okuduğu her değişkeni listeler; bkz. `docs/TR/ENV.md`.
- `docs/Plan/` planlanan (henüz uygulanmamış) işleri tutar; `docs/EN/` ve `docs/TR/` bakımı yapılan dokümantasyon setidir.
