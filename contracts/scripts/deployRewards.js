/**
 * ArafRevenueVault + ArafRewards deploy ve wiring.
 *
 * [TR] Sıra: (1) güvenlik kilidi (tx göndermeden), (2) Vault(escrow, finalTreasury, deployer),
 *      (3) Rewards(escrow, vault, deployer), (4) vault.setRewards(rewards)  ← TEK SEFERLİK (K4, RewardsAlreadySet),
 *      (5) vault.setSupportedToken(USDT/USDC), (6) FINAL_OWNER_ADDRESS farklıysa vault+rewards ownership devri,
 *      (7) zincir üstü doğrulama, (8) manifest deployments/<ağ>-rewards.json.
 *      Escrow'a DOKUNMAZ: escrow treasury → vault geçişi escrow owner'ının (multisig) ayrı ve bilinçli işidir
 *      (rewardsOps.js switch-treasury).
 * [EN] Order: lock (no tx), Vault, Rewards, one-shot vault.setRewards, supported tokens, ownership handoff,
 *      on-chain verification, manifest. Never touches the escrow; the treasury switch is a separate owner op.
 *
 * Kilit / lock: aynı ağda rewards manifest'i varsa, EXISTING_REVENUE_VAULT_ADDRESS'in rewards()'ı doluysa,
 * EXISTING_REWARDS_ADDRESS'te kod varsa ya da escrow.treasury() rewards'ı bağlı bir vault ise
 * CONFIRM_REDEPLOY_REWARDS=YES olmadan hiçbir tx gönderilmez. Not: CI runner'da manifest yoktur; orada kilidin
 * asıl dayanağı repo variable'larından gelen EXISTING_* adresleridir (GH_VARIABLES_TOKEN ile yazılır). Zincir
 * kontrolü yalnız bu adresler biliniyorsa işe yarar; bilinmeyen bir eski deploy'u kendi başına bulamaz.
 */
const hre = require('hardhat');
const { ethers, artifacts, network } = hre;
const fs = require('fs');
const path = require('path');

const LOCAL = new Set(['hardhat', 'localhost']);
const ZERO = '0x0000000000000000000000000000000000000000';
const REWARDS_SELECTOR_IFACE = new ethers.Interface(['function rewards() view returns (address)']);

const isLocalNetwork = (name, chainId) => LOCAL.has(name) || chainId === 31337n;
const isAddress = (v) => { try { return !!v && ethers.isAddress(v); } catch { return false; } };
const toAddr = (name, v) => { if (!isAddress(v) || v === ZERO) throw new Error(`${name} invalid address`); return ethers.getAddress(v); };
const reqEnv = (name, env = process.env) => toAddr(name, env[name]);
const optEnv = (name, env = process.env) => env[name] ? toAddr(name, env[name]) : null;
const ensureDir = (d) => fs.mkdirSync(d, { recursive: true });

function deploymentsDir(env = process.env) {
  return env.ARAF_DEPLOYMENTS_DIR ? path.resolve(env.ARAF_DEPLOYMENTS_DIR) : path.resolve(__dirname, '../deployments');
}

function resolvePublicTokens(chainId) {
  if (Number(chainId) === 8453) return { usdt: reqEnv('BASE_MAINNET_USDT_ADDRESS'), usdc: reqEnv('BASE_MAINNET_USDC_ADDRESS') };
  if (Number(chainId) === 84532) return { usdt: reqEnv('BASE_SEPOLIA_USDT_ADDRESS'), usdc: reqEnv('BASE_SEPOLIA_USDC_ADDRESS') };
  throw new Error(`Unsupported public chainId ${chainId}`);
}

async function maybeDeployMockToken(symbol) {
  const Mock = await ethers.getContractFactory('MockERC20');
  const t = await Mock.deploy(`Mock ${symbol}`, symbol, 6);
  await t.waitForDeployment();
  return await t.getAddress();
}

async function exportAbi(contractNames) {
  const outDir = path.resolve(__dirname, '../abi');
  ensureDir(outDir);
  for (const name of contractNames) {
    const art = await artifacts.readArtifact(name);
    fs.writeFileSync(path.join(outDir, `${name}.json`), JSON.stringify(art.abi, null, 2));
  }
}

const redeployConfirmed = (env) => env.CONFIRM_REDEPLOY_REWARDS === 'YES';

