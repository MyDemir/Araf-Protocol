// [TR] Rewards operasyonları tek dosyada: configure (yalnız wiring), verify (salt okunur hazırlık kontrolü),
//      switch-treasury (escrow treasury → vault; yalnız CONFIRM_TREASURY_SWITCH=true ile).
//      İşlem REWARDS_OP ile ya da npm script adından seçilir:
//        npm run configure:rewards | verify:rewards | switch:rewards:treasury
// [EN] Rewards ops in one file: configure (wiring only), verify (read-only readiness), switch-treasury
//      (escrow treasury → vault, only with CONFIRM_TREASURY_SWITCH=true). Chosen by REWARDS_OP or npm script.
const hre = require('hardhat');
const { ethers, network } = hre;
const fs = require('fs');
const path = require('path');

const ZERO = '0x0000000000000000000000000000000000000000';
const addr = (v, n) => {
  if (!v || !ethers.isAddress(v)) throw new Error(`${n} missing/invalid`);
  const normalized = ethers.getAddress(v);
  if (normalized === ZERO) throw new Error(`${n} zero address`);
  return normalized;
};

function loadManifest() {
  const p = path.resolve(__dirname, `../deployments/${network.name}-rewards.json`);
  return fs.existsSync(p) ? JSON.parse(fs.readFileSync(p, 'utf8')) : {};
}

function resolveAddresses(env, manifest) {
  return {
    escrowAddr: addr(env.ARAF_ESCROW_ADDRESS || manifest.escrow, 'ARAF_ESCROW_ADDRESS'),
    vaultAddr: addr(env.ARAF_REVENUE_VAULT_ADDRESS || manifest.vault, 'ARAF_REVENUE_VAULT_ADDRESS'),
    rewardsAddr: addr(env.ARAF_REWARDS_ADDRESS || manifest.rewards, 'ARAF_REWARDS_ADDRESS'),
    usdt: addr(env.USDT_ADDRESS || manifest.usdt, 'USDT_ADDRESS'),
    usdc: addr(env.USDC_ADDRESS || manifest.usdc, 'USDC_ADDRESS'),
  };
}

// [TR] Configure yalnız wiring yapar; treasury switch bilinçli olarak ayrı işlemdir.
// [EN] Configure is wiring-only; treasury switching is deliberately a separate op.
async function configure(env = process.env) {
  if (env.CONFIRM_SWITCH_TREASURY_TO_VAULT) {
    throw new Error('Treasury switch is intentionally separated. Use REWARDS_OP=switch-treasury with CONFIRM_TREASURY_SWITCH=true');
  }
  const { vaultAddr, rewardsAddr, usdt, usdc } = resolveAddresses(env, loadManifest());
  const vault = await ethers.getContractAt('ArafRevenueVault', vaultAddr);
  if ((await vault.rewards()) !== rewardsAddr) await (await vault.setRewards(rewardsAddr)).wait();
  if (!(await vault.supportedToken(usdt))) await (await vault.setSupportedToken(usdt, true)).wait();
  if (!(await vault.supportedToken(usdc))) await (await vault.setSupportedToken(usdc, true)).wait();
}

// [TR] Salt okunur go-live hazırlık kontrolü. [EN] Read-only go-live readiness check.
async function verify(env = process.env) {
  const { escrowAddr, vaultAddr, rewardsAddr, usdt, usdc } = resolveAddresses(env, loadManifest());
  const vault = await ethers.getContractAt('ArafRevenueVault', vaultAddr);
  const rewards = await ethers.getContractAt('ArafRewards', rewardsAddr);
  const escrow = await ethers.getContractAt('ArafEscrow', escrowAddr);
  const checks = [
    ['Vault.escrow', (await vault.escrow()) === escrowAddr],
    ['Vault.rewards', (await vault.rewards()) === rewardsAddr],
    ['Rewards.escrow', (await rewards.escrow()) === escrowAddr],
    ['Rewards.revenueVault', (await rewards.revenueVault()) === vaultAddr],
    ['rewardBps=4000', (await vault.rewardBps()) === 4000n],
    ['USDT supported', (await vault.supportedToken(usdt)) === true],
    ['USDC supported', (await vault.supportedToken(usdc)) === true],
  ];
  if (env.EXPECT_ESCROW_TREASURY_ADDRESS) {
    checks.push(['Escrow treasury', ethers.getAddress(await escrow.treasury()) === ethers.getAddress(env.EXPECT_ESCROW_TREASURY_ADDRESS)]);
  }
  let failed = false;
  for (const [name, passed] of checks) {
    if (passed) console.log(`OK   ${name}`);
    else { console.error(`FAIL ${name} mismatch`); failed = true; }
  }
  if (failed) throw new Error('Rewards deployment verification failed');
}

// [TR] Hassas: varsayılan fail-closed; wiring doğrulanmadan treasury değişmez.
// [EN] Sensitive: fail-closed by default; the treasury never moves before wiring is verified.
async function switchTreasury(env = process.env) {
  if (env.CONFIRM_TREASURY_SWITCH !== 'true') throw new Error('Refusing treasury switch. Set CONFIRM_TREASURY_SWITCH=true');
  const { escrowAddr, vaultAddr, rewardsAddr, usdt, usdc } = resolveAddresses(env, loadManifest());
  const vault = await ethers.getContractAt('ArafRevenueVault', vaultAddr);
  const rewards = await ethers.getContractAt('ArafRewards', rewardsAddr);
  const escrow = await ethers.getContractAt('ArafEscrow', escrowAddr);

  if ((await vault.escrow()) !== escrowAddr) throw new Error('vault.escrow mismatch');
  if ((await vault.rewards()) !== rewardsAddr) throw new Error('vault.rewards mismatch');
  if ((await rewards.escrow()) !== escrowAddr) throw new Error('rewards.escrow mismatch');
  if ((await rewards.revenueVault()) !== vaultAddr) throw new Error('rewards.revenueVault mismatch');
  const rewardBps = await vault.rewardBps();
  if (rewardBps !== 4000n && env.ALLOW_NON_4000_REWARD_BPS !== 'true') {
    throw new Error(`rewardBps must be 4000 for go-live. got=${rewardBps}`);
  }
  if (!(await vault.supportedToken(usdt))) throw new Error('USDT not supported');
  if (!(await vault.supportedToken(usdc))) throw new Error('USDC not supported');

  const current = await escrow.treasury();
  const expectedCurrent = addr(env.EXPECTED_CURRENT_TREASURY_ADDRESS, 'EXPECTED_CURRENT_TREASURY_ADDRESS');
  if (ethers.getAddress(current) !== expectedCurrent) throw new Error(`Escrow treasury mismatch. expected=${expectedCurrent} current=${current}`);

  console.warn('WARNING: switching escrow treasury to revenue vault.');
  await (await escrow.setTreasury(vaultAddr)).wait();
}

const OPS = { configure, verify, 'switch-treasury': switchTreasury };
const NPM_SCRIPT_OPS = { 'configure:rewards': 'configure', 'verify:rewards': 'verify', 'switch:rewards:treasury': 'switch-treasury' };

if (require.main === module) {
  const op = process.env.REWARDS_OP || NPM_SCRIPT_OPS[process.env.npm_lifecycle_event];
  const run = OPS[op];
  if (!run) {
    console.error(`Unknown rewards op "${op}". Use REWARDS_OP=${Object.keys(OPS).join('|')}`);
    process.exit(1);
  }
  run().catch((e) => { console.error(e); process.exit(1); });
}

module.exports = { loadManifest, resolveAddresses, configure, verify, switchTreasury };
