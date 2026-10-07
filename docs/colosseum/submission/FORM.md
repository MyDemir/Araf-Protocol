# Colosseum Submission Form: Draft Answers (Araf Protocol)

> Field names and limits come from `docs/colosseum/llms-full.txt` lines 588-650
> (section "07. What Colosseum's form actually asks"). Paste each `text` block as is.
>
> **Character counts** were measured with `wc -m` on the block content (no trailing
> newline). Counts **include** the `[[TODO: ...]]` placeholders. After you fill a
> placeholder, measure again: `printf '%s' "<answer>" | wc -m`.
>
> Positioning rule: **nothing is deployed yet**. Every "live / deployed on Base Sepolia" phrase is a
> conditional `[[TODO: ...]]`: replace it only after the deploy in TODO.md section 1 is done and
> you can open the contract on sepolia.basescan.org. Until then the honest wording is
> "built for Base". No mainnet claim. Mainnet is mentioned only as
> "next", and only as far as `docs/TR/MAINNET_READINESS_CHECKLIST.md` goes.
>
> Everything not found in the code or docs is a `[[TODO: ...]]` and is listed in `TODO.md`.

---

## Tier 1: Public page (anyone with the link sees these)

### Project name

```text
Araf Protocol
```

**Characters:** 13/no limit

### Brief description

Limit: 500. The guide says the one-liner belongs here unchanged. Three candidates:

| # | One-liner | Note |
|---|---|---|
| A (recommended) | Escrow for trading stablecoins against bank transfers, with no moderator: if a dispute drags on, both sides' deposits slowly burn. | Says who/what/how in one breath; a stranger gets the twist without follow-up. |
| B | Peer-to-peer stablecoin-for-bank-transfer escrow that settles disputes with time, not moderators. | Shortest, closest to the README tagline; "settles with time" needs a follow-up question. |
| C | Arbitrator-free escrow for buying and selling USDT and USDC by bank transfer. | Very concrete, but hides the mechanism, which is the unique insight. |

Recommended field text (one-liner A plus one sentence of status):

```text
Escrow for trading stablecoins against bank transfers, with no moderator: if a dispute drags on, both sides' deposits slowly burn. [[TODO: after the Base Sepolia deploy, add: "Live on Base Sepolia testnet."]]
```

**Characters:** 208/500

### Project website (optional)

```text
[[TODO: live frontend URL on Base Sepolia, e.g. the Vercel domain, verified to open from outside]]
```

**Characters:** 98/no limit

### Product category

```text
[[TODO: pick the closest option in the form's dropdown (candidates: DeFi / Payments)]]
```

**Characters:** 86/no limit

### Team primary location

```text
Türkiye
```

**Characters:** 7/no limit

(Required for the Superteam Türkiye pool. See TODO.md for why that pool may not apply to a Base project.)

### Logo / graphic

JPEG, PNG, WEBP or GIF, max 20 MB. `[[TODO: logo file]]` (no logo file found in the repo).

### GitHub link

```text
https://github.com/MyDemir/Araf-Protokol
```

**Characters:** 40/no limit

(URL taken from `frontend/.env.example` `VITE_SOCIAL_GITHUB`. If the repo is private, share it with `hackathon@colosseum.com` and test from an outside account.)

### Pitch video

```text
[[TODO: YouTube or Loom link to the pitch video, max 2 minutes, see PITCH_SCRIPT.md]]
```

**Characters:** 85/no limit

### X profile

```text
[[TODO: verified X profile URL]]
```

**Characters:** 32/no limit

---

## Tier 2: Shared with team, judges and Colosseum

### What are you building, and who is it for?

```text
Araf is an escrow for peer-to-peer trades between stablecoins (USDT/USDC) and bank transfers (IBAN, SEPA, ACH). A seller locks tokens in our contract on Base. A buyer takes the order, pays by bank transfer, uploads a receipt and reports payment. The seller releases the tokens.

Today, when such a trade goes wrong, a platform moderator decides who is right. Araf has no moderator. If the seller says the money never came, both sides get 48 hours to settle. After that their deposits start to shrink every hour, and later the locked tokens too. At day 10, what is left goes to the treasury. Lying or stalling costs the liar as well, so the cheap move is to release, cancel together, or agree on a split on-chain.

It is for people who move money between a bank account and stablecoins without trusting an exchange to hold it: [[TODO: first target user, e.g. a specific group in Türkiye]].
```

**Characters:** 888/1000