function assertManifestOverwriteSafety(existingManifest, nextManifest, env = process.env) {
  if (!existingManifest) return;
  const critical = ['escrow', 'vault', 'rewards', 'finalTreasury'];
  const changed = critical.filter((k) => existingManifest[k] && nextManifest[k] && existingManifest[k] !== nextManifest[k]);
  if (changed.length && env.CONFIRM_OVERWRITE_REWARDS_MANIFEST !== 'yes' && !redeployConfirmed(env)) {
    throw new Error(`Refusing to overwrite rewards manifest critical addresses: ${changed.join(', ')}. Set CONFIRM_OVERWRITE_REWARDS_MANIFEST=yes`);
  }
}

// [TR] Zincir üstü staticcall: addr'de kod yoksa ya da rewards() yoksa null, varsa dönen adres.
// [EN] On-chain staticcall: null when no code / no rewards(); otherwise the returned address.
async function readRewardsOf(provider, address) {
  if (!address) return null;
  const code = await provider.getCode(address);
  if (!code || code === '0x') return null;
  try {
    const data = await provider.call({ to: address, data: REWARDS_SELECTOR_IFACE.encodeFunctionData('rewards') });
    const [value] = REWARDS_SELECTOR_IFACE.decodeFunctionResult('rewards', data);
    return ethers.getAddress(value);
  } catch {
    return null;
  }
}

async function hasCode(provider, address) {
  if (!address) return false;
  const code = await provider.getCode(address);
  return !!code && code !== '0x';
}

/**
 * [TR] Tx göndermeden önce çalışır. Mevcut bir rewards kurulumu bulunursa CONFIRM_REDEPLOY_REWARDS=YES ister.
 * [EN] Runs before any tx. Requires CONFIRM_REDEPLOY_REWARDS=YES if an existing rewards setup is detected.
 * @returns {Promise<string[]>} bulunan nedenler / detected reasons
 */
async function assertRewardsRedeploySafety({ provider, existingManifest, escrowAddress, env = process.env }) {
  const reasons = [];
  if (existingManifest && (existingManifest.rewards || existingManifest.vault)) {
    reasons.push(`manifest (status=${existingManifest.status || 'complete'}) already has rewards=${existingManifest.rewards || 'n/a'} vault=${existingManifest.vault || 'n/a'}`);
  }
  const existingVault = optEnv('EXISTING_REVENUE_VAULT_ADDRESS', env) || (existingManifest && existingManifest.vault && isAddress(existingManifest.vault) ? ethers.getAddress(existingManifest.vault) : null);
  const existingRewards = optEnv('EXISTING_REWARDS_ADDRESS', env);
  const vaultRewards = await readRewardsOf(provider, existingVault);
  if (vaultRewards && vaultRewards !== ZERO) reasons.push(`existing vault ${existingVault} already wired: rewards()=${vaultRewards}`);
  if (await hasCode(provider, existingRewards)) reasons.push(`existing rewards contract has code at ${existingRewards}`);
  if (escrowAddress && (await hasCode(provider, escrowAddress))) {
    const escrow = await ethers.getContractAt('ArafEscrow', escrowAddress);
    const treasury = ethers.getAddress(await escrow.treasury());
    const treasuryRewards = await readRewardsOf(provider, treasury);
    if (treasuryRewards && treasuryRewards !== ZERO) reasons.push(`escrow treasury ${treasury} is already a vault wired to rewards ${treasuryRewards}`);
  }
  if (reasons.length && !redeployConfirmed(env)) {
    throw new Error(
      `Refusing rewards redeploy (no tx sent): ${reasons.join('; ')}. ` +
      'vault.setRewards is one-shot (RewardsAlreadySet); a redeploy orphans the old vault/rewards. ' +
      'Set CONFIRM_REDEPLOY_REWARDS=YES only if this is intentional.'
    );
  }
  return reasons;
}

// [TR] Ownable TEK ADIMLIDIR (Ownable2Step değil): yanlış adrese devir geri alınamaz; finalOwner önceden doğrulanır.
// [EN] Ownable is single-step: a transfer to a wrong address cannot be undone.
async function transferIfNeeded(contract, label, finalOwner) {
  const address = await contract.getAddress();
  const current = ethers.getAddress(await contract.owner());
  if (current === finalOwner) return;
  try {
    await (await contract.transferOwnership(finalOwner)).wait();
  } catch (err) {
    throw new Error(`${label} ownership transfer failed; deployer still owner of ${address} (${err && err.message ? err.message.split('\n')[0] : err})`);
  }
  const after = ethers.getAddress(await contract.owner());
  if (after !== finalOwner) throw new Error(`${label} ownership transfer failed; deployer still owner of ${address} (owner()=${after}, expected ${finalOwner})`);
}

