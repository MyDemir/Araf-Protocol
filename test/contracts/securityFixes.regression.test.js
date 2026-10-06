const { expect } = require("chai");
const { ethers, artifacts } = require("hardhat");
const { time, loadFixture } = require("@nomicfoundation/hardhat-network-helpers");
const { deployEscrowWithLibraries } = require("../../contracts/scripts/deploy");
const { deployRevenueEscrow, pushRevenue } = require("./helpers/revenue");

// [TR] Denetimde doğrulanan bulguların (K1–K14) ve gaz değişikliklerinin (G1/G2) regresyon testleri.
// [EN] Regression tests for audited findings (K1–K14) and gas changes (G1/G2).
const U = (x) => ethers.parseUnits(String(x), 6);
const H = 3600;
const DAY = 24 * H;
let refN = 0;
const R = () => ethers.id("sec-fix-" + refN++);

const TradeState = { OPEN: 0n, LOCKED: 1n, PAID: 2n, CHALLENGED: 3n, RESOLVED: 4n, CANCELED: 5n, BURNED: 6n };
const Outcome = { DISPUTED_RELEASE: 5n, BURNED: 6n };

async function base() {
  const [owner, finalTreasury, maker, taker, helper, other, eoa, helper2] = await ethers.getSigners();
  const token = await (await ethers.getContractFactory("MockERC20")).deploy("USDT", "USDT", 6);
  const { escrow, libraries } = await deployEscrowWithLibraries(finalTreasury.address);
  const vault = await (await ethers.getContractFactory("ArafRevenueVault")).deploy(
    await escrow.getAddress(), finalTreasury.address, owner.address
  );
  await escrow.setTreasury(await vault.getAddress());
  await escrow.setTokenConfig(await token.getAddress(), true, true, true, 6, [U(1500), U(15000), U(75000), U(300000)]);
  await escrow.setCooldownConfig(0, 0);
  for (const w of [maker, taker, helper, other, helper2]) {
    await token.mint(w.address, U(10_000_000));
    await token.connect(w).approve(await escrow.getAddress(), ethers.MaxUint256);
    await escrow.connect(w).registerWallet();
  }
  await time.increase(2 * DAY + 1);
  return { owner, finalTreasury, maker, taker, helper, other, eoa, helper2, token, escrow, vault, libraries };
}

async function eventArg(tx, contract, name, key) {
  const r = await tx.wait();
  for (const l of r.logs) {
    try {
      const p = contract.interface.parseLog(l);
      if (p && p.name === name) return p.args[key];
    } catch (_) { /* other contract */ }
  }
  throw new Error(`${name} not found`);
}

async function sellTrade(c, amount, tier = 0, maker = c.maker, taker = c.taker) {
  const oid = await eventArg(
    await c.escrow.connect(maker).createSellOrder(await c.token.getAddress(), amount, amount, tier, R(), 0),
    c.escrow, "OrderCreated", "orderId"
  );
  return eventArg(await c.escrow.connect(taker).fillSellOrder(oid, amount, R()), c.escrow, "OrderFilled", "tradeId");
}

async function createSell(c, who, amount, tier) {
  return eventArg(
    await c.escrow.connect(who).createSellOrder(await c.token.getAddress(), amount, amount, tier, R(), 0),
    c.escrow, "OrderCreated", "orderId"
  );
}

async function createBuy(c, who, amount, tier) {
  return eventArg(
    await c.escrow.connect(who).createBuyOrder(await c.token.getAddress(), amount, amount, tier, R(), 0),
    c.escrow, "OrderCreated", "orderId"
  );
}

async function toPaid(c, tid, taker = c.taker) {
  await c.escrow.connect(taker).reportPayment(tid, "QmReceipt");
}

async function pingChallenge(c, tid, maker = c.maker) {
  await time.increase(DAY);
  await c.escrow.connect(maker).pingTakerForChallenge(tid);
}

async function toChallenged(c, tid) {
  await toPaid(c, tid);
  await pingChallenge(c, tid);
  await time.increase(DAY);
  await c.escrow.connect(c.maker).challengeTrade(tid);
}

