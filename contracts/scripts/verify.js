/**
 * [TR] Deploy sonrası BaseScan/Etherscan V2 (+ Sourcify) doğrulaması. deployments/<ağ>.json ve
 *      deployments/<ağ>-rewards.json kayıtlarından constructor argümanlarını ve library adreslerini okur.
 *      Kullanım:
 *        npm --prefix contracts run verify                 (base-sepolia)
 *        npm --prefix contracts run verify:base            (base mainnet)
 *        VERIFY_DRY_RUN=true npm --prefix contracts run verify   (ağ çağrısı yapmadan planı yazdır)
 * [EN] Post-deploy verification driven by the deployment manifests written by deploy.js /
 *      deployRewards.js. "Already Verified" counts as success; missing-bytecode (not yet indexed)
 *      errors are retried with a delay.
 */
const fs = require("fs");
const path = require("path");

const DEPLOYMENTS_DIR = path.resolve(__dirname, "../deployments");

const FQN = {
  ArafReputationLib: "src/ArafReputationLib.sol:ArafReputationLib",
  ArafSettlementLib: "src/ArafSettlementLib.sol:ArafSettlementLib",
  ArafEscrow: "src/ArafEscrow.sol:ArafEscrow",
  ArafRevenueVault: "src/ArafRevenueVault.sol:ArafRevenueVault",
  ArafRewards: "src/ArafRewards.sol:ArafRewards",
  MockERC20: "src/MockERC20.sol:MockERC20",
};
// ArafEscrow link sırası ile aynı (deploy.js ESCROW_LIBRARIES).
const LIBRARY_ORDER = ["ArafReputationLib", "ArafSettlementLib"];

function readJsonIfExists(filePath) {
  if (!fs.existsSync(filePath)) return null;
  return JSON.parse(fs.readFileSync(filePath, "utf8"));
}

function loadManifests(networkName, dir = DEPLOYMENTS_DIR) {
  return {
    escrowManifest: readJsonIfExists(path.join(dir, `${networkName}.json`)),
    rewardsManifest: readJsonIfExists(path.join(dir, `${networkName}-rewards.json`)),
  };
}

/**
 * [TR] Kayıtlardan sıralı doğrulama planı üretir (saf fonksiyon, ağ erişimi yok).
 * [EN] Pure function: build the ordered verification plan from manifests.
 * @returns {{steps: Array, warnings: string[]}}
 */
function buildVerifyPlan({ escrowManifest, rewardsManifest } = {}) {
  const steps = [];
  const warnings = [];

  if (escrowManifest) {
    const libs = escrowManifest.libraries || {};
    for (const name of LIBRARY_ORDER) {
      if (libs[name]) {
        steps.push({ label: name, address: libs[name], contract: FQN[name], constructorArguments: [] });
      } else {
        warnings.push(`Kayıtta library adresi yok: ${name}`);
      }
    }
    if (escrowManifest.escrowAddress && escrowManifest.treasuryAddress) {
      steps.push({
        label: "ArafEscrow",
        address: escrowManifest.escrowAddress,
        contract: FQN.ArafEscrow,
        constructorArguments: [escrowManifest.treasuryAddress],
        libraries: { ...libs },
      });
    } else {
      warnings.push("Kayıtta escrowAddress/treasuryAddress yok; ArafEscrow atlandı.");
    }
    for (const mock of escrowManifest.deployedMocks || []) {
      // deploy.js: deployMockToken(`Mock ${symbol}`, symbol, 6)
      steps.push({
        label: `MockERC20(${mock.symbol})`,
        address: mock.address,
        contract: FQN.MockERC20,
        constructorArguments: [`Mock ${mock.symbol}`, mock.symbol, 6],
      });
    }
  } else {
    warnings.push("Escrow kaydı (deployments/<ağ>.json) bulunamadı; library + ArafEscrow atlandı.");
  }

  if (rewardsManifest) {
    const { escrow, vault, rewards, owner, finalTreasury } = rewardsManifest;
    if (vault && escrow && finalTreasury && owner) {
      // deployRewards.js: Vault.deploy(escrow, finalTreasury, owner)
      steps.push({
        label: "ArafRevenueVault",
        address: vault,
        contract: FQN.ArafRevenueVault,
        constructorArguments: [escrow, finalTreasury, owner],
      });
    } else {
      warnings.push("Rewards kaydı eksik; ArafRevenueVault atlandı.");
    }
    if (rewards && escrow && vault && owner) {
      // deployRewards.js: Rewards.deploy(escrow, vault, owner)
      steps.push({
        label: "ArafRewards",
        address: rewards,
        contract: FQN.ArafRewards,
        constructorArguments: [escrow, vault, owner],
      });
    } else {
      warnings.push("Rewards kaydı eksik; ArafRewards atlandı.");
    }
  }

  return { steps, warnings };
}

