// [TR] Vault intent handshake'i transient storage kullanır (G2); intent + transfer + hook aynı tx'te olmalıdır.
//      Testlerde vault'un escrow'u MockRevenueEscrow'dur ve bu yardımcı üç adımı tek çağrıda yapar.
// [EN] The vault handshake uses transient storage (G2); tests drive it through MockRevenueEscrow in one tx.
const { ethers } = require("hardhat");

async function deployRevenueEscrow() {
  const m = await (await ethers.getContractFactory("MockRevenueEscrow")).deploy();
  await m.waitForDeployment();
  return m;
}

// token: mintable MockERC20 (owner = default signer). transferAmount defaults to amount.
async function pushRevenue(vault, token, amount, kind = 0, tradeId = 1, transferAmount = amount) {
  const escrowAddr = await vault.escrow();
  const pusher = await ethers.getContractAt("MockRevenueEscrow", escrowAddr);
  if (transferAmount > 0n) await token.mint(escrowAddr, transferAmount);
  return pusher.pushRevenue(await vault.getAddress(), await token.getAddress(), amount, transferAmount, kind, tradeId);
}

// [TR] K3-04: setRewards yalnız bu vault'a bağlı kontrat kabul eder. Vault birim testleri rewards'ı doğrudan
//      çağıran bir imza sahibi ister; bağ kontratı (MockRewardsBinding) kurulur ve adresi impersonate edilir.
//      currentEpoch 0 kalır, yani eski EOA rewards gibi StaleTargetEpoch kontrolü tetiklenmez.
// [EN] K3-04: setRewards only accepts a contract bound to the vault. Vault unit tests need a signer acting as
//      rewards: deploy MockRewardsBinding, wire it and impersonate its address (currentEpoch stays 0).
async function bindRewardsSigner(vault, owner) {
  const { network } = require("hardhat");
  const binding = await (await ethers.getContractFactory("MockRewardsBinding")).deploy(await vault.getAddress());
  await binding.waitForDeployment();
  const addr = await binding.getAddress();
  await (owner ? vault.connect(owner) : vault).setRewards(addr);
  await network.provider.send("hardhat_setBalance", [addr, "0x56BC75E2D63100000"]);
  return ethers.getImpersonatedSigner(addr);
}

module.exports = { deployRevenueEscrow, pushRevenue, bindRewardsSigner };