async function describeOwners(vault, rewards) {
  const read = async (c) => { try { return ethers.getAddress(await c.owner()); } catch { return 'unreadable'; } };
  return { vaultOwner: await read(vault), rewardsOwner: await read(rewards) };
}

async function verifyWiring({ vault, rewards, escrowAddress, vaultAddress, rewardsAddress, finalTreasury, finalOwner, usdt, usdc }) {
  const checks = [
    ['vault.escrow', ethers.getAddress(await vault.escrow()) === escrowAddress],
    ['vault.rewards', ethers.getAddress(await vault.rewards()) === rewardsAddress],
    ['vault.finalTreasury', ethers.getAddress(await vault.finalTreasury()) === finalTreasury],
    ['vault.owner', ethers.getAddress(await vault.owner()) === finalOwner],
    ['rewards.escrow', ethers.getAddress(await rewards.escrow()) === escrowAddress],
    ['rewards.revenueVault', ethers.getAddress(await rewards.revenueVault()) === vaultAddress],
    ['rewards.owner', ethers.getAddress(await rewards.owner()) === finalOwner],
    ['USDT supported', (await vault.supportedToken(usdt)) === true],
    ['USDC supported', (await vault.supportedToken(usdc)) === true],
  ];
  const failed = checks.filter(([, ok]) => !ok).map(([n]) => n);
  if (failed.length) throw new Error(`Rewards wiring verification failed: ${failed.join(', ')}`);
}

