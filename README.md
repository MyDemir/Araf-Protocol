# ⏳ Araf Protocol / P2P Escrow (V3)
**"Trust the Time, Not the Oracle. / Zamana Güven, Hakeme Değil."**

[![Version: 3.x architecture](https://img.shields.io/badge/Architecture-V3_Order--First-blue.svg)]()
[![Network: Base L2](https://img.shields.io/badge/Network-Base-blueviolet.svg)]()
[![Model: Web 2.5](https://img.shields.io/badge/Model-Web_2.5-orange.svg)]()

---

## 🌍 Language / Dil Selection
- [English](#-english)
- [Türkçe](#-türkçe)

---

## 🇬🇧 English

Araf is a **non-custodial, oracle-free, humanless** fiat ↔ crypto protocol.

Araf does not act as a court, oracle, moderator, or backend arbitrator. It does not prove off-chain fiat truth. It prices delay, disagreement, and dishonest strategy so unresolved trades become economically costly.

### Canonical V3 model
- **Parent Order** is the public market primitive.
- **Child Trade** is the real escrow lifecycle.
- **ArafEscrow.sol** is the only authoritative state machine. It links two external libraries, `ArafReputationLib` and `ArafSettlementLib` (deploy order: ReputationLib → SettlementLib → Escrow).
- **ArafRevenueVault.sol** splits protocol revenue into reward/treasury reserves; **ArafRewards.sol** runs Proof of Peace epochs. Neither can change trade outcomes.
- Backend is a **mirror + coordination** layer (not authority).
- Frontend is a **UX guardrail + contract access** layer (not authority).

### Core interaction surface (contract)
- Order layer: `createSellOrder` / `fillSellOrder` / `cancelSellOrder`, `createBuyOrder` / `fillBuyOrder` / `cancelBuyOrder`
- Child-trade lifecycle: `reportPayment`, `releaseFunds`, `pingMaker` → `autoRelease`, `pingTakerForChallenge` → `challengeTrade`, `proposeOrApproveCancel` / `revokeCancel`, `expirePaymentWindow`, `proposeSettlement` / `acceptSettlement(tradeId, expectedProposalId)` / `rejectSettlement` / `withdrawSettlement` / `expireSettlement`, `burnExpired`
- Governance surface (owner): `setTreasury`, `setFeeConfig`, `setCooldownConfig`, `setTokenConfig`, `setReputationPolicy`, `setReputationTierThresholds`, `pause/unpause` (pause only stops new order creation and fills; open trades can always exit)

### Important protocol truths
- Role mapping is side-dependent (not universally maker=seller):
  - `SELL_CRYPTO`: owner→maker, filler→taker
  - `BUY_CRYPTO`: owner→taker, filler→maker
- Time drives every unresolved trade: 48h to report payment (`expirePaymentWindow` after that), a maker challenge ping lapses unless backed by `challengeTrade` within `[ping+24h, ping+48h)`, and a challenged trade bleeds after a 48h grace period until `burnExpired` at 240h sends everything left to treasury.
- Fee/cooldown values are **mutable runtime config**, not hard-fixed constants (defaults: 15 bps per side, 4h cooldown for Tier 0/1).
- `setFeeConfig` is bounded by on-chain economic cap: max **2000 bps** per side.
- Active trade economics are protected by fee snapshots.
- Reputation clean-slate period defaults to **90 days** (owner-adjustable within 7–365 days); `decayReputation` is not a full amnesty.
- Supported payout rails are constrained to **TR_IBAN, US_ACH, SEPA_IBAN**.
- Token permissions are direction-aware: `supported`, `allowSellOrders`, `allowBuyOrders` (+ `decimals` verified against the token, per-tier amount caps).

### Legacy note
Legacy listing-first / `createEscrow` / `lockEscrow` narratives are **no longer canonical architecture**.

---

## 🇹🇷 Türkçe

Araf, fiat ↔ kripto takası için **emanet tutmayan, oracle-bağımsız, insansız** bir protokoldür.

Araf mahkeme, oracle, moderatör veya backend hakemi değildir. Off-chain fiat gerçeğini ispatlamaz. Gecikmeyi, anlaşmazlığı ve kötü stratejiyi fiyatlandırır; çözülemeyen trade'leri ekonomik olarak maliyetli hale getirir.

### Kanonik V3 model
- **Parent Order** kamusal pazar primitive’idir.
- **Child Trade** gerçek escrow yaşam döngüsüdür.
- Tek authoritative state machine: **ArafEscrow.sol**. İki external library'ye linklenir: `ArafReputationLib` ve `ArafSettlementLib` (deploy sırası: ReputationLib → SettlementLib → Escrow).
- **ArafRevenueVault.sol** protokol gelirini ödül/hazine rezervlerine böler; **ArafRewards.sol** Proof of Peace epoch'larını yürütür. İkisi de trade sonucunu değiştiremez.
- Backend: **mirror + koordinasyon** katmanı (authority değildir)
- Frontend: **UX guardrail + contract access** katmanı (authority değildir)

### Temel etkileşim yüzeyi (kontrat)
- Order katmanı: `createSellOrder` / `fillSellOrder` / `cancelSellOrder`, `createBuyOrder` / `fillBuyOrder` / `cancelBuyOrder`
- Child-trade lifecycle: `reportPayment`, `releaseFunds`, `pingMaker` → `autoRelease`, `pingTakerForChallenge` → `challengeTrade`, `proposeOrApproveCancel` / `revokeCancel`, `expirePaymentWindow`, `proposeSettlement` / `acceptSettlement(tradeId, expectedProposalId)` / `rejectSettlement` / `withdrawSettlement` / `expireSettlement`, `burnExpired`
- Governance yüzeyi (owner): `setTreasury`, `setFeeConfig`, `setCooldownConfig`, `setTokenConfig`, `setReputationPolicy`, `setReputationTierThresholds`, `pause/unpause` (pause yalnız yeni order oluşturma ve fill'i durdurur; açık trade'ler her zaman çıkabilir)

### Kritik gerçekler
- Rol eşleşmesi side-dependent’tir (genel maker=seller kuralı yoktur):
  - `SELL_CRYPTO`: owner→maker, filler→taker
  - `BUY_CRYPTO`: owner→taker, filler→maker
- Çözülmeyen her trade'i zaman yürütür: ödeme bildirmek için 48 saat (sonra `expirePaymentWindow`), maker'ın challenge pingi `[ping+24sa, ping+48sa)` içinde `challengeTrade` ile desteklenmezse düşer, challenge edilen trade 48 saatlik grace sonrası erir ve 240. saatte `burnExpired` kalan her şeyi hazineye gönderir.
- Fee/cooldown değerleri **mutable runtime config**’tir; sabit değildir (varsayılan: taraf başına 15 bps, Tier 0/1 için 4 saat cooldown).
- `setFeeConfig` on-chain ekonomik tavan ile sınırlıdır: taraf başına en fazla **2000 bps**.
- Aktif trade economics fee snapshot ile korunur.
- Reputation clean-slate süresi varsayılan **90 gün**dür (owner 7–365 gün arasında değiştirebilir); `decayReputation` tam af değildir.
- Desteklenen payout rail seti **TR_IBAN, US_ACH, SEPA_IBAN** ile sınırlıdır.
- Token izinleri direction-aware’dir: `supported`, `allowSellOrders`, `allowBuyOrders` (+ token'a karşı doğrulanan `decimals`, tier başına tutar tavanları).

### Legacy not
Listing-first / `createEscrow` / `lockEscrow` anlatısı artık **kanonik mimari** değildir.

---


## 🎁 Proof of Peace Rewards (Concise)
- Rewards are **not trade cashback**; they are a pro-rata peace premium.
- Eligibility is generated only from **ArafEscrow terminal outcomes**.
- Fast clean release receives the strongest positive weight (×2.5 within 1h of payment report).
- Partial settlement receives low positive weight (×0.3) because it de-escalates dispute without making dispute farming attractive.
- Backend is mirror-only; admin/sponsor cannot choose recipients, weights, or multipliers.
- `paymentRiskLevel` is not a reward multiplier.
- MVP zero-weight outcomes: auto-release, burn, mutual cancel, disputed release, payment-window expiry.
- MVP Tier 0 is not reward eligible.
- `rewardBps` starts at 4000 and is bounded to 4000–7000.

**Canonical reward thesis:** Proof of Peace makes fast clean resolution more valuable than delay, while Bleeding Escrow makes unresolved conflict expensive.

Rollout docs:
- TR: [docs/TR/REWARDS_ROLLOUT.md](./docs/TR/REWARDS_ROLLOUT.md)
- EN: [docs/EN/REWARDS_ROLLOUT.md](./docs/EN/REWARDS_ROLLOUT.md)
- Abuse observability: [docs/EN/REWARDS_ABUSE_OBSERVABILITY.md](./docs/EN/REWARDS_ABUSE_OBSERVABILITY.md) · [docs/TR/REWARDS_ABUSE_OBSERVABILITY.md](./docs/TR/REWARDS_ABUSE_OBSERVABILITY.md)
- Mainnet checklist (TR): [docs/TR/MAINNET_READINESS_CHECKLIST.md](./docs/TR/MAINNET_READINESS_CHECKLIST.md)

---

## 🛠 Kurulum / Setup

**Gereksinimler / Requirements:** Node.js 22 (`.nvmrc`), npm; backend için MongoDB ve Redis (yerelde Docker yeterli: bkz. [docs/EN/DEPLOYMENT_GUIDE.md](./docs/EN/DEPLOYMENT_GUIDE.md) §1).

```bash
# 1. Node 22 / Use Node 22
nvm use                            # reads .nvmrc

# 2. Install all packages / Tüm paketleri kur (contracts + backend + frontend, npm ci)
npm run setup

# 3. Env files / Ortam dosyaları (şablonlar; gerçek secret commit etmeyin)
cp backend/.env.example backend/.env
cp frontend/.env.example frontend/.env
cp contracts/.env.example contracts/.env

# 4. Test / Lint (tests live under test/<package>/)
npm run test:all                   # contracts + backend + frontend + ABI drift
npm --prefix backend test          # Jest
npm --prefix frontend test         # Vitest
npm --prefix contracts test        # Hardhat
npm run test:abi-drift             # escrow ABI vs. ABI strings in useArafContract.js / eventListener.js
npm run lint                       # backend + frontend

# 5. Dev / Yerel çalıştırma
npm run dev:backend
npm run dev:frontend

# 6. Build
npm run build:frontend
npm run build:frontend:testnet     # Base Sepolia build (POSIX shell: sets VITE_TARGET_CHAIN=base-sepolia)

# Gas baseline
npm --prefix contracts run gas:baseline
```

Yerel kontrat deploy'u (hardhat node + `deploy.js`) için [docs/EN/DEPLOYMENT_GUIDE.md](./docs/EN/DEPLOYMENT_GUIDE.md) / [docs/TR/DEPLOYMENT_GUIDE.md](./docs/TR/DEPLOYMENT_GUIDE.md) §1. Base Sepolia deploy / testnet yayını: [docs/DEPLOY_BASE_SEPOLIA.md](./docs/DEPLOY_BASE_SEPOLIA.md).

> **Rewards scripts note / Not:** `verify:rewards`, `configure:rewards` and `switch:rewards:treasury` all run the same `scripts/rewardsOps.js`; the operation is chosen by the npm script name (so call them via `npm run`, not `npx hardhat run` directly), or by `REWARDS_OP`. / Üçü de aynı `rewardsOps.js`'i çalıştırır; işlem npm script adından seçilir (`npm run` ile çağırın).

## 🗂 Repository layout / Depo yapısı

| Path | Content |
|---|---|
| `contracts/src/` | `ArafEscrow`, `ArafReputationLib`, `ArafSettlementLib`, `ArafErrors`, `ArafRevenueVault`, `ArafRewards` (+ test mocks) |
| `contracts/scripts/` | `deploy.js`, `deployRewards.js`, `rewardsOps.js`, `smokeRewards.js`, `gasBaseline.js`, `checkAbiDrift.js` |
| `backend/scripts/` | Express app (`app.js`), routes, event worker (`services/eventListener.js`), DLQ, jobs, Mongo models |
| `frontend/src/` | React/Vite app (`app/`, `hooks/`, `components/`) |
| `test/` | `contracts/`, `backend/`, `frontend/`, `ui-lab/` |
| `docs/` | `EN/`, `TR/` canonical docs; `Plan/` and pitch documents are historical/marketing context |

Full tree: [docs/EN/REPOSITORY_TREE.md](./docs/EN/REPOSITORY_TREE.md) · [docs/TR/REPOSITORY_TREE.md](./docs/TR/REPOSITORY_TREE.md)

---

## 📖 Documentation
- Canonical Architecture:
  - [docs/EN/ARCHITECTURE.md](./docs/EN/ARCHITECTURE.md)
  - [docs/TR/ARCHITECTURE.md](./docs/TR/ARCHITECTURE.md)
  - [docs/EN/ARCHITECTURE_INCENTIVES.md](./docs/EN/ARCHITECTURE_INCENTIVES.md)
  - [docs/TR/ARCHITECTURE_INCENTIVES.md](./docs/TR/ARCHITECTURE_INCENTIVES.md)
- API Reference:
  - [docs/EN/API.md](./docs/EN/API.md)
  - [docs/TR/API.md](./docs/TR/API.md)
- Game Theory:
  - [docs/EN/GAME_THEORY.md](./docs/EN/GAME_THEORY.md)
  - [docs/TR/GAME_THEORY.md](./docs/TR/GAME_THEORY.md)
- Governance:
  - [docs/EN/GOVERNANCE_READINESS.md](./docs/EN/GOVERNANCE_READINESS.md)
  - [docs/TR/GOVERNANCE_READINESS.md](./docs/TR/GOVERNANCE_READINESS.md)
- Gas baseline: [docs/GAS_BASELINE.md](./docs/GAS_BASELINE.md)
- Terminology audit: [docs/EN/V3_TERMINOLOGY_AUDIT.md](./docs/EN/V3_TERMINOLOGY_AUDIT.md) · [docs/TR/V3_TERMINOLOGY_AUDIT.md](./docs/TR/V3_TERMINOLOGY_AUDIT.md)
- PII encryption migration: [docs/EN/PII_ENCRYPTION_MIGRATION.md](./docs/EN/PII_ENCRYPTION_MIGRATION.md) · [docs/TR/PII_ENCRYPTION_MIGRATION.md](./docs/TR/PII_ENCRYPTION_MIGRATION.md)
- Backlog: [docs/EN/BACKLOG.md](./docs/EN/BACKLOG.md) · [docs/TR/YAPILACAKLAR.md](./docs/TR/YAPILACAKLAR.md)

---
*Araf Protocol — “The system does not judge. It makes dishonesty expensive.”*
