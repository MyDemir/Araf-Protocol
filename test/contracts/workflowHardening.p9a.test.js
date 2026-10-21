// [TR] Dalga 3 P9a: delete-worker-checkpoint.js (K4-11) ve stage-runtime-env.sh (K4-14, K4-05) davranış testleri. Ağ yok, sahte değerler.
// [EN] Wave 3 P9a behavior tests: SELECT on db path, FRONTEND_DOMAIN regex, address distinctness, curl timeouts, no secret in argv.
const { expect } = require('chai');
const { spawnSync } = require('child_process');
const fs = require('fs');
const net = require('net');
const os = require('os');
const path = require('path');

const ROOT = path.resolve(__dirname, '../..');
const STAGE = path.join(ROOT, '.github/scripts/stage-runtime-env.sh');
const deleter = require('../../.github/scripts/delete-worker-checkpoint.js');

function fakeRedis() {
  const cmds = [];
  const server = net.createServer((s) => {
    s.on('data', (d) => {
      for (const m of d.toString().matchAll(/\*\d+\r\n((?:\$\d+\r\n.*\r\n)+)/g)) {
        const args = m[1].split('\r\n').filter((l, i) => i % 2 === 1);
        cmds.push(args);
        s.write(args[0] === 'DEL' ? `:${args.length - 1}\r\n` : '+OK\r\n');
      }
    });
  });
  return new Promise((r) => server.listen(0, '127.0.0.1', () => r({ server, cmds, port: server.address().port })));
}

describe('delete-worker-checkpoint.js: veritabani indeksi (K4-11)', function () {
  let redis;
  beforeEach(async () => { redis = await fakeRedis(); });
  afterEach(() => redis.server.close());
  const env = (p) => ({ REDIS_URL: `redis://default:pw@127.0.0.1:${redis.port}${p}`, ALLOW_PLAIN_REDIS_FOR_TEST: '1' });

  it('/1 yolu: AUTH, SELECT 1, DEL sirasiyla gonderilir', async function () {
    const n = await deleter.run(env('/1'));
    expect(n).to.equal(2);
    expect(redis.cmds.map((c) => c[0])).to.deep.equal(['AUTH', 'SELECT', 'DEL']);
    expect(redis.cmds[1]).to.deep.equal(['SELECT', '1']);
  });

  it('yol yok ya da /0: SELECT gonderilmez', async function () {
    for (const p of ['', '/', '/0']) {
      redis.cmds.length = 0;
      await deleter.run(env(p));
      expect(redis.cmds.map((c) => c[0]), p).to.deep.equal(['AUTH', 'DEL']);
    }
  });

  it('sayisal olmayan yol reddedilir, hicbir komut gitmez', async function () {
    let err;
    try { await deleter.run(env('/abc')); } catch (e) { err = e; }
    expect(err && err.message).to.match(/database/i);
    expect(redis.cmds).to.have.length(0);
  });
});

const A = (n) => '0x' + n.toString(16).padStart(40, 'a');
const BASE = {
  MONGODB_URI: 'mongodb+srv://dummy', REDIS_URL: 'rediss://dummy', JWT_SECRET: 'j'.repeat(64),
  MASTER_ENCRYPTION_KEY: 'a'.repeat(64), BASE_SEPOLIA_RPC_URL: 'https://rpc.invalid', BASE_SEPOLIA_WS_RPC_URL: 'wss://rpc.invalid',
  ESCROW: A(3), USDT: A(5), USDC: A(6), DEPLOY_BLOCK: '123', FRONTEND_DOMAIN: 'app.example.org',
};
const stage = (cmd, env) => spawnSync('bash', [STAGE, cmd], { env: { PATH: process.env.PATH, ...env }, encoding: 'utf8' });