### Why did you decide to build this, and why build it now?

```text
[[TODO: founder's own story in 2-3 sentences: when you or people around you traded P2P, what went wrong, why you are the one to fix it]]

Why now: stablecoins have become a normal way to hold and send dollars, and the way in and out is still often a person-to-person bank transfer. A contract cannot see a bank account, so every P2P platform falls back on a human judge, and with it on slow, costly and trust-heavy dispute desks. Our insight is that the contract does not need to know who is right. It only needs to make being wrong expensive. Cheap transactions on Base make a per-trade escrow with time-based rules practical for small trades.
```

**Characters:** 644/1000

### What technologies are you using or integrating with?

(No limit given in the guide. Includes AI tools, as Colosseum asks.)

```text
Contracts: Solidity 0.8.24, OpenZeppelin (ReentrancyGuard, Ownable, Pausable, SafeERC20), Hardhat; escrow logic split into ArafEscrow plus two linked libraries (ArafReputationLib, ArafSettlementLib), and ArafRevenueVault + ArafRewards for revenue and rewards. Chain: Base (built for Base; Base Sepolia deployment [[TODO: date]]).
Frontend: React 18, Vite, wagmi + viem, TanStack Query, Tailwind CSS.
Backend: Node.js, Express, MongoDB (Mongoose), Redis, Sign-In with Ethereum (SIWE) + JWT, ethers v6 event worker that mirrors on-chain events, AES-256-GCM envelope encryption (HKDF-derived keys, optional AWS KMS) for bank details and receipts.
Testing: Hardhat/Mocha, Jest, Vitest.
Hosting: [[TODO: confirm, config exists for Fly.io (backend) and Vercel (frontend)]].
AI tools: Claude Code (AI coding agent) was used heavily for implementation, tests and docs since late September 2026, under the founder's direction and review. [[TODO: list any other AI tools]]
```

**Characters:** 962/no limit

### Which chains does your product use?

```text
Base [[TODO: after deploy, add "(deployed on Base Sepolia testnet)"]]
```

**Characters:** 69/no limit

### How does your product use these chains?

```text
The escrow contract on Base holds the seller's tokens and both deposits, and is the only place a trade's state changes: lock, payment reported, release, cancel, challenge, split, burn. Time rules (payment window, 48h grace, hourly decay, 10-day burn) and reputation tiers are enforced on-chain. The owner can set fees, pause and the treasury address, but no server or admin can move escrowed funds or pick a winner. Without a chain, someone would have to hold the money and judge disputes.
```

**Characters:** 489/500

### Is your project a mobile-focused dApp?

```text
No
```

**Characters:** 2/no limit

(The web app has a mobile navigation layout, but it is a responsive web dApp, not a mobile app. `[[TODO: confirm]]`)

### Team Telegram contact

```text
[[TODO: @handle of the person who checks Telegram daily]]
```

**Characters:** 57/no limit

### Did anyone not listed on the team do meaningful work on this project?

```text
[[TODO: confirm: no other person]] No other person did meaningful work. Code was written by [[TODO: founder name]] with heavy use of an AI coding agent (Claude Code): most commits since 28 Sep 2026 were made by the agent under the founder's direction and review. We build on open-source libraries (OpenZeppelin, wagmi, viem, Express, Mongoose and others) under their licenses.
```

**Characters:** 376/600

### Anything else judges should know that isn't captured above?

This is where prior work is disclosed (mandatory; hiding it means disqualification, disclosing costs nothing). Git facts used: first commit 2 May 2026, adding 240 files and about 77k lines in one go; 59 non-merge commits before 14 Sep 2026 (last on 10 Aug); 137 non-merge commits from 28 Sep 2026 onward (132 by Claude Code, 5 by the founder). Commands: `git rev-list --count --no-merges --until=2026-09-14 HEAD`, `git rev-list --count --no-merges --since=2026-09-28 HEAD`. Re-measure right before submitting.

```text
Prior work disclosure: Araf existed before the hackathon. Our repo's first commit (2 May 2026) imported the full contracts, backend and frontend from earlier work [[TODO: real start date]]; 59 commits predate 14 Sep. In the window (137 commits from 28 Sep) we hardened the escrow (payment window, lapsing challenge ping, cancel revoke), split it into libraries and added a payout-profile gate. [[TODO: deployed to Base Sepolia on date]] Not externally audited.
```

**Characters:** 460/500

### Demo video

