const { expect } = require("chai");
const { ethers, network } = require("hardhat");
const { time, loadFixture } = require("@nomicfoundation/hardhat-network-helpers");
const { deployEscrowWithLibraries, getEscrowFactory } = require("../../contracts/scripts/deploy");
const { deployRevenueEscrow, pushRevenue } = require("./helpers/revenue");

// [TR] Dalga 5 kontrat paketi (K): kullanıcı onaylı davranış değişiklikleri ve temizlikler.
// [EN] Wave 5 contract package (K): user-approved behaviour changes and cleanups.
const U = (x) => ethers.parseUnits(String(x), 6);
const H = 3600;
const DAY = 24 * H;
const BPS = 10_000n;
let refN = 0;
const R = () => ethers.id("dalga5-k-" + refN++);

const Outcome = { NONE: 0n, CLEAN_RELEASE: 1n, AUTO_RELEASE: 2n, PARTIAL_SETTLEMENT: 4n, PAYMENT_WINDOW_EXPIRED: 7n };

async function base() {
  const [owner, finalTreasury, maker, taker, helper, other, eoa, helper2] = await ethers.getSigners();
  const token = await (await ethers.getContractFactory("MockERC20")).deploy("USDT", "USDT", 6);
  const { escrow } = await deployEscrowWithLibraries(finalTreasury.address);
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
  return { owner, finalTreasury, maker, taker, helper, other, eoa, helper2, token, escrow, vault };
}

function parseAll(receipt, iface) {
  const out = [];
  for (const l of receipt.logs) {
    try {
      const p = iface.parseLog(l);
      if (p) out.push({ name: p.name, args: p.args, index: l.index });
    } catch (_) { /* other contract */ }
  }
  return out;
}

async function eventArg(tx, contract, name, key) {
  const r = await tx.wait();
  const ev = parseAll(r, contract.interface).find((e) => e.name === name);
  if (!ev) throw new Error(`${name} not found`);
  return ev.args[key];
}

async function sellTrade(c, amount, tier = 0, maker = c.maker, taker = c.taker) {
  const oid = await eventArg(
    await c.escrow.connect(maker).createSellOrder(await c.token.getAddress(), amount, amount, tier, R(), 0),
    c.escrow, "OrderCreated", "orderId"
  );
  return eventArg(await c.escrow.connect(taker).fillSellOrder(oid, amount, R()), c.escrow, "OrderFilled", "tradeId");
}

async function toChallenged(c, tid) {
  await c.escrow.connect(c.taker).reportPayment(tid, "QmReceipt");
  await time.increase(DAY);
  await c.escrow.connect(c.maker).pingTakerForChallenge(tid);
  await time.increase(DAY);
  await c.escrow.connect(c.maker).challengeTrade(tid);
}

// [TR] Eşikler düşürülür; tek nitelikli işlem + 15 gün sonrası iki taraf da üst tier'a çıkar.
// [EN] Lowered thresholds: one qualifying trade + 15 days lifts both parties.
async function liftAll(c) {
  await c.escrow.setReputationTierThresholds([0, 1, 1, 1, 1], [100, 80, 50, 30, 15]);
  for (const [m, t] of [[c.maker, c.helper], [c.taker, c.helper2]]) {
    const tid = await sellTrade(c, U(50), 0, m, t);
    await c.escrow.connect(t).reportPayment(tid, "Qm");
    await c.escrow.connect(m).releaseFunds(tid);
  }
  await time.increase(15 * DAY + 1);
}

async function autoReleaseTrade(c, tid) {
  await c.escrow.connect(c.taker).reportPayment(tid, "Qm");
  await time.increase(48 * H);
  await c.escrow.connect(c.taker).pingMaker(tid);
  await time.increase(24 * H);
  return c.escrow.connect(c.taker).autoRelease(tid);
}

function expectedAutoReleaseCuts(tr) {
  const takerFee = (tr.cryptoAmount * tr.takerFeeBpsSnapshot) / BPS;
  const makerFeeQ = (tr.cryptoAmount * tr.makerFeeBpsSnapshot) / BPS;
  const makerFee = makerFeeQ > tr.makerBond ? tr.makerBond : makerFeeQ;
  const takerPen = (tr.takerBond * 200n) / BPS;
  const makerPen = (tr.makerBond * 200n) / BPS;
  return {
    takerCut: takerPen > takerFee ? takerPen : takerFee,
    makerCut: makerPen > makerFee ? makerPen : makerFee,
  };
}

