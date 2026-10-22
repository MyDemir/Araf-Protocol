# Backlog

## Deferred ping/reputation improvements (postponed by product-owner decision)

These were deliberately deferred after the K2(B) "ping lapses" rule. Each item: problem, proposal, abuse it closes.

1. **Tier 0 has zero bond.**
   Problem: With no bond at tier 0, freezing an order costs nothing.
   Proposal: Make the tier 0 bond > 0, or cap tier 0 amounts at about 50 USDT.
   Abuse closed: Free order freezing, fake receipts and blackmail.

2. **Tier promotion depends on trade count.**
   Problem: 200 trades of 20 USDT (about 6 USDT of cost) reach tier 4, where the bond is 1%, making large-amount blackmail cheap.
   Proposal: Tie the tier/amount limit to clean-release volume (for example order size <= 2x clean volume).
   Abuse closed: Inflating reputation with tiny trades, then blackmailing large amounts with a low bond.

3. **Partial settlement raises the success count; risk score resets cheaply.**
   Problem: A few cheap clean releases cut the risk score (8 points each); a partial settlement gives no points but still adds +1 to the success count for a qualifying trade (at least 20 USD). The `decayReputation` forgiveness now also waits the clean period (default 90 days) after the last negative event, not only after the ban ends; the clean-release path is not subject to that wait.
   Proposal: A dispute outcome must not earn reputation; the risk score must not drop until 30 days after the last negative event.
   Abuse closed: Farming reputation through disputes and quickly washing a bad history.

4. **A lapsed ping is free; penalties go to the treasury, not the victim.**
   Problem: A lapsed ping gives the maker a free +48h brake. An honest taker pays 2% of their own bond (at least the release fee) on autoRelease, and that cut goes to the treasury. Exception: the payment-window penalty now goes to the maker whose inventory was locked (K1-03, user decision).
   Proposal: A release after a lapsed ping must not count as clean; pay penalties to the victim; do not charge the honest taker the autoRelease penalty.
   Abuse closed: Pinging then going silent to stall the counterparty; penalizing the honest side.

5. **An honest maker must be online in both 24-hour windows.**
   Problem: An honest maker who misses the window that opens at hour 24 and closes at hour 48 loses their ping.
   Proposal: An optional "auto-challenge" flag, or MAKER_CHALLENGE_WINDOW of 48 hours.
   Abuse closed: Unintended loss of rights for honest makers who are offline (honest-user burden).

6. **In a dispute the liar risks only their own bond.**
   Problem: A maker who took the fiat and challenges, plus settlement blackmail, is the root issue; the liar risks only their own bond.
   Proposal: No root fix; mitigated by items 1-3.
   Abuse closed: Taking the fiat, then challenging to extort a settlement.

7. **Decision note: burned/decayed amounts go to the treasury.**
   Problem: The protocol earns revenue from disputes; whether this is intentional needs an explicit decision. Today burnExpired and the autoRelease cut go to the treasury; only the payment-window penalty goes to the maker (K1-03).
   Proposal: The product owner decides and documents it (alternative: pay the victim, see item 4).
   Abuse closed: The perception of a conflict of interest (a protocol that profits from disputes).

8. **Late settlement acceptance vs. burnExpired at hour 240.**
   Problem: At 240h anyone can call burnExpired; a settlement acceptance arriving at the last moment can lose the race.
   Proposal: Add a short guard/grace period before burnExpired, or define priority for a pending acceptance.
   Abuse closed: Triggering the burn right before an acceptance to break a settlement.

9. **Profile lock reads the Trade mirror.**
   Problem: In the short window between the on-chain lock and the mirror write, the profile can still be written. The worker now takes the snapshot only when both profiles are provably unchanged since before the lock (with a safety margin); otherwise it skips the snapshot and marks it missing (B1-01). Remaining risk is low.
   Proposal: Also check the on-chain trade state in the lock check, or close the mirroring delay.
   Abuse closed: Changing the payment profile at lock time to influence the snapshot.
