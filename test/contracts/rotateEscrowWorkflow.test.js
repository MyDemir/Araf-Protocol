// [TR] Workflow env'iyle çekirdeği uçtan uca çağırır: yml dosyalarındaki env adları yml'den OKUNUR, adım betikleri (run:)
//      bash ile gerçekten çalıştırılır; Mongo/Redis/RPC sahte, flyctl/gh sahte. Ağ yok, sahte değerler.
// [EN] End-to-end: env names are read from the workflow YAML, `run:` snippets are executed with bash against the real
//      rotate-escrow.js / rotate-escrow-state.sh with in-memory Mongo/Redis/RPC and fake flyctl/gh.
const { expect } = require('chai');
const { spawn } = require('child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');
const yaml = require('js-yaml');

const F = require('./helpers/rotateEscrowFakes.js');
const { run: coreRun } = require('../../.github/scripts/rotate-escrow.js');

const ROOT = path.resolve(__dirname, '../..');
const CORE = path.join(ROOT, '.github/scripts/rotate-escrow.js');
const HELPER = path.join(__dirname, 'helpers/rotateEscrowFakes.js');
const { OLD, NEW, AID } = F;

const load = (f) => yaml.load(fs.readFileSync(path.join(ROOT, '.github/workflows', f), 'utf8'));
const stepOf = (wf, job, name) => {
  const s = wf.jobs[job].steps.find((x) => x.name === name);
  if (!s) throw new Error(`step not found: ${name}`);
  return s;
};

// ${{ secrets.X }} / ${{ vars.X }} / ${{ inputs.X }} -> sahte değerler; diğer ifadeler boş.
function resolveEnv(stepEnv, ctx) {
  const out = {};
  for (const [k, v] of Object.entries(stepEnv || {})) {
    out[k] = String(v).replace(/\$\{\{\s*([^}]*?)\s*\}\}/g, (_, expr) => {
      const m = /^(secrets|vars|inputs)\.([A-Za-z0-9_]+)$/.exec(expr);
      if (!m) return '';
      const val = ctx[m[1]][m[2]];
      return val === undefined ? '' : String(val);
    });
  }
  return out;
}
const parseEnvFile = (file) => {
  const o = {};
  if (fs.existsSync(file)) for (const l of fs.readFileSync(file, 'utf8').split('\n')) { const i = l.indexOf('='); if (i > 0) o[l.slice(0, i)] = l.slice(i + 1); }
  return o;
};
const bash = (script, env, cwd = ROOT) => new Promise((resolve) => {
  const p = spawn('bash', ['-c', script], { env, cwd });
  let out = '';
  p.stdout.on('data', (d) => { out += d; });
  p.stderr.on('data', (d) => { out += d; });
  p.on('close', (status) => resolve({ status, out }));
});

const SECRETS = {
  MONGODB_URI: 'mongodb+srv://dbuser:Sup3rSecretPw@cluster0.example.mongodb.net/araf',
  REDIS_URL: 'rediss://default:RedisSecretPw@redis.example.com:6380',
  BASE_SEPOLIA_RPC_URL: 'https://rpc.example.com/v2/KEY_SECRET_123',
  FLY_API_TOKEN: 'tok_secret_1',
  GH_VARIABLES_TOKEN: 'ghp_secret_1',
};
const mkCtx = (inputs, vars) => ({ secrets: SECRETS, vars, inputs });
const argvOf = (run) => (/rotate-escrow\.js\s+(.*)$/m.exec(run) || [, ''])[1].trim().split(/\s+/).filter(Boolean);

async function coreFromStep(step, env, world) {
  const lines = [];
  const code = await coreRun({
    argv: argvOf(step.run), env, deps: { mongo: world.mongo, redis: world.redis, chain: F.fakeChain() }, out: (l) => lines.push(String(l)), now: () => F.T0,
  });
  return { code, out: lines.join('\n') };
}

