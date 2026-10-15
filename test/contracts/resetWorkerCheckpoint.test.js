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
const deleter = require('../../.github/scripts/delete-worker-checkpoint.js');
const PASS = 'sup3rSecretPass';

// onDel(n): n. DEL çağrısında (1 tabanlı) yan etki (ör. proxy makineyi başlatır) — yanıttan ÖNCE çalışır.
function fakeRedis(onDel = () => {}) {
  const cmds = [];
  let dels = 0;
  const server = net.createServer((s) => {
    s.on('data', (d) => {
      for (const m of d.toString().matchAll(/\*\d+\r\n((?:\$\d+\r\n.*\r\n)+)/g)) {
        const args = m[1].split('\r\n').filter((l, i) => i % 2 === 1);
        cmds.push(args);
        if (args[0] === 'DEL') { dels += 1; onDel(dels); }
        s.write(args[0] === 'DEL' ? `:${args.length - 1}\r\n` : '+OK\r\n');
      }
    });
  });
  return new Promise((r) => server.listen(0, '127.0.0.1', () => r({ server, cmds, port: server.address().port })));
}

// Makine başına durum dosyası; "list" çağrı sayacı. autostartOnList: o list çağrısında m1 started olur.
function setup({ failStopId, states = { m1: 'started', m2: 'started' }, autostartOnList, listFail } = {}) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'rwc-'));
  const log = path.join(dir, 'calls.log');
  for (const [id, st] of Object.entries(states)) fs.writeFileSync(path.join(dir, `s_${id}`), st);
  fs.writeFileSync(path.join(dir, 'listcount'), '0');
  const ids = Object.keys(states);
  fs.writeFileSync(path.join(dir, 'flyctl'), `#!/usr/bin/env bash
echo "$*" >> "${log}"
D="${dir}"
if [ "$1 $2" = "machine list" ]; then
  n=$(( $(cat "$D/listcount") + 1 )); echo $n > "$D/listcount"
  ${autostartOnList ? `[ "$n" = "${autostartOnList}" ] && echo started > "$D/s_m1"` : ':'}
  ${listFail ? `if [ "$n" = "${listFail.on || 0}" ] || [ "$n" -ge "${listFail.from || 999999}" ]; then ${listFail.mode === 'empty' ? 'exit 0' : 'exit 1'}; fi` : ':'}
  out=""
  ${ids.map((id) => `out="$out{\\"id\\":\\"${id}\\",\\"state\\":\\"$(cat "$D/s_${id}")\\"},"`).join('\n  ')}
  echo "[\${out%,}]"
elif [ "$1 $2" = "machine stop" ]; then
  ${failStopId ? `[ "$3" = "${failStopId}" ] && exit 1` : ':'}
  echo stopped > "$D/s_$3"
elif [ "$1 $2" = "machine start" ]; then echo started > "$D/s_$3"; fi
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
  this.timeout(30000);
  let redis;
  const startRedis = async (onDel) => { redis = await fakeRedis(onDel); };
  beforeEach(async () => { await startRedis(); });
  afterEach(() => redis.server.close());
  const envFor = (dir, extra = {}) => ({
    PATH: `${dir}:${process.env.PATH}`, FLY_APP_NAME: 'app', FLY_API_TOKEN: 'tok_secret_1',
    REDIS_URL: `redis://default:${PASS}@127.0.0.1:${redis.port}`, ALLOW_PLAIN_REDIS_FOR_TEST: '1',
    DEPLOY_BLOCK: '48101694', WAIT_INTERVAL_S: '0', WAIT_TIMEOUT_S: '1', ...extra,
  });
  const dels = () => redis.cmds.filter((c) => c[0] === 'DEL');

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
    expect(redis.cmds.filter((c) => c[0] !== 'AUTH')).to.deep.equal([['DEL', 'worker:last_block', 'worker:last_safe_block']]);
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

  it('machine auto-started just BEFORE the delete: loop repeats, no delete until all stopped', async function () {
    // list çağrıları: 1 ilk, 2 stop_running, 3 wait, 4 DEL-öncesi doğrulama
    const { dir } = setup({ autostartOnList: 4 });
    const r = await run(envFor(dir));
    expect(r.status).to.equal(0, r.out);
    expect(dels()).to.have.length(1);
    expect(r.out).to.include('Attempt 1/3');
  });

  it('machine auto-started just AFTER the delete: loop repeats and deletes again', async function () {
    await new Promise((res) => redis.server.close(res));
    let dirRef;
    await startRedis((n) => { if (n === 1) fs.writeFileSync(path.join(dirRef, 's_m1'), 'started'); });
    const { dir } = setup();
    dirRef = dir;
    const r = await run(envFor(dir));
    expect(r.status).to.equal(0, r.out);
    expect(dels()).to.have.length(2);
  });

  it('fails after 3 attempts when a machine keeps starting; still restarts machines', async function () {
    await new Promise((res) => redis.server.close(res));
    let dirRef;
    await startRedis(() => fs.writeFileSync(path.join(dirRef, 's_m1'), 'started'));
    const { dir, log } = setup();
    dirRef = dir;
    const r = await run(envFor(dir));
    expect(r.status).to.not.equal(0);
    expect(dels()).to.have.length(3);
    expect(r.out).to.match(/after 3 attempts/);
    expect(fs.readFileSync(log, 'utf8')).to.match(/machine start m1/);
  });

  for (const mode of ['exit', 'empty']) {
    it(`list failure (${mode}) at the pre-DEL verification: no DEL that attempt, loop repeats`, async function () {
      const { dir } = setup({ listFail: { on: 4, mode } });
      const r = await run(envFor(dir));
      expect(r.status).to.equal(0, r.out);
      expect(dels()).to.have.length(1);
      expect(r.out).to.include('Attempt 1/3');
    });

    it(`persistent list failure (${mode}): never deletes, dies, still restarts machines`, async function () {
      const { dir, log } = setup({ listFail: { from: 2, mode } });
      const r = await run(envFor(dir));
      expect(r.status).to.not.equal(0);
      expect(dels()).to.have.length(0);
      expect(r.out).to.match(/after 3 attempts/);
      expect(fs.readFileSync(log, 'utf8')).to.match(/machine start m1/);
    });

    it(`list failure (${mode}) right AFTER the delete counts as unverified and retries`, async function () {
      // list çağrıları: 1 ilk, 2 stop, 3 wait, 4 DEL-öncesi, 5 DEL-sonrası
      const { dir } = setup({ listFail: { on: 5, mode } });
      const r = await run(envFor(dir));
      expect(r.status).to.equal(0, r.out);
      expect(dels()).to.have.length(2);
    });
  }

  it('dies when the first listing has zero machines', async function () {
    const { dir, log } = setup({ states: {} });
    const r = await run(envFor(dir));
    expect(r.status).to.not.equal(0);
    expect(redis.cmds).to.have.length(0);
    expect(fs.readFileSync(log, 'utf8')).to.not.match(/machine (stop|start)/);
  });

  it('does not start machines that were already stopped at the beginning', async function () {
    const { dir, log } = setup({ states: { m1: 'started', m2: 'stopped' } });
    const r = await run(envFor(dir));
    expect(r.status).to.equal(0, r.out);
    const calls = fs.readFileSync(log, 'utf8');
    expect(calls).to.match(/machine start m1/);
    expect(calls).to.not.match(/machine start m2/);
    expect(calls).to.not.match(/machine stop m2/);
  });
});