// [TR] Eşikler düşürülür; tek nitelikli işlem + 15 gün sonrası iki taraf da tier 4 olur.
// [EN] Lowered thresholds: one qualifying trade + 15 days lifts both parties to tier 4.
async function liftAll(c, pairs) {
  await c.escrow.setReputationTierThresholds([0, 1, 1, 1, 1], [100, 80, 50, 30, 15]);
  for (const [m, t] of pairs) {
    const tid = await sellTrade(c, U(50), 0, m, t);
    await c.escrow.connect(t).reportPayment(tid, "Qm");
    await c.escrow.connect(m).releaseFunds(tid);
  }
  await time.increase(15 * DAY + 1);
}

async function mutualCancel(c, m, t) {
  const tid = await sellTrade(c, U(30), 0, m, t);
  await c.escrow.connect(m).proposeOrApproveCancel(tid);
  await c.escrow.connect(t).proposeOrApproveCancel(tid);
}

describe("Security fixes regression (K1–K14, G1/G2)", function () {
  describe("K1 burnExpired sends the decayed part too (conservation)", function () {
    for (const [tier, amount] of [[0, 100], [1, 1000], [2, 5000]]) {
      it(`K1: tier ${tier} ${amount} USDT burn leaves 0 in escrow and vault receives crypto+bonds`, async function () {
        const c = await loadFixture(base);
        if (tier > 0) await liftAll(c, [[c.maker, c.helper], [c.taker, c.helper2]]);
        const esc = await c.escrow.getAddress();
        const vaultAddr = await c.vault.getAddress();
        const escBefore = await c.token.balanceOf(esc);
        const vaultBefore = await c.token.balanceOf(vaultAddr);

        const tid = await sellTrade(c, U(amount), tier);
        const tr = await c.escrow.getTrade(tid);
        const full = tr.cryptoAmount + tr.makerBond + tr.takerBond;
        if (tier > 0) expect(tr.makerBond + tr.takerBond).to.be.gt(0n);

        await toChallenged(c, tid);
        await time.increase(240 * H);
        const cur = await c.escrow.getCurrentAmounts(tid);
        expect(cur.totalDecayed).to.be.gt(0n);
        expect(cur.currentCrypto + cur.currentMakerBond + cur.currentTakerBond + cur.totalDecayed).to.equal(full);

        await expect(c.escrow.connect(c.other).burnExpired(tid))
          .to.emit(c.escrow, "EscrowBurned").withArgs(tid, full)
          .and.to.emit(c.escrow, "ProtocolRevenueSent").withArgs(await c.token.getAddress(), full, 4, tid, vaultAddr);

        expect(await c.token.balanceOf(esc)).to.equal(escBefore);
        expect((await c.token.balanceOf(vaultAddr)) - vaultBefore).to.equal(full);
        expect((await c.escrow.getTrade(tid)).state).to.equal(TradeState.BURNED);
      });
    }
  });

  describe("K2(B) maker challenge ping lapses if not backed by challengeTrade", function () {
    const WINDOW = 24n * 3600n; // MAKER_CHALLENGE_WINDOW
    const RESPONSE = 24n * 3600n;

    async function pingedTrade(c) {
      const tid = await sellTrade(c, U(100));
      await toPaid(c, tid);
      await pingChallenge(c, tid);
      const pingAt = (await c.escrow.getTrade(tid)).challengePingedAt;
      return { tid, pingAt, opensAt: pingAt + RESPONSE, lapsesAt: pingAt + RESPONSE + WINDOW };
    }

    async function balances(c) {
      const who = [c.maker.address, c.taker.address, await c.escrow.getAddress(), await c.vault.getAddress(), c.finalTreasury.address];
      let sum = 0n;
      for (const w of who) sum += await c.token.balanceOf(w);
      return sum;
    }

    it("K2(B): MAKER_CHALLENGE_WINDOW is a public 24h constant", async function () {
      const c = await loadFixture(base);
      expect(await c.escrow.MAKER_CHALLENGE_WINDOW()).to.equal(WINDOW);
    });

    it("K2(B): only the maker can challenge (taker and outsiders get OnlyMaker)", async function () {
      const c = await loadFixture(base);
      const { tid, opensAt } = await pingedTrade(c);
      await time.increaseTo(opensAt);
      await expect(c.escrow.connect(c.taker).challengeTrade(tid)).to.be.revertedWithCustomError(c.escrow, "OnlyMaker");
      await expect(c.escrow.connect(c.other).challengeTrade(tid)).to.be.revertedWithCustomError(c.escrow, "OnlyMaker");
    });

    it("K2(B): maker challenge reverts before ping and inside the 24h response window", async function () {
      const c = await loadFixture(base);
      const tid = await sellTrade(c, U(100));
      await toPaid(c, tid);
      await time.increase(DAY);
      await expect(c.escrow.connect(c.maker).challengeTrade(tid)).to.be.revertedWithCustomError(c.escrow, "MustPingFirst");
      await c.escrow.connect(c.maker).pingTakerForChallenge(tid);
      const pingAt = (await c.escrow.getTrade(tid)).challengePingedAt;
      await time.setNextBlockTimestamp(pingAt + RESPONSE - 1n);
      await expect(c.escrow.connect(c.maker).challengeTrade(tid)).to.be.revertedWithCustomError(c.escrow, "ResponseWindowActive");
    });

    it("K2(B): maker can challenge at the first second (ping+24h)", async function () {
      const c = await loadFixture(base);
      const { tid, opensAt } = await pingedTrade(c);
      await time.setNextBlockTimestamp(opensAt);
      await expect(c.escrow.connect(c.maker).challengeTrade(tid)).to.emit(c.escrow, "DisputeOpened");
      expect((await c.escrow.getTrade(tid)).state).to.equal(TradeState.CHALLENGED);
    });

    it("K2(B): maker can challenge at the last second (ping+48h-1)", async function () {
      const c = await loadFixture(base);
      const { tid, lapsesAt } = await pingedTrade(c);
      await time.setNextBlockTimestamp(lapsesAt - 1n);
      await c.escrow.connect(c.maker).challengeTrade(tid);
      const tr = await c.escrow.getTrade(tid);
      expect(tr.state).to.equal(TradeState.CHALLENGED);
      expect(tr.challengedAt).to.equal(lapsesAt - 1n);
    });

    it("K2(B): at ping+48h exactly and after, challenge reverts with ChallengeWindowExpired", async function () {
      const c = await loadFixture(base);
      const { tid, lapsesAt } = await pingedTrade(c);
      await time.setNextBlockTimestamp(lapsesAt);
      await expect(c.escrow.connect(c.maker).challengeTrade(tid)).to.be.revertedWithCustomError(c.escrow, "ChallengeWindowExpired");
      await time.increase(30 * DAY);
      await expect(c.escrow.connect(c.maker).challengeTrade(tid)).to.be.revertedWithCustomError(c.escrow, "ChallengeWindowExpired");
    });

    it("K2(B): while the ping is valid (before ping+48h) taker pingMaker reverts with ConflictingPingPath", async function () {
      const c = await loadFixture(base);
      const { tid, lapsesAt } = await pingedTrade(c);
      // The ping is at least paidAt+24h; waiting one more day also puts us past paidAt+GRACE_PERIOD (48h),
      // so only the still-valid ping (not the grace period) is what blocks the taker here.
      await time.increase(DAY);
      await expect(c.escrow.connect(c.taker).pingMaker(tid)).to.be.revertedWithCustomError(c.escrow, "ConflictingPingPath");
      await time.setNextBlockTimestamp(lapsesAt - 1n);
      await expect(c.escrow.connect(c.taker).pingMaker(tid)).to.be.revertedWithCustomError(c.escrow, "ConflictingPingPath");
    });

    it("K2(B): boundary second ping+48h — challenge is rejected and taker pingMaker succeeds (no gap, no overlap)", async function () {
      const c = await loadFixture(base);
      const { tid, lapsesAt } = await pingedTrade(c);
      await time.setNextBlockTimestamp(lapsesAt);
      await expect(c.escrow.connect(c.taker).pingMaker(tid)).to.emit(c.escrow, "MakerPinged");
      const tr = await c.escrow.getTrade(tid);
      expect(tr.pingedByTaker).to.equal(true);
      expect(tr.pingedAt).to.equal(lapsesAt);
      // Maker challenge is closed from this second on.
      await expect(c.escrow.connect(c.maker).challengeTrade(tid)).to.be.revertedWithCustomError(c.escrow, "ChallengeWindowExpired");
    });

    it("K2(B): maker cannot ping a second time (before or after the ping lapses)", async function () {
      const c = await loadFixture(base);
      const { tid, lapsesAt } = await pingedTrade(c);
      await expect(c.escrow.connect(c.maker).pingTakerForChallenge(tid)).to.be.revertedWithCustomError(c.escrow, "AlreadyPinged");
      await time.increaseTo(lapsesAt + 10n);
      await expect(c.escrow.connect(c.maker).pingTakerForChallenge(tid)).to.be.revertedWithCustomError(c.escrow, "AlreadyPinged");
      await c.escrow.connect(c.taker).pingMaker(tid);
      await expect(c.escrow.connect(c.maker).pingTakerForChallenge(tid)).to.be.revertedWithCustomError(c.escrow, "AlreadyPinged");
    });

    it("K2(B): reverse direction unchanged — after taker pingMaker, maker ping reverts with ConflictingPingPath", async function () {
      const c = await loadFixture(base);
      const tid = await sellTrade(c, U(100));
      await toPaid(c, tid);
      await time.increase(2 * DAY);
      await c.escrow.connect(c.taker).pingMaker(tid);
      await expect(c.escrow.connect(c.maker).pingTakerForChallenge(tid)).to.be.revertedWithCustomError(c.escrow, "ConflictingPingPath");
    });

    for (const [label, offset] of [["inside the response window", 3600n], ["inside the challenge window", 24n * 3600n + 60n], ["after the ping lapsed", 72n * 3600n]]) {
      it(`K2(B): maker can always releaseFunds from PAID after pinging (${label}) as CLEAN_RELEASE`, async function () {
        const c = await loadFixture(base);
        const { tid, pingAt } = await pingedTrade(c);
        await time.increaseTo(pingAt + offset);
        const tx = await c.escrow.connect(c.maker).releaseFunds(tid);
        expect(await eventArg(tx, c.escrow, "ProtocolRevenueSent", "kind")).to.not.equal(3n);
        expect((await c.escrow.getTrade(tid)).state).to.equal(TradeState.RESOLVED);
        expect((await c.escrow.getRewardableTrade(tid)).outcome).to.not.equal(Outcome.DISPUTED_RELEASE);
      });
    }

    it("K2(B): maker release from CHALLENGED stays DISPUTED_RELEASE with maker dispute loss", async function () {
      const c = await loadFixture(base);
      const { tid, opensAt } = await pingedTrade(c);
      await time.increaseTo(opensAt);
      await c.escrow.connect(c.maker).challengeTrade(tid);
      const tx = await c.escrow.connect(c.maker).releaseFunds(tid);
      expect(await eventArg(tx, c.escrow, "ProtocolRevenueSent", "kind")).to.equal(3n); // DISPUTED_RELEASE_FEE
      expect((await c.escrow.getRewardableTrade(tid)).outcome).to.equal(Outcome.DISPUTED_RELEASE);
      expect((await c.escrow.getReputation(c.maker.address)).disputeLossCount).to.equal(1n);
      expect((await c.escrow.getReputation(c.taker.address)).disputeWinCount).to.equal(1n);
    });

    it("K2(B): silent maker cannot lock the trade — tier>0: lapsed ping -> pingMaker -> +24h autoRelease, penalties measured, funds conserved", async function () {
      const c = await loadFixture(base);
      // Tier>0 trade so both bonds are non-zero and the 2% auto-release penalty is a real amount.
      await liftAll(c, [[c.maker, c.helper], [c.taker, c.helper2]]);
      const esc = await c.escrow.getAddress();
      const vaultAddr = await c.vault.getAddress();

      const tid = await sellTrade(c, U(1000), 1);
      await toPaid(c, tid);
      await pingChallenge(c, tid);
      const tr0 = await c.escrow.getTrade(tid);
      expect(tr0.makerBond).to.be.gt(0n);
      expect(tr0.takerBond).to.be.gt(0n);
      const lapsesAt = tr0.challengePingedAt + RESPONSE + WINDOW;

      // Snapshot after both bonds and the crypto are locked in escrow.
      const totalBefore = await balances(c);
      const escLocked = await c.token.balanceOf(esc);
      expect(escLocked).to.be.gte(tr0.cryptoAmount + tr0.makerBond + tr0.takerBond);
      const makerBefore = await c.token.balanceOf(c.maker.address);
      const takerBefore = await c.token.balanceOf(c.taker.address);
      const vaultBefore = await c.token.balanceOf(vaultAddr);

      await time.increaseTo(lapsesAt);
      await c.escrow.connect(c.taker).pingMaker(tid);
      const pingedAt = (await c.escrow.getTrade(tid)).pingedAt;

      await time.setNextBlockTimestamp(pingedAt + RESPONSE - 1n);
      await expect(c.escrow.connect(c.taker).autoRelease(tid)).to.be.revertedWithCustomError(c.escrow, "ResponseWindowActive");
      await time.setNextBlockTimestamp(pingedAt + RESPONSE);
      await c.escrow.connect(c.taker).autoRelease(tid);

      expect((await c.escrow.getTrade(tid)).state).to.equal(TradeState.RESOLVED);
      // AUTO_RELEASE_PENALTY (2% of each bond) applies as before and is a non-zero amount here.
      const makerPenalty = (tr0.makerBond * 200n) / 10_000n;
      const takerPenalty = (tr0.takerBond * 200n) / 10_000n;
      expect(makerPenalty).to.be.gt(0n);
      expect(takerPenalty).to.be.gt(0n);
      // Maker gets the bond back minus the penalty; taker gets the crypto + bond minus the penalty.
      expect((await c.token.balanceOf(c.maker.address)) - makerBefore).to.equal(tr0.makerBond - makerPenalty);
      expect((await c.token.balanceOf(c.taker.address)) - takerBefore).to.equal(tr0.cryptoAmount + tr0.takerBond - takerPenalty);
      // Both penalties go to the treasury vault.
      expect((await c.token.balanceOf(vaultAddr)) - vaultBefore).to.equal(makerPenalty + takerPenalty);
      // Conservation: this trade's escrow balance is fully paid out; nothing created or lost.
      expect(await c.token.balanceOf(esc)).to.equal(escLocked - (tr0.cryptoAmount + tr0.makerBond + tr0.takerBond));
      expect(await balances(c)).to.equal(totalBefore);
      expect((await c.escrow.getReputation(c.maker.address)).autoReleaseCount).to.equal(1n);
    });
  });

  describe("K3 fillSellOrder enforces the taker's effective tier", function () {
    it("K3: tier-0 taker cannot fill a tier-2 sell order; qualified taker can", async function () {
      const c = await loadFixture(base);
      await liftAll(c, [[c.maker, c.helper]]);
      expect((await c.escrow.getReputation(c.taker.address)).effectiveTier).to.equal(0);
      const oid = await createSell(c, c.maker, U(1000), 2);
      await expect(c.escrow.connect(c.taker).fillSellOrder(oid, U(1000), R()))
        .to.be.revertedWithCustomError(c.escrow, "TierNotAllowed");
      // helper was lifted by the warm-up trade -> tier 4
      await c.escrow.connect(c.helper).fillSellOrder(oid, U(1000), R());
    });
  });

  describe("K5 acceptSettlement binds to the expected proposal id", function () {
    it("K5: withdraw + re-propose invalidates the accepted id; the live id still works", async function () {
      const c = await loadFixture(base);
      const tid = await sellTrade(c, U(100));
      await toChallenged(c, tid);
      let now = await time.latest();
      await c.escrow.connect(c.maker).proposeSettlement(tid, 5000, now + H);
      const seenId = (await c.escrow.getSettlementProposal(tid)).id;
      await c.escrow.connect(c.maker).withdrawSettlement(tid);
      now = await time.latest();
      await c.escrow.connect(c.maker).proposeSettlement(tid, 10000, now + H);
      const liveId = (await c.escrow.getSettlementProposal(tid)).id;
      expect(liveId).to.not.equal(seenId);

      await expect(c.escrow.connect(c.taker).acceptSettlement(tid, seenId))
        .to.be.revertedWithCustomError(c.escrow, "SettlementProposalMismatch").withArgs(seenId, liveId);
      await expect(c.escrow.connect(c.taker).acceptSettlement(tid, liveId))
        .to.emit(c.escrow, "SettlementFinalized");
    });
  });

  describe("K6 order owner re-checked at fill time", function () {
    it("K6: a sell order of a maker banned after create cannot be filled", async function () {
      const c = await loadFixture(base);
      const oid = await createSell(c, c.maker, U(100), 0);
      for (const t of [c.taker, c.helper, c.other, c.helper2, c.taker]) await mutualCancel(c, c.maker, t); // 5 x 20 = 100 -> ban
      expect((await c.escrow.getReputation(c.maker.address)).bannedUntil).to.be.gt(BigInt(await time.latest()));
      const [, , , , , , , , fresh] = await ethers.getSigners();
      await c.token.mint(fresh.address, U(1000));
      await c.token.connect(fresh).approve(await c.escrow.getAddress(), ethers.MaxUint256);
      await c.escrow.connect(fresh).registerWallet();
      await time.increase(2 * DAY + 1);
      await expect(c.escrow.connect(fresh).fillSellOrder(oid, U(100), R()))
        .to.be.revertedWithCustomError(c.escrow, "MakerBanActive");
    });

    it("K6: sell order is not fillable once the maker's effective tier fell below the order tier", async function () {
      const c = await loadFixture(base);
      await liftAll(c, [[c.maker, c.helper], [c.taker, c.helper2]]);
      const oid4 = await createSell(c, c.maker, U(1000), 4);
      const oid3 = await createSell(c, c.maker, U(1000), 3);
      await mutualCancel(c, c.maker, c.other); // maker riskPoints 20 > tier4 max (15) -> tier 3
      expect((await c.escrow.getReputation(c.maker.address)).effectiveTier).to.equal(3);
      await expect(c.escrow.connect(c.taker).fillSellOrder(oid4, U(1000), R()))
        .to.be.revertedWithCustomError(c.escrow, "TierNotAllowed");
      await c.escrow.connect(c.taker).fillSellOrder(oid3, U(1000), R());
    });

    it("K6: buy order is not fillable once the owner's (taker) effective tier fell below the order tier", async function () {
      const c = await loadFixture(base);
      await liftAll(c, [[c.maker, c.helper], [c.taker, c.helper2]]);
      const oid = await createBuy(c, c.taker, U(1000), 4);
      await mutualCancel(c, c.helper2, c.taker); // taker riskPoints 20 -> tier 3
      await expect(c.escrow.connect(c.maker).fillBuyOrder(oid, U(1000), R()))
        .to.be.revertedWithCustomError(c.escrow, "TierNotAllowed");
    });
  });

  describe("K10 reportPayment closes with the payment window", function () {
    it("K10: accepted one second before lockedAt+48h; rejected at the boundary where expirePaymentWindow opens", async function () {
      const c = await loadFixture(base);
      const t1 = await sellTrade(c, U(100));
      const locked1 = (await c.escrow.getTrade(t1)).lockedAt;
      await time.setNextBlockTimestamp(locked1 + BigInt(48 * H) - 1n);
      await c.escrow.connect(c.taker).reportPayment(t1, "Qm");
      expect((await c.escrow.getTrade(t1)).state).to.equal(TradeState.PAID);

      const t2 = await sellTrade(c, U(100));
      const locked2 = (await c.escrow.getTrade(t2)).lockedAt;
      const boundary = locked2 + BigInt(48 * H);
      await time.setNextBlockTimestamp(boundary);
      await expect(c.escrow.connect(c.taker).reportPayment(t2, "Qm"))
        .to.be.revertedWithCustomError(c.escrow, "PaymentWindowClosed").withArgs(boundary);
      await time.setNextBlockTimestamp(boundary + 1n);
      await expect(c.escrow.connect(c.maker).expirePaymentWindow(t2)).to.emit(c.escrow, "PaymentWindowExpired");
    });

    it("K10: at exactly lockedAt+48h expirePaymentWindow succeeds (no overlap second)", async function () {
      const c = await loadFixture(base);
      const tid = await sellTrade(c, U(100));
      const locked = (await c.escrow.getTrade(tid)).lockedAt;
      await time.setNextBlockTimestamp(locked + BigInt(48 * H));
      await expect(c.escrow.connect(c.maker).expirePaymentWindow(tid)).to.emit(c.escrow, "PaymentWindowExpired");
    });
  });

  describe("K11 revokeCancel", function () {
    it("K11: a party revokes its cancel consent; the counterparty's consent then does not execute", async function () {
      const c = await loadFixture(base);
      const tid = await sellTrade(c, U(100));
      await c.escrow.connect(c.maker).proposeOrApproveCancel(tid);
      await expect(c.escrow.connect(c.maker).revokeCancel(tid))
        .to.emit(c.escrow, "CancelRevoked").withArgs(tid, c.maker.address);
      expect((await c.escrow.getTrade(tid)).cancelProposedByMaker).to.equal(false);
      await c.escrow.connect(c.taker).proposeOrApproveCancel(tid);
      expect((await c.escrow.getTrade(tid)).state).to.equal(TradeState.LOCKED);
      // taker can revoke too; the maker's later consent then does not execute
      await c.escrow.connect(c.taker).revokeCancel(tid);
      await c.escrow.connect(c.maker).proposeOrApproveCancel(tid);
      expect((await c.escrow.getTrade(tid)).state).to.equal(TradeState.LOCKED);
    });

    it("K11: reverts without consent, for outsiders and on terminal trades", async function () {
      const c = await loadFixture(base);
      const tid = await sellTrade(c, U(100));
      await expect(c.escrow.connect(c.maker).revokeCancel(tid)).to.be.revertedWithCustomError(c.escrow, "NoCancelConsent");
      await expect(c.escrow.connect(c.other).revokeCancel(tid)).to.be.revertedWithCustomError(c.escrow, "NotTradeParty");
      await c.escrow.connect(c.maker).proposeOrApproveCancel(tid);
      await c.escrow.connect(c.taker).proposeOrApproveCancel(tid);
      await expect(c.escrow.connect(c.maker).revokeCancel(tid)).to.be.revertedWithCustomError(c.escrow, "CannotReleaseInState");
    });
  });

  describe("K4 vault.setRewards is set-once", function () {
    it("K4: second setRewards reverts; owner cannot repoint rewards to drain reserves", async function () {
      const c = await loadFixture(base);
      await c.vault.setRewards(c.helper.address);
      await expect(c.vault.setRewards(c.eoa.address)).to.be.revertedWithCustomError(c.vault, "RewardsAlreadySet");
      expect(await c.vault.rewards()).to.equal(c.helper.address);
      await expect(c.vault.connect(c.eoa).transferEpochAllocation(1, await c.token.getAddress(), 1n))
        .to.be.revertedWithCustomError(c.vault, "UnauthorizedRewards");
    });
  });

  describe("K14 setTokenConfig checks token decimals()", function () {
    it("K14: mismatching decimals and non-token addresses revert with InvalidDecimals", async function () {
      const c = await loadFixture(base);
      const t18 = await (await ethers.getContractFactory("MockERC20")).deploy("DAI", "DAI", 18);
      const lim = [1n, 2n, 3n, 4n];
      await expect(c.escrow.setTokenConfig(await t18.getAddress(), true, true, true, 6, lim))
        .to.be.revertedWithCustomError(c.escrow, "InvalidDecimals");
      await expect(c.escrow.setTokenConfig(c.eoa.address, true, true, true, 6, lim))
        .to.be.revertedWithCustomError(c.escrow, "InvalidDecimals");
      await expect(c.escrow.setTokenConfig(await c.vault.getAddress(), true, true, true, 6, lim))
        .to.be.revertedWithCustomError(c.escrow, "InvalidDecimals");
      await c.escrow.setTokenConfig(await t18.getAddress(), true, true, true, 18, lim);
      expect((await c.escrow.getTokenConfig(await t18.getAddress())).decimals).to.equal(18);
    });
  });

  describe("G1/G2 and library wiring", function () {
    it("G1: terminal fee snapshot (uint128 packed) is read back unchanged", async function () {
      const c = await loadFixture(base);
      await liftAll(c, [[c.maker, c.helper], [c.taker, c.helper2]]);
      const tid = await sellTrade(c, U(1000), 2);
      await toPaid(c, tid);
      const tx = await c.escrow.connect(c.maker).releaseFunds(tid);
      const takerFee = await eventArg(tx, c.escrow, "EscrowReleased", "takerFee");
      const makerFee = await eventArg(tx, c.escrow, "EscrowReleased", "makerFee");
      const v = await c.escrow.getRewardableTrade(tid);
      expect(v.takerFeePaid).to.equal(takerFee);
      expect(v.makerFeePaid).to.equal(makerFee);
      expect(takerFee).to.be.gt(0n);
    });

    it("G2: vault intent does not survive across transactions (transient handshake)", async function () {
      const [owner] = await ethers.getSigners();
      const token = await (await ethers.getContractFactory("MockERC20")).deploy("USDT", "USDT", 6);
      const pusher = await deployRevenueEscrow();
      const vault = await (await ethers.getContractFactory("ArafRevenueVault")).deploy(
        await pusher.getAddress(), owner.address, owner.address
      );
      const vAddr = await vault.getAddress();
      const tAddr = await token.getAddress();
      await pusher.noteOnly(vAddr, tAddr, U(10), 0, 1);
      await token.mint(vAddr, U(10));
      await expect(pusher.hookOnly(vAddr, tAddr, U(10), 0, 1)).to.be.revertedWithCustomError(vault, "MissingRevenueIntent");
      // same-tx handshake works
      await expect(pushRevenue(vault, token, U(10), 0, 2)).to.emit(vault, "EscrowRevenueReceived");
    });

    it("library events are emitted from the escrow address and every lib event/error is in the escrow ABI", async function () {
      const c = await loadFixture(base);
      const tid = await sellTrade(c, U(100));
      await toPaid(c, tid);
      const r = await (await c.escrow.connect(c.maker).releaseFunds(tid)).wait();
      const escAddr = await c.escrow.getAddress();
      const names = r.logs
        .filter((l) => l.address === escAddr)
        .map((l) => { try { return c.escrow.interface.parseLog(l)?.name; } catch (_) { return null; } });
      expect(names).to.include("ReputationUpdated");
      expect(names).to.include("EscrowReleased");

      const escAbi = new ethers.Interface((await artifacts.readArtifact("ArafEscrow")).abi);
      for (const lib of ["ArafReputationLib", "ArafSettlementLib"]) {
        expect(c.libraries[lib]).to.properAddress;
        const libAbi = new ethers.Interface((await artifacts.readArtifact(lib)).abi);
        libAbi.forEachEvent((ev) => expect(escAbi.getEvent(ev.topicHash), `${lib}.${ev.name}`).to.not.equal(null));
        libAbi.forEachError((er) => expect(escAbi.getError(er.selector), `${lib}.${er.name}`).to.not.equal(null));
      }
    });
  });
});
