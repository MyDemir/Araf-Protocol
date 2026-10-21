const hre = require('hardhat');
const { ethers, network } = hre;
const { formatError } = require('./lib/redact');

// [TR] Çağrının BEKLENEN custom error ile revert ettiğini doğrular. Ağ/yetki/başka revert hatası 'reddedildi' sayılmaz (K4-19c).
// [EN] Asserts the call reverts with the EXPECTED custom error; network/permission/other errors are not a pass.
async function expectCustomRevert(fn, iface, expectedName) {
  let got = 'no revert (did not revert)';
  try {
    await fn();
  } catch (e) {
    let name = e && e.revert && e.revert.name;
    if (!name && e && typeof e.data === 'string' && e.data.startsWith('0x')) {
      try { name = iface.parseError(e.data)?.name; } catch { /* decode edilemedi */ }
    }
    if (name === expectedName) return;
    got = `error ${name || (e && e.code) || 'unknown'}`;
  }
  throw new Error(`expected revert ${expectedName}, got ${got}`);
}

async function main() {
  const net = await ethers.provider.getNetwork();
  const isLocal = ['hardhat', 'localhost'].includes(network.name) || net.chainId === 31337n;
  if (!isLocal && process.env.CONFIRM_PUBLIC_SMOKE !== 'yes') {
    throw new Error('Refusing public smoke. Set CONFIRM_PUBLIC_SMOKE=yes');
  }

  const [owner, user] = await ethers.getSigners();
  const Mock = await ethers.getContractFactory('MockERC20');
  const token = await Mock.deploy('Mock USDT', 'USDT', 6);
  await token.waitForDeployment();

  const EscrowView = await ethers.getContractFactory('MockEscrowRewardView');
  const esc = await EscrowView.deploy();
  await esc.waitForDeployment();

  const Vault = await ethers.getContractFactory('ArafRevenueVault');
  const vault = await Vault.deploy(await esc.getAddress(), owner.address, owner.address);
  await vault.waitForDeployment();
  const Rewards = await ethers.getContractFactory('ArafRewards');
  const rewards = await Rewards.deploy(await esc.getAddress(), await vault.getAddress(), owner.address);
  await rewards.waitForDeployment();

  await (await vault.setRewards(await rewards.getAddress())).wait();
  await (await vault.setSupportedToken(await token.getAddress(), true)).wait();

  await expectCustomRevert(() => vault.setRewardBps(3999), vault.interface, 'RewardBpsOutOfRange');
  await expectCustomRevert(() => vault.setRewardBps(7001), vault.interface, 'RewardBpsOutOfRange');

  await (await token.mint(owner.address, 1_000_000_000)).wait();
  await (await token.approve(await vault.getAddress(), 1_000_000_000)).wait();
  await (await vault.fundGlobalRewards(await token.getAddress(), 100_000_000, await rewards.currentEpoch(), ethers.id('smoke'))).wait();

  const reserve = await vault.rewardReserve(await token.getAddress());
  // [TR] rewardReserve yalnız escrow geliri ile dolar (bu smoke'ta 0 olabilir); 0 ZeroAmount'a takılıp sahte geçmesin diye min 1.
  // [EN] rewardReserve is only credited by escrow revenue (may be 0 here); use at least 1 so ZeroAmount cannot mask the check.
  const probeAmount = reserve > 0n ? reserve : 1n;
  const tokenAddress = await token.getAddress();
  await expectCustomRevert(
    () => vault.withdrawTreasuryShare(tokenAddress, probeAmount, user.address),
    vault.interface, 'InsufficientTreasuryReserve'
  );

  console.log('✅ smokeRewards checks passed');
}

if (require.main === module) main().catch((e) => { console.error(formatError(e)); process.exit(1); });

module.exports = { main, expectCustomRevert };
