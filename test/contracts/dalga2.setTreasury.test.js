const { expect } = require("chai");
const { ethers } = require("hardhat");
const { loadFixture } = require("@nomicfoundation/hardhat-network-helpers");
const { deployEscrowWithLibraries } = require("../../contracts/scripts/deploy");

// [TR] Dalga 2 / K1-02: setTreasury yalnız bu escrow'a bağlı vault'u (vault.escrow() == address(this)) kabul eder.
// [EN] Wave 2 / K1-02: setTreasury only accepts a vault wired to this escrow (vault.escrow() == address(this)).
describe("Dalga 2 K1-02: setTreasury vault eşleşme kontrolü", function () {
  async function fixture() {
    const [owner, finalTreasury, eoa, stranger] = await ethers.getSigners();
    const { escrow } = await deployEscrowWithLibraries(finalTreasury.address);
    const { escrow: otherEscrow } = await deployEscrowWithLibraries(finalTreasury.address);
    const Vault = await ethers.getContractFactory("ArafRevenueVault");
    const vault = await Vault.deploy(await escrow.getAddress(), finalTreasury.address, owner.address);
    const foreignVault = await Vault.deploy(await otherEscrow.getAddress(), finalTreasury.address, owner.address);
    return { owner, finalTreasury, eoa, stranger, escrow, otherEscrow, vault, foreignVault };
  }

  it("bu escrow'a bağlı vault kabul edilir ve TreasuryUpdated yayılır", async function () {
    const { escrow, vault } = await loadFixture(fixture);
    const addr = await vault.getAddress();
    await expect(escrow.setTreasury(addr)).to.emit(escrow, "TreasuryUpdated").withArgs(addr);
    expect(await escrow.treasury()).to.equal(addr);
  });

  it("başka escrow'a bağlı vault TreasuryEscrowMismatch ile reddedilir, hazine değişmez", async function () {
    const { escrow, foreignVault, finalTreasury } = await loadFixture(fixture);
    const addr = await foreignVault.getAddress();
    await expect(escrow.setTreasury(addr))
      .to.be.revertedWithCustomError(escrow, "TreasuryEscrowMismatch").withArgs(addr);
    expect(await escrow.treasury()).to.equal(finalTreasury.address);
  });

  it("EOA (kodsuz adres) TreasuryEscrowMismatch ile reddedilir", async function () {
    const { escrow, eoa } = await loadFixture(fixture);
    await expect(escrow.setTreasury(eoa.address))
      .to.be.revertedWithCustomError(escrow, "TreasuryEscrowMismatch").withArgs(eoa.address);
  });

  it("hiç kullanılmamış (kodu olmayan) adres reddedilir", async function () {
    const { escrow } = await loadFixture(fixture);
    const empty = ethers.Wallet.createRandom().address;
    expect(await ethers.provider.getCode(empty)).to.equal("0x");
    await expect(escrow.setTreasury(empty))
      .to.be.revertedWithCustomError(escrow, "TreasuryEscrowMismatch").withArgs(empty);
  });

  it("escrow() getter'ı olmayan kontrat (çağrı revert eder) reddedilir", async function () {
    const { escrow } = await loadFixture(fixture);
    const reverter = await (await ethers.getContractFactory("MockRevenueReceiverReverter")).deploy();
    const addr = await reverter.getAddress();
    await expect(escrow.setTreasury(addr))
      .to.be.revertedWithCustomError(escrow, "TreasuryEscrowMismatch").withArgs(addr);
  });

  it("sıfır adres eskisi gibi OwnableInvalidOwner ile reddedilir", async function () {
    const { escrow } = await loadFixture(fixture);
    await expect(escrow.setTreasury(ethers.ZeroAddress))
      .to.be.revertedWithCustomError(escrow, "OwnableInvalidOwner").withArgs(ethers.ZeroAddress);
  });

  it("owner yetkisi değişmedi: owner olmayan eşleşen vault'la bile reddedilir", async function () {
    const { escrow, vault, stranger } = await loadFixture(fixture);
    await expect(escrow.connect(stranger).setTreasury(await vault.getAddress()))
      .to.be.revertedWithCustomError(escrow, "OwnableUnauthorizedAccount").withArgs(stranger.address);
  });
});
