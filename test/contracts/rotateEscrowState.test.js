// [TR] rotate-escrow-state.sh: sahte flyctl (PATH) + sahte çekirdek betik (ROTATE_ESCROW_JS). Ağ yok, sahte değerler.
// [EN] Fake flyctl on PATH + fake core script. No network, dummy values only.
const { expect } = require('chai');
const { spawn } = require('child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');
const yaml = require('js-yaml');

const ROOT = path.resolve(__dirname, '../..');
const SCRIPT = path.join(ROOT, '.github/scripts/rotate-escrow-state.sh');
const OLD = '0x' + 'ab'.repeat(20);
const NEW = '0x' + 'cd'.repeat(20);
const URI = 'mongodb+srv://dbuser:Sup3rSecretPw@cluster0.example.mongodb.net/araf';

// opts: states, secretsStarts (secrets import tüm makineleri başlatır), coreStartsM1 (çekirdek m1'i başlatır, ilk n çağrıda)
function setup({ states = { m1: 'started', m2: 'started' }, secretsStarts = false, coreFail = false, coreStartsM1Calls = 0, listFailFrom, restoreLines = null } = {}) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'res-'));
  const log = path.join(dir, 'calls.log');
  const coreLog = path.join(dir, 'core.log');
  for (const [id, st] of Object.entries(states)) fs.writeFileSync(path.join(dir, `s_${id}`), st);
  fs.writeFileSync(path.join(dir, 'corecount'), '0');
  fs.writeFileSync(path.join(dir, 'listcount'), '0');
  const ids = Object.keys(states);
  fs.writeFileSync(path.join(dir, 'flyctl'), `#!/usr/bin/env bash
echo "$*" >> "${log}"
D="${dir}"
if [ "$1 $2" = "machine list" ]; then
  n=$(( $(cat "$D/listcount") + 1 )); echo $n > "$D/listcount"
  ${listFailFrom ? `[ "$n" -ge "${listFailFrom}" ] && exit 1` : ':'}
  out=""
  ${ids.map((id) => `out="$out{\\"id\\":\\"${id}\\",\\"state\\":\\"$(cat "$D/s_${id}")\\"},"`).join('\n  ')}
  echo "[\${out%,}]"
elif [ "$1 $2" = "machine stop" ]; then echo stopped > "$D/s_$3"
elif [ "$1 $2" = "machine start" ]; then echo started > "$D/s_$3"
elif [ "$1 $2" = "secrets import" ]; then
  cat > "$D/secrets.in"
  ${secretsStarts ? ids.map((id) => `echo started > "$D/s_${id}"`).join('; ') : ':'}
fi
exit 0
`, { mode: 0o755 });
  const core = path.join(dir, 'core.js');
  fs.writeFileSync(core, `
const fs = require('fs');
const D = ${JSON.stringify(dir)};
const n = Number(fs.readFileSync(D + '/corecount', 'utf8')) + 1;
fs.writeFileSync(D + '/corecount', String(n));
const states = ${JSON.stringify(ids)}.map((id) => id + '=' + fs.readFileSync(D + '/s_' + id, 'utf8').trim()).join(',');
fs.appendFileSync(${JSON.stringify(coreLog)}, JSON.stringify({ args: process.argv.slice(2), states, hasMongo: !!process.env.MONGODB_URI, hasMaster: !!process.env.MASTER_ENCRYPTION_KEY, hasJwt: !!process.env.JWT_SECRET, old: process.env.OLD_ESCROW_ADDRESS, esc: process.env.ARAF_ESCROW_ADDRESS }) + '\\n');
${coreStartsM1Calls ? `if (n <= ${coreStartsM1Calls}) fs.writeFileSync(D + '/s_m1', 'started');` : ''}
${restoreLines ? `if (process.argv.includes('--restore') && process.argv.includes('--apply')) { console.log(${JSON.stringify(restoreLines)}); }` : ''}
${coreFail ? 'process.exit(3);' : ''}
`);
  return { dir, log, coreLog, core };
}

function run(args, env) {
  return new Promise((resolve) => {
    const p = spawn('bash', [SCRIPT, ...args], { env: { PATH: process.env.PATH, ...env } });
    let out = ''; p.stdout.on('data', (d) => { out += d; }); p.stderr.on('data', (d) => { out += d; });
    p.on('close', (status) => resolve({ status, out }));
  });
}

const envFor = (s, extra = {}) => ({
  PATH: `${s.dir}:${process.env.PATH}`, FLY_APP_NAME: 'app', FLY_API_TOKEN: 'tok_secret_1', MONGODB_URI: URI,
  REDIS_URL: 'redis://default:pw@127.0.0.1:6379', ALLOW_PLAIN_REDIS_FOR_TEST: '1',
  OLD_ESCROW_ADDRESS: OLD, ARAF_ESCROW_ADDRESS: NEW, ARAF_DEPLOYMENT_BLOCK: '48101694', EXPECTED_CHAIN_ID: '84532',
  ROTATE_ESCROW_JS: s.core, WAIT_INTERVAL_S: '0', WAIT_TIMEOUT_S: '1', ...extra,
});
const coreCalls = (s) => (fs.existsSync(s.coreLog) ? fs.readFileSync(s.coreLog, 'utf8').split('\n').filter(Boolean).map((l) => JSON.parse(l)) : []);
const flyCalls = (s) => (fs.existsSync(s.log) ? fs.readFileSync(s.log, 'utf8').split('\n').filter(Boolean) : []);

describe('rotate-escrow-state.sh', function () {
  this.timeout(30000);

  it('default is dry-run: core without --apply, flyctl never called', async function () {
    const s = setup();
    const r = await run(['rotate'], envFor(s));
    expect(r.status).to.equal(0, r.out);
    expect(coreCalls(s).map((c) => c.args)).to.deep.equal([['--rotate']]);
    expect(flyCalls(s)).to.have.length(0);
  });

  it('rotate --apply: machines are stopped when the core runs, restarted after, no secrets printed', async function () {
    const s = setup();
    const r = await run(['rotate', '--apply'], envFor(s));
    expect(r.status).to.equal(0, r.out);
    const c = coreCalls(s);
    expect(c).to.have.length(1);
    expect(c[0].args).to.deep.equal(['--rotate', '--apply']);
    expect(c[0].states).to.equal('m1=stopped,m2=stopped');
    expect(c[0].old).to.equal(OLD);
    expect(c[0].esc).to.equal(NEW);
    expect(c[0].hasMaster || c[0].hasJwt).to.equal(false);
    const calls = flyCalls(s);
    expect(calls.filter((x) => x.startsWith('machine start'))).to.have.length(2);
    expect(calls.some((x) => x.startsWith('secrets'))).to.equal(false);
    for (const x of ['Sup3rSecretPw', 'tok_secret_1', 'cluster0']) expect(r.out).to.not.include(x);
  });

  it('core failure: dies non-zero, still restarts initially-started machines, mentions resume', async function () {
    const s = setup({ coreFail: true, states: { m1: 'started', m2: 'stopped' } });
    const r = await run(['rotate', '--apply'], envFor(s));
    expect(r.status).to.not.equal(0);
    expect(r.out).to.match(/resum/i);
    const calls = flyCalls(s).join('\n');
    expect(calls).to.match(/machine start m1/);
    expect(calls).to.not.match(/machine start m2/);
  });

  it('machine auto-started during the core run: loop repeats (core idempotent), second run verified', async function () {
    const s = setup({ coreStartsM1Calls: 1 });
    const r = await run(['rotate', '--apply'], envFor(s));
    expect(r.status).to.equal(0, r.out);
    expect(coreCalls(s)).to.have.length(2);
    expect(r.out).to.include('Attempt 1/3');
  });

  it('machine keeps starting: fails after 3 attempts, still restarts', async function () {
    const s = setup({ coreStartsM1Calls: 99 });
    const r = await run(['rotate', '--apply'], envFor(s));
    expect(r.status).to.not.equal(0);
    expect(coreCalls(s)).to.have.length(3);
    expect(r.out).to.match(/after 3 attempts/);
    expect(flyCalls(s).join('\n')).to.match(/machine start m1/);
  });

  it('fail-closed listing: persistent list failure never runs the core', async function () {
    const s = setup({ listFailFrom: 2 });
    const r = await run(['rotate', '--apply'], envFor(s));
    expect(r.status).to.not.equal(0);
    expect(coreCalls(s)).to.have.length(0);
    expect(flyCalls(s).join('\n')).to.match(/machine start m1/);
  });

  it('zero machines at the start: dies, nothing stopped or started, core not run', async function () {
    const s = setup({ states: {} });
    const r = await run(['rotate', '--apply'], envFor(s));
    expect(r.status).to.not.equal(0);
    expect(coreCalls(s)).to.have.length(0);
    expect(flyCalls(s).join('\n')).to.not.match(/machine (stop|start)/);
  });

  const AID = `84532:${OLD}`;
  const LINES = `RESTORE_TARGET_ESCROW=${OLD}\nRESTORE_TARGET_DEPLOY_BLOCK=1234`;

  it('restore --apply: passes archive id, writes ONLY the core-reported target values to Fly while stopped, then restarts', async function () {
    const s = setup({ secretsStarts: true, restoreLines: LINES });
    const ghEnv = path.join(s.dir, 'ghenv');
    // ARAF_ESCROW_ADDRESS = şu anki escrow (NEW); OLD_ESCROW_ADDRESS ve ARAF_DEPLOYMENT_BLOCK restore'da gerekmez.
    const env = envFor(s, { ARAF_ESCROW_ADDRESS: NEW, GITHUB_ENV: ghEnv });
    delete env.OLD_ESCROW_ADDRESS; delete env.ARAF_DEPLOYMENT_BLOCK;
    const r = await run(['restore', AID, '--apply'], env);
    expect(r.status).to.equal(0, r.out);
    expect(coreCalls(s)[0].args).to.deep.equal(['--restore', AID, '--apply']);
    expect(fs.readFileSync(path.join(s.dir, 'secrets.in'), 'utf8')).to.equal(`ARAF_ESCROW_ADDRESS=${OLD}\nARAF_DEPLOYMENT_BLOCK=1234\n`);
    expect(fs.readFileSync(ghEnv, 'utf8')).to.equal(`RESTORED_ESCROW_ADDRESS=${OLD}\nRESTORED_DEPLOYMENT_BLOCK=1234\n`);
    const calls = flyCalls(s);
    const secretsAt = calls.findIndex((x) => x.startsWith('secrets import'));
    const lastStop = calls.map((x, i) => (x.startsWith('machine stop') ? i : -1)).filter((i) => i >= 0).pop();
    const firstStart = calls.findIndex((x) => x.startsWith('machine start'));
    expect(secretsAt).to.be.greaterThan(-1);
    expect(lastStop).to.be.greaterThan(secretsAt);
    expect(firstStart).to.be.greaterThan(lastStop);
  });

  it('restore --apply: core does not report the target lines -> Fly untouched, non-zero, machines restarted', async function () {
    const s = setup();
    const env = envFor(s, { ARAF_ESCROW_ADDRESS: NEW }); delete env.OLD_ESCROW_ADDRESS; delete env.ARAF_DEPLOYMENT_BLOCK;
    const r = await run(['restore', AID, '--apply'], env);
    expect(r.status).to.not.equal(0);
    expect(flyCalls(s).join('\n')).to.not.match(/secrets/);
    expect(flyCalls(s).join('\n')).to.match(/machine start m1/);
  });

  it('restore --apply: malformed target lines are not trusted', async function () {
    const s = setup({ restoreLines: 'RESTORE_TARGET_ESCROW=0x12\nRESTORE_TARGET_DEPLOY_BLOCK=0' });
    const env = envFor(s, { ARAF_ESCROW_ADDRESS: NEW }); delete env.OLD_ESCROW_ADDRESS; delete env.ARAF_DEPLOYMENT_BLOCK;
    const r = await run(['restore', AID, '--apply'], env);
    expect(r.status).to.not.equal(0);
    expect(flyCalls(s).join('\n')).to.not.match(/secrets/);
  });

  it('restore dry-run touches no machine and no Fly secret', async function () {
    const s = setup();
    const r = await run(['restore', AID], envFor(s));
    expect(r.status).to.equal(0, r.out);
    expect(coreCalls(s)[0].args).to.deep.equal(['--restore', AID]);
    expect(flyCalls(s)).to.have.length(0);
  });

  it('input validation: bad mode, archive id, addresses, block, plain redis, app secrets in env', async function () {
    const bad = [
      [['bogus'], {}],
      [['restore'], {}],
      [['restore', 'x;rm -rf'], {}],
      [['restore', 'archive_x-1'], {}],
      [['restore', `84532-${OLD}`], {}],
      [['rotate', '--bogus'], {}],
      [['rotate'], { OLD_ESCROW_ADDRESS: '0x123' }],
      [['rotate'], { ARAF_ESCROW_ADDRESS: '' }],
      [['rotate'], { ARAF_DEPLOYMENT_BLOCK: '0' }],
      [['rotate'], { EXPECTED_CHAIN_ID: 'abc' }],
      [['rotate'], { ALLOW_PLAIN_REDIS_FOR_TEST: '' }],
      [['rotate'], { MASTER_ENCRYPTION_KEY: 'a'.repeat(64) }],
      [['rotate'], { JWT_SECRET: 'x'.repeat(64) }],
    ];
    for (const [args, over] of bad) {
      const s = setup();
      const r = await run([...args, '--apply'], envFor(s, over));
      expect(r.status, JSON.stringify([args, Object.keys(over)])).to.not.equal(0);
      expect(coreCalls(s)).to.have.length(0);
      expect(flyCalls(s)).to.have.length(0);
    }
  });
});

