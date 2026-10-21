const { expect } = require("chai");
const { ethers } = require("hardhat");
const { time, loadFixture } = require("@nomicfoundation/hardhat-network-helpers");
const { deployEscrowWithLibraries } = require("../../contracts/scripts/deploy");

// [TR] Dalga 2 / K3-01: decayReputation ancak hem ban bitiminden hem son olumsuz olaydan (lastNegativeEventAt)
//      sonra temiz dönem geçince af verir. Senaryo denetim repro'sundan (dogrulama/kontrat-repro.test.js "K3-01").
// [EN] Wave 2 / K3-01: decay only forgives after the clean period has elapsed since both the ban end and the
//      last negative event.
const U = (x) => ethers.parseUnits(String(x), 6);
const DAY = 86400;
let refN = 0;
const R = () => ethers.id("dalga2-decay-" + refN++);

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

async function base() {
  const [owner, fin, wallet, h1, h2, h3, h4, caller] = await ethers.getSigners();
  const token = await (await ethers.getContractFactory("MockERC20")).deploy("USDT", "USDT", 6);
  const { escrow } = await deployEscrowWithLibraries(fin.address);
  const vault = await (await ethers.getContractFactory("ArafRevenueVault")).deploy(
    await escrow.getAddress(), fin.address, owner.address
  );
  await escrow.setTreasury(await vault.getAddress());
  await escrow.setTokenConfig(await token.getAddress(), true, true, true, 6, [U(1500), U(15000), U(75000), U(300000)]);
  await escrow.setCooldownConfig(0, 0);
  for (const w of [wallet, h1, h2, h3, h4]) {
    await token.mint(w.address, U(10_000_000));
    await token.connect(w).approve(await escrow.getAddress(), ethers.MaxUint256);
    await escrow.connect(w).registerWallet();
  }
  await time.increase(2 * DAY + 1);
  return { owner, wallet, h1, h2, h3, h4, caller, token, escrow };
}

async function sell(c, amount, maker, taker) {
  const oid = await eventArg(
    await c.escrow.connect(maker).createSellOrder(await c.token.getAddress(), amount, amount, 0, R(), 0),
    c.escrow, "OrderCreated", "orderId"
  );
  return eventArg(await c.escrow.connect(taker).fillSellOrder(oid, amount, R()), c.escrow, "OrderFilled", "tradeId");
}

async function mutualCancel(c, taker) {
  const tid = await sell(c, U(30), c.wallet, taker);
  await c.escrow.connect(c.wallet).proposeOrApproveCancel(tid);
  await c.escrow.connect(taker).proposeOrApproveCancel(tid);
}

async function release(c, taker) {
  const tid = await sell(c, U(50), c.wallet, taker);
  await c.escrow.connect(taker).reportPayment(tid, "Qm");
  await c.escrow.connect(c.wallet).releaseFunds(tid);
}

// [TR] Cüzdanı bir kez banlar (repro: 5 karşılıklı iptal). [EN] Bans the wallet once.
async function bannedFixture() {
  const c = await base();
  for (const t of [c.h1, c.h1, c.h1, c.h1, c.h2]) await mutualCancel(c, t);
  const rep = await c.escrow.getReputation(c.wallet.address);
  expect(rep.consecutiveBans).to.equal(1n);
  c.bannedUntil = rep.bannedUntil;
  c.cleanPeriod = await c.escrow.cleanPeriod();
  return c;
}

// [TR] Ban bittikten sonra temiz dönemin içinde yeni olumsuz olaylar. [EN] Negative events inside the clean period.
async function negativeAfterBanFixture() {
  const c = await bannedFixture();
  await time.increaseTo(c.bannedUntil + 1n);
  for (let i = 0; i < 7; i++) await release(c, c.h3);
  await mutualCancel(c, c.h4);
  await mutualCancel(c, c.h4);
  const rep = await c.escrow.getReputation(c.wallet.address);
  expect(rep.bannedUntil).to.equal(c.bannedUntil);
  expect(rep.lastNegativeEventAt).to.be.gt(c.bannedUntil);
  expect(rep.riskPoints).to.be.gt(0n);
  c.lastNeg = rep.lastNegativeEventAt;
  return c;
}

describe("Dalga 2 K3-01: decayReputation son olumsuz olaydan sayar", function () {
  it("temiz dönemde olumsuz olay olan cüzdan ban bitimi + temiz dönemde affedilmez", async function () {
    const c = await loadFixture(negativeAfterBanFixture);
    const before = await c.escrow.getReputation(c.wallet.address);
    await time.increaseTo(c.bannedUntil + c.cleanPeriod + 1n);
    await expect(c.escrow.connect(c.caller).decayReputation(c.wallet.address))
      .to.be.revertedWithCustomError(c.escrow, "CleanPeriodNotElapsed");
    const after = await c.escrow.getReputation(c.wallet.address);
    expect(after.riskPoints).to.equal(before.riskPoints);
    expect(after.consecutiveBans).to.equal(1n);
  });

  it("sınır: son olumsuz olay + temiz dönem anında revert, bir saniye sonra af", async function () {
    const c = await loadFixture(negativeAfterBanFixture);
    await time.setNextBlockTimestamp(c.lastNeg + c.cleanPeriod);
    await expect(c.escrow.connect(c.caller).decayReputation(c.wallet.address))
      .to.be.revertedWithCustomError(c.escrow, "CleanPeriodNotElapsed");
    await time.setNextBlockTimestamp(c.lastNeg + c.cleanPeriod + 1n);
    await expect(c.escrow.connect(c.caller).decayReputation(c.wallet.address))
      .to.emit(c.escrow, "ReputationUpdated");
    const rep = await c.escrow.getReputation(c.wallet.address);
    expect(rep.riskPoints).to.equal(0n);
    expect(rep.consecutiveBans).to.equal(0n);
  });

  it("temiz kalan cüzdan ban bitimi + temiz dönemden bir saniye sonra affedilir (sınır anında değil)", async function () {
    const c = await loadFixture(bannedFixture);
    const rep0 = await c.escrow.getReputation(c.wallet.address);
    expect(rep0.lastNegativeEventAt).to.be.lte(c.bannedUntil);
    expect(rep0.riskPoints).to.be.gt(0n);
    await time.setNextBlockTimestamp(c.bannedUntil + c.cleanPeriod);
    await expect(c.escrow.connect(c.caller).decayReputation(c.wallet.address))
      .to.be.revertedWithCustomError(c.escrow, "CleanPeriodNotElapsed");
    await time.setNextBlockTimestamp(c.bannedUntil + c.cleanPeriod + 1n);
    await c.escrow.connect(c.caller).decayReputation(c.wallet.address);
    const rep = await c.escrow.getReputation(c.wallet.address);
    expect(rep.riskPoints).to.equal(0n);
    expect(rep.consecutiveBans).to.equal(0n);
  });

  it("hiç banlanmamış cüzdan eskisi gibi NoPriorBanHistory ile reddedilir", async function () {
    const c = await loadFixture(base);
    await expect(c.escrow.decayReputation(c.h1.address))
      .to.be.revertedWithCustomError(c.escrow, "NoPriorBanHistory");
  });
});
