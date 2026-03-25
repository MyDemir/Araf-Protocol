/**
 * ArafEscrow Deploy Script (Güncellenmiş Testnet Sürümü)
 *
 * Deploy ve test token ayarları tamamlandıktan hemen sonra ownership, TREASURY_ADDRESS'e devredilir.
 * Bu sayede DEPLOYER_PRIVATE_KEY sızsa bile kontrat üzerinde hiçbir yetkisi kalmaz.
 *
 * Kullanım: npx hardhat run scripts/deploy.js --network localhost
 */
const { ethers } = require("hardhat");
const fs   = require("fs");
const path = require("path");

function resolveProductionTokenConfig() {
  const isProduction = process.env.NODE_ENV === "production";
  if (!isProduction) {
    return { isProduction, usdtAddress: "", usdcAddress: "" };
  }

  const usdtAddress = process.env.MAINNET_USDT_ADDRESS;
  const usdcAddress = process.env.MAINNET_USDC_ADDRESS;

  if (!usdtAddress || !usdcAddress) {
    throw new Error("❌ Production deploy için MAINNET_USDT_ADDRESS ve MAINNET_USDC_ADDRESS zorunludur.");
  }

  return {
    isProduction,
    usdtAddress: ethers.getAddress(usdtAddress),
    usdcAddress: ethers.getAddress(usdcAddress),
  };
}

async function main() {
  const [deployer] = await ethers.getSigners();
  console.log("🚀 Deploy eden cüzdan:", deployer.address);

  const balance = await ethers.provider.getBalance(deployer.address);
  console.log("💰 Bakiye:", ethers.formatEther(balance), "ETH\n");

  // ── Treasury & Owner ──────────────────────────────────────────────────────
  const treasury = process.env.TREASURY_ADDRESS;
  if (!treasury || treasury === "0x0000000000000000000000000000000000000000") {
    throw new Error("❌ TREASURY_ADDRESS .env'de set edilmeli! (deploy eden cüzdan değil, hazine cüzdanı)");
  }

  const treasuryAddress = ethers.getAddress(treasury);
  console.log("🏦 Treasury & Son Owner adresi:", treasuryAddress);

  // ── 1. Escrow Kontratı Deploy ─────────────────────────────────────────────
  console.log("\n⏳ ArafEscrow deploy ediliyor...");
  const ArafEscrow = await ethers.getContractFactory("ArafEscrow");
  const escrow = await ArafEscrow.deploy(treasuryAddress);
  await escrow.waitForDeployment();

  const address = await escrow.getAddress();
  console.log("✅ ArafEscrow deploy edildi:", address);

  // ── ABI Kopyalama ─────────────────────────────────────────────────────────
  try {
    const artifactPath = path.resolve(__dirname, "../artifacts/src/ArafEscrow.sol/ArafEscrow.json");
    const artifact     = JSON.parse(fs.readFileSync(artifactPath, "utf8"));
    const abiDestDir   = path.resolve(__dirname, "../../frontend/src/abi");
    const abiDestPath  = path.join(abiDestDir, "ArafEscrow.json");

    fs.mkdirSync(abiDestDir, { recursive: true });
    fs.writeFileSync(abiDestPath, JSON.stringify(artifact.abi, null, 2));
    console.log("✅ ABI frontend'e kopyalandı.");
  } catch (err) {
    console.warn("⚠ ABI kopyalanamadı (Önemli Değil, Hardcoded ABI kullanıyoruz):", err.message);
  }

  // ── 2. Token Setup ────────────────────────────────────────────────────────
  const tokenConfig = resolveProductionTokenConfig();
  let { usdtAddress, usdcAddress } = tokenConfig;

  if (!tokenConfig.isProduction) {
    console.log("\n⏳ MockERC20 (USDT ve USDC) deploy ediliyor...");
    const MockERC20 = await ethers.getContractFactory("MockERC20");

    const usdt = await MockERC20.deploy("Mock USDT", "USDT", 6);
    await usdt.waitForDeployment();
    usdtAddress = await usdt.getAddress();
    console.log("✅ MockUSDT deploy edildi:", usdtAddress);

    const usdc = await MockERC20.deploy("Mock USDC", "USDC", 6);
    await usdc.waitForDeployment();
    usdcAddress = await usdc.getAddress();
    console.log("✅ MockUSDC deploy edildi:", usdcAddress);
  }

  await escrow.setSupportedToken(usdtAddress, true);
  await escrow.setSupportedToken(usdcAddress, true);

  const [usdtEnabled, usdcEnabled] = await Promise.all([
    escrow.supportedTokens(usdtAddress),
    escrow.supportedTokens(usdcAddress),
  ]);

  if (!usdtEnabled || !usdcEnabled) {
    throw new Error("❌ Supported token doğrulaması başarısız.");
  }

  if (tokenConfig.isProduction) {
    console.log("✅ Production USDT/USDC desteklenen token olarak doğrulandı.");
  } else {
    console.log("✅ Mock USDT/USDC desteklenen token olarak doğrulandı.");
  }

  // ── 3. Ownership Devri
  console.log("\n🔒 Ownership devrediliyor →", treasuryAddress);
  const tx = await escrow.transferOwnership(treasuryAddress);
  await tx.wait();
  console.log("✅ Ownership başarıyla devredildi!");

  // ── 4. AKILLI .ENV YÖNETİMİ (sadece non-production) ─────────────────────
  if (!tokenConfig.isProduction) {
    const frontendEnvPath = path.resolve(__dirname, "../../frontend/.env");
    const exampleEnvPath = path.resolve(__dirname, "../../frontend/.env.example");

    if (!fs.existsSync(frontendEnvPath) && fs.existsSync(exampleEnvPath)) {
      fs.copyFileSync(exampleEnvPath, frontendEnvPath);
      console.log("📝 .env.example'dan yeni .env oluşturuldu.");
    }

    if (fs.existsSync(frontendEnvPath)) {
      let envContent = fs.readFileSync(frontendEnvPath, "utf8");

      const codespaceName = process.env.CODESPACE_NAME;
      if (codespaceName) {
        const apiUrl = `https://${codespaceName}-4000.app.github.dev`;
        envContent = envContent.replace(/VITE_API_URL=.*/, `VITE_API_URL=${apiUrl}`);
      }

      envContent = envContent.replace(/VITE_ESCROW_ADDRESS=.*/, `VITE_ESCROW_ADDRESS="${address}"`);
      envContent = envContent.replace(/VITE_USDT_ADDRESS=.*/, `VITE_USDT_ADDRESS="${usdtAddress}"`);
      envContent = envContent.replace(/VITE_USDC_ADDRESS=.*/, `VITE_USDC_ADDRESS="${usdcAddress}"`);

      fs.writeFileSync(frontendEnvPath, envContent);
      console.log("✅ .env dosyası otomatik olarak güncellendi.");
    }
  }

  // ── 5. Sonuçlar ve .env Çıktıları ─────────────────────────────────────────
  console.log("\n🎉 BÜTÜN İŞLEMLER TAMAMLANDI! 🎉");
  console.log("--------------------------------------------------");
  console.log(`VITE_ESCROW_ADDRESS="${address}"`);
  if (!tokenConfig.isProduction) {
    console.log(`VITE_USDT_ADDRESS="${usdtAddress}"`);
    console.log(`VITE_USDC_ADDRESS="${usdcAddress}"`);
  }
  console.log("--------------------------------------------------");
}

if (require.main === module) {
  main()
    .then(() => process.exit(0))
    .catch((err) => {
      console.error(err);
      process.exit(1);
    });
}

module.exports = { resolveProductionTokenConfig };