describe('deploy-base-sepolia.yml / rotate-escrow.yml rotation wiring', function () {
  const load = (f) => yaml.load(fs.readFileSync(path.join(ROOT, '.github/workflows', f), 'utf8'));

  it('deploy: precheck before contract deploy; rotation after Fly deploy and before health; first-install branch kept', function () {
    const wf = load('deploy-base-sepolia.yml');
    const steps = wf.jobs.deploy.steps;
    const names = steps.map((x) => x.name);
    const idx = (n) => names.indexOf(n);
    const validate = idx('Validate required config');
    const state = idx('Read escrow registry state');
    const pre = idx('Precheck escrow rotation (read-only)');
    const deploy = idx('Deploy contracts to Base Sepolia');
    const fly = idx('Deploy backend to Fly');
    const rot = idx('Rotate escrow state (archive + registry switch)');
    const reset = idx('Reset worker checkpoint for new deployment (first install)');
    const adopt = idx('Write active escrow registry (first install)');
    const health = idx('Check backend health');
    for (const n of [validate, state, pre, deploy, fly, rot, reset, adopt, health]) expect(n).to.be.greaterThan(-1);
    expect(validate).to.be.lessThan(state);
    expect(state).to.be.lessThan(pre);
    expect(pre).to.be.lessThan(deploy);
    expect(fly).to.be.lessThan(rot);
    expect(rot).to.be.lessThan(health);
    expect(rot).to.equal(fly + 1);
    expect(adopt).to.equal(reset + 1);
    expect(health).to.equal(adopt + 1);
    expect(wf.concurrency.group).to.equal('deploy-base-sepolia');
    expect(wf.concurrency['cancel-in-progress']).to.equal(false);
    expect(wf.on.workflow_dispatch.inputs).to.have.property('confirm_archive_active_trades');
    // Eski tek-adım yolu geri gelmesin: --force-switch kullanılmaz.
    expect(fs.readFileSync(path.join(ROOT, '.github/workflows/deploy-base-sepolia.yml'), 'utf8').replace(/#.*$/gm, '')).to.not.include('--force-switch');
    for (const s of [steps[pre], steps[rot]]) {
      expect(s.env).to.not.have.property('MASTER_ENCRYPTION_KEY');
      expect(s.env).to.not.have.property('JWT_SECRET');
    }
    expect(steps[pre].run).to.include('rotate-escrow.js --precheck');
    expect(steps[rot].run).to.include('rotate-escrow-state.sh rotate --apply');
    expect(steps[rot].if).to.include("ACTIVE");
    expect(steps[reset].if).to.include("none");
    expect(steps[adopt].if).to.include("none");
  });

  it('rotate-escrow.yml: manual, dry-run default, same concurrency group, restore confirmation, no app secrets', function () {
    const wf = load('rotate-escrow.yml');
    const inputs = wf.on.workflow_dispatch.inputs;
    expect(inputs.mode.options).to.deep.equal(['precheck', 'rotate', 'restore']);
    expect(inputs.dry_run.default).to.equal(true);
    expect(inputs).to.include.keys('archive_id', 'confirm', 'confirm_archive_active_trades');
    expect(wf.concurrency.group).to.equal('deploy-base-sepolia');
    expect(wf.concurrency['cancel-in-progress']).to.equal(false);
    const text = fs.readFileSync(path.join(ROOT, '.github/workflows/rotate-escrow.yml'), 'utf8');
    expect(text.replace(/#.*$/gm, '')).to.not.match(/MASTER_ENCRYPTION_KEY|JWT_SECRET/);
    expect(text).to.include('RESTORE ');
    expect(text).to.include('rotate-escrow-state.sh');
    expect(text).to.include('rotate-escrow.js --precheck');
  });
});
