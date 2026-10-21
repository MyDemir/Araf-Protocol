// [TR] K4-12: readRewardsOf geçici RPC hatasında fail-closed (throw); manifest ezme güvenliği deploy ÖNCESİ.
const { expect } = require('chai');
const { ethers } = require('hardhat');
const fs = require('fs');
const os = require('os');
const path = require('path');
const rewardsScript = require('../../contracts/scripts/deployRewards');
const { deployEscrowWithLibraries } = require('../../contracts/scripts/deploy');

const ADDR = '0x1111111111111111111111111111111111111111';
const IFACE = new ethers.Interface(['function rewards() view returns (address)']);
const fakeProvider = (callImpl, code = '0x6001') => ({ getCode: async () => code, call: callImpl });

describe('deployRewards K4-12', function () {
  this.timeout(120000);

  describe('readRewardsOf', function () {
    it('throws on transient RPC errors instead of returning null (fail-closed)', async function () {
      const p = fakeProvider(async () => { throw Object.assign(new Error('429 too many requests'), { code: 'SERVER_ERROR' }); });
      let err;
      try { await rewardsScript.readRewardsOf(p, ADDR); } catch (e) { err = e; }
      expect(err, 'must throw').to.be.an('error');
      expect(err.code).to.equal('SERVER_ERROR');
    });

    it('returns null for CALL_EXCEPTION (no rewards() on the contract)', async function () {
      const p = fakeProvider(async () => { throw Object.assign(new Error('execution reverted'), { code: 'CALL_EXCEPTION' }); });
      expect(await rewardsScript.readRewardsOf(p, ADDR)).to.equal(null);
    });

    it('returns null for empty return data and for no code', async function () {
      expect(await rewardsScript.readRewardsOf(fakeProvider(async () => '0x'), ADDR)).to.equal(null);
      expect(await rewardsScript.readRewardsOf(fakeProvider(async () => '0x', '0x'), ADDR)).to.equal(null);
    });

    it('returns the checksummed address when rewards() answers', async function () {
      const data = IFACE.encodeFunctionResult('rewards', [ADDR]);
      expect(await rewardsScript.readRewardsOf(fakeProvider(async () => data), ADDR)).to.equal(ethers.getAddress(ADDR));
    });
  });

  describe('manifest overwrite safety runs before any deploy', function () {
    let dir;
    beforeEach(function () { dir = fs.mkdtempSync(path.join(os.tmpdir(), 'araf-k412-')); });
    afterEach(function () { fs.rmSync(dir, { recursive: true, force: true }); });

    it('refuses with no tx sent when the manifest escrow differs', async function () {
      const [deployer, other] = await ethers.getSigners();
      const { escrow } = await deployEscrowWithLibraries(deployer.address, deployer);
      const escrowAddress = await escrow.getAddress();
      const Mock = await ethers.getContractFactory('MockERC20');
      const t = await Mock.deploy('M', 'M', 6);
      const tokenAddr = await t.getAddress();
      // kilit geçer (manifestte vault/rewards yok) ama escrow farklı -> deploy'dan ÖNCE reddedilmeli
      const manifestPath = path.join(dir, 'hardhat-rewards.json');
      fs.writeFileSync(manifestPath, JSON.stringify({ status: 'complete', escrow: other.address, finalTreasury: other.address }));
      const env = {
        ARAF_DEPLOYMENTS_DIR: dir, SKIP_ABI_EXPORT: 'true', ARAF_ESCROW_ADDRESS: escrowAddress,
        BASE_SEPOLIA_USDT_ADDRESS: tokenAddr, BASE_SEPOLIA_USDC_ADDRESS: tokenAddr,
      };
      const nonceBefore = await ethers.provider.getTransactionCount(deployer.address);
      let err;
      try { await rewardsScript.main(env); } catch (e) { err = e; }
      expect(err && err.message).to.match(/Refusing to overwrite rewards manifest/);
      expect(await ethers.provider.getTransactionCount(deployer.address)).to.equal(nonceBefore);
      expect(JSON.parse(fs.readFileSync(manifestPath, 'utf8')).escrow).to.equal(other.address);
    });
  });
});
