const { expect } = require("chai");
const { ethers } = require("hardhat");
const { time, setBalance, loadFixture } = require("@nomicfoundation/hardhat-network-helpers");
const { deployEscrowWithLibraries } = require("../../contracts/scripts/deploy");

// [TR] Alış emri AÇILIRKEN cüzdan yaşı aranmaz; ban/DUST/cooldown açılışta sürer; yaş fillBuyOrder'da aranır.
// [EN] Wallet age is NOT checked when OPENING a buy order; ban/DUST/cooldown still apply at create;
//      age is enforced at fillBuyOrder (and fillSellOrder taker entry).
const U = (x) => ethers.parseUnits(String(x), 6);
const DAY = 24 * 3600;
let n = 0;
const R = () => ethers.id("buy-age-" + n++);

async function eventArg(tx, c, name, key) {
  const r = await tx.wait();
  for (const l of r.logs) {
    try { const p = c.interface.parseLog(l); if (p && p.name === name) return p.args[key]; } catch (_) { /* other */ }
  }
  throw new Error(name);
}

async function fixture() {
  const [owner, treasury, maker, taker, helper, other, helper2] = await ethers.getSigners();
  const token = await (await ethers.getContractFactory("MockERC20")).deploy("USDT", "USDT", 6);
  const { escrow } = await deployEscrowWithLibraries(treasury.address);
  await escrow.setTokenConfig(await token.getAddress(), true, true, true, 6, [U(1500), U(15000), U(75000), U(300000)]);
  for (const w of [maker, taker, helper, other, helper2]) {
    await token.mint(w.address, U(100000));
    await token.connect(w).approve(await escrow.getAddress(), ethers.MaxUint256);
    await escrow.connect(w).registerWallet();
  }
  await time.increase(2 * DAY + 1);
  // [TR] fresh: yaşı dolmamış taze kayıt; stranger: hiç kayıt yok.
  // [EN] fresh: registered but below the age minimum; stranger: never registered.
  const fresh = (await ethers.getSigners())[8];
  await token.mint(fresh.address, U(100000));
  await token.connect(fresh).approve(await escrow.getAddress(), ethers.MaxUint256);
  await escrow.connect(fresh).registerWallet();
  const stranger = (await ethers.getSigners())[9];
  await token.mint(stranger.address, U(100000));
  await token.connect(stranger).approve(await escrow.getAddress(), ethers.MaxUint256);
  return { escrow, token, owner, maker, taker, helper, other, helper2, fresh, stranger };
}

async function createBuy(c, w, tier = 0) {
  return c.escrow.connect(w).createBuyOrder(await c.token.getAddress(), U(100), U(100), tier, R(), 0);
}

describe("createBuyOrder wallet-age relaxation", function () {
  it("(a) a <2d registered wallet with ETH can create a buy order", async function () {
    const c = await loadFixture(fixture);
    await expect(createBuy(c, c.fresh)).to.emit(c.escrow, "OrderCreated");
  });

  it("(b) the same order is rejected at fillBuyOrder with WalletTooYoung until the age is reached, then fills", async function () {
    const c = await loadFixture(fixture);
    const oid = await eventArg(await createBuy(c, c.fresh), c.escrow, "OrderCreated", "orderId");
    await time.increase(2 * DAY - 600);
    await expect(c.escrow.connect(c.maker).fillBuyOrder(oid, U(100), R()))
      .to.be.revertedWithCustomError(c.escrow, "WalletTooYoung");
    await time.increase(700);
    await expect(c.escrow.connect(c.maker).fillBuyOrder(oid, U(100), R())).to.emit(c.escrow, "OrderFilled");
  });

  it("(g) a never-registered wallet is rejected at createBuyOrder with WalletTooYoung", async function () {
    const c = await loadFixture(fixture);
    await expect(createBuy(c, c.stranger)).to.be.revertedWithCustomError(c.escrow, "WalletTooYoung");
  });

  it("(c) a banned wallet is still rejected at createBuyOrder", async function () {
    const c = await loadFixture(fixture);
    await c.escrow.setCooldownConfig(0, 0);
    for (const t of [c.taker, c.helper, c.other, c.helper2, c.taker]) {
      const oid = await eventArg(
        await c.escrow.connect(c.maker).createSellOrder(await c.token.getAddress(), U(30), U(30), 0, R(), 0),
        c.escrow, "OrderCreated", "orderId");
      const tid = await eventArg(await c.escrow.connect(t).fillSellOrder(oid, U(30), R()), c.escrow, "OrderFilled", "tradeId");
      await c.escrow.connect(c.maker).proposeOrApproveCancel(tid);
      await c.escrow.connect(t).proposeOrApproveCancel(tid);
    }
    expect((await c.escrow.getReputation(c.maker.address)).bannedUntil).to.be.gt(BigInt(await time.latest()));
    await expect(createBuy(c, c.maker)).to.be.revertedWithCustomError(c.escrow, "TakerBanActive");
  });

  it("(d) a wallet below DUST_LIMIT is still rejected at createBuyOrder", async function () {
    const c = await loadFixture(fixture);
    // [TR] Gas peşin düşüldüğü için tam DUST_LIMIT bakiye, çağrı anında DUST altına iner.
    // [EN] Gas is prepaid, so a balance of exactly DUST_LIMIT drops below it at call time.
    await setBalance(c.fresh.address, ethers.parseEther("0.001"));
    await expect(c.escrow.connect(c.fresh).createBuyOrder(await c.token.getAddress(), U(100), U(100), 0, R(), 0, { gasLimit: 500000, maxFeePerGas: 100000, maxPriorityFeePerGas: 0 }))
      .to.be.revertedWithCustomError(c.escrow, "InsufficientNativeBalance");
  });

  it("(e) tier cooldown is still applied at createBuyOrder", async function () {
    const c = await loadFixture(fixture);
    const oid = await eventArg(
      await c.escrow.connect(c.maker).createSellOrder(await c.token.getAddress(), U(100), U(100), 0, R(), 0),
      c.escrow, "OrderCreated", "orderId");
    await c.escrow.connect(c.taker).fillSellOrder(oid, U(100), R());
    await expect(createBuy(c, c.taker)).to.be.revertedWithCustomError(c.escrow, "TierCooldownActive");
  });

  it("(f) fillSellOrder taker entry still enforces wallet age", async function () {
    const c = await loadFixture(fixture);
    const oid = await eventArg(
      await c.escrow.connect(c.maker).createSellOrder(await c.token.getAddress(), U(100), U(100), 0, R(), 0),
      c.escrow, "OrderCreated", "orderId");
    await expect(c.escrow.connect(c.fresh).fillSellOrder(oid, U(100), R()))
      .to.be.revertedWithCustomError(c.escrow, "WalletTooYoung");
  });
});
