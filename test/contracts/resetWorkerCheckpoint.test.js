// [TR] reset-worker-checkpoint.sh: sahte flyctl (PATH) + sahte Redis (yerel TCP, RESP). Ağ yok, sahte değerler.
// [EN] Fake flyctl on PATH + fake local Redis. No network, dummy values only.
const { expect } = require('chai');
const { spawn } = require('child_process');
const fs = require('fs');
const net = require('net');
const os = require('os');
const path = require('path');
const yaml = require('js-yaml');

const ROOT = path.resolve(__dirname, '../..');
const SCRIPT = path.join(ROOT, '.github/scripts/reset-worker-checkpoint.sh');
const PASS = 'sup3rSecretPass';

function fakeRedis() {
  const cmds = [];
  const server = net.createServer((s) => {
    s.on('data', (d) => {
      const t = d.toString();
      for (const m of t.matchAll(/\*\d+\r\n((?:\$\d+\r\n.*\r\n)+)/g)) {
        const args = m[1].split('\r\n').filter((l, i) => i % 2 === 1);
        cmds.push(args);
        s.write(args[0] === 'DEL' ? `:${args.length - 1}\r\n` : '+OK\r\n');
      }
    });
  });
  return new Promise((r) => server.listen(0, '127.0.0.1', () => r({ server, cmds, port: server.address().port })));
}

function setup({ failStopId } = {}) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'rwc-'));
  const log = path.join(dir, 'calls.log');
  const state = path.join(dir, 'state');
  fs.writeFileSync(state, 'started');
  fs.writeFileSync(path.join(dir, 'flyctl'), `#!/usr/bin/env bash
echo "$*" >> "${log}"
if [ "$1 $2" = "machine list" ]; then
  s=$(cat "${state}"); echo "[{\\"id\\":\\"m1\\",\\"state\\":\\"$s\\"},{\\"id\\":\\"m2\\",\\"state\\":\\"$s\\"}]"
elif [ "$1 $2" = "machine stop" ]; then
  ${failStopId ? `[ "$3" = "${failStopId}" ] && exit 1` : ':'}
  echo stopped > "${state}"
elif [ "$1 $2" = "machine start" ]; then echo started > "${state}"; fi
exit 0
`, { mode: 0o755 });
  return { dir, log };
}

function run(env) {
  return new Promise((resolve) => {
    const p = spawn('bash', [SCRIPT], { env: { PATH: process.env.PATH, ...env } });
    let out = ''; p.stdout.on('data', (d) => { out += d; }); p.stderr.on('data', (d) => { out += d; });
    p.on('close', (status) => resolve({ status, out }));
  });
}

describe('reset-worker-checkpoint.sh', function () {
  let redis;
  beforeEach(async () => { redis = await fakeRedis(); });
  afterEach(() => redis.server.close());
  const envFor = (dir, extra = {}) => ({
    PATH: `${dir}:${process.env.PATH}`, FLY_APP_NAME: 'app', FLY_API_TOKEN: 'tok_secret_1',
    REDIS_URL: `redis://default:${PASS}@127.0.0.1:${redis.port}`, ALLOW_PLAIN_REDIS_FOR_TEST: '1',
    DEPLOY_BLOCK: '48101694', WAIT_INTERVAL_S: '0', WAIT_TIMEOUT_S: '2', ...extra,
  });

  it('fails without DEPLOY_BLOCK (or invalid) and touches nothing', async function () {
    for (const bad of ['', '0', 'abc', '12x']) {
      const { dir, log } = setup();
      const r = await run(envFor(dir, { DEPLOY_BLOCK: bad }));
      expect(r.status).to.not.equal(0);
      expect(fs.existsSync(log)).to.equal(false);
      expect(redis.cmds).to.have.length(0);
    }
  });

  it('stops all, deletes only the two keys, restarts, never prints secrets', async function () {
    const { dir, log } = setup();
    const r = await run(envFor(dir));
    expect(r.status).to.equal(0, r.out);
    const calls = fs.readFileSync(log, 'utf8').split('\n').filter(Boolean);
    const first = (s) => calls.findIndex((c) => c.startsWith(s));
    const last = (s) => calls.map((c, i) => (c.startsWith(s) ? i : -1)).filter((i) => i >= 0).pop();
    expect(calls.filter((c) => c.startsWith('machine stop'))).to.have.length(2);
    expect(calls.filter((c) => c.startsWith('machine start'))).to.have.length(2);
    expect(last('machine stop')).to.be.lessThan(first('machine start'));
    const del = redis.cmds.filter((c) => c[0] !== 'AUTH');
    expect(del).to.deep.equal([['DEL', 'worker:last_block', 'worker:last_safe_block']]);
    expect(r.out).to.match(/keys deleted: 2/);
    for (const s of [PASS, 'tok_secret_1', `127.0.0.1:${redis.port}`]) expect(r.out).to.not.include(s);
  });

  it('still tries to start machines when a stop fails, and does not delete', async function () {
    const { dir, log } = setup({ failStopId: 'm2' });
    const r = await run(envFor(dir));
    expect(r.status).to.not.equal(0);
    expect(redis.cmds).to.have.length(0);
    expect(fs.readFileSync(log, 'utf8')).to.match(/machine start m1/);
  });

  it('rejects non-TLS REDIS_URL without the test flag', async function () {
    const { dir } = setup();
    const r = await run(envFor(dir, { ALLOW_PLAIN_REDIS_FOR_TEST: '' }));
    expect(r.status).to.not.equal(0);
  });
});

describe('deploy-base-sepolia.yml checkpoint reset step', function () {
  it('runs after Fly deploy and before health; absent from runtime workflow', function () {
    const wf = yaml.load(fs.readFileSync(path.join(ROOT, '.github/workflows/deploy-base-sepolia.yml'), 'utf8'));
    const names = wf.jobs.deploy.steps.map((s) => s.name);
    const a = names.indexOf('Deploy backend to Fly');
    const b = names.indexOf('Reset worker checkpoint for new deployment');
    const c = names.indexOf('Check backend health');
    expect(a).to.be.greaterThan(-1);
    expect(b).to.equal(a + 1);
    expect(c).to.equal(b + 1);
    expect(fs.readFileSync(path.join(ROOT, '.github/workflows/deploy-runtime-base-sepolia.yml'), 'utf8')).to.not.include('reset-worker-checkpoint');
  });
});
