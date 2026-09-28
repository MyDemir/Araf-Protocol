const path = require("path");

// [TR] Testler repo kökündeki ../test/contracts altında. Node modül çözümlemesi test dosyasının
//      dizininden yukarı çıktığı için contracts/node_modules'a hiç ulaşmaz ve `chai` bulunamaz.
//      NODE_PATH ile contracts/node_modules global arama yoluna eklenir.
// [EN] Tests live in ../test/contracts; module resolution walks up from the test file and never
//      reaches contracts/node_modules, so `chai` fails to resolve. Add it via NODE_PATH.
const CONTRACTS_NODE_MODULES = path.join(__dirname, "node_modules");
if (!String(process.env.NODE_PATH || "").split(path.delimiter).includes(CONTRACTS_NODE_MODULES)) {
  process.env.NODE_PATH = [CONTRACTS_NODE_MODULES, process.env.NODE_PATH].filter(Boolean).join(path.delimiter);
  require("module").Module._initPaths();
}

require("@nomicfoundation/hardhat-toolbox");
require("dotenv").config();
const { extendEnvironment } = require("hardhat/config");

/**
 * [TR] Hardhat config validation aşamasında tüm network URL'leri parse edildiği için
 *      eksik env durumunda doğrudan throw etmek diğer networkleri de bozar.
 *      Bu yüzden config için geçerli bir placeholder döneriz; gerçek fail-closed kontrolü
 *      yalnız seçilen network için runtime'da yapılır.
 * [EN] Hardhat validates/parses all network URLs on config load. Throwing there would
 *      break unrelated networks. We use a safe placeholder in config and enforce
 *      fail-closed RPC env checks at runtime for the selected network only.
 */
function getRpcUrlOrPlaceholder(envName) {
  return process.env[envName] || "http://127.0.0.1:8545";
}

function assertRequiredRpcEnvForNetwork(networkName) {
  if (networkName === "base" && !process.env.BASE_RPC_URL) {
    throw new Error("[Hardhat] base ağı için BASE_RPC_URL zorunludur. Public RPC fallback kaldırıldı.");
  }
  if (networkName === "base-sepolia" && !process.env.BASE_SEPOLIA_RPC_URL) {
    throw new Error("[Hardhat] base-sepolia ağı için BASE_SEPOLIA_RPC_URL zorunludur. Public RPC fallback kaldırıldı.");
  }
}

extendEnvironment((hre) => {
  assertRequiredRpcEnvForNetwork(hre.network.name);
});

/** @type import('hardhat/config').HardhatUserConfig */
const config = {
  solidity: {
    version: "0.8.24", // OpenZeppelin v5 uyumu için yukseltildi
    settings: {
      optimizer: { enabled: true, runs: 200 },
      viaIR: true, // Karmaşık kontratların derlenmesini kolaylaştırır
      evmVersion: "cancun" // mcopy hatasi için
    },
  },
  networks: {
    // Yerel geliştirme ağı (Codespaces/Local)
    hardhat: {
      chainId: 31337,
      // [TR] V3 sözleşme test ortamında EIP-170 code-size limitine takılmadan
      //      invariant/regresyon testlerinin çalıştırılabilmesi için açık.
      // [EN] Enables invariant/regression tests in local Hardhat without EIP-170 size gate.
      allowUnlimitedContractSize: true,
    },
    //MetaMask ve Deploy betiği için localhost ağ tanımı
    localhost: {
      url: "http://127.0.0.1:8545", 
      chainId: 31337,
    },
    // public tesnet
    "base-sepolia": {
      url: getRpcUrlOrPlaceholder("BASE_SEPOLIA_RPC_URL"),
      accounts: process.env.DEPLOYER_PRIVATE_KEY
        ? [process.env.DEPLOYER_PRIVATE_KEY]
        : [],
      chainId: 84532,
    },
    // Base Mainnet Ayarları
    base: {
      url: getRpcUrlOrPlaceholder("BASE_RPC_URL"),
      accounts: process.env.DEPLOYER_PRIVATE_KEY
        ? [process.env.DEPLOYER_PRIVATE_KEY]
        : [],
      chainId: 8453,
    },
  },
  etherscan: {
    apiKey: {
      "base-sepolia": process.env.BASESCAN_API_KEY || "",
      base:           process.env.BASESCAN_API_KEY || "",
    },
    customChains: [
      {
        network: "base-sepolia",
        chainId: 84532,
        urls: {
          apiURL:   "https://api-sepolia.basescan.org/api",
          browserURL: "https://sepolia.basescan.org",
        },
      },
      {
        network: "base",
        chainId: 8453,
        urls: {
          apiURL:   "https://api.basescan.org/api",
          browserURL: "https://basescan.org",
        },
      },
    ],
  },
  gasReporter: {
    enabled: process.env.REPORT_GAS === "true",
    currency: "USD",
    coinmarketcap: process.env.CMC_API_KEY,
  },
  paths: {
    sources:   "./src",
    tests:     "../test/contracts",
    cache:     "./cache",
    artifacts: "./artifacts",
  },
};

module.exports = config;
module.exports.__private = {
  assertRequiredRpcEnvForNetwork,
  getRpcUrlOrPlaceholder,
};
