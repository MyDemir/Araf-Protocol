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
// [TR] Etherscan ücretsiz plan / desteklenmeyen zincir / geçersiz anahtar: başarısızlık değil, "atlandı".
// [EN] Free plan / unsupported chain / bad key: treated as "skipped", not as a failure.
function isEtherscanPlanOrKeyError(err) {
  return /free (api )?plan|upgrade your api plan|not supported|unsupported chain|invalid api key|missing or invalid api key|api key.*(invalid|missing|required)|missing api key|no api key|api key is empty/i.test(
    errorText(err)
  );
}

const sleepMs = (ms) => new Promise((r) => setTimeout(r, ms));

// [TR] verify:verify yalnız Etherscan+Sourcify çalıştırır (Blockscout'u çalıştırmaz) ve Etherscan hata verirse
//      Sourcify'a hiç geçmez. Bu yüzden her doğrulayıcı ayrı subtask ile, bağımsız denenir.
// [EN] hardhat-verify's verify:verify runs only Etherscan+Sourcify (never Blockscout) and aborts on the first
//      Etherscan error, so each verifier is invoked through its own subtask, independently.
const VERIFIERS = [
  {
    name: "Etherscan",
    task: "verify:etherscan",
    configKey: "etherscan",
    args: (s) => ({ address: s.address, constructorArgsParams: s.constructorArguments, contract: s.contract, ...(s.libraries ? { libraries: s.libraries } : {}) }),
    isSkippable: isEtherscanPlanOrKeyError,
  },
  {
    name: "Sourcify",
    task: "verify:sourcify",
    configKey: "sourcify",
    args: (s) => ({ address: s.address, contract: s.contract, ...(s.libraries ? { libraries: s.libraries } : {}) }),
  },
  {
    name: "Blockscout",
    task: "verify:blockscout",
    configKey: "blockscout",
    args: (s) => ({ address: s.address, contract: s.contract, ...(s.libraries ? { libraries: s.libraries } : {}) }),
  },
];

async function runVerifier(hre, verifier, step, { retries, delayMs, sleep, log }) {
  const cfg = hre.config && hre.config[verifier.configKey];
  if (cfg && cfg.enabled === false) return { status: "skipped", detail: "disabled in config" };
  if (verifier.name === "Etherscan" && hre.config && hre.config.etherscan && !hre.config.etherscan.apiKey) {
    return { status: "skipped", detail: "no ETHERSCAN_API_KEY" };
  }
  for (let attempt = 1; attempt <= retries; attempt++) {
    try {
      await hre.run(verifier.task, verifier.args(step));
      return { status: "verified" };
    } catch (err) {
      if (isAlreadyVerifiedError(err)) return { status: "already-verified" };
      if (isBytecodeNotIndexedError(err) && attempt < retries) {
        log(`   ⏳ ${step.label}/${verifier.name}: bytecode henüz indekslenmedi, ${delayMs / 1000}s sonra yeniden (${attempt}/${retries})`);
        await sleep(delayMs);
        continue;
      }
      const detail = errorText(err).split("\n")[0];
      if (verifier.isSkippable && verifier.isSkippable(err)) return { status: "skipped", detail };
      return { status: "failed", detail };
    }
  }
  return { status: "failed", detail: "retries exhausted" };
}

/**
 * [TR] Planı sırayla çalıştırır; her kontrat için Etherscan V2, Sourcify, Blockscout denenir. Biri başarılıysa
 *      kontrat doğrulanmış sayılır. Hata fırlatmaz.
 * [EN] Runs the plan in order; each contract is tried on all verifiers; any success counts. Never throws.
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
      results.push({ label: step.label, address: step.address, status: "dry-run", verifiers: {} });
      continue;
    }
    const verifiers = {};
    for (const v of VERIFIERS) {
      const r = await runVerifier(hre, v, step, { retries, delayMs, sleep, log });
      verifiers[v.name] = r;
      const icon = { verified: "✅", "already-verified": "✅", skipped: "⚠️ ", failed: "❌" }[r.status];
      log(`   ${icon} ${v.name}: ${r.status}${r.detail ? ` (${r.detail})` : ""}`);
    }
    const all = Object.values(verifiers);
    const status = all.some((r) => r.status === "verified")
      ? "verified"
      : all.some((r) => r.status === "already-verified")
        ? "already-verified"
        : "failed";
    results.push({ label: step.label, address: step.address, status, verifiers });
  }
  return results;
}

/** [TR] Kontrat başına doğrulayıcı sonuç tablosu. [EN] Per-contract, per-verifier result table. */
function formatReportTable(results) {
  const names = VERIFIERS.map((v) => v.name);
  const rows = [["Contract", ...names, "Overall"]];
  for (const r of results) {
    rows.push([r.label, ...names.map((n) => (r.verifiers[n] ? r.verifiers[n].status : "-")), r.status]);
  }
  const widths = rows[0].map((_, i) => Math.max(...rows.map((row) => String(row[i]).length)));
  return rows.map((row) => row.map((c, i) => String(c).padEnd(widths[i])).join("  ")).join("\n");
}

/** [TR] Hiçbir doğrulayıcı başarılı olmayan kontrat varsa çıkış kodu 1. */
function summarize(results) {
  const failed = results.filter((r) => r.status === "failed");
  return { failed, exitCode: failed.length ? 1 : 0 };
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
  if (!dryRun && !hre.config.etherscan.apiKey) {
    console.warn("⚠️  ETHERSCAN_API_KEY tanımlı değil; Etherscan atlanacak, Sourcify + Blockscout (anahtarsız) denenecek.");
  }
  const results = await runVerify(hre, plan, { dryRun });
  console.log("\n" + formatReportTable(results));
  const { failed, exitCode } = summarize(results);
  if (failed.length) {
    console.error(`\n❌ Hiçbir doğrulayıcıda doğrulanamayanlar: ${failed.map((f) => f.label).join(", ")}`);
    console.error(`   Yeniden dene: ${manualCommandHint(networkName)}`);
  }
  process.exitCode = exitCode;
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
  formatReportTable,
  summarize,
  manualCommandHint,
  isAlreadyVerifiedError,
  isBytecodeNotIndexedError,
  isEtherscanPlanOrKeyError,
};
