const { expect } = require("chai");
const path = require("path");

const CONTRACTS = path.join(__dirname, "..", "..", "contracts");
const CONFIG_PATH = path.join(CONTRACTS, "hardhat.config.js");
const VERIFY_PATH = path.join(CONTRACTS, "scripts", "verify.js");

const A = (n) => "0x" + String(n).repeat(40);

describe("verify script + Etherscan V2 config", function () {
  const ORIGINAL_ENV = { ...process.env };

  function loadConfig(env) {
    process.env = { ...ORIGINAL_ENV, ETHERSCAN_API_KEY: "", BASESCAN_API_KEY: "", ...env };
    delete require.cache[require.resolve(CONFIG_PATH)];
    return require(CONFIG_PATH);
  }
  afterEach(() => {
    process.env = { ...ORIGINAL_ENV };
    delete require.cache[require.resolve(CONFIG_PATH)];
  });

  describe("hardhat.config etherscan", function () {
    it("uses a single string apiKey (V2), ETHERSCAN_API_KEY first, BASESCAN_API_KEY fallback", function () {
      expect(loadConfig({ ETHERSCAN_API_KEY: "e", BASESCAN_API_KEY: "b" }).etherscan.apiKey).to.equal("e");
      expect(loadConfig({ BASESCAN_API_KEY: "b" }).etherscan.apiKey).to.equal("b");
      expect(loadConfig({}).etherscan.apiKey).to.equal("");
    });

    it("enables sourcify", function () {
      expect(loadConfig({}).sourcify.enabled).to.equal(true);
    });

    for (const [name, chainId] of [["base-sepolia", 84532], ["base", 8453]]) {
      it(`resolves ${name} to the V2 endpoint with chainid ${chainId}`, async function () {
        const config = loadConfig({ ETHERSCAN_API_KEY: "k" });
        const { Etherscan, ETHERSCAN_V2_API_URL } = require("@nomicfoundation/hardhat-verify/internal/etherscan");
        const provider = { send: async () => "0x" + chainId.toString(16) };
        const chainConfig = await Etherscan.getCurrentChainConfig(name, provider, config.etherscan.customChains);
        const instance = Etherscan.fromChainConfig(config.etherscan.apiKey, chainConfig);
        expect(instance.apiUrl).to.equal(ETHERSCAN_V2_API_URL);
        expect(instance.apiUrl).to.equal("https://api.etherscan.io/v2/api");
        expect(instance.chainId).to.equal(chainId);
      });
    }

    it("a per-network apiKey object would fall back to V1 (regression guard)", function () {
      const { Etherscan } = require("@nomicfoundation/hardhat-verify/internal/etherscan");
      const legacy = Etherscan.fromChainConfig(
        { base: "k" },
        { network: "base", chainId: 8453, urls: { apiURL: "https://api.basescan.org/api", browserURL: "https://basescan.org" } }
      );
      expect(legacy.chainId).to.equal(undefined);
      expect(legacy.apiUrl).to.equal("https://api.basescan.org/api");
    });
  });

  describe("buildVerifyPlan", function () {
    const { buildVerifyPlan } = require(VERIFY_PATH);
    const escrowManifest = {
      escrowAddress: A(1),
      treasuryAddress: A(2),
      libraries: { ArafReputationLib: A(3), ArafSettlementLib: A(4) },
      deployedMocks: [{ symbol: "USDT", address: A(5) }],
    };
    const rewardsManifest = { escrow: A(1), vault: A(6), rewards: A(7), owner: A(8), finalTreasury: A(9) };

    it("orders libs -> escrow (linked) -> mocks -> vault -> rewards with args from manifests", function () {
      const { steps, warnings } = buildVerifyPlan({ escrowManifest, rewardsManifest });
      expect(warnings).to.deep.equal([]);
      expect(steps.map((s) => s.label)).to.deep.equal([
        "ArafReputationLib", "ArafSettlementLib", "ArafEscrow", "MockERC20(USDT)", "ArafRevenueVault", "ArafRewards",
      ]);
      const by = Object.fromEntries(steps.map((s) => [s.label, s]));
      expect(by.ArafReputationLib.constructorArguments).to.deep.equal([]);
      expect(by.ArafEscrow.constructorArguments).to.deep.equal([A(2)]);
      expect(by.ArafEscrow.libraries).to.deep.equal({ ArafReputationLib: A(3), ArafSettlementLib: A(4) });
      expect(by.ArafEscrow.contract).to.equal("src/ArafEscrow.sol:ArafEscrow");
      expect(by["MockERC20(USDT)"].constructorArguments).to.deep.equal(["Mock USDT", "USDT", 6]);
      expect(by.ArafRevenueVault.constructorArguments).to.deep.equal([A(1), A(9), A(8)]);
      expect(by.ArafRewards.constructorArguments).to.deep.equal([A(1), A(6), A(8)]);
    });

    it("warns instead of throwing on missing manifests", function () {
      const r = buildVerifyPlan({ rewardsManifest });
      expect(r.steps.map((s) => s.label)).to.deep.equal(["ArafRevenueVault", "ArafRewards"]);
      expect(r.warnings.length).to.be.greaterThan(0);
      expect(buildVerifyPlan({}).steps).to.deep.equal([]);
    });
  });

  describe("runVerify", function () {
    const { runVerify, buildVerifyPlan } = require(VERIFY_PATH);
    const plan = buildVerifyPlan({
      escrowManifest: { escrowAddress: A(1), treasuryAddress: A(2), libraries: { ArafReputationLib: A(3), ArafSettlementLib: A(4) } },
    });
    const quiet = { log: () => {}, sleep: async () => {}, delayMs: 1 };

    it("dry-run makes no hre.run calls", async function () {
      let calls = 0;
      const res = await runVerify({ run: async () => { calls++; } }, plan, { ...quiet, dryRun: true });
      expect(calls).to.equal(0);
      expect(res.every((r) => r.status === "dry-run")).to.equal(true);
    });

    it("passes libraries + args to verify:verify and treats Already Verified as success", async function () {
      const seen = [];
      const hre = {
        run: async (task, args) => {
          seen.push([task, args]);
          if (args.address === A(3)) throw new Error("Contract source code already verified");
        },
      };
      const res = await runVerify(hre, plan, quiet);
      expect(res.map((r) => r.status)).to.deep.equal(["already-verified", "verified", "verified"]);
      const escrowCall = seen.find(([, a]) => a.address === A(1))[1];
      expect(escrowCall.constructorArguments).to.deep.equal([A(2)]);
      expect(escrowCall.libraries).to.deep.equal({ ArafReputationLib: A(3), ArafSettlementLib: A(4) });
    });

    it("retries when bytecode is not indexed yet, then succeeds; gives up after retries", async function () {
      let n = 0;
      const flaky = { run: async () => { if (++n < 3) throw new Error("The Etherscan API responded that the address 0x does not have bytecode."); } };
      const one = { steps: [plan.steps[0]], warnings: [] };
      const ok = await runVerify(flaky, one, { ...quiet, retries: 5 });
      expect(ok[0].status).to.equal("verified");
      expect(n).to.equal(3);

      let m = 0;
      const dead = { run: async () => { m++; throw new Error("address does not have bytecode"); } };
      const bad = await runVerify(dead, one, { ...quiet, retries: 3 });
      expect(bad[0].status).to.equal("failed");
      expect(m).to.equal(3);
    });

    it("does not retry other errors and never throws", async function () {
      let n = 0;
      const hre = { run: async () => { n++; throw new Error("Invalid API Key"); } };
      const res = await runVerify(hre, { steps: [plan.steps[0]], warnings: [] }, { ...quiet, retries: 5 });
      expect(n).to.equal(1);
      expect(res[0]).to.include({ status: "failed" });
    });
  });
});
