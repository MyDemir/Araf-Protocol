/**
 * ArafEscrow Deploy Script
 * Kullanım: npx hardhat run scripts/deploy.js --network base-sepolia
 */
const { ethers } = require("hardhat");

async function main() {
  const [deployer] = await ethers.getSigners();
  console.log("Deploy eden cüzdan:", deployer.address);

  const balance = await ethers.provider.getBalance(deployer.address);
  console.log("Bakiye:", ethers.formatEther(balance), "ETH");

  // Treasury adresi: .env'den al, yoksa deployer kullan (sadece testnet için)
  const treasury = process.env.TREASURY_ADDRESS || deployer.address;
  console.log("Treasury adresi:", treasury);

  // Kontratı deploy et
  console.log("\nArafEscrow deploy ediliyor...");
  const ArafEscrow = await ethers.getContractFactory("ArafEscrow");
  const escrow = await ArafEscrow.deploy(treasury);
  await escrow.waitForDeployment();

  const address = await escrow.getAddress();
  console.log("✅ ArafEscrow deploy edildi:", address);

  // Base Sepolia'da USDT mock adresi yoksa MockERC20 deploy et
  if (process.env.NODE_ENV !== "production") {
    console.log("\nMockERC20 (test USDT) deploy ediliyor...");
    const MockERC20 = await ethers.getContractFactory("MockERC20");
    const usdt = await MockERC20.deploy("Mock USDT", "USDT", 6);
    await usdt.waitForDeployment();
    const usdtAddress = await usdt.getAddress();
    console.log("✅ MockUSDT deploy edildi:", usdtAddress);

    // Token'ı desteklenen listesine ekle
    await escrow.setSupportedToken(usdtAddress, true);
    console.log("✅ USDT desteklenen token listesine eklendi");

    console.log("\n─────────────────────────────────────");
    console.log("Backend .env dosyana şunu ekle:");
    console.log(`ARAF_ESCROW_ADDRESS=${address}`);
    console.log(`USDT_ADDRESS=${usdtAddress}`);
    console.log("─────────────────────────────────────");
  }
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });
