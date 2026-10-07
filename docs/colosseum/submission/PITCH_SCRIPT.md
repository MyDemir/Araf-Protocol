# Pitch Video Script (max 2:00)

> **Rules this script follows** (from `docs/colosseum/SUBMISSION-GUIDE.md`): max 2 minutes,
> structure Problem → Solution → Demo → Team, hook in the first 10 seconds, founder's own
> voice and face (no voiceover artist), no teleprompter feel, business model stays in the form.
> Upload to YouTube or Loom, set to public / unlisted-with-link, and test it from a logged-out browser.
>
> **Length budget: at most 270 spoken words once the placeholders are filled** (~1:45-1:52 at
> 140-150 words per minute). Measured with `wc -w`:
> - fixed text, placeholders removed: **206 words**
> - word budget given inside the placeholders: **55 words** (each `[[TODO]]` says its max)
> - total if every budget is used: **261 words**
>
> Measure again after filling (run from `docs/colosseum/submission/`):
> `sed -n '/^## 0:00/,$p' PITCH_SCRIPT.md | grep '^> ' | sed 's/^> //' | wc -w`
> (before filling, add `| sed 's/\[\[TODO[^]]*\]\]//g'` before `wc -w` to get the fixed count).
> If the filled text is over 270 words, cut from Solution first, never from the hook. Then read it
> aloud once with a stopwatch.
>
> **Demo segment:** record it only after the Base Sepolia deploy is done (TODO.md section 1).
>
> **Honesty rule:** we say "testnet". No user, volume or revenue number is spoken unless it is
> real and filled in from TODO.md.

---

## 0:00-0:10 · Hook (problem + solution in one breath)

**On screen:** Founder on camera, face and shoulders. Lower-third: "Araf Protocol · escrow for stablecoin ↔ bank transfer trades".

> You sell a thousand USDT for a bank transfer. The buyer says "I paid". Your bank shows nothing. Today, a moderator you have never met decides who keeps the money. Araf removes that moderator.

## 0:10-0:30 · Problem

**On screen:** Simple slide, takeaway as title: "A contract can't see a bank account." Two icons: a wallet and a bank, a question mark between them. Then a second slide: "So every P2P platform needs a human judge."

> Many people in Türkiye move between bank and stablecoins through person-to-person trades. [[TODO: one real fact or a quote from someone you talked to, max 15 words]]. A contract can lock tokens but cannot see a bank account, so every platform needs a human dispute desk.

## 0:30-1:00 · Solution

**On screen:** Animated timeline, one line, left to right: "Lock → Paid → 48h grace → deposits shrink by the hour → tokens shrink → day 10: rest goes to treasury". Exits branch off the line: "Release", "Cancel together", "Agree a split".

> Araf is an escrow on Base that doesn't decide who is right. It makes being wrong expensive. If the seller disputes, both sides get forty-eight hours. Then both deposits shrink every hour, later the tokens too, and at day ten the rest goes to the treasury. So the cheap move is to release, cancel, or agree a split.

## 1:00-1:30 · Demo

**On screen:** Screen recording of the live app on Base Sepolia (cut from the demo video, see DEMO_SCRIPT.md). Seller creates a sell order → second browser takes it → trade room shows LOCKED → buyer reports payment with receipt → seller clicks Release → BaseScan tab showing the release transaction. Small corner label: "Base Sepolia testnet".

> Here it is, live on Base Sepolia testnet. I post a sell order for one hundred test USDC. A second wallet takes it, and the trade locks on-chain. The buyer sees my bank details, uploads a receipt and reports payment. I release, and the tokens land in the buyer's wallet. Every step is a transaction on BaseScan.

## 1:30-1:48 · Team

**On screen:** Founder back on camera. Lower-third with name, role and one credential. If there are teammates, a 2-second photo grid with names.

> I'm [[TODO: name, max 3 words]]. [[TODO: why you, e.g. your own P2P trading or fintech experience, max 15 words]]. [[TODO: teammates, or "I'm building this solo and looking for a growth co-founder.", max 12 words]]

## 1:48-2:00 · Traction and next

**On screen:** One slide, takeaway as title, max 40 words: real numbers only (from TODO.md) and the next step. Close on the logo + "Trust the time, not the oracle."

> Today: [[TODO: honest numbers, e.g. "live on testnet, N test trades so far", max 10 words]]. Next: real traders on testnet, then mainnet once our readiness checklist is done. Araf: trust the time, not the oracle.

---

## Filming notes

- Record in one room with a window light in front of you, phone or webcam at eye level, external mic or earphones mic close to the mouth.
- Do not read from the screen. Learn the hook word for word; speak the rest from the bullet structure above.
- Speak the numbers exactly as in the contract: 48 hours grace, decay by the hour, day 10 burn. Do not say "0.2% fee" (old pitch doc; the contract default is 0.15% per side) and do not say "mainnet ready".
- The demo segment can be a cut from the demo video, so you only record the live flow once.
- Watch the final cut once at 1x. If the hook is not clear by 0:10, re-record the hook.
