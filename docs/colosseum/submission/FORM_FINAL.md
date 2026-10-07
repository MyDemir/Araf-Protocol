# Colosseum Form: Final Answers (Araf Protocol)

> Paste each ```text block as is. Counts were measured with `printf '%s' "..." | wc -m`.
> Honesty rule used everywhere: nothing is deployed yet (no deployment record in the repo), so the
> text says "built for Base, Base Sepolia testnet deployment in progress". No mainnet, audit or
> user claim. After you deploy, see the checklist at the bottom for the lines to upgrade.
> Source of drafts: `FORM.md` and `TODO.md` in this folder, the docs listed in the checklist, and git history.

---

## 1. Project name

```text
Araf Protocol
```

Characters: 13/no limit

## 2. Brief description (max 500)

```text
Escrow for trading stablecoins against bank transfers, with no moderator: if a dispute drags on, both sides' deposits slowly burn. Built for Base; Base Sepolia testnet deployment in progress. Testnet only, no real funds, not audited.
```

Characters: 233/500

## 3. Project website

```text
https://github.com/MyDemir/Araf-Protokol
```

Characters: 40/no limit

(Repo URL, taken from `frontend/.env.example`. The planned frontend domain in `docs/DEPLOY_BASE_SEPOLIA.md` is `araf-demo.vercel.app` (an example value for the `FRONTEND_DOMAIN` variable). Replace the line above with `https://araf-demo.vercel.app` only after the deploy is done and you verified from a logged-out browser that it opens. If the repo is private, share it with hackathon@colosseum.com.)

## 4. What are you building, and who is it for? (max 1000)

```text
Araf is an escrow for peer-to-peer trades between stablecoins (USDT/USDC) and bank transfers (IBAN, SEPA, ACH). A seller locks tokens in our contract on Base. A buyer takes the order, pays by bank transfer, uploads a receipt and reports payment. The seller releases the tokens.

Today, when such a trade goes wrong, a platform moderator decides who is right. Araf has no moderator. If the seller says the money never came, both sides get 48 hours to settle. After that their deposits shrink every hour, and later the locked tokens too. At day 10, what is left goes to the treasury. Lying or stalling costs the liar as well, so the cheap move is to release, cancel together, or agree on a split on-chain.

It is for people in Türkiye and similar markets who move money between a bank account and stablecoins through person-to-person trades, and do not want an exchange's dispute desk holding both the money and the verdict.
```

Characters: 922/1000

## 5. Why did you decide to build this, and why build it now? (max 1000)

```text
The problem is concrete. In markets like Türkiye, many people move between bank accounts and stablecoins through person-to-person trades. A smart contract cannot see a bank account, so every P2P platform falls back on a human dispute desk. When a seller says "the money never arrived" and the buyer says "I paid", a moderator they have never met decides, slowly, and the user must trust that desk with both the money and the verdict.

We started from one question: can the contract skip finding out who is right, and simply make being wrong expensive? That became Araf. Time does the work. After a 48-hour grace period, both deposits shrink hourly, later the tokens too, and at day 10 the rest goes to the treasury. Honest settlement becomes the cheapest move.

Why now: stablecoins are a normal way to hold dollars, the way in and out is still often a bank transfer, and Base makes a per-trade escrow with time-based rules cheap enough for small trades.
```

Characters: 954/1000

## 6. What technologies are you using or integrating with?

```text
Contracts: Solidity 0.8.24, OpenZeppelin (ReentrancyGuard, Ownable, Pausable, SafeERC20), Hardhat. Escrow logic is split into ArafEscrow plus two linked libraries (ArafReputationLib, ArafSettlementLib); ArafRevenueVault and ArafRewards handle revenue and rewards.
Chain: Base (built for Base and Base Sepolia; testnet deployment in progress).
Frontend: React 18, Vite, wagmi + viem, TanStack Query, Tailwind CSS.
Backend: Node.js, Express, MongoDB (Mongoose), Redis, Sign-In with Ethereum (SIWE) + JWT, an ethers v6 event worker that mirrors on-chain events, AES-256-GCM envelope encryption (HKDF-derived keys, optional AWS KMS) for bank details and receipts.
Testing: Hardhat/Mocha, Jest, Vitest.
Deployment tooling: GitHub Actions, Fly.io (backend), Vercel (frontend), Alchemy RPC.
AI tools: Claude Code (AI coding agent by Anthropic) was used heavily for implementation, tests and docs, under the founder's direction and review.
```