describe('workflow env -> rotate-escrow.js (precheck)', function () {
  this.timeout(30000);

  it('(a) deploy-base-sepolia.yml precheck env has NO ARAF_ESCROW_ADDRESS and passes', async () => {
    const wf = load('deploy-base-sepolia.yml');
    const step = stepOf(wf, 'deploy', 'Precheck escrow rotation (read-only)');
    const env = resolveEnv(step.env, mkCtx({ confirm_archive_active_trades: '' }, { ARAF_ESCROW_ADDRESS: OLD, ARAF_DEPLOYMENT_BLOCK: '10' }));
    expect(step.env).to.not.have.property('ARAF_ESCROW_ADDRESS');
    expect(env.OLD_ESCROW_ADDRESS).to.equal(OLD);
    const r = await coreFromStep(step, env, F.world());
    expect(r.code, r.out).to.equal(0);
    expect(r.out).to.include('new escrow not yet known; skipped');
  });

  it('(b) rotate-escrow.yml mode=precheck: Validate step output feeds a passing precheck (no new escrow, OLD != NEW not required)', async () => {
    const wf = load('rotate-escrow.yml');
    const validate = stepOf(wf, 'rotate', 'Validate inputs');
    const ctx = mkCtx({ mode: 'precheck', dry_run: true, old_escrow_address: '', archive_id: '', confirm: '', confirm_archive_active_trades: '' }, { ARAF_ESCROW_ADDRESS: OLD, ARAF_DEPLOYMENT_BLOCK: '10' });
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'wf-'));
    const ghEnv = path.join(dir, 'env');
    const v = await bash(validate.run, { PATH: process.env.PATH, ...resolveEnv(validate.env, ctx), GITHUB_ENV: ghEnv });
    expect(v.status, v.out).to.equal(0);
    const fromValidate = parseEnvFile(ghEnv);
    expect(fromValidate).to.have.property('OLD_ESCROW_ADDRESS', OLD);
    expect(fromValidate).to.not.have.property('ARAF_ESCROW_ADDRESS');
    const step = stepOf(wf, 'rotate', 'Precheck (read-only)');
    const env = { ...fromValidate, ...resolveEnv(step.env, ctx) };
    const r = await coreFromStep(step, env, F.world());
    expect(r.code, r.out).to.equal(0);
  });
});