```text
[[TODO: YouTube or Loom link to the demo video, max 3 minutes, see DEMO_SCRIPT.md]]
```

**Characters:** 83/no limit

### Live product link and access instructions

```text
[[TODO: live frontend URL]]
[[TODO: use this block only after the deploy is live]] Runs on Base Sepolia testnet (no real money). 1) Add Base Sepolia to your wallet and get test ETH from a faucet: [[TODO: faucet link you tested]]. 2) Connect your wallet and sign in (SIWE message, no gas). 3) Get test tokens: [[TODO: in-app faucet button or token address + how to get it]]. Note: to take an order as a buyer, a wallet must be registered on-chain at least 2 days earlier (anti-sybil rule); judges can use the seller side right away. [[TODO: optional pre-aged judge test wallet]]
```

**Characters:** 577/no limit

---

## Tier 3: Accelerator screen (private, required even if you don't want the accelerator)

### How do you know people actually need, or will need, this product?

```text
[[TODO: real evidence only: number of people you talked to, who they are, 1-2 short quotes, any waitlist or test-user count]]

What we know from the problem itself: a smart contract cannot check a bank transfer, so every P2P platform that moves stablecoins against bank payments relies on a human dispute desk, and the user has to trust that desk with both the money and the verdict. [[TODO: one sourced fact about P2P volume or dispute pain in your target market]]
```

**Characters:** 465/1000

### How far along are you? Do you have users?

```text
Built: the full escrow on Base: sell and buy orders, partial fills, a 48h payment window, release, mutual cancel, a ping-then-challenge dispute path, time-based decay, on-chain split settlement, a 10-day burn, and an on-chain reputation system with tiered limits. Around it: a web app (wallet sign-in, order book, trade room, encrypted bank details and receipts), a backend that mirrors chain events, and contract, backend and frontend test suites.

Deployment: [[TODO: after deploy: "Live on Base Sepolia testnet since <date>, escrow at <address>, app at <URL>." Until then: "Base Sepolia deployment in progress."]]

Users: [[TODO: honest number, e.g. "no external users yet" or "N test trades by M wallets"]].

Not yet: mainnet, external audit, revenue.
```

**Characters:** 755/1000

### Who else is building in this space, and what do you think they're getting wrong?

```text
Centralized P2P desks (for example Binance P2P) hold the escrow and send disputes to their own moderators. That works at scale but is slow, opaque, and depends on trusting the platform.

Non-custodial P2P projects such as Bisq, Hodl Hodl and RoboSats remove custody but still keep a human mediator, arbitrator or coordinator for disputes. [[TODO: verify these descriptions]]

Projects that prove a payment cryptographically (for example zkp2p) avoid a judge, but only for payment providers whose data they can prove. [[TODO: verify]]

What we think they get wrong: they try to find out who is right. Araf does not. It makes the dispute itself costly for both sides, so honest settlement becomes the cheapest move, and it works with any bank rail.
```

**Characters:** 746/1000

### How do you make money, or how do you plan to?

```text
Each completed trade pays a protocol fee, by default 0.15% from each side (owner-adjustable, capped on-chain at 20% per side and frozen per trade at creation). Penalties on auto-release and payment-window expiry, and funds that decay in unresolved disputes, also go to the treasury. A revenue vault sends 40-70% of revenue to Proof of Peace rewards for traders who close cleanly; the rest funds the protocol. No revenue yet (testnet).
```

**Characters:** 434/500

### How long have you each been working on this? Have you been working on it full time?

```text
[[TODO: per person: since when, full-time or part-time]]. Facts from the repo: the earliest pitch document is dated March 2026, the first commit is 2 May 2026, and active development resumed on 28 Sep 2026 with 137 commits since.
```

**Characters:** 229/500

### Where is each team member currently based, and do you work in person together?

```text
[[TODO: per person: city, country (Türkiye); in person or remote; would this change after funding?]]
```

**Characters:** 100/500

### Yes/No questions

| Question | Answer | Source |
|---|---|---|
| Have you formed a legal entity? | `[[TODO: Yes/No]]` | not in repo |
| Have you taken any investment? | `[[TODO: Yes/No]]` | not in repo (note: competition is for teams without significant outside capital) |
| Are you currently fundraising? | `[[TODO: Yes/No]]` | `docs/FUNDRAISING_STRATEGY.md` lists targets, but says nothing about an active raise |
| Do you have a live token? | No | no token contract in `contracts/src`; the protocol uses existing USDT/USDC. `[[TODO: confirm]]` |
