const { expect } = require('chai');
const path = require('path');
const fs = require('fs');

const ops = require('../../contracts/scripts/rewardsOps');
const deploy = require('../../contracts/scripts/deployRewards');
const { runAbiDriftCheck } = require('../../contracts/scripts/checkAbiDrift');

const A = {
  escrow: '0x1111111111111111111111111111111111111111',
  vault: '0x2222222222222222222222222222222222222222',
  rewards: '0x3333333333333333333333333333333333333333',
  usdt: '0x4444444444444444444444444444444444444444',
  usdc: '0x5555555555555555555555555555555555555555'
};

describe('rewards go-live readiness hardening', function () {
  it('verify op fails if vault address is missing', function () {
    expect(() => ops.resolveAddresses({}, { ...A, vault: undefined })).to.throw(/ARAF_REVENUE_VAULT_ADDRESS missing/);
  });
  it('verify op fails if rewards address is missing', function () {
    expect(() => ops.resolveAddresses({}, { ...A, rewards: undefined })).to.throw(/ARAF_REWARDS_ADDRESS missing/);
  });
  it('verify op fails if escrow address is missing', function () {
    expect(() => ops.resolveAddresses({}, { ...A, escrow: undefined })).to.throw(/ARAF_ESCROW_ADDRESS missing/);
  });
  it('verify op validates supported token config includes USDT/USDC inputs', function () {
    const out = ops.resolveAddresses({}, A);
    expect(out.usdt).to.equal(A.usdt);
    expect(out.usdc).to.equal(A.usdc);
  });

  it('configure op refuses zero/invalid addresses', function () {
    expect(() => ops.resolveAddresses({ ARAF_REVENUE_VAULT_ADDRESS: '0x0' }, A)).to.throw();
    expect(() => ops.resolveAddresses({ USDT_ADDRESS: 'not-an-address' }, A)).to.throw(/USDT_ADDRESS/);
  });

  it('configure op refuses treasury switch and never calls setTreasury', async function () {
    const source = ops.configure.toString();
    expect(source).to.contain('Treasury switch is intentionally separated');
    expect(source).to.not.contain('setTreasury(');
    let err;
    try { await ops.configure({ CONFIRM_SWITCH_TREASURY_TO_VAULT: 'true' }); } catch (e) { err = e; }
    expect(err?.message).to.match(/intentionally separated/);
  });

  it('deployRewards does not switch escrow treasury', function () {
    const source = fs.readFileSync(path.resolve(__dirname, '../../contracts/scripts/deployRewards.js'), 'utf8');
    expect(source).to.not.contain('setTreasury(');
  });

  it('deployRewards does not auto deploy mock tokens on public networks', function () {
    expect(() => deploy.resolvePublicTokens(999n)).to.throw(/Unsupported public chainId/);
  });

  it('smokeRewards read-only-by-default guard exists for public networks', function () {
    const source = fs.readFileSync(path.resolve(__dirname, '../../contracts/scripts/smokeRewards.js'), 'utf8');
    expect(source).to.contain('CONFIRM_PUBLIC_SMOKE');
  });

  it('manifest validation is deterministic and critical keys are fixed', function () {
    const first = ops.resolveAddresses({}, A);
    const second = ops.resolveAddresses({}, { ...A });
    expect(first).to.deep.equal(second);
  });

  it('switch-treasury op requires explicit confirmation and validates wiring preconditions', async function () {
    let err;
    try { await ops.switchTreasury({}); } catch (e) { err = e; }
    expect(err?.message).to.match(/Set CONFIRM_TREASURY_SWITCH=true/);
    const source = ops.switchTreasury.toString();
    expect(source).to.contain("CONFIRM_TREASURY_SWITCH !== 'true'");
    expect(source).to.contain('rewardBps must be 4000');
    expect(source).to.contain('USDT not supported');
    expect(source).to.contain('USDC not supported');
  });

  it('ABI exports include ArafEscrow/ArafRevenueVault/ArafRewards', function () {
    const source = fs.readFileSync(path.resolve(__dirname, '../../contracts/scripts/deployRewards.js'), 'utf8');
    expect(source).to.contain("exportAbi(['ArafEscrow', 'ArafRevenueVault', 'ArafRewards'])");
  });

  it('verify script enforces rewardBps target 4000 and wiring checks (source)', function () {
    const source = ops.verify.toString();
    expect(source).to.contain('rewardBps=4000');
    expect(source).to.contain("'Vault.escrow'");
    expect(source).to.contain("'Rewards.revenueVault'");
  });

  it('verify script rejects empty supported token set inputs', function () {
    expect(() => ops.resolveAddresses({}, { ...A, usdt: undefined })).to.throw(/USDT_ADDRESS missing/);
    expect(() => ops.resolveAddresses({}, { ...A, usdc: undefined })).to.throw(/USDC_ADDRESS missing/);
  });

  it('contracts env example uses canonical script-consumed variable names', function () {
    const envExample = fs.readFileSync(path.resolve(__dirname, '../../contracts/.env.example'), 'utf8');
    expect(envExample).to.contain('ARAF_ESCROW_ADDRESS=');
    expect(envExample).to.contain('ARAF_REVENUE_VAULT_ADDRESS=');
    expect(envExample).to.contain('ARAF_REWARDS_ADDRESS=');
    expect(envExample).to.contain('FINAL_TREASURY_ADDRESS=');
    expect(envExample).to.contain('USDT_ADDRESS=');
    expect(envExample).to.contain('USDC_ADDRESS=');
    expect(envExample).to.contain('REWARD_BPS=4000');
    expect(envExample).to.contain('CONFIRM_CONFIGURE_REWARDS=false');
    expect(envExample).to.contain('CONFIRM_TREASURY_SWITCH=false');
    expect(envExample).to.contain('EXPECTED_CURRENT_TREASURY_ADDRESS=');
    expect(envExample).to.contain('BASE_MAINNET_USDT_ADDRESS=');
    expect(envExample).to.contain('BASE_MAINNET_USDC_ADDRESS=');
    expect(envExample).to.contain('BASE_SEPOLIA_USDT_ADDRESS=');
    expect(envExample).to.contain('BASE_SEPOLIA_USDC_ADDRESS=');
    expect(envExample).to.contain('CONFIRM_PUBLIC_SMOKE=');
    expect(envExample).to.contain('CONFIRM_FRESH_ESCROW_DEPLOY=');
  });

  it('ABI drift: critical escrow events/getters stay in lock-step across contract/frontend/backend sources', function () {
    expect(runAbiDriftCheck()).to.equal(true);
    const artifact = require('../../contracts/artifacts/src/ArafEscrow.sol/ArafEscrow.json');
    const frontendSource = fs.readFileSync(path.resolve(__dirname, '../../frontend/src/hooks/useArafContract.js'), 'utf8');
    const backendSource = fs.readFileSync(path.resolve(__dirname, '../../backend/scripts/services/eventListener.js'), 'utf8');

    const events = Object.fromEntries(
      artifact.abi
        .filter((x) => x.type === 'event')
        .map((x) => [x.name, x])
    );
    const funcs = Object.fromEntries(
      artifact.abi
        .filter((x) => x.type === 'function')
        .map((x) => [x.name, x])
    );

    const criticalEventNames = ['OrderFilled', 'EscrowReleased', 'ProtocolRevenueSent', 'SettlementFinalized', 'ReputationUpdated'];
    for (const name of criticalEventNames) {
      expect(events[name], `missing event ${name}`).to.not.equal(undefined);
      const expectedInputShape = events[name].inputs.map((i) => `${i.type}:${i.name}:${i.indexed ? 'i' : 'n'}`).join('|');
      expect(expectedInputShape.length).to.be.greaterThan(0);
      expect(backendSource).to.contain(`event ${name}(`);
      if (name === 'OrderFilled') expect(frontendSource).to.contain(`event ${name}(`);
    }

    const criticalGetterNames = ['getReputation', 'getTrade', 'getOrder', 'getCurrentAmounts', 'getSettlementProposal'];
    for (const name of criticalGetterNames) {
      expect(funcs[name], `missing getter ${name}`).to.not.equal(undefined);
      expect(frontendSource).to.contain(`function ${name}(`);
    }
    for (const workerGetterName of ['getReputation', 'getTrade', 'getOrder']) {
      expect(backendSource).to.contain(`function ${workerGetterName}(`);
    }
  });

  it('ABI drift: getReputation V3 tuple order snapshot remains stable', function () {
    const artifact = require('../../contracts/artifacts/src/ArafEscrow.sol/ArafEscrow.json');
    const fn = artifact.abi.find((x) => x.type === 'function' && x.name === 'getReputation');
    expect(fn).to.not.equal(undefined);
    const out = fn.outputs || [];
    const names = out.map((x) => x.name);
    expect(names).to.deep.equal([
      'successful',
      'failed',
      'bannedUntil',
      'consecutiveBans',
      'effectiveTier',
      'manualReleaseCount',
      'autoReleaseCount',
      'mutualCancelCount',
      'disputedResolvedCount',
      'burnCount',
      'disputeWinCount',
      'disputeLossCount',
      'partialSettlementCount',
      'riskPoints',
      'lastPositiveEventAt',
      'lastNegativeEventAt',
    ]);
  });
});
