/**
 * ArafEscrow Deploy Script
 *
 * L-01 Güvenlik Düzeltmesi:
 *   Deploy tamamlandıktan hemen sonra ownership, TREASURY_ADDRESS'e devredilir.
 *   Bu sayede DEPLOYER_PRIVATE_KEY sızsa bile kontrat üzerinde hiçbir yetkisi kalmaz.
 *
 *   TREASURY_ADDRESS → hem 0.2% fee + bleeding decay alıcısı, hem de kontrat owner'ı.
 *   Deploy bittikten sonra DEPLOYER_PRIVATE_KEY .env'den silinebilir / önemsizleşir.
 *
 * Kullanım: npx hardhat run scripts/deploy.js --network base-sepolia
 */
const { ethers } = require("hardhat");

async function main() {
  const [deployer] = await ethers.getSigners();
  console.log("Deploy eden cüzdan:", deployer.address);

  const balance = await ethers.provider.getBalance(deployer.address);
  console.log("Bakiye:", ethers.formatEther(balance), "ETH");

  // ── Treasury & Owner ──────────────────────────────────────────────────────
  // TREASURY_ADDRESS hem fee alıcısı hem de deploy sonrası kontrat owner'ıdır.
  // Sadece adres gerekir — private key ASLA buraya yazılmaz.
  const treasury = process.env.TREASURY_ADDRESS;
  if (!treasury || treasury === "0x0000000000000000000000000000000000000000") {
    throw new Error("TREASURY_ADDRESS .env'de set edilmeli! (deploy eden cüzdan değil, ana cüzdan)");
  }
  console.log("Treasury & Owner adresi:", treasury);

  // ── Kontrat Deploy ────────────────────────────────────────────────────────
  console.log("\nArafEscrow deploy ediliyor...");
  const ArafEscrow = await ethers.getContractFactory("ArafEscrow");
  const escrow = await ArafEscrow.deploy(treasury);
  await escrow.waitForDeployment();

  const address = await escrow.getAddress();
  console.log("✅ ArafEscrow deploy edildi:", address);

  // ── L-01: Ownership Devri ─────────────────────────────────────────────────
  // Deploy eden cüzdan geçici owner'dır. Hemen TREASURY_ADDRESS'e devredilir.
  // Bu adım tamamlandıktan sonra DEPLOYER_PRIVATE_KEY'in hiçbir önemi kalmaz.
  console.log("\nOwnership devrediliyor →", treasury);
  const tx = await escrow.transferOwnership(treasury);
  await tx.wait();
  console.log("✅ Ownership devredildi:", treasury);
  console.log("   DEPLOYER_PRIVATE_KEY artık .env'den silinebilir.");

  // ── Testnet: MockERC20 Deploy ─────────────────────────────────────────────
  if (process.env.NODE_ENV !== "production") {
    console.log("\nMockERC20 (test USDT) deploy ediliyor...");
    const MockERC20 = await ethers.getContractFactory("MockERC20");
    const usdt = await MockERC20.deploy("Mock USDT", "USDT", 6);
    await usdt.waitForDeployment();
    const usdtAddress = await usdt.getAddress();
    console.log("✅ MockUSDT deploy edildi:", usdtAddress);

    // Token'ı desteklenen listesine ekle
    // NOT: Bu çağrı artık deployer değil, owner (treasury) tarafından yapılmalı
    // Testnet'te deployer == owner henüz devredilmediği için çalışır,
    // ama mainnet'te transferOwnership sonrası setSupportedToken ayrıca çağrılmalı.
    await escrow.setSupportedToken(usdtAddress, true);
    console.log("✅ USDT desteklenen token listesine eklendi");

    console.log("\n─────────────────────────────────────");
    console.log("Backend .env dosyana şunu ekle:");
    console.log(`ARAF_ESCROW_ADDRESS=${address}`);
    console.log(`USDT_ADDRESS=${usdtAddress}`);
    console.log("─────────────────────────────────────");
  }

  // ── Mainnet Hatırlatması ──────────────────────────────────────────────────
  if (process.env.NODE_ENV === "production") {
    console.log("\n─────────────────────────────────────────────────────────");
    console.log("MAINNET DEPLOY TAMAMLANDI");
    console.log(`Kontrat adresi : ${address}`);
    console.log(`Owner & Treasury: ${treasury}`);
    console.log("");
    console.log("Sonraki adımlar:");
    console.log("1. DEPLOYER_PRIVATE_KEY'i .env'den sil");
    console.log("2. setSupportedToken'ı owner cüzdanından çağır:");
    console.log("   Base USDT: 0xfde4C96c8593536E31F229EA8f37b2ADa2699bb2");
    console.log("   Base USDC: 0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913");
    console.log("3. ARAF_ESCROW_ADDRESS'i backend .env'e ekle");
    console.log("─────────────────────────────────────────────────────────");
  }
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });
