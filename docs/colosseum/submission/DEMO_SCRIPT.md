# Demo Video Script (max 3:00, Base Sepolia testnet)

> **What this video is for** (from `docs/colosseum/SUBMISSION-GUIDE.md`): the technical "how".
> The live product working, with a real wallet connection and real transactions. Not slides,
> not a code walkthrough, not a second pitch. Separate upload from the pitch video.
>
> **Network:** everything runs on **Base Sepolia testnet** (chainId 84532). Explorer:
> **https://sepolia.basescan.org**. Say "testnet" out loud once at the start; never call it mainnet.
>
> **Flow shown:** seller posts a sell order → buyer takes it (trade locks on-chain) → buyer pays
> off-chain, uploads a receipt, reports payment → seller releases → we open each transaction on
> BaseScan. Then a short look at the dispute timers. This is exactly the happy path the contract
> implements (`createSellOrder` → `fillSellOrder` → `reportPayment` → `releaseFunds`).
>
> Exact button labels: `[[TODO: confirm every label during the rehearsal; the names below come from the frontend copy files but were not clicked through on a deployed build]]`.

---

## Part A · Prep checklist (do this before recording)

### A1. Hard timing constraint: register the buyer wallet NOW

The contract refuses a buyer (taker) whose wallet was registered less than **2 days** ago
(`WALLET_AGE_MIN = 2 days`, `_enforceTakerEntry` reverts `WalletTooYoung`). Today is 7 Oct, the
deadline is 12 Oct 23:59 PT, and the guide says submit 2 days early. So:

- [ ] Deploy the contracts on Base Sepolia **today** (A2).
- [ ] Right after deploy, call `registerWallet()` from **every wallet that will act as a buyer**
      (the app's status bar has a "Register" button; or call it from BaseScan "Write Contract").
      Registered 7 Oct → can take orders from 9 Oct.
- [ ] Register 2 buyer wallets, not 1: Tier 0 has a **4-hour cooldown** between fills for the same
      taker (`DEFAULT_TIER0_TRADE_COOLDOWN`). One wallet for the rehearsal, one for the final take
      (or wait 4h between takes).
- [ ] Each buyer wallet must hold at least **0.001 ETH** on Base Sepolia when it takes an order
      (`DUST_LIMIT`, else `InsufficientNativeBalance`).

### A2. Deploy (Base Sepolia)

Follow `docs/EN/DEPLOYMENT_GUIDE.md` section 3. Short version:

- [ ] `contracts/.env`: `DEPLOYER_PRIVATE_KEY` (testnet-only key), `TREASURY_ADDRESS`,
      `FINAL_OWNER_ADDRESS` (must differ from treasury), `BASE_SEPOLIA_RPC_URL`,
      `BASE_SEPOLIA_USDT_ADDRESS`, `BASE_SEPOLIA_USDC_ADDRESS`, `BASESCAN_API_KEY`, `CONFIRM_PUBLIC_DEPLOY=yes`.
- [ ] **Test tokens decision** `[[TODO: decide]]`: `deploy.js` never deploys mock tokens on a public
      chain, so you must pass two existing token addresses. Option 1: deploy `MockERC20` ("Mock USDT"
      and "Mock USDC", 6 decimals) to Base Sepolia yourself; anyone can then call `mint()` for 1000
      tokens per hour, which also powers the in-app faucet button (non-production builds only).
      Option 2: use an existing Base Sepolia test USDC (for example Circle's testnet USDC from its
      faucet) `[[TODO: verify address]]`; then you still need a second token for the USDT slot.
- [ ] `npx hardhat run scripts/deploy.js --network base-sepolia`, then verify the two libraries and
      the escrow on BaseScan (guide section 3, step 2), so the "Contract" tab shows source code.
- [ ] Write down: escrow `[[TODO: Base Sepolia escrow address]]`, ArafReputationLib
      `[[TODO: address]]`, ArafSettlementLib `[[TODO: address]]`, test USDT `[[TODO: address]]`,
      test USDC `[[TODO: address]]`, deploy block `[[TODO: block number]]`, treasury `[[TODO: address]]`.
- [ ] Backend on Fly.io with `EXPECTED_CHAIN_ID=84532`, the addresses above and `ARAF_DEPLOYMENT_BLOCK`.
      Note: production mode needs AWS KMS or Vault for encryption (`KMS_PROVIDER=env` is refused),
      plus MongoDB and Redis (`rediss://`). `[[TODO: backend URL]]`, check `/health` and `/ready`.
- [ ] Frontend with `VITE_ESCROW_ADDRESS`, `VITE_USDT_ADDRESS`, `VITE_USDC_ADDRESS`. `[[TODO: frontend URL]]`.
- [ ] **Blocker to solve first:** a production build of the frontend only allows Base **mainnet**
      (`frontend/src/app/chainPolicy.js`: `isProd ? [8453] : [...]`; the deployment guide says the same).
      A hosted Base Sepolia frontend needs either a non-production build or a code change.
      `[[TODO: decide and fix before recording; this is a code change outside these docs]]`
- [ ] SIWE: `SIWE_DOMAIN` / `SIWE_URI` / `ALLOWED_ORIGINS` must match the real frontend domain.

### A3. Wallets and balances

| Role | Wallet | Needs |
|---|---|---|
| Seller (maker) | Wallet A, browser profile 1 | ~0.01 Base Sepolia ETH for gas, ≥ 100 test USDC, a saved payment profile |
| Buyer (taker) | Wallet B, browser profile 2 | registered ≥ 2 days before, ≥ 0.001 ETH (keep ~0.01 for gas) |
| Rehearsal buyer | Wallet C | same as B |
| Optional dispute trade | Wallets D (seller) + E (buyer) | see Part C |

- [ ] Fresh test wallets only. Never use a wallet that holds real funds; never show a seed phrase.
- [ ] ETH from a Base Sepolia faucet (the deployment guide lists `faucet.quicknode.com`;
      `[[TODO: the faucet you actually used]]`).
- [ ] Two separate browser profiles (or Chrome + Brave), each with its own wallet extension,
      both set to Base Sepolia, both already signed in once (SIWE) so the take is smooth.
- [ ] Payment profile for wallet A: use **fake but valid-looking** test data (for example a
      made-up name and a test IBAN), never your real bank details on video.
- [ ] A receipt image to upload (a mock "transfer receipt" PNG with fake data).

### A4. Recording setup

- [ ] 1920×1080, browser zoom 110-125% so text reads on a laptop, hide bookmarks bar, close other tabs.
- [ ] Wallet popups visible in the recording (record the whole screen, not one tab).
- [ ] BaseScan tabs pre-opened: the escrow contract page (`https://sepolia.basescan.org/address/[[TODO: escrow address]]`).
- [ ] Do one full rehearsal with wallet C. Base Sepolia blocks are fast, but cut waiting time in the edit.
- [ ] Voiceover can be recorded live or added after; it is the founder's voice either way.

---

## Part B · The 3-minute script

Times are targets. Spoken text in `>` quotes.

### 0:00-0:15 · What you will see

**Screen:** App home page, wallet not connected. Corner label: "Base Sepolia testnet".

> This is Araf, running live on Base Sepolia testnet. In the next three minutes you'll see one complete trade between two wallets: a seller locks test USDC, a buyer pays by bank transfer, and the seller releases. Every step is a real on-chain transaction.

### 0:15-0:35 · Connect the seller

**Clicks (browser 1, wallet A):**
1. "Connect" → choose the wallet → approve connection. If the wallet is on another network, the app asks to switch to Base Sepolia → approve.
2. Sign the Sign-In with Ethereum message (no gas, it only proves wallet ownership to the backend).
3. Open the profile area: show the saved payment profile (test IBAN) for one second.

> I connect the seller's wallet and sign in. Signing proves I own the wallet; it costs no gas. My bank details are stored encrypted on our backend, and only my trade counterparty will see them.

### 0:35-1:05 · Post a sell order

**Clicks:**
1. Marketplace → "Create Order" → side: sell crypto, token: USDC, amount: **100**, tier: **0** (Tier 0 max is 150 tokens by default), fill the remaining fields the form asks for.
2. Confirm → wallet asks to **approve** the token → confirm. Wallet asks to confirm **createSellOrder** → confirm.
3. Order appears in the marketplace list.
4. Open the wallet activity → "View on block explorer" (or paste the tx hash) → BaseScan shows the transaction to the escrow contract and 100 USDC moving into it.

> I post a sell order for one hundred test USDC. The tokens leave my wallet and sit in the escrow contract, not with us. Here on BaseScan you can see the transfer into the contract.

### 1:05-1:35 · Buyer takes the order

**Clicks (browser 2, wallet B, registered 2+ days earlier and signed in):**
1. Marketplace → the new order → take / fill it for 100.
2. Wallet confirms **fillSellOrder** (at Tier 0 the buyer posts no deposit, so no approval is needed; if the wallet asks for one, confirm it).
3. App jumps to the Trade Room: state **"Locked, awaiting payment"**, the 48-hour payment window counting down, the seller's payment details shown to the buyer.
4. Quick BaseScan cut on the fill transaction.

> A second wallet, the buyer, takes the order. The trade is now locked on-chain. The buyer has forty-eight hours to pay and report it, and sees the seller's bank details, which only the two trade parties can open.

### 1:35-2:05 · Pay, report, release

**Clicks:**
1. Browser 2: "Pay, upload the receipt and report it": upload the mock receipt → report payment → wallet confirms **reportPayment**. State becomes **"Payment reported"**.
2. Browser 1 (seller): Trade Room shows "Payment was reported; review it now" → "Release Funds" → wallet confirms **releaseFunds**. State becomes released / resolved.
3. BaseScan on the release tx → "Token Transfers": **99.85 USDC to the buyer, 0.15 USDC to the treasury** (default fee 0.15% from the buyer's side; at Tier 0 the seller has no deposit, so no seller fee is taken).

> The buyer pays outside the chain, uploads the receipt, which is stored encrypted, and reports payment on-chain. On the seller's side the trade says payment reported. I check my bank, and release. On BaseScan: ninety-nine eighty-five goes to the buyer, fifteen cents of fee to the treasury. No one else touched the money.

(Check the exact amounts on your rehearsal transaction and say what BaseScan shows.)

### 2:05-2:40 · What if the seller disputes?

Pick **one** version, depending on what you prepared (see Part C).

**Version 1 (pre-staged challenged trade exists):** open the Trade Room of that trade: state "Challenge phase", the 48h grace countdown, the settlement proposal card. Optionally propose a split (for example 50/50) from one side → **proposeSettlement** tx.

> If the seller says the money never came, they can't just freeze the trade. They have to warn the buyer first, then open a challenge in a fixed window. After forty-eight hours of grace, both deposits start to shrink every hour, and later the tokens too. Either side can propose a split on-chain, and the other can accept it.

**Version 2 (no pre-staged trade):** BaseScan → escrow contract → "Read Contract": show `GRACE_PERIOD` (172800 s = 48h), `PAYMENT_WINDOW` (48h), `USDT_DECAY_START` (96h of bleeding), `MAX_BLEEDING` (864000 s = 10 days). These are constants; the owner cannot change them.

> If the seller disputes, these rules take over, and they are constants in the contract: forty-eight hours of grace, then both deposits shrink every hour, the locked tokens follow after ninety-six more hours, and at day ten whatever is left goes to the treasury. No admin can change them or pick a winner. The owner can set fees, pause new orders and choose the treasury address, but cannot move escrowed funds.

### 2:40-3:00 · How it fits together

**Screen:** BaseScan escrow page, "Contract" tab with the green verified check, then back to the app.

> All funds and every state change live in this one verified contract on Base. Our backend only mirrors events and keeps bank details and receipts encrypted; it cannot move escrowed funds, and neither can the contract owner, who only sets fees, pause and the treasury address. The code is open at [[TODO: repo URL or "on GitHub"]]. That's Araf: trust the time, not the oracle.

---

## Part C · Optional: pre-staging a challenged trade (Version 1 above)

Only possible if the deploy happens today. Earliest timeline (all times are minimums from the contract):

| Step | Who | Earliest | Rule in code |
|---|---|---|---|
| Register buyer E | E | 7 Oct, right after deploy | `registerWallet` |
| E takes D's order, pays, reports | E | 9 Oct (2 days later) | `WALLET_AGE_MIN` |
| D sends a challenge ping | D | report + 24h (10 Oct) | `pingTakerForChallenge` |
| D opens the challenge | D | ping + 24h, and before ping + 48h (11 Oct) | `challengeTrade`, `MAKER_CHALLENGE_WINDOW` |
| Grace period runs, settlement allowed | D, E | 11-13 Oct | `GRACE_PERIOD`; settlement only in CHALLENGED |

So the challenged trade is filmable from about 11 Oct, which is tight against "submit 2 days early".
If any step slips, use Version 2. Use a trade size inside the Tier 0 limit (150 tokens by default).

---

## Part D · After recording

- [ ] Total length ≤ 3:00. Cut wallet loading and block waits.
- [ ] Upload to YouTube (unlisted is fine if the link is shared) or Loom; test the link logged out.
- [ ] Put the tx hashes shown in the video into the description: `[[TODO: tx hashes]]`.
- [ ] Use the 1:05-2:05 part as the "Demo" cut in the pitch video.
