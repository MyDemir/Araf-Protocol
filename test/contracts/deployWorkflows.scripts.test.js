// [TR] .github/scripts (ortak runtime env + vault/rewards adres çözümü) ve deploy workflow'larının yapısı.
//      Ağ yok: health testi yerel bir http sunucusu kullanır. Yalnız sahte değerler kullanılır.
// [EN] Shared workflow scripts and deploy workflow structure. No network; dummy values only.
const { expect } = require('chai');
const { ethers } = require('ethers');
const { spawnSync, spawn } = require('child_process');
const fs = require('fs');
const http = require('http');
const os = require('os');
const path = require('path');
const yaml = require('js-yaml');

const ROOT = path.resolve(__dirname, '../..');
const STAGE = path.join(ROOT, '.github/scripts/stage-runtime-env.sh');
const resolver = require('../../.github/scripts/resolve-rewards-addresses.js');

const A = (n) => ethers.getAddress('0x' + n.toString(16).padStart(40, 'a'));
const VAULT = A(1); const REWARDS = A(2); const ESCROW = A(3); const OTHER = A(4);

function runStage(cmd, env) {
  return spawnSync('bash', [STAGE, cmd], { env: { PATH: process.env.PATH, ...env }, encoding: 'utf8' });
}

function runStageAsync(cmd, env) {
  return new Promise((resolve) => {
    const p = spawn('bash', [STAGE, cmd], { env: { PATH: process.env.PATH, ...env } });
    let stdout = ''; let stderr = '';
    p.stdout.on('data', (d) => { stdout += d; });
    p.stderr.on('data', (d) => { stderr += d; });
    p.on('close', (status) => resolve({ status, stdout, stderr }));
  });
}

const BASE_ENV = {
  MONGODB_URI: 'mongodb+srv://dummy', REDIS_URL: 'rediss://dummy', JWT_SECRET: 'j'.repeat(64),
  MASTER_ENCRYPTION_KEY: 'a'.repeat(64), BASE_SEPOLIA_RPC_URL: 'https://rpc.invalid', BASE_SEPOLIA_WS_RPC_URL: 'wss://rpc.invalid',
  ESCROW, USDT: A(5), USDC: A(6), DEPLOY_BLOCK: '123', FRONTEND_DOMAIN: 'app.example.org',
};