describe("Dalga 5 K paketi / Wave 5 contract package", function () {
  describe("K1-06 CEI: terminal snapshot + reputation are written before external calls", function () {
    it("releaseFunds: ReputationUpdated logs precede ProtocolRevenueSent and token transfers", async function () {
      const c = await loadFixture(base);
      const tid = await sellTrade(c, U(100));
      await c.escrow.connect(c.taker).reportPayment(tid, "Qm");
      const r = await (await c.escrow.connect(c.maker).releaseFunds(tid)).wait();
      const esc = parseAll(r, c.escrow.interface);
      const tok = parseAll(r, c.token.interface).filter((e) => e.name === "Transfer");
      const firstRep = esc.find((e) => e.name === "ReputationUpdated").index;
      const revenue = esc.find((e) => e.name === "ProtocolRevenueSent").index;
      const released = esc.find((e) => e.name === "EscrowReleased").index;
      expect(tok.length).to.be.gte(2);
      expect(firstRep).to.be.lt(revenue);
      expect(firstRep).to.be.lt(Math.min(...tok.map((t) => t.index)));
      expect(released).to.be.gt(revenue);
    });

    it("treasury hook already sees the terminal snapshot and reputation (no stale read-only window)", async function () {
      const c = await loadFixture(base);
      const probe = await (await ethers.getContractFactory("MockRevenueProbe")).deploy(await c.escrow.getAddress());
      await c.escrow.setTreasury(await probe.getAddress());
      await probe.setProbeWallet(c.maker.address);
      expect(await c.escrow.getFirstSuccessfulTradeAt(c.maker.address)).to.equal(0n);

      const tid = await sellTrade(c, U(100));
      await c.escrow.connect(c.taker).reportPayment(tid, "Qm");
      await c.escrow.connect(c.maker).releaseFunds(tid);

      expect(await probe.hookCount()).to.equal(1n);
      expect(await probe.seenOutcome()).to.equal(Outcome.CLEAN_RELEASE);
      expect(await probe.seenTerminalAt()).to.be.gt(0n);
      expect(await probe.seenFirstSuccessAt()).to.be.gt(0n);
    });
  });

  describe("K2-01 autoRelease cut is at least the normal releaseFunds fee", function () {
    it("tier 0: protocol keeps the taker fee (was 0); maker cut stays 0 (no bond)", async function () {
      const c = await loadFixture(base);
      const tid = await sellTrade(c, U(1000));
      const tr = await c.escrow.getTrade(tid);
      expect(tr.makerBond).to.equal(0n);
      expect(tr.takerBond).to.equal(0n);
      const { takerCut, makerCut } = expectedAutoReleaseCuts(tr);
      expect(takerCut).to.equal(U(1000) * 15n / BPS);
      expect(makerCut).to.equal(0n);

      const vaultAddr = await c.vault.getAddress();
      const vaultBefore = await c.token.balanceOf(vaultAddr);
      const takerBefore = await c.token.balanceOf(c.taker.address);
      await expect(autoReleaseTrade(c, tid))
        .to.emit(c.escrow, "EscrowReleased").withArgs(tid, c.maker.address, c.taker.address, takerCut, makerCut);
      expect((await c.token.balanceOf(vaultAddr)) - vaultBefore).to.equal(takerCut);
      expect((await c.token.balanceOf(c.taker.address)) - takerBefore).to.equal(tr.cryptoAmount - takerCut);
      const v = await c.escrow.getRewardableTrade(tid);
      expect(v.takerFeePaid).to.equal(takerCut);
      expect(v.makerFeePaid).to.equal(0n);
    });

    it("bonded tier: each side pays max(2% bond penalty, its releaseFunds fee)", async function () {
      const c = await loadFixture(base);
      await liftAll(c);
      const tid = await sellTrade(c, U(10_000), 4);
      const tr = await c.escrow.getTrade(tid);
      const makerPen = (tr.makerBond * 200n) / BPS;
      const takerFee = (tr.cryptoAmount * tr.takerFeeBpsSnapshot) / BPS;
      const makerFee = (tr.cryptoAmount * tr.makerFeeBpsSnapshot) / BPS;
      // tier 4 + good rep: bonds are small, so the fee floor binds on both sides
      expect(makerPen).to.be.lt(makerFee);
      const { takerCut, makerCut } = expectedAutoReleaseCuts(tr);
      expect(takerCut).to.equal(takerFee);
      expect(makerCut).to.equal(makerFee > tr.makerBond ? tr.makerBond : makerFee);

      const vaultAddr = await c.vault.getAddress();
      const vaultBefore = await c.token.balanceOf(vaultAddr);
      const makerBefore = await c.token.balanceOf(c.maker.address);
      await expect(autoReleaseTrade(c, tid))
        .to.emit(c.escrow, "EscrowReleased").withArgs(tid, c.maker.address, c.taker.address, takerCut, makerCut);
      expect((await c.token.balanceOf(vaultAddr)) - vaultBefore).to.equal(takerCut + makerCut);
      expect((await c.token.balanceOf(c.maker.address)) - makerBefore).to.equal(tr.makerBond - makerCut);
      expect(await c.token.balanceOf(await c.escrow.getAddress())).to.equal(0n);
    });
  });

  describe("K1-03 expirePaymentWindow: bonded-tier taker penalty goes to the maker", function () {
    it("tier >= 1: maker receives crypto + makerBond + penalty; treasury receives nothing", async function () {
      const c = await loadFixture(base);
      await liftAll(c);
      const tid = await sellTrade(c, U(1000), 1);
      const tr = await c.escrow.getTrade(tid);
      const penalty = (tr.takerBond * 200n) / BPS;
      expect(penalty).to.be.gt(0n);
      const vaultAddr = await c.vault.getAddress();
      const vaultBefore = await c.token.balanceOf(vaultAddr);
      const makerBefore = await c.token.balanceOf(c.maker.address);
      const takerBefore = await c.token.balanceOf(c.taker.address);
      await time.increase(48 * H);
      const tx = c.escrow.connect(c.maker).expirePaymentWindow(tid);
      await expect(tx).to.emit(c.escrow, "PaymentWindowExpired")
        .withArgs(tid, tr.cryptoAmount + tr.makerBond + penalty, tr.takerBond - penalty, penalty);
      await expect(tx).to.not.emit(c.escrow, "ProtocolRevenueSent");
      expect((await c.token.balanceOf(vaultAddr)) - vaultBefore).to.equal(0n);
      expect((await c.token.balanceOf(c.maker.address)) - makerBefore).to.equal(tr.cryptoAmount + tr.makerBond + penalty);
      expect((await c.token.balanceOf(c.taker.address)) - takerBefore).to.equal(tr.takerBond - penalty);
      expect(await c.token.balanceOf(await c.escrow.getAddress())).to.equal(0n);
    });

    it("tier 0: penalty stays 0", async function () {
      const c = await loadFixture(base);
      const tid = await sellTrade(c, U(100));
      await time.increase(48 * H);
      await expect(c.escrow.connect(c.maker).expirePaymentWindow(tid))
        .to.emit(c.escrow, "PaymentWindowExpired").withArgs(tid, U(100), 0n, 0n);
    });
  });

  describe("K2-07 zero address checks use ArafErrors.ZeroAddress()", function () {
    it("setTreasury / setTokenConfig / constructor revert with ZeroAddress", async function () {
      const c = await loadFixture(base);
      await expect(c.escrow.setTreasury(ethers.ZeroAddress)).to.be.revertedWithCustomError(c.escrow, "ZeroAddress");
      await expect(c.escrow.setTokenConfig(ethers.ZeroAddress, true, true, true, 6, [1n, 2n, 3n, 4n]))
        .to.be.revertedWithCustomError(c.escrow, "ZeroAddress");
      const { factory } = await getEscrowFactory();
      await expect(factory.deploy(ethers.ZeroAddress)).to.be.revertedWithCustomError(c.escrow, "ZeroAddress");
    });
  });

  describe("K2-08 TokenLimitsUpdated carries decimals and tier limits", function () {
    it("setTokenConfig emits TokenConfigUpdated (unchanged) and TokenLimitsUpdated", async function () {
      const c = await loadFixture(base);
      const lim = [U(1), U(2), U(3), U(4)];
      const tx = c.escrow.setTokenConfig(await c.token.getAddress(), true, false, true, 6, lim);
      await expect(tx).to.emit(c.escrow, "TokenConfigUpdated").withArgs(await c.token.getAddress(), true, false, true);
      await expect(tx).to.emit(c.escrow, "TokenLimitsUpdated").withArgs(await c.token.getAddress(), 6, lim);
    });
  });

  describe("K3-07 overwriting an expired proposal emits SettlementExpired for the old id", function () {
    it("re-propose after expiry: SettlementExpired(old) then SettlementProposed(new)", async function () {
      const c = await loadFixture(base);
      const tid = await sellTrade(c, U(100));
      await toChallenged(c, tid);
      const exp1 = (await time.latest()) + 3600;
      await c.escrow.connect(c.maker).proposeSettlement(tid, 5000, exp1);
      const oldId = (await c.escrow.getSettlementProposal(tid)).id;
      await time.increase(3601);
      const exp2 = (await time.latest()) + 3600;
      const r = await (await c.escrow.connect(c.taker).proposeSettlement(tid, 4000, exp2)).wait();
      const evs = parseAll(r, c.escrow.interface);
      const expired = evs.find((e) => e.name === "SettlementExpired");
      const proposed = evs.find((e) => e.name === "SettlementProposed");
      expect(expired, "SettlementExpired").to.not.equal(undefined);
      expect(expired.args.tradeId).to.equal(tid);
      expect(expired.args.proposalId).to.equal(oldId);
      expect(proposed.args.proposalId).to.equal(oldId + 1n);
      expect(expired.index).to.be.lt(proposed.index);
    });

    it("withdrawn (non-PROPOSED) proposal is overwritten without an extra SettlementExpired", async function () {
      const c = await loadFixture(base);
      const tid = await sellTrade(c, U(100));
      await toChallenged(c, tid);
      await c.escrow.connect(c.maker).proposeSettlement(tid, 5000, (await time.latest()) + 3600);
      await c.escrow.connect(c.maker).withdrawSettlement(tid);
      await expect(c.escrow.connect(c.maker).proposeSettlement(tid, 5000, (await time.latest()) + 3600))
        .to.not.emit(c.escrow, "SettlementExpired");
    });
  });

  describe("K3-08 PARTIAL_SETTLEMENT gives +1 successful trade, 0 points", function () {
    it("qualifying partial settlement increments successfulTrades of both parties", async function () {
      const c = await loadFixture(base);
      const tid = await sellTrade(c, U(100));
      const m0 = (await c.escrow.getReputation(c.maker.address)).successful;
      const t0 = (await c.escrow.getReputation(c.taker.address)).successful;
      const rp0 = (await c.escrow.getReputation(c.maker.address)).riskPoints;
      await toChallenged(c, tid);
      await c.escrow.connect(c.maker).proposeSettlement(tid, 5000, (await time.latest()) + 3600);
      const pid = (await c.escrow.getSettlementProposal(tid)).id;
      await c.escrow.connect(c.taker).acceptSettlement(tid, pid);
      expect((await c.escrow.getReputation(c.maker.address)).successful).to.equal(m0 + 1n);
      expect((await c.escrow.getReputation(c.taker.address)).successful).to.equal(t0 + 1n);
      expect((await c.escrow.getReputation(c.maker.address)).riskPoints).to.equal(rp0);
    });
  });

  describe("K3-09 a failed revenue intent surfaces its root cause", function () {
    it("intent revert data is carried in RevenueIntentFailed(bytes); the exit still reverts", async function () {
      const c = await loadFixture(base);
      const bad = await (await ethers.getContractFactory("MockRevenueIntentReverter")).deploy(await c.escrow.getAddress());
      await c.escrow.setTreasury(await bad.getAddress());
      const tid = await sellTrade(c, U(100));
      await c.escrow.connect(c.taker).reportPayment(tid, "Qm");
      const reason = bad.interface.encodeErrorResult("IntentRejected", [42]);
      await expect(c.escrow.connect(c.maker).releaseFunds(tid))
        .to.be.revertedWithCustomError(c.escrow, "RevenueIntentFailed").withArgs(reason);
      expect((await c.escrow.getTrade(tid)).state).to.equal(2n); // still PAID
    });
  });
});