describe('stage-runtime-env.sh: dogrulamalar (K4-14)', function () {
  it('gecerli FRONTEND_DOMAIN bicimleri kabul edilir', function () {
    for (const d of ['app.example.org', 'my-app.vercel.app', 'a.io:8443', 'localhost2']) {
      const r = stage('validate', { ...BASE, FRONTEND_DOMAIN: d });
      expect(r.status, `${d}: ${r.stderr}`).to.equal(0);
    }
  });

  it('bosluk, satir sonu, buyuk harf, https://, yol, bos etiket, localhost reddedilir', function () {
    for (const d of ['app example.org', 'app.example.org\nEVIL=1', 'App.Example.org', 'https://app.example.org', 'app.example.org/x',
      '-app.example.org', 'app.example.org-', 'app.example.org:', 'app.example.org:123456', 'localhost', 'localhost:3000']) {
      const r = stage('validate', { ...BASE, FRONTEND_DOMAIN: d });
      expect(r.status, JSON.stringify(d)).to.equal(1);
      expect(r.stderr, JSON.stringify(d)).to.match(/::error::.*FRONTEND_DOMAIN/);
    }
  });

  it('fly-secret-lines gecersiz FRONTEND_DOMAIN ile satir uretmez (enjeksiyon)', function () {
    const r = stage('fly-secret-lines', { ...BASE, FRONTEND_DOMAIN: 'a.example.org\nEVIL=1' });
    expect(r.status).to.equal(1);
    expect(r.stdout).to.not.include('EVIL=1');
  });

  it('ESCROW, USDT, USDC birbirinden farkli olmali (buyuk/kucuk harf duyarsiz)', function () {
    for (const [a, b] of [['ESCROW', 'USDT'], ['ESCROW', 'USDC'], ['USDT', 'USDC']]) {
      const r = stage('validate', { ...BASE, [b]: BASE[a].toUpperCase().replace('0X', '0x') });
      expect(r.status, `${a}=${b}`).to.equal(1);
      expect(r.stderr).to.match(/::error::.*(differ|distinct)/);
    }
  });

  it('health: curl cagrilarina --connect-timeout ve --max-time verilir', function () {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'p9a-curl-'));
    const log = path.join(dir, 'log');
    fs.writeFileSync(path.join(dir, 'curl'), `#!/usr/bin/env bash\necho "$*" >> "${log}"\nfor a in "$@"; do if [ "$prev" = "--output" ]; then : > "$a"; fi; prev="$a"; done\n[[ "$*" == *--write-out* ]] && printf 200\nexit 0\n`, { mode: 0o755 });
    const r = stage('health', { ...BASE, FLY_APP_NAME: 'app', HEALTH_INITIAL_SLEEP: '0', PATH: `${dir}:${process.env.PATH}` });
    expect(r.status, r.stderr).to.equal(0);
    const calls = fs.readFileSync(log, 'utf8').split('\n').filter(Boolean);
    expect(calls).to.have.length(2);
    for (const c of calls) expect(c).to.match(/--connect-timeout \d+/).and.to.match(/--max-time \d+/);
    fs.rmSync(dir, { recursive: true, force: true });
  });
});

describe('stage-runtime-env.sh: VERCEL_TOKEN argv disinda (K4-05)', function () {
  it('vercel pull/deploy argumanlarinda token yok; env ile ulasir', function () {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'p9a-vercel-'));
    const log = path.join(dir, 'log');
    fs.writeFileSync(path.join(dir, 'vercel'), `#!/usr/bin/env bash\necho "ARGS:$* TOKENENV:\${VERCEL_TOKEN:-}" >> "${log}"\n`, { mode: 0o755 });
    const r = stage('vercel-deploy', { ...BASE, VERCEL_TOKEN: 'tok_secret_vercel', PATH: `${dir}:${process.env.PATH}` });
    expect(r.status, r.stderr).to.equal(0);
    const calls = fs.readFileSync(log, 'utf8').split('\n').filter(Boolean);
    expect(calls).to.have.length(2);
    for (const c of calls) {
      expect(c.split(' TOKENENV:')[0]).to.not.match(/tok_secret_vercel|--token/);
      expect(c).to.include('TOKENENV:tok_secret_vercel');
    }
    expect(`${r.stdout}${r.stderr}`).to.not.include('tok_secret_vercel');
    fs.rmSync(dir, { recursive: true, force: true });
  });
});

describe('fly-machines-lib.sh: capture_started gecis durumlari (K4-13)', function () {
  const LIB = path.join(ROOT, '.github/scripts/fly-machines-lib.sh');
  function capture(states, extra = {}) {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'p9a-fly-'));
    const json = JSON.stringify(Object.entries(states).map(([id, state]) => ({ id, state })));
    fs.writeFileSync(path.join(dir, 'flyctl'), `#!/usr/bin/env bash\necho '${json}'\n`, { mode: 0o755 });
    const r = spawnSync('bash', ['-c', `source "${LIB}"; capture_started; echo "IDS=\${IDS[*]:-}"`], {
      env: { PATH: `${dir}:${process.env.PATH}`, FLY_APP_NAME: 'app', WAIT_TIMEOUT_S: '0', WAIT_INTERVAL_S: '0', ...extra }, encoding: 'utf8',
    });
    fs.rmSync(dir, { recursive: true, force: true });
    return r;
  }

  it('started, starting ve replacing yakalanir; stopped ve suspended yakalanmaz', function () {
    const r = capture({ a: 'started', b: 'starting', c: 'replacing', d: 'stopped', e: 'suspended' });
    expect(r.status, r.stderr).to.equal(0);
    expect(r.stdout.trim()).to.equal('IDS=a b c');
  });
});