describe('workflow scripts: resolve-rewards-addresses.js', function () {
  it('EIP-55 checksum matches ethers for random addresses', function () {
    for (let i = 0; i < 50; i++) {
      const a = ethers.Wallet.createRandom().address;
      expect(resolver.toChecksumAddress(a.toLowerCase())).to.equal(a);
    }
  });

  it('normalizeAddress rejects zero, malformed and bad checksum; accepts lowercase', function () {
    expect(resolver.normalizeAddress('X', '')).to.equal(null);
    expect(() => resolver.normalizeAddress('X', '0x' + '0'.repeat(40))).to.throw(/zero address/);
    expect(() => resolver.normalizeAddress('X', '0x1234')).to.throw(/0x \+ 40 hex/);
    const good = ethers.Wallet.createRandom().address;
    const bad = good.slice(0, 2) + [...good.slice(2)].map((c) => (c === c.toUpperCase() ? c.toLowerCase() : c.toUpperCase())).join('');
    if (bad.slice(2) !== bad.slice(2).toLowerCase() && bad.slice(2) !== bad.slice(2).toUpperCase()) {
      expect(() => resolver.normalizeAddress('X', bad)).to.throw(/checksum/);
    }
    expect(resolver.normalizeAddress('X', good.toLowerCase())).to.equal(good);
  });

  const manifest = { chainId: 84532, escrow: ESCROW, vault: VAULT, rewards: REWARDS };
  const read = (m) => () => m;

  it('manifest mode: uses manifest, fails on conflicting variables unless ALLOW_VARS_REPLACE=true', function () {
    const env = { MODE: 'manifest', MANIFEST_PATH: 'x', ESCROW, EXPECTED_CHAIN_ID: '84532' };
    expect(resolver.resolveRewardsAddresses(env, read(manifest))).to.deep.equal({ vault: VAULT, rewards: REWARDS, source: 'manifest' });
    expect(resolver.resolveRewardsAddresses({ ...env, VAR_REVENUE_VAULT: VAULT.toLowerCase(), VAR_REWARDS: REWARDS }, read(manifest)).source).to.equal('manifest');
    const conflict = { ...env, VAR_REVENUE_VAULT: OTHER, VAR_REWARDS: A(7) };
    expect(() => resolver.resolveRewardsAddresses(conflict, read(manifest))).to.throw(/conflicts with repository variables/);
    expect(resolver.resolveRewardsAddresses({ ...conflict, ALLOW_VARS_REPLACE: 'true' }, read(manifest)).vault).to.equal(VAULT);
  });

  it('manifest mode: fails when manifest missing, bound to another escrow or wrong chain', function () {
    const env = { MODE: 'manifest', MANIFEST_PATH: 'x', ESCROW, EXPECTED_CHAIN_ID: '84532' };
    expect(() => resolver.resolveRewardsAddresses(env, read(null))).to.throw(/manifest is missing/);
    expect(() => resolver.resolveRewardsAddresses(env, read({ ...manifest, escrow: OTHER }))).to.throw(/!= deployed escrow/);
    expect(() => resolver.resolveRewardsAddresses(env, read({ ...manifest, chainId: 8453 }))).to.throw(/chainId/);
  });

  it('fallback mode: input overrides variables; pair must be complete; manifest conflict fails', function () {
    const env = { MODE: 'fallback', VAR_REVENUE_VAULT: VAULT, VAR_REWARDS: REWARDS };
    expect(resolver.resolveRewardsAddresses(env, read(null))).to.deep.equal({ vault: VAULT, rewards: REWARDS, source: 'vars' });
    expect(resolver.resolveRewardsAddresses({ ...env, INPUT_REVENUE_VAULT: OTHER, INPUT_REWARDS: A(7) }, read(null)).source).to.equal('input');
    expect(resolver.resolveRewardsAddresses({ MODE: 'fallback' }, read(null)).source).to.equal('none');
    expect(() => resolver.resolveRewardsAddresses({ MODE: 'fallback', VAR_REVENUE_VAULT: VAULT }, read(null))).to.throw(/set together/);
    expect(() => resolver.resolveRewardsAddresses({ ...env, MANIFEST_PATH: 'x' }, read({ ...manifest, vault: OTHER }))).to.throw(/conflicts with rewards manifest/);
  });

  it('CLI writes REVENUE_VAULT/REWARDS/REWARDS_SOURCE to GITHUB_ENV and exits 1 with ::error:: on conflict', function () {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'araf-wf-'));
    const ghEnv = path.join(dir, 'env');
    const mPath = path.join(dir, 'm.json');
    fs.writeFileSync(mPath, JSON.stringify(manifest));
    const cli = path.join(ROOT, '.github/scripts/resolve-rewards-addresses.js');
    const ok = spawnSync('node', [cli], { env: { PATH: process.env.PATH, GITHUB_ENV: ghEnv, MODE: 'manifest', MANIFEST_PATH: mPath, ESCROW }, encoding: 'utf8' });
    expect(ok.status).to.equal(0);
    expect(fs.readFileSync(ghEnv, 'utf8')).to.equal(`REVENUE_VAULT=${VAULT}\nREWARDS=${REWARDS}\nREWARDS_SOURCE=manifest\n`);
    const bad = spawnSync('node', [cli], { env: { PATH: process.env.PATH, MODE: 'manifest', MANIFEST_PATH: mPath, ESCROW, VAR_REVENUE_VAULT: OTHER, VAR_REWARDS: A(7) }, encoding: 'utf8' });
    expect(bad.status).to.equal(1);
    expect(bad.stderr).to.match(/::error::.*conflicts/);
    fs.rmSync(dir, { recursive: true, force: true });
  });
});