describe('delete-worker-checkpoint.js reply parsing', function () {
  it('waits for complete \\r\\n-terminated lines (chunked replies)', async function () {
    const server = net.createServer((s) => {
      s.once('data', () => {
        s.write('+OK\r\n:');
        setTimeout(() => s.write('2'), 30);
        setTimeout(() => s.write('\r\n'), 60);
      });
    });
    await new Promise((r) => server.listen(0, '127.0.0.1', r));
    try {
      const n = await deleter.run({
        REDIS_URL: `redis://default:x@127.0.0.1:${server.address().port}`, ALLOW_PLAIN_REDIS_FOR_TEST: '1',
      });
      expect(n).to.equal(2);
    } finally { server.close(); }
  });
});

describe('deploy-base-sepolia.yml checkpoint reset step', function () {
  it('runs after Fly deploy and before health; absent from runtime workflow', function () {
    const wf = yaml.load(fs.readFileSync(path.join(ROOT, '.github/workflows/deploy-base-sepolia.yml'), 'utf8'));
    const names = wf.jobs.deploy.steps.map((s) => s.name);
    const a = names.indexOf('Deploy backend to Fly');
    const b = names.indexOf('Reset worker checkpoint for new deployment');
    const r = names.indexOf('Write active escrow registry');
    const c = names.indexOf('Check backend health');
    expect(a).to.be.greaterThan(-1);
    expect(b).to.equal(a + 1);
    // Arşiv Faz 1: registry yazımı checkpoint sıfırlamadan hemen sonra, health'ten önce.
    expect(r).to.equal(b + 1);
    expect(c).to.equal(r + 1);
    expect(fs.readFileSync(path.join(ROOT, '.github/workflows/deploy-runtime-base-sepolia.yml'), 'utf8')).to.not.include('reset-worker-checkpoint');
  });
});