describe("Dalga 5 K paketi: rewards and vault", function () {
  const SCALE = 10_000n * 10_000n;

  async function rewardsFixture() {
    const [owner, maker, taker] = await ethers.getSigners();
    const mockEscrow = await (await ethers.getContractFactory("MockEscrowRewardView")).deploy();
    const vault = await (await ethers.getContractFactory("ArafRevenueVault")).deploy(
      await (await deployRevenueEscrow()).getAddress(), owner.address, owner.address
    );
    const rewards = await (await ethers.getContractFactory("ArafRewards")).deploy(
      await mockEscrow.getAddress(), await vault.getAddress(), owner.address
    );
    await vault.setRewards(await rewards.getAddress());
    return { owner, maker, taker, mockEscrow, vault, rewards };
  }

  async function mk(tradeId, maker, taker, takerFeePaid, makerFeePaid) {
    const now = await time.latest();
    return {
      tradeId, parentOrderId: 9, maker, taker, token: "0x0000000000000000000000000000000000000001",
      stableNotional: 1_000_000_000n, takerFeePaid, makerFeePaid, tier: 1, outcome: 1,
      lockedAt: now - 120, paidAt: now - 60, terminalAt: now, hadChallenge: false, isOrderChild: true,
    };
  }

  describe("K3-02 a side whose paid fee is 0 gets reward weight 0", function () {
    it("taker fee 0, maker fee > 0: only the maker is weighted", async function () {
      const c = await loadFixture(rewardsFixture);
      const t = await mk(1, c.maker.address, c.taker.address, 0, 5);
      await c.mockEscrow.setRewardableTrade(1, t);
      const full = (1_000_000_000n * 25_000n * 10_000n) / SCALE;
      const epoch = BigInt(t.terminalAt) / (30n * 86400n);
      await expect(c.rewards.recordTradeOutcome(1))
        .to.emit(c.rewards, "TradeOutcomeRecorded").withArgs(1, epoch, c.maker.address, c.taker.address, full, 0n, 1);
      expect(await c.rewards.userWeight(epoch, c.maker.address)).to.equal(full);
      expect(await c.rewards.userWeight(epoch, c.taker.address)).to.equal(0n);
      expect(await c.rewards.totalWeight(epoch)).to.equal(full);
    });

    it("both fees 0: no weight at all (wash trade at zero fee earns nothing)", async function () {
      const c = await loadFixture(rewardsFixture);
      const t = await mk(2, c.maker.address, c.taker.address, 0, 0);
      await c.mockEscrow.setRewardableTrade(2, t);
      const epoch = BigInt(t.terminalAt) / (30n * 86400n);
      await c.rewards.recordTradeOutcome(2);
      expect(await c.rewards.totalWeight(epoch)).to.equal(0n);
    });
  });

  describe("K3-05 (documented) permissionless finalize front-runs a late allocation", function () {
    it("after recordingDeadline anyone finalizes; a later allocateEpochRewards reverts EpochTokenFinalized", async function () {
      const c = await loadFixture(rewardsFixture);
      const [, , , anyone] = await ethers.getSigners();
      const epoch = await c.rewards.currentEpoch();
      const deadline = (epoch + 1n) * 30n * 86400n + 86400n;
      await time.increaseTo(deadline);
      const tokenAddr = "0x0000000000000000000000000000000000000001";
      await c.rewards.connect(anyone).finalizeEpochToken(epoch, tokenAddr);
      await expect(c.rewards.connect(c.owner).allocateEpochRewards(epoch, tokenAddr, 1n))
        .to.be.revertedWithCustomError(c.rewards, "EpochTokenFinalized");
    });
  });

  describe("K3-04 setRewards only accepts a Rewards contract bound to this vault", function () {
    it("EOA and a Rewards bound to another vault are rejected; the bound one is accepted", async function () {
      const [owner, , , eoa] = await ethers.getSigners();
      const mockEscrow = await (await ethers.getContractFactory("MockEscrowRewardView")).deploy();
      const Vault = await ethers.getContractFactory("ArafRevenueVault");
      const vault = await Vault.deploy(await (await deployRevenueEscrow()).getAddress(), owner.address, owner.address);
      const otherVault = await Vault.deploy(await (await deployRevenueEscrow()).getAddress(), owner.address, owner.address);
      const Rewards = await ethers.getContractFactory("ArafRewards");
      const foreign = await Rewards.deploy(await mockEscrow.getAddress(), await otherVault.getAddress(), owner.address);
      const bound = await Rewards.deploy(await mockEscrow.getAddress(), await vault.getAddress(), owner.address);

      await expect(vault.setRewards(eoa.address))
        .to.be.revertedWithCustomError(vault, "InvalidRewardsBinding").withArgs(eoa.address);
      await expect(vault.setRewards(await foreign.getAddress()))
        .to.be.revertedWithCustomError(vault, "InvalidRewardsBinding").withArgs(await foreign.getAddress());
      await expect(vault.setRewards(await mockEscrow.getAddress()))
        .to.be.reverted; // no revenueVault() getter
      await expect(vault.setRewards(await bound.getAddress()))
        .to.emit(vault, "RewardsUpdated").withArgs(await bound.getAddress());
    });
  });

  describe("K3-06 unpaid sponsor funding counts as liability", function () {
    async function vaultFixture() {
      const [owner, sponsor] = await ethers.getSigners();
      const token = await (await ethers.getContractFactory("MockERC20")).deploy("USDT", "USDT", 6);
      const vault = await (await ethers.getContractFactory("ArafRevenueVault")).deploy(
        await (await deployRevenueEscrow()).getAddress(), owner.address, owner.address
      );
      await vault.setSupportedToken(await token.getAddress(), true);
      const binding = await (await ethers.getContractFactory("MockRewardsBinding")).deploy(await vault.getAddress());
      await vault.setRewards(await binding.getAddress());
      await network.provider.send("hardhat_setBalance", [await binding.getAddress(), "0x56BC75E2D63100000"]);
      const rewardsSigner = await ethers.getImpersonatedSigner(await binding.getAddress());
      await token.mint(sponsor.address, U(1000));
      await token.connect(sponsor).approve(await vault.getAddress(), ethers.MaxUint256);
      return { owner, sponsor, token, vault, rewardsSigner };
    }

    it("outstandingExternalFunding grows on funding and shrinks as allocations pay it out", async function () {
      const c = await loadFixture(vaultFixture);
      const tokenAddr = await c.token.getAddress();
      await c.vault.connect(c.sponsor).fundGlobalRewards(tokenAddr, U(100), 5, ethers.ZeroHash);
      expect(await c.vault.outstandingExternalFunding(tokenAddr)).to.equal(U(100));
      await c.vault.connect(c.rewardsSigner).transferEpochAllocation(5, tokenAddr, U(40));
      expect(await c.vault.outstandingExternalFunding(tokenAddr)).to.equal(U(60));
      expect(await c.vault.totalExternalFunding(tokenAddr)).to.equal(U(100));
    });

    it("a balance shortfall hidden behind sponsor funds now trips RevenueLiabilityMismatch", async function () {
      const c = await loadFixture(vaultFixture);
      const tokenAddr = await c.token.getAddress();
      const vaultAddr = await c.vault.getAddress();
      await c.vault.connect(c.sponsor).fundGlobalRewards(tokenAddr, U(100), 5, ethers.ZeroHash);
      // [TR] Vault bakiyesi sponsor fonunun altına düşürülür (simüle kayıp). [EN] Simulated loss below sponsor funds.
      const slot = ethers.keccak256(ethers.AbiCoder.defaultAbiCoder().encode(["address", "uint256"], [vaultAddr, 0]));
      await network.provider.send("hardhat_setStorageAt", [tokenAddr, slot, ethers.zeroPadValue("0x00", 32)]);
      expect(await c.token.balanceOf(vaultAddr)).to.equal(0n);
      await expect(pushRevenue(c.vault, c.token, U(10)))
        .to.be.revertedWithCustomError(c.vault, "RevenueLiabilityMismatch");
    });
  });
});