describe('workflow scripts: stage-runtime-env.sh', function () {
  it('fly-secret-lines: required set always; optional only when set; never ETHERSCAN_API_KEY', function () {
    const minimal = runStage('fly-secret-lines', { ...BASE_ENV, ETHERSCAN_API_KEY: 'should-not-leak' });
    expect(minimal.status, minimal.stderr).to.equal(0);
    const keys = minimal.stdout.trim().split('\n').map((l) => l.split('=')[0]);
    for (const k of ['NODE_ENV', 'MONGODB_URI', 'BASE_RPC_URL', 'BASE_WS_RPC_URL', 'ARAF_ESCROW_ADDRESS', 'ARAF_DEPLOYMENT_BLOCK', 'EXPECTED_CHAIN_ID', 'SIWE_DOMAIN']) expect(keys).to.include(k);
    for (const k of ['ARAF_REVENUE_VAULT_ADDRESS', 'ARAF_REWARDS_ADDRESS', 'LIVE_POLL_INTERVAL_MS', 'BASE_RPC_URL_FALLBACKS', 'ADMIN_WALLETS', 'RELAYER_PRIVATE_KEY']) expect(keys).to.not.include(k);
    expect(minimal.stdout).to.not.match(/ETHERSCAN|should-not-leak/);
    expect(minimal.stdout).to.include('EXPECTED_CHAIN_ID=84532');

    const full = runStage('fly-secret-lines', {
      ...BASE_ENV, REVENUE_VAULT: VAULT, REWARDS, LIVE_POLL_INTERVAL_MS: '15000', WORKER_BLOCK_BATCH_SIZE: '10',
      WORKER_REPLAY_BATCH_DELAY_MS: '250', BASE_SEPOLIA_RPC_URL_FALLBACKS: 'https://a.invalid, https://b.invalid', ADMIN_WALLETS: `${VAULT}, ${REWARDS}`,
    });
    expect(full.status, full.stderr).to.equal(0);
    for (const line of [`ARAF_REVENUE_VAULT_ADDRESS=${VAULT}`, `ARAF_REWARDS_ADDRESS=${REWARDS}`, 'LIVE_POLL_INTERVAL_MS=15000',
      'WORKER_BLOCK_BATCH_SIZE=10', 'WORKER_REPLAY_BATCH_DELAY_MS=250', 'BASE_RPC_URL_FALLBACKS=https://a.invalid,https://b.invalid',
      `ADMIN_WALLETS=${VAULT},${REWARDS}`]) expect(full.stdout.split('\n')).to.include(line);
  });

  it('vercel-build-env: frontend names for vault and rewards', function () {
    const r = runStage('vercel-build-env', { ...BASE_ENV, REVENUE_VAULT: VAULT, REWARDS });
    expect(r.status, r.stderr).to.equal(0);
    const lines = r.stdout.trim().split('\n');
    expect(lines).to.include(`VITE_REVENUE_VAULT_ADDRESS=${VAULT}`);
    expect(lines).to.include(`VITE_REWARDS_ADDRESS=${REWARDS}`);
    expect(lines).to.include(`VITE_ESCROW_ADDRESS=${ESCROW}`);
    expect(r.stdout).to.not.match(/MONGODB|JWT|MASTER_ENCRYPTION/);
  });

  it('validate: rejects out-of-range/invalid optional vars and half-set vault/rewards', function () {
    expect(runStage('validate', BASE_ENV).status).to.equal(0);
    const cases = [
      { LIVE_POLL_INTERVAL_MS: '1000' }, { WORKER_BLOCK_BATCH_SIZE: '0' }, { WORKER_BLOCK_BATCH_SIZE: '2001' },
      { WORKER_REPLAY_BATCH_DELAY_MS: 'abc' }, { EXPECTED_CHAIN_ID: '8453' }, { ADMIN_WALLETS: '0x123' },
      { BASE_SEPOLIA_RPC_URL_FALLBACKS: 'http://plain.invalid' }, { REVENUE_VAULT: VAULT }, { REWARDS },
      { REVENUE_VAULT: '0x' + '0'.repeat(40), REWARDS }, { DEPLOY_BLOCK: '0' },
    ];
    for (const c of cases) {
      const r = runStage('validate', { ...BASE_ENV, ...c });
      expect(r.status, JSON.stringify(c)).to.equal(1);
      expect(r.stderr).to.match(/::error::/);
    }
    // Hata mesajı RPC URL değerini göstermez.
    const r = runStage('validate', { ...BASE_ENV, BASE_SEPOLIA_RPC_URL_FALLBACKS: 'http://secret-key.invalid' });
    expect(r.stderr).to.not.include('secret-key');
    expect(runStage('validate', { ...BASE_ENV, EXPECTED_CHAIN_ID: '84532', LIVE_POLL_INTERVAL_MS: '2000' }).status).to.equal(0);
  });

  describe('health', function () {
    let server; let base; let mode;
    before(async function () {
      server = http.createServer((req, res) => {
        if (req.url === '/health') { res.writeHead(mode === 'down' ? 500 : 200); return res.end('{"status":"ok"}'); }
        if (req.url === '/ready') {
          if (mode === 'degraded') { res.writeHead(503, { 'content-type': 'application/json' }); return res.end('{"ok":false,"degraded":true}'); }
          res.writeHead(200); return res.end('{"ok":true}');
        }
        res.writeHead(404); res.end();
      });
      await new Promise((r) => server.listen(0, '127.0.0.1', r));
      base = `http://127.0.0.1:${server.address().port}`;
    });
    after(() => new Promise((r) => server.close(r)));
    const env = () => ({ HEALTH_BASE_URL: base, HEALTH_INITIAL_SLEEP: '0', HEALTH_RETRIES: '0', HEALTH_RETRY_DELAY: '0' });

    it('passes silently when /health and /ready are OK', async function () {
      mode = 'ok';
      const r = await runStageAsync('health', env());
      expect(r.status).to.equal(0);
      expect(r.stdout).to.include('/ready OK');
      expect(r.stdout).to.not.include('::warning::');
    });

    it('passes with ::warning:: when /ready is 503 degraded:true', async function () {
      mode = 'degraded';
      const r = await runStageAsync('health', env());
      expect(r.status).to.equal(0);
      expect(r.stdout).to.match(/::warning::.*DEGRADED/);
    });

    it('fails when /health is not 200', async function () {
      mode = 'down';
      const r = await runStageAsync('health', env());
      expect(r.status).to.equal(1);
      expect(r.stderr).to.match(/::error::.*\/health/);
    });
  });
});

