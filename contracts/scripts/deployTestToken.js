/**
 * [TR] Test token (MockERC20, 6 decimals) deploy aracı. YALNIZ Base Sepolia (84532) ve local (31337).
 *      deploy.js'in "public ağda mock yok" politikasını değiştirmez; bu ayrı ve açık bir test aracıdır.
 * [EN] Test token (MockERC20, 6 decimals) deploy tool. ONLY Base Sepolia (84532) and local (31337).
 *
 *   TEST_TOKEN_SYMBOL=tUSDT TEST_TOKEN_NAME="Test Tether USD" CONFIRM_TEST_TOKEN_DEPLOY=yes \
 *     npm run deploy:test-token:base-sepolia
 */
const hre = require("hardhat");
const fs = require("fs");
const path = require("path");

const ALLOWED_CHAIN_IDS = new Set([84532, 31337]);
const PUBLIC_CHAIN_IDS = new Set([84532]);
const DECIMALS = 6;

function assertAllowedChain(chainId) {
  if (!ALLOWED_CHAIN_IDS.has(Number(chainId))) {
    throw new Error(`deployTestToken yalnız chainId 84532 ve 31337'de çalışır. Gelen: ${chainId}`);
  }
}

function appendTokenRecord(filePath, record) {
  let list = [];
  if (fs.existsSync(filePath)) {
    const parsed = JSON.parse(fs.readFileSync(filePath, "utf8"));
    list = Array.isArray(parsed) ? parsed : [parsed];
  }
  list.push(record);
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, JSON.stringify(list, null, 2));
  return list;
}

async function main() {
  const { ethers, network } = hre;
  const chainId = Number((await ethers.provider.getNetwork()).chainId);
  assertAllowedChain(chainId);

  if (PUBLIC_CHAIN_IDS.has(chainId) && process.env.CONFIRM_TEST_TOKEN_DEPLOY !== "yes") {
    throw new Error("Public ağda test token deploy için CONFIRM_TEST_TOKEN_DEPLOY=yes gerekir.");
  }

  const symbol = process.env.TEST_TOKEN_SYMBOL || "tUSDT";
  const name = process.env.TEST_TOKEN_NAME || "Test Tether USD";

  const [deployer] = await ethers.getSigners();
  const factory = await ethers.getContractFactory("MockERC20", deployer);
  const token = await factory.deploy(name, symbol, DECIMALS);
  await token.waitForDeployment();
  const address = await token.getAddress();
  const txHash = token.deploymentTransaction()?.hash ?? null;

  const onchainDecimals = Number(await token.decimals());
  if (onchainDecimals !== DECIMALS) throw new Error(`decimals beklenen ${DECIMALS}, gerçek ${onchainDecimals}`);

  const filePath = path.resolve(__dirname, `../deployments/${network.name}-test-tokens.json`);
  appendTokenRecord(filePath, { symbol, address, decimals: DECIMALS, txHash, deployedAt: new Date().toISOString() });

  console.log(`Test token ${symbol} (${name}) deployed: ${address}`);
  console.log(`Deployer: ${deployer.address}  tx: ${txHash}`);
  console.log(`Kayıt: ${filePath}`);
  console.log("Sonraki adım:");
  console.log(`  gh variable set BASE_SEPOLIA_USDT_ADDRESS --body ${address}`);
  console.log("  Cüzdana token basmak için: token.mint() (saatte 1000) ya da owner mint(to, amount).");
}

if (require.main === module) {
  main().then(() => process.exit(0)).catch((e) => { console.error(e); process.exit(1); });
}

module.exports = { main, assertAllowedChain, appendTokenRecord };