function errorText(err) {
  return String((err && err.message) || err || "");
}
function isAlreadyVerifiedError(err) {
  return /already verified/i.test(errorText(err));
}
function isBytecodeNotIndexedError(err) {
  return /does not have bytecode|has no bytecode|unable to locate contractcode|bytecode.*(not|hasn't).*(propagat|index)/i.test(
    errorText(err)
  );
}

const sleepMs = (ms) => new Promise((r) => setTimeout(r, ms));

async function verifyStep(hre, step, { retries, delayMs, sleep, log }) {
  for (let attempt = 1; attempt <= retries; attempt++) {
    try {
      await hre.run("verify:verify", {
        address: step.address,
        constructorArguments: step.constructorArguments,
        contract: step.contract,
        ...(step.libraries ? { libraries: step.libraries } : {}),
      });
      return { status: "verified" };
    } catch (err) {
      if (isAlreadyVerifiedError(err)) return { status: "already-verified" };
      if (isBytecodeNotIndexedError(err) && attempt < retries) {
        log(`   ⏳ ${step.label}: bytecode henüz indekslenmedi, ${delayMs / 1000}s sonra yeniden (${attempt}/${retries})`);
        await sleep(delayMs);
        continue;
      }
      return { status: "failed", error: errorText(err).split("\n")[0] };
    }
  }
  return { status: "failed", error: "retries exhausted" };
}

/**
 * [TR] Planı sırayla çalıştırır. Hata fırlatmaz; sonuç listesi döner.
 * [EN] Runs the plan in order. Never throws; returns per-step results.
 */
async function runVerify(hre, plan, opts = {}) {
  const {
    dryRun = false,
    retries = Number(process.env.VERIFY_RETRIES) || 5,
    delayMs = Number(process.env.VERIFY_RETRY_DELAY_MS) || 20000,
    sleep = sleepMs,
    log = console.log,
  } = opts;
  const results = [];
  for (const w of plan.warnings) log(`⚠️  ${w}`);
  for (const step of plan.steps) {
    log(`🔎 ${step.label} @ ${step.address}`);
    if (dryRun) {
      log(`   [dry-run] contract=${step.contract} args=${JSON.stringify(step.constructorArguments)}` +
        (step.libraries ? ` libraries=${JSON.stringify(step.libraries)}` : ""));
      results.push({ label: step.label, status: "dry-run" });
      continue;
    }
    const r = await verifyStep(hre, step, { retries, delayMs, sleep, log });
    log(r.status === "failed" ? `   ❌ ${r.error}` : `   ✅ ${r.status}`);
    results.push({ label: step.label, ...r });
  }
  return results;
}

function manualCommandHint(networkName) {
  return `npm --prefix contracts run verify${networkName === "base" ? ":base" : ""}` +
    (networkName !== "base" && networkName !== "base-sepolia" ? ` (--network ${networkName})` : "");
}

async function main() {
  const hre = require("hardhat");
  const networkName = hre.network.name;
  const dryRun = process.env.VERIFY_DRY_RUN === "true";
  const plan = buildVerifyPlan(loadManifests(networkName));
  if (plan.steps.length === 0) {
    throw new Error(`Doğrulanacak kayıt yok (deployments/${networkName}*.json). Önce deploy edin.`);
  }
  if (!dryRun && !process.env.ETHERSCAN_API_KEY && !process.env.BASESCAN_API_KEY) {
    console.warn("⚠️  ETHERSCAN_API_KEY tanımlı değil; yalnız Sourcify denenecek, Etherscan V2 başarısız olabilir.");
  }
  const results = await runVerify(hre, plan, { dryRun });
  const failed = results.filter((r) => r.status === "failed");
  if (failed.length) {
    console.error(`\n❌ Doğrulanamayanlar: ${failed.map((f) => f.label).join(", ")}`);
    console.error(`   Yeniden dene: ${manualCommandHint(networkName)}`);
    process.exitCode = 1;
  }
  return results;
}

if (require.main === module) {
  main().catch((err) => {
    console.error(err);
    process.exit(1);
  });
}

module.exports = {
  buildVerifyPlan,
  loadManifests,
  runVerify,
  manualCommandHint,
  isAlreadyVerifiedError,
  isBytecodeNotIndexedError,
};