async function main(env = process.env, opts = {}) {
  const [deployer] = await ethers.getSigners();
  const net = await ethers.provider.getNetwork();
  const local = isLocalNetwork(network.name, net.chainId);
  const finalOwner = optEnv('FINAL_OWNER_ADDRESS', env) || deployer.address;

  let escrowAddress = optEnv('ARAF_ESCROW_ADDRESS', env);
  const finalTreasury = local ? (optEnv('FINAL_TREASURY_ADDRESS', env) || deployer.address) : reqEnv('FINAL_TREASURY_ADDRESS', env);

  const depDir = deploymentsDir(env);
  const manifestPath = path.join(depDir, `${network.name}-rewards.json`);
  const existing = fs.existsSync(manifestPath) ? JSON.parse(fs.readFileSync(manifestPath, 'utf8')) : null;

  if (!local) {
    if (!escrowAddress) {
      if (env.CONFIRM_FRESH_ESCROW_DEPLOY !== 'yes') {
        throw new Error('ARAF_ESCROW_ADDRESS required for public networks. If migration requires fresh escrow deployment, set CONFIRM_FRESH_ESCROW_DEPLOY=yes and deploy escrow manually first.');
      }
      throw new Error('Fresh escrow deployment on public network must be executed in a dedicated migration script.');
    }
    if (!(await hasCode(ethers.provider, escrowAddress))) throw new Error(`ARAF_ESCROW_ADDRESS has no code on chain ${net.chainId}`);
  }

  // [TR] Kilit: hiçbir tx'ten önce. [EN] Lock: before any tx.
  const reasons = await assertRewardsRedeploySafety({ provider: ethers.provider, existingManifest: existing, escrowAddress, env });
  if (reasons.length) console.warn(`WARNING: CONFIRM_REDEPLOY_REWARDS=YES; replacing existing rewards setup: ${reasons.join('; ')}`);

  let usdt = null; let usdc = null;
  if (local) {
    usdt = optEnv('BASE_MAINNET_USDT_ADDRESS', env) || optEnv('BASE_SEPOLIA_USDT_ADDRESS', env);
    usdc = optEnv('BASE_MAINNET_USDC_ADDRESS', env) || optEnv('BASE_SEPOLIA_USDC_ADDRESS', env);
    if (!usdt) usdt = await maybeDeployMockToken('USDT');
    if (!usdc) usdc = await maybeDeployMockToken('USDC');

    if (!escrowAddress) {
      const treasury = reqEnv('TREASURY_ADDRESS', env);
      // ArafEscrow library linkli deploy edilir (ArafReputationLib + ArafSettlementLib); bkz. deploy.js.
      const { deployEscrowWithLibraries } = require('./deploy');
      const { escrow } = await deployEscrowWithLibraries(treasury);
      escrowAddress = await escrow.getAddress();
    }
  } else {
    ({ usdt, usdc } = resolvePublicTokens(net.chainId));
  }

  // [TR] Constructor owner = deployer: setRewards/setSupportedToken onlyOwner'dır. Wiring sonrası devredilir.
  // [EN] Constructor owner = deployer so the onlyOwner wiring can run; handed off to FINAL_OWNER afterwards.
  const constructorOwner = deployer.address;
  const finalOwnerKind = (await hasCode(ethers.provider, finalOwner)) ? 'contract (multisig?)' : 'EOA (no code)';
  console.log(`Final owner: ${finalOwner} [${finalOwnerKind}]`);

  const Vault = await ethers.getContractFactory('ArafRevenueVault');
  const vault = await Vault.deploy(escrowAddress, finalTreasury, constructorOwner);
  await vault.waitForDeployment();
  const vaultAddress = await vault.getAddress();

  const Rewards = await ethers.getContractFactory('ArafRewards');
  const rewards = await Rewards.deploy(escrowAddress, vaultAddress, constructorOwner);
  await rewards.waitForDeployment();
  const rewardsAddress = await rewards.getAddress();

  const manifest = {
    status: 'pending',
    network: network.name,
    chainId: Number(net.chainId),
    escrow: escrowAddress,
    vault: vaultAddress,
    rewards: rewardsAddress,
    usdt,
    usdc,
    // [TR] owner = constructor argümanı (verify.js bunu kullanır); finalOwner = devir sonrası owner.
    // [EN] owner = constructor arg (used by verify.js); finalOwner = post-handoff owner.
    owner: constructorOwner,
    finalOwner,
    finalOwnerKind,
    finalTreasury,
    deployer: deployer.address,
    vaultDeployTxHash: vault.deploymentTransaction()?.hash ?? null,
    rewardsDeployTxHash: rewards.deploymentTransaction()?.hash ?? null,
    rewardBps: null,
    deployedAt: new Date().toISOString()
  };

  // [TR] Kısmi (pending) manifest: wiring yarıda kalırsa adresler kaybolmaz ve kilit sonraki çalıştırmada görür.
  // [EN] Partial manifest so addresses survive a failed wiring and the lock sees them next time.
  ensureDir(depDir);
  if (existing) {
    // [TR] Kritik deployment adreslerinin sessizce ezilmesini engeller.
    // [EN] Prevent silent overwrite of critical deployment addresses.
    assertManifestOverwriteSafety(existing, manifest, env);
  }
  fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2));

  try {
    if (opts.afterDeploy) await opts.afterDeploy({ vault, rewards });
    // GERİ ALINAMAZ / IRREVERSIBLE: one-shot (RewardsAlreadySet).
    await (await vault.setRewards(rewardsAddress)).wait();
    await (await vault.setSupportedToken(usdt, true)).wait();
    await (await vault.setSupportedToken(usdc, true)).wait();
    const rewardBps = await vault.rewardBps();
    if (rewardBps !== 4000n) throw new Error(`rewardBps mismatch: ${rewardBps}`);
    manifest.rewardBps = rewardBps.toString();

    await transferIfNeeded(vault, 'vault', finalOwner);
    await transferIfNeeded(rewards, 'rewards', finalOwner);
    await verifyWiring({ vault, rewards, escrowAddress, vaultAddress, rewardsAddress, finalTreasury, finalOwner, usdt, usdc });
  } catch (err) {
    const owners = await describeOwners(vault, rewards);
    console.error('REWARDS DEPLOY INCOMPLETE (manifest status=pending):');
    console.error(`  vault   : ${vaultAddress} owner=${owners.vaultOwner}${owners.vaultOwner === deployer.address ? ' (deployer still owner)' : ''}`);
    console.error(`  rewards : ${rewardsAddress} owner=${owners.rewardsOwner}${owners.rewardsOwner === deployer.address ? ' (deployer still owner)' : ''}`);
    console.error(`  manifest: ${manifestPath}`);
    throw err;
  }

  manifest.status = 'complete';
  fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2));
  if (env.SKIP_ABI_EXPORT !== 'true') await exportAbi(['ArafEscrow', 'ArafRevenueVault', 'ArafRewards']);
  console.log(`Rewards deployment complete. Final owner: ${finalOwner} [${finalOwnerKind}]`);
  console.log(manifest);
  return { manifest, manifestPath };
}

if (require.main === module) {
  main().catch((e) => { console.error(e); process.exit(1); });
}

module.exports = {
  main,
  isLocalNetwork,
  resolvePublicTokens,
  assertManifestOverwriteSafety,
  assertRewardsRedeploySafety,
  readRewardsOf,
  transferIfNeeded,
};