describe('workflow -> wrapper -> core (restore)', function () {
  this.timeout(60000);

  function setup({ nullBlock = false } = {}) {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'wfr-'));
    const state = path.join(dir, 'machines');
    fs.writeFileSync(state, 'started');
    fs.writeFileSync(path.join(dir, 'flyctl'), `#!/usr/bin/env bash
echo "$*" >> "${dir}/fly.log"
if [ "$1 $2" = "machine list" ]; then echo "[{\\"id\\":\\"m1\\",\\"state\\":\\"$(cat "${state}")\\"}]"
elif [ "$1 $2" = "machine stop" ]; then echo stopped > "${state}"
elif [ "$1 $2" = "machine start" ]; then echo started > "${state}"
elif [ "$1 $2" = "secrets import" ]; then cat > "${dir}/secrets.in"
fi
exit 0
`, { mode: 0o755 });
    fs.writeFileSync(path.join(dir, 'gh'), `#!/usr/bin/env bash
echo "$*" >> "${dir}/gh.log"
exit 0
`, { mode: 0o755 });
    // Gerçek çekirdek + sahte dünya: önce rotasyon uygulanır, sonra wrapper'ın verdiği argv/env ile restore.
    fs.writeFileSync(path.join(dir, 'harness.js'), `
const F = require(${JSON.stringify(HELPER)});
const core = require(${JSON.stringify(CORE)});
(async () => {
  const w = F.world();
  const q = () => {};
  const rc0 = await core.run({ argv: ['--rotate', '--apply'], env: F.ENV, deps: { ...w, chain: F.fakeChain() }, out: q, now: () => F.T0 });
  if (rc0 !== 0) process.exit(90);
  ${nullBlock ? 'w.mongo.st.registry[F.AID].old_deploy_block = null;' : ''}
  const before = w.mongo.st.writes.length;
  const rc = await core.run({ argv: process.argv.slice(2), env: process.env, deps: { mongo: w.mongo, redis: w.redis, chain: null }, out: console.log, now: () => F.T0 });
  console.log('HARNESS_WRITES_DURING_RESTORE=' + (w.mongo.st.writes.length - before));
  console.log('HARNESS_ACTIVE=' + w.mongo.st.registry.active.escrow_address + ':' + w.mongo.st.registry.active.state);
  process.exit(rc);
})();
`);
    return { dir };
  }

  async function dispatchRestore(s, archiveId, confirm) {
    const wf = load('rotate-escrow.yml');
    const ctx = mkCtx({ mode: 'restore', dry_run: false, old_escrow_address: '', archive_id: archiveId, confirm, confirm_archive_active_trades: '' }, { ARAF_ESCROW_ADDRESS: NEW, ARAF_DEPLOYMENT_BLOCK: '200' });
    const ghEnv = path.join(s.dir, 'ghenv');
    const base = { PATH: `${s.dir}:${process.env.PATH}`, GITHUB_ENV: ghEnv, GITHUB_REPOSITORY: 'o/r' };
    const validate = stepOf(wf, 'rotate', 'Validate inputs');
    const v = await bash(validate.run, { ...base, ...resolveEnv(validate.env, ctx) });
    if (v.status !== 0) return { validate: v };
    const restoreStep = stepOf(wf, 'rotate', 'Restore archive');
    const stepEnv = {
      ...base, ...parseEnvFile(ghEnv), ...resolveEnv(restoreStep.env, ctx),
      FLY_APP_NAME: 'app', ROTATE_ESCROW_JS: path.join(s.dir, 'harness.js'), WAIT_INTERVAL_S: '0', WAIT_TIMEOUT_S: '1',
    };
    const r = await bash(restoreStep.run, stepEnv);
    const persist = stepOf(wf, 'rotate', 'Persist restored escrow variables');
    let p = null;
    if (r.status === 0) p = await bash(persist.run, { ...base, ...parseEnvFile(ghEnv), ...resolveEnv(persist.env, ctx) });
    return { validate: v, restore: r, persist: p, ghEnv: parseEnvFile(ghEnv) };
  }
  const read = (s, f) => (fs.existsSync(path.join(s.dir, f)) ? fs.readFileSync(path.join(s.dir, f), 'utf8') : '');

  it('(c)(d) archive_id with ":" passes yml validation -> wrapper -> core; core prints targets; wrapper writes ONLY them to Fly; repo variables follow', async () => {
    const s = setup();
    const r = await dispatchRestore(s, AID, `RESTORE ${OLD}`);
    expect(r.validate.status, r.validate.out).to.equal(0);
    expect(r.restore.status, r.restore.out).to.equal(0);
    expect(r.restore.out).to.include(`RESTORE_TARGET_ESCROW=${OLD}`);
    expect(r.restore.out).to.include('RESTORE_TARGET_DEPLOY_BLOCK=10');
    expect(r.restore.out).to.include('HARNESS_ACTIVE=' + OLD + ':ACTIVE');
    expect(read(s, 'secrets.in')).to.equal(`ARAF_ESCROW_ADDRESS=${OLD}\nARAF_DEPLOYMENT_BLOCK=10\n`);
    expect(r.persist.status, r.persist.out).to.equal(0);
    const gh = read(s, 'gh.log');
    expect(gh).to.include(`variable set ARAF_ESCROW_ADDRESS --body ${OLD}`);
    expect(gh).to.include('variable set ARAF_DEPLOYMENT_BLOCK --body 10');
    for (const x of ['Sup3rSecretPw', 'RedisSecretPw', 'KEY_SECRET_123', 'tok_secret_1']) expect(r.restore.out).to.not.include(x);
  });

  it('yml validation: confirm must name the archive_id address; malformed archive ids are rejected before anything runs', async () => {
    const s = setup();
    const other = `0x${'ee'.repeat(20)}`;
    expect((await dispatchRestore(s, AID, `RESTORE ${other}`)).validate.status).to.not.equal(0);
    expect((await dispatchRestore(s, `84532-${OLD}`, `RESTORE ${OLD}`)).validate.status).to.not.equal(0);
    expect((await dispatchRestore(s, `archive_x-1`, `RESTORE ${OLD}`)).validate.status).to.not.equal(0);
    expect((await dispatchRestore(s, `84532:${NEW}`, `RESTORE ${NEW}`)).validate.status, 'target == current escrow').to.not.equal(0);
    expect(read(s, 'fly.log')).to.equal('');
  });

  it('(e) manifest old_deploy_block null: restore stops with NO write, Fly untouched, machines restarted', async () => {
    const s = setup({ nullBlock: true });
    const r = await dispatchRestore(s, AID, `RESTORE ${OLD}`);
    expect(r.restore.status).to.not.equal(0);
    expect(r.restore.out).to.include('old_deploy_block');
    expect(r.restore.out).to.include('HARNESS_WRITES_DURING_RESTORE=0');
    expect(r.restore.out).to.include('HARNESS_ACTIVE=' + NEW + ':ACTIVE');
    expect(read(s, 'secrets.in')).to.equal('');
    expect(read(s, 'fly.log')).to.match(/machine start m1/);
    expect(r.persist).to.equal(null);
  });
});