describe('deploy workflows (YAML structure)', function () {
  const load = (f) => yaml.load(fs.readFileSync(path.join(ROOT, '.github/workflows', f), 'utf8'));

  it('all workflows parse as YAML with jobs', function () {
    for (const f of fs.readdirSync(path.join(ROOT, '.github/workflows')).filter((x) => /\.ya?ml$/.test(x))) {
      const wf = load(f);
      expect(wf, f).to.be.an('object');
      expect(wf.jobs, f).to.be.an('object');
    }
  });

  it('deploy-base-sepolia: deploy_rewards defaults to false; confirm input; rewards step guarded; order is escrow -> rewards -> resolve -> verify', function () {
    const wf = load('deploy-base-sepolia.yml');
    const inputs = wf.on.workflow_dispatch.inputs;
    expect(inputs.deploy_rewards).to.include({ type: 'boolean', default: false });
    expect(inputs.confirm_redeploy_rewards).to.include({ type: 'string', default: '' });
    const steps = wf.jobs.deploy.steps;
    const idx = (name) => steps.findIndex((s) => s.name === name);
    const rewards = steps[idx('Deploy revenue vault + rewards (optional)')];
    expect(rewards.if).to.equal('${{ inputs.deploy_rewards }}');
    expect(rewards.env.CONFIRM_REDEPLOY_REWARDS).to.equal('${{ inputs.confirm_redeploy_rewards }}');
    expect(rewards.run).to.include('scripts/deployRewards.js');
    expect(idx('Deploy contracts to Base Sepolia')).to.be.lessThan(idx('Deploy revenue vault + rewards (optional)'));
    expect(idx('Deploy revenue vault + rewards (optional)')).to.be.lessThan(idx('Resolve revenue vault + rewards addresses'));
    expect(idx('Resolve revenue vault + rewards addresses')).to.be.lessThan(idx('Verify contracts on BaseScan (experimental)'));
    const validate = steps[idx('Validate required config')].run;
    expect(validate).to.include('confirm_redeploy_rewards=YES');
    expect(validate).to.include('FINAL_TREASURY_ADDRESS');
    for (const s of steps) if (s.run && s.shell === 'bash' && s.run.includes('\n')) expect(s.run, s.name).to.match(/set -euo pipefail/);
  });

  it('both deploy workflows share the same Fly/Vercel/health script and secret list; ETHERSCAN never reaches Fly', function () {
    for (const [f, job] of [['deploy-base-sepolia.yml', 'deploy'], ['deploy-runtime-base-sepolia.yml', 'runtime-deploy']]) {
      const steps = load(f).jobs[job].steps;
      const by = (n) => steps.find((s) => s.name === n);
      const fly = by('Stage backend secrets on Fly');
      expect(fly.run, f).to.include('stage-runtime-env.sh fly-secrets');
      expect(Object.keys(fly.env)).to.include.members(['BASE_SEPOLIA_RPC_URL_FALLBACKS', 'ADMIN_WALLETS', 'LIVE_POLL_INTERVAL_MS', 'WORKER_BLOCK_BATCH_SIZE', 'WORKER_REPLAY_BATCH_DELAY_MS', 'EXPECTED_CHAIN_ID']);
      expect(fly.env.BASE_SEPOLIA_RPC_URL_FALLBACKS).to.match(/secrets\./);
      expect(fly.env.LIVE_POLL_INTERVAL_MS).to.match(/vars\./);
      expect(JSON.stringify(fly)).to.not.match(/ETHERSCAN|BASESCAN/);
      expect(by('Check backend health').run, f).to.include('stage-runtime-env.sh health');
      expect(by('Deploy frontend to Vercel').run, f).to.include('stage-runtime-env.sh vercel-deploy');
    }
    const fly1 = load('deploy-base-sepolia.yml').jobs.deploy.steps.find((s) => s.name === 'Stage backend secrets on Fly').env;
    const fly2 = load('deploy-runtime-base-sepolia.yml').jobs['runtime-deploy'].steps.find((s) => s.name === 'Stage backend secrets on Fly').env;
    expect(fly2).to.deep.equal(fly1);
  });
});
