// K4-19 (b,c) + K4-20(e): smokeRewards revert nedenini doğrular, gasBaseline ağ koruması, rewardsOps treasury geri-okuma.
const { expect } = require('chai');
const { ethers } = require('hardhat');
const fs = require('fs');
const path = require('path');
const smoke = require('../../contracts/scripts/smokeRewards');
const gas = require('../../contracts/scripts/gasBaseline');

const src = (f) => fs.readFileSync(path.resolve(__dirname, '../../contracts/scripts', f), 'utf8');

describe('smokeRewards.expectCustomRevert (K4-19c)', function () {
  const iface = new ethers.Interface(['error RewardBpsOutOfRange()', 'error ZeroAmount()']);

  it('passes when the call reverts with the expected custom error', async function () {
    const data = iface.encodeErrorResult('RewardBpsOutOfRange');
    await smoke.expectCustomRevert(async () => { throw Object.assign(new Error('x'), { code: 'CALL_EXCEPTION', data }); }, iface, 'RewardBpsOutOfRange');
  });

  it('fails when the call reverts with a different custom error', async function () {
    const data = iface.encodeErrorResult('ZeroAmount');
    let err;
    try { await smoke.expectCustomRevert(async () => { throw Object.assign(new Error('x'), { code: 'CALL_EXCEPTION', data }); }, iface, 'RewardBpsOutOfRange'); } catch (e) { err = e; }
    expect(err && err.message).to.match(/RewardBpsOutOfRange/);
  });

  it('does NOT swallow network/permission errors as a rejection', async function () {
    let err;
    try { await smoke.expectCustomRevert(async () => { throw Object.assign(new Error('socket hang up'), { code: 'NETWORK_ERROR' }); }, iface, 'RewardBpsOutOfRange'); } catch (e) { err = e; }
    expect(err && err.message).to.match(/RewardBpsOutOfRange/);
  });

  it('fails when the call does not revert', async function () {
    let err;
    try { await smoke.expectCustomRevert(async () => ({}), iface, 'RewardBpsOutOfRange'); } catch (e) { err = e; }
    expect(err && err.message).to.match(/did not revert/);
  });

  it('smoke main passes end-to-end on the in-process hardhat network', async function () {
    this.timeout(60000);
    await smoke.main();
  });
});

describe('gasBaseline network guard (K4-19b)', function () {
  it('is import-safe (main is guarded by require.main) and exports assertLocalNetwork', function () {
    expect(src('gasBaseline.js')).to.match(/require\.main === module/);
    expect(gas.assertLocalNetwork).to.be.a('function');
  });

  it('refuses public networks and accepts hardhat/localhost/31337', function () {
    expect(() => gas.assertLocalNetwork('base-sepolia', 84532n)).to.throw(/yalnız yerel|local/i);
    expect(() => gas.assertLocalNetwork('base', 8453n)).to.throw();
    expect(() => gas.assertLocalNetwork('hardhat', 31337n)).to.not.throw();
    expect(() => gas.assertLocalNetwork('localhost', 31337n)).to.not.throw();
  });
});

describe('rewardsOps.switchTreasury read-back (K4-20e)', function () {
  it('verifies escrow.treasury() == vault after setTreasury', function () {
    const s = src('rewardsOps.js');
    const after = s.slice(s.indexOf('escrow.setTreasury(vaultAddr)'));
    expect(after).to.match(/escrow\.treasury\(\)/);
    expect(after).to.match(/treasury read-back mismatch/);
  });
});