Characters: 931/no limit

## 7. Which chains does your product use?

```text
Base
```

Characters: 4/no limit

## 8. How does your product use these chains? (max 500)

```text
The escrow contract on Base holds the seller's tokens and both deposits, and is the only place a trade's state changes: lock, payment reported, release, cancel, challenge, split, burn. Time rules (payment window, 48h grace, hourly decay, 10-day burn) and reputation tiers are enforced on-chain. The owner can set fees, pause and the treasury address, but no server or admin can move escrowed funds or pick a winner. Without a chain, someone would have to hold the money and judge disputes.
```

Characters: 489/500

## 9. What category best describes your product?

```text
DeFi
```

Characters: 4/no limit

Reason (one sentence, not for the form): it is an on-chain escrow and settlement protocol; the bank transfer is only the off-chain leg of the trade. Second choice if "DeFi" is missing: Payments.

## 10. Is your project a mobile-focused dApp?

```text
No
```

Characters: 2/no limit

(Responsive web dApp, not a mobile app.)

## 11. Where is your team primarily based?

```text
Türkiye
```

Characters: 7/no limit

## 12. Country you currently reside in

```text
Türkiye
```

Characters: 7/no limit

(Based on the repo's Turkey-focused documents and the Superteam Türkiye guide; confirm it is really where you live.)

## 13. Team Telegram contact

⚠ DOLDUR: the Telegram @handle of the person who checks Telegram every day. The repo has none (the only handle in the docs, @trench_survivor, is Superteam's contact, not yours).

## 14. Notes for judges: Did anyone not listed on the team do meaningful work? (max 600)

```text
No one outside the listed team did meaningful work. The code was written by the founder together with an AI coding agent (Claude Code): most commits since 28 Sep 2026 were made by the agent under the founder's direction and review. We build on open-source libraries (OpenZeppelin, wagmi, viem, Express, Mongoose and others) under their licenses.
```

Characters: 345/600

## 15. Anything else judges should know? (max 500)

```text
Prior work disclosure: Araf existed before the hackathon. The repo's first commit (2 May 2026) imported complete contracts, backend and frontend from earlier work; about 55 commits predate 14 Sep, and the earliest pitch document is dated March 2026. In the hackathon window (from 28 Sep, 160+ commits, mostly by Claude Code) we hardened the escrow (payment window, lapsing challenge ping, cancel revoke), split it into libraries and added a payout-profile gate. Testnet only, not externally audited.
```

Characters: 499/500

---

## Göndermeden önce kontrol et

1. Telegram kullanıcı adı (alan 13) boş; kendi @handle'ını yaz.
2. Ülke ve konum "Türkiye" belgelerden çıkarıldı; gerçekten orada yaşıyorsan bırak.
3. Kurucu adı, "neden sen" hikâyen ve takım arkadaşı var mı: formda isim alanı varsa doldur. "Why" alanı kişisel anekdot içermiyor (belgede yok); kendi hikâyen varsa ilk paragrafı değiştir.
4. Beyan (alan 15): git'te ilk commit 2 Mayıs 2026, 14 Eylül öncesi ~55, 28 Eylül sonrası 163 merge olmayan commit (154 Claude, 9 MyD). Eski taslaktaki 59/137 farklıydı; göndermeden önce `git rev-list --count --no-merges --until=2026-09-14 HEAD` ve `--since=2026-09-28` ile yeniden ölç. Proje daha önce başka yarışmaya gittiyse beyana ekle.
5. Deploy: bugün kayıtlı bir Base Sepolia deploy'u yok. Deploy edip BaseScan'de doğruladıktan sonra alan 2, 3, 6'daki "deployment in progress" ifadelerini "Live on Base Sepolia testnet" olarak değiştir; Website'a araf-demo.vercel.app'i yalnız dışarıdan açıldığını görünce koy.
6. Alan 6'daki barındırma satırı (Fly.io, Vercel, Alchemy, GitHub Actions) yapılandırma dosyalarından; gerçekten kullandığını teyit et. Başka AI aracı kullandıysan ekle.
7. Alan 14: git'te yalnız MyD ve Claude görünüyor; başka insan katkısı yoksa olduğu gibi bırak.
8. Kategori listesinde "DeFi" yoksa "Payments"ı seç; "mobile-focused" cevabı (No) teyit.
