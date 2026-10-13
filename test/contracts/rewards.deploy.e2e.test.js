// [TR] deploy.js → deployRewards.js zincirini in-process hardhat ağında uçtan uca çalıştırır:
//      manifest'ler, zincir üstü wiring, owner devri ve ikinci çalıştırmada güvenlik kilidi.
// [EN] End-to-end deploy.js → deployRewards.js on the in-process hardhat network.
const { expect } = require('chai');
const { ethers } = require('hardhat');
const fs = require('fs');
const os = require('os');
const path = require('path');

const deployScript = require('../../contracts/scripts/deploy');
const rewardsScript = require('../../contracts/scripts/deployRewards');

describe('deploy.js + deployRewards.js end-to-end (hardhat)', function () {
  this.timeout(120000);
  const prevEnv = { ...process.env };
  let dir;
  let signers;

  beforeEach(async function () {
    signers = await ethers.getSigners();
    dir = fs.mkdtempSync(path.join(os.tmpdir(), 'araf-deploy-e2e-'));
    for (const k of ['ARAF_ESCROW_ADDRESS', 'FINAL_OWNER_ADDRESS', 'FINAL_TREASURY_ADDRESS', 'CONFIRM_REDEPLOY_REWARDS',
      'CONFIRM_OVERWRITE_REWARDS_MANIFEST', 'EXISTING_REVENUE_VAULT_ADDRESS', 'EXISTING_REWARDS_ADDRESS',
      'BASE_MAINNET_USDT_ADDRESS', 'BASE_MAINNET_USDC_ADDRESS', 'BASE_SEPOLIA_USDT_ADDRESS', 'BASE_SEPOLIA_USDC_ADDRESS',
      'USE_EXTERNAL_TOKEN_ADDRESSES', 'NODE_ENV']) delete process.env[k];
    process.env.ARAF_DEPLOYMENTS_DIR = dir;
    process.env.SKIP_FRONTEND_ENV_WRITE = 'true';
    process.env.SKIP_ABI_EXPORT = 'true';
  });

  afterEach(function () {
    process.env = { ...prevEnv };
    fs.rmSync(dir, { recursive: true, force: true });
  });

  async function deployEscrow() {
    const [, treasury, multisig] = signers;
    process.env.TREASURY_ADDRESS = treasury.address;
    process.env.FINAL_OWNER_ADDRESS = multisig.address;
    const { manifest } = await deployScript.main();
    return manifest;
  }

  function rewardsEnv(escrowManifest) {
    const [, , multisig, finalTreasury] = signers;
    const usdt = escrowManifest.tokens.find((t) => t.symbol === 'USDT').address;
    const usdc = escrowManifest.tokens.find((t) => t.symbol === 'USDC').address;
    return {
      ...process.env,
      ARAF_ESCROW_ADDRESS: escrowManifest.escrowAddress,
      FINAL_OWNER_ADDRESS: multisig.address,
      FINAL_TREASURY_ADDRESS: finalTreasury.address,
      BASE_SEPOLIA_USDT_ADDRESS: usdt,
      BASE_SEPOLIA_USDC_ADDRESS: usdc,
    };
  }

  it('deploys escrow, vault and rewards; wires them and hands ownership to FINAL_OWNER', async function () {
    const [deployer, treasury, multisig, finalTreasury] = signers;
    const escrowManifest = await deployEscrow();
    expect(fs.existsSync(path.join(dir, 'hardhat.json'))).to.equal(true);

    const { manifest } = await rewardsScript.main(rewardsEnv(escrowManifest));
    const onDisk = JSON.parse(fs.readFileSync(path.join(dir, 'hardhat-rewards.json'), 'utf8'));
    expect(onDisk.vault).to.equal(manifest.vault);
    expect(onDisk.escrow).to.equal(escrowManifest.escrowAddress);
    expect(onDisk.owner).to.equal(deployer.address); // constructor arg (verify.js)
    expect(onDisk.finalOwner).to.equal(multisig.address);
    expect(onDisk.finalTreasury).to.equal(finalTreasury.address);

    const escrow = await ethers.getContractAt('ArafEscrow', manifest.escrow);
    const vault = await ethers.getContractAt('ArafRevenueVault', manifest.vault);
    const rewards = await ethers.getContractAt('ArafRewards', manifest.rewards);
    expect(await escrow.owner()).to.equal(multisig.address);
    // deployRewards escrow'a dokunmaz; treasury switch ayrı owner işlemidir (K8).
    expect(await escrow.treasury()).to.equal(treasury.address);
    expect(await vault.escrow()).to.equal(manifest.escrow);
    expect(await vault.rewards()).to.equal(manifest.rewards);
    expect(await vault.finalTreasury()).to.equal(finalTreasury.address);
    expect(await vault.owner()).to.equal(multisig.address);
    expect(await vault.rewardBps()).to.equal(4000n);
    expect(await vault.supportedToken(manifest.usdt)).to.equal(true);
    expect(await vault.supportedToken(manifest.usdc)).to.equal(true);
    expect(await rewards.escrow()).to.equal(manifest.escrow);
    expect(await rewards.revenueVault()).to.equal(manifest.vault);
    expect(await rewards.owner()).to.equal(multisig.address);
  });

  it('second run on the same network is refused before any tx unless CONFIRM_REDEPLOY_REWARDS=YES', async function () {
    const escrowManifest = await deployEscrow();
    const env = rewardsEnv(escrowManifest);
    const { manifest: first } = await rewardsScript.main(env);

    const nonceBefore = await ethers.provider.getTransactionCount(signers[0].address);
    let err;
    try { await rewardsScript.main(env); } catch (e) { err = e; }
    expect(err && err.message).to.match(/Refusing rewards redeploy \(no tx sent\).*CONFIRM_REDEPLOY_REWARDS=YES/);
    expect(await ethers.provider.getTransactionCount(signers[0].address)).to.equal(nonceBefore);
    const kept = JSON.parse(fs.readFileSync(path.join(dir, 'hardhat-rewards.json'), 'utf8'));
    expect(kept.rewards).to.equal(first.rewards);

    // "yes" (küçük harf) onay sayılmaz.
    let err2;
    try { await rewardsScript.main({ ...env, CONFIRM_REDEPLOY_REWARDS: 'yes' }); } catch (e) { err2 = e; }
    expect(err2 && err2.message).to.match(/Refusing rewards redeploy/);

    const { manifest: second } = await rewardsScript.main({ ...env, CONFIRM_REDEPLOY_REWARDS: 'YES' });
    expect(second.rewards).to.not.equal(first.rewards);
  });

  it('on-chain lock: refuses when EXISTING_REVENUE_VAULT_ADDRESS is already wired (no manifest on runner)', async function () {
    const escrowManifest = await deployEscrow();
    const env = rewardsEnv(escrowManifest);
    const { manifest: first } = await rewardsScript.main(env);
    fs.rmSync(path.join(dir, 'hardhat-rewards.json'));

    let err;
    try { await rewardsScript.main({ ...env, EXISTING_REVENUE_VAULT_ADDRESS: first.vault }); } catch (e) { err = e; }
    expect(err && err.message).to.match(/existing vault .* already wired/);

    let err2;
    try { await rewardsScript.main({ ...env, EXISTING_REWARDS_ADDRESS: first.rewards }); } catch (e) { err2 = e; }
    expect(err2 && err2.message).to.match(/existing rewards contract has code/);
  });

  it('on-chain lock: refuses when escrow.treasury() already points to a wired vault', async function () {
    const [, treasury, multisig] = signers;
    const escrowManifest = await deployEscrow();
    const env = rewardsEnv(escrowManifest);
    const { manifest: first } = await rewardsScript.main(env);
    fs.rmSync(path.join(dir, 'hardhat-rewards.json'));
    const escrow = await ethers.getContractAt('ArafEscrow', first.escrow);
    await (await escrow.connect(multisig).setTreasury(first.vault)).wait();
    expect(treasury.address).to.not.equal(first.vault);

    let err;
    try { await rewardsScript.main(env); } catch (e) { err = e; }
    expect(err && err.message).to.match(/escrow treasury .* already a vault wired to rewards/);
  });

  it('fresh network with unused addresses passes the lock and returns no reasons', async function () {
    const escrowManifest = await deployEscrow();
    const reasons = await rewardsScript.assertRewardsRedeploySafety({
      provider: ethers.provider,
      existingManifest: null,
      escrowAddress: escrowManifest.escrowAddress,
      env: { EXISTING_REWARDS_ADDRESS: signers[5].address },
    });
    expect(reasons).to.deep.equal([]);
  });
});
